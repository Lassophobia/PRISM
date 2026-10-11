"""PRISM · 全区服战绩查询（SGP 直连）

## 这是什么

「查任意国服玩家战绩」这条链路的**全部后端逻辑**，零第三方依赖、零外部服务。
逆向依据见工作区 `峡谷查个分-全区服查战绩-实现原理.md`（§9 是 2026-10-05 的验通定论）。

## 链路（三步，全部用**本机客户端自带凭据**）

    ① 名称#尾标 ──LCU /lol-summoner/v1/alias/lookup──> puuid        ← ★ 跨大区可用
    ② puuid ──探测 8 个 SGP 集群──> 所属集群                          ← ★ 信号互斥，可靠
    ③ {集群}/match-history-query/v1/products/lol/player/{puuid}/SUMMARY ──> 完整战绩

## ★★★ 三条最贵的坑（都实测踩过，别改）

1. **SGP 只有 `match-history-query` 被授权** —— 段位/资产/英雄成就的服务（`leagues-ledge` /
   `champion-mastery-ledge` / `inventory-ledge` …）打过去**一律 403**。
   这个 403 是网关的「精确路径白名单」拒绝，**不是"路径不存在"**：
   在可用路径后面加一个 `/GARBAGE` 也是 403，而把 puuid 换成 `not-a-puuid` 会返回 **500**
   （说明网关已经转发给服务了）。换 UA、换 token 字段、换路径拼写**全都试过，无一有效**。
   ⇒ **跨区段位/资产/成就：不可自助，别在这上面浪费轮次。**

2. **错集群不报错，返回 `200 + games:[]`** —— 所以「探测」是唯一的反查手段，
   好消息是信号互斥：只有目标所属集群非空。

3. **LCU 侧所有「按 puuid」端点只认本机** —— 外区 puuid 的结果与
   **一个根本不存在的伪造 puuid** 逐字节相同（实测 md5 一致）。
   所以 `me_profile()` 只用来读**自己**，绝不能拿去当"查别人"的通道。

## 只读承诺

本模块**只发 GET 请求**，不注入、不改任何账号数据、不写 LCU。
`_cache` 只落一份「puuid → 集群」的本地映射（纯派生数据，可随时删）。
"""

from __future__ import annotations

import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import lcu

__all__ = [
    "CLUSTERS", "resolve", "probe_cluster", "matches", "cluster_of",
    "me_profile", "warm_cluster", "cache_info", "clear_cache",
]


CLUSTERS = {
    "HN1":   "https://hn1-k8s-sgp.lol.qq.com:21019",
    "HN10":  "https://hn10-k8s-sgp.lol.qq.com:21019",
    "NJ100": "https://nj100-sgp.lol.qq.com:21019",
    "GZ100": "https://gz100-sgp.lol.qq.com:21019",
    "CQ100": "https://cq100-sgp.lol.qq.com:21019",
    "TJ100": "https://tj100-sgp.lol.qq.com:21019",
    "TJ101": "https://tj101-sgp.lol.qq.com:21019",
    "BGP2":  "https://bgp2-k8s-sgp.lol.qq.com:21019",
}

UA_SGP = "LeagueOfLegendsClient/14.13.596.7996 (rcp-be-lol-match-history)"

_TIMEOUT = 12.0
_PROBE_WORKERS = 8

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

_LOCK = threading.Lock()
_MEM = {}
_CACHE_TTL = 6 * 3600.0
_CACHE_FILE = None


def _cache_path() -> Path:
    """`<家>\\query-cache.json`。拿不到就退到系统临时目录，绝不抛。

    ★ 2026-10-10：以前硬编码 `%LOCALAPPDATA%\\PRISM` ⇒ 家换盘会写错位置。
    """
    global _CACHE_FILE
    if _CACHE_FILE is not None:
        return _CACHE_FILE
    try:
        from . import paths as _paths
        p = Path(_paths.prism_home()) / "query-cache.json"
    except Exception:
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("TEMP") or "."
        p = Path(base) / "PRISM" / "query-cache.json"
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        p = Path(os.environ.get("TEMP") or ".") / "prism-query-cache.json"
    _CACHE_FILE = p
    return p


def _disk_load() -> dict:
    try:
        with open(_cache_path(), "r", encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _disk_save(d: dict) -> None:
    """原子写：先写 .tmp 再 replace，避免半截文件。失败静默（缓存不值得报错）。"""
    try:
        p = _cache_path()
        tmp = p.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)
        os.replace(tmp, p)
    except Exception:
        pass



