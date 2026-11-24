import { store } from '../../app/store';
import {
  BRANCH_NODE_HEIGHT,
  BRANCH_NODE_WIDTH,
  applySnapshot,
  createSnapshot,
  deleteBranch,
  layoutBranches,
  listBranches,
  renameBranch,
  toggleFavorite,
} from '../../core/branches';
import { branchMarkdown, branchTreeMarkdown, mergeBranchMemories, suggestBranchName } from '../../core/branchActions';
import { branchTreeHtml } from '../../core/branchExporter';
import { slugId } from '../../core/defaults';
import { visibleText } from '../../core/tagParser';
import type { BranchSnapshot, Character, ChatMessage } from '../../types';
import { downloadText, formatTime, h } from '../dom';
import { button, field, row, textInput } from '../form';
import { closeAllModals, confirmDialog, openModal, toast } from '../modal';

let onlyFavorites = false;
let onlyPath = false;
let fullscreen = false;
let viewMode: 'tree' | 'timeline' = 'tree';
const collapsedDays = new Set<string>();

function applyFullscreen(body: HTMLElement, on: boolean): void {
  body.closest('.modal-panel')?.classList.toggle('branch-fullscreen', on);
  body.closest('.modal-backdrop')?.classList.toggle('branch-fs', on);
}

export function openBranchPanel(): void {
  onlyFavorites = false;
  onlyPath = false;
  fullscreen = false;
  viewMode = 'tree';
  const modal = openModal({
    title: '🌿 剧情分支树',
    subtitle: '每个存档点都是树上的一个节点。回到旧节点继续走，再存档就会自动长出新分支。',
    size: 'lg',
  });
  void render(modal.body);
}

