"""卸载钩子（`prism-server.exe --uninstall-hooks`）。

由安装包的卸载器（Inno 的 `unins000.exe`）在**删文件之前**调用 —— 做 Inno 自己管不了的事：

  1. ★★ **恢复 IFEO**（最重要）。不还原的话，卸载后客户端会去加载**已不存在的**
     `core.dll` ⇒ **客户端直接起不来**（现象还很迷惑：点了没反应）。
     安装时备份过就还原原值；原本没有（全新机）就**删掉该项**。
  2. 清掉"家"的指针（`HKCU` / `HKLM` 的 `Software\\PRISM`）。
  3. 停掉还在跑的后端 / watcher（**排除自己** —— 我们就是那个 exe 的一个实例）。
  4. 可选：删皮肤库与哈希字典（`--clean-skins`）。Inno 那边的复选框**默认勾选**，
     所以对用户来说就是"默认删"；不勾就不传这个参数 ⇒ 保留（下次重装直接用）。

**明确不碰**：任何**不是我们装的**目录 —— 只清理我们自己写进「家」与客户端的东西。
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from . import paths, pengu
except ImportError:
    import paths
    import pengu

SELF_IMAGES = ("prism-server.exe", "lcu-lockfile-watch.exe")

CREATE_NO_WINDOW = 0x08000000


def _log(logger, msg) -> None:
    s = str(msg)
    if logger:
        try:
            logger(s)
            return
        except Exception:
            pass
    try:
        print(s, flush=True)
    except Exception:
        pass


def _kill_others(logger=None) -> int:
    """按映像名杀掉同名的**其他**进程（排除自己）。返回杀了几个。"""
    me = os.getpid()
    try:
        out = subprocess.run(["tasklist", "/FO", "CSV", "/NH"],
                             capture_output=True, encoding="mbcs", errors="replace",
                             creationflags=CREATE_NO_WINDOW, timeout=25).stdout or ""
    except Exception:
        return 0
    killed = 0
    for line in out.splitlines():
        parts = [x.strip().strip('"') for x in line.split(",")]
        if len(parts) < 2:
            continue
        name = parts[0].strip().strip('"').lower()
        if name not in SELF_IMAGES:
            continue
        try:
            pid = int(parts[1].strip().strip('"'))
        except ValueError:
            continue
        if pid == me:
            continue
        try:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                           capture_output=True, creationflags=CREATE_NO_WINDOW, timeout=15)
            killed += 1
            _log(logger, "  已停 %s (pid=%d)" % (name, pid))
        except Exception:
            pass
    return killed


def run_hooks(clean_skins: bool = False, logger=None) -> int:
    """卸载前置工作。返回 0 表示"能做的重要都做了"（个别失败只记不抛）。"""
    try:
        home = Path(paths.prism_home())
    except Exception:
        home = Path(".")
    _log(logger, "卸载钩子：家 = %s" % home)

    _log(logger, "[1/4] 停掉还在跑的后端 / watcher …")
    n = _kill_others(logger)
    if not n:
        _log(logger, "  没有别的实例在跑")

    _log(logger, "[2/4] 恢复客户端注入项（IFEO）…")
    try:
        _log(logger, "  " + str(pengu.restore_ifeo()))
    except Exception as e:
        _log(logger, "  [!] 恢复失败（不影响卸载，但请手动检查 IFEO）：%s" % str(e)[:160])

    _log(logger, "[3/4] 清掉「家」的注册表指针 …")
    try:
        paths.set_reg_home("")
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                winreg.DeleteKey(hive, r"Software\\PRISM")
            except OSError:
                pass
        _log(logger, "  已清 HKCU / HKLM\\Software\\PRISM")
    except Exception as e:
        _log(logger, "  [!] 清注册表失败：%s" % str(e)[:140])

    if clean_skins:
        _log(logger, "[4/4] 删皮肤库与哈希字典（下次重装要重造 / 重下）…")
        targets = ((home / "skins", "皮肤库"),
                   (home / "tools" / "hashes.game.txt", "哈希字典"),
                   (home / "tools" / "_hashparts", "哈希分片缓存"),
                   (home / "wadextract", "解包缓存"),
                   (home / "build", "造包暂存"),
                   (home / "tmp", "临时区"))
        for p, label in targets:
            try:
                if p.is_dir():
                    shutil.rmtree(p, ignore_errors=True)
                    _log(logger, "  已删 %s" % label)
                elif p.is_file():
                    p.unlink()
                    _log(logger, "  已删 %s" % label)
            except Exception as e:
                _log(logger, "  [!] 删 %s 失败：%s" % (label, str(e)[:100]))
    else:
        _log(logger, "[4/4] 保留皮肤库与哈希字典（用户没勾选「一并删除」）")

    _log(logger, "卸载钩子完成；剩下的文件交给卸载器删除。")
    return 0


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    return run_hooks(clean_skins=("--clean-skins" in argv))


if __name__ == "__main__":
    sys.exit(main())
