"""Rasterize the night pentacle into Android launcher sizes.

The mark matches public/favicon.svg: night field, steel ring, amber star.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

NIGHT = (12, 16, 22, 255)
NIGHT_TOP = (22, 32, 42, 255)
STEEL = (126, 176, 200, 255)
AMBER = (224, 177, 90, 255)
PARCHMENT = (243, 236, 223, 255)

STAR = [
    (16.00, 7.40),
    (18.17, 13.61),
    (24.75, 13.76),
    (19.52, 17.74),
    (21.41, 24.04),
    (16.00, 20.30),
    (10.59, 24.04),
    (12.48, 17.74),
    (7.25, 13.76),
    (13.83, 13.61),
]
CX, CY, R, STROKE = 16.0, 16.6, 12.2, 2.2

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


def mark(size: int, inset: float, field: bool) -> Image.Image:
    img = night_field(size) if field else Image.new("RGBA", (size, size), (0, 0, 0, 0))
    box = size * inset
    ox = (size - box) / 2
    oy = (size - box) / 2

    def pt(x: float, y: float) -> tuple[float, float]:
        return (ox + x / 32 * box, oy + y / 32 * box)

    center = pt(CX, CY)
    rad = R / 32 * box
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        [center[0] - rad * 0.72, center[1] - rad * 0.72, center[0] + rad * 0.72, center[1] + rad * 0.72],
        fill=(224, 177, 90, 88),
    )
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius=max(1, size * 0.035))))

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    width = max(2, round(STROKE / 32 * box))
    draw.ellipse(
        [center[0] - rad, center[1] - rad, center[0] + rad, center[1] + rad],
        outline=STEEL,
        width=width,
    )
    inner = rad - width * 0.7
    draw.ellipse(
        [center[0] - inner, center[1] - inner, center[0] + inner, center[1] + inner],
        outline=(*PARCHMENT[:3], 70),
        width=max(1, width // 4),
    )
    draw.polygon([pt(x, y) for x, y in STAR], fill=AMBER)
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
    mark(1024, 0.82, True).save(out / "pentacle-1024.png")
    for name, size in LAUNCHER.items():
        icon = mark(size, 0.82, True)
        icon.save(out / f"ic_launcher-{name}.png")
        circled(icon).save(out / f"ic_launcher_round-{name}.png")
    for name, size in FOREGROUND.items():
        mark(size, 0.66, False).save(out / f"ic_launcher_foreground-{name}.png")


if __name__ == "__main__":
    main()
