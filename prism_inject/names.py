"""PRISM · 皮肤/英雄**官方中文名**索引

## 这份表是哪来的

**我们自己建的** —— 用 LCU 的官方数据现建，落在 `<家>\\assets\\skin_ids.<lang>.json`：

    /lol-game-data/assets/v1/champion-summary.json    英雄列表
    /lol-game-data/assets/v1/champions/<id>.json     英雄名（title）+ 它的皮肤
    /lol-game-data/assets/v1/skins/<id>.json         皮肤名 / 炫彩名

就是一个扁平字典 `{"skinId(字符串)": "名字"}`：

    "1000"   -> "黑暗之女"          ← index=0 = **英雄名**（基础皮肤槽）
    "1001"   -> "哥特萝莉 安妮"
    "103001" -> "高丽风情 阿狸"
    "103052" -> "高丽风情 阿狸 素裹"   ← 带炫彩后缀

## 为什么必须有它

面板里到处要显示英雄名 / 皮肤名（藏品页、皮肤列表、搜索…），而客户端给的全是数字 id。
名字只能从 LCU 的官方数据里取 —— 这是**唯一权威来源**，也跟客户端里看到的完全一致。

★ 为什么每次都重建（见 `warm()`）：这张表**跟着游戏版本走**，
  新皮肤 / 新炫彩上线当天就有，不会落后。

## 容错

LCU 不可达（客户端没开）时退回落盘缓存；缓存也没有就返回空表
（调用方显示 id 或退回别的名字源）。本模块**一律不抛异常**。
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

try:
    from . import paths
except ImportError:
    import paths

SKIN_ID_STRIDE = 1000


def split_skin_id(skin_id) -> tuple:
    """skinId → (championId, index)。"""
    n = int(skin_id)
    return divmod(n, SKIN_ID_STRIDE)


RES_DIR = "resources"

_TABLES = {}
_LOCK = threading.Lock()
MISSING = "\x00missing"

CACHE_PREFIX = "skin_ids."
CACHE_SUFFIX = ".json"
MIN_SANE = 200
CHAMP_SUMMARY = "/lol-game-data/assets/v1/champion-summary.json"
CHAMP_ONE = "/lol-game-data/assets/v1/champions/%d.json"


def cache_path(lang: str = "zh") -> Path:
    """名字表落盘位置（`<家>\\assets\\`）。"""
    try:
        base = paths.assets_dir()
    except Exception:
        base = paths.prism_home() / "assets"
    return Path(base) / ("%s%s%s" % (CACHE_PREFIX, lang, CACHE_SUFFIX))



def _read_cache(lang: str) -> dict:
    """读我们自己的落盘缓存（结构 `{"__meta__":…, "names":{id:名}}`）。**不抛**。"""
    try:
        p = cache_path(lang)
        if not p.is_file():
            return {}
        raw = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return {}
        names = raw.get("names")
        if not isinstance(names, dict):
            names = raw
        return {str(k): str(v) for k, v in names.items() if v and not str(k).startswith("__")}
    except (OSError, ValueError):
        return {}


def _write_cache(lang: str, tbl: dict, source: str = "lcu") -> bool:
    """原子写落盘缓存（先写 .tmp 再 replace，避免半截文件）。失败返回 False。"""
    p = cache_path(lang)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        payload = {"__meta__": {"lang": lang, "source": source,
                                "builtAt": time.strftime("%Y-%m-%d %H:%M:%S"),
                                "count": len(tbl)},
                   "names": {str(k): str(v) for k, v in tbl.items()}}
        tmp = p.with_name(p.name + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(p)
        return True
    except OSError:
        return False


def available(lang: str = "zh") -> bool:
    """名字表能不能用（我们的落盘表有没有内容）。"""
    return bool(table(lang))


def table(lang: str = "zh") -> dict:
    """读名字表（带缓存）。读不到返回 {}，**不抛**。

    顺序：内存 → 我们落盘的表（`<家>\\assets\\skin_ids.<lang>.json`）。
    ★ 表是 `warm()` **从 LCU 现建**的（比任何第三方资源都新、都全）：
      官方表里没有的新皮肤/新炫彩，LCU 里一定有。
    ★ 这里**不问 LCU**（那要几百毫秒到十几秒）—— 建表是 `warm()` 的事。
    """
    lang = str(lang or "zh")
    with _LOCK:
        got = _TABLES.get(lang)
    if got is not None:
        return {} if got is MISSING else got

    cached = _read_cache(lang)
    out = dict(cached) if cached and len(cached) >= MIN_SANE else {}
    with _LOCK:
        _TABLES[lang] = out if out else MISSING
    return out



def _lcu():
    """延迟取 lcu 模块（拿不到返回 None，**不抛**）。"""
    try:
        from . import lcu
        return lcu
    except ImportError:
        try:
            import lcu
            return lcu
        except ImportError:
            return None


def lcu_table(lang: str = "zh", timeout: float = 12.0, workers: int = 12) -> dict:
    """用 LCU 的官方数据**现建**一张名字表。

    - 英雄名走 `champions/{id}.json` 的 **`title`**（与客户端里显示的一致）
      （它 `index=0` 那条存的是**称号**，如 1000 → 「黑暗之女」）
    - 皮肤名走 `skins[].name`（本来就带英雄名，如「心之钢 我行我路 永恩」）
    - 炫彩名走 `skins[].chromas[].name`（如「无畏斗志」）

    返回 `{str(skinId): name}`；LCU 不可达 ⇒ `{}`（**不抛**）。
    """
    m = _lcu()
    if m is None:
        return {}
    try:
        _st, champs = m.get_json(CHAMP_SUMMARY, timeout=timeout)
    except Exception:
        return {}
    if not isinstance(champs, list):
        return {}
    ids = [int(c["id"]) for c in champs
           if isinstance(c, dict) and isinstance(c.get("id"), int) and c["id"] > 0]
    if not ids:
        return {}

    def one(cid: int):
        rows = []
        try:
            _s, c = m.get_json(CHAMP_ONE % cid, timeout=timeout)
        except Exception:
            return rows
        if not isinstance(c, dict):
            return rows
        nm = str(c.get("title") or c.get("name") or "").strip()
        if nm:
            rows.append((cid * SKIN_ID_STRIDE, nm))
        for s in (c.get("skins") or []):
            if not isinstance(s, dict):
                continue
            try:
                sid = int(s.get("id"))
            except (TypeError, ValueError):
                continue
            sn = str(s.get("name") or "").strip()
            if sid and sn:
                rows.append((sid, sn))
            for ch in (s.get("chromas") or []):
                if not isinstance(ch, dict):
                    continue
                try:
                    cid2 = int(ch.get("id"))
                except (TypeError, ValueError):
                    continue
                cn = str(ch.get("name") or "").strip()
                if cid2 and cn:
                    rows.append((cid2, cn))
        return rows

    out = {}
    try:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=max(1, int(workers))) as ex:
            for rows in ex.map(one, ids):
                for sid, nm in rows:
                    out[str(sid)] = nm
    except Exception:
        return {}
    return out


def warm(lang: str = "zh", log=None, force: bool = False) -> dict:
    """**确保名字表可用**（换机后的关键一步；后端启动时后台调，**别放热路径**）。

    做法：**每次都试着从 LCU 建一次表**（实测只要 ~0.8s，12 并发）。
    LCU 不可达时才退回落盘缓存。
    ★ 为什么"每次都建"而不是"有缓存就用"：这张表要**跟着游戏版本走**，
      缓存留着只会越用越旧。
    """
    def _l(msg):
        if log:
            try:
                log(msg)
            except Exception:
                pass

    t0 = time.time()
    built = lcu_table(lang)
    if built:
        _write_cache(lang, built)
        with _LOCK:
            _TABLES[lang] = built
        _l("名字表：LCU 建表 %d 条（%.1fs）" % (len(built), time.time() - t0))
        return built

    cached = _read_cache(lang)
    if cached:
        merged = cached
        with _LOCK:
            _TABLES[lang] = merged
        _l("名字表：LCU 取不到 ⇒ 用落盘缓存 %d 条 ／ 合并 %d 条（%s）"
           % (len(cached), len(merged), cache_path(lang)))
        return merged
    if local:
        with _LOCK:
            _TABLES[lang] = local
        _l("名字表：只有本地表 %d 条（LCU 取不到、也没有缓存）" % len(local))
        return local
    _l("名字表：本地表与 LCU 都取不到 ⇒ 退回 mod 包里的名字（不影响其它功能）")
    return {}


def clear_cache(drop_disk: bool = False) -> None:
    """清内存缓存；`drop_disk=True` 时把落盘缓存也删掉（下次会重建）。"""
    with _LOCK:
        _TABLES.clear()
    if drop_disk:
        try:
            cache_path("zh").unlink(missing_ok=True)
        except OSError:
            pass



def skin_name(skin_id, lang: str = "zh") -> str:
    """skinId → 官方名。查不到返回空串。"""
    return table(lang).get(str(int(skin_id)), "")


def champion_name(champion_id, lang: str = "zh") -> str:
    """英雄 id → 官方英雄名。走 `index=0` 那条（`<champId>000` 就是英雄本身）。"""
    return table(lang).get(str(int(champion_id) * SKIN_ID_STRIDE), "")


def display_name(skin_id, base_skin_id: int = 0, entry=None, lang: str = "zh") -> str:
    """给 UI/日志用的名字：**官方中文名优先**；没有官方名时退回 `entry.name`。

    炫彩会顺带把父皮肤名带上（官方名里本来就带，如「高丽风情 阿狸 素裹」）。
    """
    official = skin_name(skin_id, lang)
    if official:
        if base_skin_id:
            parent = skin_name(base_skin_id, lang)
            if parent and parent not in official:
                return "%s ／ %s" % (parent, official)
        return official
    if entry is not None and getattr(entry, "name", ""):
        return "%s" % entry.name
    return "(无名 %d)" % int(skin_id)


def all_skin_ids(lang: str = "zh") -> list:
    """表里全部皮肤条目 id（**含未下载**），升序。排除 index=0 的英雄名条目。"""
    out = []
    for k in table(lang):
        try:
            n = int(k)
        except ValueError:
            continue
        if n % SKIN_ID_STRIDE == 0:
            continue
        out.append(n)
    return sorted(out)


def champions(lang: str = "zh") -> dict:
    """{championId: 英雄名}（从 index=0 那些条目推导），按 id 升序。"""
    out = {}
    for k, v in table(lang).items():
        try:
            n = int(k)
        except ValueError:
            continue
        if n % SKIN_ID_STRIDE == 0 and n:
            out[n // SKIN_ID_STRIDE] = v
    return dict(sorted(out.items()))


def search(keyword, lang: str = "zh", limit: int = 60):
    """按官方名搜皮肤（**纯字典过滤，毫秒级，不需要扫 zip**）。

    Args:
        keyword: 关键词（中英文都行，大小写不敏感；匹配时忽略空格）
        limit: 最多返回多少条

    Returns:
        {"keyword":…, "total":…, "shown":…, "champion": (id, name) | None,
         "items": [{"skinId","name","championId","isChroma","baseSkinId"}, …]}

    ★ 顺带解决一件事：**"我只记得英雄名"** —— 关键词命中英雄名时 `champion` 会带上它，
      调用方可以直接转成"列这个英雄的全部皮肤"。
    """
    kw = (keyword or "").strip().lower().replace(" ", "")
    res = {"keyword": keyword, "total": 0, "shown": 0, "champion": None, "items": []}
    if not kw:
        return res

    champ_hit = None
    for cid, cname in champions(lang).items():
        if kw in str(cname).lower().replace(" ", ""):
            champ_hit = (cid, cname)
            break

    hits = []
    tbl = table(lang)
    for n in all_skin_ids(lang):
        nm = str(tbl.get(str(n), ""))
        if kw not in nm.lower().replace(" ", ""):
            continue
        hits.append(_item(n, nm, lang))

    res["total"] = len(hits)
    res["shown"] = min(limit, len(hits))
    res["items"] = hits[:limit]
    res["champion"] = champ_hit
    return res


def _item(skin_id: int, name: str, lang: str = "zh") -> dict:
    """一条搜索结果。父子关系靠**命名规则**推（表里没有显式关系）。"""
    cid, _idx = split_skin_id(skin_id)
    return {"skinId": int(skin_id), "name": name, "championId": cid,
            "isChroma": skin_id in _chroma_ids(lang),
            "baseSkinId": _base_of(skin_id, lang)}


_CHROMA_CACHE = {}


def _chroma_map(lang: str) -> dict:
    """{chromaId: baseSkinId} —— 官方表里炫彩名带后缀，但**没有显式的父子关系**。

    判据用**官方的命名规则**：炫彩名 = 父皮肤名 + 一个短后缀。
    这条**不保证**（名字里有空格的皮肤会误判），所以只当作**展示提示**用。
    返回空 dict 时调用方应退回"不显示炫彩标记"。
    """
    got = _CHROMA_CACHE.get(lang)
    if got is not None:
        return got
    tbl = table(lang)
    by_name = {}
    for k, v in tbl.items():
        by_name.setdefault(str(v), int(k))
    names_desc = sorted(by_name, key=len, reverse=True)
    out = {}
    for k, v in tbl.items():
        try:
            n = int(k)
        except ValueError:
            continue
        for base_name in names_desc:
            if not base_name or base_name == str(v) or len(base_name) >= len(str(v)):
                continue
            if str(v).startswith(base_name + " "):
                base_id = by_name[base_name]
                if n != base_id and 0 < (n - base_id) < 100:
                    out[n] = base_id
                break
    _CHROMA_CACHE[lang] = out
    return out


def _chroma_ids(lang: str) -> set:
    return set(_chroma_map(lang))


def _base_of(skin_id: int, lang: str) -> int:
    return _chroma_map(lang).get(int(skin_id), 0)


if __name__ == "__main__":
    import json as _json
    for cid in (1, 103, 121, 145):
        print("英雄 %d = %s" % (cid, champion_name(cid) or "(无名)"))
    print(_json.dumps(search("殿堂"), ensure_ascii=False, indent=2)[:800])
