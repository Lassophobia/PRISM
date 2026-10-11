r"""HMInject · LCU 连接层（**凭据不信 lockfile**）

## 为什么不能用 lockfile

国服客户端**根本不写 lockfile**：`E:\LoL\LeagueClient\lockfile` 是装机时留下的
占位文件，mtime 常年不动。实测（2026-09-19 22:41）：

    lockfile 里   : LeagueClient:11012:53255:A73kyjGf_...:https   ← PID/端口都是旧的
    真实在跑的     : LeagueClient.exe PID 11188，端口 65094
    ⇒ 用 lockfile 连，全部 HTTP 0（连接失败），而且是**静默**失败。

所以凭据一律从**最新的 Ux 日志**里提：

    <clientDir>\2026-09-19T21-49-29_11188_1328_LeagueClientUx.log
                └ 时间戳 ──────────┘ └PID┘ └PID2┘
    文件内容里有：  --remoting-auth-token=<token>  --app-port=<port>

这套逻辑和工程根的 `refresh_lcu_lockfile.py` 同源（那个还负责**回写** lockfile，
给别的工具读）。**本模块只读、不回写** —— 回写是守护进程的活，
我们别去抢，免得两边写同一个文件。

## 用法

    from prism_inject import lcu
    c = lcu.credentials()          # (port, token) 或 None
    st, body = lcu.get("/lol-gameflow/v1/gameflow-phase")
    lcu.invalidate()               # 强制下次重取凭据（端口变了就靠它）

★ 全部函数**不抛异常**：拿不到就返回 None / (0, b"")。
  自动注入是常驻流程，不能因为客户端重启就崩掉。
"""

from __future__ import annotations

import base64
import json
import os
import re
import ssl
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

CLIENT_CANDS = (
    Path(r"E:\LoL\LeagueClient"),
    Path(r"E:\WeGameApps\英雄联盟（含经典模式）\LeagueClient"),
    Path(r"C:\Riot Games\League of Legends\LeagueClient"),
)

try:
    from . import paths as _paths
except ImportError:
    try:
        import paths as _paths
    except Exception:
        _paths = None

_UXLOG_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T[\d\-]+)_(\d+)_(\d+)_LeagueClientUx\.log$")
_TOKEN_RE = re.compile(rb"--remoting-auth-token=([A-Za-z0-9_\-]+)\s+--app-port=(\d+)")

_NO_VERIFY = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
_NO_VERIFY.check_hostname = False
_NO_VERIFY.verify_mode = ssl.CERT_NONE

_LOCK = threading.Lock()
_CACHE = {"port": 0, "token": "", "at": 0.0, "uxlog": ""}
CRED_TTL_S = 120.0


def find_client() -> Path | None:
    """哪个候选目录里有 lockfile 或 Ux 日志，就当它是客户端目录。

    ★ 顺序：**用户选的（我们自己的 paths.json）优先**，然后才是写死的候选。
      （换机器时只有"用户选的那条"是可靠的。）
    """
    try:
        if _paths is not None:
            c0 = _paths.client_path(required=False)
            if c0 and _has_lcu_trace(c0):
                return c0
    except Exception:
        pass
    for c in CLIENT_CANDS:
        if _has_lcu_trace(c):
            return c
    return None


def _has_lcu_trace(c) -> bool:
    """这个目录像不像「客户端目录」：有 lockfile，或者有 Ux 日志。"""
    try:
        p = Path(c)
        if (p / "lockfile").exists():
            return True
        return any(_UXLOG_RE.match(f) for f in os.listdir(p))
    except OSError:
        return False


def newest_ux_log(client_dir: Path | None = None):
    """最新的 Ux 日志路径（Ux 每次启动都新写一个，所以"最新"= "当前这次启动"）。"""
    c = client_dir or find_client()
    if not c:
        return None
    best = None
    try:
        names = os.listdir(c)
    except OSError:
        return None
    for f in names:
        if not _UXLOG_RE.match(f):
            continue
        full = c / f
        try:
            t = full.stat().st_mtime
        except OSError:
            continue
        if best is None or t > best[0]:
            best = (t, full)
    return best[1] if best else None


