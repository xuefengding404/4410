import { h, must } from './dom';

export interface ModalOptions {
  title: string;
  subtitle?: string;
  /** 弹窗宽度：默认 860px，移动端自动占满 */
  size?: 'sm' | 'md' | 'lg';
  onClose?: () => void;
}

export interface ModalHandle {
  body: HTMLElement;
  headerExtra: HTMLElement;
  close: () => void;
  refresh: () => void;
}

let openCount = 0;

export function openModal(options: ModalOptions): ModalHandle {
  const root = must('#modal-root');
  root.hidden = false;
  const isNested = openCount > 0;
  openCount += 1;

  const panel = h('div', { class: `modal-panel modal-${options.size ?? 'md'}` });
  const headerExtra = h('div', { class: 'modal-extra' });
  const body = h('div', { class: 'modal-body' });

  const closeBtn = h('button', { class: 'modal-close', type: 'button', 'aria-label': '关闭' }, '✕');
  const header = h(
    'header',
    { class: 'modal-head' },
    h(
      'div',
      { class: 'modal-titles' },
      h('h2', { class: 'modal-title' }, options.title),
      options.subtitle ? h('p', { class: 'modal-subtitle' }, options.subtitle) : null,
    ),
    headerExtra,
    closeBtn,
  );

  panel.append(header, body);
  const backdrop = h('div', { class: `modal-backdrop${isNested ? ' nested' : ''}` });
  backdrop.append(panel);
  root.append(backdrop);

  const handle: ModalHandle = {
    body,
    headerExtra,
    close: () => closeModal(backdrop, options.onClose),
    refresh: () => body.dispatchEvent(new CustomEvent('modal:refresh')),
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    // 只关闭最上面一层，避免嵌套弹窗（立绘 → 魔棒 / 生图）被一起关掉
    const container = document.getElementById('modal-root');
    if (container && container.lastElementChild !== backdrop) return;
    handle.close();
    window.removeEventListener('keydown', onKey);
  };
  window.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', () => {
    handle.close();
    window.removeEventListener('keydown', onKey);
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      handle.close();
      window.removeEventListener('keydown', onKey);
    }
  });

  requestAnimationFrame(() => backdrop.classList.add('in'));
  return handle;
}

function closeModal(backdrop: HTMLElement, onClose?: () => void): void {
  backdrop.classList.remove('in');
  onClose?.();
  setTimeout(() => {
    backdrop.remove();
    openCount = Math.max(0, openCount - 1);
    const root = document.getElementById('modal-root');
    if (root && root.children.length === 0) root.hidden = true;
  }, 220);
}

export function closeAllModals(): void {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.querySelectorAll('.modal-backdrop').forEach((b) => (b as HTMLElement).classList.remove('in'));
  setTimeout(() => {
    root.innerHTML = '';
    root.hidden = true;
    openCount = 0;
  }, 220);
}

export type ToastKind = 'info' | 'memory' | 'error' | 'bond';

export function toast(message: string, kind: ToastKind = 'info', ms = 3200): void {
  const root = must('#toast-root');
  const icon = kind === 'memory' ? '✦' : kind === 'bond' ? '♡' : kind === 'error' ? '!' : '✦';
  const el = h('div', { class: `toast toast-${kind}` }, h('span', { class: 'toast-icon' }, icon), h('span', { class: 'toast-text' }, message));
  root.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export function setBusy(text: string | null): void {
  const hint = must('#busy-hint');
  const label = must('#busy-text');
  if (!text) {
    hint.hidden = true;
    return;
  }
  label.textContent = text;
  hint.hidden = false;
}

export function confirmDialog(title: string, message: string, confirmText = '确定'): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = openModal({ title, size: 'sm' });
    modal.body.append(
      h('p', { class: 'confirm-text' }, message),
      h(
        'div',
        { class: 'modal-actions' },
        h(
          'button',
          {
            class: 'btn btn-ghost',
            type: 'button',
            onclick: () => {
              modal.close();
              resolve(false);
            },
          },
          '取消',
        ),
        h(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            onclick: () => {
              modal.close();
              resolve(true);
            },
          },
          confirmText,
        ),
      ),
    );
  });
}
