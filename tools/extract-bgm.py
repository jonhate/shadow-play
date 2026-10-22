"""从用户提供的 MP4 里抽音轨，裁一段、统一响度，转成 BGM 用的 mp3。

用法： python tools/extract-bgm.py
源目录： ..\音频   （D:\\lj\\inktool\\piying\\音频）
输出：   audio\\bgm\\<场景id>.mp3
"""
import os
import re
import subprocess
import sys

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(ROOT), "音频")
OUT = os.path.join(ROOT, "audio", "bgm")

# 关键词 → 场景 id（按文件名里的关键词匹配，避免依赖完整文件名）
RULES = [
    ("牡丹亭", "xiang"),   # 昆曲《牡丹亭·游园》→ 西厢·月下（才子佳人）
    ("将军令", "battle"),  # 《将军令》→ 沙场点兵
    ("良宵引", "moon"),    # 古琴《良宵引》→ 月上柳梢（月夜）
    ("万年欢", "crane"),   # 古曲《万年欢》→ 仙翁跨鹤
    ("夜深沉", "bawang"),  # 京剧曲牌《夜深沉》→ 霸王别姬
    ("水龙吟", "baxian"),  # 关大洲《水龙吟》→ 八仙·过海
]

# 每个场景取多长（秒）：够循环，又不至于文件太大
SEGMENT = 72
FADE_IN = 1.5
FADE_OUT = 2.0


def probe_duration(path):
    p = subprocess.run([FFMPEG, "-hide_banner", "-i", path], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", p.stderr)
    if not m:
        return None
    h, mnt, sec = int(m.group(1)), int(m.group(2)), float(m.group(3))
    return h * 3600 + mnt * 60 + sec


def extract(src, dst, start, length):
    af = (
        f"loudnorm=I=-18:TP=-1.5:LRA=11,"
        f"afade=t=in:st=0:d={FADE_IN},"
        f"afade=t=out:st={max(0, length - FADE_OUT):.2f}:d={FADE_OUT}"
    )
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", src,
        "-vn", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "160k",
        "-af", af, dst,
    ]
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    return p.returncode == 0, p.stderr.strip()


def main():
    if not os.path.isdir(SRC):
        print(f"源目录不存在: {SRC}")
        return 1
    os.makedirs(OUT, exist_ok=True)
    files = [f for f in os.listdir(SRC) if f.lower().endswith((".mp4", ".mkv", ".webm", ".mov", ".m4a", ".mp3", ".wav"))]
    done = {}
    for name in sorted(files):
        scene = None
        for kw, sid in RULES:
            if kw in name:
                scene = sid
                break
        if not scene:
            print(f"[skip] 没匹配到场景: {name}")
            continue
        if scene in done:
            continue
        src = os.path.join(SRC, name)
        dur = probe_duration(src)
        if not dur:
            print(f"[fail] 读不出时长: {name}")
            continue
        # 跳过开头（片头/掌声），取中段
        start = min(max(6.0, dur * 0.18), max(0.0, dur - SEGMENT - 1))
        length = min(SEGMENT, max(20.0, dur - start - 0.5))
        dst = os.path.join(OUT, f"{scene}.mp3")
        ok, err = extract(src, dst, start, length)
        if ok and os.path.exists(dst):
            size = os.path.getsize(dst) / 1024 / 1024
            done[scene] = dst
            print(f"[ok]   {scene:7s} <- {name}  时长{dur:.0f}s 取{start:.0f}s起{length:.0f}s  -> {size:.1f}MB")
        else:
            print(f"[fail] {scene:7s} <- {name}: {err[:200]}")
    # 谢幕 / 待客 复用（同一首曲子）
    reuse = [("crane", "curtain"), ("moon", "attract")]
    for src_id, dst_id in reuse:
        s = done.get(src_id)
        if s:
            d = os.path.join(OUT, f"{dst_id}.mp3")
            with open(s, "rb") as fi, open(d, "wb") as fo:
                fo.write(fi.read())
            print(f"[copy] {dst_id:7s} <- {src_id}")
    print("\n完成：", ", ".join(sorted(os.listdir(OUT))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
