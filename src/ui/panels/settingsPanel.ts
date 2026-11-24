import { audio } from '../../audio/audioEngine';
import { listBrowserVoices, onVoicesChanged, speak, TtsError } from '../../audio/tts';
import { store } from '../../app/store';
import { exportBackup, importBackup, db } from '../../storage/db';
import { downloadText, formatTime, h } from '../dom';
import { button, field, row, section, select, slider, textArea, textInput, toggle } from '../form';
import { closeAllModals, confirmDialog, openModal, toast } from '../modal';
import { forkFromMessage, rewindToUserMessage } from '../../core/branchActions';
import { stopFixedVoice, voicePackSize } from '../../core/voicePack';
import { openSkinEditor } from './skinPanel';
import { stage } from '../stage';
import type { BackupPayload, TtsFormat } from '../../types';
import { engine } from '../../core/dialogueEngine';
import { deepMerge, normalizeSkin } from '../../core/defaults';
import { createSnapshot } from '../../core/branches';
import { openBranchPanel } from './branchPanel';

type TabId = 'audio' | 'voice' | 'display' | 'history' | 'skin' | 'backup' | 'about';

const TABS: { id: TabId; label: string }[] = [
  { id: 'audio', label: '音效与环境音' },
  { id: 'voice', label: '朗读与配音' },
  { id: 'display', label: '文字与推进' },
  { id: 'history', label: '剧情记录' },
  { id: 'skin', label: '界面装扮' },
  { id: 'backup', label: '备份与数据' },
  { id: 'about', label: '关于' },
];

let activeTab: TabId = 'audio';

export function openSettingsPanel(tab: TabId = 'audio'): void {
  activeTab = tab;
  const modal = openModal({
    title: '设置',
    subtitle: '所有偏好都只属于你，保存在本机。',
    size: 'lg',
  });
  const layout = h('div', { class: 'settings-layout' });
  const nav = h('nav', { class: 'settings-nav' });
  const pane = h('div', { class: 'settings-pane' });
  layout.append(nav, pane);
  modal.body.append(layout);

  const paint = (): void => {
    nav.replaceChildren();
    for (const tab of TABS) {
      const btn = h(
        'button',
        {
          class: `settings-tab${tab.id === activeTab ? ' active' : ''}`,
          type: 'button',
          onclick: () => {
            activeTab = tab.id;
            paint();
          },
        },
        tab.label,
      );
      nav.append(btn);
    }
    pane.replaceChildren();
    switch (activeTab) {
      case 'audio':
        renderAudio(pane);
        break;
      case 'voice':
        renderVoice(pane, paint);
        break;
      case 'display':
        renderDisplay(pane);
        break;
      case 'history':
        renderHistory(pane);
        break;
      case 'skin':
        openSkinEditor(pane);
        break;
      case 'backup':
        renderBackup(pane);
        break;
      default:
        renderAbout(pane);
    }
  };
  paint();
}

function renderAudio(pane: HTMLElement): void {
  const volumes = store.settings.volumes;
  pane.append(
    section('音量', '三路独立音量，互不影响。'),
    slider({
      label: '音效',
      min: 0,
      max: 1,
      step: 0.01,
      value: volumes.sfx,
      format: percent,
      onInput: (v) => {
        volumes.sfx = v;
        audio.setVolumes(volumes);
        void store.saveSettings();
      },
      hint: '打字机声、记忆提示音、羁绊升级音。',
    }),
    slider({
      label: '环境音',
      min: 0,
      max: 1,
      step: 0.01,
      value: volumes.ambient,
      format: percent,
      onInput: (v) => {
        volumes.ambient = v;
        audio.setVolumes(volumes);
        void store.saveSettings();
      },
      hint: '随场景自动切换的雨声 / 星尘低鸣。',
    }),
    slider({
      label: '配音',
      min: 0,
      max: 1,
      step: 0.01,
      value: volumes.voice,
      format: percent,
      onInput: (v) => {
        volumes.voice = v;
        audio.setVolumes(volumes);
        void store.saveSettings();
      },
      hint: '浏览器朗读与自定义 TTS 的音量。',
    }),
    row(
      button('试听星芒提示音', () => {
        void audio.unlock();
        audio.chime('memory');
      }, 'soft'),
      button('试听雨声', () => {
        void audio.unlock();
        audio.playAmbient('rain');
        setTimeout(() => audio.playAmbient('none'), 4000);
      }, 'ghost'),
    ),
  );
}

