"""
读取后端诊断日志并按 evt 关键字过滤。

用法:
    python tools_diag.py                     # 全量最近 40 条
    python tools_diag.py quiet toast         # 只看 evt 含这些关键字的
    python tools_diag.py quiet --limit 80
    python tools_diag.py --raw               # 不过滤，原样打 JSON

⚠️ 真实结构（别猜，踩过两次坑）：
   lines[i] = {"t": "19:59:30", "recv": 1789819170.55,
               "data": {"evt": "lootrec-init", "data": {...}}}
   —— evt 在 .data.evt，payload 在 .data.data；**不是**顶层 evt/p。
   且 lines 元素已经是 dict，不要再 json.loads。
"""
import sys
import json
import urllib.request

BASE = "http://127.0.0.1:17888"


def fetch():
    with urllib.request.urlopen(BASE + "/api/diag", timeout=5) as r:
        return json.load(r)


def unwrap(o):
    """把一条日志压成 (evt, payload)，兼容旧/新两种层级。"""
    d = o.get("data", o)
    if isinstance(d, dict):
        evt = d.get("evt")
        p = d.get("data", d.get("p"))
    else:
        evt, p = None, d
    return evt, p


def main():
    argv = sys.argv[1:]
    limit = 40
    if "--limit" in argv:
        i = argv.index("--limit")
        limit = int(argv[i + 1])
        del argv[i:i + 2]
    keys = [a for a in argv if not a.startswith("--")]

    d = fetch()
    lines = d.get("lines", []) if isinstance(d, dict) else d
    norm = []
    for ln in lines:
        if isinstance(ln, str):
            try:
                norm.append(json.loads(ln))
            except Exception:
                norm.append({"evt": "RAW", "p": ln})
        else:
            norm.append(ln)

    if keys:
        norm = [o for o in norm if any(k.lower() in str(unwrap(o)[0]).lower() for k in keys)]

    base = None
    for o in norm:
        rc = o.get("recv")
        if isinstance(rc, (int, float)):
            base = rc if base is None else min(base, rc)
    out = norm[-limit:]
    print("total lines: %d   shown: %d" % (len(lines), len(out)))
    for o in out:
        evt, p = unwrap(o)
        rc = o.get("recv")
        rel = "%9.1fms" % ((rc - base) * 1000) if (base is not None and isinstance(rc, (int, float))) else " " * 11
        ps = json.dumps(p, ensure_ascii=False) if p is not None else ""
        if len(ps) > 260:
            ps = ps[:260] + "…"
        print("  %-8s %s %-32s %s" % (o.get("t", ""), rel, str(evt), ps))


if __name__ == "__main__":
    main()
