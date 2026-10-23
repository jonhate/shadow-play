"""把参赛材料按官方《材料整理建议》整理到桌面。"""
import os
import shutil

SRC = r"D:\lj\inktool\piying\提交材料"
DESK = os.path.join(os.path.expanduser("~"), "Desktop")
ROOT = os.path.join(DESK, "掌中戲_手势皮影_参赛材料")

if os.path.exists(ROOT):
    shutil.rmtree(ROOT)

# 规范目录 + 单独上传区
DIRS = [
    "01_作品及成果文件",
    "02_作品展示视频",
    "03_作品介绍文档",
    "04_运行或使用说明",
    "05_补充成果材料",
    "06_第三方资源说明",
    "07_AI工具使用补充说明",
    "08_学籍证明等专项材料",
    os.path.join("系统栏目单独上传", "作品截图_10张"),
]
for d in DIRS:
    os.makedirs(os.path.join(ROOT, d), exist_ok=True)

# 1. 按规范拷贝（zip 内各项）
for folder in ["01_作品及成果文件", "03_作品介绍文档", "04_运行或使用说明",
               "05_补充成果材料", "06_第三方资源说明", "07_AI工具使用补充说明"]:
    src = os.path.join(SRC, folder)
    dst = os.path.join(ROOT, folder)
    for item in os.listdir(src):
        s, d = os.path.join(src, item), os.path.join(dst, item)
        if os.path.isdir(s):
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)

# 2. 系统栏目单独上传
shot_src = os.path.join(SRC, "作品截图")
shot_dst = os.path.join(ROOT, "系统栏目单独上传", "作品截图_10张")
for f in os.listdir(shot_src):
    shutil.copy2(os.path.join(shot_src, f), os.path.join(shot_dst, f))
for f in ["掌中戲_作品汇报PPT.pptx", "掌中戲_作品汇报PPT_预览用.pdf"]:
    shutil.copy2(os.path.join(SRC, f), os.path.join(ROOT, "系统栏目单独上传", f))

# 3. 打包文件放根目录
shutil.copy2(os.path.join(SRC, "掌中戲_手势皮影_参赛打包文件.zip"),
             os.path.join(ROOT, "掌中戲_手势皮影_参赛打包文件.zip"))

# 4. 占位说明
NOTES = {
    "02_作品展示视频/放这里_说明.txt": """作品展示视频（按需提交）

按规范：作品评审视频与作品汇报 PPT 至少提交一项，本作品已提交 PPT；
若已录好评审视频，请把 mp4 放到本文件夹，并把它加进打包 zip。

技术要求：MP4 / 1920x1080 / 16:9 / 单个不超过 1GB / 建议配解说与字幕。
评审视频建议不超过 5 分钟；讲稿与分镜见 05_补充成果材料/评审视频讲稿与分镜.md。
""",
    "08_学籍证明等专项材料/说明.txt": """学籍证明等专项材料（适用时提交）

普通赛道无需提交；仅国际专项赛或其他专项赛按要求提供。
港澳台地区参赛学生不属于国际学生身份，无需按国际学生要求提交学籍证明。
""",
    "系统栏目单独上传/说明.txt": """以下材料在报名系统对应栏目【单独上传】，不要放进打包 zip：

1) 作品截图_10张/          → 栏目「作品截图」（不超过 10 张，本作品正好 10 张）
2) 掌中戲_作品汇报PPT.pptx  → 栏目「作品汇报 PPT」（与评审视频二选一，本作品提交 PPT）
3) 掌中戲_作品汇报PPT_预览用.pdf → 仅供你自己翻看排版，不用上传

另有 2 项只能在系统里完成：
- 参赛报名信息（作品名称、赛道赛项、团队信息、作品简介、运行条件、AI 使用情况）
- 参赛承诺书（系统生成 → 核对 → 盖章 → 上传）
""",
}
for rel, text in NOTES.items():
    with open(os.path.join(ROOT, rel), "w", encoding="utf-8") as f:
        f.write(text)

print("已整理到：", ROOT)
for dp, dirs, fs in os.walk(ROOT):
    dirs.sort()
    depth = dp.replace(ROOT, "").count(os.sep)
    if depth <= 2:
        name = os.path.basename(dp) or "掌中戲_手势皮影_参赛材料"
        print("  " * depth + name + "/")
    if "01_作品及成果文件" in dp:
        continue
    for f in sorted(fs):
        full = os.path.join(dp, f)
        print("  " * (depth + 1) + f"{f}  ({os.path.getsize(full)/1024:.0f}KB)")

total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(ROOT) for f in fs)
print(f"\n合计 {total/1024/1024:.1f} MB")
