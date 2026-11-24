import { DEFAULT_CUTOUT, greenKeyInPlace } from './cutout';

export interface VideoCutoutOptions {
  tolerance: number;
  fps: number;
  maxFrames: number;
  maxWidth: number;
}

export const DEFAULT_VIDEO_OPTS: VideoCutoutOptions = {
  tolerance: 32,
  fps: 12,
  maxFrames: 56,
  maxWidth: 640,
};

export interface PreparedVideo {
  frames: ImageBitmap[];
  width: number;
  height: number;
  duration: number;
}

const SEEK_TIMEOUT = 3500;

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    try {
      video.currentTime = time;
    } catch {
      done();
    }
    setTimeout(done, SEEK_TIMEOUT);
  });
}

/**
 * 绿幕视频转立绘：逐帧采样 + 本地键控，缓存成 ImageBitmap。
 * 不依赖视频原生倒放（各浏览器支持极差），用缓存帧实现丝滑 Ping-Pong 循环。
 */
export async function prepareGreenScreenVideo(
  url: string,
  opts: VideoCutoutOptions = DEFAULT_VIDEO_OPTS,
  onProgress?: (ratio: number) => void,
): Promise<PreparedVideo> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    const ok = (): void => resolve();
    video.addEventListener('loadeddata', ok, { once: true });
    video.addEventListener('error', () => reject(new Error('视频解码失败，请换用 MP4(H.264) 或 WebM')), {
      once: true,
    });
    setTimeout(ok, 6000);
  });

  const duration = Number.isFinite(video.duration) ? Math.min(video.duration, 12) : 6;
  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 1280;
  const scale = Math.min(1, opts.maxWidth / vw);
  const width = Math.max(2, Math.round(vw * scale));
  const height = Math.max(2, Math.round(vh * scale));
  const count = Math.max(4, Math.min(opts.maxFrames, Math.round(duration * opts.fps)));

  const work = document.createElement('canvas');
  work.width = width;
  work.height = height;
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  const frames: ImageBitmap[] = [];

  for (let i = 0; i < count; i += 1) {
    const t = (duration * i) / count;
    await seek(video, t);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(video, 0, 0, width, height);
    greenKeyInPlace(work, { ...DEFAULT_CUTOUT, tolerance: opts.tolerance });
    frames.push(await createImageBitmap(work));
    onProgress?.((i + 1) / count);
    // 让出主线程，避免大视频卡死界面
    await new Promise((r) => setTimeout(r, 0));
  }

  video.removeAttribute('src');
  video.load();
  return { frames, width, height, duration };
}

/** 在 canvas 上循环播放缓存帧，支持正放+倒放 Ping-Pong */
export class PingPongPlayer {
  private frame = 0;
  private dir = 1;
  private raf = 0;
  private last = 0;
  private prepared: PreparedVideo | null = null;
  private canvas: HTMLCanvasElement | null = null;

  attach(canvas: HTMLCanvasElement, prepared: PreparedVideo): void {
    this.stop();
    this.prepared = prepared;
    this.canvas = canvas;
    canvas.width = prepared.width;
    canvas.height = prepared.height;
    this.frame = 0;
    this.dir = 1;
    this.drawFrame();
  }

  start(pingPong: boolean): void {
    this.stop();
    if (!this.prepared) return;
    const fps = Math.min(30, Math.max(8, this.prepared.frames.length / Math.max(1, this.prepared.duration)));
    const interval = 1000 / fps;
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop);
      if (now - this.last < interval) return;
      this.last = now;
      const total = this.prepared!.frames.length;
      if (pingPong) {
        this.frame += this.dir;
        if (this.frame >= total - 1) {
          this.frame = total - 1;
          this.dir = -1;
        } else if (this.frame <= 0) {
          this.frame = 0;
          this.dir = 1;
        }
      } else {
        this.frame = (this.frame + 1) % total;
      }
      this.drawFrame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private drawFrame(): void {
    if (!this.prepared || !this.canvas) return;
    const bitmap = this.prepared.frames[this.frame];
    if (!bitmap) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(bitmap, 0, 0);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    if (this.prepared) for (const f of this.prepared.frames) f.close();
    this.prepared = null;
    this.canvas = null;
  }
}
