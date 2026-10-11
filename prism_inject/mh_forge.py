"""PRISM · 战绩伪造（SGP 单局 → LCU `/lol-match-history` 响应形状）

## 为什么需要它

客户端「对局记录」页读的是 LCU：

    GET /lol-match-history/v1/products/lol/{puuid|current-summoner}/matches

但 **LCU 侧按 puuid 也只认本机**（实测：current-summoner / 目标 puuid / 无关 puuid
三者返回逐字节相同）。所以数据只能从 SGP 拿（`query.py`，任意玩家），
再**转成 LCU 的形状**塞回客户端 —— 纯本机显示层，不改任何账号数据。

## 形状差异（实测，别凭空改）

| | LCU | SGP（match-v5 风格） |
|---|---|---|
| 列表位置 | `resp.games.games[]` | `games[].json` |
| 参与者 | `participants[]` 只有 core 5 键 + `stats{}` + `timeline{}` | 全部**平铺**在参与者上 |
| 身份 | 单独 `participantIdentities[]` | 无（合并进了参与者） |
| `gameCreationDate` | ISO 字符串 | 无（只有毫秒 `gameCreation`） |
| 符文 | `perk0..perk5` + `perk*Var1..3` + `perkPrimaryStyle/perkSubStyle` | `perks{perkIds[],perkStyle,perkSubStyle}` |
| `teams[]` | 有 | 有（结构兼容，直接搬） |

★ 字段名两边**完全一致**（kills/deaths/assists/item0..6/goldEarned/totalMinionsKilled…），
  所以本模块做的是「搬运 + 嵌套 + 补默认」，**不是翻译**。

## 只读承诺

本模块是**纯函数**，不发网络、不写盘、不碰账号。
"""

from __future__ import annotations

import datetime

__all__ = ["LCU_STATS_KEYS", "LCU_GAME_KEYS", "to_lcu_game", "to_lcu_matches",
           "local_row", "mates"]
LCU_GAME_KEYS = [
    "endOfGameResult", "gameCreation", "gameCreationDate", "gameDuration", "gameId",
    "gameMode", "gameModeMutators", "gameType", "gameVersion", "mapId",
    "participantIdentities", "participants", "platformId", "queueId", "seasonId", "teams",
]

LCU_STATS_KEYS = [
    "assists", "causedEarlySurrender", "causedGameEndFromIGNBSurrender", "champLevel",
    "combatPlayerScore", "damageDealtToObjectives", "damageDealtToTurrets",
    "damageSelfMitigated", "deaths", "doubleKills", "earlySurrenderAccomplice",
    "firstBloodAssist", "firstBloodKill", "firstInhibitorAssist", "firstInhibitorKill",
    "firstTowerAssist", "firstTowerKill", "gameEndedInEarlySurrender",
    "gameEndedInIGNBSurrender", "gameEndedInSurrender", "goldEarned", "goldSpent",
    "inhibitorKills", "item0", "item1", "item2", "item3", "item4", "item5", "item6",
    "killingSprees", "kills", "largestCriticalStrike", "largestKillingSpree",
    "largestMultiKill", "longestTimeSpentLiving", "magicDamageDealt",
    "magicDamageDealtToChampions", "magicalDamageTaken", "neutralMinionsKilled",
    "neutralMinionsKilledEnemyJungle", "neutralMinionsKilledTeamJungle",
    "objectivePlayerScore", "participantId", "pentaKills",
    "perk0", "perk0Var1", "perk0Var2", "perk0Var3",
    "perk1", "perk1Var1", "perk1Var2", "perk1Var3",
    "perk2", "perk2Var1", "perk2Var2", "perk2Var3",
    "perk3", "perk3Var1", "perk3Var2", "perk3Var3",
    "perk4", "perk4Var1", "perk4Var2", "perk4Var3",
    "perk5", "perk5Var1", "perk5Var2", "perk5Var3", "perkPrimaryStyle", "perkSubStyle",
    "physicalDamageDealt", "physicalDamageDealtToChampions", "physicalDamageTaken",
    "playerAugment1", "playerAugment2", "playerAugment3", "playerAugment4",
    "playerAugment5", "playerAugment6",
    "playerScore0", "playerScore1", "playerScore2", "playerScore3", "playerScore4",
    "playerScore5", "playerScore6", "playerScore7", "playerScore8", "playerScore9",
    "playerSubteamId", "quadraKills", "roleBoundItem", "sightWardsBoughtInGame",
    "subteamPlacement", "teamEarlySurrendered", "timeCCingOthers", "totalDamageDealt",
    "totalDamageDealtToChampions", "totalDamageTaken", "totalHeal", "totalMinionsKilled",
    "totalPlayerScore", "totalScoreRank", "totalTimeCrowdControlDealt", "totalUnitsHealed",
    "tripleKills", "trueDamageDealt", "trueDamageDealtToChampions", "trueDamageTaken",
    "turretKills", "unrealKills", "visionScore", "visionWardsBoughtInGame",
    "wardsKilled", "wardsPlaced", "wasSevereTransgressor", "win",
]

