"""
PRISM 换机一键安装器
====================

把 PRISM 整套环境装到**一台新机器**上（新机上只有游戏，其它都要靠它铺）。

用法
----
    整包拷到新机器 → 双击 `PRISM 完整版.exe` → **在弹出的窗口里选英雄联盟的安装目录** → 完事。

    （探测到的最可能位置会**预选**好，直接点「确定」就行。）
    （非交互：`PRISM 完整版.exe "D:\\你的英雄联盟目录"`）

它做什么
--------
    ① 找并校验游戏目录（对局目录 / 客户端目录）
    ② 把 `payload\\` 铺进「家」(`%LOCALAPPDATA%\\PRISM`)
    ③ 写路径配置（注册表指针 + `<家>\\paths.json`）
    ④ **激活 Pengu 注入器**（写 IFEO；这一步要管理员，会弹一次 UAC）
    ⑤ 复查依赖，把还缺的东西说出来
    ⑥ 建桌面快捷方式
    ⑦ 启动 PRISM 环境（= 启动器：起 watcher + 后端 + 提示「已就绪」）

它**不**做什么
------------
    · 不装开机自启     · 不改游戏文件     · 不装驱动/服务
    · 不带皮肤库（新机**按需现造**：玩到哪张造哪张，首次 3~5 秒）
    · 不带哈希表（222MB）—— 首次要用同目录的「2-更新哈希.exe」下

★ 为什么没有花哨的 GUI：本仓库用的托管 Python **没带 tkinter**（连 `_tkinter.pyd` 都没有），
  所以 UI 走**零依赖**的 Win32 原生方案：控制台打印进度 + 系统文件夹选择框
  （`SHBrowseForFolderW`）。这样 exe 也小、也不怕缺运行库。

构建
----
    python -m PyInstaller --onefile --console --uac-admin \
        --name "PRISM" --paths . \
        --collect-submodules prism_inject transfer_install.py
    （`--uac-admin`：激活 Pengu 要写 HKLM，必须提权。用户点一次 UAC 后全程顺畅。）
"""

import ctypes
import ctypes.wintypes as wt
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if (_HERE / "prism_inject").is_dir():
    sys.path.insert(0, str(_HERE))

from prism_inject import paths, pengu, transfer_pack

CREATE_NO_WINDOW = 0x08000000
DETACHED_PROCESS = 0x00000008
LAUNCHER_NAME = "PRISM.exe"
SHORTCUT_NAME = "启动 PRISM"


def log(msg=""):
    """打一行日志。**永不抛** —— 输出编码受限时降级输出，绝不让日志搞挂业务（判据 66）。"""
    s = str(msg)
    try:
        print(s, flush=True)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "ascii"
        try:
            print(s.encode(enc, "replace").decode(enc, "replace"), flush=True)
        except Exception:
            try:
                print(s.encode("ascii", "replace").decode("ascii"), flush=True)
            except Exception:
                pass
    except Exception:
        pass


def payload_dir() -> Path:
    """换机包里的 `payload\\`。

    解析顺序：`PRISM_PAYLOAD` 环境变量（调试/测试用）→ exe（或本脚本）旁边的 `payload\\`
    → 上一级的 `payload\\`。
    """
    env = (os.environ.get("PRISM_PAYLOAD") or "").strip()
    if env and Path(env).is_dir():
        return Path(env)
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else _HERE
    for c in (base / "payload", base.parent / "payload"):
        if c.is_dir():
            return c
    return base / "payload"


