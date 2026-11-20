#!/usr/bin/env python3
"""
Renders the Android widget-picker previews (assets/widgets/preview-*.png, wired up as
`previewImage` in app.config.ts) from real Röbel content.

The layouts mirror widgets/content-widgets.tsx and widgets/MiniAppsWidget.tsx (same
sizes, colours, Mona Sans, the miniAppsGrid rule from lib/widget-layout.ts) as HTML,
screenshotted by headless Chrome at 2x and palette-compressed with Pillow (<= 150 kB).

Inputs: assets/widgets/sample/* — real event / dish / mini-app images taken from the
production Supabase storage (public URLs) on 2026-11-20 (events: Jubiläumskonzert
Marienkirche; Mittagstisch: Bistro zur Waage; mini apps: live store apps). The same
files are the iOS widget-gallery samples (targets/widget/expo-target.config.js).
No personal data: events, dishes and apps only.

Run from apps/expo:  python3 scripts/render-widget-previews.py
Needs Google Chrome and Pillow.
"""
import base64
import math
import os
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SAMPLE = os.path.join(ROOT, 'assets/widgets/sample')
OUT = os.path.join(ROOT, 'assets/widgets')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
SCALE = 2
MAX_BYTES = 150_000

FONT_DIR = os.path.join(ROOT, 'assets/fonts/Mona-Sans')


def data_uri(path):
    ext = os.path.splitext(path)[1].lstrip('.').replace('jpg', 'jpeg')
    with open(path, 'rb') as f:
        return f'data:image/{ext};base64,{base64.b64encode(f.read()).decode()}'


def sample(name):
    return data_uri(os.path.join(SAMPLE, name))


BADGE = data_uri(os.path.join(OUT, 'app-badge.png'))
STORE = data_uri(os.path.join(ROOT, 'assets/illustration/mini-app-store.png'))

CSS = f"""
@font-face {{ font-family: Mona; font-weight: 400; src: url('file://{FONT_DIR}/MonaSans-Regular.ttf'); }}
@font-face {{ font-family: Mona; font-weight: 500; src: url('file://{FONT_DIR}/MonaSans-Medium.ttf'); }}
@font-face {{ font-family: Mona; font-weight: 600; src: url('file://{FONT_DIR}/MonaSans-SemiBold.ttf'); }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ background: transparent; overflow: hidden; }}
.w {{ background: #fff; border-radius: 22px; font-family: Mona, sans-serif; color: #000; overflow: hidden; display: flex; flex-direction: column; }}
.ell {{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.sub {{ color: #6B7280; }}
.badge {{ width: 18px; height: 18px; border-radius: 4px; }}
.tile {{ width: 40px; height: 40px; border-radius: 10px; border: 1px solid #E5E7EB; background: #fff;
         display: flex; flex-direction: column; align-items: center; justify-content: center; flex: none; }}
.tile .wd {{ font-size: 9px; font-weight: 500; color: #6B7280; letter-spacing: .04em; line-height: 11px; }}
.tile .dy {{ font-size: 17px; font-weight: 600; line-height: 19px; }}
"""