function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function renderVoice(pane: HTMLElement, repaint: () => void): void {
  const tts = store.settings.tts;
  pane.append(
    section('朗读与配音', '纯本地朗读或你自己的 TTS 服务，音频不会被上传。'),
    toggle({
      label: '固定台词语音（预生成）',
      checked: store.settings.fixedVoice,
      hint:
        voicePackSize() > 0
          ? `开场、三步引导与离线体验的固定台词会直接播放本地语音包（已加载 ${voicePackSize()} 句）；动态回复仍走下面的朗读。`
          : '当前没有找到固定语音包，仍按下面的朗读方式处理。',
      onChange: (v) => {
        store.settings.fixedVoice = v;
        void store.saveSettings();
        if (!v) stopFixedVoice();
      },
    }),
    select({
      label: '朗读方式',
      value: tts.mode,
      items: [
        { value: 'off', label: '关闭' },
        { value: 'browser', label: '浏览器免费配音' },
        { value: 'custom', label: '自定义 TTS API（GPT-SoVITS / CosyVoice / Fish-Speech…）' },
      ],
      onChange: (v) => {
        tts.mode = v as typeof tts.mode;
        void store.saveSettings();
        repaint();
      },
    }),
    toggle({
      label: '新台词自动朗读',
      checked: tts.autoRead,
      onChange: (v) => {
        tts.autoRead = v;
        void store.saveSettings();
      },
    }),
  );

  if (tts.mode === 'browser') {
    const voices = listBrowserVoices();
    onVoicesChanged(() => repaint());
    pane.append(
      field(
        '系统语音',
        select({
          value: tts.browser.voiceURI,
          items: [{ value: '', label: '自动选择中文语音' }, ...voices.map((v) => ({ value: v.uri, label: `${v.name}（${v.lang}）` }))],
          onChange: (v) => {
            tts.browser.voiceURI = v;
            void store.saveSettings();
          },
        }),
      ),
      slider({
        label: '语速',
        min: 0.5,
        max: 2,
        step: 0.05,
        value: tts.browser.rate,
        format: (v) => `${v.toFixed(2)}×`,
        onInput: (v) => {
          tts.browser.rate = v;
          void store.saveSettings();
        },
      }),
      slider({
        label: '音调',
        min: 0.5,
        max: 2,
        step: 0.05,
        value: tts.browser.pitch,
        format: (v) => `${v.toFixed(2)}`,
        onInput: (v) => {
          tts.browser.pitch = v;
          void store.saveSettings();
        },
      }),
    );
  }

  if (tts.mode === 'custom') {
    const c = tts.custom;
    pane.append(
      select({
        label: '接口格式',
        value: c.format,
        items: [
          { value: 'openai', label: 'OpenAI 标准兼容（Fish-Speech / Kokoro / 云端 TTS）' },
          { value: 'gpt-sovits', label: 'GPT-SoVITS v2 / v3 本地预设' },
          { value: 'template', label: '自定义 JSON 模板（极客模式）' },
        ],
        onChange: (v) => {
          c.format = v as TtsFormat;
          void store.saveSettings();
          repaint();
        },
      }),
      field(
        '接口地址',
        textInput({
          value: c.endpoint,
          placeholder: c.format === 'gpt-sovits' ? 'http://127.0.0.1:9880/tts' : 'http://127.0.0.1:8080/v1/audio/speech',
          monospace: true,
          onInput: (v) => {
            c.endpoint = v.trim();
            void store.saveSettings();
          },
        }),
        '手机访问时请把 127.0.0.1 换成电脑的局域网 IP（例如 192.168.1.8）。',
      ),
    );

    if (c.format === 'gpt-sovits') {
      pane.append(
        field(
          '参考音频路径 ref_audio_path',
          textInput({
            value: c.refAudioPath,
            placeholder: 'D:\\voices\\ella_ref.wav',
            monospace: true,
            onInput: (v) => {
              c.refAudioPath = v.trim();
              void store.saveSettings();
            },
          }),
          '填给 GPT-SoVITS 服务端的本地绝对路径（不是浏览器里的文件）。',
        ),
        field(
          '参考文本 prompt_text',
          textArea({
            value: c.promptText,
            rows: 2,
            placeholder: '这段参考音频里说的话',
            onInput: (v) => {
              c.promptText = v;
              void store.saveSettings();
            },
          }),
        ),
        h(
          'div',
          { class: 'grid-2' },
          select({
            label: '参考语言 prompt_lang',
            value: c.promptLang,
            items: [
              { value: 'zh', label: '中文' },
              { value: 'en', label: '英文' },
              { value: 'ja', label: '日文' },
              { value: 'ko', label: '韩文' },
              { value: 'auto', label: '自动' },
            ],
            onChange: (v) => {
              c.promptLang = v;
              void store.saveSettings();
            },
          }),
          select({
            label: '台词语言 text_lang',
            value: c.textLang,
            items: [
              { value: 'zh', label: '中文' },
              { value: 'en', label: '英文' },
              { value: 'ja', label: '日文' },
              { value: 'ko', label: '韩文' },
              { value: 'auto', label: '自动' },
            ],
            onChange: (v) => {
              c.textLang = v;
              void store.saveSettings();
            },
          }),
        ),
        slider({
          label: '语速因子',
          min: 0.5,
          max: 2,
          step: 0.05,
          value: c.speed,
          format: (v) => `${v.toFixed(2)}×`,
          onInput: (v) => {
            c.speed = v;
            void store.saveSettings();
          },
        }),
        h(
          'p',
          { class: 'note' },
          '启动示例：python api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml。若报 CORS，请在服务端加 Access-Control-Allow-Origin: *，或用支持跨域的本地反代。',
        ),
      );
    } else if (c.format === 'openai') {
      pane.append(
        h(
          'div',
          { class: 'grid-2' },
          field(
            '模型',
            textInput({
              value: c.model,
              placeholder: 'tts-1',
              onInput: (v) => {
                c.model = v.trim();
                void store.saveSettings();
              },
            }),
          ),
          field(
            '音色',
            textInput({
              value: c.voice,
              placeholder: 'alloy / zh_female_…',
              onInput: (v) => {
                c.voice = v.trim();
                void store.saveSettings();
              },
            }),
          ),
        ),
        field(
          'API Key（可选）',
          textInput({
            value: c.apiKey,
            type: 'password',
            monospace: true,
            onInput: (v) => {
              c.apiKey = v.trim();
              void store.saveSettings();
            },
          }),
        ),
      );
    } else {
      pane.append(
        field(
          '请求地址模板',
          textInput({
            value: c.templateUrl,
            placeholder: 'http://127.0.0.1:8000/tts?text={{text}}',
            monospace: true,
            onInput: (v) => {
              c.templateUrl = v.trim();
              void store.saveSettings();
            },
          }),
        ),
        field(
          '请求头 JSON',
          textArea({
            value: c.templateHeaders,
            rows: 3,
            monospace: true,
            onInput: (v) => {
              c.templateHeaders = v;
              void store.saveSettings();
            },
          }),
        ),
        field(
          '请求体模板',
          textArea({
            value: c.templateBody,
            rows: 5,
            monospace: true,
            onInput: (v) => {
              c.templateBody = v;
              void store.saveSettings();
            },
          }),
          '可用变量：{{text}} {{voice}} {{model}} {{speed}} {{language}} {{refAudioPath}} {{promptText}}',
        ),
        field(
          '响应音频字段路径',
          textInput({
            value: c.templateAudioPath,
            placeholder: 'data.url 或 audio（留空自动识别）',
            onInput: (v) => {
              c.templateAudioPath = v.trim();
              void store.saveSettings();
            },
          }),
          '若接口直接返回音频二进制则不用填。',
        ),
      );
    }

    pane.append(
      row(
        button('试听一句', () => {
          void audio.unlock();
          speak('今晚的星星，比昨天亮一点点。', store.settings.tts).catch((err: unknown) => {
            if (err instanceof TtsError) toast(`${err.message}｜${err.hint}`, 'error', 7000);
            else toast(err instanceof Error ? err.message : '朗读失败', 'error', 6000);
          });
        }, 'primary'),
        button('停止朗读', () => audio.stopVoice(), 'ghost'),
      ),
      h('p', { class: 'note' }, '跨域排查：浏览器控制台出现 CORS 时，需要服务端允许跨域；本地文件直接打开（file://）时受限最多，请用本地服务器或 PWA 方式运行。'),
    );
  }
}

