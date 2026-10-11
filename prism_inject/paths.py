"""PRISM · 路径与配置解析

集中回答三个问题，别在业务代码里各写一遍：

1. **客户端的注入器装没装** —— 看客户端目录里有没有 `d3d9.dll`、IFEO 指向哪里
2. **对局装在哪** —— 注意是 `Game` 目录（里面有 `League of Legends.exe`），
   不是 `LeagueClient`；路径给错整个链路白跑
3. **我们自己的「家」在哪** —— 所有属于我们的文件（后端 exe / 素材 / 缓存 / 暂存 / 配置 /
   诊断日志）都放在**同一个目录**里（安装时选一次），**不往别处写**。

★ 全部支持环境变量覆盖。原因不是"优雅"，是**离线回归必须能在 tmp 目录里跑**：
  真机路径在 CI / 别人机器上不存在，硬编码就测不了。

环境变量一览：
    PRISM_HOME               我们自己的家（默认读注册表 HKCU\\Software\\PRISM\\Home，
                             再兜底 %LOCALAPPDATA%\\PRISM）★ 所有自己的文件都在它下面
    PRISM_GAME_PATH          对局安装目录（覆盖自动探测）
    PRISM_CLIENT_PATH        客户端（大厅）目录（覆盖自动探测）
    PRISM_INJECT_ROOT        我们的暂存区根（默认 <home>\\inject）
    PRISM_PATHS_JSON         我们的路径配置（默认 <home>\\paths.json）

## 我们自己的路径配置（`<home>\\paths.json`）

为什么要有它（需求）：换台电脑时"游戏目录肯定不一样"，光靠写死的候选列表去猜
（E:/LoL/Game、D:/wegameapps/英雄联盟（含经典模式）/Game…）换机器/换盘必失效，
而且 `lcu.py` 里还**另有一份**写死的客户端候选。两处各猜各的，出问题都不知道看哪。

⇒ 统一成一条链：**环境变量 → 我们自己的 paths.json（用户选的）→ 常见位置候选**。
用户只需要在"首次安装"时用**文件夹选择器**指一次，
两个路径（对局 Game + 客户端 LeagueClient）一次填齐，之后所有模块都从这条链读。

`paths.json` 里同时存**依赖体检**结果（Pengu 是否已装进那个客户端、插件目录在不在），
这样"选了路径但插件不生效"这类问题，能在选择当场就说清，而不是等到游戏里才发现。
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path

_GAME_MARKER = "League of Legends.exe"


def _env(name: str):
    v = os.environ.get(name)
    return v.strip() if v and v.strip() else None


def localappdata() -> Path:
    return Path(_env("LOCALAPPDATA") or os.path.expanduser("~"))


_home_override = None


def use_exe_home():
    """把「家」定成当前 exe 所在目录。**只有 prism-server.exe 该调**（它住在家里）。

    这样"把整个文件夹拷到另一台机器/另一个盘"也能直接跑，不依赖注册表。
    """
    global _home_override
    try:
        import sys as _s
        if getattr(_s, "frozen", False):
            d = Path(_s.executable).resolve().parent
            if d.is_dir():
                _home_override = d
                return d
    except Exception:
        pass
    return None


_REG_SUBKEY = r"Software\PRISM"


def _reg_home_from(hive) -> str:
    try:
        import winreg
        with winreg.OpenKey(hive, _REG_SUBKEY) as k:
            v, _t = winreg.QueryValueEx(k, "Home")
            return str(v or "").strip()
    except Exception:
        return ""


def _reg_home() -> str:
    """读安装器写下的家。**HKCU 优先，其次 HKLM**（跨账户兜底）。

    ★ 为什么要有 HKLM 这一路：安装器要以管理员身份写 HKLM（IFEO），
      若用户是"标准账户 + 管理员凭据"提升的，指针会落在**管理员的 HKCU** 里，
      日常账户读不到 ⇒ 家就"消失"了。所以安装器两边都写、这里两边都读。
    """
    try:
        import winreg
    except Exception:
        return ""
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        v = _reg_home_from(hive)
        if v:
            return v
    return ""


def set_reg_home(p, write: bool = False) -> bool:
    """写（或清）安装器指针。传空 = 清掉。失败返回 False，不抛。

    ★★ 定案（A 方案）：**默认不再写** —— 程序对外「干净」。
      「家」现在靠 **exe 自定位**（`prism-server.exe` / `PRISM.exe` 就住在家里，
      见 `use_exe_home()`），注册表只是**历史遗留的兜底指针**，不是必需品
      ⇒ 安装时**不再新增**，只保留「清理」能力（卸载时把老装机写过的删掉）。

      · `write=False`（默认）：`p` 为空 ⇒ 删历史值；`p` 非空 ⇒ **什么都不做**（新增被禁）
      · `write=True`  ：老行为（HKCU + HKLM 双写）—— 只给排障脚本 / 显式需要时用
      · **读仍然保留**（`_reg_home()`）⇒ 老装机升级上来照样找得到家

    跨 hive 的理由（历史）：HKCU 给当前账户（快、免提权），HKLM 给"换账户也能找到"
    （需管理员，写不进就跳过）。
    """
    import winreg
    any_ok = False
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            if write and p:
                with winreg.CreateKey(hive, _REG_SUBKEY) as k:
                    winreg.SetValueEx(k, "Home", 0, winreg.REG_SZ, str(Path(p)))
                any_ok = True
            elif not p:
                try:
                    with winreg.OpenKey(hive, _REG_SUBKEY, 0, winreg.KEY_SET_VALUE) as k:
                        winreg.DeleteValue(k, "Home")
                        any_ok = True
                except OSError:
                    pass
        except OSError:
            continue
    return any_ok


def prism_home() -> Path:
    """我们自己的家：**所有属于我们的文件都在它下面**。"""
    if _home_override is not None:
        return Path(_home_override)
    o = _env("PRISM_HOME")
    if o:
        return Path(o)
    r = _reg_home()
    if r and Path(r).is_dir():
        return Path(r)
    return localappdata() / "PRISM"


def assets_dir() -> Path:
    """本机素材：loading 图 / 图标 / imgcache / 诊断日志 + 请求日志。

    ★ 它本来就是我们的东西，所以一律放在家里。
      `server.py` 的 `/asset/<名>` 就是读这里。
    """
    return prism_home() / "assets"


def tmp_dir() -> Path:
    """家里的一次性临时区（下载中转、解包中间产物等）。

    ★ 为什么要它：以前这类东西落在 `%TEMP%`（如 `%TEMP%\\prism_dl`），
      违反"产物必须在 PRISM 文件夹内"的要求。**完事后自行清理**。
    """
    return prism_home() / "tmp"



def is_game_dir(d) -> bool:
    try:
        return bool(d) and (Path(d) / _GAME_MARKER).is_file()
    except OSError:
        return False


def game_path(required: bool = True):
    """对局安装目录（内含 League of Legends.exe）。

    顺序：环境变量 → config.ini 的 leaguepath → 同类候选。
    只要目标目录里真有 `League of Legends.exe` 就采纳 —— 不信路径字符串，信文件。
    """
    override = _env("PRISM_GAME_PATH")
    if override:
        d = Path(override)
        if is_game_dir(d):
            return d
        if required:
            raise FileNotFoundError("PRISM_GAME_PATH 里没有 %s：%s" % (_GAME_MARKER, d))
        return None

    ug = read_user_paths().get("game")
    if ug and is_game_dir(ug):
        return Path(ug)

    for d in (Path("E:/LoL/Game"),
              Path("D:/wegameapps/英雄联盟（含经典模式）/Game"),
              Path("D:/WeGameApps/英雄联盟（含经典模式）/Game"),
              Path("E:/WeGameApps/英雄联盟（含经典模式）/Game"),
              Path("F:/WeGameApps/英雄联盟（含经典模式）/Game"),
              Path("C:/Riot Games/League of Legends/Game")):
        if is_game_dir(d):
            return d

    if required:
        raise FileNotFoundError(
            "定位不到对局目录（要含 %s）。用 PRISM_GAME_PATH 指定，"
            "或在安装器里重新选一次游戏路径。" % _GAME_MARKER)
    return None


def game_exe_path(required: bool = True):
    d = game_path(required=required)
    return (d / _GAME_MARKER) if d else None



_CLIENT_MARKER = "LeagueClient.exe"

_CLIENT_CANDS = (
    Path(r"E:\LoL\LeagueClient"),
    Path(r"E:\WeGameApps\英雄联盟（含经典模式）\LeagueClient"),
    Path(r"D:\wegameapps\英雄联盟（含经典模式）\LeagueClient"),
    Path(r"D:\WeGameApps\英雄联盟（含经典模式）\LeagueClient"),
    Path(r"C:\Riot Games\League of Legends\LeagueClient"),
)


def our_config_path() -> Path:
    """我们自己的路径配置（可用 PRISM_PATHS_JSON 覆盖 —— 离线回归要在 tmp 里跑）。"""
    override = _env("PRISM_PATHS_JSON")
    return Path(override) if override else (prism_home() / "paths.json")


def read_user_paths() -> dict:
    """读我们自己的路径配置。**任何异常都当空**（首次运行/文件损坏都不许炸）。"""
    try:
        p = our_config_path()
        if p.is_file():
            d = json.loads(p.read_text(encoding="utf-8"))
            return d if isinstance(d, dict) else {}
    except Exception:
        pass
    return {}


def _root_of(game, client) -> Path | None:
    """从 game/client 两个目录反推共同的父目录（LoL 根）。不同盘就返回 None。"""
    try:
        return Path(os.path.commonpath([str(Path(game).parent), str(Path(client).parent)]))
    except Exception:
        return None


def save_user_paths(picked, game, client, deps: dict | None = None) -> Path:
    """原子写我们的路径配置（先写 tmp 再 `os.replace`，别让读者看到半截 json）。"""
    p = our_config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    root = _root_of(game, client)
    data = {
        "picked": str(picked or ""),
        "root": str(root) if root else "",
        "game": str(game or ""),
        "client": str(client or ""),
        "at": time.time(),
        "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    try:
        rg = Path(str(game)).resolve()
        rc = Path(str(client)).resolve()
        if str(rg) != str(game) or str(rc) != str(client):
            data["real"] = {"game": str(rg), "client": str(rc)}
    except Exception:
        pass
    if deps is not None:
        data["deps"] = deps
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix="paths.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, p)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return p


def is_client_dir(d) -> bool:
    """这个目录是不是客户端（大厅）目录。"""
    try:
        return bool(d) and (Path(d) / _CLIENT_MARKER).is_file()
    except OSError:
        return False


def client_path(required: bool = True):
    """客户端（大厅）目录 —— 读 LCU 真值 / 装 Pengu 都靠它。

    顺序：环境变量 `PRISM_CLIENT_PATH` → 我们的 paths.json → 常见位置候选。
    """
    override = _env("PRISM_CLIENT_PATH")
    if override:
        d = Path(override)
        if is_client_dir(d):
            return d
        if required:
            raise FileNotFoundError("PRISM_CLIENT_PATH 里没有 %s：%s" % (_CLIENT_MARKER, d))
        return None

    uc = read_user_paths().get("client")
    if uc and is_client_dir(uc):
        return Path(uc)

    for d in _CLIENT_CANDS:
        if is_client_dir(d):
            return d

    if required:
        raise FileNotFoundError(
            "定位不到客户端目录（要含 %s）。用 PRISM_CLIENT_PATH 指定，"
            "或在安装器里重新选一次游戏路径。" % _CLIENT_MARKER)
    return None


def probe_deps(game, client) -> dict:
    """选完路径**当场**做的依赖体检：注入/插件真正要用的几样在不在。

    ★ 只报事实、不阻断，也**不抛**。目的就一个：把"路径选对了但插件就是不生效"
      这类问题在选择当场说清，而不是让人进游戏里对着没反应的面板猜。
    """
    d = {}
    try:
        d["gameExe"] = is_game_dir(game)
        d["clientExe"] = is_client_dir(client)
        try:
            from . import pengu as _pengu
        except ImportError:
            import pengu as _pengu
        d["penguIFEO"] = _pengu.is_activated()
        d["penguDll"] = (Path(client) / "d3d9.dll").is_file()
        _pdir = _pengu.pengu_dir()
        d["penguData"] = (_pdir / "Pengu Loader.exe").is_file()
        d["penguPlugins"] = (_pdir / "plugins").is_dir()
        d["penguDir"] = str(_pdir)
    except Exception:
        return {}

    notes = []
    if not d.get("gameExe"):
        notes.append("对局目录里没有 %s。" % _GAME_MARKER)
    if not (d.get("penguIFEO") or d.get("penguDll")):
        notes.append("这个客户端**没有装上注入器**（官方 Pengu 的 IFEO 没指向我们，"
                     "客户端目录里也没有 d3d9.dll）⇒ 插件这时装了也不会被加载，"
                     "先跑一次启动器/安装器把 Pengu 激活。")
    if not d.get("penguData"):
        notes.append("本机没有「%s」⇒ 本机没装 Pengu（插件目录都不存在）。"
                     % (_pdir / "Pengu Loader.exe"))
    d["notes"] = notes
    return d


def validate_root(picked) -> dict:
    """把「用户选的目录」翻译成 (game, client) 并逐条体检。**不抛**，返回结构化结果。

    接受三种选法（用户不用先搞懂该选哪一层）：
      ① **LoL 根目录**（里面有 `Game/` 和 `LeagueClient/`）—— 推荐，一次填齐；
      ② **对局目录**本身（里面有 `League of Legends.exe`）；
      ③ **客户端目录**本身（里面有 `LeagueClient.exe`）。
    """
    out = {"ok": False, "picked": str(picked or ""), "root": "", "game": "", "client": "",
           "problems": [], "deps": {}, "notes": []}
    raw = str(picked or "").strip().strip('"').strip()
    if not raw:
        out["problems"].append("没选路径。")
        return out
    try:
        p = Path(raw)
    except Exception:
        out["problems"].append("这个路径不是合法路径：%r" % raw)
        return out
    if not p.is_dir():
        out["problems"].append("这个目录不存在：%s" % p)
        return out

    game = client = None
    if is_game_dir(p / "Game"):
        game = p / "Game"
    if is_client_dir(p / "LeagueClient"):
        client = p / "LeagueClient"
    if game is None and is_game_dir(p):
        game = p
        if client is None and is_client_dir(p.parent / "LeagueClient"):
            client = p.parent / "LeagueClient"
    if client is None and is_client_dir(p):
        client = p
        if game is None and is_game_dir(p.parent / "Game"):
            game = p.parent / "Game"

    if game is None:
        out["problems"].append(
            "这里找不到对局目录（里面要有「%s」）。最省事的选法是选**英雄联盟的安装根目录**"
            "（里面能同时看到 Game 和 LeagueClient 两个文件夹）。" % _GAME_MARKER)
    if client is None:
        out["problems"].append(
            "这里找不到客户端目录（里面要有「%s」）。WeGame 装的客户端通常就叫 LeagueClient。" % _CLIENT_MARKER)
    if out["problems"]:
        return out

    out["game"] = str(game)
    out["client"] = str(client)
    r = _root_of(game, client)
    out["root"] = str(r) if r else ""
    out["ok"] = True
    out["deps"] = probe_deps(game, client)
    out["notes"] = out["deps"].get("notes") or []
    return out




def describe() -> dict:
    """一次性汇报所有关键路径与存在性。**不抛异常**，缺失就标 False。

    这个函数是现场排障的第一入口：出问题时先看它，就知道是哪一环路径不对。
    """
    gd = game_path(required=False)
    return {
        "home": str(prism_home()),
        "homeExists": prism_home().is_dir(),
        "assets": str(assets_dir()),
        "assetsExists": assets_dir().is_dir(),
        "ourConfig": str(our_config_path()),
        "ourConfigExists": our_config_path().is_file(),
        "userGamePath": (read_user_paths().get("game") or None),
        "userClientPath": (read_user_paths().get("client") or None),
        "clientPath": (str(client_path(required=False)) if client_path(required=False) else None),
        "clientPathExists": is_client_dir(client_path(required=False)),
        "gamePath": (str(gd) if gd else None),
        "gamePathExists": is_game_dir(gd),
        "gameExe": (str(game_exe_path(required=False)) if gd else None),
    }


if __name__ == "__main__":
    import json
    print(json.dumps(describe(), ensure_ascii=False, indent=2))
