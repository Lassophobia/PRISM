"""**换机包**的清单定义（打包脚本与安装器共用，避免两边漂移）。

## 换机包长什么样

    PRISM-换机包/
    ├─ 1-安装 PRISM.exe        ← 安装器（Inno 编译；payload 已整体编译进它内部）
    └─ 说明.txt

用户：整包拷到新机器 → 双击 `1-安装 PRISM.exe` → 选游戏目录 → 完事。

## 为什么是这几个

新机器上**只有游戏本身**（WeGame 装的），其它全是我们的。所以必须带：
后端 exe、lockfile watcher、启动器、Pengu（含插件）、造包工具、素材。

★ **不带**（能重建 / 属于某台机器）：
  · 皮肤库 `skins/`（143MB，新机**按需现造**：玩到哪张造哪张）
  · `wadextract/`（4.1G 解包缓存）、`inject/overlay`（129M 注入产物）
  · 各种 `*.log`、`paths.json`（安装器按目标机生成）、`cz_cred.json`（DPAPI 绑本机用户）

★★ **带**（2026-10-10 起）：`tools/hashes.game.txt`（约 221MB）。
  实测：**裸直连下不动 GitHub**（raw 域被墙），而**现造皮肤必须要最新哈希表** ⇒
  只带下载器等于装完就废。所以把表直接打进包（zip 因此涨到约 90~110MB）。
  详见下面 `TOOLS_EXCLUDE` 的注释。
"""

from __future__ import annotations

PLUGIN_SRC_MAP = [
    ("plugin/index.js",       "PRISM-Store"),
    ("engine/index.js",       "PRISM-Engine"),
    ("chromaname/index.js",   "PRISM-ChromaName"),
    ("loadinglogo/index.js",  "PRISM-Loading"),
    ("selfname/index.js",     "SELFNAME"),
    ("lootsim/index.js",      "LOOTSIM"),
    ("lootrec/index.js",      "LOOTREC"),
]

PAYLOAD_ITEMS = [
    "prism-server.exe",
    "_int_server",
    "lcu-lockfile-watch.exe",
    "_int_watch",
    "PRISM.exe",
    "_int_launcher",
    "pengu",
    "plugins",
    "assets",
]

ASSETS_WHITELIST = [
    "icon.png",
    "prism-loading-logo.png",
    "prism.ico",
]

TOOLS_EXCLUDE = [
    "_hashparts",
    "_hash_update.log",
    "hashes.state.json",
]

PENGU_EXCLUDE = [
    "unins000.dat",
    "unins000.exe",
    "datastore",
    "ZZ-Probe",
]

SKIP_DIR_NAMES = {
    "_bak", "_bak_rename_hallmods", "wadextract", "build", "imgcache",
    "_hashparts", "_diag", "__pycache__", ".git",
}

SKIP_SUFFIXES = (".log", ".tmp", ".part")

SKIP_FILE_NAMES = {
    "paths.json",
    "cz_cred.json",
    "lockfile_written.json",
    "launcher.log",
    "lockfile_watch.log",
    "query-cache.json",
    "mh-forge-backup.json",
}


def should_skip(name: str) -> bool:
    """这个名字该不该跳过（目录名 / 文件名 / 后缀 / 开发备份 四种规则）。"""
    if name in SKIP_FILE_NAMES or name in SKIP_DIR_NAMES:
        return True
    low = name.lower()
    if ".bak" in low:
        return True
    for s in SKIP_SUFFIXES:
        if low.endswith(s):
            return True
    return False


def make_ignore(item: str):
    """给 `shutil.copytree(..., ignore=…)` 用的回调（按 item 选专属排除 + 全局跳过）。

    ★ 安装器和打包脚本**共用这一个**，免得两边规则漂移。
    """
    excl = []
    if item == "tools":
        excl = TOOLS_EXCLUDE
    elif item == "pengu":
        excl = PENGU_EXCLUDE

    def _ignore(dirpath, names):
        return [n for n in names if n in excl or should_skip(n)]
    return _ignore
