"""
PRISM launcher —— 让 PRISM 的整套运行环境**随客户端会话起落**（不依赖任何第三方启动器）。

WHAT IT DOES
-----------
    1. 起  lcu-lockfile-watch.exe    （隐藏。腾讯客户端不写 lockfile，得有人合成，否则 LCU 不可用）
    2. 起  prism-server.exe          （隐藏。PRISM 插件的 /api/… 全靠它）
    3. 确保 **Pengu 已激活**（写 IFEO，让客户端加载我们的 core.dll）—— 幂等，已激活就跳过
    4. 弹一个提示：「可以启动客户端了」
    5. **等客户端（LeagueClientUx.exe）出现 → 等它退出**
    6. 客户端退出 ⇒ 把 watcher 和后端一起收掉，并**还原 IFEO**
       （客户端回到"没装注入器"的原生状态 —— 不开 PRISM 就不会有注入器残留）

★ 启动链**完全由我们自己组装**：
  起 helper → 激活 Pengu → 提示就绪 → 等客户端退出 → 收 helper。

★ 本程序**自带管理员清单**（PyInstaller `uac_admin=True`）：双击时弹一次 UAC，
  之后「写 IFEO（激活）」和「还原 IFEO（收工）」都在这一次授权里完成 ——
  IFEO 在 HKLM，只有管理员能改。这是"用完即走"的前提。

★ 为什么生命周期挂在"客户端"上（选定的方案）：
  双击只做**就绪**（客户端你自己开）；**你关掉客户端，它自己收工** —— 零开机自启项。

★ 提示怎么给：本程序是 **`console=False`**（没有控制台），所以提示走 **系统弹窗**（后台线程弹，
  不阻塞主流程），全过程另记 `<家>\\launcher.log`。

★ 单独起 helper 的方式：`CREATE_NO_WINDOW | DETACHED_PROCESS`。
  本程序由**用户双击**启动（父进程是 explorer）⇒ 不是在谁的任务对象里，不会有"被连带回收"问题
  （对比 MEM-06 判据 65：那条只针对"从 agent 的 shell 里直接起"）。

命令行
    （无参数）             就绪后等客户端，客户端退出即收工
    --test                start watcher + server, hold ~10s, kill them, report
    --no-wait             只做就绪（起 helper + 激活 Pengu + 提示），不等客户端
"""

import ctypes
import ctypes.wintypes as wt
import json
import os
import shutil
import socket
import subprocess
import sys
import threading
import time

def _prism_home() -> str:
    r"""我们自己的「家」。

    ★ 为什么这里要自己写一份：本脚本会被 PyInstaller 打成**独立 exe**（不带 prism_inject），
      运行时 import 不到那个包。⇒ **改动时两处一起改**，别只改一边。
    顺序：`PRISM_HOME` 环境变量 → **exe 自定位** → 注册表 `Home`（**HKCU 优先，其次 HKLM**）
          → `%LOCALAPPDATA%\PRISM`。

    ★ 两个 hive 都要读 —— 跟 `prism_inject/paths.py::_reg_home` 一致。安装器在提权上下文里跑的，
      指针**可能写在 HKLM**（本机实测就是：HKLM 有 `Home=D:\PRISM`，HKCU 反而没有）
      ⇒ 只读 HKCU 会漏，然后掉进兜底拿到一个**错的家**（备份文件、日志全找不着）。
    """
    v = (os.environ.get("PRISM_HOME") or "").strip()
    if v:
        return v
    try:
        if getattr(sys, "frozen", False):
            me = os.path.dirname(os.path.abspath(sys.executable))
            if os.path.isfile(os.path.join(me, "prism-server.exe")):
                return me
    except Exception:
        pass
    try:
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(hive, r"Software\PRISM") as k:
                    h, _t = winreg.QueryValueEx(k, "Home")
                    if h and os.path.isdir(h):
                        return h
            except Exception:
                continue
    except Exception:
        pass
    return os.path.join((os.environ.get("LOCALAPPDATA") or ""), "PRISM")


