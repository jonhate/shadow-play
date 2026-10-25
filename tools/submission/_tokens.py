import json
import os

p = os.path.expanduser(r"~\.dsh\jet-hub\token-ledger.json")
d = json.load(open(p, encoding="utf-8"))
days = d["days"]

rows = []
for day in sorted(days):
    inp = out = cr = cw = rt = req = err = 0
    chans = set()
    for ch, v in days[day].items():
        req += v.get("requests", 0)
        inp += v.get("inputTokens", 0)
        out += v.get("outputTokens", 0)
        cr += v.get("cacheReadTokens", 0)
        cw += v.get("cacheWriteTokens", 0)
        rt += v.get("reasoningTokens", 0)
        err += v.get("errors", 0)
        chans.add(ch.split("|")[1] if "|" in ch else ch)
    rows.append((day, req, inp, out, cr, rt, err, ",".join(sorted(chans))))

lines = []
lines.append("日期         请求      输入Token      输出Token      缓存读Token     推理Token   错误  渠道")
for r in rows:
    lines.append(f"{r[0]:<12}{r[1]:>6}{r[2]:>14,}{r[3]:>15,}{r[4]:>16,}{r[5]:>12,}{r[6]:>6}  {r[7]}")

proj = [r for r in rows if r[0] in ("2026-10-22", "2026-10-23")]
lines.append("")
lines.append("开发两天合计（当日全量，含其他会话，无法拆分到本项目）：")
lines.append(
    f"  请求 {sum(r[1] for r in proj):,} | 输入 {sum(r[2] for r in proj):,} | "
    f"输出 {sum(r[3] for r in proj):,} | 缓存读 {sum(r[4] for r in proj):,} | 推理 {sum(r[5] for r in proj):,}"
)

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_tokens.txt")
open(out_path, "w", encoding="utf-8").write("\n".join(lines))
print("ok")
