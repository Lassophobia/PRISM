"""重启客户端 UX（= LCU `POST /riotclient/kill-and-restart-ux`）并等新插件真的跑起来。

★ 这是"改完前端自己实装"的**一站式**入口 —— **不必手动重启客户端**。
  
用法：
    python tools_wait_reload.py              # 只等（配合别处已发的重载）
    python tools_wait_reload.py --baseline   # 只记基线（要在发重载**之前**调用）
    python tools_wait_reload.py --restart    # 一站式：查阶段 → 发重载 → 等上线 → 报启动配置

判据（★ 2026-10-07 订正）：diag 里出现"基线之后的
  `script-loaded`（PRISM-Store 上线）+ `engine-init` / `engine-boot`（PRISM-Engine 上线）"。
  ⚠️ 老版等的是 `boot` —— 那是**已废弃的事件名**（引擎现在发 `engine-init`/`engine-boot`）
     ⇒ 老判据**永远超时**，会误报"重载没成功"（2026-10-07 实测踩到，其实 LCU 已回 204）。
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

BASE = HERE / "_diag_baseline.txt"
API = "http://127.0.0.1:17888/api/diag"
RELOAD = "http://127.0.0.1:17888/api/reload"


def fetch():
    try:
        with urllib.request.urlopen(API, timeout=8) as r:
            return json.loads(r.read().decode("utf-8")).get("lines", [])
    except Exception:
        return None


def post(url):
    req = urllib.request.Request(url, data=b"", method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.read().decode("utf-8", "replace")


def safe_phase():
    """★ 重载前提：客户端不在选人/游戏中（`None` = 大厅最安全）。返回 (safe, phase)。"""
    try:
        from prism_inject import lcu
        st, b = lcu.get("/lol-gameflow/v1/gameflow-phase")
        ph = (b.decode("utf-8", "replace")
              if isinstance(b, (bytes, bytearray)) else str(b)).strip().strip('"')
        return (st == 200 and ph in ("None", "Lobby", "Matchmaking", "ReadyCheck")), ph
    except Exception as e:
        return False, "查询失败: %s" % e


argv = sys.argv[1:]
restart = "--restart" in argv
baseline_only = "--baseline" in argv

lines0 = fetch()
n_live = len(lines0) if lines0 is not None else 0
if baseline_only or restart:
    BASE.write_text(str(n_live))
    print("基线行数 =", n_live, "（已写入 _diag_baseline.txt）")
else:
    n0 = int(BASE.read_text().strip()) if BASE.exists() else 0
    print("基线行数 =", n0, "（来自 _diag_baseline.txt）")
    n_live = n0

if baseline_only:
    raise SystemExit(0)

n0 = n_live

if restart:
    okp, ph = safe_phase()
    print("gameflow-phase =", ph, "（safe=%s）" % okp)
    if not okp:
        print("× 客户端不在安全阶段（选人/游戏中），**不重载**。")
        raise SystemExit(2)
    st, body = post(RELOAD)
    print("已发重载 -> HTTP %s %s" % (st, body.strip()))

deadline = time.time() + 90
hit = False
while time.time() < deadline:
    lines = fetch()
    if lines is not None and len(lines) > n0:
        new = lines[n0:]
        evts = [(L.get("t"), (L.get("data") or {}).get("evt"), (L.get("data") or {}))
                for L in new]
        loaded = [e for e in evts if e[1] == "script-loaded"]
        eng = [e for e in evts if e[1] in ("engine-init", "engine-boot")]
        if loaded and eng:
            print("新插件已上线：+%d 行" % len(new))
            print("  script-loaded:", [(e[0], e[2].get("build") or "") for e in loaded])
            print("  engine-init/boot:", [(e[0], e[1]) for e in eng])
            for t, ev, D in eng:
                inner = D.get("data") or {}
                if ev == "engine-boot":
                    c = inner.get("cfg") or {}
                    print("  ★ engine-boot: build=%s  cfg.mhForge=%r  mhForgeName=%r"
                          % (inner.get("build"), c.get("mhForge"), c.get("mhForgeName")))
            reset = [e for e in evts if e[1] == "mh-forge-reset-on-boot"]
            if reset:
                print("  ★ mh-forge-reset-on-boot:", [e[0] for e in reset])
            print()
            print("全部新事件：")
            for t, ev, _D in evts:
                print("  %-10s %s" % (t, ev))
            hit = True
            break
    time.sleep(2)

if not hit:
    lines = fetch()
    print("超时：未看到新的 script-loaded + engine-init/engine-boot")
    if lines:
        print("当前总行数 =", len(lines), "最新 =", lines[-1].get("t"))
    raise SystemExit(1)
