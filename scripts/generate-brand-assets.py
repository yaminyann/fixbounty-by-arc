"""Builds the web brand assets from the source logos in brand/.

    python scripts/generate-brand-assets.py

Outputs into public/: favicons, touch icons, web manifest icons, the header mark, the footer lockup and the
social preview image. Source art has a pure black background, so every output keeps it.
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "brand")
PUB = os.path.join(ROOT, "public")
os.makedirs(os.path.join(PUB, "brand"), exist_ok=True)

BLACK = (0, 0, 0)


def content_bbox(img: Image.Image, threshold: int = 40):
    return img.convert("L").point(lambda v: 255 if v > threshold else 0).getbbox()


def padded_square(img: Image.Image, fill_ratio: float) -> Image.Image:
    """Crops to the artwork and centres it on a black square where it spans `fill_ratio` of the side."""
    art = img.crop(content_bbox(img))
    side = round(max(art.size) / fill_ratio)
    out = Image.new("RGB", (side, side), BLACK)
    out.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
    return out


mark_src = Image.open(os.path.join(SRC, "bountyfi-mark.png")).convert("RGB")
lockup_src = Image.open(os.path.join(SRC, "bountyfi-lockup.png")).convert("RGB")

# Favicon and app icons: the mark fills about 74% of the tile so it stays readable at 16px.
icon = padded_square(mark_src, 0.74)
for name, size in {"favicon-16x16.png": 16, "favicon-32x32.png": 32, "apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512}.items():
    icon.resize((size, size), Image.LANCZOS).save(os.path.join(PUB, name), optimize=True)
icon.save(os.path.join(PUB, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

# Header mark (shown at 32 to 40px, so 128px covers high-density screens).
padded_square(mark_src, 0.86).resize((128, 128), Image.LANCZOS).save(os.path.join(PUB, "brand", "mark.png"), optimize=True)

# Footer lockup, cropped tight with a small margin.
box = content_bbox(lockup_src)
pad = 24
lockup = lockup_src.crop((max(box[0] - pad, 0), max(box[1] - pad, 0), min(box[2] + pad, lockup_src.width), min(box[3] + pad, lockup_src.height)))
scale = 760 / lockup.width
lockup.resize((760, round(lockup.height * scale)), Image.LANCZOS).save(os.path.join(PUB, "brand", "lockup.png"), optimize=True)

# Social preview, 1200x630.
og = Image.new("RGB", (1200, 630), BLACK)
art = lockup_src.crop(box)
art = art.resize((900, round(art.height * 900 / art.width)), Image.LANCZOS)
og.paste(art, ((1200 - art.width) // 2, (630 - art.height) // 2))
og.save(os.path.join(PUB, "og.png"), optimize=True)

print("brand assets written to public/")
