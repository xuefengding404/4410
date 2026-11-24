import { DEFAULT_VIDEO_OPTS, PingPongPlayer, prepareGreenScreenVideo, type PreparedVideo } from '../graphics/greenScreenVideo';
import { ParticleField } from '../graphics/particles';
import { store } from '../app/store';
import { resolveSceneArt, resolveSpriteArt } from '../storage/assets';
import type { Character, SceneSlot, SpriteSlot } from '../types';
import { h, must } from './dom';
import { setBusy, toast } from './modal';

export class Stage {
  private bgLayer!: HTMLElement;
  private spriteLayer!: HTMLElement;
  private stageEl!: HTMLElement;
  private particles = new ParticleField();
  private player: PingPongPlayer | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private spriteToken = 0;
  private currentBgUrl = '';
  private preparedCache = new Map<string, PreparedVideo>();

  init(): void {
    this.bgLayer = must('#bg-layer');
    this.spriteLayer = must('#sprite-layer');
    this.stageEl = must('#stage');
    this.particles.attach(must<HTMLCanvasElement>('#particle-canvas'));
    this.particles.setEnabled(store.settings.display.particlesEnabled);
  }

  async renderCharacter(character: Character, animate = true): Promise<void> {
    const scene = character.scenes.find((s) => s.id === character.currentSceneId) ?? character.scenes[0];
    if (scene) await this.showScene(scene, animate);
    const sprite = character.sprites.find((s) => s.id === character.currentSpriteId) ?? character.sprites[0];
    if (sprite) await this.showSprite(sprite);
    else this.clearSprite();
  }

  async showScene(scene: SceneSlot, animate = true): Promise<void> {
    const preferGradient = Boolean(scene.gradient && !scene.assetId && !scene.builtinPath);
    let art = preferGradient
      ? { url: `gradient:${scene.gradient}`, isVideo: false, isPlaceholder: false }
      : await resolveSceneArt(scene);
    let gradient = preferGradient ? scene.gradient : undefined;
    // 图片缺失时用渐变兜底，而不是弹出一张「请放背景图」的占位卡
    if (!preferGradient && art.isPlaceholder && scene.gradient) {
      gradient = scene.gradient;
      art = { url: `gradient:${scene.gradient}`, isVideo: false, isPlaceholder: false };
    }
    if (art.url === this.currentBgUrl) {
      this.particles.setMode(store.settings.display.particlesEnabled ? scene.particles : 'none');
      return;
    }
    this.currentBgUrl = art.url;
    this.bgLayer.classList.remove('is-empty');
    const slide = h('div', { class: 'bg-slide' });
    if (gradient) {
      slide.style.backgroundImage = 'none';
      slide.style.background = gradient;
    } else {
      slide.style.backgroundImage = `url("${art.url}")`;
    }
    slide.style.filter = `brightness(${scene.brightness})`;
    if (animate) {
      slide.classList.add('fade-in');
      this.bgLayer.append(slide);
      setTimeout(() => {
        while (this.bgLayer.children.length > 1) this.bgLayer.firstElementChild?.remove();
      }, 1000);
    } else {
      this.bgLayer.replaceChildren(slide);
    }
    this.particles.setMode(store.settings.display.particlesEnabled ? scene.particles : 'none');
  }

  clearSprite(): void {
    this.spriteToken += 1;
    this.teardownVideo();
    this.spriteLayer.replaceChildren();
  }

  private teardownVideo(): void {
    this.player?.stop();
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoEl = null;
    }
  }

  async showSprite(slot: SpriteSlot): Promise<void> {
    const token = ++this.spriteToken;
    this.teardownVideo();
    this.player = null;
    const art = await resolveSpriteArt(slot);
    if (token !== this.spriteToken) return;

    const wrap = h('div', { class: `sprite-figure display-${slot.display}` });
    wrap.style.setProperty('--sprite-scale', String(slot.scale * store.settings.display.spriteScale));
    wrap.style.setProperty('--sprite-x', `${slot.offsetX}px`);
    wrap.style.setProperty('--sprite-y', `${slot.offsetY}px`);

    let media: HTMLElement;

    if (art.isVideo) {
      if (slot.cutout === 'green') {
        const cacheKey = `${slot.assetId ?? slot.id}`;
        let prepared = this.preparedCache.get(cacheKey);
        if (!prepared) {
          setBusy('正在为视频立绘抠除绿幕…');
          try {
            prepared = await prepareGreenScreenVideo(art.url, {
              ...DEFAULT_VIDEO_OPTS,
              tolerance: 32,
            });
            this.preparedCache.set(cacheKey, prepared);
          } catch (err) {
            toast(err instanceof Error ? err.message : '视频抠图失败', 'error');
          } finally {
            setBusy(null);
          }
        }
        if (token !== this.spriteToken) return;
        if (prepared) {
          const canvas = h('canvas', { class: 'sprite-media sprite-canvas' });
          this.player = new PingPongPlayer();
          this.player.attach(canvas, prepared);
          this.player.start(slot.pingPong);
          media = canvas;
        } else {
          const img = h('img', { class: 'sprite-media', src: art.url, alt: slot.name });
          media = img;
        }
      } else {
        const video = h('video', {
          class: 'sprite-media sprite-video',
          src: art.url,
          autoplay: true,
          loop: true,
          muted: true,
          playsinline: true,
        });
        this.videoEl = video;
        void video.play().catch(() => undefined);
        media = video;
      }
    } else {
      media = h('img', { class: 'sprite-media', src: art.url, alt: slot.name, draggable: false });
    }

    if (slot.display === 'tarot') {
      const frame = h('div', { class: 'tarot-frame' }, media, h('span', { class: 'tarot-star tl' }, '✦'), h('span', { class: 'tarot-star tr' }, '✦'), h('span', { class: 'tarot-star bl' }, '✦'), h('span', { class: 'tarot-star br' }, '✦'));
      wrap.append(frame);
    } else {
      wrap.append(media);
    }
    if (slot.display === 'blend') wrap.classList.add('blend-mask');

    this.spriteLayer.replaceChildren(wrap);
    if (art.isPlaceholder) wrap.classList.add('is-placeholder');
    requestAnimationFrame(() => wrap.classList.add('sprite-enter'));
  }

  playFx(kind: 'zoom' | 'shake' | 'blush'): void {
    const cls = `fx-${kind}`;
    if (kind === 'blush') {
      const blush = must('#blush-layer');
      blush.classList.remove('active');
      void blush.offsetWidth;
      blush.classList.add('active');
      setTimeout(() => blush.classList.remove('active'), 1800);
      return;
    }
    this.stageEl.classList.remove(cls);
    void this.stageEl.offsetWidth;
    this.stageEl.classList.add(cls);
    setTimeout(() => this.stageEl.classList.remove(cls), kind === 'shake' ? 520 : 1700);
  }

  setParticlesEnabled(enabled: boolean): void {
    this.particles.setEnabled(enabled);
    if (!enabled) this.particles.setMode('none');
  }

  shakeBond(): void {
    const badge = document.getElementById('bond-badge');
    if (!badge) return;
    badge.classList.remove('pulse');
    void badge.offsetWidth;
    badge.classList.add('pulse');
    setTimeout(() => badge.classList.remove('pulse'), 1200);
  }
}

export const stage = new Stage();