HOME = _prism_home()


def _pick(name: str) -> str:
    """拿家里那份 exe（`<家>\\<name>`）。"""
    return os.path.join(HOME, name)


def _pengu_dir() -> str:
    """Pengu 目录 —— 我们自带的那份，在 `<家>\\pengu`。"""
    return os.path.join(HOME, "pengu")


WATCHER = _pick("lcu-lockfile-watch.exe")
SERVER = _pick("prism-server.exe")
PENGU_DIR = _pengu_dir()
PENGU_EXE = os.path.join(PENGU_DIR, "Pengu Loader.exe")
PENGU_CORE = os.path.join(PENGU_DIR, "core.dll")
SERVER_PORT = 17888
PING_URL = "http://127.0.0.1:%d/api/ping" % SERVER_PORT
LOG = os.path.join(HOME, "launcher.log")

REPAIR_DIR = os.path.join(HOME, "_repair")
REPAIR_CORE = os.path.join(REPAIR_DIR, "core.dll")
PATHS_JSON = os.path.join(HOME, "paths.json")

IFEO_KEY = (r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"
            r"\Image File Execution Options\LeagueClientUx.exe")
IFEO_BACKUP = os.path.join(HOME, "uninstall", "pengu-orig.json")
CLIENT_IMAGE = "LeagueClientUx.exe"
CLIENT_APPEAR_TIMEOUT = 30 * 60
CLIENT_GONE_GRACE = 45
CLIENT_GONE_TOTAL = 10 * 60

CREATE_NO_WINDOW = 0x08000000
DETACHED_PROCESS = 0x00000008
SEE_MASK_NOCLOSEPROCESS = 0x00000040
SEE_MASK_NOASYNC = 0x00000100
SEE_MASK_FLAG_NO_UI = 0x00000400
INFINITE = 0xFFFFFFFF
MB_ICONERROR = 0x10
MB_ICONWARNING = 0x30
MB_ICONINFO = 0x40

_NO_UI = ((os.environ.get("PRISM_LAUNCHER_NO_UI") or "").strip().lower()
          not in ("", "0", "false", "no"))


def log(msg):
    line = "[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            if fh.tell() > 500_000:
                fh.seek(0)
                fh.truncate()
            fh.write(line + "\n")
    except Exception:
        pass
    if sys.stdout is not None:
        try:
            print(line, flush=True)
        except Exception:
            pass


def notify(title: str, text: str, flags: int = MB_ICONINFO):
    """系统弹窗（本程序没有控制台，只能用这个）。**后台线程弹**，不阻塞主流程。

    ★ 设 `PRISM_LAUNCHER_NO_UI=1` 时只记日志、不弹窗 —— 给自动化/我这边测试用。
    """
    if _NO_UI:
        log("[no-ui] %s | %s" % (title, str(text).replace("\n", " ")))

        return

    def _go():
        try:
            ctypes.windll.user32.MessageBoxW(None, text, title, flags)
        except Exception:
            pass
    try:
        threading.Thread(target=_go, name="prism-notify", daemon=True).start()
    except Exception:
        pass


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


class PROCESSENTRY32W(ctypes.Structure):
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


