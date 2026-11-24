import { store } from '../../app/store';
import { slugId } from '../../core/defaults';
import { audio } from '../../audio/audioEngine';
import { db } from '../../storage/db';
import { assetUrl, resolveSceneArt, resolveSpriteArt } from '../../storage/assets';
import { h } from '../dom';
import { button, field, row, section, select, slider, textInput, textArea } from '../form';
import { confirmDialog, openModal, toast } from '../modal';
import { stage } from '../stage';
import { importCardFile } from './cardImport';
import { openSpriteEditor } from './spriteEditor';
import { openImageGen } from './imageGenPanel';
import { imageToBlob } from '../../core/imageGen';
import type { Character, ParticleMode, SceneSlot, SpriteSlot } from '../../types';
import { createElla } from '../../core/defaults';

let panelBody: HTMLElement | null = null;

export function openCharacterPanel(): void {
  const modal = openModal({
    title: '角色工坊',
    subtitle: '每个角色都有独立的设定、立绘、场景、对话与手账。',
    size: 'lg',
  });
  panelBody = modal.body;
  render(modal.body);
}

function rerender(): void {
  if (panelBody) render(panelBody);
}

function render(body: HTMLElement): void {
  body.replaceChildren();
  const character = store.character;

  // —— 角色切换栏 ——
  const chips = h('div', { class: 'char-chips' });
  for (const c of store.characters) {
    const chip = h(
      'button',
      {
        class: `char-chip${c.id === character.id ? ' active' : ''}`,
        type: 'button',
        onclick: () => {
          void store.selectCharacter(c.id).then(async () => {
            await stage.renderCharacter(store.character);
            rerender();
          });
        },
      },
      h('span', { class: 'char-chip-dot' }, c.name.slice(0, 1)),
      h('span', { class: 'char-chip-name' }, c.name),
    );
    chips.append(chip);
  }
  chips.append(
    h('button', { class: 'char-chip ghost', type: 'button', onclick: () => createCharacter() }, '＋ 新建'),
  );

  body.append(
    h(
      'div',
      { class: 'char-toolbar' },
      chips,
      row(button('导入酒馆角色卡', () => pickCard(), 'soft')),
    ),
    h('div', { class: 'divider' }),
    section('角色档案', '这些文字会作为 System Prompt 的核心，决定 Ta 是谁。'),
    field(
      '角色名',
      textInput({
        value: character.name,
        onInput: (v) => {
          store.updateCharacter((c) => {
            c.name = v;
          });
          const plate = document.getElementById('nameplate');
          if (plate) plate.textContent = v || '未命名';
        },
      }),
    ),
    field(
      '身份 / 称号',
      textInput({
        value: character.title ?? '',
        placeholder: '时空管家 / 星海邮差 / 你的青梅',
        onInput: (v) => {
          store.updateCharacter((c) => {
            c.title = v.trim();
          });
          const titleEl = document.getElementById('char-title');
          if (titleEl) titleEl.textContent = v.trim() ? `· ${v.trim()}` : '';
        },
      }),
      '显示在对话框左上角的铭牌上。',
    ),
    field(
      '角色设定 / 人设',
      textArea({
        value: character.persona,
        rows: 8,
        placeholder: '性格、说话方式、与玩家的关系、称呼……',
        onInput: (v) => {
          store.updateCharacter((c) => {
            c.persona = v;
          });
        },
      }),
      '建议写清「怎么说话」比「长什么样」更有用。',
    ),
    field(
      '开场白',
      textArea({
        value: character.greeting,
        rows: 4,
        onInput: (v) => {
          store.updateCharacter((c) => {
            c.greeting = v;
          });
        },
      }),
      '新对话的第一句。可以写一小段场景描写。',
    ),
    h('div', { class: 'divider' }),
    section('立绘库', '点缩略图即可切换。名字会被注入提示词，AI 通过 <sprite:名字> 切换，想加多少张都行。'),
  );

  body.append(renderSpriteGrid(character));

  body.append(h('div', { class: 'divider' }), section('场景库', '点缩略图即可切换。每个场景独立的背景图与氛围粒子，AI 通过 <scene:场景名> 切换。'));
  body.append(renderSceneGrid(character));

  body.append(
    h('div', { class: 'divider' }),
    section('角色管理'),
    row(
      button('重置开场（重新开始对话）', async () => {
        const ok = await confirmDialog('重新开始', '会清空当前角色的对话记录，但保留手账与立绘。确定吗？', '重新开始');
        if (!ok) return;
        store.updateCharacter((c) => {
          c.messages = [
            {
              id: `m-${Date.now()}`,
              role: 'assistant',
              content: c.greeting,
              createdAt: Date.now(),
              cues: { sprite: c.sprites[0]?.name, scene: c.scenes[0]?.name },
            },
          ];
          c.bondXp = Math.max(c.bondXp, 12);
        });
        await store.saveCharacterNow();
        await stage.renderCharacter(store.character);
        toast('已重新开始', 'info');
        window.dispatchEvent(new CustomEvent('starry:refresh-dialogue'));
      }, 'ghost'),
      button('删除这个角色', async () => {
        if (store.characters.length <= 1) {
          toast('至少要保留一个角色', 'error');
          return;
        }
        const ok = await confirmDialog('删除角色', `「${character.name}」的对话、手账、立绘都会一起删除，且不可恢复。`, '删除');
        if (!ok) return;
        await store.removeCharacter(character.id);
        await stage.renderCharacter(store.character);
        toast('角色已删除', 'info');
        rerender();
      }, 'danger'),
    ),
  );
}

