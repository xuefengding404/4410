/**
 * 星语剧场 — 核心状态与数据结构
 * 所有数据都只落在本机 IndexedDB，绝不经过任何中转服务器。
 */

export type PanelId = 'characters' | 'memories' | 'api' | 'settings';

export type SpriteKind = 'image' | 'video';

/** 抠图方式：原图 / 智能白底 / 静态绿幕 / 本地 AI 语义抠图 */
export type CutoutMode = 'none' | 'white' | 'green' | 'ai';

/** 立绘展示形态：透明悬空 / 星光塔罗画框 / 柔光暗角融合 */
export type DisplayMode = 'float' | 'tarot' | 'blend';

export type ParticleMode = 'none' | 'rain' | 'stardust' | 'snow';

export type NavShape = 'diamond' | 'circle' | 'rounded';

export interface SpriteSlot {
  id: string;
  /** 立绘名，例如「常态微笑」「穿睡衣」。会注入 System Prompt 供 AI 用 <sprite:名称> 切换 */
  name: string;
  kind: SpriteKind;
  assetId?: string;
  /** 官方内置素材路径（相对于站点根），文件缺失时优雅降级为 SVG 占位 */
  builtinPath?: string;
  cutout: CutoutMode;
  display: DisplayMode;
  scale: number;
  offsetX: number;
  offsetY: number;
  /** 视频立绘是否启用 Ping-Pong 正放+倒放循环 */
  pingPong: boolean;
}

export interface SceneSlot {
  id: string;
  /** 场景名，例如「雨夜咖啡馆」。AI 用 <scene:场景名> 切换 */
  name: string;
  assetId?: string;
  builtinPath?: string;
  /** 无图片时使用的 CSS 渐变背景（官方默认场景） */
  gradient?: string;
  particles: ParticleMode;
  brightness: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  edited?: boolean;
  /** 本轮触发的演出，便于剧情记录回看 */
  cues?: { sprite?: string; scene?: string };
}

export type MemoryKind = 'fact' | 'promise' | 'preference' | 'moment';

/** 剧情分支树上的一个存档点（快照） */
export interface BranchSnapshot {
  id: string;
  characterId: string;
  parentId?: string;
  label: string;
  createdAt: number;
  /** 快照时的消息条数 */
  messageCount: number;
  messages: ChatMessage[];
  memories: MemoryEntry[];
  bondXp: number;
  spriteId?: string;
  sceneId?: string;
  /** 由「每回合自动存档」生成 */
  auto?: boolean;
  /** 收藏的节点会在「只看收藏」里保留 */
  favorite?: boolean;
}

export interface MemoryEntry {
  id: string;
  text: string;
  pinned: boolean;
  kind: MemoryKind;
  createdAt: number;
  source: 'manual' | 'auto' | 'import';
}

export interface Character {
  id: string;
  name: string;
  /** 铭牌上的身份，例如「时空管家」 */
  title?: string;
  /** 角色设定 / 人设卡原文 */
  persona: string;
  /** 开场白（新角色第一次进入时播放） */
  greeting: string;
  avatarAssetId?: string;
  sprites: SpriteSlot[];
  scenes: SceneSlot[];
  messages: ChatMessage[];
  memories: MemoryEntry[];
  bondXp: number;
  currentSpriteId?: string;
  currentSceneId?: string;
  /** 当前所在的剧情分支节点（用于新存档自动挂到该节点下） */
  activeBranchId?: string;
  createdAt: number;
  updatedAt: number;
  /** 从酒馆卡导入时保留原始字段，便于二次编辑 */
  cardSource?: string;
}

export interface AssetRecord {
  id: string;
  name: string;
  mime: string;
  kind: 'image' | 'video';
  blob: Blob;
  createdAt: number;
}

export interface ApiConfig {
  /** 离线体验模式：无需 Key，用本地脚本回复，方便第一次打开就能玩 */
  demoMode: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  /** 单次请求的「无响应」超时（毫秒） */
  timeoutMs: number;
  /** 个人生图接口（纯中立 BYOK 通道，提示词完全由用户输入） */
  imageUrl: string;
  imageKey: string;
  imageModel: string;
}

