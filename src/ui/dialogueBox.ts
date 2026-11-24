import { audio } from '../audio/audioEngine';
import { must } from './dom';

/**
 * 对话框：只保留铭牌、台词、右下角「继续 »」。
 * 流式吐字时用统一节奏揭示，玩家看到的是连续台词，不会因为网络抖动闪烁。
 */
export class DialogueBox {
  private textEl!: HTMLElement;
  private nameplate!: HTMLElement;
  private titleEl!: HTMLElement;
  private continueBtn!: HTMLButtonElement;
  private target = '';
  private shown = 0;
  private timer = 0;
  private speed = 38;
  private soundEvery = 3;
  private soundCount = 0;
  private onDone: (() => void) | null = null;

  init(): void {
    this.textEl = must('#dialogue-text');
    this.nameplate = must('#nameplate');
    this.titleEl = must('#char-title');
    this.continueBtn = must<HTMLButtonElement>('#continue-btn');
  }

  get continueButton(): HTMLButtonElement {
    return this.continueBtn;
  }

  get isRevealing(): boolean {
    return this.shown < this.target.length;
  }

  setSpeaker(name: string, title?: string): void {
    this.nameplate.textContent = name;
    this.titleEl.textContent = title ? `· ${title}` : '';
    this.nameplate.classList.remove('pulse');
    void this.nameplate.offsetWidth;
    this.nameplate.classList.add('pulse');
  }

  setSpeed(charsPerSecond: number): void {
    this.speed = Math.max(6, charsPerSecond);
  }

  /** 开始一段新台词 */
  play(text: string, options: { instant?: boolean; onDone?: () => void } = {}): void {
    this.stopTimer();
    this.target = text;
    this.shown = 0;
    this.onDone = options.onDone ?? null;
    this.textEl.textContent = '';
    this.textEl.classList.remove('is-streaming');
    if (options.instant) {
      this.shown = text.length;
      this.textEl.textContent = text;
      this.done();
      return;
    }
    this.tick();
  }

  /** 流式追加：只加长目标文本，揭示节奏不变 */
  append(text: string): void {
    if (!text) return;
    this.target += text;
    this.textEl.classList.add('is-streaming');
    if (!this.timer) this.tick();
  }

  private tick = (): void => {
    this.timer = 0;
    if (this.shown >= this.target.length) {
      if (!this.textEl.classList.contains('is-streaming')) this.done();
      return;
    }
    const step = Math.max(1, Math.round(this.speed / 60));
    this.shown = Math.min(this.target.length, this.shown + step);
    this.textEl.textContent = this.target.slice(0, this.shown);
    this.soundCount += step;
    if (this.soundCount >= this.soundEvery) {
      this.soundCount = 0;
      if (this.shown < this.target.length) audio.typewriter();
    }
    this.timer = window.setTimeout(this.tick, 1000 / 60);
  };

  /** 点击「继续」：先把当前台词显示完 */
  finish(): void {
    this.stopTimer();
    this.shown = this.target.length;
    this.textEl.textContent = this.target;
    this.done();
  }

  private done(): void {
    this.textEl.classList.remove('is-streaming');
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  endStream(): void {
    this.textEl.classList.remove('is-streaming');
    if (this.shown >= this.target.length) this.done();
  }

  private stopTimer(): void {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = 0;
  }

  clear(): void {
    this.stopTimer();
    this.target = '';
    this.shown = 0;
    this.textEl.textContent = '';
  }

  showContinue(visible: boolean): void {
    this.continueBtn.hidden = !visible;
  }
}

export const dialogueBox = new DialogueBox();