def pick_folder(title: str = "选英雄联盟的安装根目录（里面有 Game 和 LeagueClient）",
                initial: str = "") -> str:
    """弹系统文件夹选择框。取消返回 ""。**不抛**。"""
    try:
        shell32 = ctypes.WinDLL("shell32", use_last_error=True)
        ole32 = ctypes.WinDLL("ole32", use_last_error=True)
        user32 = ctypes.WinDLL("user32", use_last_error=True)

        BIF_RETURNONLYFSDIRS = 0x0001
        BIF_NEWDIALOGSTYLE = 0x0040
        BIF_EDITBOX = 0x0010
        BFFM_INITIALIZED = 1
        BFFM_SETSELECTIONW = 0x0400 + 103
        MAX_PATH = 260

        class BROWSEINFOW(ctypes.Structure):
            _fields_ = [("hwndOwner", wt.HWND),
                        ("pidlRoot", ctypes.c_void_p),
                        ("pszDisplayName", wt.LPWSTR),
                        ("lpszTitle", wt.LPCWSTR),
                        ("ulFlags", ctypes.c_uint),
                        ("lpfn", ctypes.c_void_p),
                        ("lParam", ctypes.c_void_p),
                        ("iImage", ctypes.c_int)]

        user32.SendMessageW.argtypes = [wt.HWND, ctypes.c_uint,
                                        ctypes.c_void_p, ctypes.c_void_p]
        init_buf = ctypes.create_unicode_buffer(str(initial)) if initial else None

        def _cb(hwnd, uMsg, lParam, lpData):
            if uMsg == BFFM_INITIALIZED and init_buf is not None:
                user32.SendMessageW(hwnd, BFFM_SETSELECTIONW, 1,
                                    ctypes.cast(init_buf, ctypes.c_void_p))
            return 0

        CB = ctypes.WINFUNCTYPE(ctypes.c_int, wt.HWND, ctypes.c_uint,
                                ctypes.c_void_p, ctypes.c_void_p)
        callback = CB(_cb)

        disp = ctypes.create_unicode_buffer(MAX_PATH)
        bi = BROWSEINFOW()
        bi.hwndOwner = None
        bi.pidlRoot = None
        bi.pszDisplayName = ctypes.cast(disp, wt.LPWSTR)
        bi.lpszTitle = title
        bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_EDITBOX
        bi.lpfn = ctypes.cast(callback, ctypes.c_void_p)
        bi.lParam = None
        bi.iImage = 0

        shell32.SHBrowseForFolderW.restype = ctypes.c_void_p
        shell32.SHBrowseForFolderW.argtypes = [ctypes.POINTER(BROWSEINFOW)]
        pidl = shell32.SHBrowseForFolderW(ctypes.byref(bi))
        if not pidl:
            return ""
        out = ctypes.create_unicode_buffer(MAX_PATH)
        shell32.SHGetPathFromIDListW.argtypes = [ctypes.c_void_p, wt.LPWSTR]
        ok = shell32.SHGetPathFromIDListW(ctypes.c_void_p(pidl), out)
        try:
            ole32.CoTaskMemFree(ctypes.c_void_p(pidl))
        except Exception:
            pass
        return out.value if ok else ""
    except Exception as e:
        log("（文件夹选择框打不开：%s —— 可以改用命令行参数指定路径）" % e)
        return ""


def detect_candidates():
    """猜几个"最可能"的英雄联盟安装位置（只列**真实存在**的）。"""
    cands = []
    try:
        cfg = paths.read_user_paths() or {}
        for k in ("root", "game", "client"):
            v = cfg.get(k)
            if v:
                cands.append(str(v))
    except Exception:
        pass
    stems = [
        "LoL",
        r"Riot Games\League of Legends",
        r"WeGameApps\英雄联盟（含经典模式）",
        r"Program Files\腾讯游戏\英雄联盟",
        r"Program Files (x86)\腾讯游戏\英雄联盟",
        r"Games\League of Legends",
    ]
    for drive in ("C:", "D:", "E:", "F:", "G:", "H:"):
        root = Path(drive + "\\")
        if not root.is_dir():
            continue
        for s in stems:
            cands.append(str(root / s))
    seen, out = set(), []
    for c in cands:
        k = str(c).lower()
        if k in seen:
            continue
        seen.add(k)
        try:
            if Path(c).is_dir():
                out.append(str(c))
        except Exception:
            pass
    return out


