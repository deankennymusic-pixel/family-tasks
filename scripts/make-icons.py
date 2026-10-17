"""Renders the app icons in public/icons. Run: python3 scripts/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

BLUE = (26, 115, 232, 255)
WHITE = (255, 255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
SS = 4  # supersampling for smooth edges


def mark(size: int, rounded: bool, scale: float) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.25), fill=BLUE)
    else:
        d.rectangle([0, 0, s, s], fill=BLUE)
    c, r, w = s / 2, s * 0.25 * scale, int(s * 0.07 * scale)
    d.ellipse([c - r, c - r, c + r, c + r], outline=WHITE, width=w)
    pts = [(-0.117, 0.008), (-0.039, 0.086), (0.117, -0.078)]
    pts = [(c + x * s * scale, c + y * s * scale) for x, y in pts]
    d.line(pts, fill=WHITE, width=w, joint="curve")
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
mark(192, True, 1).save(OUT / "icon-192.png")
mark(512, True, 1).save(OUT / "icon-512.png")
# Full-bleed square, artwork inside the maskable safe zone.
mark(512, False, 0.8).save(OUT / "maskable-512.png")
# iOS rounds the corners itself and shows transparency as black.
mark(180, False, 1).save(OUT / "apple-touch-icon.png")