function renderDisplay(pane: HTMLElement): void {
  const d = store.settings.display;
  pane.append(
    section('文字', '只影响你的阅读体验，不改动角色设定。'),
    slider({
      label: '正文字号',
      min: 14,
      max: 26,
      step: 1,
      value: d.fontSize,
      format: (v) => `${v}px`,
      onInput: (v) => {
        d.fontSize = v;
        document.documentElement.style.setProperty('--skin-text-size', `${v}px`);
        void store.saveSettings();
      },
    }),
    select({
      label: '字体',
      value: d.fontFamily,
      items: [
        { value: '"Noto Serif SC","Source Han Serif SC","Songti SC",serif', label: '宋体 · 书卷气（默认）' },
        { value: '"KaiTi","STKaiti","Noto Serif SC",serif', label: '楷体 · 手写感' },
        { value: '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif', label: '黑体 · 清爽' },
        { value: '"Yuanti SC","YouYuan","PingFang SC",sans-serif', label: '圆体 · 柔软' },
      ],
      onChange: (v) => {
        d.fontFamily = v;
        document.documentElement.style.setProperty('--skin-text-font', v);
        void store.saveSettings();
      },
    }),
    slider({
      label: '吐字速度',
      min: 10,
      max: 90,
      step: 2,
      value: d.typeSpeed,
      format: (v) => `${v} 字/秒`,
      onInput: (v) => {
        d.typeSpeed = v;
        void store.saveSettings();
      },
    }),
    h('div', { class: 'divider' }),
    section('推进与舞台'),
    toggle({
      label: '自动推进',
      hint: '每段台词读完后，停顿一会儿自动继续。',
      checked: d.autoAdvance,
      onChange: (v) => {
        d.autoAdvance = v;
        void store.saveSettings();
      },
    }),
    slider({
      label: '自动推进停顿',
      min: 800,
      max: 8000,
      step: 200,
      value: d.autoDelay,
      format: (v) => `${(v / 1000).toFixed(1)} 秒`,
      onInput: (v) => {
        d.autoDelay = v;
        void store.saveSettings();
      },
    }),
    slider({
      label: '立绘整体大小',
      min: 0.6,
      max: 1.4,
      step: 0.02,
      value: d.spriteScale,
      format: percent,
      onInput: (v) => {
        d.spriteScale = v;
        void store.saveSettings();
        const figure = document.querySelector<HTMLElement>('.sprite-figure');
        if (figure) {
          const current = Number(getComputedStyle(figure).getPropertyValue('--sprite-scale')) || 1;
          figure.style.setProperty('--sprite-scale', String(current));
        }
      },
    }),
    toggle({
      label: '氛围粒子',
      checked: d.particlesEnabled,
      hint: '细雨 / 暖光星尘 / 落雪，跟随场景变化。',
      onChange: (v) => {
        d.particlesEnabled = v;
        void store.saveSettings();
        stage.setParticlesEnabled(v);
        const character = store.character;
        const scene = character.scenes.find((s) => s.id === character.currentSceneId);
        if (v && scene) void stage.showScene(scene, false);
      },
    }),
  );
}

