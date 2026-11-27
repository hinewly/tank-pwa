from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def draw_icon(size, maskable=False):
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), "#182015")
    draw = ImageDraw.Draw(image)

    margin = int(canvas_size * (0.17 if maskable else 0.09))
    radius = int(canvas_size * (0.2 if maskable else 0.13))
    panel = [margin, margin, canvas_size - margin, canvas_size - margin]
    draw.rounded_rectangle(panel, radius=radius, fill="#26311f", outline="#d9ee92", width=max(2, scale * 2))

    x0, y0, x1, y1 = panel
    w = x1 - x0
    h = y1 - y0

    track_y1 = y0 + int(h * 0.3)
    track_y2 = y0 + int(h * 0.72)
    track_h = int(h * 0.15)
    draw.rounded_rectangle([x0 + int(w * 0.12), track_y1, x1 - int(w * 0.12), track_y1 + track_h], radius=scale * 5, fill="#172018")
    draw.rounded_rectangle([x0 + int(w * 0.12), track_y2, x1 - int(w * 0.12), track_y2 + track_h], radius=scale * 5, fill="#172018")

    hull = [
        (x0 + int(w * 0.1), y0 + int(h * 0.42)),
        (x1 - int(w * 0.14), y0 + int(h * 0.33)),
        (x1 - int(w * 0.05), y0 + int(h * 0.56)),
        (x1 - int(w * 0.16), y0 + int(h * 0.73)),
        (x0 + int(w * 0.1), y0 + int(h * 0.66)),
        (x0 + int(w * 0.04), y0 + int(h * 0.54)),
    ]
    draw.polygon(hull, fill="#405d3f", outline="#cfe58a")

    cx = x0 + int(w * 0.4)
    cy = y0 + int(h * 0.52)
    turret_r = int(w * 0.15)
    draw.ellipse(
        [cx - turret_r, cy - turret_r, cx + turret_r, cy + turret_r],
        fill="#6f8759",
        outline="#e0eea0",
        width=scale * 2,
    )
    draw.rounded_rectangle(
        [cx, cy - scale * 5, x1 - int(w * 0.04), cy + scale * 5],
        radius=scale * 3,
        fill="#2b3529",
        outline="#d9ee92",
        width=max(1, scale),
    )
    draw.polygon(
        [
            (x0 + int(w * 0.18), y0 + int(h * 0.21)),
            (x0 + int(w * 0.28), y0 + int(h * 0.08)),
            (x0 + int(w * 0.38), y0 + int(h * 0.21)),
        ],
        fill="#e7b960",
    )

    return image.resize((size, size), Image.Resampling.LANCZOS)


for icon_size in (48, 64, 192, 512):
    draw_icon(icon_size).save(OUT / f"icon-{icon_size}.png")

draw_icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
draw_icon(180).save(OUT / "apple-touch-icon.png")

