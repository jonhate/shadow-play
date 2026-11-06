import urllib.request
import urllib.error

BASE = "https://jonhate.github.io/shadow-play/"
TARGETS = [
    ("wasm 13.2MB", "vendor/mediapipe/wasm/vision_wasm_internal.wasm"),
    ("手势模型 8.2MB", "models/gesture_recognizer.task"),
    ("main.js 23KB", "app/main.js"),
    ("index.json 5KB", "puppets/index.json"),
    ("index.html 12KB", "index.html"),
]


def probe(label, path):
    url = BASE + path
    req = urllib.request.Request(url, method="GET")
    req.add_header("Accept-Encoding", "gzip, br")
    req.add_header("Range", "bytes=0-1023")
    req.add_header("User-Agent", "Mozilla/5.0")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            h = r.headers
            print(
                f"  {label:<16} {r.status}  enc={h.get('Content-Encoding') or '(none)':<6} "
                f"type={h.get('Content-Type') or '?':<26} len={h.get('Content-Length') or '?'} "
                f"range={h.get('Content-Range') or '?'}"
            )
    except urllib.error.HTTPError as e:
        print(f"  {label:<16} HTTP {e.code}")
    except Exception as e:
        print(f"  {label:<16} 失败 {type(e).__name__}: {str(e)[:50]}")


print("=== GitHub Pages 是否压缩大文件（enc=none 表示原样传）===")
for label, path in TARGETS:
    probe(label, path)