function renderSpriteGrid(character: Character): HTMLElement {
  const grid = h('div', { class: 'asset-grid' });
  character.sprites.forEach((slot) => {
    const isActive = slot.id === character.currentSpriteId;
    const card = h('div', { class: `asset-card${isActive ? ' active' : ''}` });
    const thumb = h('div', { class: 'asset-thumb checker', title: '点一下切换到这个立绘' });
    void fillThumb(thumb, slot);
    const use = async (): Promise<void> => {
      store.updateCharacter((c) => {
        c.currentSpriteId = slot.id;
      });
      await stage.showSprite(slot);
      rerender();
    };
    thumb.addEventListener('click', () => void use());
    card.append(
      thumb,
      h(
        'div',
        { class: 'asset-info' },
        h('span', { class: 'asset-name' }, slot.name),
        h(
          'span',
          { class: 'asset-tag' },
          isActive ? '当前使用中' : `${slot.kind === 'video' ? '视频' : '静图'} · ${cutoutLabel(slot.cutout)} · ${displayLabel(slot.display)}`,
        ),
      ),
      h(
        'div',
        { class: 'asset-actions' },
        button('编辑', () => {
          openSpriteEditor(slot, async (updated) => {
            store.updateCharacter((c) => {
              const idx = c.sprites.findIndex((s) => s.id === slot.id);
              if (idx >= 0) c.sprites[idx] = updated;
              if (c.currentSpriteId === slot.id) c.currentSpriteId = updated.id;
            });
            if (character.currentSpriteId === slot.id) await stage.showSprite(updated);
            rerender();
          });
        }, 'ghost'),
        button('删除', async () => {
          const ok = await confirmDialog('删除立绘', `删除「${slot.name}」这张立绘？`, '删除');
          if (!ok) return;
          if (slot.assetId) await db.deleteAsset(slot.assetId);
          store.updateCharacter((c) => {
            c.sprites = c.sprites.filter((s) => s.id !== slot.id);
            if (c.currentSpriteId === slot.id) c.currentSpriteId = c.sprites[0]?.id;
          });
          stage.clearSprite();
          const next = store.character.sprites.find((s) => s.id === store.character.currentSpriteId);
          if (next) await stage.showSprite(next);
          rerender();
        }, 'ghost'),
      ),
    );
    grid.append(card);
  });
  grid.append(
    h(
      'button',
      {
        class: 'asset-add',
        type: 'button',
        onclick: () => {
          openSpriteEditor(undefined, async (slot) => {
            store.updateCharacter((c) => {
              c.sprites.push(slot);
              if (!c.currentSpriteId) c.currentSpriteId = slot.id;
            });
            if (store.character.currentSpriteId === slot.id) await stage.showSprite(slot);
            rerender();
          });
        },
      },
      h('span', { class: 'add-plus' }, '＋'),
      h('span', {}, '新设立绘'),
    ),
  );
  return grid;
}

async function fillThumb(thumb: HTMLElement, slot: SpriteSlot): Promise<void> {
  const art = await resolveSpriteArt(slot);
  thumb.append(h('img', { src: art.url, alt: slot.name, loading: 'lazy' }));
}

const PARTICLES: { value: ParticleMode; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'rain', label: '细雨' },
  { value: 'stardust', label: '暖光星尘' },
  { value: 'snow', label: '落雪' },
];

