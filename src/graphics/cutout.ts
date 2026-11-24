/**
 * 抠图工厂：原图直传 / 智能白底三阶段 / 静态绿幕 / 本地 AI 语义抠图 / 魔棒精修。
 * 全部在浏览器本地完成，图片不会离开这台设备。
 */
import type { CutoutMode } from '../types';

export interface CutoutOptions {
  /** 0-100，越大保留越多边缘 */
  tolerance: number;
  /** 边缘收缩像素 */
  shrink: number;
}

export const DEFAULT_CUTOUT: CutoutOptions = { tolerance: 32, shrink: 1 };

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

export function imageToCanvas(img: HTMLImageElement | ImageBitmap, maxSize = 1500): HTMLCanvasElement {
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  out.getContext('2d', { willReadFrequently: true })!.drawImage(src, 0, 0);
  return out;
}

interface WhiteOptions {
  threshold: number;
  tolerance: number;
}

/** 自动判断这张图更适合白底还是绿幕抠图（小白上传时自动兜底） */
export function detectKeyMode(canvas: HTMLCanvasElement): 'white' | 'green' | 'none' {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'none';
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let white = 0;
  let green = 0;
  let total = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 120));
  const sample = (x: number, y: number): void => {
    const p = (y * w + x) * 4;
    if (data[p + 3] < 8) return;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    total += 1;
    if (r > 232 && g > 232 && b > 232 && Math.max(r, g, b) - Math.min(r, g, b) < 22) white += 1;
    if (g - Math.max(r, b) > 36 && g > 90) green += 1;
  };
  for (let x = 0; x < w; x += step) {
    sample(x, 1);
    sample(x, h - 2);
  }
  for (let y = 0; y < h; y += step) {
    sample(1, y);
    sample(w - 2, y);
  }
  if (total === 0) return 'none';
  if (white / total > 0.55) return 'white';
  if (green / total > 0.35) return 'green';
  return 'none';
}

/** 三阶段智能白底抠图 */
export function cutoutWhite(input: HTMLCanvasElement, opts: CutoutOptions = DEFAULT_CUTOUT): HTMLCanvasElement {
  const canvas = cloneCanvas(input);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const total = w * h;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  let sp = 0;

  const whiteThreshold = 236 - Math.round(opts.tolerance * 0.55);
  const isWhite = (i: number): boolean => {
    const p = i * 4;
    if (data[p + 3] < 8) return true;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    return r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold && Math.max(r, g, b) - Math.min(r, g, b) <= 26;
  };

  // 阶段一：从四边泛洪，去掉外部白底
  for (let x = 0; x < w; x += 1) {
    stack[sp++] = x;
    stack[sp++] = (h - 1) * w + x;
  }
  for (let y = 0; y < h; y += 1) {
    stack[sp++] = y * w;
    stack[sp++] = y * w + (w - 1);
  }
  while (sp > 0) {
    const idx = stack[--sp];
    if (idx < 0 || idx >= total || visited[idx]) continue;
    visited[idx] = 1;
    if (!isWhite(idx)) continue;
    data[idx * 4 + 3] = 0;
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) stack[sp++] = idx - 1;
    if (x < w - 1) stack[sp++] = idx + 1;
    if (y > 0) stack[sp++] = idx - w;
    if (y < h - 1) stack[sp++] = idx + w;
  }

  // 阶段二：清理被主体包住的白洞（只清除贴着透明区域的小白块，避免误伤白衣服）
  const seen = new Uint8Array(total);
  const maxHole = Math.floor(total * 0.06);
  let guard = 0;
  for (let start = 0; start < total && guard < 8000; start += 1) {
    if (seen[start] || data[start * 4 + 3] === 0 || !isWhite(start)) continue;
    guard += 1;
    const region: number[] = [];
    let touchTransparent = false;
    let s2 = 0;
    stack[s2++] = start;
    seen[start] = 1;
    while (s2 > 0) {
      const idx = stack[--s2];
      region.push(idx);
      if (region.length > maxHole) {
        touchTransparent = false;
        break;
      }
      const x = idx % w;
      const y = (idx / w) | 0;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const n of neighbors) {
        if (n < 0) continue;
        if (data[n * 4 + 3] === 0) touchTransparent = true;
        if (!seen[n] && data[n * 4 + 3] !== 0 && isWhite(n)) {
          seen[n] = 1;
          stack[s2++] = n;
        }
      }
    }
    if (touchTransparent && region.length <= maxHole) {
      for (const idx of region) data[idx * 4 + 3] = 0;
    }
  }

  // 阶段三：边缘收缩 + 去白边（暗化半透明描边）
  const alphaCopy = new Uint8ClampedArray(total);
  for (let i = 0; i < total; i += 1) alphaCopy[i] = data[i * 4 + 3];
  const shrink = Math.max(0, Math.min(3, Math.round(opts.shrink)));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (alphaCopy[i] === 0) continue;
      let edge = false;
      for (let d = 1; d <= shrink && !edge; d += 1) {
        if (x - d >= 0 && alphaCopy[i - d] === 0) edge = true;
        if (x + d < w && alphaCopy[i + d] === 0) edge = true;
        if (y - d >= 0 && alphaCopy[i - d * w] === 0) edge = true;
        if (y + d < h && alphaCopy[i + d * w] === 0) edge = true;
      }
      if (!edge) continue;
      const p = i * 4;
      data[p] = Math.round(data[p] * 0.9);
      data[p + 1] = Math.round(data[p + 1] * 0.9);
      data[p + 2] = Math.round(data[p + 2] * 0.9);
      data[p + 3] = Math.round(data[p + 3] * 0.62);
    }
  }

  ctx.putImageData(img, 0, 0);
  return cropToContent(canvas);
}

