import type { MemoryEntry } from '../types';

const STOPWORDS = new Set([
  '的',
  '了',
  '是',
  '我',
  '你',
  '他',
  '她',
  '它',
  '在',
  '和',
  '就',
  '都',
  '也',
  '很',
  '吗',
  '呢',
  '吧',
  '啊',
  '呀',
  '哦',
  '嗯',
  '这',
  '那',
  '不',
  '有',
  '一个',
  '什么',
  'the',
  'a',
  'an',
  'and',
  'of',
  'to',
  'is',
  'in',
  'it',
  'you',
  'i',
]);

/** 中文按二元组切词，英文按单词切。足够轻量，跑在本地主线程也不卡。 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const latin = lower.match(/[a-z0-9_]+/g) ?? [];
  tokens.push(...latin.filter((w) => w.length > 1 && !STOPWORDS.has(w)));
  const cjk = lower.replace(/[^\u4e00-\u9fa5]+/g, ' ').trim();
  for (const segment of cjk.split(/\s+/)) {
    if (!segment) continue;
    for (let i = 0; i < segment.length - 1; i += 1) {
      const bigram = segment.slice(i, i + 2);
      if (!STOPWORDS.has(bigram)) tokens.push(bigram);
    }
    if (segment.length === 1) tokens.push(segment);
  }
  return tokens;
}

export function tfidfVectors(docs: string[], query: string): { docs: number[][]; query: number[] } {
  const docTokens = docs.map(tokenize);
  const queryTokens = tokenize(query);
  const df = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const total = docs.length || 1;
  const idf = (term: string): number => Math.log((total + 1) / ((df.get(term) ?? 0) + 1)) + 1;

  const vectorize = (tokens: string[]): number[] => {
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    const vec: number[] = [];
    for (const [term, count] of counts) {
      const tf = count / tokens.length;
      vec.push(tf * idf(term));
    }
    return vec;
  };
  return { docs: docTokens.map(vectorize), query: vectorize(queryTokens) };
}

/** 关键词/TF-IDF 召回：置顶记忆必进，其余按相关度 + 新鲜度取前 N 条 */
export function recallMemories(memories: MemoryEntry[], query: string, topN: number): MemoryEntry[] {
  const pinned = memories.filter((m) => m.pinned);
  const free = memories.filter((m) => !m.pinned);
  if (free.length === 0) return pinned;

  const { docs, query: qvec } = tfidfVectors(
    free.map((m) => m.text),
    query,
  );
  const queryTerms = new Set(tokenize(query));
  const scored = free.map((memory, i) => {
    const vec = docs[i];
    let dot = 0;
    for (let k = 0; k < Math.min(vec.length, qvec.length); k += 1) dot += vec[k] * qvec[k];
    const overlap = tokenize(memory.text).filter((t) => queryTerms.has(t)).length;
    const ageDays = (Date.now() - memory.createdAt) / 86400000;
    const recency = 1 / (1 + ageDays / 30);
    const weight = memory.kind === 'promise' ? 1.25 : memory.kind === 'preference' ? 1.1 : 1;
    return { memory, score: (dot + overlap * 0.35) * weight + recency * 0.12 };
  });
  scored.sort((a, b) => b.score - a.score);
  return [...pinned, ...scored.slice(0, Math.max(0, topN)).map((s) => s.memory)];
}