async function render(body: HTMLElement): Promise<void> {
  const character = store.character;
  const allNodes = await listBranches(character.id);
  const pathIds = currentPathIds(allNodes, character.activeBranchId);
  let nodes = onlyFavorites ? allNodes.filter((node) => node.favorite) : allNodes;
  if (onlyPath) nodes = nodes.filter((node) => pathIds.has(node.id));
  body.replaceChildren();

  const autoOn = store.settings.branchAutoSave;
  const autoBtn = button(
    autoOn ? '每回合自动存档：开' : '每回合自动存档：关',
    () => {
      store.settings.branchAutoSave = !store.settings.branchAutoSave;
      void store.saveSettings();
      void render(body);
    },
    autoOn ? 'soft' : 'ghost',
  );
  const favBtn = button(onlyFavorites ? '只看收藏：开' : '只看收藏', () => {
    onlyFavorites = !onlyFavorites;
    void render(body);
  }, onlyFavorites ? 'soft' : 'ghost');
  const pathBtn = button(onlyPath ? '只看当前路径：开' : '只看当前路径', () => {
    onlyPath = !onlyPath;
    void render(body);
  }, onlyPath ? 'soft' : 'ghost');
  const fsBtn = button(fullscreen ? '退出全屏' : '全屏', () => {
    fullscreen = !fullscreen;
    applyFullscreen(body, fullscreen);
    fsBtn.textContent = fullscreen ? '退出全屏' : '全屏';
  }, 'ghost');
  const viewBtn = button(viewMode === 'tree' ? '时间轴视图' : '树状视图', () => {
    viewMode = viewMode === 'tree' ? 'timeline' : 'tree';
    void render(body);
  }, viewMode === 'tree' ? 'ghost' : 'soft');
  const searchInput = h('input', {
    class: 'input branch-search',
    type: 'search',
    placeholder: '搜索所有分支的台词 / 手账…',
    spellcheck: false,
  }) as HTMLInputElement;
  const results = h('div', { class: 'branch-search-results' });
  results.hidden = true;

  const toolbar = h(
    'div',
    { class: 'branch-toolbar' },
    h(
      'div',
      { class: 'branch-toolbar-left' },
      button('＋ 在当前进度存档', () => void snapshotNow(body), 'primary'),
      autoBtn,
      favBtn,
      pathBtn,
      fsBtn,
      viewBtn,
      button('导出整棵树', () => {
        const markdown = branchTreeMarkdown(allNodes, character);
        downloadText(markdown, `starry-branch-tree-${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown');
        toast('整棵树已导出为 Markdown 大纲', 'info');
      }, 'ghost'),
      button('导出 HTML', () => {
        const html = branchTreeHtml(allNodes, character);
        downloadText(html, `starry-branch-tree-${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
        toast('已导出可交互的分支树 HTML', 'info');
      }, 'ghost'),
    ),
    h(
      'span',
      { class: 'branch-count' },
      `${onlyFavorites || onlyPath ? `${nodes.length}/${allNodes.length}` : nodes.length} 个存档点 · 当前活跃：${activeLabel(allNodes, character.activeBranchId)}`,
    ),
  );

  if (allNodes.length === 0) {
    body.append(
      toolbar,
      h(
        'div',
        { class: 'branch-empty' },
        h('span', { class: 'branch-empty-star' }, '✦'),
        h('p', {}, '分支树还是空的。'),
        h('p', { class: 'note' }, '点上面的「在当前进度存档」记下这一刻。之后回到这里、换一种说法继续，就会长出新的枝条。'),
        button('就在此刻存下第一笔', () => void snapshotNow(body), 'soft'),
      ),
    );
    applyFullscreen(body, fullscreen);
    return;
  }

  if (nodes.length === 0) {
    const noActive = onlyPath && pathIds.size === 0;
    body.append(
      toolbar,
      h(
        'div',
        { class: 'branch-empty' },
        h('p', {}, noActive ? '当前还没有活跃节点。' : '没有符合筛选条件的节点。'),
        h(
          'p',
          { class: 'note' },
          noActive
            ? '先在剧情里走一段、或手动存一笔，再回来看当前路径。'
            : '试试关掉「只看收藏 / 只看当前路径」，或给节点点上星标。',
        ),
        button('清除筛选', () => {
          onlyFavorites = false;
          onlyPath = false;
          void render(body);
        }, 'soft'),
      ),
    );
    applyFullscreen(body, fullscreen);
    return;
  }

  let scroller: HTMLElement;
  if (viewMode === 'timeline') {
    const list = h('div', { class: 'branch-timeline' });
    const groups = new Map<string, { wrap: HTMLElement; items: HTMLElement; toggle: HTMLElement }>();
    for (const node of [...nodes].sort((a, b) => a.createdAt - b.createdAt)) {
      const isActive = store.character.activeBranchId === node.id;
      const onPath = pathIds.has(node.id);
      const day = formatDay(node.createdAt);
      let group = groups.get(day);
      if (!group) {
        const toggle = h('span', { class: 'timeline-day-toggle' }, collapsedDays.has(day) ? '▸' : '▾');
        const items = h('div', { class: 'timeline-day-items' });
        const wrap = h(
          'div',
          { class: `timeline-day-group${collapsedDays.has(day) ? ' collapsed' : ''}` },
          h('button', { class: 'timeline-day', type: 'button' }, day, toggle),
          items,
        );
        wrap.querySelector('.timeline-day')?.addEventListener('click', () => {
          const collapsed = wrap.classList.toggle('collapsed');
          toggle.textContent = collapsed ? '▸' : '▾';
          if (collapsed) collapsedDays.add(day);
          else collapsedDays.delete(day);
        });
        group = { wrap, items, toggle };
        groups.set(day, group);
        list.append(wrap);
      }
      const item = h(
        'div',
        {
          class: `timeline-item${isActive ? ' active' : ''}${onPath ? ' on-path' : ''}`,
          'data-branch-id': node.id,
        },
        h('span', { class: 'timeline-dot' }),
        h(
          'div',
          { class: 'timeline-card' },
          buildNodeHead(node, body),
          buildNodeMeta(node),
          h('div', { class: 'branch-time' }, formatTime(node.createdAt)),
          buildNodeActions(node, body, isActive),
        ),
      );
      group.items.append(item);
    }
    scroller = h('div', { class: 'branch-scroller' }, list);
  } else {
    const layout = layoutBranches(nodes);
    const canvas = h('div', {
      class: 'branch-canvas',
      style: {
        width: `${Math.max(layout.width, 320)}px`,
        height: `${Math.max(layout.height, 160)}px`,
      },
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'branch-edges');
    svg.setAttribute('width', String(layout.width));
    svg.setAttribute('height', String(layout.height));
    const positioned = new Map(layout.items.map((item) => [item.node.id, item]));
    for (const item of layout.items) {
      for (const childId of item.childIds) {
        const child = positioned.get(childId);
        if (!child) continue;
        const x1 = item.x + BRANCH_NODE_WIDTH;
        const y1 = item.y + BRANCH_NODE_HEIGHT / 2;
        const x2 = child.x;
        const y2 = child.y + BRANCH_NODE_HEIGHT / 2;
        const mid = (x1 + x2) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
        path.setAttribute('class', 'branch-edge');
        svg.append(path);
      }
    }
    canvas.append(svg);

    for (const item of layout.items) {
      canvas.append(renderNode(item.node, item.x, item.y, body, item.childIds.length, pathIds.has(item.node.id)));
    }
    scroller = h('div', { class: 'branch-scroller' }, canvas);
  }
  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      runSearch(searchInput.value.trim(), nodes, results, body);
    }, 220);
  });
  body.append(
    toolbar,
    h('div', { class: 'branch-search-row' }, searchInput),
    results,
    scroller,
    h('p', { class: 'note branch-hint' }, '回到旧节点时，当前进度会先自动存一笔，所以不会丢。羁绊与手账也会一起回到那个节点。'),
  );
  applyFullscreen(body, fullscreen);
}

