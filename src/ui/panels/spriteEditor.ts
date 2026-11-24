import { DEFAULT_CUTOUT, canvasToBlob, cropToContent, detectKeyMode, imageToCanvas, loadImage, magicWand, runCutout } from '../../graphics/cutout';
import { imageToBlob } from '../../core/imageGen';
import { openImageGen } from './imageGenPanel';
import { db } from '../../storage/db';
import { assetUrl } from '../../storage/assets';
import { slugId } from '../../core/defaults';
import { h } from '../dom';
import { button, field, row, section, select, slider, textInput, toggle } from '../form';
import { openModal, setBusy, toast } from '../modal';
import type { CutoutMode, DisplayMode, SpriteKind, SpriteSlot } from '../../types';

export interface SpriteEditorResult {
  slot: SpriteSlot;
}

const CUTOUT_ITEMS: { value: CutoutMode; label: string }[] = [
  { value: 'none', label: '原图直传（透明 PNG / 已抠好的图）' },
  { value: 'white', label: '智能白底抠图（三阶段）' },
  { value: 'green', label: '绿幕抠图（豆包 / 即梦绿幕）' },
  { value: 'ai', label: '本地 AI 语义抠图（较慢，首次需下载模型）' },
];

const DISPLAY_ITEMS: { value: DisplayMode; label: string }[] = [
  { value: 'float', label: '透明悬空立绘' },
  { value: 'tarot', label: '🃏 星光塔罗画框（免抠图）' },
  { value: 'blend', label: '🌌 柔光暗角融合' },
];