class OPENFILENAMEW(ctypes.Structure):
    """给 `GetOpenFileNameW` 用的"打开文件"对话框参数（零依赖选文件）。"""
    _fields_ = [
        ("lStructSize", wt.DWORD),
        ("hwndOwner", wt.HWND),
        ("hInstance", wt.HINSTANCE),
        ("lpstrFilter", wt.LPCWSTR),
        ("lpstrCustomFilter", wt.LPWSTR),
        ("nMaxCustFilter", wt.DWORD),
        ("nFilterIndex", wt.DWORD),
        ("lpstrFile", wt.LPWSTR),
        ("nMaxFile", wt.DWORD),
        ("lpstrFileTitle", wt.LPWSTR),
        ("nMaxFileTitle", wt.DWORD),
        ("lpstrInitialDir", wt.LPCWSTR),
        ("lpstrTitle", wt.LPCWSTR),
        ("Flags", wt.DWORD),
        ("nFileOffset", wt.WORD),
        ("nFileExtension", wt.WORD),
        ("lpstrDefExt", wt.LPCWSTR),
        ("lCustData", ctypes.c_void_p),
        ("lpfnHook", ctypes.c_void_p),
        ("lpTemplateName", wt.LPCWSTR),
        ("pvReserved", ctypes.c_void_p),
        ("dwReserved", wt.DWORD),
        ("FlagsEx", wt.DWORD),
    ]


def pick_file(title: str, init_dir: str = "", filter_str: str = "") -> str:
    """弹系统"打开文件"对话框，返回选中路径（取消给 `""`）。"""
    try:
        buf = ctypes.create_unicode_buffer(1024)
        ofn = OPENFILENAMEW()
        ofn.lStructSize = ctypes.sizeof(ofn)
        ofn.lpstrFilter = filter_str or "所有文件\0*.*\0\0"
        ofn.lpstrFile = ctypes.cast(buf, wt.LPWSTR)
        ofn.nMaxFile = 1024
        ofn.lpstrTitle = title
        ofn.lpstrInitialDir = init_dir or None
        ofn.Flags = 0x00080000 | 0x00001000 | 0x00000800 | 0x00000008
        if ctypes.windll.comdlg32.GetOpenFileNameW(ctypes.byref(ofn)):
            return buf.value or ""
    except Exception as e:
        log("文件选择对话框失败：%s" % e)
    return ""