function activeLabel(nodes: BranchSnapshot[], activeId?: string): string {
  if (!activeId) return '主线起点';
  return nodes.find((n) => n.id === activeId)?.label ?? '主线起点';
}

/** 从根到当前节点的祖先链（不含未保存的旁支） */
function currentPathIds(nodes: BranchSnapshot[], activeId?: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = new Set<string>();
  let cursor = activeId;
  let guard = 0;
  while (cursor && byId.has(cursor) && guard < 500) {
    ids.add(cursor);
    cursor = byId.get(cursor)?.parentId;
    guard += 1;
  }
  return ids;
}

function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 两条分支从开头开始共同拥有的消息条数（消息 id 相同即视为同一句） */
function commonMessagePrefix(a: ChatMessage[], b: ChatMessage[]): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index].id === b[index].id) index += 1;
  return index;
}

function buildNodeHead(node: BranchSnapshot, body: HTMLElement): HTMLElement {
  const isActive = store.character.activeBranchId === node.id;
  const star = h(
    'button',
    {
      class: `branch-star${node.favorite ? ' on' : ''}`,
      type: 'button',
      title: node.favorite ? '取消收藏' : '收藏这个节点',
    },
    node.favorite ? '★' : '☆',
  ) as HTMLButtonElement;
  star.addEventListener('click', (event) => {
    event.stopPropagation();
    void toggleFavorite(node.characterId, node.id).then(() => render(body));
  });
  return h(
    'div',
    { class: 'branch-node-head' },
    star,
    h('span', { class: 'branch-label', title: node.label }, node.label),
    isActive ? h('span', { class: 'branch-active-badge' }, '当前') : null,
  );
}

function buildNodeMeta(node: BranchSnapshot, childCount = 0): HTMLElement {
  return h(
    'div',
    { class: 'branch-meta' },
    h('span', {}, `第 ${node.messageCount} 句`),
    h('span', {}, `羁绊 ${node.bondXp}`),
    h('span', {}, `手账 ${node.memories.length}`),
    node.auto ? h('span', { class: 'branch-auto' }, '自动') : null,
    childCount > 0 ? h('span', {}, `${childCount} 条分支`) : null,
  );
}

function buildNodeActions(node: BranchSnapshot, body: HTMLElement, isActive: boolean): HTMLElement {
  return h(
    'div',
    { class: 'branch-actions' },
    isActive
      ? h('button', { class: 'btn btn-soft', type: 'button', disabled: true }, '当前所在')
      : button('回到这里', () => void restore(node, body), 'soft'),
    button('并入', () => void mergeInto(node, body), 'ghost'),
    button('改名', () => void rename(node, body), 'ghost'),
    button('导出', () => exportNode(node), 'ghost'),
    isActive
      ? null
      : h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => compareWithActive(node, body) }, '对比'),
    button('删除', () => void remove(node, body), 'ghost'),
  );
}