export function openSpriteEditor(existing: SpriteSlot | undefined, onSave: (slot: SpriteSlot) => void): void {
  const draft: SpriteSlot = existing
    ? { ...existing }
    : {
        id: slugId('sprite'),
        name: '',
        kind: 'image',
        cutout: 'none',
        display: 'float',
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        pingPong: true,
      };

  const modal = openModal({
    title: existing ? '编辑立绘' : '新设立绘',
    subtitle: '名字会注入 System Prompt，AI 用 <sprite:名字> 就能切换。',
    size: 'lg',
  });

  const previewBox = h('div', { class: 'sprite-preview checker' });
  const previewImg = h('img', { class: 'preview-img', alt: '预览' });
  const previewVideo = h('video', { class: 'preview-img', autoplay: true, loop: true, muted: true, playsinline: true });
  previewVideo.hidden = true;
  previewBox.append(previewImg, previewVideo);

  const nameInput = textInput({
    value: draft.name,
    placeholder: '例如：穿睡衣 / 拿咖啡 / 黑化',
    onInput: (v) => {
      draft.name = v;
    },
  });

  let sourceCanvas: HTMLCanvasElement | null = null;
  let currentCanvas: HTMLCanvasElement | null = null;

  const refreshPreview = async (): Promise<void> => {
    if (draft.kind === 'video' && draft.assetId) {
      const url = await assetUrl(draft.assetId);
      if (url) {
        previewImg.hidden = true;
        previewVideo.hidden = false;
        previewVideo.src = url;
      }
      return;
    }
    if (currentCanvas) {
      previewImg.src = currentCanvas.toDataURL('image/png');
      previewImg.hidden = false;
      previewVideo.hidden = true;
      return;
    }
    if (draft.assetId) {
      const url = await assetUrl(draft.assetId);
      if (url) {
        previewImg.src = url;
        previewImg.hidden = false;
        previewVideo.hidden = true;
      }
    } else if (draft.builtinPath) {
      previewImg.src = draft.builtinPath;
      previewImg.hidden = false;
    }
  };

  const applyCutout = async (): Promise<void> => {
    if (!sourceCanvas) return;
    setBusy(draft.cutout === 'ai' ? '本地 AI 正在识别轮廓…（首次会下载模型）' : '正在抠图…');
    try {
      const { canvas, degraded } = await runCutout(sourceCanvas, draft.cutout, DEFAULT_CUTOUT);
      currentCanvas = canvas;
      const blob = await canvasToBlob(canvas);
      if (draft.assetId) await db.deleteAsset(draft.assetId);
      const record = await db.putAsset(blob, nameInput.value || 'sprite.png', 'image');
      draft.assetId = record.id;
      draft.kind = 'image';
      if (degraded) toast('AI 抠图不可用，已自动降级为白底 + 绿幕算法', 'error', 5000);
      await refreshPreview();
    } finally {
      setBusy(null);
    }
  };

  const cutoutSelect = select({
    value: draft.cutout,
    items: CUTOUT_ITEMS,
    onChange: (v) => {
      draft.cutout = v as CutoutMode;
      if (draft.kind === 'image' && sourceCanvas) void applyCutout();
    },
  }) as HTMLSelectElement;

  const fileInput = h('input', { type: 'file', accept: 'image/*,video/mp4,video/webm', class: 'hidden-input' }) as HTMLInputElement;
  modal.body.append(fileInput);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void (async () => {
      const isVideo = file.type.startsWith('video');
      if (isVideo) {
        draft.kind = 'video';
        draft.cutout = 'green';
        if (draft.assetId) await db.deleteAsset(draft.assetId);
        const record = await db.putAsset(file, file.name, 'video');
        draft.assetId = record.id;
        sourceCanvas = null;
        currentCanvas = null;
        toast('绿幕视频已导入，舞台会实时抠幕并正放+倒放循环', 'info');
        await refreshPreview();
        return;
      }
      draft.kind = 'image';
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        sourceCanvas = imageToCanvas(img, 1500);
        if (draft.cutout === 'none') {
          const suggested = detectKeyMode(sourceCanvas);
          if (suggested !== 'none') {
            draft.cutout = suggested;
            if (cutoutSelect) cutoutSelect.value = suggested;
          }
        }
        await applyCutout();
      } catch {
        toast('这张图片无法读取，换一张试试', 'error');
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
  });

  const displaySelect = select({
    value: draft.display,
    items: DISPLAY_ITEMS,
    onChange: (v) => {
      draft.display = v as DisplayMode;
    },
  });

  const pingPongToggle = toggle({
    label: '视频 Ping-Pong 正放+倒放',
    hint: '解决循环跳帧；关闭则从头循环。',
    checked: draft.pingPong,
    onChange: (v) => {
      draft.pingPong = v;
    },
  });

  modal.body.append(
    section('素材', '支持 PNG / JPG / WebP 静图，以及豆包生成的绿幕 MP4 / WebM 视频。'),
    h(
      'div',
      { class: 'sprite-editor-grid' },
      h(
        'div',
        { class: 'sprite-editor-left' },
        previewBox,
        row(button('上传 / 替换素材', () => fileInput.click(), 'primary')),
        h('p', { class: 'note' }, draft.kind === 'video' ? '视频立绘：舞台会自动逐帧抠绿幕，首次载入需要几秒。' : '白底图建议用「智能白底抠图」；AI 抠图首次需联网下载约 40MB 模型，之后完全本地。'),
      ),
      h(
        'div',
        { class: 'sprite-editor-right' },
        field('立绘名称', nameInput, '同一角色下的名字不要重复。'),
        field('抠图方式', cutoutSelect),
        field('展示形态', displaySelect),
        pingPongToggle,
        slider({
          label: '大小',
          min: 0.4,
          max: 1.8,
          step: 0.02,
          value: draft.scale,
          format: (v) => `${Math.round(v * 100)}%`,
          onInput: (v) => {
            draft.scale = v;
          },
        }),
        slider({
          label: '水平偏移',
          min: -300,
          max: 300,
          step: 5,
          value: draft.offsetX,
          format: (v) => `${v}px`,
          onInput: (v) => {
            draft.offsetX = v;
          },
        }),
        slider({
          label: '垂直偏移',
          min: -200,
          max: 200,
          step: 5,
          value: draft.offsetY,
          format: (v) => `${v}px`,
          onInput: (v) => {
            draft.offsetY = v;
          },
        }),
        row(
          button('🪄 魔棒精修', () => {
            if (!currentCanvas) {
              toast('先上传一张静图，再进行魔棒精修', 'info');
              return;
            }
            openMagicWand(currentCanvas, {
              original: sourceCanvas,
              onRerun: async () => {
                if (!sourceCanvas) return null;
                const { canvas } = await runCutout(sourceCanvas, draft.cutout);
                return canvas;
              },
              onApply: async (canvas) => {
                currentCanvas = canvas;
                const blob = await canvasToBlob(canvas);
                if (draft.assetId) await db.deleteAsset(draft.assetId);
                const record = await db.putAsset(blob, nameInput.value || 'sprite.png', 'image');
                draft.assetId = record.id;
                await refreshPreview();
              },
            });
          }, 'soft'),
          button('🔌 用我的生图接口', () => {
            openImageGen({
              kind: 'sprite',
              label: nameInput.value || '立绘',
              onImage: async (src) => {
                const blob = await imageToBlob(src);
                const url = URL.createObjectURL(blob);
                try {
                  const img = await loadImage(url);
                  sourceCanvas = imageToCanvas(img, 1500);
                  if (draft.cutout === 'none') {
                    const suggested = detectKeyMode(sourceCanvas);
                    if (suggested !== 'none') {
                      draft.cutout = suggested;
                      cutoutSelect.value = suggested;
                    }
                  }
                  await applyCutout();
                } finally {
                  URL.revokeObjectURL(url);
                }
              },
            });
          }, 'soft'),
        ),
      ),
    ),
    row(
      button('保存立绘', () => {
        const name = nameInput.value.trim();
        if (!name) {
          toast('给这张立绘起个名字吧', 'error');
          return;
        }
        if (!draft.assetId && !draft.builtinPath) {
          toast('还没有素材，先上传一张图吧', 'error');
          return;
        }
        onSave({ ...draft, name });
        modal.close();
        toast(`立绘「${name}」已保存`, 'info');
      }, 'primary'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );

  void (async () => {
    // 编辑已有立绘：把已保存的图载入画布，魔棒 / 重跑抠图 / 生图回填都能直接用
    if (!existing || !draft.assetId || draft.kind === 'video') return;
    const url = await assetUrl(draft.assetId);
    if (!url) return;
    try {
      const img = await loadImage(url);
      sourceCanvas = imageToCanvas(img, 1500);
      currentCanvas = sourceCanvas;
    } catch {
      /* 素材损坏时保持空画布 */
    }
  })();

  void refreshPreview();
}

interface WandOptions {
  original: HTMLCanvasElement | null;
  onRerun?: () => Promise<HTMLCanvasElement | null>;
  onApply: (canvas: HTMLCanvasElement) => Promise<void>;
}

function openMagicWand(source: HTMLCanvasElement, options: WandOptions): void {
  const modal = openModal({
    title: '🪄 魔棒点选精修',
    subtitle: '直接点击画面中残留的背景块即可精准擦除，支持多步撤销。',
    size: 'lg',
  });

  const work = cropToContent(source);
  let undoStack: ImageData[] = [];
  let tolerance = 26;

  const canvas = h('canvas', { class: 'wand-canvas' }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const drawFrom = (from: HTMLCanvasElement): void => {
    canvas.width = from.width;
    canvas.height = from.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(from, 0, 0);
  };
  drawFrom(work);

  const status = h('p', { class: 'note' }, '提示：先点大块背景，再逐步精修边缘。');
  const undoCount = h('span', {}, '0');
  const undoBtn = h(
    'button',
    { class: 'btn btn-soft wand-bg-btn', type: 'button', disabled: true },
    '撤销 (',
    undoCount,
    ')',
  ) as HTMLButtonElement;

  const syncUndo = (): void => {
    undoCount.textContent = String(undoStack.length);
    undoBtn.disabled = undoStack.length === 0;
  };

  const pushUndo = (): void => {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > 15) undoStack.shift();
    syncUndo();
  };

  undoBtn.addEventListener('click', () => {
    const last = undoStack.pop();
    if (!last) return;
    ctx.putImageData(last, 0, 0);
    syncUndo();
  });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    pushUndo();
    const removed = magicWand(canvas, x, y, tolerance);
    status.textContent =
      removed > 0 ? `去掉了 ${removed.toLocaleString()} 个像素` : '这里没有可去掉的相近颜色，试试调高容差';
  });

  const wrap = h('div', { class: 'wand-wrap wand-bg-dark' }, canvas);
  const bgButtons: HTMLButtonElement[] = [];

  const setBg = (mode: 'dark' | 'checker' | 'white'): void => {
    wrap.classList.remove('wand-bg-dark', 'wand-bg-checker', 'wand-bg-white');
    wrap.classList.add(`wand-bg-${mode}`);
    bgButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.bg === mode));
  };

  const bgBar = h('div', { class: 'wand-toolbar' });
  for (const [mode, label] of [
    ['dark', '暗夜底'],
    ['checker', '棋盘格'],
    ['white', '白底'],
  ] as const) {
    const btn = h('button', { class: 'btn btn-ghost wand-bg-btn', type: 'button', dataset: { bg: mode } }, label) as HTMLButtonElement;
    btn.addEventListener('click', () => setBg(mode));
    bgButtons.push(btn);
    bgBar.append(btn);
  }
  setBg('dark');

  const rerunBtn = h(
    'button',
    { class: 'btn btn-soft', type: 'button', disabled: !options.onRerun },
    '重跑自动抠图',
  ) as HTMLButtonElement;
  rerunBtn.addEventListener('click', () => {
    if (!options.onRerun) return;
    rerunBtn.disabled = true;
    status.textContent = '正在重跑自动抠图…';
    void options
      .onRerun()
      .then((result) => {
        if (!result) {
          status.textContent = '没有可用的原图，先重新上传素材吧。';
          return;
        }
        drawFrom(cropToContent(result));
        undoStack = [];
        syncUndo();
        status.textContent = '已按当前抠图方式重跑，可继续用魔棒精修。';
      })
      .catch((err: unknown) => {
        status.textContent = err instanceof Error ? err.message : '重跑失败';
      })
      .finally(() => {
        rerunBtn.disabled = false;
      });
  });

  const resetBtn = button('还原原图', () => {
    drawFrom(options.original ?? work);
    undoStack = [];
    syncUndo();
    status.textContent = '已还原到原图。';
  }, 'ghost');

  bgBar.append(undoBtn, rerunBtn, resetBtn);

  modal.body.append(
    bgBar,
    wrapperStatus(wrap, status),
    slider({
      label: '魔棒容差',
      min: 5,
      max: 140,
      step: 1,
      value: tolerance,
      format: (v) => String(v),
      onInput: (v) => {
        tolerance = v;
      },
      hint: '越大，一次去掉的颜色范围越广。',
    }),
    row(
      button('应用并保存', () => {
        void options.onApply(canvas).then(() => {
          modal.close();
          toast('精修结果已保存', 'info');
        });
      }, 'primary'),
      button('取消', () => modal.close(), 'ghost'),
    ),
  );
}

function wrapperStatus(wrap: HTMLElement, status: HTMLElement): HTMLElement {
  return h('div', { class: 'wand-stage' }, wrap, status);
}