def copy_payload(payload: Path, home: Path) -> int:
    """把 payload 里的顶层项铺到「家」。返回铺成功的项数。"""
    n = 0
    for item in transfer_pack.PAYLOAD_ITEMS:
        src = payload / item
        if not src.exists():
            log("  * 跳过 %s（包里没有）" % item)
            continue
        dst = home / item
        try:
            if item == "assets":
                dst.mkdir(parents=True, exist_ok=True)
                got = 0
                for name in transfer_pack.ASSETS_WHITELIST:
                    s = src / name
                    if s.is_file():
                        shutil.copy2(str(s), str(dst / name))
                        got += 1
                log("  [OK] assets（%d 个素材）" % got)
            elif src.is_dir():
                shutil.copytree(str(src), str(dst), dirs_exist_ok=True,
                                ignore=transfer_pack.make_ignore(item))
                log("  [OK] %s\\" % item)
            else:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(str(src), str(dst))
                log("  [OK] %s" % item)
            n += 1
        except Exception as e:
            log("  [X] %s 失败：%s: %s" % (item, type(e).__name__, e))
    return n


def desktop_dir() -> Path:
    """桌面目录（含 OneDrive 重定向）。读不到就退回 %USERPROFILE%\\Desktop。"""
    try:
        import winreg
        key = r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
            v, _t = winreg.QueryValueEx(k, "Desktop")
            if v and os.path.isdir(str(v)):
                return Path(str(v))
    except Exception:
        pass
    return Path(os.environ.get("USERPROFILE") or "") / "Desktop"


def make_shortcut(target: Path) -> None:
    """在桌面建一个启动快捷方式（借 PowerShell 的 WScript.Shell，最省事）。"""
    if not target.is_file():
        log("  * 跳过快捷方式（找不到 %s）" % target)
        return
    lnk = desktop_dir() / ("%s.lnk" % SHORTCUT_NAME)
    ps = (
        "$w = New-Object -ComObject WScript.Shell; "
        "$s = $w.CreateShortcut('%s'); "
        "$s.TargetPath = '%s'; "
        "$s.WorkingDirectory = '%s'; "
        "$s.IconLocation = '%s'; "
        "$s.Description = 'PRISM 启动器'; "
        "$s.Save()"
    ) % (lnk, target, target.parent, target)
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                           capture_output=True, creationflags=CREATE_NO_WINDOW, timeout=40)
        if lnk.is_file():
            log("  [OK] %s" % lnk)
        else:
            log("  [X] 快捷方式没建成：%s" % (r.stderr or b"")[:160])
    except Exception as e:
        log("  [X] 快捷方式失败：%s" % e)


def launch_env(home: Path) -> None:
    exe = home / LAUNCHER_NAME
    if not exe.is_file():
        log("  [X] 找不到启动器 %s" % exe)
        return
    try:
        subprocess.Popen([str(exe)], cwd=str(home),
                         creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS, close_fds=True)
        log("  [OK] 已启动 %s" % exe.name)
        log("    （它会起 watcher + 后端，并弹一个「已就绪」的提示）")
    except Exception as e:
        log("  [X] 启动失败：%s" % e)