function renderHistory(pane: HTMLElement): void {
  const character = store.character;
  pane.append(section('剧情记录', '可以重新生成上一轮，也可以直接修正说错的话。'));
  pane.append(
    h(
      'div',
      { class: 'branch-entry' },
      h(
        'div',
        { class: 'branch-entry-copy' },
        h('strong', {}, '🌿 剧情分支树'),
        h('p', { class: 'note' }, '把此刻存成树上的一个节点；回到旧节点继续对话，再存档就会自动长出新分支。'),
      ),
      row(
        button('打开分支树', () => {
          closeAllModals();
          window.setTimeout(() => openBranchPanel(), 260);
        }, 'soft'),
        button('在当前进度存档', () => {
          void createSnapshot(character)
            .then(async (node) => {
              await store.saveCharacterNow();
              toast(`已存档：「${node.label}」`, 'info');
            })
            .catch((err: unknown) => toast(err instanceof Error ? err.message : '存档失败', 'error'));
        }, 'ghost'),
      ),
    ),
  );
  const list = h('div', { class: 'history-list' });
  const messages = [...character.messages].reverse();
  const latestAssistantId = character.messages.filter((m) => m.role === 'assistant').at(-1)?.id;
  if (messages.length === 0) {
    list.append(h('p', { class: 'empty-state' }, '还没有对话。'));
  }
  for (const message of messages) {
    const item = h('div', { class: `history-item ${message.role}` });
    item.append(
      h(
        'div',
        { class: 'history-meta' },
        h('span', { class: 'history-role' }, message.role === 'assistant' ? character.name : '你'),
        h('span', { class: 'history-time' }, formatTime(message.createdAt)),
        message.edited ? h('span', { class: 'history-tag' }, '已编辑') : null,
      ),
      h('p', { class: 'history-text' }, message.content),
    );
    const actions = h('div', { class: 'history-actions' });
    if (message.role === 'assistant') {
      actions.append(
        button('从此分叉', () => {
          void forkFromMessage(message.id).then((result) => {
            toast(result.message, result.ok ? 'info' : 'error');
            if (result.ok) closeAllModals();
          });
        }, 'ghost'),
      );
      if (message.id === latestAssistantId) {
        actions.append(
          button('重新生成', () => {
            void engine.reroll().then(() => renderHistoryRefresh());
          }, 'ghost'),
        );
      }
      actions.append(button('编辑', () => openEditDialog(message.id, message.content), 'soft'));
    } else {
      actions.append(
        button('从此重说', () => {
          void rewindToUserMessage(message.id).then((result) => {
            toast(result.message, result.ok ? 'info' : 'error');
            if (result.ok) closeAllModals();
          });
        }, 'ghost'),
        button('编辑', () => openEditDialog(message.id, message.content), 'soft'),
      );
    }
    item.append(actions);
    list.append(item);
  }
  pane.append(list);
}

