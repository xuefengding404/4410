"""Copy the four Ella sprite PNGs and the rainy-cafe background into public/assets.

The ChatGPT exports already come with a clean transparent background, so all we
do is trim the transparent margin (and keep the original alpha everywhere).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

DESKTOP = Path(r"C:\Users\YANGdamowang.DESKTOP-U9R3T5U\Desktop")
ROOT = Path(__file__).resolve().parents[1]
SPRITE_DIR = ROOT / "public" / "assets" / "ella"
BG_DIR = ROOT / "public" / "assets" / "bg"

SOURCES = {
    "ella-smile.png": "ChatGPT 图像 2026年11月23日 12_30_10.png",  # gentle smile, hand out
    "ella-happy.png": "ChatGPT 图像 2026年11月23日 12_30_16.png",  # wink + finger
    "ella-shy.png": "ChatGPT 图像 2026年11月23日 12_30_21.png",    # blush, hands clasped
    "ella-think.png": "ChatGPT 图像 2026年11月23日 12_30_27.png",  # hand on chin
}


def trim(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGBA")
    alpha = np.asarray(img)[:, :, 3]
    ys, xs = np.where(alpha > 24)
    if len(xs) == 0:
        raise SystemExit(f"{src.name}: no opaque pixels")
    pad = 10
    box = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(img.width, int(xs.max()) + pad),
        min(img.height, int(ys.max()) + pad),
    )
    out = img.crop(box)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, optimize=True)
    print(f"{dst.name}: {out.width}x{out.height} {dst.stat().st_size // 1024} KB")


def prepare_scene() -> None:
    src = DESKTOP / "f861d725c54f71c2685136e4978807c6.png"
    img = Image.open(src).convert("RGB").resize((1600, 900), Image.LANCZOS)
    dst = BG_DIR / "rain-cafe.jpg"
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, quality=90, optimize=True)
    print(f"{dst.name}: {dst.stat().st_size // 1024} KB")


def main() -> None:
    for filename, source in SOURCES.items():
        trim(DESKTOP / source, SPRITE_DIR / filename)
    prepare_scene()


if __name__ == "__main__":
    main()
