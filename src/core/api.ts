import type { ApiConfig } from '../types';

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ApiError extends Error {
  hint: string;
  status?: number;
  /** 断流时已经收到的部分台词 */
  partial?: string;
  constructor(message: string, hint: string, status?: number, partial?: string) {
    super(message);
    this.hint = hint;
    this.status = status;
    this.partial = partial;
  }
}

function endpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    throw new ApiError('还没有填写 API 地址', '打开右上角「API 设置」，填入接口地址。DeepSeek 官方地址是 https://api.deepseek.com/v1');
  }
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

function friendly(status: number, body: string): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError(
      `API 鉴权失败（${status}）`,
      'API Key 无效或没有权限。请检查是否复制完整、是否以 sk- 开头，以及账户是否还有余额。',
      status,
    );
  }
  if (status === 404) {
    return new ApiError(
      `接口不存在（404）`,
      '地址可能少了 /v1，或模型名写错。DeepSeek 应填 https://api.deepseek.com/v1，模型 deepseek-chat。',
      status,
    );
  }
  if (status === 429) {
    return new ApiError('请求太频繁或余额不足（429）', '稍等几秒再试；如果持续出现，检查账户余额与并发限制。', status);
  }
  if (status >= 500) {
    return new ApiError(`服务端错误（${status}）`, '这是接口服务方的问题，换一个时间段或换模型再试。', status);
  }
  return new ApiError(`请求失败（${status}）`, body.slice(0, 400) || '接口返回了空响应。', status);
}

function aborted(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

interface StreamChoice {
  delta?: { content?: string };
  message?: { content?: string };
  finish_reason?: string | null;
}

function readDelta(json: { choices?: StreamChoice[]; error?: { message?: string } }): {
  delta: string;
  finish: boolean;
} {
  if (json.error?.message) throw new ApiError('接口返回错误', json.error.message);
  const choice = json.choices?.[0];
  const delta = choice?.delta?.content ?? choice?.message?.content ?? '';
  return { delta, finish: Boolean(choice?.finish_reason) };
}

/**
 * 流式对话（SSE）。逐字回调 onDelta，返回完整文本。
 * 带「无响应超时」与「连接中断」处理，避免真实网络下无限挂起。
 */
export async function streamChat(
  api: ApiConfig,
  messages: ChatTurn[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = endpoint(api.baseUrl);
  const timeout = Math.max(5000, api.timeoutMs || 90000);
  const controller = new AbortController();
  let timedOut = false;
  let timer: number | undefined;
  let settled = false;

  const arm = (ms: number): void => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
  };
  const onExternalAbort = (): void => controller.abort();
  if (signal?.aborted) throw aborted();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeoutError = (): ApiError =>
    new ApiError(
      '等待 API 响应超时',
      `超过 ${Math.round(timeout / 1000)} 秒没有收到新数据。可以在「API 设置」里调大超时，或检查网络/代理；已生成的部分不会保存。`,
    );

  try {
    arm(Math.min(25000, timeout));
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(api.apiKey.trim() ? { Authorization: `Bearer ${api.apiKey.trim()}` } : {}),
        },
        body: JSON.stringify({
          model: api.model || 'deepseek-chat',
          messages,
          temperature: api.temperature,
          max_tokens: api.maxTokens,
          stream: api.stream,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (signal?.aborted) throw aborted();
      if (timedOut) throw timeoutError();
      const message = err instanceof Error ? err.message : String(err);
      throw new ApiError(
        `连接不上 API：${message}`,
        '请检查网络、代理与接口地址；如果是本地模型（Ollama / LM Studio），确认服务已启动且允许跨域。',
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw friendly(res.status, body);
    }

    if (!api.stream) {
      let json: { choices?: StreamChoice[] };
      try {
        json = (await res.json()) as { choices?: StreamChoice[] };
      } catch {
        throw new ApiError('接口返回的不是合法 JSON', '检查接口地址是否指向 OpenAI 兼容的 /chat/completions。');
      }
      const content = json.choices?.[0]?.message?.content ?? '';
      if (content) onDelta(content);
      return content;
    }

    if (!res.body) {
      const text = await res.text();
      if (text.startsWith('data:')) {
        throw new ApiError('接口返回了 SSE 但没有流式响应体', '浏览器不支持流式读取，或接口实现不标准；可在设置里关闭流式输出。');
      }
      onDelta(text);
      return text;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';
    let finished = false;

    const consumeBlock = (block: string): void => {
      for (const line of block.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        if (payload === '[DONE]') {
          finished = true;
          continue;
        }
        try {
          const parsed = JSON.parse(payload) as { choices?: StreamChoice[]; error?: { message?: string } };
          const { delta, finish } = readDelta(parsed);
          if (finish) finished = true;
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch (err) {
          if (err instanceof ApiError) throw err;
          // 非法分片（真实服务偶尔会发 keep-alive / 半包）：跳过，继续读
        }
      }
    };

    while (!settled) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (signal?.aborted) throw aborted();
        if (timedOut) throw timeoutError();
        if (full.trim()) {
          throw new ApiError(
            '流式连接中断',
            '网络在生成途中断开，已经收到的半句会留在屏幕上，但没有写入存档。',
            undefined,
            full,
          );
        }
        throw new ApiError(
          '流式连接中断',
          err instanceof Error ? err.message : '网络在生成途中断开。请重试；如果频繁出现，检查代理或关闭流式输出。',
        );
      }
      if (chunk.done) break;
      arm(timeout);
      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) consumeBlock(block);
    }

    if (buffer.trim()) consumeBlock(buffer);
    settled = true;

    if (!full.trim() && !finished) {
      throw new ApiError(
        '接口没有返回内容',
        '连接建立但没收到任何台词。检查模型名、额度与接口兼容性；也可以先关闭流式输出再试。',
      );
    }
    return full;
  } finally {
    if (timer) window.clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