def proc_pids(image_name: str):
    """按**映像名**找进程 → pid 列表。查询失败返回 None（**别当"没有"**）。"""
    try:
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        k.CreateToolhelp32Snapshot.restype = wt.HANDLE
        k.CreateToolhelp32Snapshot.argtypes = [wt.DWORD, wt.DWORD]
        k.Process32FirstW.argtypes = [wt.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
        k.Process32NextW.argtypes = [wt.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
        k.CloseHandle.argtypes = [wt.HANDLE]
        snap = k.CreateToolhelp32Snapshot(0x00000002, 0)
        if not snap or int(snap) == -1:
            return None
        out = []
        try:
            e = PROCESSENTRY32W()
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
    except Exception as ex:
        log("进程枚举失败：%s" % ex)
        return None


def single_instance():
    """单实例。已有实例在跑 → 返回 None。"""
    try:
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        k.CreateMutexW.restype = wt.HANDLE
        k.CreateMutexW.argtypes = [ctypes.c_void_p, wt.BOOL, wt.LPCWSTR]
        h = k.CreateMutexW(None, False, "PRISM-Launcher-Single")
        if not h:
            return h
        if ctypes.get_last_error() == 183:
            return None
        return h
    except Exception as ex:
        log("单实例检查失败（忽略）：%s" % ex)
        return True


def ifeo_debugger() -> str:
    """读 IFEO 里 LeagueClientUx.exe 的 Debugger（= Pengu 激活状态）。取不到给 ""。"""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, IFEO_KEY) as k:
            v, _t = winreg.QueryValueEx(k, "Debugger")
            return str(v or "")
    except Exception:
        return ""


def run_elevated(exe: str, params: str = "", wait_s: float = 0.0) -> bool:
    """提权跑一个 exe。返回 False 表示 UAC 被拒/启动失败（不抛）。"""
    sei = SHELLEXECUTEINFOW()
    sei.cbSize = ctypes.sizeof(sei)
    sei.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI
    sei.lpVerb = "runas"
    sei.lpFile = exe
    sei.lpParameters = params or None
    sei.lpDirectory = os.path.dirname(exe)
    sei.nShow = 1
    ok = ctypes.windll.shell32.ShellExecuteExW(ctypes.byref(sei))
    if not ok:
        err = ctypes.get_last_error() or ctypes.windll.kernel32.GetLastError()
        log("ShellExecuteExW(runas) 失败 error=%s（UAC 被拒？）" % err)
        return False
    if wait_s:
        try:
            ctypes.windll.kernel32.WaitForSingleObject(sei.hProcess, int(wait_s * 1000))
        except Exception:
            pass
    try:
        ctypes.windll.kernel32.CloseHandle(sei.hProcess)
    except Exception:
        pass
    return True


def ensure_pengu():
    """确保 Pengu 已激活（IFEO 的 Debugger 指向我们的 core.dll）。返回 (ok, 说明)。"""
    cur = ifeo_debugger()
    if cur and PENGU_CORE.lower() in cur.lower():
        log("Pengu 已激活，跳过（IFEO → %s）" % cur)
        return True, "已激活"
    if not os.path.isfile(PENGU_EXE):
        return False, "找不到注入器：%s" % PENGU_EXE

    log("Pengu 未激活（当前 IFEO=%r）⇒ 调 --install（可能要你点一次 UAC）" % cur)
    if not run_elevated(PENGU_EXE, "--install"):
        return False, "UAC 被拒或注入器起不来"

    t0 = time.time()
    ok = False
    while time.time() - t0 < 40:
        time.sleep(1.0)
        cur = ifeo_debugger()
        if cur and PENGU_CORE.lower() in cur.lower():
            ok = True
            break
    try:
        subprocess.run(["taskkill", "/F", "/IM", "Pengu Loader.exe"],
                       capture_output=True, creationflags=CREATE_NO_WINDOW)
    except Exception:
        pass
    if ok:
        log("Pengu 激活成功（IFEO → %s）" % ifeo_debugger())
        return True, "已激活"
    return False, ("跑完了 --install，但 IFEO 没指到我们的 core.dll（现在=%r）" % cur)


def backup_ifeo() -> None:
    """激活前把**原始** IFEO 记一份（只在没有备份时写一次，供收工/卸载还原）。

    ★ 只记"不是我们写的"那个值：要是当前已经指向我们的 core.dll，说明原始状态
      在更早的时候就被覆盖过（当时没留备份）⇒ 按"原本没有"记。
      否则收工时会把我们自己的值"还原"回去，等于白擦。
    """
    try:
        if os.path.isfile(IFEO_BACKUP):
            return
        cur = ifeo_debugger()
        mine = bool(cur) and PENGU_CORE.lower() in cur.lower()
        os.makedirs(os.path.dirname(IFEO_BACKUP), exist_ok=True)
        with open(IFEO_BACKUP, "w", encoding="utf-8") as f:
            json.dump({
                "at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "debugger": "" if mine else cur,
                "existed": False if mine else bool(cur),
            }, f, ensure_ascii=False, indent=2)
    except Exception as ex:
        log("备份 IFEO 失败（忽略）：%s" % ex)


def deactivate_pengu() -> str:
    """收工时**还原** IFEO —— 让客户端回到"没装注入器"的原生状态。返回一句人话。

    幂等：本来就干净、或者指向别人的注入器，都不动。
    ★ 要写 HKLM ⇒ 靠本 exe 自带的管理员清单（这次 UAC 已经把权限给了）。
      从源码直接跑、又没提权时，会返回一句失败说明，**不抛**。
    """
    try:
        cur = ifeo_debugger()
        if not cur:
            return "IFEO 本来就干净，无需处理"
        if PENGU_CORE.lower() not in cur.lower():
            return "IFEO 指向的不是我们（%s）⇒ 不动" % cur[:80]
        data = {}
        try:
            if os.path.isfile(IFEO_BACKUP):
                with open(IFEO_BACKUP, "r", encoding="utf-8") as f:
                    data = json.load(f)
        except Exception:
            data = {}
        import winreg
        if data.get("existed") and data.get("debugger"):
            with winreg.CreateKey(winreg.HKEY_LOCAL_MACHINE, IFEO_KEY) as k:
                winreg.SetValueEx(k, "Debugger", 0, winreg.REG_SZ, str(data["debugger"]))
            return "已还原原来的注入项：%s" % str(data["debugger"])[:100]
        winreg.DeleteKey(winreg.HKEY_LOCAL_MACHINE, IFEO_KEY)
        return "已移除注入项 ⇒ 客户端回到未装注入器的状态"
    except FileNotFoundError:
        return "注入项本来就不存在"
    except Exception as ex:
        return "[!] 还原注入项失败：%s" % str(ex)[:120]


def _seed_repair():
    """core.dll 在位时顺手补种一份备份（家里没有 / 已被删时才做）。"""
    try:
        if os.path.isfile(REPAIR_CORE):
            return
        os.makedirs(REPAIR_DIR, exist_ok=True)
        shutil.copy2(PENGU_CORE, REPAIR_CORE)
        log("已备份 core.dll → %s" % REPAIR_CORE)
    except Exception as e:
        log("备份 core.dll 失败（不影响本次）：%s" % e)


def self_heal_core() -> str:
    """core.dll 自检自愈。

    返回：`"ok"`＝现在有可用的 core.dll（可继续注入）；`"skip"`＝本次不注入；
          `"quit"`＝用户要求退出。
    """
    if os.path.isfile(PENGU_CORE):
        _seed_repair()
        return "ok"

    log("[!] core.dll 不见了：%s" % PENGU_CORE)
    if os.path.isfile(REPAIR_CORE):
        try:
            os.makedirs(PENGU_DIR, exist_ok=True)
            shutil.copy2(REPAIR_CORE, PENGU_CORE)
            log("[OK] 已从备份自动恢复 core.dll ← %s" % REPAIR_CORE)
            notify("PRISM 已自动修复",
                   "检测到注入核心文件缺失，已自动从备份恢复。\n\n"
                   "（多半是清理软件 / 杀毒软件误删，不影响本次使用。）", MB_ICONWARNING)
            return "ok"
        except Exception as e:
            log("[X] 从备份恢复失败：%s" % e)
    else:
        log("[!] 备份也没有：%s" % REPAIR_CORE)

    if _NO_UI:
        log("[no-ui] core.dll 缺失且无法自愈 ⇒ 本次不注入")
        return "skip"

    r = ctypes.windll.user32.MessageBoxW(
        None,
        "PRISM 的注入核心（core.dll）不见了，本次皮肤注入不会生效。\n\n"
        "可能原因：清理软件误删 / 杀毒软件隔离 / 安装目录被手动改动。\n\n"
        "【是】我自己找一份 core.dll 给它补上\n"
        "　（可从另一台装好 PRISM 的机器、或 PRISM 安装包里找到）\n"
        "【否】先不管，本次只用皮肤库等其它功能\n"
        "【取消】退出\n",
        "PRISM —— 注入文件缺失", MB_YESNOCANCEL | MB_ICONWARNING)
    if r == 6:
        p = pick_file("请选择一份 core.dll（注入核心）",
                      PENGU_DIR, "core.dll\0core.dll\0所有文件\0*.*\0\0")
        if p and os.path.isfile(p):
            try:
                os.makedirs(PENGU_DIR, exist_ok=True)
                shutil.copy2(p, PENGU_CORE)
                try:
                    os.makedirs(REPAIR_DIR, exist_ok=True)
                    shutil.copy2(p, REPAIR_CORE)
                except Exception:
                    pass
                log("[OK] 用户指定的 core.dll 已就位：%s" % p)
                return "ok"
            except Exception as e:
                log("[X] 拷贝 core.dll 失败：%s" % e)
        log("用户没选到有效文件 ⇒ 本次不注入")
        return "skip"
    if r == 7:
        log("用户选择跳过 ⇒ 本次不注入")
        return "skip"
    log("用户选择退出")
    return "quit"


def paths_stale() -> bool:
    """`paths.json` 里记的客户端 / 游戏目录是不是已经不可用了（重装游戏、挪了盘）。"""
    if not os.path.isfile(PATHS_JSON):
        log("[i] 还没有路径配置（%s）" % PATHS_JSON)
        return True
    try:
        import json
        with open(PATHS_JSON, "r", encoding="utf-8") as fh:
            d = json.load(fh)
    except Exception as e:
        log("[!] 路径配置读不了（%s）⇒ 当作失效" % str(e)[:100])
        return True
    if not isinstance(d, dict):
        return True
    c = str(d.get("client") or "")
    g = str(d.get("game") or "")
    ok_c = bool(c) and os.path.isfile(os.path.join(c, "LeagueClient.exe"))
    ok_g = bool(g) and os.path.isfile(os.path.join(g, "League of Legends.exe"))
    if ok_c or ok_g:
        return False
    log("[!] 路径配置已失效：client=%r game=%r" % (c, g))
    return True


def repair_paths():
    """路径失效 ⇒ 让后端**自动重新定位**（写 `paths.json`）。失败只提示，不阻断。"""
    if not paths_stale():
        return
    if not os.path.isfile(SERVER):
        log("[!] 后端不在（%s）⇒ 跳过路径重定位" % SERVER)
        return
    log("[i] 调后端自动重新定位路径 …")
    try:
        rc = subprocess.run([SERVER, "--auto-repath"],
                            capture_output=True, timeout=180,
                            encoding="utf-8", errors="replace",
                            creationflags=CREATE_NO_WINDOW).returncode
    except Exception as e:
        log("[!] 重定位调用失败：%s" % str(e)[:120])
        return
    if rc == 0:
        log("[OK] 路径重定位完成")
    else:
        log("[!] 路径重定位没成功（rc=%s）" % rc)
        notify("PRISM 找不到游戏",
               "PRISM 之前记住的英雄联盟目录不可用了，自动也没找到新的位置。\n\n"
               "· 如果刚重装过游戏：重新运行一次「PRISM 完整版.exe」把路径再选一遍\n"
               "· 日志：%s" % LOG, MB_ICONWARNING)


def check_hashes():
    """核对「哈希字典 vs 当前游戏版本」（2026-10-10）。

    ★ **只提示、绝不拦** —— 所以这里不看返回码、也不改流程：字典旧了只是"现造新皮肤会失败"，
      而拦下来会让人**玩不了游戏**（已定案）。
    ★ 调的是 `prism-server.exe --check-hashes`：那段逻辑要 `paths` / `hashes` 模块，
      启动器（独立 exe）import 不到 —— 详见 `prism_inject/hashes.py` 文件头。
    """
    if not os.path.isfile(SERVER):
        log("[i] 后端不在（%s）⇒ 跳过字典核对" % SERVER)
        return
    log("[i] 核对哈希字典与游戏版本 …")
    try:
        rc = subprocess.run([SERVER, "--check-hashes"],
                            capture_output=True, timeout=30,
                            creationflags=CREATE_NO_WINDOW).returncode
        log("字典核对完成（rc=%s）" % rc)
    except subprocess.TimeoutExpired:
        log("字典核对超时（提示框大概还开着）⇒ 不阻塞，继续")
    except Exception as e:
        log("[!] 字典核对调用失败（不影响使用）：%s" % str(e)[:120])


def start_watcher():
    if not os.path.isfile(WATCHER):
        log("watcher missing: %s" % WATCHER)
        return None
    try:
        p = subprocess.Popen(
            [WATCHER],
            creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS,
            close_fds=True,
            cwd=os.path.dirname(WATCHER),
        )
        log("watcher started, pid=%d" % p.pid)
        time.sleep(1.5)
        return p
    except Exception as e:
        log("failed to start watcher: %s" % e)
        return None


def stop_watcher(proc):
    if proc is not None:
        log("stopping watcher (pid=%d)..." % proc.pid)
    killed = False
    if proc is not None:
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, creationflags=CREATE_NO_WINDOW)
            killed = True
        except Exception as e:
            log("taskkill by pid failed: %s" % e)
    try:
        subprocess.run(["taskkill", "/F", "/IM", "lcu-lockfile-watch.exe"],
                       capture_output=True, creationflags=CREATE_NO_WINDOW)
        killed = True
    except Exception as e:
        log("taskkill by image failed: %s" % e)
    log("watcher stopped" if killed else "no watcher to stop")