_BOOL_STATS = {
    "causedEarlySurrender", "causedGameEndFromIGNBSurrender", "earlySurrenderAccomplice",
    "firstBloodAssist", "firstBloodKill", "firstInhibitorAssist", "firstInhibitorKill",
    "firstTowerAssist", "firstTowerKill", "gameEndedInEarlySurrender",
    "gameEndedInIGNBSurrender", "gameEndedInSurrender", "teamEarlySurrendered",
    "wasSevereTransgressor", "win",
}

_LCU_GAME_CARRY = (
    "endOfGameResult", "gameCreation", "gameDuration", "gameId", "gameMode",
    "gameModeMutators", "gameType", "gameVersion", "mapId", "platformId",
    "queueId", "seasonId",
)


def _iso(ms) -> str:
    """毫秒时间戳 → LCU 那种 ISO 串（`2026-10-04T15:17:24.393Z`）。"""
    try:
        ms = float(ms)
    except (TypeError, ValueError):
        return ""
    try:
        return datetime.datetime.fromtimestamp(ms / 1000.0, datetime.timezone.utc) \
            .strftime("%Y-%m-%dT%H:%M:%S.") + ("%03dZ" % int(ms % 1000))
    except (OverflowError, OSError, ValueError):
        return ""


def _default(key: str):
    if key in _BOOL_STATS:
        return False
    return 0


def _stats_of(p: dict) -> dict:
    """把平铺的 SGP 参与者折成 LCU 的 stats{}（按 118 键白名单，缺的补默认）。"""
    st = {k: p[k] for k in LCU_STATS_KEYS if k in p}
    perks = p.get("perks") or {}
    ids = perks.get("perkIds") or []
    for i in range(6):
        st["perk%d" % i] = ids[i] if i < len(ids) else 0
        for v in (1, 2, 3):
            st["perk%dVar%d" % (i, v)] = 0
    if perks.get("perkStyle") is not None:
        st["perkPrimaryStyle"] = perks.get("perkStyle")
    if perks.get("perkSubStyle") is not None:
        st["perkSubStyle"] = perks.get("perkSubStyle")
    for k in LCU_STATS_KEYS:
        st.setdefault(k, _default(k))
    return st


def _identity(pid, p: dict, me: dict = None, target_puuid: str = "",
              target_name: str = "") -> dict:
    """SGP 参与者 → LCU participantIdentities[] 的一条（★ 只留被查询者，见 to_lcu_game）。

    ★★★ `me` / `target_puuid`：把**目标那一行**换成「本机身份」。
    为什么还要换（2026-10-06 三轮实测的最终解释）：
      · 真实 LCU 的**列表**响应里 `participants` / `participantIdentities` **只有 1 条**
        —— 永远是"被查询的那个人"（直连 LCU 实测：正常对局 21/21 都是 (1,1)，见 `_keep_subject_only`）。
        本机去查自己的历史 ⇒ 那一条就是**本机身份**（puuid/summonerId = 本机，accountId 全是 0）。
      · 所以我们的单条也必须"长得像本机"：`puuid/summonerId/accountId` 换成本机的；
        而 `gameName/tagLine` 保留**目标的** —— 因为客户端眼里的"我"这个名字早已被
        `patchSelfText/patchChatText` 改成了目标的名字，两者必须自洽，才与真实响应同形。
    匹配优先级：puuid → gameName（兜底，防 puuid 格式/大区差异）。
    ★ 注意：**不是**因为"客户端按 puuid 找哪一行是我"（这一条已被证伪：注入身份后界面不变），
      而是因为真实响应里那一条本来就带本机身份 —— 伪装要伪装全套。
    """
    game_name = p.get("riotIdGameName") or p.get("summonerName") or ""
    tag = p.get("riotIdTagline") or ""
    pu = p.get("puuid") or ""
    sid = p.get("summonerId") or 0
    aid = 0
    is_target = False
    if target_puuid and pu and pu == target_puuid:
        is_target = True
    elif target_name and game_name and game_name == target_name:
        is_target = True
    if is_target and me:
        pu = me.get("puuid") or pu
        sid = me.get("summonerId") or sid
        aid = me.get("accountId") or 0
    return {
        "participantId": pid,
        "player": {
            "accountId": aid,
            "currentAccountId": aid,
            "currentPlatformId": "",
            "gameName": game_name,
            "matchHistoryUri": "",
            "platformId": "",
            "profileIcon": p.get("profileIcon") or 0,
            "puuid": pu,
            "summonerId": sid,
            "summonerName": p.get("summonerName") or "",
            "tagLine": tag,
        },
    }


