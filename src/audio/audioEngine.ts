import type { ParticleMode, VolumeSettings } from '../types';

/**
 * 纯本地音效引擎（Web Audio 合成，零外部音频文件）。
 * 三路独立总线：音效 / 环境音 / 配音，全部由设置面板控制。
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private ambientStop: (() => void) | null = null;
  private clickAt = 0;
  private currentAmbient: ParticleMode = 'none';
  private currentAudio: HTMLAudioElement | null = null;
  private volumes: VolumeSettings = { sfx: 0.5, ambient: 0.4, voice: 0.9 };

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** 移动端首次触摸时调用，解锁 AudioContext */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.ambientBus = this.ctx.createGain();
      this.voiceBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ambientBus.connect(this.master);
      this.voiceBus.connect(this.master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.currentAmbient !== 'none' && !this.ambientStop) this.playAmbient(this.currentAmbient);
  }

  setVolumes(volumes: VolumeSettings): void {
    this.volumes = { ...volumes };
    this.applyVolumes();
  }

  get voiceVolume(): number {
    return this.volumes.voice;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.sfxBus?.gain.setTargetAtTime(this.volumes.sfx, now, 0.08);
    this.ambientBus?.gain.setTargetAtTime(this.volumes.ambient * 0.7, now, 0.2);
    this.voiceBus?.gain.setTargetAtTime(this.volumes.voice, now, 0.05);
  }

  private noiseBuffer(seconds = 4): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = 0.96 * last + 0.04 * white;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  /** 打字机音效：极短的滤波噪声，像笔尖擦过纸面 */
  typewriter(): void {
    if (!this.ctx || !this.sfxBus || this.volumes.sfx <= 0.001) return;
    const now = this.ctx.currentTime;
    if (now - this.clickAt < 0.028) return;
    this.clickAt = now;
    const buffer = this.noiseBuffer(0.04);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600 + Math.random() * 900;
    filter.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12 + Math.random() * 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(now);
    src.stop(now + 0.05);
  }

  /** 星芒提示音（记忆写入 / 羁绊升级） */
  chime(kind: 'memory' | 'bond' = 'memory'): void {
    if (!this.ctx || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const base = kind === 'bond' ? 523.25 : 659.25;
    [1, 1.5, 2].forEach((ratio, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      gain.gain.setValueAtTime(0, now + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.06 / (i + 1), now + i * 0.07 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.9);
      osc.connect(gain).connect(this.sfxBus!);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 1);
    });
  }

  playAmbient(mode: ParticleMode): void {
    this.currentAmbient = mode;
    this.stopAmbient();
    if (!this.ctx || !this.ambientBus || mode === 'none') return;
    const ctx = this.ctx;
    const buffer = this.noiseBuffer(6);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const nodes: AudioNode[] = [src, filter, gain];

    if (mode === 'rain') {
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 320;
      src.connect(hp).connect(filter).connect(gain).connect(this.ambientBus);
      nodes.push(hp);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.6);
    } else if (mode === 'stardust') {
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      src.connect(filter).connect(gain).connect(this.ambientBus);
      gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 2);
      const pad = ctx.createOscillator();
      pad.type = 'sine';
      pad.frequency.value = 196;
      const padGain = ctx.createGain();
      padGain.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain).connect(padGain.gain);
      pad.connect(padGain).connect(this.ambientBus);
      pad.start();
      lfo.start();
      nodes.push(pad, padGain, lfo, lfoGain);
    } else {
      filter.type = 'bandpass';
      filter.frequency.value = 520;
      filter.Q.value = 0.6;
      src.connect(filter).connect(gain).connect(this.ambientBus);
      gain.gain.linearRampToValueAtTime(0.34, ctx.currentTime + 2.4);
    }

    src.start();
    this.ambientNodes = nodes;
    this.ambientStop = () => {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
        setTimeout(() => {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
        }, 900);
      } catch {
        /* ignore */
      }
    };
  }

  private stopAmbient(): void {
    this.ambientStop?.();
    this.ambientStop = null;
    this.ambientNodes = [];
  }

  /** 播放一段配音 Blob / URL，返回播放结束 Promise */
  async playVoiceUrl(url: string): Promise<void> {
    await this.unlock();
    this.stopVoice();
    const audio = new Audio(url);
    this.currentAudio = audio;
    audio.volume = Math.min(1, Math.max(0, this.volumes.voice));
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
      setTimeout(done, 120000);
    });
    if (this.currentAudio === audio) this.currentAudio = null;
    URL.revokeObjectURL(url);
  }

  stopVoice(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
      } catch {
        /* ignore */
      }
      this.currentAudio = null;
    }
  }
}

export const audio = new AudioEngine();
