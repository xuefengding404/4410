# PROJECT_SPEC — 给 AI 开发者的项目规约

《星语剧场 (Starry Theater)》是一个**纯本地、自带 API 的视觉小说框架**。
完整需求、视觉规范与验收清单见 **[deepseek_handover_spec.md](./deepseek_handover_spec.md)**，动手前必须先读。

## 技术栈

- Vite 7 + TypeScript 5.9（`strict`）
- Tailwind CSS 4（只用于 reset/工具类；核心视觉在 `src/style.css`）
- 原生 DOM 组件，不引入 React/Vue
- IndexedDB 存全部用户数据；无后端、无遥测、无 CDN 字体

## 不可违反的规则

1. **绝不新增后端**：不做中转、不做云同步、不把 API Key 或聊天内容发到第三方。
2. **不写死生图提示词**：将来加生图通道时，prompt 必须完全由用户输入。
3. **主舞台保持纯净**：
   - 左上只有羁绊徽章；右上只有 4 个按钮：角色工坊 / 羁绊手账 / API 设置 / 设置。
   - 对话框内只有：铭牌、台词、`继续 »`。不要加情绪标签、场景名、音量、跳过、自动、标题。
   - 输入栏只有输入框 + 发送按钮。
   - 新设置项一律放进「设置」面板的对应分页。
4. **不偏离「暗夜星语」配色**：`#0B1022` / `#241C3D` / `#DCC39A` / `#E7B5D5` / `#F7F3FA` / `#B8B6CD` / `#171B32`。
5. **标签不进台词**：任何 `sprite/scene/fx/mem` 标签都必须在显示前被消费掉；流式过程中也不能闪烁。
6. **动效克制**：只在入场、切景、记忆提示、羁绊升级时使用；遵循 `prefers-reduced-motion`。

## 架构约定

- 状态只放在 `store`（`src/app/store.ts`），修改当前角色走 `store.updateCharacter(mutator)`，落盘自动防抖。
- 所有素材以 Blob 存 `assets` 表，通过 `src/storage/assets.ts` 解析为 object URL；**不要**把 base64 塞进状态或 IndexedDB 记录里。
- 官方内置素材路径写在 `SpriteSlot.builtinPath` / `SceneSlot.builtinPath`，解析失败必须回退到 SVG 占位。
- 对话请求只走 `src/core/api.ts`；错误必须转成 `ApiError(message, hint)`，UI 展示 `hint`。
- 演出标签只由 `src/core/tagParser.ts` 解析，不要在别处用正则二次清洗。
- 面板使用 `openModal` + `src/ui/form.ts` 的表单组件，保持视觉一致。
- 新增依赖前先判断能否用浏览器原生能力替代；包体越大，纯本地体验越差。

## 构建与验收

```bash
pnpm typecheck   # 必须零报错
pnpm build       # 必须成功
pnpm mock        # 本地假 SSE（4180）
pnpm e2e         # 无头浏览器跑通主流程并出截图
```

改动 UI 后必须截图自检：桌面 1440×900 与手机 390×844 各一张，确认无溢出、无遮挡、文字对比度足够。

## 已知边界

- `@imgly/background-removal` 首次使用需联网下载模型（约 40MB），之后走浏览器缓存；失败自动降级。
- 自定义 TTS 若浏览器报 CORS，需要用户在本地服务端允许跨域；UI 已给出排查提示。
- `file://` 直开时 IndexedDB / Service Worker 可能受限，推荐 `pnpm dev` 或部署到本地静态服务器 / PWA。
