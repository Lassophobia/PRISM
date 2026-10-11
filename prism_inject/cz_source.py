"""chazhanji（峡谷查个分）取数层 —— 「战绩查询」的新数据来源。

为什么长得跟 `query.py` 一模一样
--------------------------------
原来「战绩查询」走 `query.py`：LCU `alias/lookup` 解析 + 国服 SGP 直连取战绩。
现改成走 chazhanji 的 Web API（已定），但**只换"取数"这一层** ——
`resolve()` / `matches()` 的**返回结构保持与 `query.py` 一致**，
所以 `mh_forge.to_lcu_matches()` 与 `server.py` 的组装段**一个字都不用改**。

★ 形状已实测对齐（2026-10-07）：
    chazhanji `get_match_page` 的 `data[i]`  ==  我们 SGP 的 `games[i]`
    都是 `{"metadata": {...}, "json": {...}}`，**json 的 18 个键完全一致**。

★★ 谁在扣额度（实测结论，别再猜）
    · `get_puuid {region:"auto", name, wb}`  按名字搜 → 免费、不授权
    · `get_puuid {region, puuid}`            "打开这个人" → 记一次查询（**可能扣免费额度**）
    · VIP（limit==0）时**完全不扣** ⇒ 本机账号已开 VIP，额度无上限。
    ⚠️ 但"不限额度"≠"可以乱来"：请求仍落在他家服务器 + 他家 ToS 上
    ⇒ 本模块自带 `MIN_INTERVAL`（默认 10s）**硬兜底**，对外的友好提示在 /api/q/mh。

凭据（★ 绝不硬编码、★ 也不明文落盘）
------------------------------------
  1) 环境变量  CZ_ACCOUNT / CZ_PASSWORD
  2) 文件      %LOCALAPPDATA%\\PRISM\\cz_cred.json
  3) 同目录    cz_cred.json（开发用）
  ★ 文件那两路都走 `cz_cred`（**Windows DPAPI 加密**）：磁盘上是
    `{"fmt":"dpapi-v1","blob":"..."}`，**明文只在内存里出现**。
    老格式（顶层直接 account/password）**仍认**，且第一次读到就自动转成密文
    ⇒ 换台电脑/换个用户**解不开**（顺带也就带不走账号）。
  只读**单个 cookie**（`lolcxtoken`），会话在进程内复用；过期自动重登。
"""

import http.cookiejar
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

from . import cz_cred

BASE = "https://chazhanji.cn"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
_TIMEOUT = 20.0
MIN_INTERVAL = 10.0
_LOGIN_TTL = 1800.0

_lock = threading.Lock()
_last_at = [0.0]
_region_mem = {}
_opener = None
_logged_at = [0.0]
_stat = {"calls": 0, "errors": 0, "last_err": "", "last_at": 0.0}



def _cred_paths():
    """凭据候选路径，**按优先级**：家 → 旧的 `%LOCALAPPDATA%\\PRISM` → 开发用同目录。

    ★ 2026-10-10：以前硬编码 `%LOCALAPPDATA%\\PRISM` ⇒ 家搬到别的盘就写错/找不到。
      现在第一项是 `paths.prism_home()`（**写入就是它**），旧位置保留作**只读回退**。
    """
    out = []
    try:
        from . import paths as _paths
        out.append(os.path.join(str(_paths.prism_home()), "cz_cred.json"))
        la = os.environ.get("LOCALAPPDATA")
        if la:
            old = os.path.join(la, "PRISM", "cz_cred.json")
            if old not in out:
                out.append(old)
    except Exception:
        pass
    out.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cz_cred.json"))
    return out


def cred_status():
    """不泄露内容：只回"有没有配"。"""
    a, _ = _cred()
    return bool(a)


_cred_notes = []


def _cred_log(msg):
    _cred_notes.append(msg)
    try:
        sys.stderr.write("[cz_cred] %s\n" % msg)
    except Exception:
        pass


def cred_notes():
    """给排障用：取数层关于凭据的说明（不含任何敏感值）。"""
    return list(_cred_notes)


def _cred():
    a = os.environ.get("CZ_ACCOUNT")
    p = os.environ.get("CZ_PASSWORD")
    if a and p:
        return a, p
    for path in _cred_paths():
        try:
            got = cz_cred.load_file(path, log=_cred_log)
            if got:
                return got
        except Exception:
            continue
    return None, None



