"""把开发用的全尺寸截图压成仓库/文档可用的 jpg（docs/images/）。"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "shots")
OUT = os.path.join(ROOT, "docs", "images")
os.makedirs(OUT, exist_ok=True)

# 精选：每个关键能力一张
PICK = [
    ("01-attract", "待机：引导卡 + 右下角「点这里开启摄像头」"),
    ("02-play", "开演：灯箱影幕、竖排题名、朱印落款"),
    ("94-lesson-bow", "教学关：第 5/5 步，做对才过"),
    ("96-story-cue", "剧情节拍：金色提示「两手一合 · 作揖」"),
    ("Y2-pinch", "手指模式：拇指食指捏住 = 执签"),
    ("Z3-center", "左右手各控一个皮影，手掌横移带动走位"),
    ("21-skin-carved", "镂空皮：程序化雕花"),
    ("22-skin-painted", "套色皮"),
    ("18-duo-pose", "双人同台：两位观众各控一个"),
    ("I4-seg3-walk", "六幕演完自动谢幕：换位圆场"),
]

WIDTH = 1600
for name, desc in PICK:
    src = os.path.join(SRC, f"{name}.png")
    if not os.path.exists(src):
        print(f"[skip] {name}.png 不存在")
        continue
    im = Image.open(src).convert("RGB")
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    dst = os.path.join(OUT, f"{name}.jpg")
    im.save(dst, "JPEG", quality=82, optimize=True)
    print(f"[ok] {name}.jpg  {os.path.getsize(dst)/1024:.0f}KB  — {desc}")

total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1024 / 1024
print(f"\n合计 {total:.1f}MB → docs/images/")
