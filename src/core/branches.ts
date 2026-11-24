import { db } from '../storage/db';
import { slugId } from './defaults';
import type { BranchSnapshot, Character } from '../types';

/** 分支数据存在 kv 里，按角色分 key，避免升级 IndexedDB 结构 */
const keyOf = (characterId: string): string => `branches:${characterId}`;

export const MAX_BRANCHES = 80;

export async function listBranches(characterId: string): Promise<BranchSnapshot[]> {
  const list = await db.kvGet<BranchSnapshot[]>(keyOf(characterId), []);
  return Array.isArray(list) ? list : [];
}

export async function saveBranches(characterId: string, list: BranchSnapshot[]): Promise<void> {
  await db.kvSet(keyOf(characterId), list);
}

function snippet(text: string, max = 18): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** 把当前进度存为一个分支节点，并自动挂到当前 active 节点下 */
export async function createSnapshot(
  character: Character,
  label?: string,
  options: { auto?: boolean } = {},
): Promise<BranchSnapshot> {
  const list = await listBranches(character.id);
  if (list.length >= MAX_BRANCHES) {
    throw new Error(`分支树最多保存 ${MAX_BRANCHES} 个存档点，先删掉一些旧的吧`);
  }
  const lastAssistant = [...character.messages].reverse().find((m) => m.role === 'assistant');
  const parentId =
    character.activeBranchId && list.some((n) => n.id === character.activeBranchId)
      ? character.activeBranchId
      : undefined;
  const node: BranchSnapshot = {
    id: slugId('branch'),
    characterId: character.id,
    parentId,
    label: label?.trim() || (lastAssistant ? snippet(lastAssistant.content) : `第 ${character.messages.length} 句`),
    createdAt: Date.now(),
    messageCount: character.messages.length,
    messages: structuredClone(character.messages),
    memories: structuredClone(character.memories),
    bondXp: character.bondXp,
    spriteId: character.currentSpriteId,
    sceneId: character.currentSceneId,
    auto: options.auto,
  };
  list.push(node);
  await saveBranches(character.id, list);
  character.activeBranchId = node.id;
  return node;
}

/** 找到某个消息进度对应的最近快照（优先自动存档），用于「从这条分叉」 */
export async function findSnapshotAt(characterId: string, messageCount: number): Promise<BranchSnapshot | undefined> {
  const list = await listBranches(characterId);
  return list
    .filter((n) => n.messageCount === messageCount)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function renameBranch(characterId: string, id: string, label: string): Promise<void> {
  const list = await listBranches(characterId);
  const node = list.find((n) => n.id === id);
  if (node) {
    node.label = label.trim().slice(0, 40) || node.label;
    await saveBranches(characterId, list);
  }
}

export async function toggleFavorite(characterId: string, id: string): Promise<boolean> {
  const list = await listBranches(characterId);
  const node = list.find((n) => n.id === id);
  if (!node) return false;
  node.favorite = !node.favorite;
  await saveBranches(characterId, list);
  return Boolean(node.favorite);
}

export async function deleteBranch(characterId: string, id: string): Promise<void> {
  const list = await listBranches(characterId);
  const target = list.find((n) => n.id === id);
  if (!target) return;
  for (const node of list) {
    if (node.parentId === id) node.parentId = target.parentId;
  }
  await saveBranches(
    characterId,
    list.filter((n) => n.id !== id),
  );
}

/** 把角色状态恢复到某个快照（只改内存，落盘由调用方负责） */
export function applySnapshot(node: BranchSnapshot, character: Character): void {
  character.messages = structuredClone(node.messages);
  character.memories = structuredClone(node.memories);
  character.bondXp = node.bondXp;
  character.activeBranchId = node.id;
  if (node.spriteId && character.sprites.some((s) => s.id === node.spriteId)) {
    character.currentSpriteId = node.spriteId;
  }
  if (node.sceneId && character.scenes.some((s) => s.id === node.sceneId)) {
    character.currentSceneId = node.sceneId;
  }
}

export interface PositionedBranch {
  node: BranchSnapshot;
  depth: number;
  row: number;
  x: number;
  y: number;
  childIds: string[];
}

export interface BranchLayout {
  items: PositionedBranch[];
  width: number;
  height: number;
}

export const BRANCH_NODE_WIDTH = 216;
export const BRANCH_NODE_HEIGHT = 168;
const GAP_X = 64;
const GAP_Y = 26;

/** 简单的紧凑树布局：按深度横向排列，叶子按顺序占行，父节点取子节点行号均值 */
export function layoutBranches(nodes: BranchSnapshot[]): BranchLayout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  for (const node of nodes) {
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : undefined;
    if (!parent) roots.push(node.id);
    else {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(node.id);
    }
  }
  const sortByTime = (a: string, b: string): number =>
    (byId.get(a)?.createdAt ?? 0) - (byId.get(b)?.createdAt ?? 0);
  roots.sort(sortByTime);
  for (const list of children.values()) list.sort(sortByTime);

  const depthOf = new Map<string, number>();
  const computeDepth = (id: string, depth: number, guard: Set<string>): void => {
    if (guard.has(id)) return;
    guard.add(id);
    depthOf.set(id, Math.max(depthOf.get(id) ?? 0, depth));
    for (const child of children.get(id) ?? []) computeDepth(child, depth + 1, guard);
  };
  for (const root of roots) computeDepth(root, 0, new Set());

  const rows = new Map<string, number>();
  let leafRow = 0;
  const assignRow = (id: string, guard: Set<string>): number => {
    if (rows.has(id)) return rows.get(id)!;
    if (guard.has(id)) return leafRow++;
    guard.add(id);
    const kids = children.get(id) ?? [];
    let row: number;
    if (kids.length === 0) {
      row = leafRow++;
    } else {
      const values = kids.map((kid) => assignRow(kid, guard));
      row = values.reduce((a, b) => a + b, 0) / values.length;
    }
    rows.set(id, row);
    return row;
  };
  for (const root of roots) assignRow(root, new Set());

  const items: PositionedBranch[] = nodes.map((node) => {
    const depth = depthOf.get(node.id) ?? 0;
    const row = rows.get(node.id) ?? 0;
    return {
      node,
      depth,
      row,
      x: 20 + depth * (BRANCH_NODE_WIDTH + GAP_X),
      y: 20 + row * (BRANCH_NODE_HEIGHT + GAP_Y),
      childIds: children.get(node.id) ?? [],
    };
  });

  const maxDepth = items.reduce((m, i) => Math.max(m, i.depth), 0);
  const rowCount = Math.max(1, leafRow);
  return {
    items,
    width: 40 + (maxDepth + 1) * BRANCH_NODE_WIDTH + maxDepth * GAP_X,
    height: 40 + rowCount * BRANCH_NODE_HEIGHT + (rowCount - 1) * GAP_Y,
  };
}