def port_alive(port, timeout=0.4):
    """本机某个端口有没有人在听（= 后端是不是已经在跑）。"""
    s = socket.socket()
    s.settimeout(timeout)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False
    finally:
        try:
            s.close()
        except Exception:
            pass


def ping_ok(timeout=1.0):
    """后端就绪判据：GET /api/ping 返回 200 且带 ok:true。"""
    try:
        import json
        import urllib.request
        with urllib.request.urlopen(PING_URL, timeout=timeout) as r:
            if r.status != 200:
                return False
            return bool(json.loads(r.read().decode("utf-8", "replace")).get("ok"))
    except Exception:
        return False


def start_server():
    """静默拉起后端；已经在跑就复用，绝不重复起第二份。"""
    if port_alive(SERVER_PORT):
        log("prism-server already listening on %d - reusing it" % SERVER_PORT)
        return None
    if not os.path.isfile(SERVER):
        log("prism-server missing: %s (插件会报取数失败)" % SERVER)
        return None
    try:
        p = subprocess.Popen(
            [SERVER],
            creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS,
            close_fds=True,
            cwd=os.path.dirname(SERVER),
        )
        log("prism-server started, pid=%d" % p.pid)
    except Exception as e:
        log("failed to start prism-server: %s" % e)
        return None
    for i in range(16):
        if ping_ok():
            log("prism-server ready after %.1fs (/api/ping ok)" % (i * 0.5))
            return p
        time.sleep(0.5)
    log("prism-server did NOT answer /api/ping within 8s (端口在听吗=%s) - 继续"
        % port_alive(SERVER_PORT))
    return p


