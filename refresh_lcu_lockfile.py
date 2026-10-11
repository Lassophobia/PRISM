"""
refresh_lcu_lockfile.py — keep the League Client lockfile usable.

WHY
---
The client's own code finds the LCU by reading a `lockfile` next to the exe:

    for directory in [exe.parent, exe.parent.parent]:
        lockfile = directory / "lockfile"
        if lockfile.is_file():
            return str(lockfile)          # first hit wins

This Tencent install shipped a **0-byte placeholder** in `<install>\\LeagueClient\\`,
so that first hit was garbage:

    parse_lockfile(): content.split(":")  -> 1 field, needs 5
    "Failed to parse lockfile: not enough values to unpack (expected 5, got 1)"

No lockfile -> no LCU credentials -> websocket never connects -> the app hangs on
    "Waiting for WebSocket status to be active before activating Pengu Loader..."

FIX
---
Write a valid lockfile. LeagueClientUx logs its own command line, which carries
`--remoting-auth-token=<t> --app-port=<p>`; verify those against the live LCU and
write `LeagueClient:<pid>:<port>:<token>:https`.

Ports and tokens rotate on every client restart, so this runs as a background
watcher (default) or as a one-shot (`--once`).

USAGE
    refresh_lcu_lockfile.py            # watch mode (used by the autostart exe)
    refresh_lcu_lockfile.py --once     # refresh a single time and exit
    refresh_lcu_lockfile.py --status   # report what it sees, change nothing
"""

import argparse
import base64
import configparser
import ctypes
import ctypes.wintypes as wt
import glob
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

def _prism_home() -> Path:
    r"""我们自己的「家」（**与 prism_inject/paths.py::prism_home 同一套顺序**）。

    ★ 为什么这里自己写一份：本脚本会被 PyInstaller 打成独立 exe（不带 prism_inject）。
      **改动时两处一起改**。

    ★★ 2026-10-11 补上「**exe 自定位**」这一档（真实事故，见下）：
      之前这里只有 `PRISM_HOME` → 注册表 → 兜底 `%LOCALAPPDATA%\PRISM`，**少了自定位**。
      而 `server.py` 的家是走 `use_exe_home()`（判据 60）⇒ 两边**不一致**：
        · server 住在 `D:\PRISM`（对）
        · watcher 却认为家是 `%LOCALAPPDATA%\PRISM`（老兜底家，里面躺着 10-09 的旧 exe）
      ⇒ 后端一掉，看门狗就**把旧版后端拉起来**，端口被它占住 ⇒ 新功能全 404
        （现场：`!! 后端不在 ⇒ 已交 explorer 拉起：C:\...\Local\PRISM\prism-server.exe`）。
      判据：冻结成 exe 时，**exe 所在目录（且同目录有 prism-server.exe）就是家** ——
      与 `paths.use_exe_home()` 的判据相同，保证两边必然一致。
    """
    v = (os.environ.get("PRISM_HOME") or "").strip()
    if v:
        return Path(v)
    try:
        if getattr(sys, "frozen", False):
            d = Path(sys.executable).resolve().parent
            if d.is_dir() and (d / "prism-server.exe").is_file():
                return d
    except Exception:
        pass
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\PRISM") as k:
            h, _t = winreg.QueryValueEx(k, "Home")
            if h and Path(h).is_dir():
                return Path(h)
    except Exception:
        pass
    return Path(os.environ.get("LOCALAPPDATA", "")) / "PRISM"


HOME = _prism_home()
WATCH_LOG = HOME / "lockfile_watch.log"
RECORD = HOME / "lockfile_written.json"

TOKEN_RE = re.compile(rb"--remoting-auth-token=([A-Za-z0-9_\-]+)\s+--app-port=(\d+)")
UXLOG_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T[\d\-]+)_(\d+)_(\d+)_LeagueClientUx\.log$")

_LOGFILE = None
_OUR_WRITE_MTIME = None


