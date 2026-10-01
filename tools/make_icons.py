#!/usr/bin/env python3
"""Generate PWA icons (no external assets). Run: python3 tools/make_icons.py"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)
SS = 4  # supersample


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c1=(79, 70, 229), c2=(124, 108, 255)):
    img = Image.new("RGB", (1, size))
    for y in range(size):
        img.putpixel((0, y), lerp(c1, c2, y / max(1, size - 1)))
    return img.resize((size, size))


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def calendar_glyph(draw, S, cx, cy, w, h, color=(255, 255, 255)):
    lw = max(2, int(S * 0.028))
    x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    r = w * 0.16
    draw.rounded_rectangle([x0, y0, x1, y1], radius=r, outline=color, width=lw)
    # top binding bar
    draw.line([x0 + w * 0.06, y0 + h * 0.28, x1 - w * 0.06, y0 + h * 0.28], fill=color, width=lw)
    # hangers
    for hx in (0.32, 0.68):
        draw.line([x0 + w * hx, y0 - h * 0.06, x0 + w * hx, y0 + h * 0.1], fill=color, width=lw)
    # dots
    dotr = w * 0.055
    for i, (dx, dy) in enumerate([(0.3, 0.55), (0.5, 0.55), (0.7, 0.55), (0.3, 0.76), (0.5, 0.76)]):
        px, py = x0 + w * dx, y0 + h * dy
        draw.ellipse([px - dotr, py - dotr, px + dotr, py + dotr], fill=color)


def make(size, path, maskable=False):
    S = size * SS
    img = gradient(S).convert("RGBA")
    d = ImageDraw.Draw(img)
    scale = 0.62 if maskable else 0.72
    calendar_glyph(d, S, S / 2, S / 2 + S * 0.01, S * scale, S * scale * 0.82)
    img = img.resize((size, size), Image.LANCZOS)
    if maskable:
        img.save(path)
    else:
        # small corner radius for a native app-icon look on Android
        mask = rounded_mask(size, int(size * 0.22))
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        out.save(path)
    print("wrote", path)


make(192, os.path.join(OUT, "icon-192.png"))
make(512, os.path.join(OUT, "icon-512.png"))
make(512, os.path.join(OUT, "icon-maskable-512.png"), maskable=True)
make(180, os.path.join(OUT, "apple-touch-icon.png"))

with open(os.path.join(OUT, "favicon.svg"), "w") as f:
    f.write('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c6cff"/></linearGradient></defs>
<rect width="64" height="64" rx="14" fill="url(#g)"/>
<rect x="16" y="18" width="32" height="30" rx="5" fill="none" stroke="#fff" stroke-width="3.4"/>
<line x1="18" y1="26" x2="46" y2="26" stroke="#fff" stroke-width="3.4"/>
<line x1="25" y1="13" x2="25" y2="22" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
<line x1="39" y1="13" x2="39" y2="22" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
<circle cx="26" cy="34" r="2.4" fill="#fff"/><circle cx="32" cy="34" r="2.4" fill="#fff"/><circle cx="38" cy="34" r="2.4" fill="#fff"/>
<circle cx="26" cy="41" r="2.4" fill="#fff"/><circle cx="32" cy="41" r="2.4" fill="#fff"/>
</svg>''')
print("wrote favicon.svg")