def stop_server(proc):
    if proc is not None:
        log("stopping prism-server (pid=%d)..." % proc.pid)
    killed = False
    if proc is not None:
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, creationflags=CREATE_NO_WINDOW)
            killed = True
        except Exception as e:
            log("taskkill prism-server by pid failed: %s" % e)
    try:
        subprocess.run(["taskkill", "/F", "/IM", "prism-server.exe"],
                       capture_output=True, creationflags=CREATE_NO_WINDOW)
        killed = True
    except Exception as e:
        log("taskkill prism-server by image failed: %s" % e)
    log("prism-server stopped" if killed else "no prism-server to stop")


def wait_for_client():
    """等客户端出现，再等它退出。返回 True=真的等到它退出了；False=等到超时也没出现。

    ★ "退出"要**确认**，而且要**多轮**：客户端会自己重启 / 重载（版本更新、崩溃恢复，
      以及 PRISM-Engine「进图标栏首次自愈」的 location.reload()）⇒ 消失后每
      `CLIENT_GONE_GRACE` 秒看一眼，**最长等 `CLIENT_GONE_TOTAL`**；期间只要露过面就继续守。
    """
    t0 = time.time()
    log("等你启动客户端（LeagueClientUx.exe），最多等 %.0f 分钟" % (CLIENT_APPEAR_TIMEOUT / 60))
    while True:
        pids = proc_pids(CLIENT_IMAGE)
        if pids:
            log("检测到客户端（pid=%s）" % pids[:3])
            break
        if pids is None and time.time() - t0 > 60:
            log("进程枚举持续失败 ⇒ 放弃等待（helper 保持运行）")
            return False
        if time.time() - t0 > CLIENT_APPEAR_TIMEOUT:
            return False
        time.sleep(3.0)

    while True:
        while True:
            pids = proc_pids(CLIENT_IMAGE)
            if pids is None:
                time.sleep(5.0)
                continue
            if not pids:
                break
            time.sleep(5.0)
        gone_at = time.time()
        log("客户端进程不见了 ⇒ 每 %.0f 秒确认一次，最多等 %.0f 分钟（可能在自重启/重载）"
            % (CLIENT_GONE_GRACE, CLIENT_GONE_TOTAL / 60.0))
        while True:
            time.sleep(CLIENT_GONE_GRACE)
            if proc_pids(CLIENT_IMAGE):
                log("客户端又回来了（自重启/重载）⇒ 继续守着（等了 %.0f 秒）"
                    % (time.time() - gone_at))
                break
            waited = time.time() - gone_at
            if waited >= CLIENT_GONE_TOTAL:
                log("客户端确实退出了（已等 %.0f 秒都没再出现）" % waited)
                return True
            log("  还没回来（已等 %.0f 秒 / 最多 %.0f 秒）…" % (waited, CLIENT_GONE_TOTAL))