def _subject_index(idents: list, me_puuid: str, target_puuid: str,
                   target_name: str) -> int:
    """在 identities 里找"被查询的那个人"（= 目标）的下标，找不到返回 -1。

    顺序：注入后的**本机 puuid** → 目标 puuid → 目标 gameName（兜底）。
    ★ 先查本机：`_identity()` 若已把目标那条换成本机身份，按目标 puuid 就再也找不到了。
    """
    for key in (me_puuid, target_puuid):
        if not key:
            continue
        for k, x in enumerate(idents):
            if ((x.get("player") or {}).get("puuid") or "") == key:
                return k
    if target_name:
        for k, x in enumerate(idents):
            if ((x.get("player") or {}).get("gameName") or "") == target_name:
                return k
    return -1


def _keep_subject_only(parts: list, idents: list, me_puuid: str,
                       target_puuid: str, target_name: str,
                       tgt_idx: int = -1) -> bool:
    """★ 只保留"被查询的那个人"那一行 —— **照抄真实 LCU 列表响应的形状**。

    【为什么】（2026-10-06 三轮实测，★ 订正前两版结论）
    直连 LCU（`prism_inject/lcu.py`，绕过所有钩子）取"正常对局"地面真值：
      `/lol-match-history/v1/products/lol/{puuid}/matches` 的
      `participants` 与 `participantIdentities` **长度都 = 1** —— 只有被查询的那个人，
      且 pid/teamId 是他在那一局的**自然值**（目标账号 21 局全是 MATCHED_GAME/KIWI：
      长度 (1,1) 21/21，pid = {2×5,3×7,4×2,7×2,8×2,9×3}，team = {100×14,200×7}）。
    ⇒ 客户端"取 `participants[0]`"之所以永远正确，**是因为数组里只有"我"一个人**，
      不是 LCU 把"我"重排到第一位。
    ⚠️ 前两版结论都错：①"客户端按 puuid/summonerId 匹配"（注入身份后界面不变 ⇒ 证伪）；
      ②"客户端按位置取 [0]，所以真实 LCU 一定把我排第一位 ⇒ 把目标提到下标 0"
      （形状对不上：真值根本没有 10 个人；而且重排会破坏队伍分块 ⇒ 详情页那样做是错的，见判据 37）。
    本机账号不能当基准：它 21 局里 20 局是**训练模式**（CUSTOM_GAME/PRACTICETOOL，queueId 3140），
    pid 恒 1 / team 恒 100 是练习模式的产物。

    ★ 只删不挪：`participantId`/`teamId` 保持**自然值**（与真值一致），
      也更不会影响按 pid 索引的 `/game-timelines/{id}`。
    """
    t = tgt_idx if (isinstance(tgt_idx, int) and 0 <= tgt_idx < len(idents)) \
        else _subject_index(idents, me_puuid, target_puuid, target_name)
    if t < 0:
        return False
    del idents[:t]
    del idents[1:]
    if t < len(parts):
        del parts[:t]
        del parts[1:]
    return True


def local_row(payload: dict, me_puuid: str) -> int:
    """自检：伪造后的响应里，**认得出"我"的那一行** 的 participantId（找不到返回 0）。

    用途：后端把它放进 `/api/q/mh` 的响应（字段 `meRow`）当作**运行时判据** ——
    只要它不是 0，客户端就能正确认出"这局我玩的是哪一行"。
    """
    try:
        games = ((payload or {}).get("games") or {}).get("games") or []
        for pid in (games[0].get("participantIdentities") or []):
            if ((pid.get("player") or {}).get("puuid") or "") == (me_puuid or ""):
                return pid.get("participantId") or 0
    except Exception:
        pass
    return 0