function renderSceneGrid(character: Character): HTMLElement {
  const grid = h('div', { class: 'asset-grid' });
  character.scenes.forEach((scene) => {
    const isActive = scene.id === character.currentSceneId;
    const card = h('div', { class: `asset-card scene${isActive ? ' active' : ''}` });
    const thumb = h('div', { class: 'asset-thumb scene-thumb', title: '点一下切换到这个场景' });
    void fillSceneThumb(thumb, scene);
    thumb.addEventListener('click', async () => {
      store.updateCharacter((c) => {
        c.currentSceneId = scene.id;
      });
      await stage.showScene(scene);
      rerender();
    });
    card.append(
      thumb,
      h(
        'div',
        { class: 'asset-info' },
        h('span', { class: 'asset-name' }, scene.name),
        h('span', { class: 'asset-tag' }, isActive ? '当前使用中' : `${PARTICLES.find((p) => p.value === scene.particles)?.label ?? '无'}`),
      ),
      h(
        'div',
        { class: 'asset-actions' },
        button('编辑', () => openSceneEditor(scene, () => rerender()), 'ghost'),
        button('删除', async () => {
          if (character.scenes.length <= 1) {
            toast('至少保留一个场景', 'error');
            return;
          }
          const ok = await confirmDialog('删除场景', `删除场景「${scene.name}」？`, '删除');
          if (!ok) return;
          if (scene.assetId) await db.deleteAsset(scene.assetId);
          store.updateCharacter((c) => {
            c.scenes = c.scenes.filter((s) => s.id !== scene.id);
            if (c.currentSceneId === scene.id) c.currentSceneId = c.scenes[0]?.id;
          });
          const next = store.character.scenes.find((s) => s.id === store.character.currentSceneId);
          if (next) await stage.showScene(next, false);
          rerender();
        }, 'ghost'),
      ),
    );
    grid.append(card);
  });
  grid.append(
    h(
      'button',
      {
        class: 'asset-add',
        type: 'button',
        onclick: () => openSceneEditor(undefined, () => rerender()),
      },
      h('span', { class: 'add-plus' }, '＋'),
      h('span', {}, '新设场景'),
    ),
  );
  return grid;
}

async function fillSceneThumb(thumb: HTMLElement, scene: SceneSlot): Promise<void> {
  if (scene.gradient && !scene.assetId && !scene.builtinPath) {
    thumb.style.background = scene.gradient;
    return;
  }
  const art = await resolveSceneArt(scene);
  thumb.append(h('img', { src: art.url, alt: scene.name, loading: 'lazy' }));
}