def main():
    args = set(a.lower() for a in sys.argv[1:])

    if "--test" in args:
        log("=== test mode: helper lifetime check (watcher + prism-server) ===")
        w = start_watcher()
        s = start_server()
        log("--- holding 10s | watcher pid=%s | server pid=%s | /api/ping=%s ---"
            % (w.pid if w else None, s.pid if s else None, ping_ok()))
        time.sleep(10)
        stop_server(s)
        stop_watcher(w)
        time.sleep(1.0)
        log("=== test done | /api/ping after stop=%s (期望 False) ===" % ping_ok())
        return 0

    if single_instance() is None:
        log("已有实例在跑 ⇒ 提示后退出")
        notify("PRISM", "PRISM 已经在运行了。\n\n（关掉客户端后它会自动收工。）", MB_ICONINFO)
        return 0

    log("=== launcher start ===")
    log("家=%s  日志=%s" % (HOME, LOG))

    heal = self_heal_core()
    if heal == "quit":
        log("用户选择退出 ⇒ 收工")
        return 0

    repair_paths()

    check_hashes()

    watcher = start_watcher()
    server = start_server()

    if heal == "skip":
        pengu_ok, pengu_msg = False, "注入核心（core.dll）缺失，本次不注入"
    else:
        backup_ifeo()
        pengu_ok, pengu_msg = ensure_pengu()
    if pengu_ok:
        notify("PRISM 已就绪",
               "环境已准备好，可以启动英雄联盟客户端了。\n\n"
               "（关掉客户端后本程序会自动收工，不留后台。）", MB_ICONINFO)
    else:
        notify("PRISM 准备失败",
               "注入器激活没成功：\n%s\n\n皮肤注入会不生效。\n日志：%s"
               % (pengu_msg, LOG), MB_ICONERROR)

    if "--no-wait" in args:
        log("--no-wait ⇒ 只做就绪，不等客户端（helper 保留运行）")
        return 0

    if not wait_for_client():
        log("等客户端超时/放弃 ⇒ **保留 helper**，本次退出（下次双击会复用，不会重复起）")
        notify("PRISM",
               "没等到客户端启动。\n\n后台环境仍在，下次双击本程序会复用它。", MB_ICONWARNING)
        return 0

    log("客户端已退出 ⇒ 收工（收掉 watcher 和后端）")
    stop_server(server)
    stop_watcher(watcher)
    log("还原注入项：%s" % deactivate_pengu())
    log("=== launcher exit ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
