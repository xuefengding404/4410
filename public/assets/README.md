# 官方默认素材

## 艾拉立绘（透明 PNG）

```
public/assets/ella/
  ella-smile.png     常态微笑（伸手）
  ella-happy.png     开心眨眼（眨眼指人）
  ella-shy.png       害羞脸红（双手交握）
  ella-think.png     认真思考（托腮）
```

- 四张都是 1086×1448 左右的透明底 PNG，直接贴底显示。
- 想换成自己的图：覆盖同名文件即可，页面会自动优先使用图片。
- 只有文件缺失时，才会回退到内联 SVG 占位。

## 默认场景

```
public/assets/bg/
  rain-cafe.jpg      雨夜咖啡馆（1600×900）
```

「雨夜咖啡馆」默认使用这张实景图；图片缺失时自动回退到紫黑渐变 + 细雨粒子。
「午后阳光卧室」使用纯渐变 + 暖光星尘，不需要图片。

## 重新处理 / 生成

```bash
pnpm prepare:ella   # 从桌面原图裁切立绘、压缩场景图（Python + Pillow）
pnpm assets         # 重新生成 PWA 图标
```