function renderNode(
  node: BranchSnapshot,
  x: number,
  y: number,
  body: HTMLElement,
  childCount: number,
  onPath = false,
): HTMLElement {
  const isActive = store.character.activeBranchId === node.id;
  const el = h('div', {
    class: `branch-node${isActive ? ' active' : ''}${onPath ? ' on-path' : ''}`,
    style: { left: `${x}px`, top: `${y}px` },
    'data-branch-id': node.id,
  });
  el.append(
    buildNodeHead(node, body),
    buildNodeMeta(node, childCount),
    h('div', { class: 'branch-time' }, formatTime(node.createdAt)),
    buildNodeActions(node, body, isActive),
  );
  return el;
}

async function mergeInto(node: BranchSnapshot, body: HTMLElement): Promise<void> {
  const character = store.character;
  const added = node.memories.filter((m) => !character.memories.some((x) => x.text === m.text)).length;
  const bondUp = node.bondXp > character.bondXp;
  if (added === 0 && !bondUp) {
    toast('这条分支没有新的记忆或更高的羁绊可以并入', 'info');
    return;
  }
  const ok = await confirmDialog(
    '并入当前时间线',
    `把「${node.label}」的 ${added} 条新记忆${bondUp ? `，以及更高的羁绊（${node.bondXp}）` : ''}并入当前？对话内容不会改变。`,
    '并入',
  );
  if (!ok) return;
  try {
    const result = await mergeBranchMemories(node);
    toast(
      `已把「${node.label}」${result.added > 0 ? `的 ${result.added} 条记忆` : '的羁绊'}并入当前时间线`,
      'info',
    );
    await render(body);
  } catch (err) {
    toast(err instanceof Error ? err.message : '并入失败', 'error');
  }
}

async function snapshotNow(body: HTMLElement): Promise<void> {
  try {
    const node = await createSnapshot(store.character);
    await store.saveCharacterNow();
    toast(`已存档：「${node.label}」`, 'info');
    await render(body);
  } catch (err) {
    toast(err instanceof Error ? err.message : '存档失败', 'error');
  }
}

async function restore(node: BranchSnapshot, body: HTMLElement): Promise<void> {
  const ok = await confirmDialog(
    '回到这个节点',
    `将恢复到「${node.label}」（第 ${node.messageCount} 句）。当前进度会先自动存成一个存档点，再回到该节点；羁绊与手账也会一起回到那时。`,
    '回到这里',
  );
  if (!ok) return;
  const character = store.character;
  try {
    if (character.activeBranchId !== node.id) {
      await createSnapshot(character, `自动存档 · 前往「${node.label}」前`);
    }
    applySnapshot(node, character);
    await store.saveCharacterNow();
    window.dispatchEvent(new CustomEvent('starry:restore'));
    toast(`已回到「${node.label}」`, 'info');
    await render(body);
  } catch (err) {
    toast(err instanceof Error ? err.message : '回溯失败', 'error');
  }
}

