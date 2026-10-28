# Generates icons/fitness-v3-*.png from design/fitness-icon-source.webp (needs Python 3 + Pillow).
# The figure is separated from the source's red gradient, then composited on a fresh gradient:
# "any" icons keep transparent rounded corners like Habits; maskable/apple are full-bleed with the
# figure shrunk into the safe zone. Change TOP/BOTTOM to recolour. Run: python scripts/make-icons.py
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'fitness-icon-source.webp'
OUT = ROOT / 'icons'
TOP, BOTTOM = (231, 86, 83), (148, 3, 25)        # gradient, top → bottom
W = 1024                                         # working size (supersampled)


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
    for y in range(W):
        d.line((0, y, W, y), fill=(*lerp(TOP, BOTTOM, y / (W - 1)), 255))
    return g


def icon(fig, size, full_bleed):
    bg = gradient()
    if full_bleed:
        k = 0.8                                   # fits the 80 % safe circle
        small = fig.resize((round(W * k), round(W * k)), Image.LANCZOS)
        off = (W - small.width) // 2
        bg.alpha_composite(small, (off, off))
        out = bg
    else:
        bg.alpha_composite(fig)
        mask = Image.new('L', (W, W), 0)
        inset = round(W / 100)                    # Habits: tile at 1..99 of 100, rx 23
        ImageDraw.Draw(mask).rounded_rectangle((inset, inset, W - inset - 1, W - inset - 1),
                                               radius=round(W * 0.23), fill=255)
        out = Image.new('RGBA', (W, W))
        out.paste(bg, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def main():
    fig = extract_figure(Image.open(SRC))
    for name, size, full in [('fitness-v3-192.png', 192, False), ('fitness-v3-512.png', 512, False),
                             ('fitness-v3-maskable-512.png', 512, True), ('fitness-v3-apple-180.png', 180, True)]:
        icon(fig, size, full).save(OUT / name, optimize=True)
        print('wrote icons/' + name)


if __name__ == '__main__':
    main()
