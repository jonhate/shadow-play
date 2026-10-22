"""用 Pillow 把 rig.js 导出的仿射矩阵合成成图，肉眼验证皮影装配/IK。"""
import json, os, sys
from PIL import Image

ROOT = r"D:\lj\inktool\piying\shadow-play"
RIG = os.path.join(ROOT, "shots", "rig")
report = json.load(open(os.path.join(RIG, "pose.json"), encoding="utf-8"))

b = report["bounds"]
pad = 80
W = int(b["width"]) + pad * 2
H = int(b["height"]) + pad * 2
# 矩阵用的是 WOOP 坐标（X 右 / Y 下），原点在脚底中点
ox = b["width"] / 2 + pad
oy = pad


def render(items, out_path, bg=(247, 232, 200, 255)):
    canvas = Image.new("RGBA", (W, H), bg)
    for it in sorted(items, key=lambda i: i["zIndex"]):
        img = Image.open(it["image"]).convert("RGBA")
        a, bb, c, d, tx, ty = it["matrix"]
        # forward: X = a*x + c*y + tx ; Y = b*x + d*y + ty  (再平移到画布)
        # pillow AFFINE 需要逆变换：输入坐标 = A*out + t
        det = a * d - bb * c
        if abs(det) < 1e-9:
            continue
        ia = d / det
        ib = -c / det
        ic = (c * ty - d * tx) / det
        id_ = -bb / det
        ie = a / det
        iff = (bb * tx - a * ty) / det
        # 画布平移：X' = X + ox, Y' = Y + oy  => 逆变换后减去
        ic -= (ia * ox + ib * oy)
        iff -= (id_ * ox + ie * oy)
        layer = img.transform((W, H), Image.AFFINE, (ia, ib, ic, id_, ie, iff), resample=Image.BICUBIC)
        canvas.alpha_composite(layer)
    canvas.convert("RGB").save(out_path)
    print("wrote", out_path)


for name, items in report["poses"].items():
    render(items, os.path.join(RIG, f"pose-{name}.png"))
