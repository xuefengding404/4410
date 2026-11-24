import { audio } from './audioEngine';
import type { CustomTtsSettings, TtsSettings } from '../types';

export interface VoiceOption {
  uri: string;
  name: string;
  lang: string;
}

export function listBrowserVoices(): VoiceOption[] {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
}

export function onVoicesChanged(cb: () => void): void {
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = cb;
}

/** 去掉括号动作、星号旁白与标签，只读真正说出口的台词 */
export function speakableText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class TtsError extends Error {
  hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.hint = hint;
  }
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '');
}

function parseHeaders(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = String(v);
    return out;
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

function pickByPath(json: unknown, path: string): string | null {
  if (!path.trim()) return null;
  let cursor: unknown = json;
  for (const key of path.split('.')) {
    if (cursor === null || cursor === undefined) return null;
    if (Array.isArray(cursor)) {
      const index = Number(key);
      cursor = Number.isInteger(index) ? cursor[index] : undefined;
    } else if (typeof cursor === 'object') {
      cursor = (cursor as Record<string, unknown>)[key];
    } else {
      return null;
    }
  }
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
}

async function fetchAudio(url: string, init: RequestInit, audioPath = ''): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    throw new TtsError(
      `无法连接 TTS 接口：${message}`,
      '常见原因：① 本地服务没启动；② 地址写错（注意 http 与端口）；③ 浏览器跨域（CORS）拦截——本地服务需允许 Access-Control-Allow-Origin: *，或把页面用 Chrome 以 --disable-web-security 启动；④ 手机访问时 127.0.0.1 指的是手机自己，请改成电脑的局域网 IP。',
    );
  }
  clearTimeout(timer);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TtsError(
      `TTS 接口返回 ${res.status}`,
      `服务端拒绝请求。响应片段：${body.slice(0, 300) || '（空）'}`,
    );
  }
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json') || type.includes('text/')) {
    const json = (await res.json().catch(() => null)) as unknown;
    const picked = pickByPath(json, audioPath) ?? pickAudioPayload(json);
    if (picked) {
      if (picked.startsWith('http')) {
        const audioRes = await fetch(picked);
        return audioRes.blob();
      }
      return base64ToBlob(picked);
    }
    throw new TtsError(
      'TTS 返回了 JSON，但没有找到音频数据',
      '请在「自定义 TTS」里填写响应音频字段路径（例如 data.url / audio），或确认所选接口格式与实际服务一致。',
    );
  }
  return res.blob();
}

function pickAudioPayload(json: unknown): string | null {
  if (!json) return null;
  if (typeof json === 'string') return json;
  const obj = json as Record<string, unknown>;
  const candidates: unknown[] = [
    obj.url,
    obj.audio,
    obj.audio_url,
    obj.audioUrl,
    (obj.data as Record<string, unknown> | undefined)?.url,
    Array.isArray(obj.data) ? (obj.data[0] as Record<string, unknown> | undefined)?.url : undefined,
    Array.isArray(obj.data) ? (obj.data[0] as Record<string, unknown> | undefined)?.audio : undefined,
    obj.base64,
  ];
  for (const c of candidates) if (typeof c === 'string' && c.length > 0) return c;
  return null;
}

function base64ToBlob(base64: string): Blob {
  const clean = base64.includes(',') ? base64.split(',').pop() ?? '' : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'audio/wav' });
}

async function synthesizeCustom(text: string, cfg: CustomTtsSettings): Promise<Blob> {
  if (!cfg.endpoint.trim()) {
    throw new TtsError('还没有填写 TTS 接口地址', '在「设置 → 朗读与配音 → 自定义 TTS」里填入本地服务地址，例如 http://127.0.0.1:9880/tts');
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;

  if (cfg.format === 'openai') {
    const body: Record<string, unknown> = {
      model: cfg.model || 'tts-1',
      input: text,
      voice: cfg.voice || 'alloy',
      speed: cfg.speed || 1,
      response_format: 'mp3',
    };
    return fetchAudio(cfg.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  if (cfg.format === 'gpt-sovits') {
    const body: Record<string, unknown> = {
      text,
      text_lang: cfg.textLang || 'zh',
      ref_audio_path: cfg.refAudioPath,
      prompt_text: cfg.promptText,
      prompt_lang: cfg.promptLang || 'zh',
      text_split_method: 'cut5',
      batch_size: 1,
      media_type: 'wav',
      streaming_mode: false,
      speed_factor: cfg.speed || 1,
    };
    return fetchAudio(cfg.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  const vars: Record<string, string> = {
    text,
    voice: cfg.voice,
    model: cfg.model,
    speed: String(cfg.speed || 1),
    apiKey: cfg.apiKey,
    language: cfg.textLang,
    refAudioPath: cfg.refAudioPath,
    promptText: cfg.promptText,
  };
  const url = fillTemplate(cfg.templateUrl || cfg.endpoint, vars);
  const body = fillTemplate(cfg.templateBody, vars);
  const blob = await fetchAudio(url, {
    method: 'POST',
    headers: parseHeaders(fillTemplate(cfg.templateHeaders, vars)),
    body,
  }, cfg.templateAudioPath);
  return blob;
}

let cachedAudioUrl: string | null = null;

export async function speak(text: string, settings: TtsSettings): Promise<void> {
  const clean = speakableText(text);
  if (!clean) return;
  audio.stopVoice();

  if (settings.mode === 'off') return;

  if (settings.mode === 'browser') {
    if (!('speechSynthesis' in window)) throw new TtsError('当前浏览器不支持内置朗读', '请改用 Chrome / Edge，或在设置里切换为自定义 TTS。');
    await audio.unlock();
    return new Promise<void>((resolve, reject) => {
      const utter = new SpeechSynthesisUtterance(clean);
      const voices = window.speechSynthesis.getVoices();
      const chosen = voices.find((v) => v.voiceURI === settings.browser.voiceURI);
      if (chosen) utter.voice = chosen;
      utter.rate = settings.browser.rate;
      utter.pitch = settings.browser.pitch;
      utter.volume = Math.min(1, Math.max(0, audio.voiceVolume));
      utter.lang = chosen?.lang || 'zh-CN';
      let settled = false;
      utter.onend = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      utter.onerror = (e) => {
        if (settled) return;
        settled = true;
        if (e.error === 'interrupted' || e.error === 'canceled') resolve();
        else reject(new TtsError(`浏览器朗读失败：${e.error}`, '可尝试更换系统语音，或切换为自定义 TTS 接口。'));
      };
      window.speechSynthesis.speak(utter);
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, Math.min(60000, 2000 + clean.length * 260));
    });
  }

  const blob = await synthesizeCustom(clean, settings.custom);
  const url = URL.createObjectURL(blob);
  cachedAudioUrl = url;
  await audio.playVoiceUrl(url);
  if (cachedAudioUrl === url) cachedAudioUrl = null;
}

export function stopSpeaking(): void {
  audio.stopVoice();
  if (cachedAudioUrl) {
    URL.revokeObjectURL(cachedAudioUrl);
    cachedAudioUrl = null;
  }
}