def _sess():
    global _opener
    with _lock:
        if _opener is None:
            cj = http.cookiejar.CookieJar()
            _opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        return _opener


def _post(path, payload):
    """所有请求的唯一出口 —— ★ Origin/Referer 缺一不可（否则 401/403 非法调用）。"""
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=body, method="POST")
    req.add_header("User-Agent", UA)
    req.add_header("Accept", "application/json, text/plain, */*")
    req.add_header("Content-Type", "application/json")
    req.add_header("Origin", BASE)
    req.add_header("Referer", BASE + "/")
    req.add_header("Accept-Language", "zh-CN,zh;q=0.9")
    try:
        with _sess().open(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            raise RuntimeError("HTTP %s" % e.code)


def _login(force=False):
    if not force and (time.time() - _logged_at[0]) < _LOGIN_TTL:
        return
    a, p = _cred()
    if not a or not p:
        raise RuntimeError("没有配置 chazhanji 凭据 —— 用 python tools_cz_cred.py --set 写一份"
                           "（DPAPI 加密存到 %LOCALAPPDATA%\\PRISM\\cz_cred.json）")
    o = _post("/User/login_password.php", {"account": a, "password": p})
    if not (isinstance(o, dict) and o.get("code") in (0, 200)):
        raise RuntimeError("登录失败：%s" % ((o or {}).get("message") or "未知"))
    _logged_at[0] = time.time()



def wait_seconds():
    """距离下一次允许查询还有几秒（0 = 现在就能查）。"""
    with _lock:
        gap = MIN_INTERVAL - (time.time() - _last_at[0])
    return max(0.0, gap)


def _touch():
    with _lock:
        _last_at[0] = time.time()


def status():
    return {"has_cred": cred_status(), "min_interval": MIN_INTERVAL,
            "wait": round(wait_seconds(), 1), "calls": _stat["calls"],
            "errors": _stat["errors"], "last_err": _stat["last_err"],
            "regions": len(_region_mem)}



def resolve(full_id):
    """`名称#尾标` → `{"puuid","gameName","tagLine","region"}`；失败 None。

    ★ 比 query.resolve() 多一个 `region`（后续取战绩要用），其余字段同名同义。
    ★ 这一步**不扣额度**（按名字搜是免费的）。
    """
    if not full_id or "#" not in full_id:
        return None
    name, _, tag = full_id.rpartition("#")
    name, tag = name.strip(), tag.strip()
    if not name or not tag:
        return None
    try:
        _login()
        o = _post("/api/get_puuid.php", {"region": "auto", "name": name, "wb": tag})
    except Exception as e:
        _stat["errors"] += 1
        _stat["last_err"] = "%s: %s" % (type(e).__name__, e)
        return None
    if not isinstance(o, dict) or o.get("code") != 200 or not isinstance(o.get("data"), dict):
        return None
    d = o["data"]
    pu = d.get("puuid") or ""
    if not pu:
        return None
    reg = d.get("region") or ""
    if reg:
        with _lock:
            _region_mem[pu] = reg
    return {"puuid": pu,
            "gameName": d.get("name") or name,
            "tagLine": d.get("tag") or tag,
            "region": reg}


def region_of(puuid):
    """取（并缓存）该玩家在 chazhanji 眼里的大区名。失败返回 ""。"""
    if not puuid:
        return ""
    with _lock:
        r = _region_mem.get(puuid)
    if r:
        return r
    try:
        _login()
        o = _post("/api/get_puuid.php", {"region": "auto", "puuid": puuid})
        r = ((o.get("data") or {}).get("region")) or ""
        if r:
            with _lock:
                _region_mem[puuid] = r
    except Exception:
        r = ""
    return r


def matches(puuid, count=20, start=0, tag="", region=None, **_kw):
    """取战绩。返回 `{"ok","games","count","start","region","error","note"}`（**永不抛异常**）。

    ★ `games[i]` 与 `query.matches()` **逐字段同形**（实测 18/18 键一致）⇒ 直接喂 mh_forge。
    ★ 翻页：他家接口是 `page`/`limit` 且**单页上限 30**（传 100 也只回 30，实测）
      ⇒ 内部**自动翻页**凑够 `start+count` 条，再切出 `[start : start+count]`（等价语义）。
    ★ `tag` 参数保留仅为签名兼容（他家按 queueId 筛，暂不透传）。
    """
    out = {"ok": False, "games": [], "count": 0, "start": int(start or 0),
           "region": region or "", "error": "", "note": "来源 chazhanji"}
    if not puuid:
        out["error"] = "缺少 puuid"
        return out
    try:
        _login()
    except Exception as e:
        out["error"] = str(e)
        _stat["errors"] += 1
        _stat["last_err"] = out["error"]
        return out

    if not region:
        region = region_of(puuid)
    if not region:
        out["error"] = "拿不到该玩家所在大区"
        return out
    out["region"] = region

    need = max(1, int(start or 0) + max(1, int(count or 1)))
    try:
        _post("/api/get_puuid.php", {"region": region, "puuid": puuid})
    except Exception:
        pass

    PAGE_MAX = 30
    got, page = [], 1
    try:
        _touch()
        _stat["calls"] += 1
        _stat["last_at"] = time.time()
        while len(got) < need and page <= 8:
            o = _post("/api/get_match_page.php",
                      {"region": region, "puuid": puuid, "queueId": 0,
                       "page": page, "limit": PAGE_MAX})
            if not isinstance(o, dict) or o.get("code") != 200:
                if not got:
                    out["error"] = "chazhanji: %s" % ((o or {}).get("message") or "未知错误")
                    _stat["errors"] += 1
                    _stat["last_err"] = out["error"]
                    return out
                break
            arr = o.get("data")
            if not isinstance(arr, list) or not arr:
                break
            got.extend(arr)
            if len(arr) < PAGE_MAX:
                break
            page += 1
            if len(got) < need:
                time.sleep(0.4)
    except Exception as e:
        if not got:
            out["error"] = "%s: %s" % (type(e).__name__, e)
            _stat["errors"] += 1
            _stat["last_err"] = out["error"]
            return out

    st = int(start or 0)
    seg = got[st: st + max(1, int(count or 1))]
    out.update({"ok": True, "games": seg, "count": len(seg), "fetched": len(got)})
    return out


__all__ = ["resolve", "matches", "region_of", "wait_seconds", "status",
           "cred_status", "cred_notes", "MIN_INTERVAL", "profile",
           "player", "online", "assets", "rank", "masteries",
           "augments_map", "augment_icon", "parse_augments"]



def _open(region, puuid):
    """「打开这个人」：服务端记一次查询并授予访问权（VIP 下不扣额度，失败不致命）。"""
    try:
        _post("/api/get_puuid.php", {"region": region, "puuid": puuid})
        return True
    except Exception:
        return False


def online(name, wb):
    """在线状态文案（实测形如「游戏离线」/「在游戏中」）。失败返回 ""。"""
    try:
        _login()
        o = _post("/api/realtime/online.php", {"name": name, "wb": wb})
        return ((o.get("data") or {}).get("onlineText")) or ""
    except Exception:
        return ""


def player(name_tag):
    """玩家主体（含在线状态）。返回 dict 或 None。

    字段：puuid / gameName / tagLine / level / expPoints / expToNextLevel /
          profileIconId / region / lastGameDate / privacy / online
    ★ 这一步只用"按名字搜"形态 ⇒ **不扣额度**。
    """
    nm, _, wb = (name_tag or "").partition("#")
    nm, wb = nm.strip(), wb.strip()
    if not nm or not wb:
        return None
    try:
        _login()
        o = _post("/api/get_puuid.php", {"region": "auto", "name": nm, "wb": wb})
    except Exception as e:
        _stat["errors"] += 1
        _stat["last_err"] = str(e)
        return None
    if not isinstance(o, dict) or o.get("code") != 200 or not isinstance(o.get("data"), dict):
        return None
    d = o["data"]
    pu, reg = d.get("puuid") or "", d.get("region") or ""
    if not pu:
        return None
    if reg:
        with _lock:
            _region_mem[pu] = reg
    return {
        "puuid": pu,
        "gameName": d.get("name") or nm,
        "tagLine": d.get("tag") or wb,
        "level": d.get("level"),
        "expPoints": d.get("expPoints"),
        "expToNextLevel": d.get("expToNextLevel"),
        "profileIconId": d.get("profileIconId"),
        "region": reg,
        "lastGameDate": d.get("lastGameDate"),
        "privacy": d.get("privacy"),
        "online": online(nm, wb),
    }


def assets(region, puuid):
    """资产汇总。返回 `{heros, skins, colorfuls, guards, icons, emotes, levels, titles}`。

    实测样例：`{heros:247, skins:681, colorfuls:103, guards:43, icons:368,
              emotes:199, levels:"4168名 (前0.1%)", titles:"峡谷传说"}`
    """
    if not (region and puuid):
        return {}
    try:
        _login()
        o = _post("/api/get_assets.php", {"region": region, "puuid": puuid})
        if isinstance(o, dict) and o.get("code") == 200:
            return {k: o.get(k) for k in ("heros", "skins", "colorfuls", "guards",
                                          "icons", "emotes", "levels", "titles")}
        return {"error": (o or {}).get("message") or "取资产失败"}
    except Exception as e:
        return {"error": "%s: %s" % (type(e).__name__, e)}


def rank(region, puuid):
    """段位。返回 `{"puuid","queues":[{queueType,tier,rank,leaguePoints,cumulativeLp,
    highestTier,wins,losses,winStreak,previousSeasonEndTier,...}]}`。"""
    if not (region and puuid):
        return {}
    try:
        _login()
        o = _post("/api/get_rank.php", {"region": region, "puuid": puuid})
        if isinstance(o, dict) and o.get("code") == 200:
            return o.get("data") or {}
        return {"error": (o or {}).get("message") or "取段位失败"}
    except Exception as e:
        return {"error": "%s: %s" % (type(e).__name__, e)}


def masteries(region, puuid, limit=10):
    """英雄成就。返回 `{"total":N,"items":[{championId,championLevel,championPoints}]}`。"""
    if not (region and puuid):
        return {}
    try:
        _login()
        o = _post("/api/get_champion_masteries.php",
                  {"region": region, "puuid": puuid, "limit": max(1, int(limit or 10))})
        if isinstance(o, dict) and o.get("code") == 200:
            return o.get("data") or {}
        return {"error": (o or {}).get("message") or "取成就失败"}
    except Exception as e:
        return {"error": "%s: %s" % (type(e).__name__, e)}



_AUG = {"at": 0.0, "map": {}, "assets": []}
_AUG_TTL = 7 * 86400.0


def _cache_dir():
    """缓存目录 = **家**（`<家>\\augicons` 等）。家换了盘也跟着走。

    ★ 2026-10-10：以前硬编码 `%LOCALAPPDATA%\\PRISM`。
    """
    try:
        from . import paths as _paths
        d = str(_paths.prism_home())
    except Exception:
        la = os.environ.get("LOCALAPPDATA")
        d = os.path.join(la, "PRISM") if la else \
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    try:
        if not os.path.isdir(d):
            os.makedirs(d)
    except Exception:
        pass
    return d


def _aug_file():
    return os.path.join(_cache_dir(), "cz_augments.json")


def _aug_icon_dir():
    d = os.path.join(_cache_dir(), "augicons")
    try:
        if not os.path.isdir(d):
            os.makedirs(d)
    except Exception:
        pass
    return d


def _get_text(path):
    """按站点根路径取一个文本资源（带会话/UA/Referer）。"""
    req = urllib.request.Request(BASE + path, method="GET")
    req.add_header("User-Agent", UA)
    req.add_header("Referer", BASE + "/")
    with _sess().open(req, timeout=_TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


def _resolve_constants():
    """首页 → main-*.js → constants-<hash>.js。★ 哈希别写死（每次部署都变）。"""
    import re
    if _AUG["assets"]:
        return _AUG["assets"][0]
    home = _get_text("/")
    mains = re.findall(r"assets/main-[A-Za-z0-9_\-]+\.js", home)
    out = []
    for m in mains[:2]:
        out += re.findall(r"assets/constants-[A-Za-z0-9_\-]+\.js", _get_text("/" + m))
    if not out:
        raise RuntimeError("站点首页里没解析到 constants-*.js")
    _AUG["assets"] = sorted(set(out))
    return _AUG["assets"][0]


def parse_augments(text):
    """从站点 `constants-*.js` 文本里抠强化符文表。**纯函数**（离线可测）。

    ★ 为什么**逐条抠**、不做整体 `json.loads`：那一大段 113KB，
      实测**整体解析会失败**（某个条目的转义把 JSON 弄坏了），逐条抠则 248/248 全过。
    ★ 为什么按 `{"augmentID":` 切：那是每条固定开头；切完每条再按字段正则取，
      所以**坏掉一条只丢一条**，不会连累其它。
    """
    import re
    m = {}
    for ch in (text or "").split('{"augmentID":')[1:]:
        aid = re.match(r"(\d+)", ch)
        if not aid:
            continue
        nm = re.search(r'"name_cn":"((?:[^"\\]|\\.)*)"', ch)
        if not nm:
            continue
        lv = re.search(r'"level":"([^"]*)"', ch)
        ic = re.search(r'"large_Icon":"([^"]*)"', ch)
        try:
            name = json.loads('"' + nm.group(1) + '"')
        except Exception:
            name = nm.group(1)
        m[int(aid.group(1))] = {"name": name,
                                "level": (lv.group(1) if lv else ""),
                                "icon": (ic.group(1) if ic else "")}
    return m


def augments_map(force=False):
    """强化符文 `{id: {"name","level","icon"}}`。带磁盘缓存（默认 7 天）。**永不抛**。"""
    now = time.time()
    if not force and _AUG["map"] and (now - _AUG["at"]) < _AUG_TTL:
        return _AUG["map"]
    if not _AUG["map"]:
        try:
            d = json.load(open(_aug_file(), encoding="utf-8"))
            m = d.get("map") or {}
            if m:
                _AUG["map"] = dict((int(k), v) for k, v in m.items())
                _AUG["at"] = float(d.get("at") or 0)
                if not force and (now - _AUG["at"]) < _AUG_TTL:
                    return _AUG["map"]
        except Exception:
            pass
    try:
        _login()
        m = parse_augments(_get_text("/" + _resolve_constants()))
        if m:
            _AUG["map"] = m
            _AUG["at"] = now
            try:
                json.dump({"at": now, "map": dict((str(k), v) for k, v in m.items())},
                          open(_aug_file(), "w", encoding="utf-8"), ensure_ascii=False)
            except Exception:
                pass
    except Exception as e:
        _stat["last_err"] = "augments: %s" % e
    return _AUG["map"]


def augment_icon(aid):
    """强化符文图标字节。优先磁盘缓存；没有就按表里的外链抓一次（PNG 才收）。"""
    try:
        aid = int(aid)
    except (TypeError, ValueError):
        return None
    p = os.path.join(_aug_icon_dir(), "%d.png" % aid)
    try:
        if os.path.isfile(p) and os.path.getsize(p) > 200:
            return open(p, "rb").read()
    except Exception:
        pass
    url = (augments_map().get(aid) or {}).get("icon") or ""
    if not url:
        return None
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", UA)
        with _sess().open(req, timeout=_TIMEOUT) as resp:
            b = resp.read()
        if b[:8] == b"\x89PNG\r\n\x1a\n":
            try:
                open(p, "wb").write(b)
            except Exception:
                pass
            return b
    except Exception:
        pass
    return None


def profile(name_tag, mastery_limit=10):
    """★ 一次拿全套 —— 供面板「把这个人的所有数据都展示出来」。

    返回 `{ok, player, assets, rank, masteries, error}`（**永不抛异常**）。
    ★ 会先 `_open()` 一次（= 服务端记一次查询 / 授予访问权；VIP 下不扣额度）。
    """
    out = {"ok": False, "player": None, "assets": {}, "rank": {},
           "masteries": {}, "error": ""}
    _touch()
    _stat["calls"] += 1
    _stat["last_at"] = time.time()
    p = player(name_tag)
    if not p:
        out["error"] = "未找到该召唤师（请检查名称与尾标）"
        return out
    out["player"] = p
    reg, pu = p.get("region") or "", p.get("puuid") or ""
    if reg and pu:
        _open(reg, pu)
        out["assets"] = assets(reg, pu)
        out["rank"] = rank(reg, pu)
        if int(mastery_limit or 0) > 0:
            out["masteries"] = masteries(reg, pu, mastery_limit)
        else:
            out.pop("masteries", None)
    out["ok"] = True
    return out
