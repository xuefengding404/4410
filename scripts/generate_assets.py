"""Generate the bundled placeholder art (PNG). Runs fully offline.

Outputs:
  public/assets/ella/*.png      four expressions for Ella
  public/assets/bg/*.png        two default scenes
  public/icons/icon-192.png      PWA icon
  public/icons/icon-512.png

The art is intentionally minimal / atmospheric: it is a stand-in that players
replace with their own character art by dropping a file with the same name.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SPRITE_DIR = ROOT / "public" / "assets" / "ella"
BG_DIR = ROOT / "public" / "assets" / "bg"
ICON_DIR = ROOT / "public" / "icons"

GOLD = (220, 195, 154)
PINK = (231, 181, 213)
CREAM = (247, 243, 250)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def vertical_gradient(size: tuple[int, int], top, bottom) -> Image.Image:
    w, h = size
    column = Image.new("RGB", (1, h))
    px = column.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return column.resize((w, h)).convert("RGBA")


def radial_glow(size: int, color, alpha: int = 160) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    steps = 24
    for i in range(steps, 0, -1):
        r = size / 2 * i / steps
        a = int(alpha * (1 - i / steps) ** 2)
        draw.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), fill=color + (a,))
    return img.filter(ImageFilter.GaussianBlur(size / 40))


def star(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, color, a: int = 220) -> None:
    draw.polygon(
        [
            (x, y - r),
            (x + r * 0.28, y - r * 0.28),
            (x + r, y),
            (x + r * 0.28, y + r * 0.28),
            (x, y + r),
            (x - r * 0.28, y + r * 0.28),
            (x - r, y),
            (x - r * 0.28, y - r * 0.28),
        ],
        fill=color + (a,),
    )


def make_sprite(filename: str, hair, skin, expression: str) -> None:
    w, h = 760, 1080
    head_r = w * 0.118
    head_cy = h * 0.252
    neck_w = head_r * 0.34
    shoulder_w = head_r * 1.62
    waist_w = head_r * 0.92
    hem_w = head_r * 2.05
    cx = w / 2
    hair_dark = tuple(max(0, int(c * 0.8)) for c in hair)
    dress_top = (58, 45, 92)
    dress_bottom = (30, 23, 52)

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow = radial_glow(980, PINK, 95)
    canvas.alpha_composite(glow, (int(cx - 490), int(h * 0.22 - 490)))

    body = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)

    # hair behind (kept inside the shoulder line so it never peeks through the dress)
    d.polygon(
        [
            (cx - head_r * 0.85, head_cy - head_r * 0.4),
            (cx - head_r * 1.12, head_cy + head_r * 1.15),
            (cx - head_r * 0.98, h * 0.5),
            (cx - head_r * 0.55, h * 0.53),
            (cx - head_r * 0.38, head_cy + head_r * 1.02),
            (cx + head_r * 0.38, head_cy + head_r * 1.02),
            (cx + head_r * 0.55, h * 0.53),
            (cx + head_r * 0.98, h * 0.5),
            (cx + head_r * 1.12, head_cy + head_r * 1.15),
            (cx + head_r * 0.85, head_cy - head_r * 0.4),
        ],
        fill=hair_dark + (255,),
    )

    # neck (dress collar will cover its base)
    d.rounded_rectangle(
        (cx - neck_w, head_cy + head_r * 0.55, cx + neck_w, head_cy + head_r * 1.75),
        radius=neck_w,
        fill=skin + (255,),
    )

    # dress: soft shoulders, waist, long skirt
    dress = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dress)
    dd.ellipse(
        (cx - shoulder_w, head_cy + head_r * 0.85, cx + shoulder_w, head_cy + head_r * 2.55),
        fill=dress_top + (255,),
    )
    dd.polygon(
        [
            (cx - shoulder_w * 0.95, head_cy + head_r * 1.5),
            (cx - waist_w, h * 0.63),
            (cx - hem_w, h * 0.9),
            (cx - hem_w * 1.02, h),
            (cx + hem_w * 1.02, h),
            (cx + hem_w, h * 0.9),
            (cx + waist_w, h * 0.63),
            (cx + shoulder_w * 0.95, head_cy + head_r * 1.5),
        ],
        fill=dress_top + (255,),
    )
    dress = dress.filter(ImageFilter.GaussianBlur(4))
    shade = vertical_gradient((w, h), dress_top, dress_bottom)
    shade.putalpha(dress.split()[-1].point(lambda a: int(a * 0.7)))
    body.alpha_composite(Image.alpha_composite(dress, shade))

    # brooch
    d.polygon(
        [
            (cx, h * 0.47 - 9),
            (cx + 3, h * 0.47 - 3),
            (cx + 9, h * 0.47),
            (cx + 3, h * 0.47 + 3),
            (cx, h * 0.47 + 9),
            (cx - 3, h * 0.47 + 3),
            (cx - 9, h * 0.47),
            (cx - 3, h * 0.47 - 3),
        ],
        fill=GOLD + (220,),
    )

    # head + hair front
    d.ellipse(
        (cx - head_r, head_cy - head_r * 1.12, cx + head_r, head_cy + head_r * 1.1),
        fill=skin + (255,),
    )
    hair_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hair_layer)
    hd.pieslice(
        (cx - head_r * 1.08, head_cy - head_r * 1.36, cx + head_r * 1.08, head_cy + head_r * 0.5),
        180,
        360,
        fill=hair + (255,),
    )
    hd.polygon(
        [
            (cx - head_r * 1.05, head_cy - head_r * 0.5),
            (cx - head_r * 0.5, head_cy + head_r * 0.02),
            (cx - head_r * 0.1, head_cy - head_r * 0.62),
            (cx + head_r * 0.42, head_cy + head_r * 0.0),
            (cx + head_r * 0.95, head_cy - head_r * 0.45),
            (cx + head_r * 1.05, head_cy - head_r * 0.85),
            (cx + head_r * 0.65, head_cy - head_r * 1.15),
            (cx - head_r * 0.65, head_cy - head_r * 1.15),
        ],
        fill=hair + (255,),
    )
    for sign in (-1, 1):
        hd.polygon(
            [
                (cx + sign * head_r * 0.92, head_cy - head_r * 0.85),
                (cx + sign * head_r * 1.18, head_cy + head_r * 0.4),
                (cx + sign * head_r * 1.02, head_cy + head_r * 1.5),
                (cx + sign * head_r * 0.7, head_cy + head_r * 0.35),
            ],
            fill=hair_dark + (255,),
        )
    body.alpha_composite(hair_layer.filter(ImageFilter.GaussianBlur(1.2)))

    # gold rim
    rim = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rim.paste(GOLD + (255,), (0, 0, w, h), body.split()[-1])
    rim = rim.filter(ImageFilter.GaussianBlur(10))
    rim.putalpha(rim.split()[-1].point(lambda a: int(a * 0.22)))
    for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
        canvas.alpha_composite(rim, (dx, dy))
    canvas.alpha_composite(body)

    # face
    face = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(face)
    eye_y = h * 0.256
    eye_dx = 34
    ink = (62, 44, 66, 205)
    if expression == "shy":
        for dx in (-eye_dx, eye_dx):
            fd.arc((cx + dx - 16, eye_y - 6, cx + dx + 16, eye_y + 15), 200, 340, fill=ink, width=3)
        blush = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        bd = ImageDraw.Draw(blush)
        bd.ellipse((cx - 112, eye_y + 26, cx - 54, eye_y + 62), fill=(235, 140, 170, 95))
        bd.ellipse((cx + 54, eye_y + 26, cx + 112, eye_y + 62), fill=(235, 140, 170, 95))
        canvas.alpha_composite(blush.filter(ImageFilter.GaussianBlur(11)))
    elif expression == "surprise":
        for dx in (-eye_dx, eye_dx):
            fd.ellipse((cx + dx - 12, eye_y - 13, cx + dx + 12, eye_y + 13), outline=ink, width=3)
            fd.ellipse((cx + dx - 5, eye_y - 5, cx + dx + 5, eye_y + 5), fill=(90, 62, 96, 210))
        fd.ellipse((cx - 8, eye_y + 38, cx + 8, eye_y + 56), outline=(150, 98, 112, 200), width=3)
    elif expression == "sad":
        for dx in (-eye_dx, eye_dx):
            fd.arc((cx + dx - 18, eye_y, cx + dx + 18, eye_y + 18), 20, 160, fill=ink, width=3)
        fd.arc((cx - 15, eye_y + 52, cx + 15, eye_y + 68), 200, 340, fill=(150, 98, 112, 190), width=2)
    else:
        for dx in (-eye_dx, eye_dx):
            fd.arc((cx + dx - 18, eye_y - 10, cx + dx + 18, eye_y + 14), 200, 340, fill=ink, width=4)
        fd.arc((cx - 14, eye_y + 40, cx + 14, eye_y + 62), 20, 160, fill=(168, 104, 120, 215), width=3)
    canvas.alpha_composite(face)

    # sparkles + hair ornament
    deco = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dc = ImageDraw.Draw(deco)
    star(dc, cx + head_r * 0.78, head_cy - head_r * 0.75, 11, CREAM, 235)
    star(dc, cx - head_r * 0.85, head_cy - head_r * 0.35, 7, PINK, 210)
    for x, y, r, a in [(96, 230, 12, 200), (664, 366, 8, 160), (78, 540, 6, 130), (686, 604, 10, 170)]:
        star(dc, x, y, r, CREAM, a)
    canvas.alpha_composite(deco)

    # fade the hem into the background
    fade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fdd = ImageDraw.Draw(fade)
    for i in range(140):
        a = int(150 * (i / 140) ** 1.4)
        fdd.rectangle((0, h - 140 + i, w, h - 139 + i), fill=(11, 16, 34, a))
    canvas.alpha_composite(fade)

    SPRITE_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(SPRITE_DIR / filename)


def make_balcony() -> None:
    w, h = 1600, 900
    rng = random.Random(7)
    canvas = vertical_gradient((w, h), (7, 10, 24), (36, 28, 61)).convert("RGBA")

    nebula = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    nd = ImageDraw.Draw(nebula)
    for _ in range(80):
        x = rng.randint(-100, w + 100)
        y = rng.randint(-60, int(h * 0.8))
        r = rng.randint(90, 320)
        color = (86, 74, 150) if rng.random() < 0.7 else (120, 80, 130)
        nd.ellipse((x - r, y - r * 0.6, x + r, y + r * 0.6), fill=color + (rng.randint(8, 22),))
    canvas.alpha_composite(nebula.filter(ImageFilter.GaussianBlur(60)))

    canvas.alpha_composite(radial_glow(760, (255, 247, 230), 150), (900, -230))
    d = ImageDraw.Draw(canvas)
    d.ellipse((1112, 78, 1248, 214), fill=(247, 243, 250, 235))
    d.ellipse((1096, 60, 1290, 240), outline=GOLD + (26,), width=2)

    for _ in range(260):
        x = rng.randint(0, w)
        y = rng.randint(0, int(h * 0.85))
        r = rng.choice([0.8, 1, 1.2, 1.6, 2])
        d.ellipse((x - r, y - r, x + r, y + r), fill=CREAM + (rng.randint(70, 220),))
    for x, y, r in [(300, 180, 9), (520, 120, 6), (1420, 300, 7), (200, 380, 5)]:
        star(d, x, y, r, CREAM, 200)

    dark = (6, 8, 18, 235)
    d.rectangle((0, 700, w, h), fill=dark)
    for x in range(40, w, 150):
        d.rectangle((x, 560, x + 18, 710), fill=dark)
    d.rectangle((0, 545, w, 570), fill=dark)
    canvas.alpha_composite(radial_glow(220, (255, 214, 160), 170), (1240, 470))
    d = ImageDraw.Draw(canvas)
    d.ellipse((1332, 566, 1368, 602), fill=(255, 236, 200, 240))

    apply_veil(canvas)
    BG_DIR.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(BG_DIR / "star-balcony.png", quality=92)


def make_desk() -> None:
    w, h = 1600, 900
    canvas = vertical_gradient((w, h), (26, 21, 38), (12, 10, 22)).convert("RGBA")
    canvas.alpha_composite(radial_glow(900, (120, 90, 130), 40), (900, -160))

    win = (90, 90, 660, 560)
    sky = vertical_gradient((win[2] - win[0], win[3] - win[1]), (18, 20, 48), (44, 34, 72))
    canvas.paste(sky, (win[0], win[1]))
    d = ImageDraw.Draw(canvas)
    rng = random.Random(31)
    for _ in range(80):
        x = rng.randint(win[0] + 8, win[2] - 8)
        y = rng.randint(win[1] + 8, win[3] - 8)
        r = rng.choice([0.8, 1.2, 1.6])
        d.ellipse((x - r, y - r, x + r, y + r), fill=CREAM + (rng.randint(90, 220),))

    frame = (36, 30, 54, 255)
    for box in (
        (win[0] - 12, win[1] - 12, win[2] + 12, win[1]),
        (win[0] - 12, win[3], win[2] + 12, win[3] + 12),
        (win[0] - 12, win[1], win[0], win[3]),
        (win[2], win[1], win[2] + 12, win[3]),
    ):
        d.rectangle(box, fill=frame)
    d.rectangle((win[0] - 14, win[1] - 14, win[2] + 14, win[3] + 14), outline=GOLD + (46,), width=2)
    mid_x = win[0] + (win[2] - win[0]) / 2
    mid_y = win[1] + (win[3] - win[1]) / 2
    d.line((mid_x, win[1], mid_x, win[3]), fill=frame, width=10)
    d.line((win[0], mid_y, win[2], mid_y), fill=frame, width=10)
    d.line((mid_x, win[1], mid_x, win[3]), fill=GOLD + (22,), width=1)
    d.line((win[0], mid_y, win[2], mid_y), fill=GOLD + (22,), width=1)

    d.rectangle((0, 640, w, h), fill=(30, 22, 38, 255))
    d.rectangle((0, 632, w, 648), fill=(52, 38, 56, 255))
    d.line((0, 632, w, 632), fill=GOLD + (26,), width=2)

    cone = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cone)
    cd.polygon([(1050, 420), (1330, 420), (1470, 900), (880, 900)], fill=(255, 206, 150, 34))
    canvas.alpha_composite(cone.filter(ImageFilter.GaussianBlur(36)))

    d.rectangle((1188, 560, 1200, 660), fill=(58, 42, 44, 255))
    d.polygon([(1050, 560), (1340, 560), (1300, 430), (1090, 430)], fill=(92, 64, 58, 255))
    d.polygon([(1078, 556), (1312, 556), (1286, 470), (1104, 470)], fill=(255, 214, 166, 90))
    d.line((1050, 560, 1340, 560), fill=(255, 232, 196, 220), width=5)
    canvas.alpha_composite(radial_glow(460, (255, 205, 150), 200), (965, 380))

    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((258, 618, 452, 646), radius=3, fill=(74, 52, 66, 255))
    d.rounded_rectangle((282, 596, 434, 620), radius=3, fill=(52, 38, 60, 255))
    d.line((258, 618, 452, 618), fill=GOLD + (46,), width=1)
    d.ellipse((760, 596, 826, 652), fill=(52, 38, 52, 255))
    d.arc((806, 606, 852, 640), 270, 90, fill=(52, 38, 52, 255), width=6)
    d.ellipse((770, 590, 816, 614), fill=(120, 88, 78, 255))

    steam = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(steam)
    for i in range(3):
        sd.arc((780 + i * 10, 540 - i * 18, 820 + i * 10, 600 - i * 18), 200, 340, fill=CREAM + (36,), width=3)
    canvas.alpha_composite(steam.filter(ImageFilter.GaussianBlur(6)))

    apply_veil(canvas)
    BG_DIR.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(BG_DIR / "night-desk.png", quality=92)


def apply_veil(canvas: Image.Image) -> None:
    w, h = canvas.size
    veil = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    vd = ImageDraw.Draw(veil)
    for i in range(120):
        a = int(70 * (1 - i / 120))
        vd.rectangle((0, i, w, i + 1), fill=(5, 7, 16, a))
        vd.rectangle((0, h - i - 1, w, h - i), fill=(5, 7, 16, a))
    canvas.alpha_composite(veil)


def make_icon(size: int) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad = vertical_gradient((size, size), (42, 36, 80), (11, 16, 34))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    img.paste(grad, (0, 0), mask)
    img.alpha_composite(radial_glow(int(size * 0.9), PINK, 150), (int(size * 0.05), int(size * 0.05)))

    cx, cy, r = size * 0.5, size * 0.48, size * 0.26
    moon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    md = ImageDraw.Draw(moon)
    md.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD + (240,))
    md.ellipse((cx - r * 0.55, cy - r * 1.04, cx + r * 1.3, cy + r * 0.96), fill=(20, 18, 40, 255))
    img = Image.alpha_composite(img, moon)

    d = ImageDraw.Draw(img)
    star(d, size * 0.72, size * 0.7, size * 0.075, PINK, 255)
    star(d, size * 0.3, size * 0.26, size * 0.035, CREAM, 230)
    d.rounded_rectangle(
        (size * 0.06, size * 0.06, size * 0.94, size * 0.94),
        radius=int(size * 0.18),
        outline=GOLD + (90,),
        width=max(1, int(size * 0.008)),
    )
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    img.save(ICON_DIR / f"icon-{size}.png")


def main() -> None:
    # Ella 立绘与雨夜咖啡馆背景来自正式素材（scripts/prepare_ella.py）。
    # 这里只负责生成 PWA 图标，避免覆盖用户放进去的图片。
    make_icon(192)
    make_icon(512)
    print("icons generated")


if __name__ == "__main__":
    main()
