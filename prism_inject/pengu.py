"""Pengu 注入器的**激活/检测**（官方 1.1.6 的做法：写 IFEO）。

## 什么是"激活"

官方 Pengu 不是往客户端目录铺 `d3d9.dll`（那是某些定制版客户端的做法），而是写一个注册表项：

    HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\
        Image File Execution Options\\LeagueClientUx.exe
        Debugger = rundll32 "<Pengu 目录>\\core.dll", #6000

⇒ Windows 启动 `LeagueClientUx.exe` 时会先跑 `rundll32` 加载我们的 `core.dll`，
   插件就是由它加载的。
★ 它是按**进程名**劫持的 ⇒ **与客户端装在哪个目录无关** ⇒ 换机不用改任何配置。

## 官方 CLI 的参数面（2026-10-09 实测）

`Pengu Loader.exe`（1.1.6，2.4MB）**只认** `--install` / `--uninstall`。
**不认** `--silent` / `--status` / `--set-league-path` —— 那些是某些定制版才有的参数。
（字符串是 UTF-16，用 grep 搜 ASCII 会全部落空。）

★ 坑：`--install` **会开出 GUI 且不自己退出** ⇒ 本模块的做法是
  「起它 → 轮询注册表（默认 40 秒）→ 写对了就 `taskkill` 收掉它」。
★ **已激活时什么都不做** ⇒ 日常启动不该弹任何窗口/UAC。

## 谁在用

- `transfer_install.py`（换机安装器）—— 换机后的那一次激活
- ★ `launcher.py` 里有**一份等价的实现**（它是 PyInstaller 独立 exe，
  跑的时候 import 不到本包）。**改这里的逻辑时，记得去那边也改一遍。**
"""

from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import subprocess
import time
from pathlib import Path

try:
    from . import paths
except ImportError:
    import paths

IFEO_KEY = (r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"
            r"\Image File Execution Options\LeagueClientUx.exe")
CREATE_NO_WINDOW = 0x08000000
SEE_MASK_NOCLOSEPROCESS = 0x00000040
SEE_MASK_NOASYNC = 0x00000100
SEE_MASK_FLAG_NO_UI = 0x00000400
ERROR_ELEVATION_REQUIRED = 740


class SHELLEXECUTEINFOW(ctypes.Structure):
    _fields_ = [
        ("cbSize", wt.DWORD),
        ("fMask", ctypes.c_ulong),
        ("hwnd", wt.HWND),
        ("lpVerb", wt.LPCWSTR),
        ("lpFile", wt.LPCWSTR),
        ("lpParameters", wt.LPCWSTR),
        ("lpDirectory", wt.LPCWSTR),
        ("nShow", ctypes.c_int),
        ("hInstApp", wt.HINSTANCE),
        ("lpIDList", ctypes.c_void_p),
        ("lpClass", wt.LPCWSTR),
        ("hkeyClass", wt.HKEY),
        ("dwHotKey", wt.DWORD),
        ("hIcon", wt.HANDLE),
        ("hProcess", wt.HANDLE),
    ]


def pengu_dir() -> Path:
    """Pengu 目录 —— **我们自带的那份**，就在 `<家>\\pengu`。"""
    return paths.prism_home() / "pengu"


def pengu_exe() -> Path:
    return pengu_dir() / "Pengu Loader.exe"


def core_dll() -> Path:
    return pengu_dir() / "core.dll"


def ifeo_debugger() -> str:
    """读 IFEO 里 LeagueClientUx.exe 的 Debugger 值（拿不到给 ""）。**不抛**。"""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, IFEO_KEY) as k:
            v, _t = winreg.QueryValueEx(k, "Debugger")
            return str(v or "")
    except Exception:
        return ""


def is_activated() -> bool:
    """IFEO 的 Debugger 有没有指向**我们的** core.dll。"""
    cur = ifeo_debugger()
    return bool(cur) and str(core_dll()).lower() in cur.lower()


def _backup_path(home=None) -> Path:
    """备份文件位置：`<家>\\uninstall\\pengu-orig.json`。"""
    try:
        h = Path(home) if home else Path(pengu_dir()).parent
    except Exception:
        h = Path(".")
    return h / "uninstall" / "pengu-orig.json"


