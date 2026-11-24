import type { ApiConfig } from '../types';

export class ImageGenError extends Error {
  hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.hint = hint;
  }
}

interface ImageItem {
  b64_json?: string;
  url?: string;
}

/**
 * 中立的 BYOK 生图通道：只负责把用户自己写的 prompt 发到用户自己的
 * /images/generations 接口，不内置任何提示词或风格。
 */
export async function generateImage(prompt: string, api: ApiConfig): Promise<string> {
  if (!api.imageUrl.trim()) {
    throw new ImageGenError(
      '还没有配置生图接口',
      '去「API 设置 → 个人生图接口」填入地址，例如 https://api.siliconflow.cn/v1/images/generations',
    );
  }
  const body: Record<string, unknown> = { prompt, n: 1 };
  if (api.imageModel.trim()) body.model = api.imageModel.trim();

  let res: Response;
  try {
    res = await fetch(api.imageUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(api.imageKey.trim() ? { Authorization: `Bearer ${api.imageKey.trim()}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ImageGenError(
      `连接生图接口失败：${message}`,
      '检查地址、网络与跨域（CORS）。本地服务需要允许 Access-Control-Allow-Origin。',
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ImageGenError(`生图接口返回 ${res.status}`, text.slice(0, 300) || '服务端没有返回内容。');
  }

  const json = (await res.json().catch(() => null)) as
    | { data?: ImageItem[]; images?: ImageItem[]; error?: { message?: string } }
    | null;
  if (!json) throw new ImageGenError('生图接口返回的不是 JSON', '请确认接口兼容 OpenAI /images/generations 格式。');
  if (json.error?.message) throw new ImageGenError('生图接口报错', json.error.message);

  const item = json.data?.[0] ?? json.images?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new ImageGenError(
    '接口没有返回图片',
    '需要返回 data[0].b64_json 或 data[0].url。部分服务返回 images[0].url，也已兼容。',
  );
}

/** 把生成的图片（URL 或 dataURL）转成 Blob，便于存进 IndexedDB */
export async function imageToBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    const res = await fetch(src);
    return res.blob();
  }
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(String(res.status));
    return await res.blob();
  } catch {
    throw new ImageGenError(
      '图片下载失败',
      '生图接口返回的是外链，但浏览器因跨域无法下载保存。请换用返回 b64_json 的接口，或把图片手动保存后从工坊上传。',
    );
  }
}
