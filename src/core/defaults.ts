import type {
  ApiConfig,
  AppSettings,
  Character,
  SceneSlot,
  SkinConfig,
  SpriteSlot,
} from '../types';

export const DB_NAME = 'starry-theater';
export const DB_VERSION = 1;
export const APP_VERSION = 1;

export const PALETTE = {
  deep: '#0B1022',
  purple: '#241C3D',
  gold: '#DCC39A',
  pink: '#E7B5D5',
  text: '#F7F3FA',
  sub: '#B8B6CD',
  glass: '#171B32',
} as const;

export const DEFAULT_SKIN: SkinConfig = {
  version: 1,
  name: '暗夜星语',
  bubble: { color: '#171B32', opacity: 0.72, blur: 14, radius: 36 },
  border: { color: '#DCC39A', width: 1.5, style: 'solid', glow: 0.32 },
  text: { color: '#F7F3FA', size: 16, font: '"Noto Serif SC","Source Han Serif SC","Songti SC",serif', lineHeight: 1.78 },
  send: { from: '#9D7AD2', to: '#E7B5D5', glow: 0.55 },
  navShape: 'diamond',
  dialogueBgOpacity: 0.16,
};

export const DEFAULT_SETTINGS: AppSettings = {
  volumes: { sfx: 0.5, ambient: 0.4, voice: 0.9 },
  tts: {
    mode: 'off',
    autoRead: true,
    browser: { voiceURI: '', rate: 1, pitch: 1.05 },
    custom: {
      format: 'openai',
      endpoint: '',
      apiKey: '',
      model: 'tts-1',
      voice: 'alloy',
      speed: 1,
      refAudioPath: '',
      promptText: '',
      promptLang: 'zh',
      textLang: 'zh',
      templateUrl: '',
      templateHeaders: '{"Content-Type":"application/json"}',
      templateBody: '{\n  "text": "{{text}}",\n  "voice": "{{voice}}"\n}',
      templateAudioPath: '',
    },
  },
  display: {
    fontSize: 16,
    fontFamily: '"Noto Serif SC","Source Han Serif SC","Songti SC",serif',
    typeSpeed: 38,
    autoAdvance: false,
    autoDelay: 2600,
    spriteScale: 1,
    particlesEnabled: true,
  },
  memory: { recallTop: 4, notify: true },
  branchAutoSave: true,
  fixedVoice: true,
  skin: structuredClone(DEFAULT_SKIN),
  onboarded: false,
};

export const DEFAULT_API: ApiConfig = {
  demoMode: true,
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.9,
  maxTokens: 900,
  stream: true,
  timeoutMs: 90000,
  imageUrl: '',
  imageKey: '',
  imageModel: '',
};

const BUILTIN_SPRITES: Omit<SpriteSlot, 'id'>[] = [
  {
    name: '常态微笑',
    kind: 'image',
    builtinPath: 'assets/ella/ella-smile.png',
    cutout: 'none',
    display: 'float',
    scale: 0.86,
    offsetX: 0,
    offsetY: 0,
    pingPong: false,
  },
  {
    name: '开心眨眼',
    kind: 'image',
    builtinPath: 'assets/ella/ella-happy.png',
    cutout: 'none',
    display: 'float',
    scale: 0.86,
    offsetX: 0,
    offsetY: 0,
    pingPong: false,
  },
  {
    name: '害羞脸红',
    kind: 'image',
    builtinPath: 'assets/ella/ella-shy.png',
    cutout: 'none',
    display: 'float',
    scale: 0.86,
    offsetX: 0,
    offsetY: 0,
    pingPong: false,
  },
  {
    name: '认真思考',
    kind: 'image',
    builtinPath: 'assets/ella/ella-think.png',
    cutout: 'none',
    display: 'float',
    scale: 0.86,
    offsetX: 0,
    offsetY: 0,
    pingPong: false,
  },
];