def page(width, height, body):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="w" style="width:{width}px;height:{height}px">{body}</div></body></html>"""


def date_tile(wd, dy, size=40, solid=False):
    style = f'width:{size}px;height:{size}px;border-radius:{round(size * .24)}px'
    if solid:
        style += ';border:none'
    return (f'<div class="tile" style="{style}"><div class="wd">{wd.upper()}</div>'
            f'<div class="dy">{dy}</div></div>')


# ── Events (hero layout, 4×3) ─────────────────────────────────────────────

EVENTS = [
    ('Fr', '20', '19:00', 'Jubiläumskonzert', 'Marienkirche Röbel'),
    ('Sa', '21', '09:00', '16. Herbst-Volleyball-Turnier', 'Gotthunskamp'),
    ('Mi', '25', '18:00', 'Infoabend Röbel App', 'Jugendhaus Röbel'),
    ('Fr', '27', '13:00', 'Röwelscher Wiehnachtsmarkt', 'Marktplatz Röbel'),
]


def events_html(width=320, height=290):
    pad = 14
    inner = width - pad * 2
    hero_h = round(min(180, max(110, inner * 0.56)))
    wd, dy, time, title, venue = EVENTS[0]
    rows = ''.join(
        f"""<div style="display:flex;align-items:center;height:44px;margin-bottom:8px">
          {date_tile(r[0], r[1])}
          <div style="margin-left:10px;min-width:0">
            <div class="ell" style="font-size:14px;font-weight:500;line-height:18px">{r[3]}</div>
            <div class="ell sub" style="font-size:11.5px;line-height:15px;margin-top:1px">{r[2]} · {r[4]}</div>
          </div></div>"""
        for r in EVENTS[1:]
    )
    body = f"""
    <div style="padding:{pad}px;display:flex;flex-direction:column;height:100%">
      <div style="display:flex;align-items:center;height:22px;margin-bottom:8px">
        <div style="flex:1;font-size:14px;font-weight:500">Events in Röbel</div><img class="badge" src="{BADGE}">
      </div>
      <div style="position:relative;height:{hero_h}px;border-radius:16px;overflow:hidden;margin-bottom:10px;flex:none">
        <img src="{sample('event.png')}" style="width:100%;height:100%;object-fit:cover;display:block">
        <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0),rgba(0,0,0,.75))"></div>
        <div style="position:absolute;top:10px;right:10px">{date_tile(wd, dy, 38, solid=True)}</div>
        <div style="position:absolute;left:14px;right:14px;bottom:14px;color:#fff">
          <div style="font-size:16px;font-weight:600;line-height:20px">{title}</div>
          <div class="ell" style="font-size:11.5px;color:#E5E7EB;margin-top:2px">{venue} · {time}</div>
        </div>
      </div>
      {rows}
    </div>"""
    return width, height, page(width, height, body)


# ── Mittagstisch (4×2) ────────────────────────────────────────────────────

CHEVRON = {
    'left': 'M15 5l-7 7 7 7',
    'right': 'M9 5l7 7-7 7',
}


def chevron(direction):
    return (f'<svg width="16" height="16" viewBox="0 0 24 24"><path d="{CHEVRON[direction]}" fill="none" '
            'stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>')


def lunch_html(width=320, height=170):
    pad = 12
    inner = width - pad * 2
    body_h = height - pad * 2 - 28 - 6
    tile_w = inner // 2
    photo_h = body_h - 38
    dishes = [
        ('dish1.png', 'Hackbraten mit Salzkartoffeln u. Speckbohnen', 'Heute · 7,50 €'),
        ('dish2.png', 'Kartoffelsuppe mit Bockwurst', 'Heute · 7,50 €'),
    ]
    tiles = ''.join(
        f"""<div style="width:{tile_w}px;padding:0 3px">
          <img src="{sample(img)}" style="width:100%;height:{photo_h}px;object-fit:cover;border-radius:12px;display:block">
          <div class="ell" style="font-size:12px;font-weight:600;margin-top:4px;line-height:16px">{name}</div>
          <div class="ell sub" style="font-size:11px;line-height:14px">{meta}</div>
        </div>"""
        for img, name, meta in dishes
    )
    body = f"""
    <div style="padding:{pad}px">
      <div style="display:flex;align-items:center;height:28px;margin-bottom:6px">
        <div class="ell" style="flex:1;font-size:14px;font-weight:600">Bistro zur Waage</div>
        <div style="display:flex;align-items:center;height:28px">
          <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center">{chevron('left')}</div>
          <div class="sub" style="font-size:11px;font-weight:500">1/3</div>
          <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center">{chevron('right')}</div>
        </div>
      </div>
      <div style="display:flex">{tiles}</div>
    </div>"""
    return width, height, page(width, height, body)


# ── Mini Apps (4×4, the default size) ────────────────────────────────────

APPS = [
    ('app-abfall.png', 'ABFALLzeiten'),
    ('app-bus.png', 'Bürgerbus Röbel'),
    ('app-stadt.png', 'Stadtführung'),
    ('app-quiz.png', 'Röbel-Quiz'),
    ('app-politik.png', 'Verwaltung & Politik'),
    ('app-sitzungen.png', 'Ausschuss-Sitzungen'),
    ('app-phone.png', 'MüritzPhone'),
]


def mini_apps_grid(app_count, width, height):
    """Port of miniAppsGrid (lib/widget-layout.ts)."""
    pad = 12
    w, h = max(0, width - pad * 2), max(0, height - pad * 2)
    labels = h >= 58
    max_cols = min(6, max(1, w // (60 if labels else 52)))
    max_rows = min(4, max(1, h // (60 if labels else 44)))
    apps = min(max(0, app_count), max_cols * max_rows - 1)
    items = apps + 1
    below = 24 if labels else 6
    best = (1, 1, -1)
    for cols in range(1, min(items, max_cols) + 1):
        rows = math.ceil(items / cols)
        if rows > max_rows:
            continue
        icon = min(w / cols - 12, h / rows - below)
        if icon > best[2] + 0.5:
            best = (cols, rows, icon)
    icon = math.floor(min(84, max(24, best[2])))
    return dict(cols=best[0], rows=best[1], icon=icon, tile_w=w // best[0], row_h=h // best[1],
                labels=labels, label_size=13 if icon >= 64 else 11, apps=apps)


def miniapps_html(width=320, height=340):
    g = mini_apps_grid(len(APPS), width, height)
    radius = round(g['icon'] * 0.24)

    def tile(img, label):
        lab = (f'<div class="ell" style="font-size:{g["label_size"]}px;font-weight:500;margin-top:4px;'
               f'width:{g["tile_w"] - 4}px;text-align:center">{label}</div>') if g['labels'] else ''
        return (f'<div style="width:{g["tile_w"]}px;height:{g["row_h"]}px;display:flex;flex-direction:column;'
                f'align-items:center;justify-content:center">'
                f'<img src="{img}" style="width:{g["icon"]}px;height:{g["icon"]}px;border-radius:{radius}px;'
                f'object-fit:cover">{lab}</div>')

    items = [tile(sample(f), n) for f, n in APPS[:g['apps']]]
    store_label = 'Mini-Apps entdecken' if g['apps'] == 0 or g['tile_w'] >= 120 else 'Entdecken'
    items.append(tile(STORE, store_label).replace(f'border-radius:{radius}px;object-fit:cover', 'object-fit:contain'))
    rows = ''.join(
        f'<div style="display:flex;justify-content:center">{"".join(items[r * g["cols"]:(r + 1) * g["cols"]])}</div>'
        for r in range(g['rows'])
    )
    body = f'<div style="padding:12px;display:flex;flex-direction:column;justify-content:center;height:100%">{rows}</div>'
    return width, height, page(width, height, body)


def save_palette(img, out, colors):
    """Median-cut palette (smooth photos) + one transparent entry for the rounded corners."""
    rgb = Image.new('RGB', img.size, (255, 255, 255))
    rgb.paste(img, mask=img.getchannel('A'))
    pal = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    transparent = colors  # first unused palette index
    palette = pal.getpalette()[: colors * 3]
    pal.putpalette(palette + [255, 255, 255] * (256 - len(palette) // 3))
    mask = img.getchannel('A').point(lambda a: 255 if a < 128 else 0)
    pal.paste(transparent, mask=mask)
    pal.save(out, optimize=True, transparency=transparent)


def render(name, spec):
    width, height, html = spec
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'w.html')
        shot = os.path.join(tmp, 'w.png')
        with open(src, 'w') as f:
            f.write(html)
        subprocess.run(
            [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
             f'--force-device-scale-factor={SCALE}', f'--window-size={width},{height}',
             '--default-background-color=00000000', f'--screenshot={shot}', f'file://{src}'],
            check=True, capture_output=True,
        )
        img = Image.open(shot).convert('RGBA')
        out = os.path.join(OUT, f'preview-{name}.png')
        for colors in (255, 192, 128):
            save_palette(img, out, colors)
            if os.path.getsize(out) <= MAX_BYTES:
                break
        print(f'{out}: {img.size[0]}x{img.size[1]}, {os.path.getsize(out)} bytes')


if __name__ == '__main__':
    if not os.path.exists(CHROME):
        sys.exit('Google Chrome not found')
    render('events', events_html())
    render('mittagstisch', lunch_html())
    render('miniapps', miniapps_html())