def log(msg):
    line = "[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    if sys.stdout is not None:
        try:
            print(line, flush=True)
        except Exception:
            pass
    if _LOGFILE:
        try:
            p = Path(_LOGFILE)
            if p.exists() and p.stat().st_size > 1_000_000:
                p.unlink()
            with open(p, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except Exception:
            pass


SERVER_EXE = HOME / "prism-server.exe"
PING_URL = "http://127.0.0.1:17888/api/ping"
SERVER_RETRY_COOL = 60.0
_server_try_at = 0.0


class _PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", wt.DWORD),
        ("cntUsage", wt.DWORD),
        ("th32ProcessID", wt.DWORD),
        ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
        ("th32ModuleID", wt.DWORD),
        ("cntThreads", wt.DWORD),
        ("th32ParentProcessID", wt.DWORD),
        ("pcPriClassBase", ctypes.c_long),
        ("dwFlags", wt.DWORD),
        ("szExeFile", ctypes.c_wchar * 260),
    ]


def proc_pids(image_name):
    """按**映像名**找进程 → pid 列表。查询失败返回 None（**别当成"没有"**）。"""
    try:
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        k.CreateToolhelp32Snapshot.restype = wt.HANDLE
        k.CreateToolhelp32Snapshot.argtypes = [wt.DWORD, wt.DWORD]
        k.Process32FirstW.argtypes = [wt.HANDLE, ctypes.POINTER(_PROCESSENTRY32W)]
        k.Process32NextW.argtypes = [wt.HANDLE, ctypes.POINTER(_PROCESSENTRY32W)]
        k.CloseHandle.argtypes = [wt.HANDLE]
        snap = k.CreateToolhelp32Snapshot(0x00000002, 0)
        if not snap or int(snap) == -1:
            return None
        out = []
        try:
            e = _PROCESSENTRY32W()
            e.dwSize = ctypes.sizeof(e)
            ok = k.Process32FirstW(snap, ctypes.byref(e))
            want = str(image_name).lower()
            while ok:
                if e.szExeFile.lower() == want:
                    out.append(int(e.th32ProcessID))
                ok = k.Process32NextW(snap, ctypes.byref(e))
        finally:
            k.CloseHandle(snap)
        return out
    except Exception:
        return None


