import type { ParticleMode } from '../types';

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  alpha: number;
}

/** 氛围粒子：细雨 / 暖光星尘 / 落雪。纯 Canvas，跟场景自动切换。 */
export class ParticleField {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private motes: Mote[] = [];
  private mode: ParticleMode = 'none';
  private enabled = true;
  private raf = 0;
  private last = 0;
  private width = 0;
  private height = 0;
  private resizeObserver: ResizeObserver | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.loop(performance.now());
  }

  setMode(mode: ParticleMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'none') {
      this.clearCanvas();
      this.motes = [];
      return;
    }
    this.seed();
  }

  private clearCanvas(): void {
    if (!this.canvas || !this.ctx) return;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clearCanvas();
  }

  private resize(): void {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx = this.canvas.getContext('2d');
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seed();
  }

  private seed(): void {
    const area = this.width * this.height;
    const base = this.mode === 'rain' ? Math.round(area / 12000) : Math.round(area / 16000);
    const count = Math.min(180, Math.max(24, base));
    this.motes = Array.from({ length: count }, () => this.spawn(true));
  }

  private spawn(anywhere = false): Mote {
    const m: Mote = {
      x: Math.random() * this.width,
      y: anywhere ? Math.random() * this.height : -12,
      vx: 0,
      vy: 0,
      size: 1,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.3 + Math.random() * 0.6,
    };
    if (this.mode === 'rain') {
      m.vx = -70 - Math.random() * 40;
      m.vy = 420 + Math.random() * 260;
      m.size = 6 + Math.random() * 12;
    } else if (this.mode === 'snow') {
      m.vx = -12 + Math.random() * 24;
      m.vy = 18 + Math.random() * 32;
      m.size = 1.2 + Math.random() * 2.4;
    } else {
      m.vx = -8 + Math.random() * 16;
      m.vy = -10 - Math.random() * 16;
      m.size = 0.9 + Math.random() * 2;
    }
    return m;
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const ctx = this.ctx;
    if (!ctx || !this.enabled || this.mode === 'none') return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.mode === 'rain') {
      ctx.lineCap = 'round';
      for (const m of this.motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y > this.height + 20 || m.x < -40) Object.assign(m, this.spawn());
        ctx.strokeStyle = `rgba(200, 220, 255, ${m.alpha * 0.34})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.size * 0.18, m.y + m.size);
        ctx.stroke();
      }
      return;
    }

    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.phase += dt * 1.4;
      if (this.mode === 'snow') {
        if (m.y > this.height + 10) Object.assign(m, this.spawn());
        ctx.fillStyle = `rgba(240, 245, 255, ${0.25 + 0.25 * Math.sin(m.phase) + m.alpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        if (m.y < -14) Object.assign(m, this.spawn());
        if (m.x < -14) m.x = this.width + 10;
        if (m.x > this.width + 14) m.x = -10;
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(m.phase));
        const gradient = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.size * 5);
        gradient.addColorStop(0, `rgba(240, 220, 250, ${0.5 * twinkle})`);
        gradient.addColorStop(0.4, `rgba(231, 181, 213, ${0.22 * twinkle})`);
        gradient.addColorStop(1, 'rgba(231, 181, 213, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 250, 240, ${0.75 * twinkle})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
  }
}
