import type { StreamTag } from '../types';

const TAG_RE = /^<\s*(sprite|scene|fx|mem)\s*[:：]\s*([^<>]*?)\s*>$/i;
const OPEN_TAG_RE = /^<\s*(sprite|scene|fx|mem)\s*[:：]\s*([^<>]*?)\s*$/i;

export interface ParsedChunk {
  text: string;
  tags: StreamTag[];
}

/**
 * 流式标签状态机。
 * 逐字缓冲 `<...>`，只有在完整匹配时才触发演出并从台词中剥离，
 * 因此玩家看不到任何标签闪烁；万一不是标签（例如数学符号 `<`），原样吐出。
 */
export class TagStreamParser {
  private buffer = '';

  feed(chunk: string): ParsedChunk {
    this.buffer += chunk;
    let text = '';
    const tags: StreamTag[] = [];
    let guard = 0;

    while (this.buffer.length > 0 && guard < 400) {
      guard += 1;
      const lt = this.buffer.indexOf('<');
      if (lt === -1) {
        text += this.buffer;
        this.buffer = '';
        break;
      }
      if (lt > 0) {
        text += this.buffer.slice(0, lt);
        this.buffer = this.buffer.slice(lt);
      }
      const gt = this.buffer.indexOf('>');
      if (gt === -1) {
        // 可能是被截断的标签，暂时扣住；超长则判定为普通文本
        if (this.buffer.length > 240) {
          text += this.buffer;
          this.buffer = '';
        }
        break;
      }
      const candidate = this.buffer.slice(0, gt + 1);
      const match = TAG_RE.exec(candidate);
      if (match) {
        tags.push({
          type: match[1].toLowerCase() as StreamTag['type'],
          value: normalizeValue(match[2]),
        });
        this.buffer = this.buffer.slice(gt + 1);
      } else {
        // 不是演出标签：把 '<' 当普通字符吐出，继续扫描后面的内容
        text += '<';
        this.buffer = this.buffer.slice(1);
      }
    }

    return { text: stripLeakedTags(text), tags };
  }

  /** 流结束时收尾：容忍 AI 忘记写 '>' 的半截标签 */
  flush(): ParsedChunk {
    if (!this.buffer) return { text: '', tags: [] };
    const remaining = this.buffer;
    this.buffer = '';
    const full = TAG_RE.exec(remaining);
    if (full) {
      return { text: '', tags: [{ type: full[1].toLowerCase() as StreamTag['type'], value: normalizeValue(full[2]) }] };
    }
    const open = OPEN_TAG_RE.exec(remaining);
    if (open) {
      return { text: '', tags: [{ type: open[1].toLowerCase() as StreamTag['type'], value: normalizeValue(open[2]) }] };
    }
    return { text: stripLeakedTags(remaining), tags: [] };
  }

  reset(): void {
    this.buffer = '';
  }
}

function normalizeValue(raw: string): string {
  return raw
    .replace(/^["'「『]+|["'」』]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeakedTags(text: string): string {
  return text.replace(/<\s*(sprite|scene|fx|mem)\s*[:：][^<>]*?>/gi, '');
}

/** 一次性解析完整文本（用于存档消息、开场白、导入记录） */
export function parseFull(text: string): ParsedChunk {
  const parser = new TagStreamParser();
  const first = parser.feed(text);
  const rest = parser.flush();
  return { text: first.text + rest.text, tags: [...first.tags, ...rest.tags] };
}

export function visibleText(text: string): string {
  return parseFull(text).text.trim();
}
