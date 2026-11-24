import './style.css';
import { audio } from './audio/audioEngine';
import { store } from './app/store';
import { parseFull } from './core/tagParser';
import { applySkin } from './core/skin';
import { engine } from './core/dialogueEngine';
import { bondInfo } from './types';
import { assetUrl } from './storage/assets';
import { must } from './ui/dom';
import { dialogueBox } from './ui/dialogueBox';
import { stage } from './ui/stage';
import { openApiPanel } from './ui/panels/apiPanel';
import { openCharacterPanel } from './ui/panels/characterPanel';
import { openMemoryPanel } from './ui/panels/memoryPanel';
import { openSettingsPanel } from './ui/panels/settingsPanel';
import { openModal, toast } from './ui/modal';
import { loadVoicePack, playFixedVoice, stopFixedVoice, unlockFixedVoice, voicePackSize } from './core/voicePack';

let autoAdvanceTimer = 0;

interface OnboardingStep {
  sprite: string;
  scene: string;
  text: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    sprite: '常态微笑',
    scene: '雨夜咖啡馆',
    text: '欢迎来到这里。\n我是你的时空管家，艾拉。\n窗外的雨声刚刚好，先歇一歇吧——点击对话框继续。',
  },
  {
    sprite: '开心眨眼',
    scene: '雨夜咖啡馆',
    text: '你可以点右上角的「角色工坊」，导入酒馆角色卡、自由命名你的立绘与场景；\n也可以在「API 设置」里填上你的 DeepSeek 钥匙，随时唤醒你想见的那个人。',
  },
  {
    sprite: '害羞脸红',
    scene: '雨夜咖啡馆',
    text: '现在已经开启了离线体验模式，你可以直接在下方输入任何话和我聊天，\n试着对我说「喜欢你」「记住我怕黑」或者「去午后阳光卧室」看看吧。',
  },
];

let onboarding = false;
let onboardingIndex = 0;

function showBootError(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
  let el = document.getElementById('boot-error');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'boot-error';
    el.className = 'boot-error';
    document.body.append(el);
  }
  el.textContent = `${el.textContent ? `${el.textContent}\n\n` : ''}${message}`;
}

window.addEventListener('error', (event) => showBootError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showBootError(event.reason));

async function boot(): Promise<void> {
  await store.init();
  await loadVoicePack();
  await applyStoredSkin();
  stage.init();
  dialogueBox.init();
  audio.setVolumes(store.settings.volumes);
  dialogueBox.setSpeed(store.settings.display.typeSpeed);

  bindHud();
  bindInput();
  bindKeyboard();
  bindMobileAudioUnlock();

  updateBond();
  await renderCurrentCharacter();
  replayLastLine();

  store.on('character', () => updateBond());
  store.on('switch', () => {
    void renderCurrentCharacter().then(() => replayLastLine(true));
  });

  engine.setEvents({
    onBusyChange: (busy) => {
      const send = must<HTMLButtonElement>('#send-btn');
      send.disabled = busy;
      send.classList.toggle('is-busy', busy);
      if (busy) dialogueBox.showContinue(false);
    },
    onReplyDone: () => {
      scheduleAutoAdvance();
    },
  });

  window.addEventListener('starry:refresh-dialogue', () => {
    replayLastLine(true);
  });
  window.addEventListener('starry:restore', () => {
    void renderCurrentCharacter().then(() => {
      updateBond();
      replayLastLine(true);
    });
  });
  window.addEventListener('starry:particles', (event) => {
    stage.setParticlesEnabled(Boolean((event as CustomEvent).detail));
  });

  registerServiceWorker();
  startOnboarding();

  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as Record<string, unknown>).__starry = {
    store,
    engine,
    stage,
    dialogueBox,
    voice: { size: voicePackSize, play: playFixedVoice },
  };
  }
}

async function applyStoredSkin(): Promise<void> {
  const bgId = store.settings.skin.dialogueBgAssetId;
  const bgUrl = bgId ? await assetUrl(bgId) : undefined;
  applySkin(store.settings.skin, bgUrl);
}

async function renderCurrentCharacter(): Promise<void> {
  const character = store.character;
  if (!character) return;
  await stage.renderCharacter(character, false);
  dialogueBox.setSpeaker(character.name, character.title);
  updateBond();
}

