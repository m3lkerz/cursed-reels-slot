#!/usr/bin/env python3
"""Build game-ready symbol sprites in assets/cut/ from generated art.
Free-standing renders (x_*.png) get a soft elliptical vignette mask; medallion fallbacks (sym_*.png) get a circular mask."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

A = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(A, 'cut')
os.makedirs(OUT, exist_ok=True)
SIZE = 384

MAP = {  # symbol id: (preferred free-standing render, medallion fallback)
    'WILD': ('x_fisher.png', 'sym_fisher.png'),
    'FISH': ('x_fish.png', 'sym_bass.png'),
    'PUM':  ('x_pumpkin.png', 'sym_pumpkin.png'),
    'BAT':  ('x_bat.png', 'sym_bat.png'),
    'POT':  ('x_potion.png', 'sym_witchhat.png'),
    'BOB':  ('x_bobber.png', 'sym_skull.png'),
    'TAK':  ('x_tackle.png', 'sym_spider.png'),
    'SCAT': ('x_scatter.png', 'sym_moon.png'),
}

def square(im):
    w, h = im.size
    s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((SIZE, SIZE), Image.LANCZOS)

def vignette_mask(radius_in=0.36, radius_out=0.5):
    m = Image.new('L', (SIZE, SIZE), 0)
    d = ImageDraw.Draw(m)
    steps = 40
    for i in range(steps):
        t = i / (steps - 1)
        r = radius_out - (radius_out - radius_in) * t
        d.ellipse([SIZE / 2 - r * SIZE, SIZE / 2 - r * SIZE, SIZE / 2 + r * SIZE, SIZE / 2 + r * SIZE], fill=int(255 * t))
    return m.filter(ImageFilter.GaussianBlur(SIZE * 0.01))

def circle_mask(r=0.475):
    m = Image.new('L', (SIZE * 4, SIZE * 4), 0)
    ImageDraw.Draw(m).ellipse([SIZE * 2 - r * SIZE * 4, SIZE * 2 - r * SIZE * 4, SIZE * 2 + r * SIZE * 4, SIZE * 2 + r * SIZE * 4], fill=255)
    return m.resize((SIZE, SIZE), Image.LANCZOS)

def luminance_boost(im):
    im = ImageEnhance.Contrast(im).enhance(1.12)
    return ImageEnhance.Color(im).enhance(1.15)

for sym, (pref, fb) in MAP.items():
    p, f = os.path.join(A, pref), os.path.join(A, fb)
    if os.path.exists(p):
        im = luminance_boost(square(Image.open(p).convert('RGB')))
        # alpha = vignette, but keep bright pixels near the edge (glows) partially visible
        # alpha = outer vignette x (subject-vs-background difference OR solid core)
        from PIL import ImageChops, ImageStat
        px = im.load(); border = [px[x, y] for x in range(0, SIZE, 8) for y in (2, SIZE - 3)] + [px[x, y] for y in range(0, SIZE, 8) for x in (2, SIZE - 3)]
        bgc = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
        diff = ImageChops.difference(im, Image.new('RGB', im.size, bgc)).convert('L').point(lambda v: min(255, max(0, (v - 14) * 6)))
        diff = diff.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2))
        core = vignette_mask(0.16, 0.27)
        mask = ImageChops.multiply(vignette_mask(0.40, 0.5), ImageChops.lighter(diff, core))
        im = im.convert('RGBA'); im.putalpha(mask)
        src = 'render'
    elif os.path.exists(f):
        im = luminance_boost(square(Image.open(f).convert('RGB'))).convert('RGBA')
        im.putalpha(circle_mask())
        src = 'medallion'
    else:
        print('MISSING', sym); continue
    im.save(os.path.join(OUT, sym + '.png'), optimize=True)
    print(sym, src)

bg = next((os.path.join(A, b) for b in ['bg_hd.png', 'bg_main.png'] if os.path.exists(os.path.join(A, b))), None)
if bg:
    Image.open(bg).convert('RGB').save(os.path.join(OUT, 'bg.jpg'), quality=86)
    print('bg', os.path.basename(bg))
