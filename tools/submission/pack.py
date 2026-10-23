"""整理参赛材料：10 张作品截图、作品及成果文件、补充材料、打包 ZIP。"""
import os
import shutil
import zipfile
from PIL import Image

ROOT = r"D:\lj\inktool\piying\shadow-play"
OUT = r"D:\lj\inktool\piying\提交材料"
SHOTS = os.path.join(ROOT, "shots")

# ---- 1. 作品截图（≤10 张，单独上传）
PICKS = [
    ("01-attract", "01_待机与引导"),
    ("02-play", "02_开演_灯箱影幕"),
    ("Z3-center", "03_左右手各控一个皮影"),
    ("96-story-cue", "04_作揖推进剧情"),
    ("94-lesson-bow", "05_教学关_做对才过"),
    ("Y2-pinch", "06_手指模式_捏合执签"),
    ("21-skin-carved", "07_三档皮_镂空"),
    ("18-duo-pose", "08_双人同台"),
    ("I4-seg3-walk", "09_六幕演完自动谢幕"),
    ("T3-debug-on", "10_工具面板与实时诊断"),
]
shot_dir = os.path.join(OUT, "作品截图")
os.makedirs(shot_dir, exist_ok=True)
for src, name in PICKS:
    p = os.path.join(SHOTS, src + ".png")
    if not os.path.exists(p):
        print("缺图：", src)
        continue
    im = Image.open(p).convert("RGB")
    im.save(os.path.join(shot_dir, name + ".jpg"), "JPEG", quality=90, optimize=True)
print("截图：", len(os.listdir(shot_dir)), "张")

# ---- 2. 作品及成果文件（可运行程序 + 源码 + 资产）
dst = os.path.join(OUT, "01_作品及成果文件", "掌中戲_手势皮影")
SKIP_DIRS = {".git", "shots", "_backup", "node_modules", ".edge-kiosk", "提交材料"}
SKIP_FILES = {"server.log", "server.err.log"}
if os.path.exists(dst):
    shutil.rmtree(dst)
for cur, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    rel = os.path.relpath(cur, ROOT)
    target = dst if rel == "." else os.path.join(dst, rel)
    os.makedirs(target, exist_ok=True)
    for f in files:
        if f in SKIP_FILES:
            continue
        shutil.copy2(os.path.join(cur, f), os.path.join(target, f))
total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(dst) for f in fs)
print(f"作品及成果文件：{total/1024/1024:.1f} MB")

# ---- 3. 补充成果材料（可核验的过程与验证记录）
extra = os.path.join(OUT, "05_补充成果材料")
os.makedirs(extra, exist_ok=True)
for src, name in [
    ("docs/台词表.md", "台词表_31句.md"),
    ("docs/手指控制调研.md", "手指控制调研_三签握法与方案.md"),
    ("docs/展项方案.md", "展项方案.md"),
    ("docs/评审视频讲稿与分镜.md", "评审视频讲稿与分镜.md"),
    ("docs/部署与开源.md", "部署与开源说明.md"),
    ("docs/作品提交填写稿.md", "系统填报文案_作品简介等.md"),
]:
    p = os.path.join(ROOT, src)
    if os.path.exists(p):
        shutil.copy2(p, os.path.join(extra, name))
print("补充材料：", len(os.listdir(extra)), "个文件")

# ---- 4. 打包 ZIP（01/03/04/05/06/07）
zip_path = os.path.join(OUT, "掌中戲_手势皮影_参赛打包文件.zip")
if os.path.exists(zip_path):
    os.remove(zip_path)
INCLUDE = ["01_作品及成果文件", "03_作品介绍文档", "04_运行或使用说明", "05_补充成果材料",
           "06_第三方资源说明", "07_AI工具使用补充说明"]
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for folder in INCLUDE:
        base = os.path.join(OUT, folder)
        for dp, _, fs in os.walk(base):
            for f in fs:
                full = os.path.join(dp, f)
                rel = os.path.relpath(full, OUT)
                z.write(full, rel)
print(f"打包：{os.path.getsize(zip_path)/1024/1024:.1f} MB")