function openEditDialog(id: string, content: string): void {
  const modal = openModal({ title: '手动编辑', subtitle: '修正 OOC、错字或你不喜欢的表达。', size: 'sm' });
  const area = textArea({ value: content, rows: 6, onInput: () => undefined });
  modal.body.append(
    area,
    row(
      button('保存', () => {
        void engine.editMessage(id, area.value.trim() || content).then(() => {
          modal.close();
          renderHistoryRefresh();
        });
      }, 'primary'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );
}

function renderHistoryRefresh(): void {
  const pane = document.querySelector<HTMLElement>('.settings-pane');
  if (pane) renderHistory(pane);
}

function renderBackup(pane: HTMLElement): void {
  pane.append(
    section('整包备份', '把角色、手账、皮肤、设置和全部素材打包成一个 .json。清浏览器缓存前请务必备份。'),
    row(
      button('📦 导出整包备份', () => void doExport(), 'primary'),
      button('📥 导入备份', () => pickImport(), 'soft'),
    ),
    h('p', { class: 'note' }, '备份文件包含 API Key（方便换机恢复），请只存放在自己信任的地方。'),
    h('div', { class: 'divider' }),
    section('本机占用', '所有数据都在浏览器 IndexedDB 里。'),
  );
  const usage = h('p', { class: 'storage-usage' }, '统计中…');
  pane.append(usage);
  void db.usage().then(({ usage: used, quota }) => {
    const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;
    usage.textContent = `已用 ${mb(used)} / 可用约 ${quota ? mb(quota) : '未知'}`;
  });

  pane.append(
    h('div', { class: 'divider' }),
    section('危险区', '以下操作不可撤销（除非你刚导出过备份）。'),
    row(
      button('清空全部数据', async () => {
        const ok = await confirmDialog('清空全部数据', '所有角色、对话、手账和素材都会被删除，且无法恢复。确定要继续吗？', '全部删除');
        if (!ok) return;
        await db.clearAll();
        location.reload();
      }, 'danger'),
    ),
  );
}

async function doExport(): Promise<void> {
  try {
    const payload = await exportBackup(store.settings, store.api);
    const filename = `starry-theater-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadText(JSON.stringify(payload), filename, 'application/json');
    toast('备份已导出', 'info');
  } catch (err) {
    toast(err instanceof Error ? err.message : '导出失败', 'error');
  }
}

function pickImport(): void {
  const input = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void handleImport(String(reader.result));
    };
    reader.readAsText(file);
  });
  input.click();
}

async function handleImport(raw: string): Promise<void> {
  try {
    const payload = JSON.parse(raw) as BackupPayload;
    const ok = await confirmDialog(
      '导入备份',
      `备份里有 ${payload.characters?.length ?? 0} 个角色、${payload.assets?.length ?? 0} 个素材。导入会覆盖同 ID 角色，是否继续？`,
      '导入',
    );
    if (!ok) return;
    const result = await importBackup(payload, false);
    if (payload.settings) {
      store.settings = deepMerge(store.settings, payload.settings);
      store.settings.skin = normalizeSkin(store.settings.skin);
      await store.saveSettings();
    }
    if (payload.api) {
      store.api = deepMerge(store.api, payload.api);
      await store.saveApi();
    }
    store.characters = await db.listCharacters();
    store.currentId = store.characters[0]?.id ?? '';
    toast(`已恢复 ${result.characters} 个角色、${result.assets} 个素材，正在重新载入…`, 'info', 4000);
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    toast(err instanceof Error ? err.message : '备份文件无法读取', 'error', 6000);
  }
}

function renderAbout(pane: HTMLElement): void {
  pane.append(
    section('星语剧场 Starry Theater', '纯本地 · 自带 API · 跨端视觉小说框架'),
    h(
      'div',
      { class: 'about-card' },
      h('p', {}, 'V1.0 极客免费版：视觉小说核心、BYOK 对话、自由立绘/场景库、绿幕与免抠画框、酒馆卡导入、本地 TTS、皮肤包 JSON。'),
      h('p', {}, 'V1.0：剧情分支树、立绘与场景、羁绊手账、TTS、备份。'),
      h('p', { class: 'note' }, '本应用没有后端服务器。你的每一句对话、每一张图，都只留在这台设备上。'),
      h('p', { class: 'note' }, `版本 ${__APP_VERSION__} · 构建 ${new Date(__BUILD_TIME__).toLocaleString()}`),
    ),
  );
}