def backup_ifeo(home=None) -> bool:
    """把**当前**的 IFEO 值存起来（供卸载还原）。

    ★ 只在**第一次**激活前备份：备份已存在就**不覆盖** —— 免得把"原始状态"冲掉。
    """
    try:
        import json
        import time
        p = _backup_path(home)
        if p.is_file():
            return True
        cur = ifeo_debugger()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({
            "at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "debugger": cur or "",
            "existed": bool(cur),
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    except Exception:
        return False


def restore_ifeo(home=None) -> str:
    """按备份还原 IFEO，返回一句人话（供日志）。

    - 备份里 `existed=False`（原来压根没有）⇒ **删掉该项**（回到"没装过 loader"）
    - 备份里有值 ⇒ 写回去
    - 没备份 ⇒ 保守地**删掉我们那项**（至少让客户端能起来）
    """
    try:
        import json
        import winreg
    except Exception as e:
        return "[!] 环境不支持 winreg：%s" % e
    data = {}
    try:
        p = _backup_path(home)
        if p.is_file():
            data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    try:
        if data.get("existed") and data.get("debugger"):
            with winreg.CreateKey(winreg.HKEY_LOCAL_MACHINE, IFEO_KEY) as k:
                winreg.SetValueEx(k, "Debugger", 0, winreg.REG_SZ, str(data["debugger"]))
            return "已还原原来的注入项：%s" % str(data["debugger"])[:120]
        try:
            winreg.DeleteKey(winreg.HKEY_LOCAL_MACHINE, IFEO_KEY)
            return "已移除注入项（原本就没有 ⇒ 客户端回到未装 loader 的状态）"
        except FileNotFoundError:
            return "注入项本来就不存在，无需处理"
    except PermissionError:
        return "[!] 没权限改 IFEO（需要管理员）—— 请手动检查注册表"
    except Exception as e:
        return "[!] 还原注入项失败：%s" % str(e)[:120]


def _kill_image(name: str) -> None:
    try:
        subprocess.run(["taskkill", "/F", "/IM", name],
                       capture_output=True, creationflags=CREATE_NO_WINDOW)
    except Exception:
        pass


def _spawn_install(exe: Path):
    """起 `Pengu Loader.exe --install`。要提权就转 UAC。返回 (pid, 说明)。"""
    cmd = str(exe)
    try:
        p = subprocess.Popen([cmd, "--install"], cwd=str(exe.parent), close_fds=True)
        return p.pid, "normal"
    except OSError as e:
        if getattr(e, "winerror", None) != ERROR_ELEVATION_REQUIRED:
            return None, "起不来：%s" % e
    sei = SHELLEXECUTEINFOW()
    sei.cbSize = ctypes.sizeof(sei)
    sei.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI
    sei.lpVerb = "runas"
    sei.lpFile = cmd
    sei.lpParameters = "--install"
    sei.lpDirectory = str(exe.parent)
    sei.nShow = 1
    if not ctypes.windll.shell32.ShellExecuteExW(ctypes.byref(sei)):
        err = ctypes.get_last_error()
        return None, "UAC 被拒（error=%s）" % err
    try:
        pid = ctypes.windll.kernel32.GetProcessId(sei.hProcess)
    except Exception:
        pid = None
    return pid, "elevated"


def ensure_activated(log=None, timeout: float = 40.0):
    """确保 Pengu 已激活。**已激活时什么都不做**。返回 (ok, 说明)。**不抛**。

    ★ 需要写 HKLM ⇒ 可能要 UAC（会弹一次）。
    """
    def _l(m):
        if log:
            try:
                log(m)
            except Exception:
                pass

    if is_activated():
        _l("Pengu 已激活，跳过（IFEO → %s）" % ifeo_debugger())
        return True, "已激活"

    exe = pengu_exe()
    if not exe.is_file():
        return False, "找不到 Pengu：%s" % exe

    _l("Pengu 未激活（当前 IFEO=%r）⇒ 调 --install" % ifeo_debugger())
    pid, how = _spawn_install(exe)
    if pid is None:
        _l("Pengu 激活失败：%s" % how)
        return False, how

    ok = False
    t0 = time.time()
    while time.time() - t0 < timeout:
        time.sleep(0.5)
        if is_activated():
            time.sleep(1.5)
            ok = True
            break
    _kill_image("Pengu Loader.exe")
    if ok:
        _l("Pengu 激活成功（IFEO → %s）" % ifeo_debugger())
        return True, "已激活"
    return False, "跑完了 --install，但 IFEO 没指到我们的 core.dll（现在=%r）" % ifeo_debugger()


def describe() -> dict:
    """体检用：Pengu 在哪、激活了没。**不抛**。"""
    d = pengu_dir()
    return {
        "dir": str(d),
        "exe": str(pengu_exe()),
        "coreDll": str(core_dll()),
        "coreDllExists": core_dll().is_file(),
        "pluginsDir": str(d / "plugins"),
        "pluginsCount": (len([x for x in (d / "plugins").iterdir()])
                         if (d / "plugins").is_dir() else 0),
        "ifeo": ifeo_debugger(),
        "activated": is_activated(),
    }


if __name__ == "__main__":
    import json
    print(json.dumps(describe(), ensure_ascii=False, indent=2))