def credentials(force: bool = False, ttl: float = CRED_TTL_S):
    """拿 (port, token)。带缓存，拿不到返回 None。

    Args:
        force: 忽略缓存，强制重读 Ux 日志（端口变了/被判失效时用）
        ttl:   缓存有效期（秒）
    """
    with _LOCK:
        if (not force and _CACHE["port"]
                and time.time() - _CACHE["at"] < ttl):
            return _CACHE["port"], _CACHE["token"]

    log = newest_ux_log()
    if not log:
        return None
    try:
        hits = _TOKEN_RE.findall(log.read_bytes())
    except OSError:
        return None
    if not hits:
        return None
    raw_tok, raw_port = hits[-1]

    with _LOCK:
        _CACHE.update({"port": int(raw_port), "token": raw_tok.decode("ascii"),
                       "at": time.time(), "uxlog": str(log)})
        return _CACHE["port"], _CACHE["token"]


def invalidate() -> None:
    """让下次 credentials() 一定重取（客户端重启、端口变了之后必须调）。"""
    with _LOCK:
        _CACHE.update({"port": 0, "token": "", "at": 0.0})


def cached_info() -> dict:
    """当前凭据缓存（诊断用，给面板看"连的是哪个端口"）。"""
    with _LOCK:
        return {"port": _CACHE["port"], "hasToken": bool(_CACHE["token"]),
                "ageSeconds": round(time.time() - _CACHE["at"], 1) if _CACHE["at"] else None,
                "uxlog": _CACHE["uxlog"]}


def get(path: str, timeout: float = 6.0, retry_cred: bool = True):
    """GET 一个 LCU 路径 → (status, bytes)。**不抛异常**。

    ★ 拿到 0（连不上）时会**自动重取一次凭据再试** —— 客户端重启后端口会变，
      第一次失败几乎都是这个原因，不该直接放弃。
    """
    for attempt in (1, 2) if retry_cred else (1,):
        c = credentials(force=(attempt == 2))
        if not c:
            return 0, b""
        port, token = c
        req = urllib.request.Request("https://127.0.0.1:%d%s" % (port, path))
        req.add_header("Authorization",
                       "Basic " + base64.b64encode(("riot:" + token).encode()).decode())
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_NO_VERIFY) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception:
            if attempt == 1:
                invalidate()
                continue
            return 0, b""
    return 0, b""


def get_json(path: str, timeout: float = 6.0):
    """GET 并解析 JSON → (status, obj)。解析失败给 None。"""
    st, raw = get(path, timeout=timeout)
    if st != 200 or not raw:
        return st, None
    try:
        return st, json.loads(raw)
    except Exception:
        return st, None


def alive() -> bool:
    """客户端在不在（拿得到会话就算在）。"""
    st, _ = get("/lol-gameflow/v1/gameflow-phase", timeout=4.0)
    return st == 200


def phase() -> str:
    """当前 gameflow 阶段：'None' / 'Lobby' / 'ChampSelect' / 'InProgress' …。

    ★ 空闲时返回的是字符串 `"None"`（**不是** None）—— 别用 `if not phase` 判空。
    """
    st, obj = get_json("/lol-gameflow/v1/gameflow-phase", timeout=6.0)
    if st != 200:
        return ""
    if isinstance(obj, str):
        return obj
    return ""


def describe() -> dict:
    """诊断用：客户端目录、Ux 日志、凭据缓存、连通性。**不抛**。"""
    c = find_client()
    log = newest_ux_log(c)
    out = {"clientDir": str(c) if c else None,
           "uxLog": log.name if log else None,
           "lockfile": None,
           "lockfileWorks": None}
    if c:
        lf = c / "lockfile"
        try:
            if lf.exists():
                out["lockfile"] = lf.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            pass
    st, _ = get("/lol-gameflow/v1/gameflow-phase", timeout=4.0)
    out["reachable"] = (st == 200)
    out["phase"] = phase()
    out["creds"] = cached_info()
    return out


if __name__ == "__main__":
    print(json.dumps(describe(), ensure_ascii=False, indent=2))
