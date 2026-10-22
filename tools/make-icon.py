"""生成展项图标：红印章 + 金「掌」字，输出多尺寸 ico。"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT, exist_ok=True)

SIZE = 512
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角红底
pad = 26
r = 92
d.rounded_rectangle([pad, pad, SIZE - pad, SIZE - pad], radius=r, fill=(158, 36, 24, 255))
# 金边
d.rounded_rectangle([pad, pad, SIZE - pad, SIZE - pad], radius=r, outline=(232, 205, 122, 255), width=10)
# 内框
inset = 62
d.rounded_rectangle([inset, inset, SIZE - inset, SIZE - inset], radius=70, outline=(232, 205, 122, 150), width=5)

def pick_font(px):
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf", "simsun.ttc"):
        for base in (r"C:\Windows\Fonts", os.environ.get("WINDIR", r"C:\Windows") + r"\Fonts"):
            p = os.path.join(base, name)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, px)
                except Exception:
                    pass
    return ImageFont.load_default()

font = pick_font(300)
text = "掌"
bbox = d.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
pos = ((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1] - 8)
# 淡淡的暗影 + 金色字
d.text((pos[0] + 4, pos[1] + 6), text, font=font, fill=(90, 18, 10, 160))
d.text(pos, text, font=font, fill=(243, 228, 194, 255))

ico = os.path.join(OUT, "app.ico")
img.save(ico, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
png = os.path.join(OUT, "app.png")
img.resize((256, 256), Image.LANCZOS).save(png)
print("ok", ico, png, os.path.getsize(ico))