export interface BrowserTtsSettings {
  voiceURI: string;
  rate: number;
  pitch: number;
}

export type TtsFormat = 'openai' | 'gpt-sovits' | 'template';

export interface CustomTtsSettings {
  format: TtsFormat;
  endpoint: string;
  apiKey: string;
  model: string;
  voice: string;
  speed: number;
  /** GPT-SoVITS v2/v3 专属参数 */
  refAudioPath: string;
  promptText: string;
  promptLang: string;
  textLang: string;
  /** 自定义 JSON 模板：允许极客映射任意本地 TTS 接口 */
  templateUrl: string;
  templateHeaders: string;
  templateBody: string;
  /** 从响应 JSON 中取音频的路径，如 data.url / audio */
  templateAudioPath: string;
}

export interface TtsSettings {
  mode: 'off' | 'browser' | 'custom';
  autoRead: boolean;
  browser: BrowserTtsSettings;
  custom: CustomTtsSettings;
}

export interface VolumeSettings {
  sfx: number;
  ambient: number;
  voice: number;
}

export interface DisplaySettings {
  fontSize: number;
  fontFamily: string;
  typeSpeed: number;
  autoAdvance: boolean;
  autoDelay: number;
  /** 立绘整体缩放 */
  spriteScale: number;
  particlesEnabled: boolean;
}

export interface MemorySettings {
  /** 非置顶记忆动态召回条数 */
  recallTop: number;
  /** 记录回忆时是否弹出温柔提示 */
  notify: boolean;
}

export interface SkinBubble {
  color: string;
  opacity: number;
  blur: number;
  radius: number;
}

export interface SkinBorder {
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'double' | 'none';
  glow: number;
}

export interface SkinText {
  color: string;
  size: number;
  font: string;
  lineHeight: number;
}

export interface SkinSend {
  from: string;
  to: string;
  glow: number;
}

export interface SkinConfig {
  version: number;
  name: string;
  bubble: SkinBubble;
  border: SkinBorder;
  text: SkinText;
  send: SkinSend;
  navShape: NavShape;
  /** 对话框自定义底图（存 assets 表） */
  dialogueBgAssetId?: string;
  dialogueBgOpacity: number;
}

export interface AppSettings {
  volumes: VolumeSettings;
  tts: TtsSettings;
  display: DisplaySettings;
  memory: MemorySettings;
  /** 每个 AI 回合结束后自动在分支树存一笔 */
  branchAutoSave: boolean;
  /** 开场 / 引导 / 离线体验的固定台词用预生成语音包播放 */
  fixedVoice: boolean;
  skin: SkinConfig;
  /** 首次启动是否已完成引导 */
  onboarded: boolean;
}

export interface BackupPayload {
  app: 'starry-theater';
  version: number;
  exportedAt: number;
  settings: AppSettings;
  api: ApiConfig;
  characters: Character[];
  assets: { id: string; name: string; mime: string; kind: 'image' | 'video'; dataUrl: string }[];
  /** 剧情分支树：characterId → 节点列表 */
  branches?: Record<string, BranchSnapshot[]>;
}

export interface StreamTag {
  type: 'sprite' | 'scene' | 'fx' | 'mem';
  value: string;
}

export interface FxKind {
  kind: 'zoom' | 'shake' | 'blush';
}

export const BOND_LEVELS = [
  { level: 1, name: '初遇', min: 0 },
  { level: 2, name: '相识', min: 120 },
  { level: 3, name: '心动', min: 300 },
  { level: 4, name: '眷恋', min: 600 },
  { level: 5, name: '星语相依', min: 1000 },
  { level: 6, name: '命中注定', min: 1600 },
] as const;

export function bondInfo(xp: number): { level: number; name: string; next?: number; progress: number } {
  let idx = 0;
  for (let i = 0; i < BOND_LEVELS.length; i += 1) {
    if (xp >= BOND_LEVELS[i].min) idx = i;
  }
  const cur = BOND_LEVELS[idx];
  const next = BOND_LEVELS[idx + 1];
  const span = next ? next.min - cur.min : 1;
  const progress = next ? Math.min(1, Math.max(0, (xp - cur.min) / span)) : 1;
  return { level: cur.level, name: cur.name, next: next?.min, progress };
}