REMARK_MAX_DUR = 300


def _target_of(g: dict, target_puuid: str, target_name: str):
    """在一局里找目标那条 participant + 他所在队伍的胜负。返回 (participant|None, win|None)。"""
    tgt = None
    for p in (g.get("participants") or []):
        if target_puuid and (p.get("puuid") or "") == target_puuid:
            tgt = p
            break
        if target_name and (p.get("riotIdGameName") or p.get("summonerName") or "") == target_name:
            tgt = p
            break
    if not tgt:
        return None, None
    win = None
    for t in (g.get("teams") or []):
        if t.get("teamId") == tgt.get("teamId"):
            win = bool(t.get("win"))
    return tgt, win


def mates(sgp_games, target_puuid: str = "", target_name: str = "", min_team: int = 2,
          limit: int = 0):
    """从 SGP 局列表统计「常一起玩（开黑）的人」。**纯函数，离线可测。**

    ★ 五条规则（每条都有理由，别乱改）：
      1. **只算同队**：`teamId` 相同才算开黑；同局但在对面 = 对手 —— 只记 `sameGame` 供参考。
         （不区分的话，随机匹配到的对手会被算成"好友"，榜单直接变垃圾。）
      2. **< 300 秒的局整局跳过**（重开/中断，胜负无意义。实测那局 112s 的重开，
         `endOfGameResult` 依然是 `GameComplete`、team200 照样被记 `False` ⇒ 只能按时长判）。
      3. 胜率 = 同队赢的局 / 同队局数；同队 0 局 ⇒ `winRate = None`
         （**不许把"没输过"当成 0 = 全输**，也不许把 None 当 1 用）。
      4. 名字/头像取**最近一次**同队那局的值（改名后以最新为准；同名不同人靠 puuid 区分）。
      5. ★ **`min_team` 默认 2**（已定）：**只同队过 1 局的直接不计入** ——
         那不是"搭档"，是随机匹配撞上的路人。★ 这条是**统计层**的过滤，
         和 UI 的"只看同队 ≥3 局"是两回事（后者只是显示开关，数据还在）。
      ★ `limit`：只统计**最近 N 局**（0 = 不限）。要「50 局 / 100 局」两档，
        由后端一次取满 100 局、分别用 `limit=50` / `limit=100` 算两套 ⇒ 切换零延迟。

    ★ 排序 = (**同队场次 desc**, 胜率 desc, 同局场次 desc, 名字 asc)。
      为什么**不**把胜率放第一：只一起打过 1 局还赢了的人胜率 100%，会骑在
      "一起打了 16 局"的真搭档头上 —— 那是噪声。场次是"关系强度"，胜率是"这关系打得怎么样"。
      排序里带**名字兜底**是为了**确定性**，否则同值项每次刷新顺序乱跳。

    返回 `(list, meta)`：
      list 每项 `{puuid, gameName, tagLine, profileIcon, sameTeam, wins, losses, winRate, sameGame}`
      meta `{games, counted, skipped, targetWins, targetLosses, limit, minTeam}`
    """
    agg = {}
    meta = {"games": 0, "counted": 0, "skipped": 0, "targetWins": 0, "targetLosses": 0,
            "limit": int(limit or 0), "minTeam": max(1, int(min_team or 1))}
    src = list(sgp_games or [])
    if limit and limit > 0:
        src = src[:int(limit)]
    for g in src:
        j = g.get("json") if isinstance(g, dict) and "json" in g else g
        if not isinstance(j, dict):
            continue
        meta["games"] += 1
        try:
            dur = float(j.get("gameDuration") or 0)
        except (TypeError, ValueError):
            dur = 0
        if dur and dur < REMARK_MAX_DUR:
            meta["skipped"] += 1
            continue
        tgt, win = _target_of(j, target_puuid, target_name)
        if not tgt:
            continue
        meta["counted"] += 1
        if win is True:
            meta["targetWins"] += 1
        elif win is False:
            meta["targetLosses"] += 1
        tid = tgt.get("teamId")
        ts = j.get("gameCreation") or 0
        for p in (j.get("participants") or []):
            pu = p.get("puuid") or ""
            if not pu or pu == (tgt.get("puuid") or "") or pu == target_puuid:
                continue
            e = agg.get(pu)
            if e is None:
                e = agg[pu] = {"puuid": pu, "sameTeam": 0, "wins": 0, "losses": 0,
                               "sameGame": 0, "lastTs": 0, "gameName": "", "tagLine": "",
                               "profileIcon": 0}
            e["sameGame"] += 1
            if p.get("teamId") != tid:
                continue
            e["sameTeam"] += 1
            if win is True:
                e["wins"] += 1
            elif win is False:
                e["losses"] += 1
            if ts >= e["lastTs"]:
                e["lastTs"] = ts
                e["gameName"] = p.get("riotIdGameName") or p.get("summonerName") or ""
                e["tagLine"] = p.get("riotIdTagline") or ""
                e["profileIcon"] = p.get("profileIcon") or 0
    out = []
    for e in agg.values():
        if e["sameTeam"] < max(1, int(min_team)):
            continue
        e["winRate"] = round(e["wins"] / e["sameTeam"], 4) if e["sameTeam"] else None
        e.pop("lastTs", None)
        out.append(e)
    out.sort(key=lambda x: (-x["sameTeam"], -(x["winRate"] if x["winRate"] is not None else -1),
                            -x["sameGame"], x["gameName"]))
    return out, meta