function sampleCornerColor(data: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const points = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of points) {
    const p = (y * w + x) * 4;
    r += data[p];
    g += data[p + 1];
    b += data[p + 2];
  }
  return [r / 4, g / 4, b / 4];
}

/** 静态绿幕抠图：自动采样四角键色，带溢色抑制 */
export function cutoutGreen(input: HTMLCanvasElement, opts: CutoutOptions = DEFAULT_CUTOUT): HTMLCanvasElement {
  const canvas = cloneCanvas(input);
  greenKeyInPlace(canvas, opts);
  return cropToContent(canvas);
}

/** 原地绿幕键控（不裁剪，供视频逐帧使用，保证画面对齐） */
export function greenKeyInPlace(canvas: HTMLCanvasElement, opts: CutoutOptions = DEFAULT_CUTOUT): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const [kr, kg, kb] = sampleCornerColor(data, canvas.width, canvas.height);
  const tol = 40 + opts.tolerance * 1.7;
  const feather = 26;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2);
    // 绿色主导度：只有明显偏绿的像素才参与抠除，保护肤色
    const greenDominance = g - Math.max(r, b);
    if (dist < tol && greenDominance > 8) {
      data[i + 3] = 0;
    } else if (dist < tol + feather && greenDominance > 0) {
      const t = (dist - tol) / feather;
      data[i + 3] = Math.round(data[i + 3] * Math.max(0, Math.min(1, t)));
      // 溢色抑制：压掉边缘的绿色反射
      data[i + 1] = Math.round(g * 0.82 + Math.max(r, b) * 0.18);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** 本地 AI 语义抠图：@imgly/background-removal，失败时优雅降级 */
export async function cutoutAi(input: HTMLCanvasElement): Promise<{ canvas: HTMLCanvasElement; degraded: boolean }> {
  try {
    const mod = await import('@imgly/background-removal');
    const blob = await canvasToBlob(input, 'image/png');
    const result = await mod.removeBackground(blob, { output: { format: 'image/png' } });
    const img = await loadImage(URL.createObjectURL(result));
    const canvas = imageToCanvas(img, 1500);
    return { canvas: cropToContent(canvas), degraded: false };
  } catch (err) {
    console.warn('[starry] AI 抠图失败，降级为绿幕/白底算法', err);
    return { canvas: cutoutGreen(cutoutWhite(input)), degraded: true };
  }
}

export async function runCutout(
  source: HTMLCanvasElement,
  mode: CutoutMode,
  opts: CutoutOptions = DEFAULT_CUTOUT,
): Promise<{ canvas: HTMLCanvasElement; degraded: boolean }> {
  switch (mode) {
    case 'white':
      return { canvas: cutoutWhite(source, opts), degraded: false };
    case 'green':
      return { canvas: cutoutGreen(source, opts), degraded: false };
    case 'ai':
      return cutoutAi(source);
    default:
      return { canvas: cropToContent(source), degraded: false };
  }
}

/** 裁掉四周透明留白，让立绘贴底更自然 */
export function cropToContent(input: HTMLCanvasElement, padding = 4): HTMLCanvasElement {
  const ctx = input.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = input;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return input;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(w - 1, maxX + padding);
  maxY = Math.min(h - 1, maxY + padding);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(input, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('导出图片失败'))), type, quality);
  });
}

/**
 * 魔棒点选精修：从点击点泛洪移除相近颜色。
 * 每次操作前由调用方压入 undo 栈。
 */
export function magicWand(canvas: HTMLCanvasElement, x: number, y: number, tolerance: number): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const sx = Math.max(0, Math.min(w - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(y)));
  const start = sy * w + sx;
  const si = start * 4;
  const sr = data[si];
  const sg = data[si + 1];
  const sb = data[si + 2];
  const sa = data[si + 3];
  if (sa === 0) return 0;
  const tol = Math.max(2, tolerance);
  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  stack[sp++] = start;
  let removed = 0;
  while (sp > 0) {
    const idx = stack[--sp];
    if (visited[idx]) continue;
    visited[idx] = 1;
    const p = idx * 4;
    if (data[p + 3] === 0) continue;
    const dist = Math.sqrt((data[p] - sr) ** 2 + (data[p + 1] - sg) ** 2 + (data[p + 2] - sb) ** 2);
    if (dist > tol) continue;
    data[p + 3] = 0;
    removed += 1;
    const cx = idx % w;
    const cy = (idx / w) | 0;
    if (cx > 0) stack[sp++] = idx - 1;
    if (cx < w - 1) stack[sp++] = idx + 1;
    if (cy > 0) stack[sp++] = idx - w;
    if (cy < h - 1) stack[sp++] = idx + w;
  }
  ctx.putImageData(img, 0, 0);
  return removed;
}
