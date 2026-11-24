import type { SkinConfig } from '../types';
import { PALETTE } from './defaults';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [23, 27, 50];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const NAV_RADIUS: Record<SkinConfig['navShape'], string> = {
  diamond: '2px',
  circle: '999px',
  rounded: '11px',
};

/**
 * 把皮肤 JSON 应用到根节点 CSS 变量。
 * 主舞台、弹窗、按钮全部读这些变量，切换皮肤不需要重排组件。
 */
export function applySkin(skin: SkinConfig, dialogueBgUrl?: string): void {
  const root = document.documentElement;
  root.style.setProperty('--skin-bubble', withAlpha(skin.bubble.color, skin.bubble.opacity));
  root.style.setProperty('--skin-bubble-blur', `${skin.bubble.blur}px`);
  root.style.setProperty('--skin-bubble-radius', `${skin.bubble.radius}px`);
  root.style.setProperty('--skin-border', skin.border.color);
  root.style.setProperty('--skin-border-width', `${skin.border.width}px`);
  root.style.setProperty('--skin-border-style', skin.border.style === 'none' ? 'none' : skin.border.style);
  root.style.setProperty('--skin-glow', `${skin.border.glow}`);
  root.style.setProperty('--skin-text', skin.text.color);
  root.style.setProperty('--skin-text-size', `${skin.text.size}px`);
  root.style.setProperty('--skin-text-font', skin.text.font);
  root.style.setProperty('--skin-line-height', `${skin.text.lineHeight}`);
  root.style.setProperty('--skin-send-from', skin.send.from);
  root.style.setProperty('--skin-send-to', skin.send.to);
  root.style.setProperty('--skin-send-glow', `${skin.send.glow}`);
  root.style.setProperty('--skin-nav-radius', NAV_RADIUS[skin.navShape]);
  root.dataset.navShape = skin.navShape;
  root.style.setProperty('--skin-bg-image', dialogueBgUrl ? `url("${dialogueBgUrl}")` : 'none');
  root.style.setProperty('--skin-bg-opacity', `${skin.dialogueBgOpacity}`);
  root.style.setProperty('--gold', PALETTE.gold);
  root.style.setProperty('--pink', PALETTE.pink);
  root.style.setProperty('--deep', PALETTE.deep);
}

/** 给玩家/玩家自己的 AI 的皮肤包生成指令（一键复制） */
export const SKIN_AI_PROMPT = `你是资深 UI 设计师。请为视觉小说《星语剧场》生成一个界面皮肤包，只输出合法 JSON，不要解释、不要 Markdown 代码块。

字段规范（缺省字段会回退到官方默认值，所有颜色必须是 #RRGGBB）：
{
  "name": "皮肤名",
  "bubble": { "color": "#171B32", "opacity": 0.72, "blur": 14, "radius": 22 },
  "border": { "color": "#DCC39A", "width": 1, "style": "solid", "glow": 0.32 },
  "text": { "color": "#F7F3FA", "size": 17, "font": "\\"Noto Serif SC\\",serif", "lineHeight": 1.85 },
  "send": { "from": "#E7B5D5", "to": "#DCC39A", "glow": 0.55 },
  "navShape": "diamond",
  "dialogueBgOpacity": 0.16
}

要求：
1. bubble.opacity 0~1；blur 0~40；radius 0~40；border.width 0~6；border.style 取 solid / dashed / double / none。
2. navShape 取 diamond / circle / rounded。
3. 整体需保持深夜、克制、高级的沉浸感，文字与气泡对比度足够（正文颜色亮度 > 0.7）。
4. 风格主题：`;

export function skinFileName(skin: SkinConfig): string {
  const safe = skin.name.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24) || 'skin';
  return `starry-skin-${safe}.json`;
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