function replayLastLine(force = false): void {
  const character = store.character;
  if (!character) return;
  const last = [...character.messages].reverse().find((m) => m.role === 'assistant');
  if (!last) {
    dialogueBox.clear();
    return;
  }
  const parsed = parseFull(last.content);
  dialogueBox.setSpeaker(character.name, character.title);
  stopFixedVoice();
  dialogueBox.play(parsed.text || '……', { instant: !force });
  playFixedVoice(parsed.text || '……');
  dialogueBox.showContinue(true);
  scheduleAutoAdvance();
}

function updateBond(): void {
  const character = store.character;
  if (!character) return;
  const info = bondInfo(character.bondXp);
  const level = document.getElementById('bond-level');
  const title = document.getElementById('bond-title');
  const value = document.getElementById('bond-value');
  const fill = document.getElementById('bond-fill') as HTMLElement | null;
  if (level) level.textContent = `Lv.${info.level}`;
  if (title) title.textContent = `羁绊·${info.name}`;
  if (value) value.textContent = `${character.bondXp} / ${info.next ?? character.bondXp}`;
  if (fill) fill.style.width = `${Math.round(info.progress * 100)}%`;
}

function bindHud(): void {
  document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      if (panel === 'characters') openCharacterPanel();
      else if (panel === 'memories') openMemoryPanel();
      else if (panel === 'api') openApiPanel();
      else if (panel === 'settings') openSettingsPanel();
    });
  });
  must('#bond-badge').addEventListener('click', () => openMemoryPanel());
}

function bindInput(): void {
  const input = must<HTMLInputElement>('#chat-input');
  const send = must<HTMLButtonElement>('#send-btn');
  const submit = (): void => {
    if (engine.busy) return;
    const text = input.value.trim();
    if (!text) return;
    if (onboarding) finishOnboarding();
    input.value = '';
    void engine.send(text);
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  must('#continue-btn').addEventListener('click', () => {
    if (onboarding) {
      advanceOnboarding();
      return;
    }
    if (dialogueBox.isRevealing) {
      dialogueBox.finish();
      return;
    }
    if (engine.busy) return;
    window.clearTimeout(autoAdvanceTimer);
    void engine.continueScene();
  });
}

function bindKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const root = document.getElementById('modal-root');
      if (root && !root.hidden) return;
    }
    if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      const modalRoot = document.getElementById('modal-root');
      if (modalRoot && !modalRoot.hidden) return;
      e.preventDefault();
      const btn = document.getElementById('continue-btn') as HTMLButtonElement | null;
      if (btn && dialogueBox.isRevealing) dialogueBox.finish();
      else if (btn) btn.click();
    }
  });
}

function bindMobileAudioUnlock(): void {
  const unlock = (): void => {
    void audio.unlock();
    unlockFixedVoice();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function scheduleAutoAdvance(): void {
  window.clearTimeout(autoAdvanceTimer);
  if (onboarding) return;
  if (!store.settings.display.autoAdvance) return;
  if (engine.busy) return;
  const delay = store.settings.display.autoDelay;
  autoAdvanceTimer = window.setTimeout(() => {
    if (engine.busy) return;
    void engine.continueScene();
  }, delay + 1200);
}

function startOnboarding(): void {
  if (store.settings.onboarded) return;
  if (new URLSearchParams(location.search).has('nofirst')) {
    store.settings.onboarded = true;
    void store.saveSettings();
    return;
  }
  onboarding = true;
  onboardingIndex = 0;
  playOnboardingStep(0);
}

function playOnboardingStep(index: number): void {
  const step = ONBOARDING_STEPS[index];
  if (!step) {
    finishOnboarding();
    return;
  }
  const character = store.character;
  const sprite = character.sprites.find((s) => s.name === step.sprite);
  const scene = character.scenes.find((s) => s.name === step.scene);
  if (sprite) {
    character.currentSpriteId = sprite.id;
    void stage.showSprite(sprite);
  }
  if (scene) {
    character.currentSceneId = scene.id;
    void stage.showScene(scene);
  }
  dialogueBox.setSpeaker(character.name, character.title);
  stopFixedVoice();
  dialogueBox.play(step.text);
  playFixedVoice(step.text);
  dialogueBox.showContinue(true);
}

function advanceOnboarding(): void {
  if (!onboarding) return;
  if (onboardingIndex + 1 < ONBOARDING_STEPS.length) {
    onboardingIndex += 1;
    playOnboardingStep(onboardingIndex);
  } else {
    finishOnboarding();
  }
}

function finishOnboarding(): void {
  onboarding = false;
  store.settings.onboarded = true;
  void store.saveSettings();
  toast('引导完成，在下方输入任何话就开始吧', 'info', 3600);
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

void boot().catch((err) => showBootError(err));