def _token():
    """SGP 用的 Bearer。

    ★ 只认 `/entitlements/v1/token` 的 **accessToken**。实测：
      - `accessToken` → match-history 200
      - `token` / `idToken` → 403
      - `X-Riot-Entitlements-JWT` 或干脆不带 → 401
    """
    st, obj = lcu.get_json("/entitlements/v1/token")
    if st == 200 and isinstance(obj, dict):
        return obj.get("accessToken")
    return None



def resolve(full_id: str):
    """`名称#尾标` → `{"puuid","gameName","tagLine"}`；失败返回 None。

    ★ 走 LCU `alias/lookup`（Riot 全局 alias 服务）—— **跨大区可用**。
      ⚠️ 别换成 `/lol-summoner/v1/summoners?name=`，那条**只认本区**（外区 404），
         上一轮就是栽在它上面，得出了"跨区按名不可用"的错误结论。
    """
    if not full_id or "#" not in full_id:
        return None
    name, _, tag = full_id.rpartition("#")
    name, tag = name.strip(), tag.strip()
    if not name or not tag:
        return None
    st, obj = lcu.get_json(
        "/lol-summoner/v1/alias/lookup?gameName=%s&tagLine=%s"
        % (urllib.parse.quote(name), urllib.parse.quote(tag)))
    if st != 200 or not isinstance(obj, dict) or not obj.get("puuid"):
        return None
    alias = obj.get("alias") or {}
    return {
        "puuid": obj["puuid"],
        "gameName": alias.get("gameName") or name,
        "tagLine": alias.get("tagLine") or tag,
    }



def _sgp(cluster: str, path: str, token: str, timeout: float = _TIMEOUT):
    """打一次 SGP。返回 `(status, obj_or_None)`；任何异常都落成 status=0。"""
    host = CLUSTERS.get(cluster)
    if not host:
        return 0, None
    req = urllib.request.Request(host + path)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("User-Agent", UA_SGP)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def _summary_path(puuid: str, start: int, count: int, tag: str = "") -> str:
    """★ 参数名是 SGP 的 `startIndex`/`count`（LCU 那套是 begIndex/endIndex，混用报 400）。"""
    p = "/match-history-query/v1/products/lol/player/%s/SUMMARY?startIndex=%d&count=%d" % (
        urllib.parse.quote(puuid), max(0, int(start)), max(1, int(count)))
    if tag:
        p += "&tag=" + urllib.parse.quote(tag)
    return p


def _games(cluster: str, puuid: str, token: str, count: int = 1, start: int = 0):
    st, obj = _sgp(cluster, _summary_path(puuid, start, count), token)
    if st != 200 or not isinstance(obj, dict):
        return None
    return obj.get("games") or []



def probe_cluster(puuid: str, token: str = None, count: int = 1):
    """并发打 8 个集群，返回 `{"cluster","probes":{集群:场次}}`。

    ★ 为什么必须探测而不是"猜"：打错集群**不报错**，返回 `200 + games:[]`。
      所以「哪个集群非空」是唯一的归属信号，而它恰好是互斥的。
    """
    token = token or _token()
    if not token:
        return {"cluster": None, "probes": {}, "error": "拿不到 entitlements token（客户端没开？）"}

    def one(c):
        g = _games(c, puuid, token, count=count)
        return c, (len(g) if g is not None else -1)

    with ThreadPoolExecutor(max_workers=_PROBE_WORKERS) as ex:
        res = dict(ex.map(one, CLUSTERS))

    hit = [c for c in CLUSTERS if res.get(c, 0) > 0]
    cluster = hit[0] if hit else None
    if cluster:
        _remember(puuid, cluster)
    return {"cluster": cluster, "probes": res, "error": "" if cluster else "8 集群均无对局（新号 / 无战绩）"}


def _remember(puuid: str, cluster: str) -> None:
    with _LOCK:
        _MEM[puuid] = (cluster, time.time())
        d = _disk_load()
        d[puuid] = {"cluster": cluster, "ts": int(time.time())}
        if len(d) > 4000:
            for k in sorted(d, key=lambda k: d[k].get("ts", 0))[:len(d) - 4000]:
                d.pop(k, None)
        _disk_save(d)


