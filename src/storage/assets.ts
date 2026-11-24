import { db } from './db';
import { ellaSvg, isEllaLabel } from '../graphics/ellaArt';
import type { SceneSlot, SpriteSlot } from '../types';

const urlCache = new Map<string, string>();

export function builtinUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base}${path.replace(/^\.?\//, '')}`;
}

export async function assetUrl(assetId?: string): Promise<string | undefined> {
  if (!assetId) return undefined;
  const hit = urlCache.get(assetId);
  if (hit) return hit;
  const record = await db.getAsset(assetId);
  if (!record) return undefined;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(assetId, url);
  return url;
}

export function forgetAssetUrl(assetId: string): void {
  const url = urlCache.get(assetId);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(assetId);
}

export function isVideoAsset(assetId?: string): boolean {
  return Boolean(assetId && urlCache.has(`${assetId}#video`));
}

export function markVideo(assetId: string): void {
  urlCache.set(`${assetId}#video`, '1');
}

/** 背景占位图：深夜星海 + 月晕 */
export function backgroundPlaceholder(name: string, hue = 232): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <radialGradient id="neb" cx="68%" cy="24%" r="72%">
      <stop offset="0%" stop-color="hsl(${hue} 62% 42%)" stop-opacity="0.55"/>
      <stop offset="52%" stop-color="hsl(${hue - 14} 48% 22%)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0B1022" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#070A18"/>
      <stop offset="55%" stop-color="#0B1022"/>
      <stop offset="100%" stop-color="#171330"/>
    </linearGradient>
    <radialGradient id="moon" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF7E6" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="#DCC39A" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#DCC39A" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <rect width="1600" height="900" fill="url(#neb)"/>
  <circle cx="1150" cy="200" r="220" fill="url(#moon)" filter="url(#blur)"/>
  <circle cx="1150" cy="200" r="54" fill="#F7F3FA" opacity="0.9"/>
  <g fill="#F7F3FA">
    <circle cx="180" cy="140" r="1.8" opacity=".8"/><circle cx="320" cy="90" r="1.2" opacity=".6"/>
    <circle cx="470" cy="210" r="2.2" opacity=".75"/><circle cx="640" cy="120" r="1.4" opacity=".5"/>
    <circle cx="820" cy="260" r="1.8" opacity=".7"/><circle cx="980" cy="90" r="1.2" opacity=".55"/>
    <circle cx="1320" cy="330" r="2" opacity=".65"/><circle cx="1450" cy="180" r="1.4" opacity=".5"/>
    <circle cx="240" cy="330" r="1.2" opacity=".5"/><circle cx="760" cy="380" r="1.6" opacity=".45"/>
    <circle cx="1050" cy="420" r="1.2" opacity=".4"/><circle cx="1380" cy="460" r="1.8" opacity=".45"/>
  </g>
  <g stroke="#DCC39A" stroke-opacity="0.5" fill="none">
    <path d="M360 560 h120" stroke-width="1"/><path d="M1260 620 h90" stroke-width="1"/>
  </g>
  <text x="800" y="470" fill="#F7F3FA" fill-opacity="0.82" font-family="Noto Serif SC, Songti SC, serif" font-size="46" text-anchor="middle" letter-spacing="10">${escapeXml(name)}</text>
  <text x="800" y="516" fill="#B8B6CD" fill-opacity="0.7" font-family="Noto Sans SC, sans-serif" font-size="16" text-anchor="middle" letter-spacing="4">为这张场景放入你的背景图</text>
</svg>`;
  return svgDataUrl(svg);
}

/** 立绘占位图：柔和人物剪影 + 星星，透明底 */
export function spritePlaceholder(name: string, hue = 320): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="1080" viewBox="0 0 760 1080">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 55% 78%)" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="hsl(${hue + 24} 45% 58%)" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#241C3D" stop-opacity="0.9"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="#E7B5D5" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#E7B5D5" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <ellipse cx="380" cy="420" rx="290" ry="330" fill="url(#halo)"/>
  <g filter="url(#soft)" opacity="0.9">
    <ellipse cx="380" cy="350" rx="140" ry="165" fill="url(#body)"/>
    <path d="M380 500 C 220 520 150 690 140 900 L 150 1080 L 610 1080 L 620 900 C 610 690 540 520 380 500 Z" fill="url(#body)"/>
  </g>
  <g fill="#F7F3FA" opacity="0.85">
    <circle cx="300" cy="330" r="7"/><circle cx="460" cy="330" r="7"/>
  </g>
  <g stroke="#DCC39A" stroke-width="2" opacity="0.7" fill="none">
    <path d="M340 405 q40 26 80 0"/>
  </g>
  <g fill="#FFF7E6" opacity="0.9">
    <path d="M600 180 l6 18 l18 6 l-18 6 l-6 18 l-6 -18 l-18 -6 l18 -6 Z"/>
    <path d="M170 260 l4 12 l12 4 l-12 4 l-4 12 l-4 -12 l-12 -4 l12 -4 Z" opacity="0.7"/>
  </g>
  <text x="380" y="1012" fill="#F7F3FA" fill-opacity="0.85" font-family="Noto Serif SC, Songti SC, serif" font-size="34" text-anchor="middle" letter-spacing="6">${escapeXml(name)}</text>
</svg>`;
  return svgDataUrl(svg);
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

export function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 2);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export interface ResolvedArt {
  url: string;
  isVideo: boolean;
  isPlaceholder: boolean;
}

/** 立绘资源解析：数据库素材 → 官方内置路径 → SVG 占位 */
export async function resolveSpriteArt(slot: SpriteSlot): Promise<ResolvedArt> {
  const fromDb = await assetUrl(slot.assetId);
  if (fromDb) return { url: fromDb, isVideo: slot.kind === 'video', isPlaceholder: false };
  if (slot.builtinPath) {
    const url = builtinUrl(slot.builtinPath);
    if (await probeImage(url)) return { url, isVideo: false, isPlaceholder: false };
  }
  if (isEllaLabel(slot.name)) {
    return { url: ellaSvg(slot.name), isVideo: false, isPlaceholder: false };
  }
  return { url: spritePlaceholder(slot.name), isVideo: false, isPlaceholder: true };
}

export async function resolveSceneArt(scene: SceneSlot): Promise<ResolvedArt> {
  const fromDb = await assetUrl(scene.assetId);
  if (fromDb) return { url: fromDb, isVideo: false, isPlaceholder: false };
  if (scene.builtinPath) {
    const url = builtinUrl(scene.builtinPath);
    if (await probeImage(url)) return { url, isVideo: false, isPlaceholder: false };
  }
  const hue = 214 + (hashHue(scene.name) % 40);
  return { url: backgroundPlaceholder(scene.name, hue), isVideo: false, isPlaceholder: true };
}

function hashHue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function hueFor(text: string): number {
  return hashHue(text) % 360;
}
