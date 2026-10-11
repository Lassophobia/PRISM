r"""
server.py — PRISM 的本地后端（无界面）

为什么必须要有它
----------------
跑在客户端 CEF 里的 Pengu 插件受同源策略约束：
  * 外站 API 与图片都没有 Access-Control-Allow-Origin 头，
    OPTIONS 预检直接 403 —— 浏览器不让读；
  * 插件沙箱里没有 writeFile / fs / spawn，碰不到磁盘。
所以「代取数据 + 落盘缓存」只能由本机进程代劳。

这个服务做的事
--------------
  1. 代理 LCU：拿真实数据（不受同源限制），
     客户端 CEF 拉不到的外站图也由它代取再回吐
  2. 静态素材出口：图标 / loading 图等本机素材
  3. 调 LCU 的 POST /riotclient/kill-and-restart-ux 让改动实装
  （★ 2026-10-04：原「MOD 商店下载安装」已整体下线，2026-10-11 清残留）

接口（全部带 CORS 头，插件可直连）
----------------------------------
  GET  /api/ping                        健康检查
  GET  /api/status                      环境状态（客户端/LCU）
  GET  /asset/icon.png                  顶栏图标（alpha 遮罩，客户端给它上色）
  GET  /img?u=<urlencoded>              缩略图中转（带磁盘缓存）
  GET  /api/diag                        读插件回传的诊断日志
  POST /api/reload                      重启客户端实装
  POST /api/diag                        插件回传诊断（JSON Lines 落盘）


只监听 127.0.0.1，不对外。没有窗口，没有托盘图标。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PORT = 17888
try:
    PORT = int(os.environ.get("PRISM_PORT") or PORT)
except Exception:
    PORT = 17888
VERSION = "1.3.0"

LOCALAPPDATA = Path(os.environ.get("LOCALAPPDATA", ""))

_ASSETS_CACHE = None


def assets_dir() -> Path:
    """我们自己的素材目录（懒解析 + 缓存）。"""
    global _ASSETS_CACHE
    if _ASSETS_CACHE is None:
        try:
            _ASSETS_CACHE = Path(prism_mod("paths").assets_dir())
        except Exception:
            _ASSETS_CACHE = LOCALAPPDATA / "PRISM" / "assets"
    return _ASSETS_CACHE



def tmp_dir() -> Path:
    """家里的一次性临时区（下载中转）。以前落在 `%TEMP%\\prism_dl`。"""
    try:
        d = Path(prism_mod("paths").tmp_dir())
    except Exception:
        d = LOCALAPPDATA / "PRISM" / "tmp"
    try:
        d.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return d


def icon_file() -> Path:
    return assets_dir() / "icon.png"


def img_cache() -> Path:
    return assets_dir() / "imgcache"


def diag_file() -> Path:
    return assets_dir() / "plugin-diag.log"


def req_log_path() -> Path:
    return assets_dir() / "requests.log"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")
SSL_CTX = ssl.create_default_context()

NO_VERIFY = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
NO_VERIFY.check_hostname = False
NO_VERIFY.verify_mode = ssl.CERT_NONE


def open_with_retry(req, timeout=30, context=None, attempts=3, backoff=0.7):
    """
    带重试的 urlopen。

    为什么需要：代取外站图（`/img` 代理）偶尔会撞上
        [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol
    —— 网络抖动 / 中间设备干扰时，Python 的 TLS 栈会先断，而系统 TLS（curl）照样能连。
    这类失败是瞬时的，隔几百毫秒重试通常就过了，不该直接把异常甩给用户看。
    """
    last = None
    for i in range(attempts):
        try:
            return urllib.request.urlopen(req, timeout=timeout, context=context)
        except urllib.error.HTTPError:
            raise
        except (ssl.SSLError, urllib.error.URLError, ConnectionError, OSError) as e:
            last = e
            if i < attempts - 1:
                time.sleep(backoff * (i + 1))
    raise last




CLIENT_STATE = {"running": False, "checked": 0.0}


_LOGF = {"fh": None, "tried": False}


def _log_file():
    """把日志落盘。

    ★★ 2026-10-09 为什么必须加：本 exe 是 PyInstaller 的 **windowed** 产物
       （spec 里 `console=False`）⇒ **它没有 stdout**，`print()` 全进虚空。
       于是"出了什么事导致进程没了"完全查不到 —— 今天后端两次无故消失，
       既没有崩溃记录、也没有任何日志，只能靠猜。
       ⇒ 落到 `<家>\\assets\\server.log`（超 4MB 轮转一次），排障有据可依。
    """
    d = _LOGF
    if d["fh"] is not None or d["tried"]:
        return d["fh"]
    d["tried"] = True
    try:
        p = assets_dir() / "server.log"
        p.parent.mkdir(parents=True, exist_ok=True)
        if p.exists() and p.stat().st_size > 4 * 1024 * 1024:
            try:
                p.replace(p.with_name("server.log.1"))
            except OSError:
                pass
        d["fh"] = open(str(p), "a", encoding="utf-8", buffering=1)
    except Exception:
        d["fh"] = None
    return d["fh"]


def log(msg: str) -> None:
    line = "[%s] %s" % (time.strftime("%H:%M:%S"), msg)
    try:
        print(line, flush=True)
    except Exception:
        pass
    fh = _log_file()
    if fh is not None:
        try:
            fh.write(line + "\n")
        except Exception:
            pass



def client_dir() -> Path:
    """找 LeagueClient 目录（走 paths 的统一路径链）。"""
    try:
        d = Path(prism_mod("paths").client_path(required=False) or "")
        if d and d.is_dir():
            return d
    except Exception:
        pass
    for cand in (Path(r"E:\LoL\LeagueClient"),
                 Path(r"E:\WeGameApps\英雄联盟（含经典模式）\LeagueClient")):
        if cand.is_dir():
            return cand
    return Path("")


def lcu_credentials():
    """从 lockfile 读端口和令牌。返回 (port, token) 或 None。"""
    d = client_dir()
    if not d:
        return None
    lf = d / "lockfile"
    if not lf.exists():
        return None
    try:
        raw = lf.read_text(encoding="utf-8", errors="replace").strip()
        parts = raw.split(":")
        if len(parts) < 5:
            return None
        return int(parts[2]), parts[3]
    except Exception:
        return None


def lcu_request(method: str, path: str, body=None, timeout=20):
    creds = lcu_credentials()
    if not creds:
        raise RuntimeError("拿不到 LCU 凭据（lockfile 无效或客户端没开）")
    port, token = creds
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request("https://127.0.0.1:%d%s" % (port, path), data=data, method=method)
    import base64
    req.add_header("Authorization", "Basic " + base64.b64encode(("riot:" + token).encode()).decode())
    if data:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout, context=NO_VERIFY) as r:
        return r.status, r.read()


def lcu_asset_image(asset_path: str, width: int) -> tuple[bytes, str]:
    """从**本地客户端**取游戏素材图（荣誉徽章 / 旗帜等），缩图后返回。

    为什么要绕这一道，而不是让插件直接拉 CDN：
      · CDN（raw.communitydragon.org）会限流/抖动，实测同批 35 张图能整片失败；
      · 客户端本来就有这些图，走本地一秒都不用等，还完全离线可用；
      · 顺手在我们这边缩放，避免在面板里塞 580×1480 的原图（单张 300~660 KB）。
    路径白名单只放行 /lol-game-data/ 前缀 —— 别让它变成任意本地请求的跳板。
    """
    if not asset_path.startswith("/lol-game-data/"):
        raise ValueError("只允许取 /lol-game-data/ 下的素材")
    if ".." in asset_path or "\x00" in asset_path:
        raise ValueError("路径不合法")

    img_cache().mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(("lcu|%s|w%d" % (asset_path, width)).encode("utf-8")).hexdigest()
    cache_file = img_cache() / (key + ".jpg")
    meta_file = img_cache() / (key + ".ctype")
    if cache_file.exists() and cache_file.stat().st_size > 256:
        ctype = meta_file.read_text(encoding="utf-8").strip() if meta_file.exists() else ""
        return cache_file.read_bytes(), (ctype or "image/jpeg")

    st, raw = lcu_request("GET", asset_path, timeout=30)
    if st != 200 or len(raw) < 64:
        raise RuntimeError("LCU 没有返回有效图片（HTTP %s）" % st)
    data, ctype = _shrink(raw, width)
    with IMG_LOCK:
        tmp = cache_file.with_suffix(cache_file.suffix + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(cache_file)
        meta_file.write_text(ctype, encoding="utf-8")
    return data, ctype


SKIN_GEM_CACHE: dict = {"at": 0.0, "map": {}}


def skins_gem_map(force: bool = False) -> dict:
    """给插件用的两张表：
      · byPath：**卡片图片路径的 basename（转小写）** → 国服品质宝石号
      · byId  ：皮肤 id(str) → 宝石号（保底用；真机图片路径里其实没有全局皮肤 id）
    为什么以 byPath 为主：真机卡片 `img.inventory-item-image` 的 src 就是 skins.json 里的
    `loadScreenPath`（例：`/lol-game-data/assets/ASSETS/Characters/Lux/Skins/Skin07/LuxLoadScreen_7.jpg`），
    末段只有**单个数字**（7 = 该英雄的第 7 款），**不包含全局皮肤 id**（1000*英雄+序号），
    从路径反推需要英雄别名表 —— 而 `loadScreenPath` 的 basename 全局唯一（2155 个无重复），
    直接按 basename 匹配最稳。⚠️ 真机 src 的大小写和 skins.json 里**不一致**（characters/Characters、
    Loadscreen/LoadScreen），所以键统一转小写。
    多阶皮肤（名人堂）：卡片用的是"某一阶"的 loadScreenPath ⇒ 每一阶的路径也要映射到本体的评级号。
    带 6 小时缓存（skins.json 6MB+，别反复拉）。
    """
    now = time.time()
    if not force and SKIN_GEM_CACHE["map"] and now - SKIN_GEM_CACHE["at"] < 6 * 3600:
        return SKIN_GEM_CACHE["map"]

    st, raw = lcu_request("GET", "/lol-game-data/assets/v1/skins.json", timeout=45)
    if st != 200 or len(raw) < 1024:
        raise RuntimeError("LCU 没返回 skins.json（HTTP %s）" % st)
    data = json.loads(raw.decode("utf-8", "replace"))

    by_id: dict = {}
    by_path: dict = {}

    def key_of(path: str):
        if not path:
            return ""
        return path.split("/")[-1].split("?")[0].strip().lower()

    def dir_of(path: str):
        """卡片图片的"皮肤目录"键：`.../characters/<champ>/skins/<skinnn>`（全小写）。

        ⚠️ 为什么需要它（2026-09-18 实测）：**并不是每张卡的图片都是 loadScreenPath** ——
        多阶皮肤（kQuestSkin）的卡片用的是同目录下的 `Images/collection_card.jpg`，
        basename 查不到，于是插件退回"按 borderRarity 猜"，宝石就画错了
        （实测：萨勒芬妮那张画成了 cn-gem-4，正确是 cn-gem-9）。
        而**目录**仍然是这一款皮肤 ⇒ 用目录键兜底就能拿到正确评级。
        """
        if not path:
            return ""
        pp = path.split("?")[0].strip().lower().split("/")
        for i in range(len(pp)):
            if pp[i] == "skins" and i + 1 < len(pp):
                return "/".join(pp[:i + 2])
        return ""

    for k, v in data.items():
        if not isinstance(v, dict):
            continue
        try:
            sid = int(v.get("id", k))
        except Exception:
            continue
        rr = v.get("regionRarityId")
        if not (isinstance(rr, int) and rr > 0):
            continue
        by_id[str(sid)] = rr
        kp = key_of(v.get("loadScreenPath") or "")
        if kp:
            by_path[kp] = rr
        kd = dir_of(v.get("loadScreenPath") or "")
        if kd:
            by_path[kd] = rr
        for t in ((v.get("questSkinInfo") or {}).get("tiers") or []):
            if not isinstance(t, dict):
                continue
            try:
                if t.get("id"):
                    by_id[str(int(t["id"]))] = rr
            except Exception:
                pass
            kt = key_of(t.get("loadScreenPath") or "")
            if kt:
                by_path[kt] = rr
            kt2 = dir_of(t.get("loadScreenPath") or "")
            if kt2:
                by_path[kt2] = rr

    out = {"byPath": by_path, "byId": by_id, "at": now}
    SKIN_GEM_CACHE["map"] = out
    SKIN_GEM_CACHE["at"] = now
    return out


def is_client_running() -> bool:
    """带缓存的客户端进程检查（10 秒内不重复查）。

    ⚠️ 这里绝对不能用裸的 `subprocess.run(["tasklist", ...])`：
    我们的 exe 是无窗口程序，派生 tasklist.exe（控制台程序）会**弹出一个黑框**，
    而插件每 30 秒 ping 一次 → 就会每 30 秒闪一次 CMD。
    优先用 socket 探 LCU 端口（瞬间、零副作用），拿不到凭据时才退到隐藏窗口的 tasklist。
    """
    now = time.time()
    if now - CLIENT_STATE["checked"] < 10:
        return CLIENT_STATE["running"]

    running = False

    creds = lcu_credentials()
    if creds:
        try:
            s = socket.create_connection(("127.0.0.1", creds[0]), timeout=0.6)
            s.close()
            running = True
        except OSError:
            running = False
    else:
        running = False

    if not running and not creds:
        try:
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 0
            out = subprocess.run(
                ["tasklist", "/fo", "csv", "/nh"],
                capture_output=True, timeout=15,
                creationflags=0x08000000,
                startupinfo=si,
            ).stdout
            txt = out.decode("cp936", "ignore").lower()
            running = "leagueclientux.exe" in txt or "leagueclient.exe" in txt
        except Exception:
            pass

    CLIENT_STATE["running"] = running
    CLIENT_STATE["checked"] = now
    return running


def _allowed_img_host(url: str) -> bool:
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return False
    if not url.lower().startswith(("http://", "https://")):
        return False
    return any(host == h or host.endswith("." + h) for h in IMG_HOSTS)


def _guess_type(path: str, data: bytes) -> str:
    low = path.lower().split("?")[0]
    for ext, ct in ((".png", "image/png"), (".jpg", "image/jpeg"),
                    (".jpeg", "image/jpeg"), (".webp", "image/webp"),
                    (".gif", "image/gif"), (".svg", "image/svg+xml")):
        if low.endswith(ext):
            return ct
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "application/octet-stream"


def _shrink(data: bytes, width: int) -> tuple[bytes, str]:
    """把原图缩到指定宽度并转 JPEG。

    站上的缩略图其实是 1920x1080 的原图截图，单张平均 1.5 MB ——
    24 张卡一页就是 36 MB，客户端里会卡成幻灯片。
    缩到 520px 宽 + JPEG q82 之后单张约 40-60 KB，一页不到 1.5 MB。
    """
    try:
        import io

        from PIL import Image
    except ImportError:
        return data, _guess_type("", data)

    try:
        im = Image.open(io.BytesIO(data))
        im.load()
        if im.width > width:
            h = max(1, round(im.height * width / im.width))
            im = im.resize((width, h), Image.LANCZOS)
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (1, 10, 19))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        out = io.BytesIO()
        im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
        return out.getvalue(), "image/jpeg"
    except Exception:
        return data, _guess_type("", data)


def proxy_image(url: str, width: int = 520) -> tuple[bytes, str]:
    """取远程图片，缩到 width 宽（带磁盘缓存）。返回 (bytes, content_type)。"""
    if not _allowed_img_host(url):
        raise ValueError("不允许代取这个地址")

    img_cache().mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(("%s|w%d" % (url, width)).encode("utf-8")).hexdigest()
    cache_file = img_cache() / (key + ".jpg")
    meta_file = img_cache() / (key + ".ctype")

    if cache_file.exists() and cache_file.stat().st_size > 256:
        ctype = meta_file.read_text(encoding="utf-8").strip() if meta_file.exists() else ""
        return cache_file.read_bytes(), (ctype or "image/jpeg")

    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*"})
    with open_with_retry(req, timeout=45, context=SSL_CTX) as r:
        raw = r.read()
    if len(raw) < 64:
        raise RuntimeError("图片太小，可能不是有效资源")

    data, ctype = _shrink(raw, width) if width else (raw, _guess_type(url, raw))

    with IMG_LOCK:
        tmp = cache_file.with_suffix(cache_file.suffix + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(cache_file)
        meta_file.write_text(ctype, encoding="utf-8")
    return data, ctype


def icon_bytes() -> tuple[bytes, str]:
    if icon_file().exists():
        data = icon_file().read_bytes()
        if len(data) > 100:
            return data, "image/png"
    return _FALLBACK_ICON, "image/svg+xml"


def local_asset(name: str) -> tuple[bytes | None, str]:
    """通用本机素材：`/asset/<文件名>` -> `prism-assets/<文件名>`。

    为什么以前没有、现在需要：
      2026-10-05 之前这条路由**只硬编码服务 icon.png 一个文件**
      （`if path == "/asset/icon.png"`），于是任何新素材（比如 loading 页的新标识）
      都只能挤进那个分支或者另开一条 —— 等于每加一张图就要改一次服务端。
      客户端 CEF 只认 127.0.0.1 上的图（拉不到外站，见上面「素材中转」那段说明），
      所以本机必须有一个**能放任意图**的出口。这里就是那个出口。

    安全：只收白名单后缀；文件名里禁止 `/` `\\` `..` 和空字节，
    再 `resolve()` 一次确认没跑出 assets_dir()（防 `..` 绕过与符号链接）。
    取不到就退回同名兜底（ASSET_FALLBACK），没有兜底则返回 (None, "")。
    """
    raw = (name or "").strip()
    bad = ("..", "/", "\\", "\x00", ":")
    if not raw or any(b in raw for b in bad) or not raw.lower().endswith(ASSET_EXT):
        fb = ASSET_FALLBACK.get(raw)
        return fb if fb else (None, "")
    p = (assets_dir() / raw).resolve()
    try:
        p.relative_to(assets_dir().resolve())
    except ValueError:
        return None, ""
    try:
        if p.is_file():
            data = p.read_bytes()
            if data:
                return data, guess_ctype(raw)
    except OSError:
        pass
    fb = ASSET_FALLBACK.get(raw)
    return fb if fb else (None, "")


def guess_ctype(name: str) -> str:
    n = name.lower()
    for ext, ct in ((".png", "image/png"), (".jpg", "image/jpeg"), (".jpeg", "image/jpeg"),
                    (".gif", "image/gif"), (".webp", "image/webp"), (".svg", "image/svg+xml"),
                    (".ico", "image/x-icon"), (".bmp", "image/bmp")):
        if n.endswith(ext):
            return ct
    return "application/octet-stream"


def req_log(method: str, path: str, ua: str = "") -> None:
    """记一笔请求。排查"插件到底有没有跑"时这个最有用：
    如果 /asset/icon.png 从来没被请求过，说明顶栏项压根没被创建。

    ★ 2026-10-09 补：**关键请求（POST / `/api/install`、`/api/reload`）同时写进 `server.log`**。
      `requests.log` 只留最近 400 行、且被每 4 秒一次的心跳 GET 快速挤掉 ——
      关键事实必须留在一份不会被冲掉的日志里。
    """
    try:
        assets_dir().mkdir(parents=True, exist_ok=True)
        line = "%s %s %-7s %s\n" % (time.strftime("%H:%M:%S"), method, path[:150],
                                    (ua or "")[:40])
        old = []
        if req_log_path().exists():
            try:
                old = req_log_path().read_text(encoding="utf-8", errors="replace").splitlines()[-400:]
            except OSError:
                old = []
        req_log_path().write_text("\n".join(old + [line.rstrip()]) + "\n", encoding="utf-8")
    except OSError:
        pass
    if method == "POST" or path.startswith("/api/reload"):
        try:
            log("REQ %s %s" % (method, path[:160]))
        except Exception:
            pass


def diag_append(payload) -> None:
    """插件把客户端里的真实 DOM 状态回传到这里，方便这边排查渲染问题。

    跑在客户端里的插件没法开 DevTools（没有 CDP 端口），所以只能让它自己
    把关键状态 POST 出来。日志是 JSON Lines。
    """
    assets_dir().mkdir(parents=True, exist_ok=True)
    rec = {"t": time.strftime("%H:%M:%S"), "recv": time.time(), "data": payload}
    try:
        with diag_file().open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError:
        pass
    log("插件诊断: %s" % json.dumps(payload, ensure_ascii=False)[:400])


def diag_read() -> list:
    try:
        txt = diag_file().read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    out = []
    for line in txt.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


    return name[:80] or "mod"










def do_reload() -> str:
    st, _ = lcu_request("POST", "/riotclient/kill-and-restart-ux")
    return "LCU 返回 %s" % st




def _prism_search_paths() -> list:
    """prism_inject 可能在哪几个目录，按优先级排。

    ★ 为什么不能只 `Path(__file__).parent`：
      打包成 **PyInstaller onefile** 之后，`__file__` 指向的是解包临时目录
      `_MEIxxxx`，跟源码目录半点关系没有 —— 照那个找必然找不到 prism_inject。
      所以要同时考虑"跑源码"和"跑 exe"两种情况：
        · 源码：    <工程根>/server.py           → 父目录就是 prism_inject 的上一级
        · onefile： exe 旁边的 _MEIPASS          → 打包时把 prism_inject 塞这儿
        · 兜底：    exe 所在目录（手工放一份 prism_inject 也能救急）
    """
    out = []
    try:
        out.append(Path(__file__).resolve().parent)
    except NameError:
        pass
    mei = getattr(sys, "_MEIPASS", "")
    if mei:
        out.append(Path(mei))
    try:
        out.append(Path(sys.executable).resolve().parent)
    except (OSError, ValueError, AttributeError):
        pass
    out.append(Path.cwd())
    seen, uniq = set(), []
    for p in out:
        s = str(p)
        if s not in seen:
            seen.add(s)
            uniq.append(p)
    return uniq


def _load_prism_inject_pkg(pkg_dir: Path):
    """把 `<pkg_dir>` 当**包**显式加载（`pkg_dir` 就是那个 prism_inject 目录）。

    ★ 为什么不用 `importlib.import_module("prism_inject.auto")`：
      打包成 PyInstaller onefile 后，包目录在解包临时区里，导入要走冻结导入器 +
      sys.path 那一堆机制，实测**相对导入会失败**，然后模块里那层
      `except ImportError: import paths` 兜底又被触发，最终报出来的是
      "No module named 'paths'" —— 真凶被兜底代码吞掉了，极难查。
      这里直接用 spec_from_file_location 把 `__path__` 指死，
      相对导入走普通 PathFinder 找同目录的 .py，**源码跑和 exe 跑完全一致**。
    """
    import importlib.util
    init = Path(pkg_dir) / "__init__.py"
    if not init.is_file():
        raise ImportError("没有 %s" % init)
    pkg_name = "prism_inject"
    spec = importlib.util.spec_from_file_location(
        pkg_name, str(init), submodule_search_locations=[str(pkg_dir)])
    if spec is None or spec.loader is None:
        raise ImportError("无法为 %s 建 spec" % init)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[pkg_name] = mod
    spec.loader.exec_module(mod)
    return mod


_PRISM_MODS = {}


def prism_mod(name: str):
    """按名字拿 `prism_inject.<name>` 子模块。拿不到返回 None（不抛）。

    三条路：常规导入 → 按包显式加载 → sys.path 兜底，所以源码跑 / exe 跑行为一致。
    ★ 新增子模块后**必须**把它加进 `build/prism-server.spec` 的 `_PRISM` 列表，
      否则打包后 ① 失败、② 在解包目录里也未必找得到 —— 症状是运行到一半
      `ModuleNotFoundError`，且常被模块里的兜底 except 吞掉。
    """
    if name in _PRISM_MODS:
        return _PRISM_MODS[name]
    import importlib
    full = "prism_inject." + name

    try:
        m = importlib.import_module(full)
        _PRISM_MODS[name] = m
        return m
    except Exception:
        pass

    for d in _prism_search_paths():
        pkg = Path(d) / "prism_inject"
        if not (pkg / (name + ".py")).is_file():
            continue
        try:
            if "prism_inject" not in sys.modules:
                _load_prism_inject_pkg(pkg)
            m = importlib.import_module(full)
            _PRISM_MODS[name] = m
            log("prism_inject.%s 已加载：%s" % (name, pkg))
            return m
        except Exception as e:
            log("prism_inject.%s 加载失败 %s: %s" % (name, type(e).__name__, e))

    for d in _prism_search_paths():
        pkg = Path(d) / "prism_inject"
        if not (pkg / (name + ".py")).is_file():
            continue
        try:
            if str(pkg) not in sys.path:
                sys.path.insert(0, str(pkg))
            m = importlib.import_module(name)
            _PRISM_MODS[name] = m
            log("prism_inject.%s 已加载（sys.path）：%s" % (name, pkg))
            return m
        except Exception as e:
            log("prism_inject.%s 加载失败 %s: %s" % (name, type(e).__name__, e))
    return None





class Handler(BaseHTTPRequestHandler):
    server_version = "prism/" + VERSION

    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _bytes(self, data: bytes, ctype: str, cache_seconds: int = 86400):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if cache_seconds:
            self.send_header("Cache-Control", "public, max-age=%d" % cache_seconds)
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> dict:
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if not n:
                return {}
            return json.loads(self.rfile.read(n).decode("utf-8", "replace") or "{}")
        except Exception:
            return {}

    def do_OPTIONS(self):
        req_log("OPTIONS", self.path[:150], self.headers.get("Origin", ""))
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        path = u.path.rstrip("/") or "/"

        if path.startswith("/api/") or path.startswith("/asset/") or path == "/img":
            req_log("GET", u.path + ("?" + u.query[:80] if u.query else ""),
                    self.headers.get("User-Agent", ""))

        try:
            if path == "/api/ping":
                return self._json({"ok": True, "version": VERSION,
                                   "client": is_client_running()})

            if path == "/api/q/matches":
                qmod = prism_mod("cz_source")
                if qmod is None:
                    return self._json({"ok": False, "error": "查询模块不可用"}, 500)
                try:
                    _w = float(qmod.wait_seconds() or 0.0)
                except Exception:
                    _w = 0.0
                if _w > 0.05:
                    return self._json({"ok": False, "rateLimited": True,
                                       "retryAfter": round(_w, 1),
                                       "error": "查询太频繁，请 %.0f 秒后再试" % _w}, 429)
                puuid = (q.get("puuid") or [""])[0]
                if not puuid:
                    return self._json({"ok": False, "error": "缺少 puuid 参数"}, 400)
                def _int(key, dflt, lo, hi):
                    try:
                        v = int((q.get(key) or [str(dflt)])[0] or dflt)
                    except ValueError:
                        v = dflt
                    return max(lo, min(hi, v))
                count = _int("count", 20, 1, 200)
                start = _int("start", 0, 0, 100000)
                tag = (q.get("tag") or [""])[0]
                cluster = (q.get("cluster") or [""])[0] or None
                try:
                    out = qmod.matches(puuid, count=count, start=start, tag=tag, cluster=cluster)
                except Exception as e:
                    return self._json({"ok": False, "error": "%s: %s" % (type(e).__name__, e)}, 502)
                return self._json(out)

            if path == "/api/q/full":
                czm = prism_mod("cz_source")
                if czm is None:
                    return self._json({"ok": False, "error": "取数模块不可用"}, 500)

                try:
                    _w = float(czm.wait_seconds() or 0.0)
                except Exception:
                    _w = 0.0
                if _w > 0.05:
                    return self._json({"ok": False, "rateLimited": True,
                                       "retryAfter": round(_w, 1),
                                       "error": "查询太频繁，请 %.0f 秒后再试" % _w}, 429)

                _name = (q.get("name") or [""])[0]
                _tag = (q.get("tag") or [""])[0]
                if _name and "#" not in _name and _tag:
                    _name = "%s#%s" % (_name, _tag)
                if not _name:
                    return self._json({"ok": False, "error": "缺少 name 参数"}, 400)
                try:
                    _ml = int((q.get("masteryLimit") or ["10"])[0])
                except (TypeError, ValueError):
                    _ml = 10
                try:
                    _out = czm.profile(_name, mastery_limit=max(0, min(50, _ml)))
                except Exception as e:
                    return self._json({"ok": False, "error": "%s: %s" %
                                       (type(e).__name__, e)}, 502)

                _pl = _out.get("player") or {}
                _out["matches"], _out["matchesOk"], _out["matchesError"] = [], False, ""
                if _pl.get("puuid"):
                    try:
                        _mr = czm.matches(_pl["puuid"], count=30,
                                          region=_pl.get("region") or "")
                        _out["matches"] = _mr.get("games") or []
                        _out["matchesOk"] = bool(_mr.get("ok"))
                        _out["matchesError"] = _mr.get("error") or ""
                    except Exception as e:
                        _out["matchesError"] = "%s: %s" % (type(e).__name__, e)

                try:
                    _ids = set()
                    for _g in (_out.get("matches") or []):
                        for _p in (((_g or {}).get("json") or {}).get("participants") or []):
                            for _k in range(1, 7):
                                try:
                                    _v = int(_p.get("playerAugment%d" % _k) or 0)
                                except (TypeError, ValueError):
                                    _v = 0
                                if _v:
                                    _ids.add(_v)
                    _am = czm.augments_map() if _ids else {}
                    _out["augments"] = dict(
                        (str(i), {"name": (_am.get(i) or {}).get("name") or "",
                                  "level": (_am.get(i) or {}).get("level") or ""})
                        for i in sorted(_ids) if i in _am)
                except Exception:
                    _out["augments"] = {}

                _out["minInterval"] = getattr(czm, "MIN_INTERVAL", 10.0)
                _out["wait"] = round(float(czm.wait_seconds() or 0.0), 1)
                return self._json(_out)

            if path == "/api/q/aicon":
                czm = prism_mod("cz_source")
                if czm is None:
                    return self._json({"ok": False, "error": "取数模块不可用"}, 500)
                try:
                    _id = int((q.get("id") or ["0"])[0])
                except (TypeError, ValueError):
                    _id = 0
                _b = None
                try:
                    _b = czm.augment_icon(_id)
                except Exception:
                    _b = None
                if not _b:
                    return self._json({"ok": False, "error": "没有这个图标: %s" % _id}, 404)
                return self._bytes(_b, "image/png", 86400 * 7)

            if path == "/api/q/mh":
                q_old = prism_mod("query")
                q_new = prism_mod("cz_source")
                forge = prism_mod("mh_forge")
                if forge is None or (q_old is None and q_new is None):
                    return self._json({"ok": False, "error": "查询/转换模块不可用"}, 500)

                def _site_wait():
                    """★ 网站通道的冷却秒数 —— **只对"兜底那一次"生效**。
                    原方式不打站点、不吃这条限流（限流本来是为省站点配额定的）。"""
                    try:
                        return float(q_new.wait_seconds() or 0.0) if q_new else 0.0
                    except Exception:
                        return 0.0

                def _i(key, dflt, lo, hi):
                    try:
                        v = int((q.get(key) or [str(dflt)])[0] or dflt)
                    except (TypeError, ValueError):
                        v = dflt
                    return max(lo, min(hi, v))

                puuid = (q.get("puuid") or [""])[0]
                name = (q.get("name") or [""])[0]
                tag = (q.get("tag") or [""])[0]
                if not puuid:
                    if not name:
                        return self._json({"ok": False, "error": "缺少 name 或 puuid 参数"}, 400)
                    full = name if "#" in name else ("%s#%s" % (name, tag))
                    rr = None
                    if q_old:
                        try:
                            rr = q_old.resolve(full)
                        except Exception:
                            rr = None
                    if not (rr or {}).get("puuid") and q_new:
                        try:
                            rr = q_new.resolve(full)
                        except Exception:
                            rr = None
                    puuid = (rr or {}).get("puuid") or ""
                    if not puuid:
                        return self._json({"ok": False, "error": "未找到该玩家: %s" % full}, 404)

                beg = _i("begIndex", 0, 0, 100000)
                end = _i("endIndex", 19, 0, 100000)
                want = max(1, end - beg + 1)
                MATE_MAX = 100
                fetch_n = max(want, MATE_MAX - beg) if beg < MATE_MAX else want
                out, src = None, ""
                if q_old:
                    try:
                        out = q_old.matches(puuid, count=fetch_n, start=beg)
                    except Exception:
                        out = None
                    if out and out.get("ok") and (out.get("games") or []):
                        src = "sgp"
                if not src and q_new:
                    _w = _site_wait()
                    if _w > 0.05:
                        return self._json({
                            "ok": False, "rateLimited": True, "retryAfter": round(_w, 1),
                            "error": "原方式没取到对局，网站通道还在冷却，请 %.0f 秒后再试" % _w},
                            429)
                    _o2 = None
                    try:
                        _o2 = q_new.matches(puuid, count=fetch_n, start=beg)
                    except Exception:
                        _o2 = None
                    if _o2 and (_o2.get("games") or []):
                        out, src = _o2, "web"
                if not src:
                    if out is not None and out.get("ok"):
                        src = "sgp-empty"
                    else:
                        _e = ((out or {}).get("error") or
                              "取对局记录失败（原方式与网站通道都没取到）")
                        return self._json({"ok": False, "error": _e}, 502)
                raw_all = (out or {}).get("games") or []
                raw_games = raw_all[:want]
                me_prof = {}
                try:
                    _st, _me = __import__("prism_inject.lcu", fromlist=["x"]).get_json(
                        "/lol-summoner/v1/current-summoner")
                    if _st == 200 and isinstance(_me, dict):
                        me_prof = {"accountId": _me.get("accountId") or 0,
                                   "puuid": _me.get("puuid") or "",
                                   "summonerId": _me.get("summonerId") or 0}
                except Exception:
                    pass
                acct, plat = me_prof.get("accountId") or 0, ""
                payload = forge.to_lcu_matches(raw_games, account_id=acct, platform_id=plat,
                                               beg=beg, end=end, me=me_prof,
                                               target_puuid=puuid)
                me_row = 0
                try:
                    me_row = forge.local_row(payload, me_prof.get("puuid") or "")
                except Exception:
                    me_row = 0

                mates_list, mates_meta = [], {}
                mates_wide, mates_wide_meta = [], {}
                if beg == 0 and raw_all:
                    try:
                        mates_list, mates_meta = forge.mates(raw_all, target_puuid=puuid,
                                                             min_team=2, limit=50)
                    except Exception:
                        mates_list, mates_meta = [], {}
                    try:
                        mates_wide, mates_wide_meta = forge.mates(raw_all, target_puuid=puuid,
                                                                  min_team=2, limit=MATE_MAX)
                    except Exception:
                        mates_wide, mates_wide_meta = [], {}

                tgt_sid = 0
                tgt_prof = {}
                tgt_cos = {}
                try:
                    _m = __import__("prism_inject.lcu", fromlist=["x"])
                    _s2, _o2 = _m.get_json("/lol-summoner/v2/summoners/puuid/" + puuid)
                    if _s2 == 200 and isinstance(_o2, dict):
                        tgt_sid = _o2.get("summonerId") or _o2.get("id") or 0
                        tgt_prof = {k: _o2.get(k) for k in (
                            "gameName", "tagLine", "displayName", "summonerLevel",
                            "profileIconId", "summonerId", "puuid", "accountId",
                            "xpSinceLastLevel", "xpUntilNextLevel", "percentCompleteForNextLevel")}
                    if tgt_prof.get("profileIconId"):
                        tgt_cos["iconUrl"] = "/lol-game-data/assets/v1/profile-icons/%s.jpg" \
                                             % tgt_prof["profileIconId"]
                    tgt_cos["summonerLevel"] = tgt_prof.get("summonerLevel")
                    if tgt_sid:
                        _s3, _reg = _m.get_json("/lol-regalia/v2/summoners/%s/regalia" % tgt_sid)
                        if _s3 == 200 and isinstance(_reg, dict):
                            tgt_cos["crestType"] = _reg.get("crestType")
                            tgt_cos["selectedPrestigeCrest"] = _reg.get("selectedPrestigeCrest")
                            tgt_cos["bannerType"] = _reg.get("bannerType")
                    _s4, _sum = _m.get_json(
                        "/lol-challenges/v1/summary-player-data/player/" + puuid)
                    if _s4 == 200 and isinstance(_sum, dict):
                        tgt_cos["bannerId"] = _sum.get("bannerId")
                        tgt_cos["crestId"] = _sum.get("crestId")
                        tgt_cos["prestigeCrestBorderLevel"] = _sum.get("prestigeCrestBorderLevel")
                        tgt_cos["challengeScore"] = _sum.get("totalChallengeScore")
                        tgt_cos["challengeLevel"] = _sum.get("overallChallengeLevel")
                        _sel = _sum.get("selectedChallengesString")
                        if isinstance(_sel, str) and _sel.strip():
                            tgt_cos["tokenIds"] = [x.strip() for x in _sel.split(",") if x.strip()]
                        _tiers, _icons = [], []
                        _by_id = {}
                        for _c in (_sum.get("topChallenges") or []):
                            if isinstance(_c, dict) and _c.get("id") is not None:
                                _by_id[str(_c.get("id"))] = _c
                        for _tid in (tgt_cos.get("tokenIds") or []):
                            _c = _by_id.get(str(_tid))
                            if not _c:
                                _tiers.append(None); _icons.append(None); continue
                            _lv = _c.get("currentLevel")
                            _map = _c.get("levelToIconPath") or {}
                            _tiers.append(_lv)
                            _icons.append(_map.get(_lv) if isinstance(_map, dict) else None)
                        if tgt_cos.get("tokenIds"):
                            tgt_cos["tokenTiers"] = _tiers
                            tgt_cos["tokenIcons"] = _icons
                        _t = _sum.get("title") or {}
                        _ctd = (_t.get("challengeTitleData") or {}) if isinstance(_t, dict) else {}
                        tgt_cos["titleName"] = _ctd.get("challengeName")
                        tgt_cos["titleContentId"] = _t.get("contentId") if isinstance(_t, dict) else None
                        try:
                            _cid = tgt_cos.get("titleContentId")
                            if _cid:
                                _s5, _ats = _m.get_json(
                                    "/lol-game-data/assets/v1/achievementtitles.json")
                                if _s5 == 200 and isinstance(_ats, list):
                                    for _a in _ats:
                                        if isinstance(_a, dict) and _a.get("contentId") == _cid:
                                            _tn = _a.get("titleName") or _a.get("name")
                                            if _tn:
                                                tgt_cos["titleName"] = _tn
                                            break
                        except Exception:
                            pass
                except Exception:
                    pass

                return self._json({"ok": True, "puuid": puuid, "name": name or "",
                                   "summonerId": tgt_sid, "profile": tgt_prof,
                                   "cosmetic": tgt_cos,
                                   "count": len(payload["games"]["games"]),
                                   "source": src,
                                   "meRow": me_row,
                                   "mates": mates_list,
                                   "matesMeta": mates_meta,
                                   "matesWide": mates_wide,
                                   "matesMetaWide": mates_wide_meta,
                                   "payload": payload})

            if path == "/api/status":
                creds = lcu_credentials()
                return self._json({
                    "ok": True, "version": VERSION,
                    "clientRunning": is_client_running(),
                    "lcuReady": creds is not None,
                })

            if path == "/api/skins/gems":
                try:
                    m = skins_gem_map()
                    return self._json({"ok": True, "count": len(m.get("byPath") or {}),
                                       "countId": len(m.get("byId") or {}),
                                       "byPath": m.get("byPath") or {}, "byId": m.get("byId") or {}})
                except Exception as e:
                    return self._json({"ok": False, "error": str(e)[:200]}, 502)

            if path == "/asset/icon.png":
                data, ctype = icon_bytes()
                return self._bytes(data, ctype, 86400)

            if path.startswith("/asset/"):
                name = urllib.parse.unquote(path[len("/asset/"):])
                data, ctype = local_asset(name)
                if data is None:
                    return self._json({"error": "未找到素材: %s" % name[:80]}, 404)
                return self._bytes(data, ctype, 86400)

            if path == "/img":
                target = (q.get("u") or [""])[0]
                if not target:
                    return self._json({"error": "缺少 u 参数"}, 400)
                try:
                    width = int((q.get("w") or ["520"])[0] or 520)
                except ValueError:
                    width = 520
                width = max(80, min(width, 1600))
                try:
                    data, ctype = proxy_image(target, width)
                except Exception as e:
                    return self._json({"error": str(e)[:200]}, 404)
                return self._bytes(data, ctype, 604800)

            if path == "/api/lcuimg":
                target = (q.get("p") or [""])[0]
                if not target:
                    return self._json({"error": "缺少 p 参数"}, 400)
                try:
                    width = int((q.get("w") or ["130"])[0] or 130)
                except ValueError:
                    width = 130
                width = max(40, min(width, 1600))
                try:
                    data, ctype = lcu_asset_image(target, width)
                except Exception as e:
                    return self._json({"error": str(e)[:200]}, 404)
                return self._bytes(data, ctype, 604800)


            if path == "/api/diag":
                raw = (q.get("d") or [""])[0]
                if raw:
                    try:
                        diag_append(json.loads(raw))
                    except ValueError:
                        diag_append({"evt": "raw", "data": raw[:400]})
                return self._json({"ok": True, "lines": diag_read()})



            if path == "/api/reload":
                return self._json({"ok": True, "detail": do_reload()})




            return self._json({"error": "未知路径", "path": path}, 404)

        except urllib.error.HTTPError as e:
            return self._json({"error": "上游返回 %s" % e.code}, 502)
        except Exception as e:
            return self._json({"error": str(e)[:300]}, 500)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        path = u.path.rstrip("/") or "/"
        req_log("POST", u.path, self.headers.get("Origin", ""))
        body = self._body()
        try:
            if path == "/api/reload":
                msg = do_reload()
                return self._json({"ok": True, "detail": msg})

            if path == "/api/diag":
                diag_append(body)
                return self._json({"ok": True})


            return self._json({"error": "未知路径", "path": path}, 404)
        except Exception as e:
            return self._json({"error": str(e)[:300]}, 500)


def _self_alive(timeout=1.5):
    """端口上是不是**已经有一个活着的自己**（/api/ping 应答且 version 一致）。

    ★ 这是"能不能让位"的**唯一**依据 —— 光看端口被占不算数（见 main() 注释）。
    """
    try:
        req = urllib.request.Request("http://127.0.0.1:%d/api/ping" % PORT)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.loads(r.read().decode("utf-8", "replace"))
        return d.get("ok") is True and d.get("version") == VERSION
    except Exception:
        return False


def main():
    global _ASSETS_CACHE
    try:
        _pm = prism_mod("paths")
        _d = _pm.use_exe_home() if _pm is not None else None
        if _d:
            _ASSETS_CACHE = None
            log("我们的家: %s（由 exe 位置自定位）" % _d)
    except Exception:
        pass

    log("=== prism-server 启动 pid=%d  argv=%s  日志=%s ===" % (
        os.getpid(), sys.argv, _LOGF["fh"].name if _LOGF["fh"] else "(未落盘)"))

    _argv = list(sys.argv[1:])
    if "--check-hashes" in _argv:
        log("模式：哈希字典核对（本版无注入链，跳过）")
        return 0
    if "--uninstall-hooks" in _argv:
        try:
            log("模式：卸载钩子%s" % ("（连皮肤库一起删）" if "--clean-skins" in _argv else ""))
            return prism_mod("uninstall").run_hooks(
                clean_skins=("--clean-skins" in _argv), logger=log)
        except Exception as e:
            log("卸载钩子出错：%s" % str(e)[:220])
            return 1
    if "--post-install" in _argv:
        try:
            _root = ""
            _adopt = ""
            for _i, _a in enumerate(_argv):
                if _a == "--root" and _i + 1 < len(_argv):
                    _root = _argv[_i + 1]
                if _a == "--adopt-from" and _i + 1 < len(_argv):
                    _adopt = _argv[_i + 1]
            log("模式：安装后置动作（游戏根=%s，搬运插件=%s）"
                % (_root or "(未给)", _adopt or "否"))
            return prism_mod("installer").post_install(_root, logger=log, adopt_from=_adopt)
        except Exception as e:
            log("安装后置动作出错：%s" % str(e)[:220])
            return 1
    if "--auto-repath" in _argv:
        try:
            log("模式：路径失效自动重定位")
            return prism_mod("installer").auto_repath(logger=log)
        except Exception as e:
            log("路径自动重定位出错：%s" % str(e)[:220])
            return 1
    if "--detect-game" in _argv:
        try:
            for _c in prism_mod("installer").detect_game_candidates():
                try:
                    print(_c, flush=True)
                except Exception:
                    pass
            return 0
        except Exception as e:
            log("探测游戏目录出错：%s" % str(e)[:200])
            return 1

    def _thread_hook(a):
        try:
            log("!!! 线程 %r 抛异常：%s\n%s" % (
                getattr(a.thread, "name", "?"), a.exc_type,
                "".join(traceback.format_exception(a.exc_type, a.exc_value, a.exc_traceback))))
        except Exception:
            pass

    try:
        threading.excepthook = _thread_hook
    except Exception:
        pass

    def _heartbeat():
        while True:
            time.sleep(60.0)
            try:
                log("· 心跳 (pid=%d)" % os.getpid())
            except Exception:
                pass

    try:
        threading.Thread(target=_heartbeat, name="prism-hb", daemon=True).start()
    except Exception:
        pass

    got = False
    for i in range(30):
        probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            probe.bind(("127.0.0.1", PORT))
            probe.close()
            got = True
            break
        except OSError:
            try:
                probe.close()
            except Exception:
                pass
            if _self_alive():
                log("端口 %d 上已经有一个活着的实例（version=%s），本次退出" % (PORT, VERSION))
                return 0
            if i == 0:
                log("端口 %d 被占（多半是上一个实例还没退干净），等它释放…" % PORT)
            time.sleep(1.0)
    if not got:
        log("端口 %d 等了 30 秒仍拿不到（有别的程序占着？）—— 退出" % PORT)
        return 0

    assets_dir().mkdir(parents=True, exist_ok=True)
    img_cache().mkdir(parents=True, exist_ok=True)
    log("图标资源: %s  (%s)" % (icon_file(), "已就位" if icon_file().exists() else "缺失，用内置兜底"))

    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    srv.daemon_threads = True
    log("prism 后端已启动  http://127.0.0.1:%d  (v%s)" % (PORT, VERSION))


    def _warm_augments():
        try:
            c = prism_mod("cz_source")
            if c is not None:
                n = len(c.augments_map() or {})
                log("强化符文表已就绪：%d 条" % n)
        except Exception as e:
            log("强化符文表预热失败（不影响其它功能）：%s: %s" % (type(e).__name__, e))

    try:
        threading.Thread(target=_warm_augments, name="cz-aug-warm", daemon=True).start()
    except Exception:
        pass

    def _warm_names():
        try:
            n = prism_mod("names")
            if n is not None:
                t = n.warm(log=lambda m: log("  " + m))
                if t:
                    log("名字表已就绪：%d 条（缓存 %s）" % (len(t), n.cache_path("zh")))
        except Exception as e:
            log("名字表预热失败（不影响其它功能）：%s: %s" % (type(e).__name__, e))

    try:
        threading.Thread(target=_warm_names, name="prism-names-warm", daemon=True).start()
    except Exception:
        pass



    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log("收到中断，退出")
    except BaseException:
        log("!!! serve_forever 抛异常，进程即将退出：\n" + traceback.format_exc())
        raise
    finally:
        srv.server_close()
        log("=== prism-server 退出 pid=%d（正常收尾）===" % os.getpid())
    return 0


if __name__ == "__main__":
    sys.exit(main())