def do_install(picked: str, opts=None) -> bool:
    """opts: {"no_reg": bool, "no_shortcut": bool, "no_launch": bool}（给自动化测试用）。"""
    o = opts or {}
    try:
        log("① 校验路径…")
        r = paths.validate_root(picked)
        if not r.get("ok"):
            for p in (r.get("problems") or ["路径不合法"]):
                log("  [X] %s" % p)
            return False
        log("  [OK] 对局目录   ：%s" % r["game"])
        log("  [OK] 客户端目录 ：%s" % r["client"])
        if r.get("root"):
            log("  [OK] 安装根目录 ：%s" % r["root"])

        home = paths.prism_home()
        payload = payload_dir()
        if not payload.is_dir():
            log("  [X] 找不到 payload 目录：%s" % payload)
            return False
        log("")
        log("② 铺文件 -> %s" % home)
        n = copy_payload(payload, home)
        log("  共铺了 %d 项" % n)
        if n == 0:
            log("  [X] 什么都没铺成功")
            return False

        log("")
        log("③ 写路径配置…")
        if o.get("no_reg"):
            log("  * （--no-reg：跳过注册表指针）")
        else:
            try:
                paths.set_reg_home(home)
                log("  [OK] 注册表 HKCU\\Software\\PRISM\\Home")
            except Exception as e:
                log("  [!] 注册表指针没写成（不影响使用）：%s" % e)
        pj = paths.save_user_paths(picked, r["game"], r["client"], r.get("deps"))
        log("  [OK] %s" % pj)

        log("")
        log("④ 激活 Pengu 注入器（可能要你点一次 UAC）…")
        if o.get("no_pengu"):
            log("  * （--no-pengu：跳过 —— 测试时不动系统注册表）")
        else:
            ok, msg = pengu.ensure_activated(log=lambda m: log("   " + m))
            if not ok:
                log("  [X] %s" % msg)
                log("    => 插件不会被加载。装完可以再跑一次本安装器重试。")

        log("")
        log("⑤ 复查依赖…")
        r2 = paths.validate_root(picked)
        notes = r2.get("notes") or []
        if notes:
            for note in notes:
                log("  [!] %s" % note)
        else:
            log("  [OK] 注入链要用的东西都齐了")

        log("")
        log("⑥ 桌面快捷方式…")
        if o.get("no_shortcut"):
            log("  * （--no-shortcut：跳过）")
        else:
            make_shortcut(home / LAUNCHER_NAME)

        log("")
        hpath = home / "tools" / "hashes.game.txt"
        if hpath.is_file():
            log("⑦ 哈希表：已就位（%.0f MB）" % (hpath.stat().st_size / 1048576.0))
        else:
            log("⑦ 哈希表：**还没下载**（首次现造皮肤要用它）")
            log("   -> 请运行同目录下的「2-更新哈希.exe」（约 222MB，5~15 分钟，可断点续传）")
            log("   -> 不跑也行：只玩**皮肤库里已有**的皮肤不受影响")

        log("")
        log("⑧ 启动 PRISM 环境…")
        if o.get("no_launch"):
            log("  * （--no-launch：跳过）")
        else:
            launch_env(home)

        log("")
        log("=" * 58)
        log("  装好了 [OK]  现在可以启动英雄联盟客户端了")
        log("=" * 58)
        log("  以后每次要玩：双击桌面的「%s」-> 看提示 -> 开客户端" % SHORTCUT_NAME)
        log("  关掉客户端后，后台会自动收干净（不留常驻进程、无开机自启）")
        return True
    except Exception:
        import traceback
        log(traceback.format_exc())
        return False


def main() -> int:
    log("=" * 58)
    log("  PRISM 换机安装器")
    log("=" * 58)
    log("把 PRISM 环境装到这台机器（不动游戏本体、不装开机自启）。")
    log("")

    opts = {
        "no_reg": "--no-reg" in sys.argv,
        "no_shortcut": "--no-shortcut" in sys.argv,
        "no_launch": "--no-launch" in sys.argv,
        "no_pengu": "--no-pengu" in sys.argv,
    }

    picked = ""
    argv_paths = [a for a in sys.argv[1:] if not a.startswith("-")]

    if argv_paths and paths.validate_root(argv_paths[0]).get("ok"):
        picked = argv_paths[0]
        log("用命令行给的路径：%s" % picked)
    else:
        guess = ""
        for c in detect_candidates():
            if paths.validate_root(c).get("ok"):
                guess = c
                break
        if guess:
            log("先自动找了一下，最可能是：%s" % guess)
            log("  => 选择窗口里会**预选**它 —— 对的话直接点「确定」，不对就自己选。")
        else:
            log("自动没找到 —— 请在弹出来的窗口里选**英雄联盟的安装根目录**。")
        picked = pick_folder(initial=guess)
        if not picked and guess:
            log("")
            log("你没在窗口里选。要不要就用刚才探测到的：%s" % guess)
            try:
                ans = input("  用它吗？(Y/n) ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                ans = "n"
            if ans in ("", "y", "yes"):
                picked = guess

    if not picked:
        log("")
        log("[X] 没选目录，什么都没动。退出。")
        log("  （想手动指定：在命令提示符里跑")
        log("     \"PRISM 完整版.exe\" \"D:\\你的英雄联盟目录\"）")
        return 2

    log("")
    ok = do_install(picked, opts)

    if not ok:
        log("")
        log("[X] 安装过程中出错了（见上面的日志）。")
        log("  换个路径再试：本程序加参数 \"<路径>\" 运行。")
    log("")
    try:
        input("按回车键退出…")
    except (EOFError, KeyboardInterrupt):
        pass
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
