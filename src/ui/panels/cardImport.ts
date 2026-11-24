/** 酒馆角色卡导入：SillyTavern PNG(tEXt chara) / JSON 卡 */
export interface ImportedCard {
  name: string;
  persona: string;
  greeting: string;
  raw: Record<string, unknown>;
  avatar?: Blob;
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

async function inflate(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 从 PNG 的 tEXt / iTXt 块里取出角色卡 JSON */
export async function extractPngCard(buffer: ArrayBuffer): Promise<Record<string, unknown> | null> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 8;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    const data = bytes.subarray(dataStart, dataStart + length);
    if (type === 'tEXt') {
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = new TextDecoder('latin1').decode(data.subarray(0, nul));
        if (keyword === 'chara' || keyword === 'ccv3') {
          const text = new TextDecoder('latin1').decode(data.subarray(nul + 1));
          try {
            return JSON.parse(decodeBase64Utf8(text)) as Record<string, unknown>;
          } catch {
            /* 继续找其他块 */
          }
        }
      }
    } else if (type === 'iTXt') {
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = new TextDecoder('latin1').decode(data.subarray(0, nul));
        if (keyword === 'chara' || keyword === 'ccv3') {
          let p = nul + 1;
          const compressed = data[p] === 1;
          p += 2;
          const langEnd = data.indexOf(0, p);
          p = langEnd + 1;
          const transEnd = data.indexOf(0, p);
          const textStart = transEnd + 1;
          let payload: Uint8Array<ArrayBuffer> = new Uint8Array(data.subarray(textStart));
          if (compressed) {
            try {
              payload = await inflate(payload);
            } catch {
              continue;
            }
          }
          const text = new TextDecoder('utf-8').decode(payload);
          try {
            return JSON.parse(text) as Record<string, unknown>;
          } catch {
            try {
              return JSON.parse(decodeBase64Utf8(text)) as Record<string, unknown>;
            } catch {
              /* ignore */
            }
          }
        }
      }
    }
    offset = dataStart + length + 4;
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function cardToPersona(raw: Record<string, unknown>): { name: string; persona: string; greeting: string } {
  // SillyTavern V2 把大部分字段放在 data 里
  const data = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
  const name = pickString(data, ['name', 'char_name']) || pickString(raw, ['name']) || '未命名角色';
  const description = pickString(data, ['description', 'char_persona', 'personality']);
  const personality = pickString(data, ['personality']);
  const scenario = pickString(data, ['scenario', 'world']);
  const examples = pickString(data, ['mes_example', 'example_dialogue']);
  const systemPrompt = pickString(data, ['system_prompt', 'system']);
  const greeting = pickString(data, ['first_mes', 'greeting', 'first_message']);

  const sections: string[] = [`你是「${name}」。`];
  if (description) sections.push(`【角色设定】\n${description}`);
  if (personality && personality !== description) sections.push(`【性格】\n${personality}`);
  if (scenario) sections.push(`【背景与场景】\n${scenario}`);
  if (systemPrompt) sections.push(`【行为准则】\n${systemPrompt}`);
  if (examples) sections.push(`【说话风格示例】\n${examples.slice(0, 1200)}`);
  sections.push('请始终保持角色身份，用自然口语回复，不要提到自己是 AI 或语言模型。');

  return { name, persona: sections.join('\n\n'), greeting };
}

export async function importCardFile(file: File): Promise<ImportedCard> {
  if (file.name.toLowerCase().endsWith('.json') || file.type.includes('json')) {
    const text = await file.text();
    const raw = JSON.parse(text) as Record<string, unknown>;
    const parsed = cardToPersona(raw);
    return { ...parsed, raw };
  }
  if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    const buffer = await file.arrayBuffer();
    const raw = await extractPngCard(buffer);
    if (!raw) throw new Error('这张 PNG 里没有找到酒馆角色卡信息（tEXt chara）。请确认是从 SillyTavern 导出的角色卡。');
    const parsed = cardToPersona(raw);
    return { ...parsed, raw, avatar: file };
  }
  throw new Error('只支持 SillyTavern 的 PNG 角色卡或 JSON 角色卡');
}
