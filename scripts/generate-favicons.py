import os
from PIL import Image, ImageDraw

def render_fixbounty_icon(size: int) -> Image.Image:
    # 4x supersampling for crisp antialiased rasterization
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Yellow background box
    bg_color = (253, 224, 71, 255) # #FDE047
    border_color = (0, 0, 0, 255)
    border_width = max(2 * scale, int(size * 0.06 * scale))

    draw.rectangle(
        [0, 0, canvas_size - 1, canvas_size - 1],
        fill=bg_color,
        outline=border_color,
        width=border_width
    )

    # Draw Bug Icon inside box
    # Target coordinate box: center area (20% padding)
    pad = int(canvas_size * 0.22)
    s = canvas_size - 2 * pad
    stroke_w = max(2 * scale, int(size * 0.07 * scale))

    # Helper coordinate mapper from [0, 24] grid to [pad, pad + s]
    def pt(x, y):
        return (pad + (x / 24.0) * s, pad + (y / 24.0) * s)

    # Antennae
    draw.line([pt(8, 2), pt(9.88, 3.88)], fill=border_color, width=stroke_w)
    draw.line([pt(16, 2), pt(14.12, 3.88)], fill=border_color, width=stroke_w)

    # Head arc: (9, 4.13) to (15, 7.13)
    head_bbox = [pt(9, 4.13)[0], pt(9, 4.13)[1], pt(15, 10.13)[0], pt(15, 10.13)[1]]
    draw.arc(head_bbox, start=180, end=0, fill=border_color, width=stroke_w)

    # Body rounded rectangle / oval
    body_bbox = [pt(6, 7)[0], pt(6, 7)[1], pt(18, 20)[0], pt(18, 20)[1]]
    draw.rounded_rectangle(body_bbox, radius=int(6/24.0 * s), outline=border_color, width=stroke_w)

    # Center vertical line
    draw.line([pt(12, 11), pt(12, 20)], fill=border_color, width=stroke_w)

    # Left legs
    draw.line([pt(2, 9), pt(6.5, 9)], fill=border_color, width=stroke_w)
    draw.line([pt(2, 14), pt(6, 14)], fill=border_color, width=stroke_w)
    draw.line([pt(3, 19), pt(6.5, 17)], fill=border_color, width=stroke_w)

    # Right legs
    draw.line([pt(17.5, 9), pt(22, 9)], fill=border_color, width=stroke_w)
    draw.line([pt(18, 14), pt(22, 14)], fill=border_color, width=stroke_w)
    draw.line([pt(17.5, 17), pt(21, 19)], fill=border_color, width=stroke_w)

    # Downsample with high-quality Lanczos filter
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

def main():
    public_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    os.makedirs(public_dir, exist_ok=True)

    sizes = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "apple-touch-icon.png": 180,
        "icon-192.png": 192,
        "icon-512.png": 512,
    }

    images = {}
    for filename, sz in sizes.items():
        img = render_fixbounty_icon(sz)
        out_path = os.path.join(public_dir, filename)
        img.save(out_path, "PNG")
        print(f"Generated {out_path} ({sz}x{sz})")
        images[sz] = img

    # Save multi-size favicon.ico
    ico_path = os.path.join(public_dir, "favicon.ico")
    images[32].save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print(f"Generated {ico_path} (multi-size ICO)")

if __name__ == "__main__":
    main()