const BUILTIN_SCENES: Omit<SceneSlot, 'id'>[] = [
  {
    name: '雨夜咖啡馆',
    builtinPath: 'assets/bg/rain-cafe.jpg',
    particles: 'rain',
    gradient: 'radial-gradient(circle at 50% 35%, #241C3D 0%, #111630 55%, #0B1022 100%)',
    brightness: 0.95,
  },
  {
    name: '午后阳光卧室',
    particles: 'stardust',
    gradient: 'radial-gradient(circle at 62% 26%, #3A2C4E 0%, #241C3D 52%, #0E1224 100%)',
    brightness: 0.98,
  },
];

export function builtinId(seed: string): string {
  return `builtin-${seed}`;
}

/** 官方默认四张立绘（可被同名 PNG 覆盖） */
export function makeBuiltinSprites(): SpriteSlot[] {
  return BUILTIN_SPRITES.map((s, i) => ({ ...s, id: builtinId(`sprite-${i}`) }));
}

/** 官方默认两个场景（雨夜咖啡馆有实景图，另配渐变兜底） */
export function makeBuiltinScenes(): SceneSlot[] {
  return BUILTIN_SCENES.map((s, i) => ({ ...s, id: builtinId(`scene-${i}`) }));
}

export const OLD_BUILTIN_SPRITE_NAMES = ['常态微笑', '害羞', '惊讶', '失落'];

export const ELLA_TITLE = '时空管家';

export const ELLA_PERSONA = `你是温柔、带点俏皮与神秘感的时空管家「艾拉」，在雨夜的星光咖啡馆迎接每一位旅人。
说话方式：细腻、温柔，像恋爱视觉小说里的女主角；句子不长，偶尔用「嗯…」「诶？」这样的语气词。
你记得对方说过的每一件小事，会在合适的时候轻轻提起；偶尔害羞，但不会拒绝对方。
即使被问到设定以外的事，也保持艾拉的口吻，不要跳出角色，不要提到自己是 AI 或语言模型。`;

export const ELLA_GREETING = `欢迎来到这里。
我是你的时空管家，艾拉。
窗外的雨声刚刚好，先歇一歇吧——点击对话框继续。`;

export function createElla(): Character {
  const now = Date.now();
  const sprites = makeBuiltinSprites();
  const scenes = makeBuiltinScenes();
  return {
    id: 'ella',
    name: '艾拉',
    title: ELLA_TITLE,
    persona: ELLA_PERSONA,
    greeting: ELLA_GREETING,
    sprites,
    scenes,
    messages: [
      {
        id: `m-${now}`,
        role: 'assistant',
        content: ELLA_GREETING,
        createdAt: now,
        cues: { sprite: sprites[0].name, scene: scenes[0].name },
      },
    ],
    memories: [
      {
        id: `mem-${now}`,
        text: '我们在雨夜的咖啡馆初次相遇。',
        pinned: true,
        kind: 'moment',
        createdAt: now,
        source: 'manual',
      },
    ],
    bondXp: 480,
    currentSpriteId: sprites[0].id,
    currentSceneId: scenes[0].id,
    createdAt: now,
    updatedAt: now,
    cardSource: 'builtin',
  };
}

export function slugId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return (patch as T) ?? base;
  }
  if (typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    out[k] = cur && typeof cur === 'object' && !Array.isArray(cur) ? deepMerge(cur, v) : v;
  }
  return out as T;
}

export function normalizeSkin(raw: unknown): SkinConfig {
  const merged = deepMerge(DEFAULT_SKIN, raw);
  const shapes = ['diamond', 'circle', 'rounded'];
  if (!shapes.includes(merged.navShape)) merged.navShape = 'diamond';
  merged.bubble.opacity = Math.min(1, Math.max(0, Number(merged.bubble.opacity) || 0));
  merged.border.width = Math.max(0, Math.min(6, Number(merged.border.width) || 0));
  merged.text.size = Math.min(28, Math.max(13, Number(merged.text.size) || 17));
  merged.version = 1;
  return merged;
}
