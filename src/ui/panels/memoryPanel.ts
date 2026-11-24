import { store } from '../../app/store';
import { audio } from '../../audio/audioEngine';
import { bondInfo, type MemoryEntry, type MemoryKind } from '../../types';
import { formatTime, h } from '../dom';
import { button, emptyState, row, section, textArea } from '../form';
import { confirmDialog, openModal, toast } from '../modal';

const KIND_LABEL: Record<MemoryKind, string> = {
  fact: '事实',
  promise: '约定',
  preference: '偏好',
  moment: '瞬间',
};

export function openMemoryPanel(): void {
  const modal = openModal({
    title: '羁绊手账',
    subtitle: '被记住的小事，会慢慢变成你们之间的默契。',
    size: 'md',
  });
  render(modal.body);
}

function render(body: HTMLElement): void {
  const character = store.character;
  const info = bondInfo(character.bondXp);
  body.replaceChildren();

  body.append(
    h(
      'div',
      { class: 'bond-hero' },
      h(
        'div',
        { class: 'bond-hero-level' },
        h('span', { class: 'bond-hero-name' }, `Lv.${info.level} · ${info.name}`),
        h('span', { class: 'bond-hero-xp' }, `${character.bondXp} 点羁绊`),
      ),
      h('div', { class: 'bond-track large' }, h('i', { style: { width: `${Math.round(info.progress * 100)}%` } })),
      h('p', { class: 'note' }, `已经聊过 ${character.messages.filter((m) => m.role === 'assistant').length} 轮，记下 ${character.memories.length} 件事。`),
    ),
    h(
      'div',
      { class: 'memory-add' },
      textArea({ value: '', rows: 2, placeholder: '写下一件希望 Ta 永远记得的事…（Ctrl+Enter 保存）' }),
    ),
  );

  const addArea = body.querySelector('textarea')!;
  const addBtn = button('写进手账', () => {
    const text = addArea.value.trim();
    if (!text) return;
    store.addMemory(text, { source: 'manual', kind: 'fact' });
    addArea.value = '';
    audio.chime('memory');
    toast('已写入羁绊手账', 'memory');
    render(body);
  }, 'primary');
  addArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addBtn.click();
    }
  });
  body.append(row(addBtn));

  const pinned = character.memories.filter((m) => m.pinned);
  const others = character.memories.filter((m) => !m.pinned);

  body.append(
    h('div', { class: 'divider' }),
    section('刻骨铭心', '每次对话都会带上这些记忆，优先级最高。'),
  );
  if (pinned.length === 0) {
    body.append(emptyState('还没有置顶的记忆。点开任意一条，选「置顶」。'));
  } else {
    body.append(renderList(pinned, body));
  }

  body.append(h('div', { class: 'divider' }), section('其他记忆', '会根据话题自动召回最相关的几条。'));
  if (others.length === 0) {
    body.append(emptyState('手账还是空的，慢慢来吧。'));
  } else {
    body.append(renderList(others, body));
  }
}

function renderList(memories: MemoryEntry[], body: HTMLElement): HTMLElement {
  const list = h('div', { class: 'memory-list' });
  for (const memory of memories) {
    const item = h('div', { class: `memory-item kind-${memory.kind}${memory.pinned ? ' pinned' : ''}` });
    item.append(
      h(
        'div',
        { class: 'memory-head' },
        h('span', { class: 'memory-kind' }, KIND_LABEL[memory.kind]),
        h('span', { class: 'memory-time' }, formatTime(memory.createdAt)),
        memory.source === 'auto' ? h('span', { class: 'memory-source' }, '自动') : null,
        memory.source === 'import' ? h('span', { class: 'memory-source' }, '导入') : null,
      ),
      h('p', { class: 'memory-text' }, memory.text),
      h(
        'div',
        { class: 'memory-actions' },
        button(memory.pinned ? '取消置顶' : '置顶', () => {
          store.updateCharacter((c) => {
            const target = c.memories.find((m) => m.id === memory.id);
            if (target) target.pinned = !target.pinned;
          });
          render(body);
        }, 'ghost'),
        button('编辑', () => editMemory(memory, body), 'ghost'),
        button('删除', () => {
          void confirmDialog('删除记忆', '这条记忆会从手账里消失，确定吗？', '删除').then((ok) => {
            if (!ok) return;
            store.updateCharacter((c) => {
              c.memories = c.memories.filter((m) => m.id !== memory.id);
            });
            render(body);
          });
        }, 'ghost'),
      ),
    );
    list.append(item);
  }
  return list;
}

function editMemory(memory: MemoryEntry, body: HTMLElement): void {
  const modal = openModal({ title: '编辑记忆', size: 'sm' });
  const area = textArea({ value: memory.text, rows: 4 });
  modal.body.append(
    area,
    row(
      button('保存', () => {
        store.updateCharacter((c) => {
          const target = c.memories.find((m) => m.id === memory.id);
          if (target) target.text = area.value.trim();
        });
        modal.close();
        render(body);
      }, 'primary'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );
}
