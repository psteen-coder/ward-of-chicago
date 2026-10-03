"""Rasterize Harry's silver pentacle pendant into Android launcher sizes.

A thick ring, a raised five-point star whose points meet the ring, and a bail.
Night field so it still sits with the rest of the game. Not a copy of any
licensed jewelry: no rune band, no maker's mark.
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

NIGHT = (12, 16, 22, 255)
NIGHT_TOP = (22, 32, 42, 255)
SILVER_HI = (236, 242, 246, 255)
SILVER = (186, 198, 208, 255)
SILVER_MID = (132, 146, 158, 255)
SILVER_LO = (78, 88, 98, 255)
STEEL = (126, 176, 200, 255)

LAUNCHER = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}


def night_field(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size))
    pix = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        row = tuple(int(NIGHT_TOP[i] + (NIGHT[i] - NIGHT_TOP[i]) * t) for i in range(3)) + (255,)
        for x in range(size):
            pix[x, y] = row
    return img


def star_points(cx: float, cy: float, r: float):
    pts = []
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    order = [0, 2, 4, 1, 3, 0]
    return [pts[i] for i in order]


def disc(draw: ImageDraw.ImageDraw, c, r, fill):
    draw.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=fill)


def pendant(size: int, inset: float, field: bool) -> Image.Image:
    img = night_field(size) if field else Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Room above the disc for the bail, so the pendant sits a little low.
    box = size * inset
    cx = size / 2
    cy = size / 2 + box * 0.04
    outer = box * 0.40

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        [cx - outer * 1.15, cy - outer * 1.15, cx + outer * 1.15, cy + outer * 1.15],
        fill=(*STEEL[:3], 70),
    )
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius=max(1, size * 0.03))))

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [cx - outer * 0.92, cy - outer * 0.78, cx + outer * 1.05, cy + outer * 1.08],
        fill=(0, 0, 0, 110),
    )
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(radius=max(1, size * 0.02))))

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # Bail and two chain links, thick enough to survive a tiny icon.
    bail_w = max(2, outer * 0.16)
    bail_top = cy - outer - outer * 0.34
    draw.rounded_rectangle(
        [cx - bail_w, bail_top, cx + bail_w, cy - outer + outer * 0.08],
        radius=bail_w,
        fill=SILVER_MID,
    )
    draw.rounded_rectangle(
        [cx - bail_w * 0.55, bail_top + bail_w * 0.35, cx + bail_w * 0.45, cy - outer],
        radius=bail_w * 0.4,
        fill=SILVER_HI,
    )
    link_h = outer * 0.22
    for i, lift in enumerate((0.62, 0.95)):
        top = cy - outer - outer * lift
        draw.rounded_rectangle(
            [cx - bail_w * 0.85, top, cx + bail_w * 0.85, top + link_h],
            radius=link_h / 2,
            outline=SILVER if i == 0 else SILVER_HI,
            width=max(2, int(outer * 0.07)),
        )

    # Outer silver ring, built as stacked discs so the metal has a bevel.
    disc(draw, (cx, cy), outer, SILVER_LO)
    disc(draw, (cx - outer * 0.03, cy - outer * 0.04), outer * 0.97, SILVER)
    disc(draw, (cx - outer * 0.05, cy - outer * 0.07), outer * 0.93, SILVER_HI)
    disc(draw, (cx, cy), outer * 0.86, SILVER_MID)
    inner_r = outer * 0.74
    disc(draw, (cx, cy), inner_r, (36, 42, 50, 255))

    # Hammered center.
    rng = random.Random(7)
    pix = layer.load()
    for _ in range(int(inner_r * inner_r * 0.35)):
        ang = rng.random() * math.tau
        rad = inner_r * 0.92 * math.sqrt(rng.random())
        x = int(cx + math.cos(ang) * rad)
        y = int(cy + math.sin(ang) * rad)
        if 0 <= x < size and 0 <= y < size:
            shade = rng.randint(28, 70)
            pix[x, y] = (shade, shade + 4, shade + 8, 255)

    # Raised star: dark edge, then silver, then a thin highlight.
    pts = star_points(cx, cy + outer * 0.01, inner_r * 0.92)
    stroke = max(3, int(outer * 0.16))
    shift = max(1, int(outer * 0.035))
    dark = [(x + shift, y + shift) for x, y in pts]
    draw.line(dark, fill=SILVER_LO, width=stroke + max(1, stroke // 5), joint="curve")
    draw.line(pts, fill=SILVER, width=stroke, joint="curve")
    hi = [(x - shift * 0.4, y - shift * 0.6) for x, y in pts]
    draw.line(hi, fill=SILVER_HI, width=max(1, stroke // 3), joint="curve")

    img.alpha_composite(layer)
    return img


def circled(img: Image.Image) -> Image.Image:
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, mask=mask)
    return out


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "assets" / "android-icon"
    out.mkdir(parents=True, exist_ok=True)
    pendant(1024, 0.86, True).save(out / "pentacle-1024.png")
    for name, size in LAUNCHER.items():
        icon = pendant(size, 0.88, True)
        icon.save(out / f"ic_launcher-{name}.png")
        circled(icon).save(out / f"ic_launcher_round-{name}.png")
    for name, size in FOREGROUND.items():
        pendant(size, 0.70, False).save(out / f"ic_launcher_foreground-{name}.png")


if __name__ == "__main__":
    main()
