import { store } from '../../app/store';
import { generateImage, ImageGenError } from '../../core/imageGen';
import { h } from '../dom';
import { button, row, textArea } from '../form';
import { openModal, toast } from '../modal';

export interface ImageGenRequest {
  kind: 'sprite' | 'scene';
  label: string;
  onImage: (src: string) => Promise<void>;
}

/**
 * 中立的生图入口：输入框永远为空，提示词 100% 由用户自己写。
 */
export function openImageGen(request: ImageGenRequest): void {
  const modal = openModal({
    title: `🔌 调用我的生图接口 · ${request.label || (request.kind === 'sprite' ? '立绘' : '场景')}`,
    subtitle: '请求直接发往你在「API 设置」里填写的个人生图接口；提示词完全由你自主编写与掌控。',
    size: 'sm',
  });

  const area = textArea({
    value: '',
    rows: 5,
    placeholder: '在此输入你自己的生图提示词…',
  });
  const status = h('p', { class: 'note' }, '');
  const runBtn = button('✦ 发送至我的接口生成', () => void run(), 'primary');

  modal.body.append(
    area,
    status,
    row(runBtn, button('取消', () => modal.close(), 'ghost')),
    h('p', { class: 'note' }, '本应用不内置任何生图提示词，也不会替你改写或补全。'),
  );
  area.focus();

  async function run(): Promise<void> {
    const prompt = area.value.trim();
    if (!prompt) {
      toast('请先输入你的提示词', 'info');
      area.focus();
      return;
    }
    runBtn.disabled = true;
    const original = runBtn.textContent;
    runBtn.textContent = '生成中…';
    status.textContent = '正在请求你的生图接口…';
    try {
      const src = await generateImage(prompt, store.api);
      status.textContent = '已生成，正在写回素材…';
      await request.onImage(src);
      modal.close();
      toast('生图回填成功', 'info');
    } catch (err) {
      const e = err as { message?: string; hint?: string };
      status.textContent = `${e.message ?? '生成失败'}${e.hint ? `｜${e.hint}` : ''}`;
      if (err instanceof ImageGenError) toast(e.hint ?? e.message ?? '生成失败', 'error', 6000);
      else toast(e.message ?? '生成失败', 'error', 6000);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = original ?? '✦ 发送至我的接口生成';
    }
  }
}
