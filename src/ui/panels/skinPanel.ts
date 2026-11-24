import { store } from '../../app/store';
import { DEFAULT_SKIN, normalizeSkin } from '../../core/defaults';
import { SKIN_AI_PROMPT, applySkin, downloadJson, skinFileName } from '../../core/skin';
import { assetUrl } from '../../storage/assets';
import { db } from '../../storage/db';
import { h } from '../dom';
import { button, field, row, section, select, slider, textArea, textInput } from '../form';
import { openModal, toast } from '../modal';
import type { SkinConfig } from '../../types';

const NAV_SHAPES: { value: SkinConfig['navShape']; label: string }[] = [
  { value: 'diamond', label: '菱形 ◇（默认）' },
  { value: 'circle', label: '圆形 ○' },
  { value: 'rounded', label: '圆角方块 ▢' },
];

export function openSkinEditor(container: HTMLElement): void {
  const skin = store.settings.skin;
  let bgUrl: string | undefined;

  const preview = h(
    'div',
    { class: 'skin-preview' },
    h('div', { class: 'skin-preview-bubble' }, h('span', { class: 'skin-preview-name' }, '艾拉'), h('p', {}, '今夜的风很软，像是专门为你留的。')),
    h('button', { class: 'skin-preview-send', type: 'button' }, '发送'),
  );

  const commit = (): void => {
    applySkin(skin, bgUrl);
    void store.saveSettings();
  };

  const colorField = (label: string, value: string, onChange: (v: string) => void): HTMLElement => {
    const color = h('input', { class: 'color-input', type: 'color', value }) as HTMLInputElement;
    const text = h('input', { class: 'input mono color-text', type: 'text', value }) as HTMLInputElement;
    color.addEventListener('input', () => {
      text.value = color.value;
      onChange(color.value);
    });
    text.addEventListener('change', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(text.value)) {
        color.value = text.value;
        onChange(text.value);
      }
    });
    return h('div', { class: 'color-row' }, h('span', { class: 'field-label' }, label), color, text);
  };

  container.append(
    section('界面装扮', '官方只保留「暗夜星语」一套底子，细节交给你调。改动实时预览。'),
    preview,
    field(
      '皮肤名称',
      textInput({
        value: skin.name,
        onInput: (v) => {
          skin.name = v;
          commit();
        },
      }),
    ),
    h('div', { class: 'divider' }),
    section('台词气泡'),
    colorField('气泡底色', skin.bubble.color, (v) => {
      skin.bubble.color = v;
      commit();
    }),
    slider({
      label: '不透明度',
      min: 0,
      max: 1,
      step: 0.02,
      value: skin.bubble.opacity,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => {
        skin.bubble.opacity = v;
        commit();
      },
    }),
    slider({
      label: '背景模糊',
      min: 0,
      max: 40,
      step: 1,
      value: skin.bubble.blur,
      format: (v) => `${v}px`,
      onInput: (v) => {
        skin.bubble.blur = v;
        commit();
      },
    }),
    slider({
      label: '圆角',
      min: 0,
      max: 40,
      step: 1,
      value: skin.bubble.radius,
      format: (v) => `${v}px`,
      onInput: (v) => {
        skin.bubble.radius = v;
        commit();
      },
    }),
    h('div', { class: 'divider' }),
    section('边框与光晕'),
    colorField('边框颜色', skin.border.color, (v) => {
      skin.border.color = v;
      commit();
    }),
    slider({
      label: '边框粗细',
      min: 0,
      max: 6,
      step: 0.5,
      value: skin.border.width,
      format: (v) => `${v}px`,
      onInput: (v) => {
        skin.border.width = v;
        commit();
      },
    }),
    select({
      label: '线型',
      value: skin.border.style,
      items: [
        { value: 'solid', label: '实线' },
        { value: 'dashed', label: '虚线' },
        { value: 'double', label: '双线' },
        { value: 'none', label: '无边框' },
      ],
      onChange: (v) => {
        skin.border.style = v as SkinConfig['border']['style'];
        commit();
      },
    }),
    slider({
      label: '外发光',
      min: 0,
      max: 1,
      step: 0.02,
      value: skin.border.glow,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => {
        skin.border.glow = v;
        commit();
      },
    }),
    h('div', { class: 'divider' }),
    section('正文与按钮'),
    colorField('正文颜色', skin.text.color, (v) => {
      skin.text.color = v;
      commit();
    }),
    slider({
      label: '正文字号',
      min: 13,
      max: 28,
      step: 1,
      value: skin.text.size,
      format: (v) => `${v}px`,
      onInput: (v) => {
        skin.text.size = v;
        commit();
      },
    }),
    slider({
      label: '行高',
      min: 1.3,
      max: 2.4,
      step: 0.05,
      value: skin.text.lineHeight,
      format: (v) => v.toFixed(2),
      onInput: (v) => {
        skin.text.lineHeight = v;
        commit();
      },
    }),
    colorField('发送按钮起点', skin.send.from, (v) => {
      skin.send.from = v;
      commit();
    }),
    colorField('发送按钮终点', skin.send.to, (v) => {
      skin.send.to = v;
      commit();
    }),
    slider({
      label: '按钮发光',
      min: 0,
      max: 1,
      step: 0.02,
      value: skin.send.glow,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => {
        skin.send.glow = v;
        commit();
      },
    }),
    select({
      label: '右上角导航按钮形状',
      value: skin.navShape,
      items: NAV_SHAPES,
      onChange: (v) => {
        skin.navShape = v as SkinConfig['navShape'];
        commit();
      },
    }),
    h('div', { class: 'divider' }),
    section('对话框底图', '想放一张星图或信纸？上传后只在对话框内部淡入，不影响主舞台。'),
    row(
      button('上传底图', () => pickDialogueBg(skin, preview, commit), 'soft'),
      button('移除底图', () => {
        skin.dialogueBgAssetId = undefined;
        bgUrl = undefined;
        commit();
      }, 'ghost'),
    ),
    slider({
      label: '底图浓度',
      min: 0,
      max: 1,
      step: 0.02,
      value: skin.dialogueBgOpacity,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => {
        skin.dialogueBgOpacity = v;
        commit();
      },
    }),
    h('div', { class: 'divider' }),
    section('皮肤包 JSON', '可以把自己的皮肤分享给朋友，也可以让 AI 帮你生成。'),
    row(
      button('导出皮肤 JSON', () => downloadJson(skin, skinFileName(skin)), 'soft'),
      button('导入 .json 文件', () => pickSkinFile(), 'soft'),
      button('粘贴 JSON', () => openPasteSkin(), 'ghost'),
      button('恢复官方默认', () => {
        Object.assign(store.settings.skin, structuredClone(DEFAULT_SKIN));
        applySkin(store.settings.skin);
        void store.saveSettings();
        toast('已恢复「暗夜星语」', 'info');
      }, 'ghost'),
    ),
    h('div', { class: 'divider' }),
    section('怎么让你的 AI 生成皮肤包', '复制下面这段指令，发给你的 AI，把它返回的 JSON 保存成 .json 或直接粘贴进来。'),
    h('pre', { class: 'code-block' }, SKIN_AI_PROMPT),
    row(
      button('一键复制指令', () => {
        void navigator.clipboard
          .writeText(SKIN_AI_PROMPT)
          .then(() => toast('指令已复制，去问你的 AI 吧', 'info'))
          .catch(() => toast('复制失败，请手动选中文本复制', 'error'));
      }, 'primary'),
    ),
  );

  void (async () => {
    if (skin.dialogueBgAssetId) {
      bgUrl = await assetUrl(skin.dialogueBgAssetId);
      applySkin(skin, bgUrl);
    }
  })();
}

