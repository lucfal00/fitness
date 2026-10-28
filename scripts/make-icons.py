# Generates icons/fitness-v4-*.png from design/fitness-icon-source.webp (needs Python 3 + Pillow).
# The figure is separated from the source's background, cropped to the bust (head to hips, fading
# out at the bottom) and composited with a margin on a fresh diagonal gradient: "any" icons keep
# transparent rounded corners like Habits; maskable/apple are full-bleed with a wider margin so the
# bust stays in the safe zone. Change TL/BR to recolour. Run: python scripts/make-icons.py
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'fitness-icon-source.webp'
OUT = ROOT / 'icons'
TL, BR = (142, 220, 120), (47, 143, 74)          # gradient, top-left → bottom-right (as Habits/Atlas)
W = 1024                                         # working size (supersampled)
BUST_BOTTOM = 620                                # crop line in working px (hips, hands included)
FADE = 0.08                                      # bottom fraction of the bust that fades out
MARGIN, MARGIN_FULL = 0.16, 0.22                 # per side: rounded icons / full-bleed icons


def tile_box(im):
    """Bounding box of the coloured tile (the source has a light margin)."""
    w, h = im.size
    bg = im.getpixel((0, 0))
    far = lambda p: sum(abs(a - b) for a, b in zip(p, bg)) > 60
    cy, cx = h // 2, w // 2
    left = next(x for x in range(w) if far(im.getpixel((x, cy))))
    right = next(x for x in range(w - 1, -1, -1) if far(im.getpixel((x, cy))))
    top = next(y for y in range(h) if far(im.getpixel((cx, y))))
    bottom = next(y for y in range(h - 1, -1, -1) if far(im.getpixel((cx, y))))
    return left, top, right + 1, bottom + 1


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def extract_figure(src):
    """RGBA figure: alpha from the distance to the source background colour of each row."""
    im = src.convert('RGB')
    box = tile_box(im)
    tile = im.crop(box).resize((W, W), Image.LANCZOS)
    s_top, s_bot = tile.getpixel((W // 2, 14)), tile.getpixel((W // 2, W - 15))
    fig = Image.new('RGBA', (W, W))
    tp, fp = tile.load(), fig.load()
    for y in range(W):
        bg = lerp(s_top, s_bot, y / (W - 1))
        for x in range(W):
            p = tp[x, y]
            d = sum((a - b) ** 2 for a, b in zip(p, bg)) ** 0.5
            a = min(max((d - 22) / 46, 0.0), 1.0)
            if a <= 0:
                continue
            rgb = tuple(min(max(round((c - (1 - a) * g) / a), 0), 255) for c, g in zip(p, bg))
            fp[x, y] = (*rgb, round(a * 255))
    # The source tile has white rounded corners: drop everything outside its rounded rect.
    mask = Image.new('L', (W, W), 0)
    m = round(W * 0.03)                           # stay clear of the anti-aliased tile edge
    ImageDraw.Draw(mask).rounded_rectangle((m, m, W - m - 1, W - m - 1), radius=round(W * 0.26), fill=255)
    fig.putalpha(Image.composite(fig.getchannel('A'), Image.new('L', (W, W), 0), mask))
    return fig


def gradient():
    g = Image.new('RGBA', (W, W))
    d = ImageDraw.Draw(g)
    for s in range(2 * W - 1):                    # anti-diagonals x + y = s share one colour
        d.line((s, 0, 0, s), fill=(*lerp(TL, BR, s / (2 * W - 2)), 255))
    return g


def opaque_box(im):
    return im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()


def bust(fig):
    """Head-to-hips crop of the figure, fading out over the bottom FADE, trimmed to its content."""
    top = opaque_box(fig)[1]
    b = fig.crop((0, top, W, BUST_BOTTOM))
    alpha = b.getchannel('A')
    px, h = alpha.load(), b.height
    f = round(h * FADE)
    for y in range(h - f, h):
        k = (h - y) / f
        for x in range(W):
            px[x, y] = round(px[x, y] * k)
    b.putalpha(alpha)
    return b.crop(opaque_box(b))


def place(bg, b, margin):
    box = W * (1 - 2 * margin)
    s = min(box / b.width, box / b.height)
    b = b.resize((round(b.width * s), round(b.height * s)), Image.LANCZOS)
    bg.alpha_composite(b, ((W - b.width) // 2, (W - b.height) // 2 + round(W * 0.02)))


def icon(b, size, full_bleed):
    bg = gradient()
    if full_bleed:
        place(bg, b, MARGIN_FULL)
        out = bg
    else:
        place(bg, b, MARGIN)
        mask = Image.new('L', (W, W), 0)
        inset = round(W / 100)                    # Habits: tile at 1..99 of 100, rx 23
        ImageDraw.Draw(mask).rounded_rectangle((inset, inset, W - inset - 1, W - inset - 1),
                                               radius=round(W * 0.23), fill=255)
        out = Image.new('RGBA', (W, W))
        out.paste(bg, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def main():
    b = bust(extract_figure(Image.open(SRC)))
    for name, size, full in [('fitness-v4-192.png', 192, False), ('fitness-v4-512.png', 512, False),
                             ('fitness-v4-maskable-512.png', 512, True), ('fitness-v4-apple-180.png', 180, True)]:
        icon(b, size, full).save(OUT / name, optimize=True)
        print('wrote icons/' + name)


if __name__ == '__main__':
    main()