def _cached(puuid: str):
    with _LOCK:
        rec = _MEM.get(puuid)
    if rec and time.time() - rec[1] < _CACHE_TTL:
        return rec[0]
    rec = _disk_load().get(puuid)
    if isinstance(rec, dict) and rec.get("cluster") and time.time() - rec.get("ts", 0) < _CACHE_TTL:
        with _LOCK:
            _MEM[puuid] = (rec["cluster"], rec.get("ts", time.time()))
        return rec["cluster"]
    return None


def warm_cluster(puuid: str) -> str | None:
    """拿集群：先查缓存，没有才探测。命中缓存时只用 **1 次** 请求验活。"""
    token = _token()
    if not token:
        return None
    c = _cached(puuid)
    if c and _games(c, puuid, token, count=1):
        return c
    r = probe_cluster(puuid, token=token, count=1)
    return r.get("cluster")


def cluster_of(puuid: str) -> str | None:
    """只读缓存（不探测）。UI 想"先显示可能的归属"时用。"""
    return _cached(puuid)



def matches(puuid: str, count: int = 20, start: int = 0, tag: str = "",
            cluster: str = None, resolve_cluster: bool = True):
    """取战绩。返回 `{"ok","cluster","count","games",...}`，永不抛异常。

    `games[]` 是 **SGP 原生格式**（`{metadata:{...}, json:{...}}`），原样透传给前端，
    所以字段名跟客户端一致，前端可以直接照客户端那套字段读。

    ★ 读战绩**不受「隐藏战绩 privacy:PRIVATE」限制**；`count` 可以突破 LCU 的 100 场上限。
    """
    token = _token()
    if not token:
        return {"ok": False, "error": "拿不到 entitlements token（客户端没开？）", "games": []}

    if not cluster and resolve_cluster:
        cluster = warm_cluster(puuid)
    if not cluster:
        return {"ok": False, "error": "没能确定所属集群（该玩家可能没有对局）", "games": []}

    g = _games(cluster, puuid, token, count=count, start=start)
    if g is None:
        if resolve_cluster:
            r = probe_cluster(puuid, token=token, count=1)
            cluster = r.get("cluster")
            if cluster:
                g = _games(cluster, puuid, token, count=count, start=start)
    if g is None:
        return {"ok": False, "error": "SGP 未返回数据", "cluster": cluster, "games": []}

    return {
        "ok": True, "cluster": cluster, "count": len(g), "start": start,
        "games": g, "error": "",
        "note": "SGP 原生格式；读战绩不受「隐藏战绩」开关限制",
    }



def _lcu_json(path: str):
    try:
        st, obj = lcu.get_json(path)
        return obj if st == 200 else None
    except Exception:
        return None


def me_profile():
    """读**本机自己**的等级 / 段位 / 英雄成就 / 资产。纯只读。

    ★ 这些端点**只认本机**（外区 puuid 的结果与伪造 puuid 逐字节相同），
      所以本函数**刻意不接受 puuid 参数** —— 想"查别人段位"是做不到的，
      在这里留个口子只会让上层误以为能做。
    """
    out = {"ok": True, "level": None, "summoner": None, "rank": None,
           "mastery": [], "masteryScore": None, "champions": None, "skins": None,
           "error": ""}

    sess = _lcu_json("/lol-login/v1/session") or {}
    puuid = sess.get("puuid") or ""
    out["puuid"] = puuid

    lv = _lcu_json("/lol-summoner-profiles/v1/get-summoner-level-view")
    if isinstance(lv, dict):
        out["level"] = lv.get("level")

    if puuid:
        s = _lcu_json("/lol-summoner/v2/summoners/puuid/" + urllib.parse.quote(puuid))
        if isinstance(s, dict):
            out["summoner"] = {
                "gameName": s.get("gameName"), "tagLine": s.get("tagLine"),
                "displayName": s.get("displayName"), "summonerLevel": s.get("summonerLevel"),
                "profileIconId": s.get("profileIconId"), "accountId": s.get("accountId"),
                "puuid": s.get("puuid"),
            }

    if puuid:
        rk = _lcu_json("/lol-ranked/v1/ranked-stats/" + urllib.parse.quote(puuid))
        if isinstance(rk, dict):
            qm = rk.get("queueMap") or rk.get("queues") or {}
            out["rank"] = {
                "queueMap": qm,
                "highestCurrentSeasonReachedTierSR": rk.get("highestCurrentSeasonReachedTierSR"),
                "highestPreviousSeasonEndRank": rk.get("highestPreviousSeasonEndRank"),
                "currentSeasonSplitPoints": rk.get("currentSeasonSplitPoints"),
                "shouldShowIndicator": rk.get("shouldShowIndicator"),
            }

    if puuid:
        ms = _lcu_json("/lol-champion-mastery/v1/%s/champion-mastery" % urllib.parse.quote(puuid))
        if isinstance(ms, list):
            out["mastery"] = ms
    sc = _lcu_json("/lol-champion-mastery/v1/local-player/champion-mastery-score")
    if isinstance(sc, (int, float)):
        out["masteryScore"] = int(sc)

    if puuid:
        inv = _inventory(puuid, ["CHAMPION", "CHAMPION_SKIN", "CHAMPION_SKIN_VARIANT",
                                 "WARD_SKIN", "EMOTE", "STATSTONE", "SUMMONERICON"])
        out["champions"] = inv.get("CHAMPION")
        out["skins"] = inv.get("CHAMPION_SKIN")
        out["assets"] = inv

    return out