async function pickDialogueBg(skin: SkinConfig, _preview: HTMLElement, commit: () => void): Promise<void> {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'hidden-input' }) as HTMLInputElement;
  document.body.append(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      const record = await db.putAsset(file, file.name, 'image');
      skin.dialogueBgAssetId = record.id;
      const url = await assetUrl(record.id);
      applySkin(skin, url);
      commit();
      toast('对话底图已更新', 'info');
    })();
  });
  input.click();
}

function pickSkinFile(): void {
  const input = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        applyImportedSkin(parsed);
      } catch {
        toast('JSON 解析失败，请检查文件内容', 'error');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function openPasteSkin(): void {
  const modal = openModal({ title: '粘贴皮肤 JSON', subtitle: '直接粘贴 AI 或朋友给你的皮肤包内容。', size: 'md' });
  const area = textArea({ value: '', rows: 14, placeholder: '{\n  "name": "我的星海",\n  ...\n}', monospace: true });
  modal.body.append(
    area,
    row(
      button('应用这个皮肤', () => {
        try {
          const parsed = JSON.parse(area.value) as unknown;
          applyImportedSkin(parsed);
          modal.close();
        } catch {
          toast('JSON 解析失败，请检查是否有多余文字', 'error');
        }
      }, 'primary'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );
}

function applyImportedSkin(raw: unknown): void {
  const normalized = normalizeSkin(raw);
  Object.assign(store.settings.skin, normalized);
  applySkin(store.settings.skin);
  void store.saveSettings();
  toast(`皮肤「${normalized.name}」已应用`, 'info');
}
