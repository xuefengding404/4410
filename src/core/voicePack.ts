import { store } from '../app/store';

interface VoiceLine {
  id: string;
  text: string;
  file: string;
  seconds: number;
}

let lines: VoiceLine[] = [];
let audio: HTMLAudioElement | null = null;
let pendingText = '';
let loaded = false;

const BASE = import.meta.env.BASE_URL;

function normalize(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？、；：…—,.!?;:()（）「」『』“”"'·]/g, '')
    .trim();
}

export async function loadVoicePack(): Promise<number> {
  if (loaded) return lines.length;
  loaded = true;
  try {
    const res = await fetch(`${BASE}assets/voice/ella/index.json`, { cache: 'force-cache' });
    if (!res.ok) return 0;
    const data = (await res.json()) as { lines?: VoiceLine[] };
    lines = (data.lines ?? []).filter((line) => line?.file && line?.text);
    return lines.length;
  } catch {
    return 0;
  }
}

export function voicePackSize(): number {
  return lines.length;
}

export function stopFixedVoice(): void {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio = null;
  }
}

/**
 * 固定台词才有的预生成语音。返回 true 表示「这句话有语音、已接管」，
 * 调用方应跳过实时 TTS，避免双重朗读。
 */
export function playFixedVoice(text: string): boolean {
  if (!lines.length || !store.settings.fixedVoice) return false;
  const normalized = normalize(text);
  if (!normalized) return false;
  const line =
    lines.find((item) => normalize(item.text) === normalized) ??
    (normalized.length >= 10 ? lines.find((item) => normalize(item.text).includes(normalized)) : undefined);
  if (!line) return false;

  stopFixedVoice();
  const next = new Audio(`${BASE}assets/voice/ella/${line.file}`);
  next.volume = Math.min(1, Math.max(0, store.settings.volumes.voice));
  audio = next;
  void next
    .play()
    .then(() => {
      pendingText = '';
    })
    .catch(() => {
      // 浏览器自动播放限制：等下一次点击再补播
      pendingText = text;
    });
  return true;
}

export function unlockFixedVoice(): void {
  if (!pendingText) return;
  const text = pendingText;
  pendingText = '';
  playFixedVoice(text);
}
