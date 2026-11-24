import { store } from '../app/store';
import { applySnapshot, createSnapshot, findSnapshotAt, layoutBranches, listBranches, MAX_BRANCHES } from './branches';
import { visibleText } from './tagParser';
import { streamChat } from './api';
import { slugId } from './defaults';
import { toast } from '../ui/modal';
import type { BranchSnapshot, Character } from '../types';

let autoWarned = false;

function snippet(text: string, max = 16): string {
  const clean = visibleText(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean || '空台词';
}

/** 每个 AI 回合结束后自动存一笔（可在分支树面板关闭） */
export async function autoBranchSnapshot(): Promise<void> {
  const character = store.character;
  if (!character || !store.settings.branchAutoSave) return;
  const nodes = await listBranches(character.id);
  const active = nodes.find((n) => n.id === character.activeBranchId);
  // 只在「当前活跃节点」已经覆盖了这轮进度时跳过，避免分叉后漏存新的枝条
  if (active && active.messageCount === character.messages.length) return;
  if (nodes.length >= MAX_BRANCHES) {
    if (!autoWarned) {
      autoWarned = true;
      toast('分支树已满，自动存档暂停；可以在分支树里删掉一些旧节点', 'error', 5200);
    }
    return;
  }
  try {
    await createSnapshot(character, `第 ${character.messages.length} 句 · 自动`, { auto: true });
    await store.saveCharacterNow();
    window.dispatchEvent(new CustomEvent('starry:branch-updated'));
  } catch (err) {
    console.warn('[starry] 自动存档失败', err);
  }
}

export interface ForkResult {
  ok: boolean;
  message: string;
}

/**
 * 从某条历史消息处分叉：
 * - 先把当前进度安全存档；
 * - 若该进度已有自动/手动快照，直接精确恢复；
 * - 否则截断消息，并以「分叉 · …」创建一个新节点。
 */
export async function forkFromMessage(messageId: string): Promise<ForkResult> {
  const character = store.character;
  const index = character.messages.findIndex((m) => m.id === messageId);
  if (index < 0) return { ok: false, message: '找不到这条消息' };

  const truncated = structuredClone(character.messages.slice(0, index + 1));
  const target = truncated[truncated.length - 1];
  const baseActive = character.activeBranchId;

  try {
    const current = await listBranches(character.id);
    const activeNode = current.find((n) => n.id === character.activeBranchId);
    const covered = activeNode && activeNode.messageCount === character.messages.length;
    if (character.messages.length > truncated.length && !covered) {
      await createSnapshot(
        character,
        `自动存档 · 分叉前（第 ${character.messages.length} 句）`,
      );
    }
  } catch (err) {
    console.warn('[starry] 分叉前自动存档失败', err);
  }

  const existing = await findSnapshotAt(character.id, truncated.length);
  if (existing) {
    applySnapshot(existing, character);
  } else {
    character.messages = truncated;
    if (target.cues?.sprite) {
      const sprite = character.sprites.find((s) => s.name === target.cues?.sprite);
      if (sprite) character.currentSpriteId = sprite.id;
    }
    if (target.cues?.scene) {
      const scene = character.scenes.find((s) => s.name === target.cues?.scene);
      if (scene) character.currentSceneId = scene.id;
    }
    character.activeBranchId = baseActive;
    await createSnapshot(character, `分叉 · ${snippet(target.content)}`);
  }

  await store.saveCharacterNow();
  window.dispatchEvent(new CustomEvent('starry:restore'));
  return {
    ok: true,
    message: existing?.label
      ? `已回到「${existing.label}」，换一种说法继续吧`
      : `已从第 ${truncated.length} 句分叉，换一种说法继续吧`,
  };
}

/** 把一个节点导出成可读的剧本文本 */
export function branchMarkdown(node: BranchSnapshot, character: Character): string {  const lines: string[] = [
    `# 星语剧场 · ${character.name} 剧情分支`,
    '',
    `- 节点：${node.label}`,
    `- 时间：${new Date(node.createdAt).toLocaleString()}`,
    `- 进度：第 ${node.messageCount} 句`,
    `- 羁绊：${node.bondXp}`,
    `- 手账：${node.memories.length} 条`,
    '',
    '---',
    '',
  ];
  for (const message of node.messages) {
    const who = message.role === 'user' ? '你' : character.name;
    lines.push(`**${who}**：${visibleText(message.content)}`, '');
  }
  if (node.memories.length > 0) {
    lines.push('---', '', '## 这一刻的羁绊手账', '');
    for (const memory of node.memories) {
      lines.push(`- ${memory.pinned ? '【刻骨铭心】' : ''}${memory.text}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** 把另一条分支的手账与羁绊并入当前时间线（不改对话） */
export interface MergeResult {
  added: number;
  bondRaised: boolean;
}

export async function mergeBranchMemories(node: BranchSnapshot): Promise<MergeResult> {
  const character = store.character;
  const existing = new Set(character.memories.map((m) => m.text));
  const additions = node.memories.filter((m) => !existing.has(m.text));
  const oldBond = character.bondXp;
  const nextBond = Math.max(oldBond, node.bondXp);
  if (additions.length === 0 && nextBond === oldBond) {
    return { added: 0, bondRaised: false };
  }
  store.updateCharacter((c) => {
    c.memories = [
      ...additions.map((m) => ({
        ...m,
        id: slugId('mem'),
        createdAt: Date.now(),
        source: 'import' as const,
      })),
      ...c.memories,
    ];
    c.bondXp = nextBond;
  });
  await createSnapshot(character, `合并 · ${node.label}`);
  await store.saveCharacterNow();
  window.dispatchEvent(new CustomEvent('starry:restore'));
  return { added: additions.length, bondRaised: nextBond > oldBond };
}

/** 回到某条「玩家发言」之前，换一种说法重说 */
export async function rewindToUserMessage(messageId: string): Promise<ForkResult> {
  const character = store.character;
  const index = character.messages.findIndex((m) => m.id === messageId);
  if (index < 0) return { ok: false, message: '找不到这条发言' };
  if (character.messages[index]?.role !== 'user') return { ok: false, message: '这条不是你的发言' };
  if (index === 0) return { ok: false, message: '这是第一句话，前面已经没有剧情了' };

  const targetCount = index;
  const baseActive = character.activeBranchId;

  try {
    const current = await listBranches(character.id);
    const activeNode = current.find((n) => n.id === character.activeBranchId);
    const covered = activeNode && activeNode.messageCount === character.messages.length;
    if (!covered) {
      await createSnapshot(character, `自动存档 · 重说前（第 ${character.messages.length} 句）`);
    }
  } catch (err) {
    console.warn('[starry] 重说前自动存档失败', err);
  }

  const existing = await findSnapshotAt(character.id, targetCount);
  if (existing) {
    applySnapshot(existing, character);
  } else {
    character.messages = structuredClone(character.messages.slice(0, targetCount));
    character.activeBranchId = baseActive;
    const last = character.messages[character.messages.length - 1];
    await createSnapshot(character, `重说 · ${last ? snippet(last.content) : '起点'}`);
  }
  await store.saveCharacterNow();
  window.dispatchEvent(new CustomEvent('starry:restore'));
  return { ok: true, message: '已回到这句话之前，换一种说法吧' };
}

const NAME_RULES: { test: RegExp; name: string }[] = [
  { test: /喜欢|爱你|心动|抱|亲/, name: '心动的瞬间' },
  { test: /记住|别忘|怕黑|过敏/, name: '被记住的事' },
  { test: /雨|湿|伞/, name: '雨夜的低语' },
  { test: /咖啡|甜点|蛋糕/, name: '咖啡馆的约定' },
  { test: /生气|讨厌|难过|吵架/, name: '小小的争执' },
  { test: /星星|夜空|月亮/, name: '星夜漫谈' },
  { test: /睡|晚安|梦/, name: '晚安之前' },
];

function heuristicName(node: BranchSnapshot): string {
  const text = node.messages
    .slice(-6)
    .map((m) => visibleText(m.content))
    .join(' ');
  for (const rule of NAME_RULES) {
    if (rule.test.test(text)) return rule.name;
  }
  const last = [...node.messages].reverse().find((m) => m.role === 'assistant');
  return last ? snippet(last.content, 8) : '未命名的一刻';
}

/** 用当前 API 给节点起一个 4~8 字的小标题；离线模式走本地关键词 */
export async function suggestBranchName(node: BranchSnapshot): Promise<string> {
  const character = store.character;
  const useApi = !store.api.demoMode && store.api.apiKey.trim().length > 0;
  if (!useApi) return heuristicName(node);

  const transcript = node.messages
    .slice(-8)
    .map((m) => `${m.role === 'user' ? '对方' : character.name}：${visibleText(m.content)}`)
    .join('\n');
  try {
    const text = await streamChat(
      { ...store.api, stream: false, maxTokens: 40, temperature: 0.7 },
      [
        {
          role: 'system',
          content: '你在给视觉小说的一段剧情起标题。只输出 4~8 个汉字，不要标点、引号、解释，也不要写"标题："。',
        },
        { role: 'user', content: transcript || '一段安静的相处。' },
      ],
      () => undefined,
    );
    const name = text
      .replace(/[「」『』"“”'‘’。！？!?、，,\s]/g, '')
      .replace(/^标题[:：]?/, '')
      .slice(0, 12);
    return name || heuristicName(node);
  } catch (err) {
    console.warn('[starry] AI 取名失败，改用本地关键词', err);
    return heuristicName(node);
  }
}

/** 整棵树导出成带缩进的大纲 */
export function branchTreeMarkdown(nodes: BranchSnapshot[], character: Character): string {
  const layout = layoutBranches(nodes);
  const byId = new Map(layout.items.map((item) => [item.node.id, item]));
  const lines: string[] = [
    `# ${character.name} · 剧情分支树`,
    '',
    `- 节点数：${nodes.length}`,
    `- 导出时间：${new Date().toLocaleString()}`,
    '',
  ];

  const walk = (id: string, depth: number): void => {
    const item = byId.get(id);
    if (!item) return;
    const node = item.node;
    lines.push(
      `${'  '.repeat(depth)}- ${node.label}（第 ${node.messageCount} 句 · 羁绊 ${node.bondXp}${node.auto ? ' · 自动' : ''}）`,
    );
    for (const childId of item.childIds) walk(childId, depth + 1);
  };
  for (const item of layout.items.filter((i) => !i.node.parentId || !byId.has(i.node.parentId))) {
    walk(item.node.id, 0);
  }
  lines.push('');
  return lines.join('\n');
}