function openSceneEditor(scene: SceneSlot | undefined, onSaved: () => void): void {
  const draft: SceneSlot = scene
    ? { ...scene }
    : { id: slugId('scene'), name: '', particles: 'none', brightness: 1 };
  const modal = openModal({
    title: scene ? '编辑场景' : '新设场景',
    subtitle: '背景图建议 16:9。没有图时可以先用默认星海。',
    size: 'md',
  });
  const thumb = h('div', { class: 'scene-preview' });
  const paint = async (): Promise<void> => {
    const url = await assetUrl(draft.assetId);
    if (url) {
      thumb.style.backgroundImage = `url("${url}")`;
      thumb.style.background = `#0B1022 url("${url}") center/cover no-repeat`;
    } else if (draft.gradient) {
      thumb.style.backgroundImage = 'none';
      thumb.style.background = draft.gradient;
    } else {
      thumb.style.background = '#0B1022';
    }
  };
  void paint();

  const fileInput = h('input', { type: 'file', accept: 'image/*' }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void (async () => {
      const record = await db.putAsset(file, file.name, 'image');
      draft.assetId = record.id;
      await paint();
    })();
  });

  modal.body.append(
    thumb,
    row(
      button('上传背景图', () => fileInput.click(), 'soft'),
      button('🔌 用我的生图接口', () => {
        openImageGen({
          kind: 'scene',
          label: draft.name || '场景',
          onImage: async (src) => {
            const blob = await imageToBlob(src);
            const record = await db.putAsset(blob, draft.name || 'scene.png', 'image');
            draft.assetId = record.id;
            draft.gradient = undefined;
            await paint();
          },
        });
      }, 'soft'),
    ),
    field(
      '场景名',
      textInput({
        value: draft.name,
        placeholder: '雨夜咖啡馆 / 午后阳光卧室',
        onInput: (v) => {
          draft.name = v;
        },
      }),
    ),
    field(
      '氛围粒子',
      select({
        value: draft.particles,
        items: PARTICLES,
        onChange: (v) => {
          draft.particles = v as ParticleMode;
        },
      }),
    ),
    slider({
      label: '亮度',
      min: 0.4,
      max: 1.2,
      step: 0.02,
      value: draft.brightness,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => {
        draft.brightness = v;
      },
    }),
    row(
      button('保存场景', () => {
        const name = draft.name.trim();
        if (!name) {
          toast('给场景起个名字吧', 'error');
          return;
        }
        draft.name = name;
        store.updateCharacter((c) => {
          const idx = c.scenes.findIndex((s) => s.id === draft.id);
          if (idx >= 0) c.scenes[idx] = draft;
          else c.scenes.push(draft);
        });
        onSaved();
        modal.close();
        toast(`场景「${name}」已保存`, 'info');
        const current = store.character;
        const active = current.scenes.find((s) => s.id === current.currentSceneId);
        if (active) void stage.showScene(active, false);
      }, 'primary'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );
}

function cutoutLabel(mode: SpriteSlot['cutout']): string {
  return { none: '原图', white: '白底抠图', green: '绿幕', ai: 'AI 抠图' }[mode];
}

function displayLabel(mode: SpriteSlot['display']): string {
  return { float: '悬空', tarot: '塔罗画框', blend: '柔光融合' }[mode];
}

function pickCard(): void {
  const input = h('input', { type: 'file', accept: '.png,.json,image/png,application/json', class: 'hidden-input' }) as HTMLInputElement;
  document.body.append(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const card = await importCardFile(file);
        const now = Date.now();
        let avatarAssetId: string | undefined;
        if (card.avatar) {
          const record = await db.putAsset(card.avatar, `${card.name}.png`, 'image');
          avatarAssetId = record.id;
        }
        const fresh: Character = {
          id: slugId('char'),
          name: card.name,
          persona: card.persona,
          greeting: card.greeting || `（${card.name}抬头看向你）你来啦。`,
          avatarAssetId,
          sprites: [],
          scenes: [{ id: slugId('scene'), name: '默认场景', particles: 'stardust', brightness: 1 }],
          messages: [],
          memories: [],
          bondXp: 0,
          createdAt: now,
          updatedAt: now,
          cardSource: 'sillytavern',
        };
        fresh.messages.push({
          id: `m-${now}`,
          role: 'assistant',
          content: fresh.greeting,
          createdAt: now,
          cues: { scene: '默认场景' },
        });
        fresh.currentSceneId = fresh.scenes[0].id;
        await store.addCharacter(fresh);
        await stage.renderCharacter(store.character);
        audio.chime('bond');
        toast(`角色「${card.name}」已加入`, 'info');
        rerender();
      } catch (err) {
        toast(err instanceof Error ? err.message : '角色卡导入失败', 'error', 6000);
      }
    })();
  });
  input.click();
}

function createCharacter(): void {
  const modal = openModal({ title: '新建角色', subtitle: '先起个名字，其余设定随时可以补。', size: 'sm' });
  const name = textInput({ value: '', placeholder: '角色名' });
  modal.body.append(
    field('角色名', name),
    row(
      button('创建', async () => {
        const value = name.value.trim() || '新角色';
        const now = Date.now();
        const fresh: Character = {
          id: slugId('char'),
          name: value,
          persona: `你是「${value}」。请用自然、有个性的口吻与对方交谈，不要跳出角色。`,
          greeting: `（${value}朝你点了点头）……你来啦。`,
          sprites: [],
          scenes: [{ id: slugId('scene'), name: '星海阳台', builtinPath: 'assets/bg/star-balcony.png', particles: 'stardust', brightness: 1 }],
          messages: [],
          memories: [],
          bondXp: 0,
          createdAt: now,
          updatedAt: now,
        };
        fresh.messages.push({ id: `m-${now}`, role: 'assistant', content: fresh.greeting, createdAt: now });
        fresh.currentSceneId = fresh.scenes[0].id;
        await store.addCharacter(fresh);
        modal.close();
        await stage.renderCharacter(store.character);
        rerender();
        toast(`角色「${value}」已创建`, 'info');
      }, 'primary'),
      button('使用艾拉模板', async () => {
        const ella = createElla();
        ella.id = slugId('char');
        ella.name = name.value.trim() || '艾拉';
        await store.addCharacter(ella);
        modal.close();
        await stage.renderCharacter(store.character);
        rerender();
      }, 'ghost'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );
}
