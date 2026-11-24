import { store } from '../../app/store';
import { streamChat } from '../../core/api';
import { openModal, toast } from '../modal';
import { button, field, row, section, slider, textInput, toggle } from '../form';
import { h } from '../dom';

export function openApiPanel(): void {
  const modal = openModal({
    title: 'API 设置',
    subtitle: '自带密钥，直连你信任的模型服务。密钥只保存在这台设备的浏览器里。',
    size: 'md',
  });
  render(modal.body);
}

function render(body: HTMLElement): void {
  body.replaceChildren();
  const api = store.api;

  body.append(
    toggle({
      label: '离线体验模式（不需要 Key）',
      checked: api.demoMode,
      hint: '开启时由本地剧本扮演艾拉，不发出任何网络请求；填入 Key 后关掉它即可接入真实模型。',
      onChange: (v) => {
        api.demoMode = v;
        void store.saveApi();
      },
    }),
    h('div', { class: 'divider' }),
    section('主模型', '兼容 OpenAI / DeepSeek 格式的 /chat/completions 接口。'),
    field(
      '接口地址',
      textInput({
        value: api.baseUrl,
        placeholder: 'https://api.deepseek.com/v1',
        monospace: true,
        onInput: (v) => {
          api.baseUrl = v.trim();
          void store.saveApi();
        },
      }),
      'DeepSeek 官方：https://api.deepseek.com/v1 ｜ 本地 Ollama：http://127.0.0.1:11434/v1',
    ),
  );

  const keyInput = textInput({
    value: api.apiKey,
    placeholder: 'sk-...',
    type: 'password',
    monospace: true,
    onInput: (v) => {
      api.apiKey = v.trim();
      void store.saveApi();
    },
  });
  const reveal = h('button', { class: 'input-suffix', type: 'button' }, '显示');
  reveal.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    reveal.textContent = keyInput.type === 'password' ? '显示' : '隐藏';
  });
  body.append(field('API Key', h('div', { class: 'input-wrap' }, keyInput, reveal)));

  body.append(
    field(
      '模型名',
      textInput({
        value: api.model,
        placeholder: 'deepseek-chat',
        onInput: (v) => {
          api.model = v.trim();
          void store.saveApi();
        },
      }),
      'DeepSeek 常用：deepseek-chat（快）/ deepseek-reasoner（更会想）',
    ),
    slider({
      label: '温度',
      min: 0,
      max: 1.6,
      step: 0.05,
      value: api.temperature,
      format: (v) => v.toFixed(2),
      onInput: (v) => {
        api.temperature = v;
        void store.saveApi();
      },
      hint: '越高越自由，越低越稳定。角色对话建议 0.8~1.1。',
    }),
    slider({
      label: '单次回复上限（tokens）',
      min: 200,
      max: 4000,
      step: 100,
      value: api.maxTokens,
      onInput: (v) => {
        api.maxTokens = v;
        void store.saveApi();
      },
    }),
    toggle({
      label: '流式输出（逐字吐字）',
      checked: api.stream,
      hint: '关闭后要等整段生成完才显示，通常没必要关。',
      onChange: (v) => {
        api.stream = v;
        void store.saveApi();
      },
    }),
    slider({
      label: '无响应超时',
      min: 15,
      max: 180,
      step: 5,
      value: Math.round((api.timeoutMs || 90000) / 1000),
      format: (v) => `${v} 秒`,
      onInput: (v) => {
        api.timeoutMs = v * 1000;
        void store.saveApi();
      },
      hint: '超过这个时间没收到新内容就中断并提示，避免真实网络下无限等待。',
    }),
    h('div', { class: 'divider' }),
    section('个人生图接口（可选 · 中立 BYOK 通道）', '配置后可在立绘 / 场景编辑器里点 🔌，用你自己写的提示词调用。本应用不内置任何生图提示词。'),
    field(
      '生图接口地址',
      textInput({
        value: api.imageUrl,
        placeholder: 'https://api.siliconflow.cn/v1/images/generations',
        monospace: true,
        onInput: (v) => {
          api.imageUrl = v.trim();
          void store.saveApi();
        },
      }),
      '兼容 OpenAI /images/generations 格式即可。',
    ),
    h(
      'div',
      { class: 'grid-2' },
      field(
        '生图 API Key',
        textInput({
          value: api.imageKey,
          placeholder: 'sk-...',
          type: 'password',
          monospace: true,
          onInput: (v) => {
            api.imageKey = v.trim();
            void store.saveApi();
          },
        }),
      ),
      field(
        '生图模型名',
        textInput({
          value: api.imageModel,
          placeholder: 'Kwai-Kolors/Kolors',
          onInput: (v) => {
            api.imageModel = v.trim();
            void store.saveApi();
          },
        }),
      ),
    ),
    h('div', { class: 'divider' }),

    h('div', { class: 'divider' }),
    row(
      button('测试连接', () => void testConnection(body), 'primary'),
      button('恢复默认地址', () => {
        api.baseUrl = 'https://api.deepseek.com/v1';
        api.model = 'deepseek-chat';
        void store.saveApi();
        render(body);
      }, 'ghost'),
    ),
    h('p', { class: 'note' }, '🔒 密钥与对话只写入本机 IndexedDB；除你填写的接口地址外，本应用不会向任何服务器发送数据。'),
  );
}

async function testConnection(body: HTMLElement): Promise<void> {
  const status = h('p', { class: 'test-status' }, '正在请求…');
  body.querySelector('.test-status')?.remove();
  body.append(status);
  try {
    const text = await streamChat(
      { ...store.api, stream: false, maxTokens: 24 },
      [
        { role: 'system', content: '你是一个连通性测试。' },
        { role: 'user', content: '只回复两个字：在的' },
      ],
      () => undefined,
    );
    status.textContent = `✓ 连接成功，模型回复：${text.slice(0, 40)}`;
    status.classList.add('ok');
    toast('API 连接正常', 'info');
  } catch (err) {
    const e = err as { message?: string; hint?: string };
    status.textContent = `✕ ${e.message ?? '连接失败'}${e.hint ? ` — ${e.hint}` : ''}`;
    status.classList.add('bad');
  }
}
