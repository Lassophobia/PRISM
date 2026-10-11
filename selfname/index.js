
(function createSelfName() {
  "use strict";
  if (window.__SELFNAME) return;

  const TAG = "[SELFNAME]";


  const STORE_KEY = "selfname:v1";
  const SKIP_ATTR = "data-selfname-skip";

  const A_PUUID = ["puuid", "data-puuid"];
  const A_SID = ["summoner-id", "data-summoner-id", "summonerid", "data-summonerid"];
  const A_FID = ["friend-id", "data-friend-id", "data-friendid"];

  const NAMEISH_RE = /player-name|member-name|summoner-name|game-name|name-wrapper|roster-member|summoner-wrapper|lol-uikit-player-name|player__alias|nickname|playername/i;
  const TAGLINE_RE = /(?:tag-?line|game-?tag)(?![a-z-]*-order\b)/i;

  const HARD_SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1 };
  const MSG_BODY_RE = /message-body|chat-message-body|chat-input|status-message|statusmessage|personal-message/i;

  const MAX_TEXT_LEN = 300;
  const WALK_BUDGET = 200000;
  const SWEEP_DEBOUNCE = 150;
  const IDLE_INTERVAL = 2000;

  const TAG_MAX_CHARS = 16;
  const TAG_SHAPE_RE = /^[#\s]*[0-9A-Za-z]{1,12}$/;

  const SWEEP_SLOW_MS = 8;

  const TAG_RETRY_DELAYS = [60, 180, 420, 900];
  const TAG_RETRY_COOLDOWN = 3000;

  const DIAG_API = "http://127.0.0.1:17888";


  let cfg = { enabled: false, gameName: "", tagLine: "", prevNames: [], prevTags: [] };
  const HIST_MAX = 10;
  const HIST_MIN_LEN = 3;

  const SELF = {
    ready: false, puuid: "", summonerId: "",
    gameName: "", displayName: "", tagLine: "",
    names: new Set(), trying: false, tries: 0
  };

  let REPS = [];
  let NAME_REPS = [];
  let TAGREPS = [];
  let OWNED = new Set();
  let HIST_TAGKEYS = [];
  let HIST_NAMEKEYS = new Set();

  const TOUCHED = new Map();
  const ATTR_TOUCHED = [];
  const MARKED = new Set();

  let lastApplied = 0;
  let sweepTimer = null;
  let idleTimer = null;
  let mo = null;
  let booted = false;


  const low = (v) => String(v == null ? "" : v).trim().toLowerCase();
  const str = (v) => String(v == null ? "" : v).trim();
  const isEl = (n) => !!n && n.nodeType === 1;

  function log() {
    try { console.log.apply(console, [TAG].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
  }

  function up(n) {
    if (!n) return null;
    if (n.parentElement) return n.parentElement;
    try {
      const r = n.getRootNode ? n.getRootNode() : null;
      return r && r.host ? r.host : null;
    } catch (e) { return null; }
  }

  function climb(el, max, fn) {
    let n = el, guard = 0;
    while (isEl(n) && guard++ < max) {
      const r = fn(n);
      if (r !== undefined && r !== null) return r;
      n = up(n);
    }
    return null;
  }

  function clsOf(n) {
    try {
      const c = n.className;
      return typeof c === "string" ? c : (c && c.baseVal) || "";
    } catch (e) { return ""; }
  }

  const INVIS_RE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

  function stripInvis(v) {
    return String(v == null ? "" : v).replace(INVIS_RE, "");
  }

  function normKey(v) {
    let s = String(v == null ? "" : v);
    try { s = s.normalize("NFKC"); } catch (e) {}
    return s.replace(INVIS_RE, "").replace(/\s+/g, " ").trim().toLowerCase();
  }


  const diagSent = {};
  function diag(kind, obj, force) {
    try {
      if (!force && diagSent[kind]) return;
      diagSent[kind] = 1;
      const env = JSON.stringify({ evt: "SELFNAME:" + kind, d: JSON.stringify(obj) });
      fetch(DIAG_API + "/api/diag?d=" + encodeURIComponent(env), { cache: "no-store" })
        .catch(function () {});
    } catch (e) {  }
  }


  function readHist(v) {
    const out = [];
    if (!v || !v.length) return out;
    for (let i = 0; i < v.length; i++) {
      const s = str(v[i]);
      if (s) out.push(s);
    }
    return out.slice(-HIST_MAX);
  }
  function loadCfg() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(STORE_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(STORE_KEY); } catch (e) {} }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      cfg = {
        enabled: !!o.enabled,
        gameName: str(o.gameName).slice(0, 16),
        tagLine: str(o.tagLine).replace(/[^0-9A-Za-z]/g, "").slice(0, 5),
        prevNames: readHist(o.prevNames),
        prevTags: readHist(o.prevTags)
      };
    } catch (e) {  }
  }

  function saveCfg() {
    let s = "";
    try { s = JSON.stringify(cfg); } catch (e) { return; }
    try { if (window.DataStore) window.DataStore.set(STORE_KEY, s); } catch (e) {}
    try { localStorage.setItem(STORE_KEY, s); } catch (e) {}
  }

  function pushHist(field, v) {
    const s = str(v);
    if (!s) return;
    const k = normKey(s);
    if (!k) return;
    for (let i = 0; i < cfg[field].length; i++) if (normKey(cfg[field][i]) === k) return;
    cfg[field].push(s);
    while (cfg[field].length > HIST_MAX) cfg[field].shift();
  }


  function fetchSelf() {
    return fetch(location.origin + "/lol-summoner/v1/current-summoner", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }

  function applySelf(d) {
    if (!d || !d.puuid) return false;   

    SELF.puuid = low(d.puuid);
    SELF.summonerId = str(d.summonerId);
    SELF.gameName = str(d.gameName);
    SELF.displayName = str(d.displayName);
    SELF.tagLine = str(d.tagLine);

    const set = new Set();
    const push = (v) => { const s = normKey(v); if (s) set.add(s); };
    push(d.gameName);
    push(d.displayName);
    push(d.internalName);
    push(d.gameName && d.tagLine ? d.gameName + "#" + d.tagLine : "");
    SELF.names = set;
    SELF.ready = !!SELF.puuid && set.size > 0;
    SELF.tries = 0;
    return SELF.ready;
  }

  function ensureSelf(force) {
    if (SELF.trying) return;
    if (SELF.ready && !force) return;
    SELF.trying = true;
    SELF.tries++;
    fetchSelf().then(function (d) {
      SELF.trying = false;
      if (applySelf(d)) {
        rebuildReps();
        log("身份就绪：", SELF.gameName + (SELF.tagLine ? "#" + SELF.tagLine : ""),
          "puuid=" + SELF.puuid.slice(0, 8));
        sweep();
      } else if (!SELF.ready) { retrySelf(); }
    }).catch(function (e) {
      SELF.trying = false;
      log("读身份失败（客户端可能还没起完）：", String(e).slice(0, 120));
      if (!SELF.ready) retrySelf();
    });
  }

  function retrySelf() {
    if (SELF.ready) return;
    const wait = Math.min(600 * Math.pow(2, Math.min(SELF.tries, 5)), 15000);
    setTimeout(function () { ensureSelf(); }, wait);
  }

  function forgeName() {
    try {
      const a = window.__PRISM_ENGINE;
      if (a && typeof a.forge === "function") {
        const f = a.forge();
        if (f && f.on && f.name) {
          const s = String(f.name);
          const i = s.lastIndexOf("#");
          const gn = i > 0 ? s.slice(0, i) : s;
          const tg = i > 0 ? s.slice(i + 1) : "";
          if (gn) return { gameName: gn, tagLine: tg, on: true };
        }
      }
    } catch (e) {  }
    return { gameName: "", tagLine: "", on: false };
  }
  function effGameName() { const f = forgeName(); return f.on ? f.gameName : str(cfg.gameName); }
  function effTagLine()  { const f = forgeName(); return f.on ? f.tagLine  : str(cfg.tagLine); }
  function effOn() { return !!cfg.enabled || forgeName().on; }

  var lastEffName = null, lastEffTag = null;
  function syncForgeHistory() {
    var cur = effGameName(), curTag = effTagLine();
    if (lastEffName === null) { lastEffName = cur; lastEffTag = curTag; return false; }
    if (cur === lastEffName && curTag === lastEffTag) return false;
    var dirty = false;
    var real = stripInvis(SELF.gameName);
    if (lastEffName && lastEffName !== cur && lastEffName !== real) {
      pushHist("prevNames", lastEffName); dirty = true;
    }
    var realTag = stripInvis(SELF.tagLine);
    if (lastEffTag && lastEffTag !== curTag && lastEffTag !== realTag) {
      pushHist("prevTags", lastEffTag); dirty = true;
    }
    lastEffName = cur; lastEffTag = curTag;
    return dirty;
  }

  function rebuildReps() {
    try { if (syncForgeHistory()) saveCfg(); } catch (e) {  }
    const reps = [];
    const fake = effGameName();
    const tg = effTagLine();
    const gn = stripInvis(SELF.gameName);
    const dn = stripInvis(SELF.displayName);

    if (fake && gn && fake !== gn) reps.push([gn, fake]);
    if (fake && dn && low(dn) !== low(gn) && fake !== dn) {
      reps.push([dn, fake]);
    }

    const nameOwn = new Set();
    if (gn) nameOwn.add(gn);
    if (dn) nameOwn.add(dn);
    for (let i = 0; i < cfg.prevNames.length; i++) {
      const p = str(cfg.prevNames[i]);
      if (!p || p === fake) continue;
      if (normKey(p).length < HIST_MIN_LEN) continue;     
      if (nameOwn.has(p)) continue;
      nameOwn.add(p);
      reps.push([p, fake]);
    }

    NAME_REPS = reps.slice();

    const tagKeys = [];
    if (tg) {
      const seen = new Set();
      const realTag = stripInvis(SELF.tagLine);
      if (realTag && realTag !== tg) { seen.add(realTag); tagKeys.push(realTag); reps.push(["#" + realTag, "#" + tg]); }
      for (let i = 0; i < cfg.prevTags.length; i++) {
        const p = str(cfg.prevTags[i]);
        if (!p || p === tg || seen.has(p)) continue;
        seen.add(p);
        tagKeys.push(p);                                  
        if (normKey(p).length >= HIST_MIN_LEN) reps.push(["#" + p, "#" + tg]);
      }
    }
    REPS = reps;
    TAGREPS = tagKeys.map(function (src) { return [src, tg]; });

    const owned = new Set(SELF.names);
    const histName = new Set();
    for (let i = 0; i < cfg.prevNames.length; i++) {
      const p = str(cfg.prevNames[i]);
      if (!p || p === fake) continue;        
      const k = normKey(p);
      if (!k) continue;
      owned.add(k);
      histName.add(k);
    }
    OWNED = owned;
    HIST_NAMEKEYS = histName;
    HIST_TAGKEYS = tagKeys.map(function (s) { return normKey(s); }).filter(Boolean);
  }


  function markerOf(el) {
    return climb(el, 40, function (n) {
      for (let i = 0; i < A_PUUID.length; i++) {
        const v = n.getAttribute(A_PUUID[i]);
        if (v) return { k: "puuid", v: low(v) };
      }
      for (let i = 0; i < A_SID.length; i++) {
        const v = n.getAttribute(A_SID[i]);
        if (v) return { k: "sid", v: str(v) };
      }
      for (let i = 0; i < A_FID.length; i++) {
        const v = n.getAttribute(A_FID[i]);
        if (v) return { k: "fid", v: low(v) };
      }
      return null;
    });
  }

  function markerIsSelf(m) {
    if (!m) return null;
    if (m.k === "puuid") return SELF.puuid ? m.v === SELF.puuid : null;
    if (m.k === "sid") return SELF.summonerId ? m.v === SELF.summonerId : null;
    if (m.k === "fid") return SELF.puuid ? m.v.indexOf(SELF.puuid) >= 0 : null;
    return null;
  }

  function nameish(el) {
    return !!climb(el, 8, function (n) {
      return NAMEISH_RE.test(n.tagName + " " + clsOf(n)) ? true : null;
    });
  }

  function tagLineish(el) {
    return !!climb(el, 4, function (n) {
      return TAGLINE_RE.test(clsOf(n)) ? true : null;
    });
  }

  function isTagBox(el) {
    if (!isEl(el)) return false;
    let kids = 0;
    try { kids = el.children ? el.children.length : 0; } catch (e) { kids = 0; }
    if (kids > 3) return false;

    let k = "";
    try { k = normKey(el.textContent); } catch (e) { return false; }
    if (!k) return false;
    const real = normKey(SELF.tagLine);
    const fake = normKey(cfg.tagLine);
    if (real && (k === "#" + real || k === real)) return true;
    if (fake && (k === "#" + fake || k === fake)) return true;
    for (let i = 0; i < HIST_TAGKEYS.length; i++) {
      const h = HIST_TAGKEYS[i];
      if (k === "#" + h || k === h) return true;
    }
    return false;
  }

  function tagSpot(el) {
    if (tagLineish(el)) return true;
    return !!climb(el, 3, function (n) {
      return isTagBox(n) ? true : null;
    });
  }

  function blocked(el) {
    return !!climb(el, 10, function (n) {
      if (HARD_SKIP_TAGS[n.tagName] === 1) return true;
      if (n.hasAttribute && n.hasAttribute(SKIP_ATTR)) return true;
      if (n.isContentEditable) return true;
      if (MSG_BODY_RE.test(clsOf(n))) return true;
      return null;
    });
  }

  const NAME_LEAF_SEL = ".player-name__game-name, .player-name__alias, .member-name, .summoner-name";
  const NAME_MAX_CHARS = 40;

  function identityTexts(el, cap) {
    const out = [];
    let leaves = null;
    try { leaves = el.querySelectorAll(NAME_LEAF_SEL); } catch (e) { leaves = null; }
    if (leaves) {
      for (let i = 0; i < leaves.length; i++) {
        out.push(leaves[i].textContent);
        if (out.length >= cap) return out;
      }
    }
    let w = null;
    try { w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null); }
    catch (e) { return out; }
    let n, g = 0;
    while ((n = w.nextNode()) && g++ < 80) {
      const t = str(n.nodeValue);
      if (!t || t.length > NAME_MAX_CHARS) continue;   
      out.push(t);
      if (out.length >= cap) break;
    }
    return out;
  }

  function belongsToMyCard(el) {
    const fake = normKey(effGameName());
    let n = el, guard = 0;
    while (isEl(n) && guard++ < 6) {
      let txt = "";
      try { txt = n.textContent || ""; } catch (e) { txt = ""; }
      if (txt.length > 200) return false;        

      if (markerIsSelf(markerOf(n)) === true) return true;   

      let leaves = null;
      try { leaves = n.querySelectorAll(NAME_LEAF_SEL); } catch (e) { leaves = null; }
      if (leaves && leaves.length > 3) return false;

      const cands = identityTexts(n, 12);
      if (cands.length >= 12) return false;
      for (let i = 0; i < cands.length; i++) {
        const lt = normKey(cands[i]);
        if (lt && (SELF.names.has(lt) || (fake && lt === fake))) return true;
      }

      n = up(n);
    }
    return false;
  }

  function decide(el, t) {
    if (!el) return "no-parent";
    if (blocked(el)) return "blocked";
    const m = markerOf(el);
    const mine = markerIsSelf(m);
    const exact = OWNED.has(normKey(t));
    if (mine === false && !exact) return "marker-other";
    if (mine === null && !nameish(el) && !exact) return "not-nameish";
    return "ok";
  }


  function replaceAll(t) {
    let out = t;
    for (let i = 0; i < REPS.length; i++) {
      const from = REPS[i][0], to = REPS[i][1];
      if (!from || from === to) continue;
      if (out.indexOf(from) >= 0) out = out.split(from).join(to);
    }
    return out;
  }

  function replaceTag(t) {
    const key = normKey(t);
    for (let i = 0; i < TAGREPS.length; i++) {
      const from = normKey(TAGREPS[i][0]);
      if (!from) continue;
      if (key === from) return TAGREPS[i][1];
      if (key === "#" + from) return "#" + TAGREPS[i][1];
    }
    return null;
  }

  function hits(t) {
    for (let i = 0; i < REPS.length; i++) if (t.indexOf(REPS[i][0]) >= 0) return true;
    return false;
  }

  function replaceNameOnly(t) {
    let out = t;
    for (let i = 0; i < NAME_REPS.length; i++) {
      const from = NAME_REPS[i][0], to = NAME_REPS[i][1];
      if (!from || from === to) continue;
      if (out.indexOf(from) >= 0) out = out.split(from).join(to);
    }
    return out;
  }

  function tagOnlyChange(tc) {
    return NAME_REPS.length > 0 && replaceNameOnly(tc) === tc;
  }

  function ensureMarker(el) {
    if (!SELF.puuid || !isEl(el)) return false;

    if (el.getAttribute("data-puuid")) return false;

    if (markerOf(el)) return false;
    if (!nameish(el)) return false;          

    try {
      el.setAttribute("data-puuid", SELF.puuid);
      MARKED.add(el);
      return true;
    } catch (e) { return false; }
  }

  function clearMarkers() {
    MARKED.forEach(function (el) {
      try { if (el.getAttribute("data-puuid") === SELF.puuid) el.removeAttribute("data-puuid"); }
      catch (e) {}
    });
    MARKED.clear();
  }

  function applyNode(node) {
    const t = node.nodeValue;
    if (!t || t.length > MAX_TEXT_LEN) return 0;

    const prev = TOUCHED.get(node);
    if (prev && prev.out === t && !HIST_NAMEKEYS.has(normKey(stripInvis(t)))) {
      ensureMarker(node.parentElement); return 0;
    }

    const el = node.parentElement;
    if (!el) return 0;

    const tc = stripInvis(t);
    const maybeTag = TAGREPS.length > 0 && tc.length <= TAG_MAX_CHARS && TAG_SHAPE_RE.test(tc);
    if (!maybeTag && !hits(tc)) return 0;

    let out = null;
    if (maybeTag) {
      const tagged = replaceTag(tc);
      if (tagged != null && !blocked(el) && tagSpot(el)) {
        if (belongsToMyCard(el)) {
          out = tagged;
        } else {
          armTagRetry();
        }
      }
    }

    if (out == null) {
      if (!hits(tc)) return 0;                      
      if (decide(el, tc) !== "ok") return 0;
      if (tagOnlyChange(tc) && !belongsToMyCard(el)) return 0;
      out = replaceAll(tc);
      if (out === tc) return 0;
    }

    try { node.nodeValue = out; } catch (e) { return 0; }
    TOUCHED.set(node, { orig: t, out: out });
    ensureMarker(el);
    return 1;
  }

  const ATTR_REWRITE = ["title", "aria-label", "data-tooltip", "data-title", "placeholder"];

  function applyAttrValue(el, name, v) {
    if (!v || v.length > MAX_TEXT_LEN) return 0;
    const vc = stripInvis(v);
    if (!hits(vc)) return 0;
    if (decide(el, vc) !== "ok") return 0;
    if (tagOnlyChange(vc) && !belongsToMyCard(el)) return 0;
    const out = replaceAll(vc);
    if (!out || out === vc) return 0;
    try { el.setAttribute(name, out); } catch (e) { return 0; }
    ATTR_TOUCHED.push({ el: el, name: name, orig: v });
    ensureMarker(el);
    return 1;
  }

  function applyAttr(el, name) {
    let v = null;
    try { v = el.getAttribute(name); } catch (e) { return 0; }
    return applyAttrValue(el, name, v);
  }

  function applyAttrs(el) {
    let n = 0;
    for (let i = 0; i < ATTR_REWRITE.length; i++) {
      const name = ATTR_REWRITE[i];
      let v = null;
      try { v = el.getAttribute(name); } catch (e) { continue; }
      if (!v) continue;                       
      n += applyAttrValue(el, name, v);
    }
    return n;
  }

  function sweepTree(root, budget) {
    let n = 0;
    let walker;
    try {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    } catch (e) { return 0; }

    let node;
    try { node = walker.nextNode(); } catch (e) { return 0; }
    while (node && budget.n < WALK_BUDGET) {
      budget.n++;
      if (node.nodeType === 3) {
        n += applyNode(node);
      } else if (node.nodeType === 1) {
        n += applyAttrs(node);
        let sr = null;
        try { sr = node.shadowRoot; } catch (e) { sr = null; }
        if (sr) n += sweepTree(sr, budget);
      }
      try { node = walker.nextNode(); } catch (e) { break; }
    }
    return n;
  }

  function pruneTouched() {
    TOUCHED.forEach(function (rec, node) {
      if (!node.isConnected) TOUCHED.delete(node);
    });
    for (let i = ATTR_TOUCHED.length - 1; i >= 0; i--) {
      if (!ATTR_TOUCHED[i].el || !ATTR_TOUCHED[i].el.isConnected) ATTR_TOUCHED.splice(i, 1);
    }
  }

  let lastSweepMs = 0;

  function nowMs() {
    try {
      if (typeof performance !== "undefined" && performance.now) return performance.now();
    } catch (e) {}
    return Date.now();
  }

  function sweep() {
    if (!effOn() || !SELF.ready || (!REPS.length && !TAGREPS.length)) return 0;
    const tStart = nowMs();
    pruneTouched();

    const budget = { n: 0 };
    let n = 0;
    try { n = sweepTree(document, budget); } catch (e) { log("扫描异常：", String(e).slice(0, 120)); }

    try {
      const tl = document.title;
      if (tl && hits(tl)) document.title = replaceAll(tl);
    } catch (e) {}

    lastApplied = TOUCHED.size;
    lastSweepMs = Math.round((nowMs() - tStart) * 10) / 10;
    if (lastSweepMs >= SWEEP_SLOW_MS) {
      log("扫描偏慢：" + lastSweepMs + " ms（遍历 " + budget.n + " 节点，改写 " + n + " 处）");
    } else if (n > 0) {
      log("本轮改写 " + n + " 处（" + lastSweepMs + " ms，累计 " + TOUCHED.size + "）");
    }
    return n;
  }

  function scheduleSweep() {
    if (!effOn()) return;
    if (sweepTimer) return;
    sweepTimer = setTimeout(function () { sweepTimer = null; sweep(); }, SWEEP_DEBOUNCE);
  }


  let tagRetryArmed = false;
  let tagRetryLast = 0;

  function armTagRetry() {
    if (!effOn() || tagRetryArmed) return;
    const now = Date.now();
    if (now - tagRetryLast < TAG_RETRY_COOLDOWN) return;
    tagRetryArmed = true;
    tagRetryLast = now;
    let i = 0;
    const step = function () {
      if (!effOn()) { tagRetryArmed = false; return; }
      try { sweep(); } catch (e) {}
      i++;
      if (i < TAG_RETRY_DELAYS.length) setTimeout(step, TAG_RETRY_DELAYS[i]);
      else tagRetryArmed = false;
    };
    setTimeout(step, TAG_RETRY_DELAYS[0]);
  }

  function restoreAll() {
    TOUCHED.forEach(function (rec, node) {
      try {
        if (node.isConnected && node.nodeValue === rec.out) node.nodeValue = rec.orig;
      } catch (e) {}
    });
    TOUCHED.clear();
    for (let i = ATTR_TOUCHED.length - 1; i >= 0; i--) {
      const a = ATTR_TOUCHED[i];
      try {
        if (a.el && a.el.isConnected && a.el.getAttribute(a.name) !== a.orig) {
          a.el.setAttribute(a.name, a.orig);
        }
      } catch (e) {}
    }
    ATTR_TOUCHED.length = 0;
    clearMarkers();
    lastApplied = 0;
  }


  function attachObserver() {
    if (mo) return;
    try {
      mo = new MutationObserver(function (recs) {
        if (!effOn() || !recs.length) return;
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i];
          if (r.type === "characterData" || r.type === "childList" || r.type === "attributes") {
            scheduleSweep();
            return;
          }
        }
      });
      mo.observe(document.body, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: A_PUUID.concat(A_SID, A_FID, ["class"])
      });
      log("观察者已挂上");
    } catch (e) { log("观察者挂载失败：", String(e).slice(0, 120)); }
  }

  function startIdleSweep() {
    if (idleTimer) return;
    idleTimer = setInterval(function () {
      if (!effOn()) return;
      try { if (syncForgeHistory()) rebuildReps(); } catch (e) {  }
      sweep();
    }, IDLE_INTERVAL);
  }

  function pauseAuto() {
    try { if (mo) { mo.disconnect(); mo = null; } } catch (e) {}
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
    if (sweepTimer) { clearTimeout(sweepTimer); sweepTimer = null; }
  }
  function resumeAuto() {
    attachObserver();
    startIdleSweep();
  }

  function pollGameflow() {
    fetch(location.origin + "/lol-gameflow/v1/gameflow-phase", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (ph) {
        const p = String(ph == null ? "" : ph);
        if (!p || p === window.__SELFNAME.gameflow) return;
        window.__SELFNAME.gameflow = p;
        log("阶段变化：" + p);
        ensureSelf(true);
        if (!effOn()) return;
        scheduleSweep();
        setTimeout(function () { sweep(); }, 700);
      })
      .catch(function () {  });
  }


  function notify() {
    try {
      window.dispatchEvent(new CustomEvent("selfname-change", { detail: getCfg() }));
    } catch (e) {}
  }

  function getCfg() { return JSON.parse(JSON.stringify(cfg)); }

  function getSelf() {
    return {
      ready: SELF.ready, gameName: SELF.gameName, tagLine: SELF.tagLine,
      puuid: SELF.puuid, name: SELF.gameName + (SELF.tagLine ? "#" + SELF.tagLine : "")
    };
  }

  function setCfg(o) {
    o = o || {};
    if ("enabled" in o) cfg.enabled = !!o.enabled;
    if ("gameName" in o) { pushHist("prevNames", cfg.gameName); cfg.gameName = str(o.gameName).slice(0, 16); }
    if ("tagLine" in o) { pushHist("prevTags", cfg.tagLine); cfg.tagLine = str(o.tagLine).replace(/[^0-9A-Za-z]/g, "").slice(0, 5); }

    if (effOn() && !effGameName()) cfg.enabled = false;

    saveCfg();
    rebuildReps();
    ensureSelf();

    restoreAll();
    if (effOn()) sweep();

    log("已应用：", JSON.stringify(cfg));
    diag("applied", {
      cfg: getCfg(), reps: REPS.length, tagReps: TAGREPS.length,
      rewritten: TOUCHED.size, marked: MARKED.size,
      sona: !!document.getElementById("sona-summoner-name-effect-style"),
      gradientNow: document.querySelectorAll("[data-sona-name-gradient]").length,
      phase: String(window.__SELFNAME.gameflow || "?"), url: String(location.href)
    }, true);
    notify();
    return getCfg();
  }

  function restore() {
    const realName = stripInvis(SELF.gameName);
    if (effOn() && realName) {
      pushHist("prevNames", cfg.gameName);
      pushHist("prevTags", cfg.tagLine);
      const next = { enabled: true, gameName: realName };
      const realTag = stripInvis(SELF.tagLine);
      if (realTag) next.tagLine = realTag;   
      setCfg(next);                          
      TOUCHED.clear();
      ATTR_TOUCHED.length = 0;
      clearMarkers();
    }
    return setCfg({ enabled: false });
  }


  function whyNot(el, t) {
    if (!el) return "no-parent";
    if (blocked(el)) return "blocked";
    if (TAGREPS.length && tagSpot(el) && replaceTag(t) != null) {
      return belongsToMyCard(el) ? "tag-should-have" : "tag-not-my-card";
    }
    return decide(el, t);
  }

  function chainOf(el) {
    const out = [];
    let n = el, guard = 0;
    while (isEl(n) && guard++ < 6) {
      out.push(n.tagName.toLowerCase() + (clsOf(n) ? "." + clsOf(n).split(/\s+/).slice(0, 2).join(".") : ""));
      n = up(n);
    }
    return out.join(" < ");
  }

  function buildReport() {
    const rows = [];
    const scan = function (root, depth) {
      let walker;
      try { walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null); }
      catch (e) { return; }
      let node;
      try { node = walker.nextNode(); } catch (e) { return; }
      let guard = 0;
      while (node && guard++ < WALK_BUDGET) {
        if (node.nodeType === 3) {
          const t = node.nodeValue;
          const rec = TOUCHED.get(node);
          if (t && t.length <= MAX_TEXT_LEN) {
            const el = node.parentElement;
            const isTagCand = !!el && TAGREPS.length > 0 && tagSpot(el) && replaceTag(t) != null;
            if (rec || hits(t) || isTagCand) {
              const m = el ? markerOf(el) : null;
              rows.push({
                txt: (rec ? rec.orig : t).slice(0, 60),
                now: rec ? "rewritten" : "original",
                why: rec ? "done" : whyNot(el, t),
                isSelf: String(el ? markerIsSelf(m) : null),
                nameish: el ? nameish(el) : false,
                tagish: el ? tagLineish(el) : false,
                tagspot: el ? tagSpot(el) : false,
                mark: m ? m.k : "",
                gradient: !!(el && el.hasAttribute && el.hasAttribute("data-sona-name-gradient")),
                chain: chainOf(el),
                shadow: depth > 0
              });
            }
          }
        } else if (node.nodeType === 1) {
          try { if (node.shadowRoot) scan(node.shadowRoot, depth + 1); } catch (e) {}
        }
        try { node = walker.nextNode(); } catch (e) { break; }
      }
    };
    try { scan(document, 0); } catch (e) {}

    return {
      enabled: cfg.enabled,
      target: { gameName: effGameName(), tagLine: effTagLine() },
      self: getSelf(),
      reps: REPS.map(function (r) { return r[0] + " => " + r[1]; }),
      tagReps: TAGREPS.map(function (r) { return r[0] + " => " + r[1]; }),
      touched: TOUCHED.size,
      marked: MARKED.size,
      rewritten: rows.filter(function (r) { return r.now === "rewritten"; }).length,
      leftAlone: rows.filter(function (r) { return r.now === "original"; }).length,
      sona: {
        stylesheet: !!document.getElementById("sona-summoner-name-effect-style"),
        gradientEls: document.querySelectorAll("[data-sona-name-gradient]").length
      },
      gameflow: String(window.__SELFNAME.gameflow || "?"),
      url: String(location.href),
      sites: rows.slice(0, 80),
      sitesTotal: rows.length,
      lastSweepMs: lastSweepMs
    };
  }


  function exposeHooks() {
    window.__SELFNAME = {
      ver: 9, build: "9-restore-ledger", at: Date.now(), gameflow: "", ready: true,
      open: null, close: null,          
      getCfg: getCfg,
      setCfg: setCfg,
      restore: restore,
      getSelf: getSelf,
      report: buildReport,
      sweep: sweep,
      get lastSweepMs() { return lastSweepMs; },
      _internal: {
        SELF: SELF, TOUCHED: TOUCHED, MARKED: MARKED, ATTR_TOUCHED: ATTR_TOUCHED,
        get reps() { return REPS; },
        get nameReps() { return NAME_REPS; },
        get tagReps() { return TAGREPS; },
        get OWNED() { return OWNED; },
        applySelf: applySelf,
        rebuildReps: rebuildReps,
        replaceAll: replaceAll,
        replaceNameOnly: replaceNameOnly,
        tagOnlyChange: tagOnlyChange,
        replaceTag: replaceTag,
        hits: hits,
        markerOf: markerOf,
        markerIsSelf: markerIsSelf,
        nameish: nameish,
        tagLineish: tagLineish,
        isTagBox: isTagBox,
        tagSpot: tagSpot,
        blocked: blocked,
        belongsToMyCard: belongsToMyCard,
        decide: decide,
        ensureMarker: ensureMarker,
        applyNode: applyNode,
        applyAttr: applyAttr,
        applyAttrs: applyAttrs,
        ATTR_REWRITE: ATTR_REWRITE,
        sweepTree: sweepTree,
        sweep: sweep,
        restoreAll: restoreAll,
        scheduleSweep: scheduleSweep,
        attachObserver: attachObserver,
        armTagRetry: armTagRetry,
        pauseAuto: pauseAuto,
        resumeAuto: resumeAuto,
        buildReport: buildReport
      }
    };
  }


  exposeHooks();
  loadCfg();
  rebuildReps();

  function watchForgeRev() {
    try {
      const de = document.documentElement;
      let last = de.getAttribute("data-prism-forge-rev") || "";
      new MutationObserver(function () {
        let now = "";
        try { now = de.getAttribute("data-prism-forge-rev") || ""; } catch (e) { return; }
        if (now === last) return;
        last = now;
        rebuildReps();
        try { sweep(); } catch (e2) {  }
        diag("forge-rev", { rev: now, fake: effGameName() });
      }).observe(de, { attributes: true, attributeFilter: ["data-prism-forge-rev"] });
    } catch (e) {  }
  }

  function boot() {
    if (booted) return;
    booted = true;
    attachObserver();
    watchForgeRev();      
    startIdleSweep();
    ensureSelf();
    pollGameflow();
    setInterval(pollGameflow, 5000);
    if (effOn()) sweep();
    log("引擎已加载 ver=9 build=9-restore-ledger（无界面，配置在 MOD 商店 → 显示设置；含不可见字符归一化 + 标签位结构性判定 + 二次改名历史假名回填 + 还原不依赖会话账本）");
    diag("boot", {
      cfg: getCfg(), ready: SELF.ready, url: String(location.href),
      phase: String(window.__SELFNAME.gameflow || "?")
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
