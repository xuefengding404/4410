import { h } from './dom';

export interface FieldOptions {
  label?: string;
  hint?: string;
  inline?: boolean;
}

export function field(label: string, control: Node, hint?: string): HTMLElement {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );
}

export function textInput(options: {
  value?: string;
  placeholder?: string;
  type?: string;
  onInput?: (value: string) => void;
  onEnter?: () => void;
  monospace?: boolean;
}): HTMLInputElement {
  const input = h('input', {
    class: `input${options.monospace ? ' mono' : ''}`,
    type: options.type ?? 'text',
    value: options.value ?? '',
    placeholder: options.placeholder ?? '',
    spellcheck: false,
  });
  input.addEventListener('input', () => options.onInput?.(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') options.onEnter?.();
  });
  return input;
}

export function textArea(options: {
  value?: string;
  placeholder?: string;
  rows?: number;
  onInput?: (value: string) => void;
  monospace?: boolean;
}): HTMLTextAreaElement {
  const area = h('textarea', {
    class: `input textarea${options.monospace ? ' mono' : ''}`,
    rows: options.rows ?? 4,
    placeholder: options.placeholder ?? '',
    spellcheck: false,
  }) as HTMLTextAreaElement;
  area.value = options.value ?? '';
  area.addEventListener('input', () => options.onInput?.(area.value));
  return area;
}

export function slider(options: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  hint?: string;
  format?: (value: number) => string;
  onInput: (value: number) => void;
}): HTMLElement {
  const readout = h('span', { class: 'slider-value' }, options.format?.(options.value) ?? String(options.value));
  const input = h('input', {
    class: 'slider',
    type: 'range',
    min: String(options.min),
    max: String(options.max),
    step: String(options.step ?? 1),
    value: String(options.value),
  }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const value = Number(input.value);
    readout.textContent = options.format?.(value) ?? String(value);
    options.onInput(value);
  });
  return h(
    'div',
    { class: 'field field-slider' },
    h('div', { class: 'field-row' }, h('span', { class: 'field-label' }, options.label), readout),
    input,
    options.hint ? h('span', { class: 'field-hint' }, options.hint) : null,
  );
}

export function select(options: {
  label?: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
}): HTMLElement {
  const el = h('select', { class: 'input select' }) as HTMLSelectElement;
  for (const item of options.items) {
    const opt = h('option', { value: item.value }, item.label);
    if (item.value === options.value) opt.selected = true;
    el.append(opt);
  }
  el.addEventListener('change', () => options.onChange(el.value));
  return options.label ? field(options.label, el) : el;
}

export function toggle(options: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): HTMLElement {
  const input = h('input', { type: 'checkbox', class: 'switch-input' }) as HTMLInputElement;
  input.checked = options.checked;
  input.addEventListener('change', () => options.onChange(input.checked));
  return h(
    'label',
    { class: 'switch-row' },
    h('span', { class: 'switch-copy' }, h('span', { class: 'field-label' }, options.label), options.hint ? h('span', { class: 'field-hint' }, options.hint) : null),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' }))),
  );
}

export function button(text: string, onClick: () => void, kind: 'primary' | 'ghost' | 'danger' | 'soft' = 'soft'): HTMLButtonElement {
  return h('button', { class: `btn btn-${kind}`, type: 'button', onclick: onClick }, text);
}

export function section(title: string, hint?: string): HTMLElement {
  return h(
    'div',
    { class: 'section-head' },
    h('h3', { class: 'section-title' }, title),
    hint ? h('p', { class: 'section-hint' }, hint) : null,
  );
}

export function row(...children: (Node | null | false)[]): HTMLElement {
  return h('div', { class: 'btn-row' }, ...children.map((c) => c || null));
}

export function emptyState(text: string, action?: Node): HTMLElement {
  return h('div', { class: 'empty-state' }, h('span', { class: 'empty-star' }, '✦'), h('p', {}, text), action ?? null);
}