function rename(node: BranchSnapshot, body: HTMLElement): void {
  const modal = openModal({ title: '给这个存档点改名', size: 'sm' });
  const input = textInput({ value: node.label, placeholder: '例如：雨夜告白 / 争吵之前' });
  const aiBtn = button('✨ 让 AI 起名', () => {
    aiBtn.disabled = true;
    const original = aiBtn.textContent;
    aiBtn.textContent = '取名中…';
    void suggestBranchName(node)
      .then((name) => {
        input.value = name;
        toast(`AI 取名：「${name}」`, 'info');
      })
      .catch((err: unknown) => toast(err instanceof Error ? err.message : '取名失败', 'error'))
      .finally(() => {
        aiBtn.disabled = false;
        aiBtn.textContent = original ?? '✨ 让 AI 起名';
      });
  }, 'soft');
  modal.body.append(
    field('名字', input),
    row(aiBtn),
    row(
      button('保存', () => {
        void renameBranch(node.characterId, node.id, input.value).then(async () => {
          modal.close();
          await render(body);
        });
      }, 'primary'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );
}

async function remove(node: BranchSnapshot, body: HTMLElement): Promise<void> {
  const ok = await confirmDialog('删除存档点', `删除「${node.label}」？它的子分支会接到它的上一层，不会一起消失。`, '删除');
  if (!ok) return;
  await deleteBranch(node.characterId, node.id);
  if (store.character.activeBranchId === node.id) {
    store.character.activeBranchId = node.parentId;
    await store.saveCharacterNow();
  }
  toast('存档点已删除', 'info');
  await render(body);
}

function exportNode(node: BranchSnapshot): void {
  const markdown = branchMarkdown(node, store.character);
  const safe = node.label.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 20) || 'branch';
  const date = new Date(node.createdAt).toISOString().slice(0, 10);
  downloadText(markdown, `starry-branch-${safe}-${date}.md`, 'text/markdown');
  toast('分支已导出为 Markdown 剧本', 'info');
}

async function compareWithActive(node: BranchSnapshot, body: HTMLElement): Promise<void> {
  const list = await listBranches(node.characterId);
  const active = list.find((n) => n.id === store.character.activeBranchId);
  if (!active) {
    toast('当前还没有活跃节点，先存一笔再对比', 'info');
    return;
  }
  if (active.id === node.id) return;
  openCompare(active, node, body);
}

function openCompare(a: BranchSnapshot, b: BranchSnapshot, body: HTMLElement): void {
  const modal = openModal({
    title: '节点对比',
    subtitle: '左边是当前所在，右边是选中的节点。',
    size: 'lg',
  });
  const memoriesA = new Set(a.memories.map((m) => m.text));
  const memoriesB = new Set(b.memories.map((m) => m.text));
  const onlyA = [...memoriesA].filter((text) => !memoriesB.has(text));
  const onlyB = [...memoriesB].filter((text) => !memoriesA.has(text));
  const prefix = commonMessagePrefix(a.messages, b.messages);

  const column = (node: BranchSnapshot, active: boolean, tail: typeof a.messages): HTMLElement =>
    h(
      'div',
      { class: `compare-col${active ? ' active' : ''}` },
      h('div', { class: 'compare-head' }, h('strong', {}, node.label), active ? h('span', { class: 'branch-active-badge' }, '当前') : null),
      h(
        'div',
        { class: 'compare-meta' },
        h('span', {}, `第 ${node.messageCount} 句`),
        h('span', {}, `羁绊 ${node.bondXp}`),
        h('span', {}, `手账 ${node.memories.length} 条`),
      ),
      h('div', { class: 'compare-time' }, formatTime(node.createdAt)),
      h(
        'div',
        { class: 'compare-lines' },
        prefix > 0 ? h('p', { class: 'compare-common' }, `共同前情 ${prefix} 句…`) : null,
        ...tail.map((m) =>
          h(
            'p',
            { class: `compare-line ${m.role}` },
            h('span', { class: 'compare-who' }, m.role === 'user' ? '你' : store.character.name),
            visibleText(m.content),
          ),
        ),
        tail.length === 0 ? h('p', { class: 'compare-common' }, '（这一侧没有更多台词）') : null,
      ),
    );

  modal.body.append(
    h(
      'div',
      { class: 'compare-grid' },
      column(a, true, a.messages.slice(prefix).slice(-14)),
      column(b, false, b.messages.slice(prefix).slice(-14)),
    ),
    h('div', { class: 'divider' }),
    h(
      'div',
      { class: 'compare-diff' },
      h(
        'p',
        { class: 'compare-split' },
        prefix > 0 ? `分叉点：第 ${prefix + 1} 句` : '两条分支没有共同前情（可能来自不同角色或不同导入）',
      ),
      h('p', {}, `消息：${a.messageCount} → ${b.messageCount}（${b.messageCount - a.messageCount >= 0 ? '+' : ''}${b.messageCount - a.messageCount}）`),
      h('p', {}, `羁绊：${a.bondXp} → ${b.bondXp}（${b.bondXp - a.bondXp >= 0 ? '+' : ''}${b.bondXp - a.bondXp}）`),
      onlyA.length > 0 ? h('p', { class: 'compare-only' }, `仅当前记得：${onlyA.join('；')}`) : null,
      onlyB.length > 0 ? h('p', { class: 'compare-only other' }, `仅该节点记得：${onlyB.join('；')}`) : null,
    ),
    row(
      button(`把「${b.label}」并入当前`, () => {
        modal.close();
        window.setTimeout(() => void mergeInto(b, body), 260);
      }, 'soft'),
      button('以右侧节点新建角色', () => {
        modal.close();
        window.setTimeout(() => openNewCharacterFrom(b), 260);
      }, 'soft'),
      button('关闭', () => modal.close(), 'ghost'),
    ),
  );
}

function openNewCharacterFrom(node: BranchSnapshot): void {
  const source = store.character;
  const modal = openModal({
    title: '以这个节点为新角色开局',
    subtitle: '会复制当前角色的设定、立绘、场景与素材，从这个节点继续；原角色不受影响。',
    size: 'sm',
  });
  const input = textInput({ value: `${source.name} · ${node.label}`.slice(0, 24) });
  modal.body.append(
    field('新角色名', input),
    row(
      button('创建角色', () => {
        void (async () => {
          const name = input.value.trim() || `${source.name} · ${node.label}`;
          const fresh: Character = {
            ...structuredClone(source),
            id: slugId('char'),
            name: name.slice(0, 24),
            messages: structuredClone(node.messages),
            memories: structuredClone(node.memories),
            bondXp: node.bondXp,
            currentSpriteId:
              node.spriteId && source.sprites.some((s) => s.id === node.spriteId)
                ? node.spriteId
                : source.currentSpriteId,
            currentSceneId:
              node.sceneId && source.scenes.some((s) => s.id === node.sceneId)
                ? node.sceneId
                : source.currentSceneId,
            activeBranchId: undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            cardSource: 'branch',
          };
          await store.addCharacter(fresh);
          toast(`已创建「${fresh.name}」，从这一刻继续`, 'info');
          modal.close();
          closeAllModals();
        })();
      }, 'primary'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );
}

interface SearchHit {
  node: BranchSnapshot;
  kind: string;
  text: string;
}

function runSearch(query: string, nodes: BranchSnapshot[], container: HTMLElement, body: HTMLElement): void {
  container.replaceChildren();
  if (!query) {
    container.hidden = true;
    return;
  }
  const q = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const node of nodes) {
    for (const message of node.messages) {
      const text = visibleText(message.content);
      if (text.toLowerCase().includes(q)) {
        hits.push({ node, kind: message.role === 'user' ? '你的发言' : '台词', text });
        break;
      }
    }
    for (const memory of node.memories) {
      if (memory.text.toLowerCase().includes(q)) {
        hits.push({ node, kind: '手账', text: memory.text });
      }
    }
  }

  container.hidden = false;
  if (hits.length === 0) {
    container.append(h('p', { class: 'note branch-search-empty' }, `没有找到「${query}」`));
    return;
  }
  container.append(h('div', { class: 'branch-search-head' }, `找到 ${hits.length} 处`));
  for (const hit of hits.slice(0, 40)) {
    const plain = hit.text.replace(/\s+/g, ' ').trim();
    const index = plain.toLowerCase().indexOf(q);
    const start = Math.max(0, index - 18);
    const end = Math.min(plain.length, index + q.length + 30);
    const before = `${start > 0 ? '…' : ''}${plain.slice(start, index)}`.replace(/^…?[。！？，、；：\s]+/, (m) =>
      m.startsWith('…') ? '…' : '',
    );
    const match = plain.slice(index, index + q.length);
    const after = plain
      .slice(index + q.length, end)
      .replace(/[。！？，、；：\s]+$/, '')
      .concat(end < plain.length ? '…' : '');
    const rowEl = h(
      'button',
      { class: 'branch-search-hit', type: 'button', onclick: () => scrollToNode(hit.node.id, body) },
      h('span', { class: 'branch-search-node' }, hit.node.label),
      h('span', { class: 'branch-search-kind' }, hit.kind),
      h('span', { class: 'branch-search-text' }, before, h('mark', {}, match), after),
    );
    container.append(rowEl);
  }
}

function scrollToNode(id: string, body: HTMLElement): void {
  const el = body.querySelector<HTMLElement>(`[data-branch-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  el.classList.remove('highlight');
  void el.offsetWidth;
  el.classList.add('highlight');
  window.setTimeout(() => el.classList.remove('highlight'), 1800);
}
