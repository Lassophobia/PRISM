"""安装器的**后置动作**（`prism-server.exe --post-install` / `--detect-game`）。

界面与铺文件都交给 **Inno Setup**（标准向导 + `[Files]` 段 + 自己的卸载器）；
这个模块只做 Inno 不方便做的事（需要 Python 逻辑的那些）：

  · 写 `paths.json`（记住游戏目录 —— 用户也可能不做，那样就靠自动探测）
  · ★ **激活 Pengu**（写 IFEO），且**动手前先备份原值**（供卸载还原）
  · 探测游戏目录候选（供 Inno 的自定义页预填）

（这些逻辑以前在 `transfer_install.py` 里，连同手搓的控制台 UI；2026-10-10 改用 Inno 后只留逻辑。）
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from . import paths, pengu
except ImportError:
    import paths
    import pengu

_GAME_MARKER = "League of Legends.exe"
_CLIENT_MARKER = "LeagueClient.exe"

_COMMON_ROOTS = (
    r"E:\LoL",
    r"E:\WeGameApps\英雄联盟（含经典模式）",
    r"D:\WeGameApps\英雄联盟（含经典模式）",
    r"D:\LoL",
    r"C:\Riot Games\League of Legends",
    r"D:\Riot Games\League of Legends",
    r"C:\Program Files\WeGameApps\英雄联盟（含经典模式）",
)


def _running_client_dirs() -> list:
    """正在运行的 `LeagueClientUx.exe` 所在目录（纯 Win32 API，不起子进程）。"""
    out = []
    try:
        import ctypes
        from ctypes import wintypes as wt
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        k.OpenProcess.restype = wt.HANDLE
        k.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
        k.QueryFullProcessImageNameW.argtypes = [wt.HANDLE, wt.DWORD, wt.LPWSTR,
                                                 ctypes.POINTER(wt.DWORD)]
        k.CloseHandle.argtypes = [wt.HANDLE]
        psapi.EnumProcesses.argtypes = [ctypes.POINTER(wt.DWORD), wt.DWORD,
                                        ctypes.POINTER(wt.DWORD)]

        arr = (wt.DWORD * 4096)()
        need = wt.DWORD()
        if not psapi.EnumProcesses(arr, ctypes.sizeof(arr), ctypes.byref(need)):
            return out
        n = need.value // ctypes.sizeof(wt.DWORD)
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        for i in range(n):
            pid = arr[i]
            if not pid:
                continue
            h = k.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
            if not h:
                continue
            try:
                buf = ctypes.create_unicode_buffer(1024)
                size = wt.DWORD(1024)
                if k.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                    p = buf.value or ""
                    if p.lower().endswith("leagueclientux.exe"):
                        d = os.path.dirname(p)
                        if d and d not in out:
                            out.append(d)
            except Exception:
                pass
            finally:
                try:
                    k.CloseHandle(h)
                except Exception:
                    pass
    except Exception:
        pass
    return out


def detect_game_candidates() -> list:
    """能给用户选的"游戏根目录"候选（存在且结构像）。优先级：正在跑的 > 上次记住的 > 常见位置。"""
    cands = []
    for d in _running_client_dirs():
        cands.append(str(Path(d).parent))
        cands.append(d)
    try:
        d = paths.read_user_paths() or {}
        for k in ("root", "client", "game"):
            v = d.get(k)
            if v:
                cands.append(str(v))
    except Exception:
        pass
    cands.extend(_COMMON_ROOTS)

    out = []
    for c in cands:
        try:
            p = Path(c)
            if not p.is_dir():
                continue
            if ((p / "Game" / _GAME_MARKER).is_file()
                    or (p / _GAME_MARKER).is_file()
                    or (p / _CLIENT_MARKER).is_file()):
                s = str(p)
                if s not in out:
                    out.append(s)
        except Exception:
            continue
    return out


def _default_log(msg) -> None:
    try:
        print(str(msg), flush=True)
    except Exception:
        pass


def seed_repair_core(logger=None) -> bool:
    """把 `pengu\\core.dll` 备一份到 `家\\_repair\\core.dll`。

    ★ 为什么要有这份备份：core.dll 是 Pengu 的**注入核心**，客户端的 IFEO 指着它。
      用户"重装游戏 / 清理磁盘 / 杀软隔离"很容易把它干掉 —— 一旦没了，客户端会去加载
      一个不存在的文件，**现象是点了没反应**，极难排查。启动器每次启动会自检：
      缺了就静默从这份备份恢复（见 `launcher.py::self_heal_core`）。

    幂等：备份已存在且大小一致就跳过。**任何失败都不抛**（不影响安装）。
    """
    lg = logger or _default_log

    def _l(m):
        try:
            lg(str(m))
        except Exception:
            pass

    try:
        src = Path(pengu.core_dll())
        dst_dir = Path(paths.prism_home()) / "_repair"
        dst = dst_dir / "core.dll"
    except Exception as e:
        _l("[!] 定位备份位置失败：%s" % str(e)[:120])
        return False
    try:
        if not src.is_file():
            _l("[!] 没有 core.dll 可备份（%s）" % src)
            return False
        if dst.is_file() and dst.stat().st_size == src.stat().st_size:
            _l("[OK] 注入核心备份已就绪（%s）" % dst)
            return True
        dst_dir.mkdir(parents=True, exist_ok=True)
        import shutil as _sh
        _sh.copy2(str(src), str(dst))
        _l("[OK] 已备份注入核心 → %s" % dst)
        return True
    except Exception as e:
        _l("[!] 备份注入核心失败：%s" % str(e)[:140])
        return False


def auto_repath(logger=None) -> int:
    """客户端 / 游戏路径失效时**自动重新定位**（用户重装游戏、换盘、挪目录）。

    `paths.json` 里记的目录一旦不存在 ⇒ 注入 / LCU 真值 / 装 Pengu 全找不到地方，
    表现是"插件全报取数失败"。这里按优先级重新探一个写回去。

    返回：`0`=已就绪（本来就没事，或已重定位成功）；`4`=没找到游戏目录；
          `5`=找到了但都不像游戏目录 / 写配置失败。
    """
    lg = logger or _default_log

    def _l(m):
        try:
            lg(str(m))
        except Exception:
            pass

    try:
        cur = paths.read_user_paths() or {}
    except Exception:
        cur = {}

    for k in ("root", "client", "game"):
        v = str(cur.get(k) or "").strip()
        if not v:
            continue
        r = paths.validate_root(v)
        if r.get("ok"):
            _l("[OK] 现有路径仍有效（%s=%s）⇒ 不用动" % (k, v))
            return 0
        _l("[!] 现有路径失效（%s=%s）：%s"
           % (k, v, "；".join(r.get("problems") or ["不存在或结构不对"])))
        break
    else:
        _l("[i] 还没有路径配置 ⇒ 开始探测")

    cands = detect_game_candidates()
    _l("[i] 探测到 %d 个候选：%s" % (len(cands), "、".join(cands[:6]) or "(无)"))
    if not cands:
        _l("[X] 没找到游戏目录 ⇒ 请重跑一次安装包，或手动指定。")
        return 4

    for c in cands:
        r = paths.validate_root(c)
        if not r.get("ok"):
            continue
        try:
            pj = paths.save_user_paths(r.get("root") or c, r.get("game") or "",
                                       r.get("client") or "", r.get("deps"))
            _l("[OK] 已重新定位 → %s" % (r.get("root") or c))
            _l("     对局目录   ：%s" % r.get("game"))
            _l("     客户端目录 ：%s" % r.get("client"))
            _l("     已写：%s" % pj)
            return 0
        except Exception as e:
            _l("[!] 写路径配置失败：%s" % str(e)[:140])
            return 5
    _l("[X] 探测到的候选都不像游戏目录（缺 Game / LeagueClient）。")
    return 5


_OUR_PLUGIN_PREFIXES = ("prism-",)
_OUR_PLUGIN_NAMES = {"lootrec", "lootsim", "selfname", "zz-probe"}


def _is_our_plugin(name) -> bool:
    low = str(name or "").strip().lower()
    if low in _OUR_PLUGIN_NAMES:
        return True
    return any(low.startswith(p) for p in _OUR_PLUGIN_PREFIXES)


def adopt_plugins(src_dir, logger=None) -> int:
    """把**别人家 Pengu** 的第三方插件拷进我们家的 `pengu\\plugins`。返回搬了几个。

    规则（2026-10-10 定）：
      · **跳过我们自己的**（`PRISM-*` / LOOTREC / LOOTSIM /
        SELFNAME / ZZ-Probe）
      · 同名冲突 ⇒ **我方优先**（跳过对方的，不覆盖）
      · 只认"像插件"的目录（含 `index.js` / `index.js_` / `index.css`）
      · ★ **配置（DataStore）不搬** —— 两套 Pengu 的格式不同，硬拷会把我们自己的配置弄坏
    """
    import shutil
    lg = logger or _default_log
    src = Path(src_dir)
    try:
        dst = Path(paths.prism_home()) / "pengu" / "plugins"
    except Exception as e:
        lg("[!] 找不到插件目录：%s" % str(e)[:120])
        return 0
    if not src.is_dir():
        lg("[!] 对方的插件目录不存在：%s" % src)
        return 0
    try:
        dst.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    n = 0
    skipped = []
    try:
        entries = sorted(src.iterdir())
    except OSError:
        entries = []
    for it in entries:
        try:
            if not it.is_dir() or _is_our_plugin(it.name):
                continue
            if not any((it / f).is_file() for f in ("index.js", "index.js_", "index.css")):
                continue
            tgt = dst / it.name
            if tgt.exists():
                skipped.append(it.name)
                continue
            shutil.copytree(str(it), str(tgt), dirs_exist_ok=False)
            n += 1
            lg("   搬入插件：%s" % it.name)
        except Exception as e:
            lg("   [!] 搬 %s 失败：%s" % (getattr(it, "name", "?"), str(e)[:100]))

    lg("[OK] 插件搬运完成：搬入 %d 个%s" % (
        n, ("，跳过同名 %d 个（%s）" % (len(skipped), "、".join(skipped))) if skipped else ""))
    lg("     ★ 提醒：插件的**配置不会跟着搬**（两套 Pengu 的 DataStore 格式不同），")
    lg("       搬过去的插件需要重新设置一次。")
    return n


def post_install(root: str, logger=None, adopt_from: str = "") -> int:
    """安装后置动作。

    `root`       = 用户选的游戏根（或对局目录 / 客户端目录，会自动识别）
    `adopt_from` = 别人家 Pengu 的 `plugins` 目录（用户在向导里选了"搬插件"才给）
    """
    lg = logger or _default_log

    def _l(m):
        try:
            lg(str(m))
        except Exception:
            pass

    if not root:
        _l("[X] 没给游戏路径（--root）—— 跳过路径配置（之后可在启动器里再选）。")
        return 2

    r = paths.validate_root(root)
    if not r.get("ok"):
        _l("[X] 路径校验没过：%s" % "；".join(r.get("problems") or ["未知原因"]))
        return 3
    _l("[OK] 路径校验通过")
    _l("     对局目录   ：%s" % r.get("game"))
    _l("     客户端目录 ：%s" % r.get("client"))

    try:
        pj = paths.save_user_paths(r.get("root") or root, r.get("game") or "",
                                   r.get("client") or "", r.get("deps"))
        _l("[OK] 已写路径配置：%s" % pj)
    except Exception as e:
        _l("[!] 写路径配置失败：%s" % str(e)[:160])

    try:
        _old = paths._reg_home()
        _l("[--] 注册表指针只读不写（A 方案）；历史值：%s" % (_old or "（无）"))
    except Exception as e:
        _l("[!] 读注册表指针失败（不影响使用）：%s" % str(e)[:140])

    try:
        if pengu.backup_ifeo():
            _l("[OK] 已备份原有注入项（卸载时会还原）")
        else:
            _l("[!] 没能备份原有注入项（卸载时将直接移除我们的项）")
    except Exception as e:
        _l("[!] 备份注入项失败：%s" % str(e)[:160])

    try:
        ok, why = pengu.ensure_activated(log=lambda m: _l("   " + str(m)))
        if ok:
            _l("[OK] Pengu 注入器已就绪")
        else:
            _l("[!] Pengu 激活没成功：%s" % why)
            _l("    稍后重跑安装包可修复；或手动跑 \"<家>\\pengu\\Pengu Loader.exe\" --install")
    except Exception as e:
        _l("[!] 激活 Pengu 出错：%s" % str(e)[:160])

    _l("[i] 备份注入核心（供日后自愈）…")
    try:
        seed_repair_core(logger=_l)
    except Exception as e:
        _l("[!] 备份注入核心出错（不影响安装）：%s" % str(e)[:140])

    if adopt_from:
        _l("")
        _l("[5/5] 搬运原 Pengu 的第三方插件 …")
        try:
            adopt_plugins(adopt_from, logger=_l)
        except Exception as e:
            _l("[!] 搬运插件出错（不影响其它功能）：%s" % str(e)[:160])

    return 0


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--detect-game" in argv:
        for c in detect_game_candidates():
            print(c)
        return 0
    if "--auto-repath" in argv:
        return auto_repath()
    root = ""
    adopt = ""
    for i, a in enumerate(argv):
        if a == "--root" and i + 1 < len(argv):
            root = argv[i + 1]
        if a == "--adopt-from" and i + 1 < len(argv):
            adopt = argv[i + 1]
    return post_install(root, adopt_from=adopt)


if __name__ == "__main__":
    sys.exit(main())