def _inventory(puuid: str, types):
    """★ LCU 向量参数的传法（踩过）——

    正确形态是 **URL 里的 JSON 数组字面量**，URL 编码后 `inventoryTypes=%5B%22CHAMPION%22%5D`。
    不是逗号串（`CHAMPION,CHAMPION_SKIN`）、不是重复参数（`a=1&a=2`）、也不是 body ——
    这三种**全部**报 `Couldn't assign value to 'inventoryTypes' of type vector because the input not a collection`。
    空值 `?inventoryTypes=` 合法，返回 `200 []`。

    同一条规则适用于所有 `Vector[String]` 参数（如 `challenges/.../players?puuids=[...]`）。
    例外：`POST /lol-champion-mastery/v1/scouting` 的向量在 **body** 里，且必须是**裸数组**。
    """
    if not types:
        return {}
    grouped = {}
    chunk = 6
    for i in range(0, len(types), chunk):
        part = types[i:i + chunk]
        q = urllib.parse.quote(json.dumps(part, separators=(",", ":")))
        arr = _lcu_json("/lol-inventory/v1/players/%s/inventory?inventoryTypes=%s"
                        % (urllib.parse.quote(puuid), q))
        if not isinstance(arr, list):
            continue
        for it in arr:
            if isinstance(it, dict) and it.get("inventoryType"):
                grouped.setdefault(it["inventoryType"], []).append(it)
    return grouped



def cache_info() -> dict:
    d = _disk_load()
    return {"file": str(_cache_path()), "entries": len(d),
            "memory": len(_MEM), "ttlSeconds": int(_CACHE_TTL)}


def clear_cache() -> dict:
    with _LOCK:
        n = len(_MEM)
        _MEM.clear()
    _disk_save({})
    return {"ok": True, "clearedMemory": n}



def _fmt_game(g, puuid=""):
    md = g.get("metadata") or {}
    js = g.get("json") or {}
    me = {}
    for p in (js.get("participants") or []):
        if not puuid or p.get("puuid") == puuid:
            me = p
            break
    return "%-24s q=%-6s %-14s %s/%s/%s %s (%s)" % (
        md.get("match_id"), js.get("queueId"), me.get("championName", "?"),
        me.get("kills", 0), me.get("deaths", 0), me.get("assists", 0),
        "胜" if me.get("win") else "负", js.get("gameMode"))


def _main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        print("用法：python -m prism_inject.query <名称#尾标> [场次]")
        return 0

    if argv[0] == "--cache":
        print(json.dumps(cache_info(), ensure_ascii=False, indent=2))
        return 0
    if argv[0] == "--me":
        print(json.dumps(me_profile(), ensure_ascii=False, indent=2))
        return 0

    full = argv[0]
    n = int(argv[1]) if len(argv) > 1 else 5
    r = resolve(full)
    print("① resolve   :", json.dumps(r, ensure_ascii=False))
    if not r:
        return 1
    puuid = r["puuid"]
    c = warm_cluster(puuid)
    print("② cluster   :", c)
    if not c:
        return 1
    m = matches(puuid, count=n, cluster=c, resolve_cluster=False)
    print("③ matches   : ok=%s count=%s" % (m.get("ok"), m.get("count")))
    for g in (m.get("games") or []):
        print("   ", _fmt_game(g, puuid))
    return 0


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv[1:]))
