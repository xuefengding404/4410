import { layoutBranches, BRANCH_NODE_HEIGHT, BRANCH_NODE_WIDTH } from './branches';
import { visibleText } from './tagParser';
import type { BranchSnapshot, Character } from '../types';

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface ExportNode {
  id: string;
  label: string;
  messageCount: number;
  bondXp: number;
  createdAt: number;
  auto: boolean;
  favorite: boolean;
  active: boolean;
  memories: { text: string; pinned: boolean }[];
  messages: { role: 'user' | 'assistant'; content: string }[];
}

/** 把整棵分支树导出成一个可独立打开的 HTML（点击节点看台词、可搜索） */
export function branchTreeHtml(nodes: BranchSnapshot[], character: Character): string {
  const layout = layoutBranches(nodes);
  const positioned = new Map(layout.items.map((item) => [item.node.id, item]));
  const activeId = character.activeBranchId;

  const paths: string[] = [];
  for (const item of layout.items) {
    for (const childId of item.childIds) {
      const child = positioned.get(childId);
      if (!child) continue;
      const x1 = item.x + BRANCH_NODE_WIDTH;
      const y1 = item.y + BRANCH_NODE_HEIGHT / 2;
      const x2 = child.x;
      const y2 = child.y + BRANCH_NODE_HEIGHT / 2;
      const mid = (x1 + x2) / 2;
      paths.push(`<path d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" class="edge"/>`);
    }
  }

  const cards = layout.items
    .map((item) => {
      const node = item.node;
      const active = node.id === activeId;
      const classes = ['card', active ? 'active' : '', node.auto ? 'auto' : '', node.favorite ? 'fav' : '']
        .filter(Boolean)
        .join(' ');
      return `<button class="${classes}" style="left:${item.x}px;top:${item.y}px" data-id="${esc(node.id)}">
        <span class="star">${node.favorite ? '★' : '☆'}</span>
        <span class="label">${esc(node.label)}</span>
        ${active ? '<span class="badge">当前</span>' : ''}
        <span class="meta">第 ${node.messageCount} 句 · 羁绊 ${node.bondXp} · 手账 ${node.memories.length}</span>
        <span class="time">${esc(formatTime(node.createdAt))}${node.auto ? ' · 自动' : ''}</span>
      </button>`;
    })
    .join('');

  const exportNodes: ExportNode[] = layout.items.map((item) => ({
    id: item.node.id,
    label: item.node.label,
    messageCount: item.node.messageCount,
    bondXp: item.node.bondXp,
    createdAt: item.node.createdAt,
    auto: Boolean(item.node.auto),
    favorite: Boolean(item.node.favorite),
    active: item.node.id === activeId,
    memories: item.node.memories.map((m) => ({ text: m.text, pinned: Boolean(m.pinned) })),
    messages: item.node.messages.map((m) => ({ role: m.role, content: visibleText(m.content) })),
  }));

  const data = {
    character: { name: character.name, title: character.title ?? '' },
    exportedAt: Date.now(),
    nodes: exportNodes,
  };

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(character.name)} · 剧情分支树</title>
<style>
  :root {
    --deep: #0B1022; --purple: #241C3D; --gold: #DCC39A; --pink: #E7B5D5;
    --text: #F7F3FA; --sub: #B8B6CD;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: var(--deep); color: var(--text);
    font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; }
  body { background:
    radial-gradient(70% 50% at 70% 0%, rgba(231,181,213,0.10), transparent 70%),
    radial-gradient(80% 60% at 20% 30%, rgba(36,28,61,0.8), transparent 70%),
    var(--deep); }
  header { padding: 22px 26px 12px; border-bottom: 1px solid rgba(220,195,154,0.18); }
  h1 { margin: 0; font-family: "Noto Serif SC", "Songti SC", serif; font-size: 20px;
    font-weight: 500; letter-spacing: 0.14em; color: var(--gold); }
  header p { margin: 7px 0 0; font-size: 11.5px; color: var(--sub); line-height: 1.7; }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px;
    align-items: center; padding: 12px 26px; background: rgba(11,16,34,0.86);
    backdrop-filter: blur(12px); border-bottom: 1px solid rgba(220,195,154,0.12); }
  .toolbar input { flex: 1; max-width: 420px; padding: 9px 14px; border-radius: 999px;
    border: 1px solid rgba(220,195,154,0.35); background: rgba(23,27,50,0.8);
    color: var(--text); outline: none; font-size: 12px; }
  .toolbar input:focus { border-color: var(--pink); box-shadow: 0 0 16px rgba(231,181,213,0.2); }
  .toolbar .count { font-size: 11px; color: var(--sub); }
  .scroller { overflow: auto; padding: 22px 26px 40px; }
  .canvas { position: relative; margin: 0 auto; }
  .canvas svg { position: absolute; inset: 0; pointer-events: none; }
  .edge { fill: none; stroke: rgba(220,195,154,0.3); stroke-width: 1.4; stroke-dasharray: 3 4; }
  .card { position: absolute; width: ${BRANCH_NODE_WIDTH}px; height: ${BRANCH_NODE_HEIGHT}px;
    display: flex; flex-direction: column; gap: 4px; padding: 11px 13px; text-align: left;
    border-radius: 12px; color: var(--text); cursor: pointer;
    background: linear-gradient(160deg, rgba(36,28,61,0.95), rgba(17,22,44,0.96));
    border: 1px solid rgba(220,195,154,0.24);
    box-shadow: 0 10px 24px rgba(0,0,0,0.35); transition: all .18s ease; }
  .card:hover { border-color: rgba(220,195,154,0.55); transform: translateY(-1px); }
  .card.active { border-color: rgba(231,181,213,0.8);
    box-shadow: 0 0 0 2px rgba(231,181,213,0.16), 0 0 24px rgba(231,181,213,0.22); }
  .card.dim { opacity: 0.28; }
  .card.hit { border-color: var(--gold); box-shadow: 0 0 18px rgba(220,195,154,0.3); }
  .star { position: absolute; top: 9px; right: 10px; font-size: 12px; color: rgba(220,195,154,0.45); }
  .card.fav .star { color: var(--gold); text-shadow: 0 0 10px rgba(220,195,154,0.7); }
  .label { font-size: 12.5px; font-weight: 600; padding-right: 30px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  .badge { position: absolute; top: 9px; right: 30px; padding: 1px 5px; font-size: 9px;
    color: var(--gold); border: 1px solid rgba(220,195,154,0.45); border-radius: 4px; }
  .meta { font-size: 10px; color: var(--sub); }
  .time { margin-top: auto; font-size: 9.5px; color: rgba(184,182,205,0.6); }
  .overlay { position: fixed; inset: 0; z-index: 20; display: flex; justify-content: flex-end;
    background: rgba(4,6,14,0.6); backdrop-filter: blur(6px); }
  .overlay[hidden] { display: none; }
  .sheet { width: min(460px, 100%); height: 100%; overflow-y: auto; padding: 22px 22px 40px;
    background: linear-gradient(180deg, #141830, #0d1124);
    border-left: 1px solid rgba(220,195,154,0.25); box-shadow: -30px 0 80px rgba(0,0,0,0.5); }
  .sheet .close { float: right; width: 30px; height: 30px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05);
    color: var(--sub); cursor: pointer; }
  .sheet h2 { margin: 0 0 6px; font-family: "Noto Serif SC", "Songti SC", serif;
    font-size: 17px; color: var(--gold); font-weight: 500; letter-spacing: 0.08em; }
  .sheet .meta { margin-bottom: 14px; }
  .sheet h3 { margin: 18px 0 8px; font-size: 11px; letter-spacing: 0.18em; color: var(--sub); }
  .line { margin: 0 0 9px; font-size: 12.5px; line-height: 1.8; color: rgba(247,243,250,0.9); }
  .who { display: inline-block; margin-right: 7px; font-size: 10.5px; color: var(--gold); }
  .line.user .who { color: var(--sub); }
  .memory { margin: 0 0 6px; padding-left: 10px; font-size: 11.5px; line-height: 1.7;
    color: var(--sub); border-left: 2px solid rgba(220,195,154,0.3); }
  .memory.pinned { border-left-color: var(--pink); color: var(--text); }
  footer { padding: 0 26px 26px; font-size: 10.5px; color: rgba(184,182,205,0.55); }
  @media (max-width: 640px) {
    header, .toolbar { padding-left: 14px; padding-right: 14px; }
    .scroller { padding: 14px; }
    .sheet { width: 100%; }
  }
</style>
</head>
<body>
<header>
  <h1>🌿 ${esc(character.name)} · 剧情分支树</h1>
  <p>${esc(character.title ?? '')} ｜ ${nodes.length} 个存档点 ｜ 导出于 ${esc(formatTime(Date.now()))}<br />
  点击任意节点查看完整台词与这一刻的羁绊手账。</p>
</header>
<div class="toolbar">
  <input id="search" type="search" placeholder="搜索台词 / 手账…" />
  <span class="count" id="count">${nodes.length} 个节点</span>
</div>
<div class="scroller">
  <div class="canvas" style="width:${Math.max(layout.width, 320)}px;height:${Math.max(layout.height, 160)}px">
    <svg width="${layout.width}" height="${layout.height}">${paths.join('')}</svg>
    ${cards}
  </div>
</div>
<footer>由《星语剧场 Starry Theater》导出的静态分支树，所有数据均来自本地存档。</footer>
<div class="overlay" id="overlay" hidden>
  <div class="sheet" role="dialog" aria-modal="true">
    <button class="close" id="close">✕</button>
    <div id="sheet-body"></div>
  </div>
</div>
<script>
const DATA = ${safeJson(data)};
const overlay = document.getElementById('overlay');
const body = document.getElementById('sheet-body');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function openNode(id) {
  const node = DATA.nodes.find((n) => n.id === id);
  if (!node) return;
  const memories = node.memories.map((m) =>
    '<p class="memory' + (m.pinned ? ' pinned' : '') + '">' + (m.pinned ? '【刻骨铭心】' : '') + esc(m.text) + '</p>'
  ).join('');
  const lines = node.messages.map((m) =>
    '<p class="line ' + m.role + '"><span class="who">' + (m.role === 'user' ? '你' : esc(DATA.character.name)) + '</span>' +
    esc(m.content).replace(/\\n/g, '<br />') + '</p>'
  ).join('');
  body.innerHTML =
    '<h2>' + esc(node.label) + '</h2>' +
    '<p class="meta">第 ' + node.messageCount + ' 句 · 羁绊 ' + node.bondXp + ' · 手账 ' + node.memories.length + ' 条' +
    (node.auto ? ' · 自动存档' : '') + '</p>' +
    (memories ? '<h3>这一刻的羁绊手账</h3>' + memories : '') +
    '<h3>台词</h3>' + (lines || '<p class="line">（还没有台词）</p>');
  overlay.hidden = false;
}
document.getElementById('close').addEventListener('click', () => { overlay.hidden = true; });
overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.hidden = true; });
document.querySelectorAll('.card').forEach((card) => {
  card.addEventListener('click', () => openNode(card.dataset.id));
});
const input = document.getElementById('search');
const count = document.getElementById('count');
input.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  let hits = 0;
  DATA.nodes.forEach((node) => {
    const card = document.querySelector('.card[data-id="' + node.id + '"]');
    if (!card) return;
    const hay = (node.label + ' ' + node.messages.map((m) => m.content).join(' ') + ' ' + node.memories.map((m) => m.text).join(' ')).toLowerCase();
    const match = !q || hay.includes(q);
    card.classList.toggle('dim', !match);
    card.classList.toggle('hit', Boolean(q) && match);
    if (match) hits += 1;
  });
  count.textContent = q ? hits + ' / ' + DATA.nodes.length + ' 个节点命中' : DATA.nodes.length + ' 个节点';
});
</script>
</body>
</html>`;
}