def to_lcu_game(sgp: dict, me: dict = None, target_puuid: str = "",
                target_name: str = "") -> dict:
    """SGP `games[].json` → LCU `games.games[]` 的一条。纯函数。"""
    out = {k: sgp[k] for k in _LCU_GAME_CARRY if k in sgp}
    out["gameCreationDate"] = _iso(sgp.get("gameCreation"))
    out["teams"] = sgp.get("teams") or []

    parts, idents = [], []
    tgt_idx = -1
    for p in (sgp.get("participants") or []):
        pid = p.get("participantId")
        pu = p.get("puuid") or ""
        nm = p.get("riotIdGameName") or p.get("summonerName") or ""
        if tgt_idx < 0 and ((target_puuid and pu == target_puuid) or
                            (target_name and nm == target_name)):
            tgt_idx = len(parts)
        st = _stats_of(p)
        st["participantId"] = pid
        parts.append({
            "participantId": pid,
            "teamId": p.get("teamId", 0),
            "championId": p.get("championId", 0),
            "spell1Id": p.get("spell1Id", 0),
            "spell2Id": p.get("spell2Id", 0),
            "highestAchievedSeasonTier": "",
            "stats": st,
            "timeline": {
                "participantId": pid,
                "lane": p.get("lane") or "",
                "role": p.get("role") or "",
            },
        })
        idents.append(_identity(pid, p, me=me, target_puuid=target_puuid,
                                target_name=target_name))
    out["participants"] = parts
    out["participantIdentities"] = idents
    _keep_subject_only(parts, idents, (me or {}).get("puuid") or "",
                       target_puuid, target_name, tgt_idx)
    return out


def to_lcu_matches(sgp_games, account_id=0, platform_id="", beg=0, end=19,
                   me: dict = None, target_puuid: str = "", target_name: str = "") -> dict:
    """SGP 局列表 → LCU `/lol-match-history/v1/products/lol/*/matches` 的完整响应。

    `sgp_games` 可以是 `query.matches()` 的 `games`（含 metadata/json）或直接是 json 列表。
    `me` / `target_puuid` 用于把**目标那一行**换成本机身份（见 `_identity` 的注释）。
    """
    games = []
    for g in (sgp_games or []):
        j = g.get("json") if isinstance(g, dict) and "json" in g else g
        if isinstance(j, dict):
            games.append(to_lcu_game(j, me=me, target_puuid=target_puuid,
                                     target_name=target_name))
    if not platform_id:
        for gm in games:
            if gm.get("platformId"):
                platform_id = gm.get("platformId"); break
    return {
        "accountId": account_id,
        "platformId": platform_id,
        "games": {
            "gameBeginDate": "",
            "gameEndDate": "",
            "gameCount": len(games),
            "gameIndexBegin": beg,
            "gameIndexEnd": beg + len(games) - 1 if games else beg,
            "games": games,
        },
    }
