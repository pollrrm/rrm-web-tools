"""Generates the Rewriter icon set (run once; kept for future tweaks)."""
from PIL import Image, ImageDraw

S = 1024
BLUE_TOP, BLUE_BOT = (110, 155, 255), (42, 96, 240)
SHEET = (255, 255, 255)
INK = (58, 66, 86)
SPARK = (255, 205, 90)


def bg(size, radius_ratio=0.225):
    """Rounded-square blue gradient plate."""
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / max(size - 1, 1)
        grad.putpixel((0, y), tuple(
            round(BLUE_TOP[i] + (BLUE_BOT[i] - BLUE_TOP[i]) * t) for i in range(3)))
    grad = grad.resize((size, size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)
    return img


def bar(d, x0, x1, y, h, color):
    d.rounded_rectangle([x0, y, x1, y + h], radius=h / 2, fill=color)


def star(d, cx, cy, r, color):
    """Four-point sparkle — the 'rewritten' half of the mark."""
    waist = r * 0.24
    d.polygon([(cx, cy - r), (cx + waist, cy - waist), (cx + r, cy),
               (cx + waist, cy + waist), (cx, cy + r), (cx - waist, cy + waist),
               (cx - r, cy), (cx - waist, cy - waist)], fill=color)


def detailed():
    """Full-detail mark: lines of text, the middle one rewritten short, plus a sparkle."""
    img = bg(S)
    d = ImageDraw.Draw(img)
    bar(d, 190, 780, 250, 76, SHEET)
    bar(d, 190, 560, 396, 76, SPARK)
    bar(d, 190, 700, 542, 76, SHEET)
    bar(d, 190, 480, 688, 76, SHEET)
    star(d, 782, 704, 150, SPARK)
    return img


def simple():
    """16px variant: three bold bars, one highlighted. Sparkle is lost at that size."""
    img = bg(S, radius_ratio=0.24)
    d = ImageDraw.Draw(img)
    bar(d, 200, 824, 268, 104, SHEET)
    bar(d, 200, 620, 460, 104, SPARK)
    bar(d, 200, 824, 652, 104, SHEET)
    return img


det, sim = detailed(), simple()
for size in (128, 48, 32):
    det.resize((size, size), Image.LANCZOS).save(f"icons/icon{size}.png")
sim.resize((16, 16), Image.LANCZOS).save("icons/icon16.png")
print("icons written")