def server_alive(timeout=2.0):
    """后端在不在（打 /api/ping）。任何异常都当"不在"。"""
    try:
        req = urllib.request.Request(PING_URL, headers={"User-Agent": "PRISM-watch"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return int(getattr(r, "status", 0)) == 200
    except Exception:
        return False


def ensure_server_alive():
    """客户端在跑、而后端不在 ⇒ 拉起来。**在线就什么都不做**。"""
    global _server_try_at
    if not SERVER_EXE.is_file():
        return
    if server_alive():
        return
    if not proc_pids("LeagueClientUx.exe"):
        return
    now = time.time()
    if now - _server_try_at < SERVER_RETRY_COOL:
        return
    _server_try_at = now
    try:
        subprocess.Popen(["explorer.exe", str(SERVER_EXE)], creationflags=0x08000000)
        log("!! 后端不在（/api/ping 无响应）⇒ 已交 explorer 拉起：%s" % SERVER_EXE)
    except Exception as e:
        log("!! 拉起后端失败：%s（%.0f 秒后再试）" % (str(e)[:90], SERVER_RETRY_COOL))


def find_client_dir(explicit=None):
    if explicit:
        return Path(explicit)
    pj = HOME / "paths.json"
    if pj.is_file():
        try:
            cp = json.loads(pj.read_text(encoding="utf-8")).get("client")
            if cp and (Path(cp) / "LeagueClient.exe").exists():
                return Path(cp)
        except Exception:
            pass
    for r in (r"D:\WeGameApps", r"E:\WeGameApps", r"F:\WeGameApps",
              r"D:\Riot Games", r"E:\Riot Games", r"C:\Riot Games",
              r"C:\Program Files\Riot Games"):
        if not os.path.isdir(r):
            continue
        for f in glob.iglob(os.path.join(r, "*", "LeagueClient", "LeagueClient.exe")):
            return Path(f).parent
        for f in glob.iglob(os.path.join(r, "**", "LeagueClient.exe"), recursive=True):
            return Path(f).parent
    return None


def newest_ux_log(client_dir):
    best = None
    try:
        entries = os.listdir(client_dir)
    except OSError:
        return None, None
    for f in entries:
        m = UXLOG_RE.match(f)
        if m:
            full = os.path.join(client_dir, f)
            t = os.path.getmtime(full)
            if best is None or t > best[0]:
                best = (t, full, m)
    return (best[1], best[2]) if best else (None, None)


def read_credentials(ux_log):
    hits = TOKEN_RE.findall(Path(ux_log).read_bytes())
    if not hits:
        return None
    token, port = hits[-1]
    return token.decode("ascii"), int(port)


def lcu_get(port, token, path, timeout=6):
    req = urllib.request.Request("https://127.0.0.1:%d%s" % (port, path))
    req.add_header("Authorization",
                   "Basic " + base64.b64encode(("riot:" + token).encode()).decode())
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.status, r.read(400).decode("utf-8", "replace")


def valid_lockfile(client_dir):
    """First lockfile that exists AND authenticates, else None."""
    for cand in (client_dir / "lockfile", client_dir.parent / "lockfile"):
        try:
            if not cand.exists() or cand.stat().st_size == 0:
                continue
            parts = cand.read_text(encoding="utf-8", errors="replace").split(":")
            if len(parts) < 5:
                continue
            _n, _pid, port, pw, _proto = parts[:5]
            st, _ = lcu_get(int(port), pw, "/lol-summoner/v1/current-summoner")
            if st == 200:
                return cand
        except Exception:
            continue
    return None


def _norm_path(p):
    """Normalise for comparison: the same file can be reached as E:\\LoL\\... (via
    the junction) or as the real E:\\WeGameApps\\<chinese>\\... path."""
    try:
        return os.path.normcase(os.path.realpath(str(p)))
    except Exception:
        return os.path.normcase(str(p))


def who_wrote(client_dir, path):
    """Distinguish our own write from one made by the League client.

    Content alone cannot tell them apart (both would write the same
    pid/port/token), so compare the file's mtime against the record left behind
    when we last wrote it. The record is persisted so the answer survives a
    watcher restart.
    """
    try:
        rec = json.loads(RECORD.read_text(encoding="utf-8")) if RECORD.exists() else None
        if (rec
                and rec.get("path") == _norm_path(path)
                and path.stat().st_mtime_ns == rec.get("mtime_ns")):
            return "watcher (the client never wrote its own)"
    except Exception:
        pass
    return "the League client"


def remember_write(path):
    global _OUR_WRITE_MTIME
    try:
        _OUR_WRITE_MTIME = path.stat().st_mtime_ns
    except OSError:
        _OUR_WRITE_MTIME = None
    try:
        RECORD.write_text(json.dumps({
            "path": _norm_path(path),
            "path_as_seen": str(path),
            "mtime_ns": _OUR_WRITE_MTIME,
            "content": path.read_text(encoding="utf-8", errors="replace"),
            "when": time.strftime("%Y-%m-%d %H:%M:%S"),
        }, indent=2), encoding="utf-8")
    except Exception:
        pass


def needs_work(client_dir):
    """Cheap gate: only probe the LCU when a newer client session shows up."""
    ux_log, _m = newest_ux_log(client_dir)
    if not ux_log:
        return False
    lf = client_dir / "lockfile"
    if not lf.exists() or lf.stat().st_size == 0:
        return True
    try:
        if lf.stat().st_mtime < os.path.getmtime(ux_log):
            return True
    except OSError:
        return True
    return False


def refresh(client_dir, verbose=True, quiet=False):
    """Returns (exit_code, who_wrote) where who_wrote in {None,'client','script'}."""
    found = valid_lockfile(client_dir)
    if found:
        origin = who_wrote(client_dir, found)
        if verbose:
            log("lockfile is valid, written by %s -> %s" % (origin, found))
        return 0, ("script" if origin.startswith("watcher") else "client")

    ux_log, m = newest_ux_log(client_dir)
    if not ux_log:
        if verbose:
            log("League client is not running (no *_LeagueClientUx.log) - nothing to do")
        return 2, None

    creds = read_credentials(ux_log)
    if not creds:
        log("no --remoting-auth-token in %s" % os.path.basename(ux_log))
        return 3, None
    token, port = creds
    client_pid = int(m.group(2))

    try:
        st, body = lcu_get(port, token, "/lol-summoner/v1/current-summoner")
    except Exception as e:
        if not quiet:
            log("LCU not answering on port %d yet (%s)" % (port, str(e)[:60]))
        return 4, None
    if st != 200:
        log("LCU returned HTTP %s - credentials look stale" % st)
        return 4, None

    who = re.search(r'"gameName"\s*:\s*"([^"]*)"', body)
    log("LCU OK on port %d (pid %d)%s" % (port, client_pid, " - " + who.group(1) if who else ""))

    lf = client_dir / "lockfile"
    content = "LeagueClient:%d:%d:%s:https" % (client_pid, port, token)
    lf.write_text(content, encoding="utf-8", newline="")
    remember_write(lf)
    log("wrote lockfile (%d bytes) -> %s" % (len(content), lf))
    log("NOTE: the League client had no valid lockfile of its own; "
        "the path to the LCU is only known via the watcher.")
    return 0, "script"


def main():
    global _LOGFILE
    ap = argparse.ArgumentParser(description="Keep the League Client lockfile fresh")
    ap.add_argument("--client-dir")
    ap.add_argument("--once", action="store_true", help="run once and exit (default is watch)")
    ap.add_argument("--status", action="store_true", help="report only, change nothing")
    ap.add_argument("--interval", type=int, default=20)
    ap.add_argument("--log", help="log file (watch mode defaults to %s)" % WATCH_LOG)
    ap.add_argument("--no-server-watchdog", action="store_true",
                    help="关掉「后端看门狗」（客户端在跑而后端掉了就自动拉起）—— 仅排查用")
    args = ap.parse_args()

    guard = None
    if not args.once and not args.status:
        import socket
        guard = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            guard.bind(("127.0.0.1", 50177))
            guard.listen(1)
        except OSError:
            if sys.stdout is not None:
                print("another watcher is already running - exiting")
            return 0

    client_dir = find_client_dir(args.client_dir)
    if not client_dir or not (client_dir / "LeagueClient.exe").exists():
        log("could not locate the LeagueClient directory")
        return 1

    if args.status:
        ux_log, _ = newest_ux_log(client_dir)
        log("client dir      : %s" % client_dir)
        log("latest Ux log   : %s" % (os.path.basename(ux_log) if ux_log else "(none - client not running)"))
        found = valid_lockfile(client_dir)
        if found:
            log("lockfile        : VALID at %s" % found)
            log("written by      : %s" % who_wrote(client_dir, found))
        else:
            log("lockfile        : not valid / not reachable")
        lf = client_dir / "lockfile"
        if lf.exists():
            log("  on-disk       : %r" % lf.read_bytes()[:90])
        return 0

    if args.once:
        return refresh(client_dir)[0]

    _LOGFILE = args.log or str(WATCH_LOG)
    log("watch mode, interval %ds, log %s" % (args.interval, _LOGFILE))
    state = None
    fails = 0
    while True:
        try:
            if needs_work(client_dir):
                quiet = fails > 0 and (fails % 15 != 0)
                code, who = refresh(client_dir, quiet=quiet)
                if code == 0:
                    fails = 0
                else:
                    fails += 1
                if who and who != state:
                    log("--- lockfile came from: %s ---" % who)
                    state = who
            else:
                fails = 0
        except Exception as e:
            log("error: %s" % e)
            fails += 1
        if not args.no_server_watchdog:
            try:
                ensure_server_alive()
            except Exception as e:
                log("server watchdog error: %s" % str(e)[:120])
        time.sleep(max(5, args.interval))


if __name__ == "__main__":
    sys.exit(main())
