"""按规范统一文件命名（作品名称_材料名称），并重新打包。"""
import os
import zipfile

OUT = r"D:\lj\inktool\piying\提交材料"
NAME = "掌中戲"

RENAMES = [
    ("03_作品介绍文档/作品介绍文档.docx", f"03_作品介绍文档/{NAME}_作品介绍文档.docx"),
    ("03_作品介绍文档/作品介绍文档.pdf", f"03_作品介绍文档/{NAME}_作品介绍文档.pdf"),
    ("04_运行或使用说明/运行或使用说明.docx", f"04_运行或使用说明/{NAME}_运行或使用说明.docx"),
    ("04_运行或使用说明/运行或使用说明.pdf", f"04_运行或使用说明/{NAME}_运行或使用说明.pdf"),
    ("06_第三方资源说明/第三方资源说明.docx", f"06_第三方资源说明/{NAME}_第三方资源说明.docx"),
    ("06_第三方资源说明/第三方资源说明.pdf", f"06_第三方资源说明/{NAME}_第三方资源说明.pdf"),
    ("07_AI工具使用补充说明/AI工具使用情况说明.docx", f"07_AI工具使用补充说明/{NAME}_AI工具使用情况说明.docx"),
    ("07_AI工具使用补充说明/AI工具使用情况说明.pdf", f"07_AI工具使用补充说明/{NAME}_AI工具使用情况说明.pdf"),
    ("作品汇报PPT.pptx", f"{NAME}_作品汇报PPT.pptx"),
]
for old, new in RENAMES:
    o, n = os.path.join(OUT, old), os.path.join(OUT, new)
    if os.path.exists(o):
        os.replace(o, n)

# 截图加前缀
sd = os.path.join(OUT, "作品截图")
for f in sorted(os.listdir(sd)):
    if f.startswith(NAME + "_"):
        continue
    os.replace(os.path.join(sd, f), os.path.join(sd, f"{NAME}_作品截图_{f}"))

# 重新打包
zip_path = os.path.join(OUT, f"{NAME}_手势皮影_参赛打包文件.zip")
if os.path.exists(zip_path):
    os.remove(zip_path)
INCLUDE = ["01_作品及成果文件", "03_作品介绍文档", "04_运行或使用说明", "05_补充成果材料",
           "06_第三方资源说明", "07_AI工具使用补充说明"]
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for folder in INCLUDE:
        for dp, _, fs in os.walk(os.path.join(OUT, folder)):
            for f in fs:
                full = os.path.join(dp, f)
                z.write(full, os.path.relpath(full, OUT))

print("=== 最终目录 ===")
for dp, dirs, fs in os.walk(OUT):
    dirs.sort()
    depth = dp.replace(OUT, "").count(os.sep)
    if depth <= 2:
        print("  " * depth + os.path.basename(dp) + "/")
    for f in sorted(fs):
        full = os.path.join(dp, f)
        if dp.endswith("01_作品及成果文件") or "01_作品及成果文件" in dp:
            continue
        print("  " * (depth + 1) + f"{f}  ({os.path.getsize(full)/1024:.0f}KB)")
print(f"\nZIP: {os.path.getsize(zip_path)/1024/1024:.1f} MB")
