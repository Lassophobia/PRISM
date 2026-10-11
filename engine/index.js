
const Engine = (function bootstrap() {
  "use strict";

  var TAG = "[PRISM-Engine]";
  var API = "http://127.0.0.1:17888";
  var BUILD = "prism-1.0.0";
  var CFG_KEY = "prism-engine";
  var CSS_ID = "prism-engine-css";


  var DEFAULT_CFG = {
    autoAccept: false,
    autoAcceptDelayMin: 2000,   
    autoAcceptDelayMax: 5000,   
    allowDeclineAfterAccept: false,
    autoHonor: false,
    autoReturnToLobby: false,
    autoReturnMode: "lobby",    
    autoLockChampion: false,
    autoLockMode: "instant",    
    autoLockChampionIds: [],    
    autoBanChampion: false,
    autoBanChampionIds: [],     
    hideTFT: false,
    hideRightNavText: false,
    hideEsportsPopup: false,
    rankDisguise: false,
    rankQueue: "RANKED_SOLO_5x5",
    rankTier: "CHALLENGER",
    rankDivision: "II",
    mhForge: false,
    mhForgeName: "",
    challengeSpoof: false,
    challengeLevel: "CHALLENGER",
    challengeUnlockAll: true
  };

  var cfg = {};
  var appliedJson = "";        

  function isArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }

  function cloneCfg(o) {
    var r = {};
    for (var k in DEFAULT_CFG) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_CFG, k)) {
        var v = (o && o[k] !== undefined && o[k] !== null) ? o[k] : DEFAULT_CFG[k];
        r[k] = isArr(v) ? v.slice() : v;
      }
    }
    return r;
  }

  function loadCfg() {
    var raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(CFG_KEY); } catch (e) {  }
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch (e) { raw = null; }
    }
    cfg = cloneCfg(raw || {});
    if (cfg.mhForge) {
      cfg.mhForge = false;
      saveCfg();
      diag("mh-forge-reset-on-boot", { name: cfg.mhForgeName || "" });
    }
    return cfg;
  }

  function saveCfg() {
    var s = JSON.stringify(cfg);
    try { if (window.DataStore) window.DataStore.set(CFG_KEY, s); } catch (e) {  }
    try { localStorage.setItem(CFG_KEY, s); } catch (e) {  }
  }


  function diag(evt, data) {
    try {
      var payload;
      try {
        payload = JSON.stringify({
          evt: evt,
          data: data === undefined ? null : data,
          url: String(location.href)
        });
      } catch (e) {
        payload = JSON.stringify({ evt: evt, data: "unserializable" });
      }
      if (payload.length > 5800) {
        payload = JSON.stringify({
          evt: evt,
          data: {
            _tooBig: true, len: payload.length,
            keys: (data && typeof data === "object") ? Object.keys(data).slice(0, 14) : null
          },
          url: String(location.href)
        });
      }
      fetch(API + "/api/diag?d=" + encodeURIComponent(payload), { cache: "no-store" })
        .catch(function () {  });
    } catch (e) {  }
  }


  var rawFetch = null;
  function lcuRaw(path, opts) {
    var f = (typeof rawFetch === "function") ? rawFetch : fetch;
    return f(path, Object.assign({ cache: "no-store" }, opts || {}));
  }

  function lcuJson(path) {
    return lcuRaw(path).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function lcuSend(method, path, body) {
    return lcuRaw(path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r;
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function idSet(path) {
    return lcuJson(path).then(function (a) {
      var s = {};
      if (isArr(a)) { for (var i = 0; i < a.length; i++) s[a[i]] = 1; }
      return s;
    });
  }


  var Bus = (function () {
    var handlers = {};         
    var uris = [];             
    var socketCtx = null;      
    var socketBound = {};      
    var lastValue = {};        
    var pollTimer = null;
    var POLL_MS = 1000;

    function emit(uri, data, eventType) {
      var list = handlers[uri];
      if (!list) return;
      for (var i = 0; i < list.length; i++) {
        try { list[i]({ uri: uri, data: data, eventType: eventType || "Update" }); }
        catch (e) { diag("bus-handler-error", { uri: uri, msg: String(e && e.message || e) }); }
      }
    }

    function bindSocket(uri) {
      if (!socketCtx || socketBound[uri]) return;
      try {
        socketCtx.observe(uri, function (msg) {
          emit(uri, msg && msg.data, (msg && msg.eventType) || "Update");
        });
        socketBound[uri] = true;
      } catch (e) {
        diag("bus-socket-error", { uri: uri, msg: String(e && e.message || e) });
      }
    }

    function tick() {
      for (var i = 0; i < uris.length; i++) {
        (function (uri) {
          lcuJson(uri).then(function (v) {
            var s;
            try { s = JSON.stringify(v); } catch (e) { s = String(v); }
            if (lastValue[uri] === undefined) { lastValue[uri] = s; return; }  
            if (s !== lastValue[uri]) {
              lastValue[uri] = s;
              emit(uri, v, "Update");
            }
          }).catch(function () {  });
        })(uris[i]);
      }
    }

    function startPoll() {
      if (pollTimer) return;
      pollTimer = setInterval(function () {
        try { if (document.hidden) return; } catch (e) {  }
        tick();
      }, POLL_MS);
    }

    return {
      bindContext: function (ctx) {
        socketCtx = (ctx && ctx.socket) ? ctx.socket : null;
        diag("bus-bind", { hasSocket: !!socketCtx });
        for (var i = 0; i < uris.length; i++) bindSocket(uris[i]);
      },
      hasSocket: function () { return !!socketCtx; },
      on: function (uri, cb) {
        if (!handlers[uri]) { handlers[uri] = []; }
        handlers[uri].push(cb);
        if (uris.indexOf(uri) < 0) {
          uris.push(uri);
          bindSocket(uri);
          lcuJson(uri).then(function (v) {
            try { lastValue[uri] = JSON.stringify(v); } catch (e) {  }
          }).catch(function () {  });
        }
        startPoll();
        return function () {
          var l = handlers[uri];
          if (l) {
            var k = l.indexOf(cb);
            if (k >= 0) l.splice(k, 1);
          }
        };
      },
      peek: function (uri) { return lcuJson(uri); }
    };
  })();


  var Injector = (function () {
    var tasks = [];        
    var mo = null;
    var timer = null;
    var debounce = null;
    var TICK_MS = 500;

    function runAll() {
      for (var i = tasks.length - 1; i >= 0; i--) {
        var t = tasks[i];
        if (t.done) continue;
        var r = null;
        try { r = t.fn(); }
        catch (e) {
          t.done = true;     
          diag("injector-task-error", { msg: String(e && e.message || e) });
          continue;
        }
        if (r === true && t.once) t.done = true;
      }
    }

    function schedule() {
      if (debounce) return;
      debounce = setTimeout(function () {
        debounce = null;
        try { runAll(); } catch (e) {  }
      }, 120);
    }

    return {
      start: function () {
        if (!mo) {
          mo = new MutationObserver(schedule);
          try { mo.observe(document.body || document.documentElement, { childList: true, subtree: true }); }
          catch (e) { diag("injector-observer-error", { msg: String(e && e.message || e) }); }
        }
        if (!timer) {
          timer = setInterval(function () {
            try { if (document.hidden) return; } catch (e) {  }
            runAll();
          }, TICK_MS);
        }
        schedule();
      },
      register: function (fn, once) {
        tasks.push({ fn: fn, once: once !== false, done: false });
        schedule();
      },
      runNow: runAll,
      taskCount: function () {
        var c = 0;
        for (var i = 0; i < tasks.length; i++) if (!tasks[i].done) c++;
        return c;
      }
    };
  })();


  var CSS_TEXT = [
    "html.prism-eng-hide-tft .menu_item_navbar_tft { display: none !important; }",
    "html.prism-eng-hide-rightnavtext .right-nav-menu lol-uikit-navigation-item .menu-item-small-text {",
    "  display: none !important;",
    "}",
    "html.prism-eng-hide-esportspopup iframe#tv-official-pop { display: none !important; }"
  ].join("\n");

  function ensureCss() {
    try {
      if (document.getElementById(CSS_ID)) return;
      var st = document.createElement("style");
      st.id = CSS_ID;
      st.textContent = CSS_TEXT;
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { diag("css-error", { msg: String(e && e.message || e) }); }
  }

  function applyCssSwitches() {
    try {
      var el = document.documentElement;
      if (!el) return;
      function set(cls, on) {
        try { el.classList.toggle(cls, !!on); } catch (e) {  }
      }
      set("prism-eng-hide-tft", cfg.hideTFT);
      set("prism-eng-hide-rightnavtext", cfg.hideRightNavText);
      set("prism-eng-hide-esportspopup", cfg.hideEsportsPopup);
    } catch (e) { diag("apply-css-error", { msg: String(e && e.message || e) }); }
  }


  var AutoAccept = (function () {
    var DELAY_HARD_MAX = 15000;   
    var armed = false;            
    var paused = false;           
    var timer = null;
    var offs = [];

    function delayMs() {
      var a = Number(cfg.autoAcceptDelayMin);
      var b = Number(cfg.autoAcceptDelayMax);
      if (!isFinite(a) || !isFinite(b)) return 0;
      if (a < 0 || b < 0 || b > DELAY_HARD_MAX || a > b || b <= 0) return 0;
      return Math.round(a + Math.random() * (b - a));
    }

    function acceptNow(ms) {
      lcuSend("POST", "/lol-matchmaking/v1/ready-check/accept")
        .then(function () { diag("autoaccept-done", { delay: ms }); })
        .catch(function (e) { diag("autoaccept-fail", { delay: ms, msg: String(e && e.message || e) }); });
    }

    function scheduleAccept() {
      if (timer) { clearTimeout(timer); timer = null; }
      var ms = delayMs();
      if (ms === 0) { acceptNow(0); return; }
      timer = setTimeout(function () {
        timer = null;
        Bus.peek("/lol-gameflow/v1/gameflow-phase").then(function (p) {
          if (p !== "ReadyCheck") {
            diag("autoaccept-skip", { reason: "phase-changed", phase: p });
            return;
          }
          acceptNow(ms);
        }).catch(function () {  });
      }, ms);
    }

    function pause(reason) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (paused) return;
      paused = true;
      armed = true;
      diag("autoaccept-paused", { reason: reason });
    }

    function onPhase(e) {
      var ph = e.data;
      if (ph === "ReadyCheck") {
        if (armed || paused) return;
        armed = true;
        scheduleAccept();
        diag("autoaccept-armed", { phase: ph });
        return;
      }
      armed = false;
      if (timer) { clearTimeout(timer); timer = null; }
      if (ph === "Lobby" || ph === "None") paused = false;
    }

    function onReadyCheck(e) {
      var d = e.data || {};
      if (d.playerResponse === "Declined") pause("self-declined");
    }

    return {
      start: function () {
        if (offs.length) return;
        offs.push(Bus.on("/lol-gameflow/v1/gameflow-phase", onPhase));
        offs.push(Bus.on("/lol-matchmaking/v1/ready-check", onReadyCheck));
        Bus.peek("/lol-gameflow/v1/gameflow-phase").then(function (p) {
          if (p === "ReadyCheck") onPhase({ data: p });
          else if (p === "Lobby" || p === "None") paused = false;
        }).catch(function () {  });
        diag("autoaccept-on", { min: cfg.autoAcceptDelayMin, max: cfg.autoAcceptDelayMax });
      },
      stop: function () {
        for (var i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) {  } }
        offs = [];
        if (timer) { clearTimeout(timer); timer = null; }
        armed = false; paused = false;
        diag("autoaccept-off", null);
      },
      isOn: function () { return offs.length > 0; }
    };
  })();


  var RANK_APEX = { MASTER: 1, GRANDMASTER: 1, CHALLENGER: 1 };
  function normDivision(tier, div) {
    return RANK_APEX[String(tier || "").toUpperCase()] ? "I" : String(div || "");
  }

  var CHAL_LEVELS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND",
                     "MASTER", "GRANDMASTER", "CHALLENGER"];
  var CHAL_CRYSTAL = { IRON: 0, BRONZE: 750, SILVER: 1650, GOLD: 4300, PLATINUM: 8600,
                       DIAMOND: 13800, MASTER: 24500, GRANDMASTER: 25000, CHALLENGER: 26500 };

  var RankDisguise = (function () {
    var ME = "/lol-chat/v1/me";
    var appliedKey = null;      

    function targetKey() {
      return [cfg.rankQueue, cfg.rankTier, normDivision(cfg.rankTier, cfg.rankDivision)].join("|");
    }

    function writeWith(modifier, okEvt, failEvt, extra) {
      lcuJson(ME).then(function (me) {
        if (!me || typeof me !== "object") throw new Error("bad /lol-chat/v1/me");
        if (!me.lol || typeof me.lol !== "object") me.lol = {};
        modifier(me.lol);
        return lcuSend("PUT", ME, me);
      }).then(function () {
        diag(okEvt, extra || null);
      }).catch(function (e) {
        diag(failEvt, { msg: String(e && e.message || e) });
      });
    }

    function apply() {
      var t = String(cfg.rankQueue || ""), n = String(cfg.rankTier || "");
      var d = normDivision(n, cfg.rankDivision);
      if (!t || !n || !d) { diag("rankdisguise-skip", { reason: "incomplete", queue: t, tier: n, division: d }); return; }
      var key = t + "|" + n + "|" + d;
      writeWith(function (lol) {
        lol.rankedLeagueQueue = t;
        lol.rankedLeagueTier = n;
        lol.rankedLeagueDivision = d;
      }, "rankdisguise-applied", "rankdisguise-fail", { queue: t, tier: n, division: d });
      appliedKey = key;   
      lcuJson(ME).then(function (me) {
        var lol = (me && me.lol) || {};
        if (lol.rankedLeagueTier === n && lol.rankedLeagueDivision === d && lol.rankedLeagueQueue === t) {
          appliedKey = key;
        } else {
          appliedKey = null;
        }
      }).catch(function () { appliedKey = null; });
    }

    function restore() {
      writeWith(function (lol) {
        lol.rankedLeagueQueue = "";
        lol.rankedLeagueTier = "";
        lol.rankedLeagueDivision = "";
      }, "rankdisguise-restored", "rankdisguise-restore-fail", null);
      appliedKey = null;
    }

    return {
      sync: function (want) {
        if (want) {
          if (appliedKey !== targetKey()) apply();
        } else {
          if (appliedKey !== null) restore();
        }
      },
      isOn: function () { return appliedKey !== null; },
      state: function () { return { appliedKey: appliedKey, want: targetKey() }; }
    };
  })();


  var RankProfile = (function () {
    var RE = /\/lol-ranked\/v1\/(?:signed-)?(?:current-)?ranked-stats(?:\/|\?|$)/;
    var stat = { reads: 0, spoofed: 0, skipped: 0 };

    function on() { return !!(cfg && cfg.rankDisguise); }

    function matchQueue(qt, want) {
      var s = String(qt || "").toUpperCase();
      var w = String(want || "").toUpperCase();
      if (!w) return false;
      return s === w || s === ("JADE_" + w);
    }

    function spoofEntry(e, want, tier, div) {
      if (!e || typeof e !== "object") return false;
      if (!matchQueue(e.queueType, want)) return false;
      e.tier = tier;
      e.division = normDivision(tier, div);
      e.isProvisional = false;              
      e.provisionalGamesRemaining = 0;
      e.provisionalGameThreshold = 0;
      if (e.ratedTier === "NONE") e.ratedTier = tier;
      return true;
    }

    function spoof(obj) {
      if (!on() || !obj || typeof obj !== "object") return false;
      var want = cfg.rankQueue;
      var tier = String(cfg.rankTier || "");
      var div = normDivision(tier, cfg.rankDivision);
      if (!want || !tier) return false;
      var n = 0, i, ks;
      if (Array.isArray(obj.queues)) {
        for (i = 0; i < obj.queues.length; i++) if (spoofEntry(obj.queues[i], want, tier, div)) n++;
      }
      if (obj.queueMap && typeof obj.queueMap === "object") {
        ks = Object.keys(obj.queueMap);
        for (i = 0; i < ks.length; i++) if (spoofEntry(obj.queueMap[ks[i]], want, tier, div)) n++;
      }
      if (spoofEntry(obj.highestRankedEntry, want, tier, div)) n++;
      if (spoofEntry(obj.highestRankedEntrySR, want, tier, div)) n++;
      if (n) {
        stat.spoofed++;
        diag("rankprofile-spoof", { queue: want, tier: tier, division: div, entries: n });
      }
      return n > 0;
    }

    function textOf(raw) {
      if (typeof raw !== "string" || !raw) return null;
      if (!on()) return null;
      try {
        var o = JSON.parse(raw);
        if (!spoof(o)) return null;
        return JSON.stringify(o);
      } catch (e) {
        stat.skipped++;
        return null;
      }
    }

    var ICON_INV_RE = /\/lol-inventory\/v2\/inventory\/SUMMONER_ICON(?:\/|\?|$)/;
    var ICON_ALL_URL = "/lol-game-data/assets/v1/summoner-icons.json";
    var ICON_SETS_URL = "/lol-game-data/assets/v1/summoner-icon-sets.json";
    var ICON_SETS_RE = /summoner-icon-sets\.json/;
    var iconAllIds = null;
    var ICON_LIMIT_TIERS = [0];   
    var iconSpoofRound = 0;
    var iconLastLim = -1;
    var iconInvBusy = false;
    var iconInvStat = { spoofed: 0, added: 0, skipped: 0 };
    var iconInvTouched = false;
    var iconHealTried = false;
    var ICON_HEAL_FORCE = false;

    function iconHealMaybe(why) {
      if (iconHealTried || (!ICON_HEAL_FORCE && iconInvTouched)) return;
      setTimeout(function () {
        try {
          if (iconHealTried || (!ICON_HEAL_FORCE && iconInvTouched)) return;
          if (!iconPickerOpen()) return;              
          var K = "prism-icon-heal";
          try {
            if (sessionStorage.getItem(K) === "1") { iconHealTried = true; return; }
            sessionStorage.setItem(K, "1");
          } catch (e2) {  }
          iconHealTried = true;
          var rec = { evt: "icon-heal-reload", data: { why: why, touched: iconInvTouched, force: ICON_HEAL_FORCE } };
          try {
            if (navigator.sendBeacon) {
              navigator.sendBeacon(API + "/api/diag", new Blob([JSON.stringify(rec)], { type: "application/json" }));
            } else { diag("icon-heal-reload", rec.data); }
          } catch (eB) { try { diag("icon-heal-reload", rec.data); } catch (eB2) {  } }
          setTimeout(function () { try { location.reload(); } catch (e3) {  } }, 700);
        } catch (e4) {  }
      }, 1200);
    }

    function iconPickerOpen() {
      try { return !!document.querySelector(".challenges-identity-customizer-container"); }
      catch (e) { return false; }
    }

    function iconBuildList(icons, sets) {
      var ex = {}, names = [], i, j;
      if (sets && sets.length) {
        for (i = 0; i < sets.length; i++) {
          var t = sets[i];
          if (!t) continue;
          var nm = String(t.displayName || "");
          if (t.hidden !== true && nm.indexOf("电竞") < 0 && nm.indexOf("赛事") < 0) continue;
          var ids = t.icons || [];
          names.push(nm + "(" + ids.length + (t.hidden === true ? ",hidden" : "") + ")");
          for (j = 0; j < ids.length; j++) ex[String(ids[j])] = 1;
        }
      }
      var out = [], droppedNoImg = 0, droppedSet = 0;
      for (i = 0; i < icons.length; i++) {
        var it = icons[i];
        if (!it || it.id === undefined) continue;
        if (!it.imagePath) { droppedNoImg++; continue; }
        if (ex[String(it.id)]) { droppedSet++; continue; }
        out.push(it.id);
      }
      diag("icon-all-ids", {
        n: out.length, noImg: droppedNoImg, bySet: droppedSet,
        sets: names.join("|").slice(0, 160)
      });
      return out;
    }

    function iconLoadAllIds() {
      if (iconAllIds || iconInvBusy) return;
      iconInvBusy = true;
      try {
        Promise.all([
          window.fetch(ICON_ALL_URL).then(function (r) { return r && r.ok ? r.json() : null; }),
          window.fetch(ICON_SETS_URL).then(function (r) { return r && r.ok ? r.json() : null; })
        ]).then(function (res) {
          iconInvBusy = false;
          var arr = res[0], sets = res[1];
          if (!arr || !arr.length) return;
          iconAllIds = iconBuildList(arr, sets);
        }).catch(function (e) {
          iconInvBusy = false;
          diag("icon-all-ids-error", { msg: String((e && e.message) || e).slice(0, 90) });
        });
      } catch (e) { iconInvBusy = false; }
    }

    function spoofIconInv(obj) {
      if (!Array.isArray(obj) || !obj.length) return false;
      if (!iconAllIds || !iconAllIds.length) { iconLoadAllIds(); return false; }
      var lim = ICON_LIMIT_TIERS[iconSpoofRound % ICON_LIMIT_TIERS.length];
      var list = (lim > 0 && iconAllIds.length > lim) ? iconAllIds.slice(0, lim) : iconAllIds;
      iconSpoofRound++;
      iconLastLim = lim;
      if (obj.length >= list.length) {
        diag("icon-inv-spoof", { added: 0, total: obj.length, lim: lim, note: "already-full" });
        return false;
      }
      var tmpl = obj[0];
      if (!tmpl || typeof tmpl !== "object") return false;
      var have = {}, i, k, id;
      for (i = 0; i < obj.length; i++) {
        id = obj[i] && obj[i].itemId;
        if (id !== undefined && id !== null) have[String(id)] = 1;
      }
      var n = 0;
      for (i = 0; i < list.length; i++) {
        var iid = list[i];
        if (have[String(iid)]) continue;
        var e = {};
        for (k in tmpl) { if (Object.prototype.hasOwnProperty.call(tmpl, k)) e[k] = tmpl[k]; }
        e.itemId = iid;
        e.uuid = "00000000-0000-0000-0000-" + String(("000000000000" + iid).slice(-12));
        obj.push(e);
        n++;
      }
      if (n) {
        iconInvStat.spoofed++;
        iconInvStat.added += n;
        diag("icon-inv-spoof", { added: n, total: obj.length, lim: lim, round: iconSpoofRound - 1 });
      }
      return n > 0;
    }

    function iconInvTextOf(raw, url) {
      if (typeof raw !== "string" || !raw) return null;
      try { if (!ICON_INV_RE.test(String(url || ""))) return null; } catch (e) { return null; }
      iconInvTouched = true;   
      try {
        var o = JSON.parse(raw);
        var n0 = Array.isArray(o) ? o.length : -1;
        var changed = spoofIconInv(o);
        try {
          diag("icon-inv-call", {
            n0: n0,
            n1: Array.isArray(o) ? o.length : -1,
            changed: changed ? 1 : 0,
            lim: iconLastLim,
            round: iconSpoofRound
          });
        } catch (e2) {  }
        if (!changed) return null;
        return JSON.stringify(o);
      } catch (e) { iconInvStat.skipped++; return null; }
    }

    var ICON_ASSETS_RE = /summoner-icons\.json/;

    function iconAssetsFixTextOf(raw, url) {
      if (typeof raw !== "string" || !raw) return null;
      try { if (!ICON_ASSETS_RE.test(String(url || ""))) return null; } catch (e) { return null; }
      try {
        var o = JSON.parse(raw);
        if (!Array.isArray(o)) return null;
        var n = 0, i, j, rr, ch, e0;
        for (i = 0; i < o.length; i++) {
          var it = o[i];
          if (!it || typeof it !== "object") continue;
          rr = it.rarities;
          ch = false;
          if (Array.isArray(rr)) {
            for (j = 0; j < rr.length; j++) {
              e0 = rr[j];
              if (e0 && typeof e0.rarity === "number" && e0.rarity > 4) { e0.rarity = 4; ch = true; }
            }
          } else { it.rarities = [{ region: "riot", rarity: 0 }]; ch = true; }
          if (ch) n++;
        }
        if (!n) return null;
        diag("icon-assets-rarity-fix", { fixed: n, total: o.length });
        return JSON.stringify(o);
      } catch (e) { return null; }
    }

    function iconFixTextOf(raw, url) {
      var a = null;
      try { a = iconInvTextOf(raw, url); } catch (e) { a = null; }
      if (a != null) return a;
      var b = null;
      try { b = iconAssetsFixTextOf(raw, url); } catch (e) { b = null; }
      return b;
    }

    function patchXhr(xhr) {
      var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
      if (!proto || !xhr) return;
      if (xhr.__prismRpPatched) return;
      var dTxt = Object.getOwnPropertyDescriptor(xhr, "responseText") ||
                 Object.getOwnPropertyDescriptor(proto, "responseText");
      var dResp = Object.getOwnPropertyDescriptor(xhr, "response") ||
                  Object.getOwnPropertyDescriptor(proto, "response");
      if (dTxt && dTxt.get) {
        Object.defineProperty(xhr, "responseText", {
          configurable: true,
          get: function () {
            var raw = dTxt.get.call(xhr);
            var c = xhr.__prismRp;
            if (c && c.raw === raw) return c.out;
            stat.reads++;
            var out = textOf(raw);
            if (out == null) { try { out = iconFixTextOf(raw, xhr.__prismUrl); } catch (e2) {  } }
            xhr.__prismRp = { raw: raw, out: (out == null ? raw : out) };
            return xhr.__prismRp.out;
          }
        });
      }
      if (dResp && dResp.get) {
        Object.defineProperty(xhr, "response", {
          configurable: true,
          get: function () {
            var raw = dResp.get.call(xhr);
            if (typeof raw === "string") {
              var c = xhr.__prismRp;
              if (c && c.raw === raw) return c.out;
              stat.reads++;
              var out = textOf(raw);
              if (out == null) { try { out = iconFixTextOf(raw, xhr.__prismUrl); } catch (e2) {  } }
              xhr.__prismRp = { raw: raw, out: (out == null ? raw : out) };
              return xhr.__prismRp.out;
            }
            if (raw && typeof raw === "object") { try { spoof(raw); } catch (e) {  } }
            return raw;
          }
        });
      }
      xhr.__prismRpPatched = true;
    }

    function patchFetch() {
      var of = window.fetch;
      if (typeof of !== "function" || of.__prismRpWrapped) return;
      var wrapped = function (input, init) {
        var url = "";
        try { url = (typeof input === "string") ? input : ((input && input.url) || ""); } catch (e) { url = ""; }
        try { auditUrl(url); } catch (e) {  }
        var p = of.apply(this, arguments);
        if (ICON_SETS_RE.test(String(url))) { try { iconHealMaybe("sets-fetch"); } catch (eS) {  } }
        if (ICON_INV_RE.test(String(url)) || ICON_ASSETS_RE.test(String(url))) {
          return p.then(function (res) {
            if (!res || !res.ok) return res;
            return res.text().then(function (txt) {
              var out = iconFixTextOf(txt, url);
              if (out == null) return res;
              var r2 = new Response(out, {
                status: res.status, statusText: res.statusText, headers: res.headers
              });
              try { Object.defineProperty(r2, "url", { value: res.url }); } catch (e2) {  }
              return r2;
            }).catch(function () { return res; });
          });
        }
        if (!RE.test(String(url))) return p;
        return p.then(function (res) {
          if (!res || !res.ok) return res;
          return res.text().then(function (txt) {
            var out = textOf(txt);
            if (out == null) return res;
            var r2 = new Response(out, {
              status: res.status, statusText: res.statusText, headers: res.headers
            });
            try { Object.defineProperty(r2, "url", { value: res.url }); } catch (e2) {  }
            return r2;
          }).catch(function () { return res; });
        });
      };
      wrapped.__prismRpWrapped = true;
      window.fetch = wrapped;
    }

    var seenUrl = {};
    function auditUrl(url) {
      var u = String(url || "");
      if (!/rank|profile|summoner|career|inventory|collection|icon|regalia|champion|match|history|statstone|banner|trophy|hovercard|cosmetics|progression|eternal/i.test(u)) return;
      var path = u.replace(/^https?:\/\/[^/]+/i, "").split("?")[0];
      if (seenUrl[path]) return;
      seenUrl[path] = 1;
      diag("rp-url", {
        path: path,
        q: (u.split("?")[1] || "").slice(0, 160),
        hit: RE.test(u),
        top: (window === window.top),
        frames: (function () { try { return window.frames.length; } catch (e) { return -1; } })()
      });
    }

    var installed = false;
    function install() {
      if (installed) return;
      installed = true;
      try { iconLoadAllIds(); } catch (e) {  }
      var okXhr = false, okFetch = false;
      try {
        var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
        if (proto && typeof proto.open === "function" && !proto.__prismRpOpenHooked) {
          var origOpen = proto.open;
          proto.open = function (method, url) {
            try { auditUrl(url); } catch (e) {  }
            try { this.__prismUrl = String(url || ""); } catch (e) {  }
            try { this.__prismMethod = String(method || ""); } catch (e) {  }
            try {
              if (ICON_SETS_RE.test(String(url))) { try { iconHealMaybe("sets-xhr"); } catch (eS) {  } }
              if (RE.test(String(url)) || ICON_INV_RE.test(String(url)) || ICON_ASSETS_RE.test(String(url))) patchXhr(this);
            } catch (e) {  }
            return origOpen.apply(this, arguments);
          };
          try {
            if (typeof proto.send === "function" && !proto.__prismSendHooked) {
              var origSend = proto.send;
              proto.send = function (body) {
                try {
                  var u = String(this.__prismUrl || "");
                  var m = String(this.__prismMethod || "");
                  if (!/^get$/i.test(m) && /challenges|regalia|player-preferences|inventory/i.test(u) && body != null) {
                    var s2;
                    try {
                      s2 = (typeof body === "string") ? body
                         : (Object.prototype.toString.call(body) === "[object ArrayBuffer]" ? "[ArrayBuffer]" : String(body));
                    } catch (e3) { s2 = "[unprintable]"; }
                    diag("write-probe", { m: m, url: u.slice(-72), body: String(s2).slice(0, 700) });
                  }
                } catch (e4) {  }
                return origSend.apply(this, arguments);
              };
              proto.__prismSendHooked = true;
            }
          } catch (e) {  }
          proto.__prismRpOpenHooked = true;
          okXhr = true;
        }
      } catch (e) {  }
      try { patchFetch(); okFetch = true; } catch (e) {  }
      diag("rankprofile-hook", { xhr: okXhr, fetch: okFetch, hasXhr: !!window.XMLHttpRequest });
    }

    return {
      install: install,
      state: function () {
        return { installed: installed, on: on(), reads: stat.reads,
                 spoofed: stat.spoofed, skipped: stat.skipped };
      }
    };
  })();


  var ChallengeSpoof = (function () {
    var SUMMARY_RE = /\/lol-challenges\/v1\/summary-player-data\/(?:local-player|player\/[^\/?]+)/;
    var LIST_RE = /\/lol-challenges\/v1\/challenges\/local-player(?:\/|\?|$)/;
    var CAT_RE = /\/lol-challenges\/v1\/challenges\/category-data(?:\/|\?|$)/;
    var HOVER_RE = /\/lol-hovercard\/v1\/friend-info\/([^\/?]+)/;
    var ME_RE = /\/lol-chat\/v1\/me(?:\/|\?|$)/;
    var RE_ANY = new RegExp(SUMMARY_RE.source + "|" + LIST_RE.source + "|" + CAT_RE.source
                            + "|" + HOVER_RE.source + "|" + ME_RE.source);

    var stat = { spoofed: 0, summary: 0, list: 0, cat: 0, hover: 0, me: 0, put: 0, err: 0 };
    var selfPuuid = "";
    var saidNoPuuid = false;   
    var auditN = {};           

    function audit(m, su) {
      var path = String(su || "").replace(/^https?:\/\/[^/]+/i, "").split("?")[0];
      var key = m + " " + path;
      auditN[key] = (auditN[key] || 0) + 1;
      if (auditN[key] > 3) return;
      diag("chal-url", { m: m, path: path, n: auditN[key] });
    }

    function on() { return !!(cfg && cfg.challengeSpoof); }
    function unlockAll() { return !!(cfg && cfg.challengeUnlockAll); }

    function wantLevel() {
      var L = String((cfg && cfg.challengeLevel) || "").toUpperCase();
      return CHAL_LEVELS.indexOf(L) >= 0 ? L : "CHALLENGER";
    }
    function idx(L) { return CHAL_LEVELS.indexOf(String(L || "").toUpperCase()); }
    function nextLevelOf(L) {
      var i = idx(L);
      return (i >= 0 && i + 1 < CHAL_LEVELS.length) ? CHAL_LEVELS[i + 1] : "";
    }

    function clampLevel(th, want) {
      if (!th || typeof th !== "object") return "";
      for (var i = idx(want); i >= 0; i--) {
        if (th[CHAL_LEVELS[i]]) return CHAL_LEVELS[i];
      }
      for (var j = 0; j < CHAL_LEVELS.length; j++) {
        if (th[CHAL_LEVELS[j]]) return CHAL_LEVELS[j];
      }
      return "";
    }

    function levelTable(th) {
      var o = {}, k;
      if (!th || typeof th !== "object") return o;
      for (k in th) {
        if (!Object.prototype.hasOwnProperty.call(th, k)) continue;
        if (th[k] && th[k].value != null) o[k] = { value: Number(th[k].value) || 0 };
      }
      return o;
    }

    function pointsTable(th) {
      var o = {}, k, j, e, r, sum;
      if (!th || typeof th !== "object") return o;
      for (k in th) {
        if (!Object.prototype.hasOwnProperty.call(th, k)) continue;
        e = th[k];
        if (!e || !isArr(e.rewards)) continue;
        sum = 0;
        for (j = 0; j < e.rewards.length; j++) {
          r = e.rewards[j];
          if (r && String(r.category || "").toUpperCase() === "CHALLENGE_POINTS") {
            sum += (Number(r.quantity) || 0);
          }
        }
        if (sum) o[k] = sum;
      }
      return o;
    }

    function pointsUpTo(th, lv) {
      var upto = idx(lv), sum = 0, i, j;
      if (upto < 0) return 0;
      for (i = 0; i <= upto; i++) {
        var e = th[CHAL_LEVELS[i]];
        if (!e || !isArr(e.rewards)) continue;
        for (j = 0; j < e.rewards.length; j++) {
          var r = e.rewards[j];
          if (r && String(r.category || "").toUpperCase() === "CHALLENGE_POINTS") {
            sum += (Number(r.quantity) || 0);
          }
        }
      }
      return sum;
    }

    function scoreFor(L) {
      var lo = CHAL_CRYSTAL[L];
      if (lo == null) return 0;
      var nx = nextLevelOf(L);
      if (!nx) return Math.round(lo + 2000);            
      var hi = CHAL_CRYSTAL[nx];
      var span = Math.max(1, hi - lo);
      return Math.round(unlockAll() ? (hi - Math.max(1, Math.round(span * 0.02)))
                                    : (lo + span * 0.35));
    }

    function percentileFor(L) {
      var i = idx(L);
      return Math.max(0.1, Math.round((98.6 - i * 11) * 10) / 10);
    }

    function spoofSummary(o, L) {
      o.overallChallengeLevel = L;
      var score = scoreFor(L);
      var nx = nextLevelOf(L);
      o.totalChallengeScore = score;
      o.pointsUntilNextRank = nx ? (CHAL_CRYSTAL[nx] - score) : 0;
      o.positionPercentile = percentileFor(L);
      if (isArr(o.categoryProgress)) {
        for (var i = 0; i < o.categoryProgress.length; i++) {
          var cp = o.categoryProgress[i];
          if (!cp || typeof cp !== "object") continue;
          var maxv = Number(cp.max) || 0;
          cp.level = L;
          cp.current = Math.round(maxv * (unlockAll() ? 0.97 : 0.6));
        }
      }
      stat.summary++;
      return true;
    }

    function spoofChallenge(c, L) {
      if (!c || typeof c !== "object") return false;
      var th = c.thresholds;
      var lv = clampLevel(th, L);
      if (!lv) return false;                       
      var tv = (th[lv] && th[lv].value != null) ? th[lv].value : 0;
      var nx = nextLevelOf(lv);
      while (nx && !th[nx]) nx = nextLevelOf(nx);  
      c.currentLevel = lv;
      c.currentValue = tv;
      c.currentThreshold = tv;
      c.nextLevel = nx || "";
      c.nextThreshold = nx ? (Number(th[nx].value) || 0) : 0;
      c.previousLevel = "";
      c.previousValue = 0;
      c.pointsAwarded = pointsUpTo(th, lv);
      var kids = isArr(c.childrenIds) ? c.childrenIds : null;
      var avail = isArr(c.availableIds) ? c.availableIds : null;
      if (kids && kids.length) c.completedIds = kids.slice();
      else if (avail && avail.length) c.completedIds = avail.slice();
      return true;
    }

    function spoofList(o, L) {
      var ks = Object.keys(o), n = 0;
      for (var i = 0; i < ks.length; i++) if (spoofChallenge(o[ks[i]], L)) n++;
      if (n) { stat.list++; diag("challenge-spoof-list", { level: L, entries: n }); }
      return n > 0;
    }

    var tokenCatalog = {};

    function recordTokenCatalog(o) {
      if (!o || typeof o !== "object") return 0;
      var ks = Object.keys(o), n = 0;
      for (var i = 0; i < ks.length; i++) {
        var c = o[ks[i]];
        if (!c || typeof c !== "object") continue;
        var id = (c.id != null) ? String(c.id) : String(ks[i]);
        tokenCatalog[id] = {
          n: String(c.name || ""),
          l2: (c.levelToIconPath && typeof c.levelToIconPath === "object") ? c.levelToIconPath : null,
          d: String(c.description || c.descriptionShort || ""),
          pa: Number(c.pointsAwarded) || 0,
          pc: (typeof c.percentile === "number") ? c.percentile : null,
          grp: String(c.capstoneGroupName || ""),
          gm: (isArr(c.gameModes) && c.gameModes.length) ? String(c.gameModes[0]) : "",
          bg: String(c.backgroundImagePath || ""),      
          hI: String(c.headerIconPath || ""),           
          tv: levelTable(c.thresholds),
          rw: pointsTable(c.thresholds),
          own: !!(c.currentLevel && String(c.currentLevel).toUpperCase() !== "NONE"),
          ax: !!c.isApex
        };
        n++;
      }
      return n;
    }

    function tokenInfo(id) {
      var e = tokenCatalog[String(id)];
      if (!e) return null;
      var t = [], j;
      for (j = 0; j < CHAL_LEVELS.length; j++) {
        if (e.l2 && e.l2[CHAL_LEVELS[j]]) t.push(CHAL_LEVELS[j]);
      }
      return { id: String(id), name: e.n, tiers: t, own: !!e.own };
    }

    function tokenDetail(id) {
      var e = tokenCatalog[String(id)];
      if (!e) return null;
      var t = [], j;
      for (j = 0; j < CHAL_LEVELS.length; j++) {
        if (e.l2 && e.l2[CHAL_LEVELS[j]]) t.push(CHAL_LEVELS[j]);
      }
      var lv = clampLevel(e.tv || {}, wantLevel());
      var nx = lv ? nextLevelOf(lv) : "";
      while (nx && !(e.tv && e.tv[nx])) nx = nextLevelOf(nx);
      return {
        id: String(id),
        name: e.n,
        desc: e.d || "",
        own: !!e.own,
        tiers: t,
        level: lv || "",
        value: (lv && e.tv && e.tv[lv]) ? e.tv[lv].value : 0,
        next: nx || "",
        nextValue: (nx && e.tv && e.tv[nx]) ? e.tv[nx].value : 0,
        points: e.pa || 0,
        percentile: (e.pc == null) ? null : e.pc,
        group: e.grp || "",
        mode: e.gm || "",
        headerIcon: e.hI || "",
        apex: !!e.ax,
        ribbon: e.bg || "",
        nextReward: (nx && e.rw && e.rw[nx]) ? e.rw[nx] : 0
      };
    }

    function tokenIconUrl(id, tier) {
      var t = String(tier || "").toUpperCase();
      if (idx(t) < 0) return "";
      var e = tokenCatalog[String(id)];
      if (e && e.l2) {
        var use = t, k;
        if (!e.l2[use]) {
          for (k = idx(t); k >= 0; k--) {
            if (e.l2[CHAL_LEVELS[k]]) { use = CHAL_LEVELS[k]; break; }
          }
        }
        if (e.l2[use]) return String(e.l2[use]);
      }
      return "/fe/lol-static-assets/images/challenges-shared/icon_achievement_" + t.toLowerCase() + ".png";
    }

    function spoofCat(o, L) {
      var score = scoreFor(L);
      var nx = nextLevelOf(L);
      var n = 0, ks = Object.keys(o);
      for (var i = 0; i < ks.length; i++) {
        var c = o[ks[i]];
        if (!c || typeof c !== "object") continue;
        var isCrystal = (String(ks[i]) === "0");
        var src = isCrystal ? CHAL_CRYSTAL : null;
        var lv = isCrystal ? L : clampLevel(c.thresholds, L);
        if (!lv) continue;
        var tv, nxt, nextTh;
        if (isCrystal) {
          tv = score;
          nxt = nx;
          nextTh = nx ? CHAL_CRYSTAL[nx] : score;   
        } else {
          var th = c.thresholds;
          tv = (th[lv] && th[lv].value != null) ? Number(th[lv].value) : Number(c.currentValue) || 0;
          nxt = nextLevelOf(lv);
          while (nxt && !th[nxt]) nxt = nextLevelOf(nxt);
          nextTh = nxt ? (Number(th[nxt].value) || 0) : 0;
          c.pointsAwarded = pointsUpTo(th, lv);
        }
        c.currentLevel = lv;
        c.currentValue = tv;
        c.currentThreshold = tv;
        c.nextLevel = nxt || "";
        c.nextThreshold = nextTh;
        c.previousLevel = "";
        c.previousValue = 0;
        if (isCrystal && src) c.percentile = percentileFor(L);
        n++;
      }
      if (n) { stat.cat++; diag("challenge-spoof-cat", { level: L, entries: n }); }
      return n > 0;
    }

    function spoofHover(o, puuid) {
      if (!selfPuuid || !puuid || puuid !== selfPuuid) {
        if (!selfPuuid && !saidNoPuuid) {
          saidNoPuuid = true;
          diag("challenge-hover-skip", { why: "no-self-puuid" });
        }
        return false;
      }
      var lol = o && o.lol;
      if (!lol || typeof lol !== "object") return false;
      var L = wantLevel();
      lol.challengeCrystalLevel = L;
      lol.challengePoints = String(scoreFor(L));
      stat.hover++;
      diag("challenge-spoof-hover", { level: L, points: lol.challengePoints });
      return true;
    }

    var origChal = null;   

    function spoofMe(o, method) {
      var lol = o && o.lol;
      if (!lol || typeof lol !== "object") return false;
      var m = String(method || "GET").toUpperCase();
      if (m === "GET" || m === "HEAD") {
        if (!origChal && typeof lol.challengeCrystalLevel === "string") {
          origChal = { level: lol.challengeCrystalLevel, points: lol.challengePoints };
        }
        var L = wantLevel();
        lol.challengeCrystalLevel = L;
        lol.challengePoints = String(scoreFor(L));
        stat.me++;
        diag("challenge-spoof-me", { level: L, points: lol.challengePoints, method: m });
        try { crestApply(false, "chat"); } catch (e) {  }
        return true;
      }
      if (!origChal) return false;
      var changed = false;
      if (typeof origChal.level === "string" && lol.challengeCrystalLevel !== origChal.level) {
        lol.challengeCrystalLevel = origChal.level; changed = true;
      }
      if (typeof origChal.points === "string" && lol.challengePoints !== origChal.points) {
        lol.challengePoints = origChal.points; changed = true;
      }
      if (changed) {
        stat.put++;
        diag("challenge-chat-restore", { level: lol.challengeCrystalLevel, method: m });
      }
      return changed;
    }

    function applyTo(o, url, method) {
      if (!o || typeof o !== "object") return false;
      var u = String(url || "");
      var L = wantLevel();
      var did = false;
      if (ME_RE.test(u)) did = spoofMe(o, method) || did;
      if (SUMMARY_RE.test(u)) did = spoofSummary(o, L) || did;
      if (CAT_RE.test(u)) did = spoofCat(o, L) || did;
      if (LIST_RE.test(u)) {
        try {
          var cn = recordTokenCatalog(o);
          diag("challenge-token-catalog", { n: cn, total: Object.keys(tokenCatalog).length });
        } catch (e) {
          diag("challenge-token-catalog-error", { msg: String((e && e.message) || e) });
        }
        if (unlockAll()) did = spoofList(o, L) || did;
      }
      if (HOVER_RE.test(u)) {
        var m = HOVER_RE.exec(u);
        did = spoofHover(o, m && m[1]) || did;
      }
      if (did) {
        stat.spoofed++;
        diag("challenge-spoof", {
          level: L, unlockAll: unlockAll(),
          method: String(method || "GET").toUpperCase(),
          path: u.replace(/^https?:\/\/[^/]+/i, "").split("?")[0]
        });
      }
      return did;
    }

    function textOf(raw, url, method) {
      if (typeof raw !== "string" || !raw || !on()) return null;
      if (!RE_ANY.test(String(url || ""))) return null;
      try {
        var o = JSON.parse(raw);
        if (!applyTo(o, url, method)) return null;
        return JSON.stringify(o);
      } catch (e) {
        stat.err++;
        diag("challenge-spoof-error", { msg: String((e && e.message) || e).slice(0, 140) });
        return null;
      }
    }

    function ensureSelfPuuid() {
      if (selfPuuid) return;
      lcuJson("/lol-summoner/v1/current-summoner").then(function (s) {
        if (s && typeof s.puuid === "string" && s.puuid) selfPuuid = s.puuid;
      }).catch(function () {  });
    }

    var seenObj = (typeof WeakSet === "function") ? new WeakSet() : null;

    function patchXhr(xhr, url, method) {
      var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
      if (!proto || !xhr) return;
      var dTxt = Object.getOwnPropertyDescriptor(xhr, "responseText") ||
                 Object.getOwnPropertyDescriptor(proto, "responseText");
      var dResp = Object.getOwnPropertyDescriptor(xhr, "response") ||
                  Object.getOwnPropertyDescriptor(proto, "response");
      var su = String(url || "");
      var m = String(method || "GET").toUpperCase();

      if (ME_RE.test(su) && m !== "GET" && m !== "HEAD" && !xhr.__prismSendWrapped) {
        var oSend = xhr.send;
        xhr.send = function (body) {
          try {
            if (typeof body === "string" && body) {
              var o = JSON.parse(body);
              if (spoofMe(o, m)) body = JSON.stringify(o);
            }
          } catch (e2) {  }
          return oSend.call(this, body);
        };
        xhr.__prismSendWrapped = true;
      }

      if (dTxt && dTxt.get) {
        Object.defineProperty(xhr, "responseText", {
          configurable: true,
          get: function () {
            var raw = dTxt.get.call(xhr);
            learnPuuid(raw, su);
            var c = xhr.__prismCh;
            if (c && c.raw === raw) return c.out;
            var out = textOf(raw, su, m);
            xhr.__prismCh = { raw: raw, out: (out == null ? raw : out) };
            return xhr.__prismCh.out;
          }
        });
      }
      if (dResp && dResp.get) {
        Object.defineProperty(xhr, "response", {
          configurable: true,
          get: function () {
            var raw = dResp.get.call(xhr);
            if (typeof raw === "string") {
              learnPuuid(raw, su);
              var c = xhr.__prismCh;
              if (c && c.raw === raw) return c.out;
              var out = textOf(raw, su, m);
              xhr.__prismCh = { raw: raw, out: (out == null ? raw : out) };
              return xhr.__prismCh.out;
            }
            if (raw && typeof raw === "object") {
              if (seenObj && seenObj.has(raw)) return raw;   
              if (seenObj) seenObj.add(raw);
              try { if (on()) applyTo(raw, su, m); } catch (e) {  }
            }
            return raw;
          }
        });
      }
    }

    function learnPuuid(raw, url) {
      if (selfPuuid || typeof raw !== "string" || !raw || !ME_RE.test(String(url || ""))) return;
      try {
        var o = JSON.parse(raw);
        if (o && typeof o.puuid === "string" && o.puuid) selfPuuid = o.puuid;
      } catch (e) {  }
    }

    function patchFetch() {
      var of = window.fetch;
      if (typeof of !== "function") return;
      if (!rawFetch) rawFetch = of;
      if (of.__prismChWrapped) return;
      var wrapped = function (input, init) {
        var url = "", mm = "GET";
        try {
          url = (typeof input === "string") ? input : ((input && input.url) || "");
          mm = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
        } catch (e) { url = ""; }
        var s = String(url);
        var hit = RE_ANY.test(s);
        if (hit) audit(mm, s);

        if (ME_RE.test(s) && mm !== "GET" && mm !== "HEAD" && init && typeof init.body === "string" && init.body) {
          try {
            var bo = JSON.parse(init.body);
            if (spoofMe(bo, mm)) init = Object.assign({}, init, { body: JSON.stringify(bo) });
          } catch (e0) {  }
        }

        var p = of.call(this, input, init);
        if (ME_RE.test(s)) {
          p = p.then(function (res) {
            try {
              if (res && res.ok && typeof res.clone === "function") {
                res.clone().json().then(function (o) {
                  if (o && typeof o.puuid === "string" && o.puuid) selfPuuid = o.puuid;
                }).catch(function () {  });
              }
            } catch (e) {  }
            return res;
          });
        }
        if (!hit || !on()) return p;
        return p.then(function (res) {
          if (!res || !res.ok) return res;
          return res.text().then(function (txt) {
            var out = textOf(txt, s, mm);
            var r2 = new Response((out == null ? txt : out), {
              status: res.status, statusText: res.statusText, headers: res.headers
            });
            try { Object.defineProperty(r2, "url", { value: res.url }); } catch (e2) {  }
            return r2;
          }).catch(function () { return res; });
        });
      };
      wrapped.__prismChWrapped = true;
      window.fetch = wrapped;
    }

    var installed = false;
    function install() {
      if (installed) return;
      installed = true;
      var okXhr = false, okFetch = false;
      try {
        var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
        if (proto && typeof proto.open === "function" && !proto.__prismChOpenHooked) {
          var origOpen = proto.open;
          proto.open = function (method, url) {
            try {
              var su = String(url);
              if (RE_ANY.test(su)) {
                var mm = String(method || "GET").toUpperCase();
                patchXhr(this, su, mm);   
                audit(mm, su);
              }
            } catch (e) {  }
            return origOpen.apply(this, arguments);
          };
          proto.__prismChOpenHooked = true;
          okXhr = true;
        }
      } catch (e) {  }
      try { patchFetch(); okFetch = true; } catch (e) {  }
      try { ensureSelfPuuid(); } catch (e) {  }
      diag("challenge-hook", { xhr: okXhr, fetch: okFetch, hasXhr: !!window.XMLHttpRequest,
                               rawFetchLocked: !!rawFetch, build: BUILD });
    }

    var crestCache = [];
    var crestScanAt = 0;

    function findCrests(force) {
      var now = Date.now();
      var alive = [], i;
      for (i = 0; i < crestCache.length; i++) {
        try { if (crestCache[i].isConnected) alive.push(crestCache[i]); } catch (e) {  }
      }
      if (alive.length && !force && now - crestScanAt < 800) return alive;
      if (!alive.length && !force && crestScanAt && now - crestScanAt < 2000) return [];
      crestScanAt = now;
      var out = [];
      (function walk(root, depth) {
        if (!root || depth > 6 || out.length > 6) return;
        try {
          var list = root.querySelectorAll("lol-regalia-crest-v2-element");
          for (var k = 0; k < list.length && out.length <= 6; k++) out.push(list[k]);
          var all = root.querySelectorAll("*");
          for (var j = 0; j < all.length; j++) {
            var sr = null;
            try { sr = all[j].shadowRoot; } catch (e) { sr = null; }
            if (sr) walk(sr, depth + 1);
          }
        } catch (e) {  }
      })(document, 0);
      crestCache = out;
      return out;
    }

    var foundHook = null;

    function crestApply(force, by) {
      var want = on() ? wantLevel() : (origChal ? origChal.level : "");
      if (!want) return 0;
      var els = findCrests(force), n = 0, i;
      for (i = 0; i < els.length; i++) {
        var el = els[i], pu = "";
        try { pu = String(el.getAttribute("puuid") || ""); } catch (e) { pu = ""; }
        if (pu && (!selfPuuid || pu !== selfPuuid)) continue;
        if (foundHook) { try { foundHook(el); } catch (e) {  } }
        var cur = "";
        try { cur = String(el.getAttribute("crystal-level") || ""); } catch (e) { cur = ""; }
        if (cur === want) continue;
        try { el.setAttribute("crystal-level", want); n++; } catch (e) {  }
      }
      if (n) diag("challenge-crest", { want: want, n: n, by: by || "-", scan: els.length });
      return n;
    }

    return {
      install: install,
      isOn: function () { return on(); },
      level: wantLevel,
      applyCrest: crestApply,
      setFoundHook: function (fn) { foundHook = (typeof fn === "function") ? fn : null; },
      tokenInfo: tokenInfo,
      tokenIconUrl: tokenIconUrl,
      tokenDetail: tokenDetail,
      catalogSize: function () { return Object.keys(tokenCatalog).length; },
      state: function () {
        return {
          installed: installed, on: on(), level: wantLevel(), unlockAll: unlockAll(),
          selfPuuid: selfPuuid ? (selfPuuid.slice(0, 8) + "…") : "",
          spoofed: stat.spoofed, summary: stat.summary, list: stat.list,
          cat: stat.cat, hover: stat.hover, me: stat.me, put: stat.put, err: stat.err,
          catalog: Object.keys(tokenCatalog).length,
          chatOrig: origChal ? (origChal.level + "/" + origChal.points) : ""
        };
      }
    };
  })();


  var ChampLib = (function () {
    var SUMMARY = "/lol-game-data/assets/v1/champion-summary.json";
    var cache = null;
    var loading = null;

    function norm(s) {
      return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
    }

    function load() {
      if (cache) return Promise.resolve(cache);
      if (loading) return loading;
      loading = lcuJson(SUMMARY).then(function (arr) {
        var out = [];
        if (isArr(arr)) {
          for (var i = 0; i < arr.length; i++) {
            var c = arr[i] || {};
            if (!c.id || c.id <= 0) continue;   
            out.push({
              id: c.id,
              name: c.name || "",          
              desc: c.description || "",   
              alias: c.alias || ""         
            });
          }
        }
        cache = out;
        loading = null;
        diag("champlib-loaded", { count: out.length });
        return cache;
      }).catch(function (e) {
        loading = null;
        diag("champlib-fail", { msg: String(e && e.message || e) });
        return [];
      });
      return loading;
    }

    function labelOf(c) {
      if (!c) return "";
      return c.desc || c.name || c.alias || "";
    }

    function nameOf(id) {
      if (cache) {
        for (var i = 0; i < cache.length; i++) if (cache[i].id === id) return labelOf(cache[i]) || ("#" + id);
      }
      return "#" + id;
    }

    function namesOf(ids) {
      var out = [];
      for (var i = 0; i < (ids || []).length; i++) out.push(nameOf(ids[i]));
      return out;
    }

    function matchOne(list, p) {
      var s = String(p || "").trim();
      if (!s) return null;
      if (/^\d+$/.test(s)) {
        var n = parseInt(s, 10);
        for (var j = 0; j < list.length; j++) if (list[j].id === n) return list[j];
        return null;
      }
      var q = norm(s);
      if (!q) return null;
      for (var k = 0; k < list.length; k++) {
        var c = list[k];
        if (norm(labelOf(c)) === q || norm(c.name) === q || norm(c.alias) === q) return c;
      }
      return null;
    }

    function resolve(text) {
      return load().then(function (list) {
        var chunks = String(text || "").split(/[,，、;；\r\n]+/);
        var ids = [], bad = [], seen = {};
        function push(hit) {
          if (!hit) return false;
          if (!seen[hit.id]) { seen[hit.id] = 1; ids.push(hit.id); }
          return true;
        }
        for (var i = 0; i < chunks.length; i++) {
          var ch = String(chunks[i] || "").trim();
          if (!ch) continue;
          if (push(matchOne(list, ch))) continue;
          var words = ch.split(/\s+/);
          if (words.length < 2) { bad.push(ch); continue; }
          for (var w = 0; w < words.length; w++) {
            if (!words[w]) continue;
            if (!push(matchOne(list, words[w]))) bad.push(words[w]);
          }
        }
        return { ids: ids, unresolved: bad };
      });
    }

    return { load: load, resolve: resolve, namesOf: namesOf, nameOf: nameOf };
  })();


  var DeclineAfterAccept = (function () {
    var POLL_MS = 300;                                   
    var SEL_BOX = ".ready-check-buttons-element";
    var SEL_ACCEPT = ".ready-check-button-accept";
    var SEL_DECLINE = ".ready-check-button-decline";
    var INNER = ".lol-uikit-flat-button-wrapper, .lol-uikit-flat-button";
    var BOUND_ATTR = "data-prism-rc-bound";
    var ACCEPT_EP = "/lol-matchmaking/v1/ready-check/accept";
    var DECLINE_EP = "/lol-matchmaking/v1/ready-check/decline";

    var response = "None";
    var timer = null;
    var bound = [];      
    var offs = [];

    function unbindAll() {
      for (var i = 0; i < bound.length; i++) {
        try { bound[i].el.removeEventListener("click", bound[i].handler, true); } catch (e) {  }
        try { bound[i].el.removeAttribute(BOUND_ATTR); } catch (e) {  }
      }
      bound = [];
    }

    function enableSide(side) {
      var box = document.querySelector(SEL_BOX);
      if (!box) return 0;
      var el = box.querySelector(side === "accept" ? SEL_ACCEPT : SEL_DECLINE);
      if (!el) return 0;
      var n = 0;
      Array.prototype.slice.call(el.classList).forEach(function (c) {
        if (/-disabled$/.test(c)) { el.classList.remove(c); n++; }
      });
      var inners = el.querySelectorAll("lol-uikit-flat-button");
      for (var i = 0; i < inners.length; i++) {
        var root = inners[i].shadowRoot;
        if (!root) continue;
        var list = root.querySelectorAll(INNER);
        for (var j = 0; j < list.length; j++) {
          if (list[j].classList.contains("disabled")) { list[j].classList.remove("disabled"); n++; }
        }
      }
      return n;
    }

    function bindOne(el, side) {
      if (!el || el.hasAttribute(BOUND_ATTR)) return;
      el.setAttribute(BOUND_ATTR, "true");
      var handler = function (ev) {
        try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (e) {  }
        try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (e) {  }
        lcuSend("POST", side === "accept" ? ACCEPT_EP : DECLINE_EP)
          .then(function () { diag("rc-manual", { side: side }); })
          .catch(function (e) { diag("rc-manual-fail", { side: side, msg: String(e && e.message || e) }); });
      };
      el.addEventListener("click", handler, true);
      bound.push({ el: el, handler: handler });
    }

    function paint() {
      var box = document.querySelector(SEL_BOX);
      if (!box) return;
      bindOne(box.querySelector(SEL_ACCEPT), "accept");
      bindOne(box.querySelector(SEL_DECLINE), "decline");
      if (response === "Accepted") {
        var a = enableSide("decline");
        if (a > 0) diag("rc-enabled", { side: "decline", count: a });
      } else if (response === "Declined") {
        var b = enableSide("accept");
        if (b > 0) diag("rc-enabled", { side: "accept", count: b });
      }
    }

    function syncResponse(next) {
      if (next === response) return;
      response = next;
      diag("rc-response", { response: response });
      paint();
    }

    function pollOnce() {
      lcuJson("/lol-matchmaking/v1/ready-check").then(function (rc) {
        syncResponse((rc && rc.playerResponse) || "None");
      }).catch(function () {  });
    }

    function startPoll() {
      if (timer) return;
      pollOnce();
      timer = setInterval(function () {
        try { if (document.hidden) return; } catch (e) {  }
        pollOnce();
      }, POLL_MS);
    }

    function stopPoll() { if (timer) { clearInterval(timer); timer = null; } }

    function reset() { stopPoll(); unbindAll(); response = "None"; }

    function onPhase(e) {
      if (e.data === "ReadyCheck") startPoll();
      else reset();
    }

    return {
      start: function () {
        if (offs.length) return;
        response = "None";
        offs.push(Bus.on("/lol-gameflow/v1/gameflow-phase", onPhase));
        offs.push(Bus.on("/lol-matchmaking/v1/ready-check", function (e) {
          syncResponse(((e.data || {}).playerResponse) || "None");
        }));
        Bus.peek("/lol-gameflow/v1/gameflow-phase").then(function (p) {
          if (p === "ReadyCheck") startPoll();
        }).catch(function () {  });
        diag("rccontrol-on", null);
      },
      stop: function () {
        for (var i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) {  } }
        offs = [];
        reset();
        diag("rccontrol-off", null);
      },
      isOn: function () { return offs.length > 0; }
    };
  })();


  var AutoHonor = (function () {
    var CATS = ["HEART", "COOL", "SHOTCALLER"];
    var offs = [];
    var votedKey = null;    
    var busy = false;

    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    async function run() {
      if (busy) return;
      busy = true;
      try {
        var ballot = null;
        try { ballot = await lcuJson("/lol-honor-v2/v1/ballot"); }
        catch (e) { diag("autohonor-none", { why: "no-ballot" }); return; }
        if (!ballot || typeof ballot !== "object") { diag("autohonor-none", { why: "bad-ballot" }); return; }
        var allies = (ballot.eligibleAllies || []).slice();
        var opps = (ballot.eligibleOpponents || []).slice();
        var total = allies.length + opps.length;
        if (!total) { diag("autohonor-none", { why: "empty" }); return; }
        var key = String(ballot.gameId == null ? "" : ballot.gameId);
        if (key && votedKey === key) { diag("autohonor-skip", { why: "already", key: key }); return; }
        var votes = (ballot.votePool && ballot.votePool.votes) || 1;
        votes = Math.max(1, Math.min(Number(votes) || 1, total));
        shuffle(allies); shuffle(opps);
        var pick = allies.concat(opps).slice(0, votes);
        diag("autohonor-plan", { votes: votes, allies: allies.length, opps: opps.length, willVote: pick.length });
        var ok = 0;
        for (var i = 0; i < pick.length; i++) {
          var p = pick[i] || {};
          var cat = CATS[Math.floor(Math.random() * CATS.length)];
          try {
            await lcuSend("POST", "/lol-honor-v2/v1/honor-player", {
              puuid: p.puuid,
              summonerId: p.summonerId,
              gameId: ballot.gameId,
              honorCategory: cat
            });
            ok++;
            diag("autohonor-vote", { n: i + 1, cat: cat, ally: i < allies.length });
          } catch (e) {
            diag("autohonor-fail", { n: i + 1, msg: String(e && e.message || e) });
          }
        }
        if (ok > 0) { votedKey = key; diag("autohonor-done", { voted: ok }); }
        else diag("autohonor-done", { voted: 0 });
      } finally {
        busy = false;
      }
    }

    function kick() {
      run().catch(function (e) { diag("autohonor-error", { msg: String(e && e.message || e) }); });
      setTimeout(function () {
        run().catch(function () {  });
      }, 3000);
    }

    function onPhase(e) {
      var ph = e.data;
      if (ph === "PreEndOfGame" || ph === "EndOfGame") kick();
    }

    return {
      start: function () {
        if (offs.length) return;
        votedKey = null;
        offs.push(Bus.on("/lol-gameflow/v1/gameflow-phase", onPhase));
        diag("autohonor-on", null);
      },
      stop: function () {
        for (var i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) {  } }
        offs = [];
        diag("autohonor-off", null);
      },
      isOn: function () { return offs.length > 0; }
    };
  })();


  var AutoReturn = (function () {
    var offs = [];
    var seq = 0;

    async function run() {
      var my = ++seq;
      await sleep(2000);
      if (my !== seq) return;
      try {
        await lcuSend("POST", "/lol-lobby/v2/play-again");
        diag("autoreturn-playagain", null);
      } catch (e) {
        diag("autoreturn-fail", { msg: String(e && e.message || e) });
        return;
      }
      if (cfg.autoReturnMode !== "queue") return;
      var tries = 15;
      for (var i = 1; i <= tries; i++) {
        if (my !== seq) return;
        await sleep(1000);
        if (my !== seq) return;
        try {
          await lcuSend("POST", "/lol-lobby/v2/lobby/matchmaking/search");
          diag("autoreturn-queue-ok", { attempt: i });
          return;
        } catch (e) {
          diag("autoreturn-queue-retry", { attempt: i, msg: String(e && e.message || e) });
        }
      }
      diag("autoreturn-queue-fail", { tries: tries });
    }

    function onPhase(e) {
      if (e.data === "EndOfGame") {
        run().catch(function (e2) { diag("autoreturn-error", { msg: String(e2 && e2.message || e2) }); });
      } else {
        seq++;   
      }
    }

    return {
      start: function () {
        if (offs.length) return;
        offs.push(Bus.on("/lol-gameflow/v1/gameflow-phase", onPhase));
        diag("autoreturn-on", { mode: cfg.autoReturnMode });
      },
      stop: function () {
        seq++;
        for (var i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) {  } }
        offs = [];
        diag("autoreturn-off", null);
      },
      isOn: function () { return offs.length > 0; }
    };
  })();


  function flatActions(sess) {
    var out = [], acts = (sess && sess.actions) || [];
    for (var i = 0; i < acts.length; i++) {
      var g = acts[i];
      if (isArr(g)) { for (var j = 0; j < g.length; j++) out.push(g[j]); }
      else if (g) out.push(g);
    }
    return out;
  }

  function myCellOf(sess) {
    var my = (sess && sess.myTeam) || [];
    for (var i = 0; i < my.length; i++) {
      if (my[i] && my[i].cellId === sess.localPlayerCellId) return my[i];
    }
    return null;
  }

  function takenForPick(sess, selfChampId) {
    var s = {};
    flatActions(sess).forEach(function (a) {
      if (a && a.type === "ban" && a.completed && a.championId > 0) s[a.championId] = 1;
    });
    var bans = sess.bans || {};
    [].concat(bans.myTeamBans || [], bans.theirTeamBans || []).forEach(function (id) { if (id > 0) s[id] = 1; });
    if (!sess.allowDuplicatePicks) {
      [].concat(sess.myTeam || [], sess.theirTeam || []).forEach(function (p) {
        if (p && p.championId > 0 && p.championId !== selfChampId) s[p.championId] = 1;
      });
    }
    ((sess.myTeam) || []).forEach(function (p) {
      if (p && p.cellId !== sess.localPlayerCellId && p.championPickIntent > 0) s[p.championPickIntent] = 1;
    });
    return s;
  }

  function takenForBan(sess) {
    var s = {};
    flatActions(sess).forEach(function (a) {
      if (a && a.type === "ban" && a.completed && a.championId > 0) s[a.championId] = 1;
    });
    var bans = sess.bans || {};
    [].concat(bans.myTeamBans || [], bans.theirTeamBans || []).forEach(function (id) { if (id > 0) s[id] = 1; });
    ((sess.myTeam) || []).forEach(function (p) {
      if (p && p.cellId !== sess.localPlayerCellId && p.championPickIntent > 0) s[p.championPickIntent] = 1;
    });
    return s;
  }

  function chooseTarget(ids, taken, disabled, allowed) {
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id || id <= 0) continue;
      if (taken[id]) continue;
      if (disabled && disabled[id]) continue;
      if (allowed && !allowed[id]) continue;
      return id;
    }
    return null;
  }

  function patchAction(actionId, body) {
    return lcuSend("PATCH", "/lol-champ-select/v1/session/actions/" + actionId, body);
  }

  function inChampSelect() {
    return lcuJson("/lol-gameflow/v1/gameflow-phase")
      .then(function (p) { return p === "ChampSelect"; })
      .catch(function () { return false; });
  }


  var AutoLockChampion = (function () {
    var MAX_TRIES = 300;
    var TICK_MS = 1000;
    var FAST_MS = 250;
    var offs = [];
    var seq = 0;

    function isRankedLike(qid) { return qid === 420 || qid === 440; }

    async function run() {
      var ids = (cfg.autoLockChampionIds || []).slice();
      if (!ids.length) { diag("autolock-skip", { why: "no-target" }); return; }
      var my = ++seq;
      var checkedAutofill = false;

      for (var i = 0; i < MAX_TRIES; i++) {
        if (my !== seq || !cfg.autoLockChampion) return;

        var sess = null;
        try { sess = await Bus.peek("/lol-champ-select/v1/session"); }
        catch (e) { await sleep(TICK_MS); continue; }
        if (!sess || !sess.actions) { await sleep(FAST_MS); continue; }

        if (!checkedAutofill) {
          var me0 = myCellOf(sess);
          if (sess.queueId <= 0 || (isRankedLike(sess.queueId) && !(me0 && me0.assignedPosition))) {
            await sleep(FAST_MS); continue;
          }
          if (me0 && me0.isAutofilled === true) {
            diag("autolock-skip", { why: "isAutofilled", queueId: sess.queueId });
            return;
          }
          checkedAutofill = true;
        }

        var acts = flatActions(sess);
        if (!acts.length) { await sleep(TICK_MS); continue; }

        var pick = null, hasOwnPick = false;
        for (var k = 0; k < acts.length; k++) {
          var a = acts[k];
          if (!a || a.type !== "pick" || a.actorCellId !== sess.localPlayerCellId) continue;
          hasOwnPick = true;
          if (!a.completed) { pick = a; break; }
        }
        if (!pick) {
          if (!hasOwnPick) { diag("autolock-skip", { why: "no-pick-action" }); return; }
          await sleep(TICK_MS); continue;
        }

        var pickable = null, disabled = null;
        try { pickable = await idSet("/lol-champ-select/v1/pickable-champion-ids"); } catch (e) {  }
        try { disabled = await idSet("/lol-champ-select/v1/disabled-champion-ids"); } catch (e) {  }
        var target = chooseTarget(ids, takenForPick(sess, pick.championId), disabled, pickable);
        if (!target) { await sleep(TICK_MS); continue; }

        var phase = (sess.timer && sess.timer.phase) || "";

        if (phase === "PLANNING") {
          try {
            await patchAction(pick.id, { championId: target });
            diag("autolock-preselect", { champ: target, actionId: pick.id });
          } catch (e) {
            diag("autolock-preselect-fail", { champ: target, msg: String(e && e.message || e) });
          }
          await sleep(TICK_MS); continue;
        }

        if (!pick.isInProgress) { await sleep(TICK_MS); continue; }

        if (cfg.autoLockMode !== "instant") {
          try {
            await patchAction(pick.id, { championId: target });
            diag("autolock-preselect-only", { champ: target, actionId: pick.id });
          } catch (e) {  }
          await sleep(TICK_MS); continue;
        }

        try {
          await patchAction(pick.id, {
            actorCellId: sess.localPlayerCellId,
            championId: target,
            completed: true,
            id: pick.id,
            isAllyAction: true,
            type: "pick"
          });
          diag("autolock-locked", { champ: target, actionId: pick.id });
          return;
        } catch (e) {
          diag("autolock-lock-fallback", { champ: target, msg: String(e && e.message || e) });
          try {
            await patchAction(pick.id, { championId: target });
            await lcuSend("POST", "/lol-champ-select/v1/session/actions/" + pick.id + "/complete");
            diag("autolock-locked", { champ: target, actionId: pick.id, via: "complete" });
            return;
          } catch (e2) {
            diag("autolock-fail", { champ: target, msg: String(e2 && e2.message || e2) });
          }
        }
        await sleep(TICK_MS);
      }
      diag("autolock-timeout", { tries: MAX_TRIES });
    }

    function onPhase(e) {
      if (e.data === "ChampSelect") {
        run().catch(function (e2) { diag("autolock-error", { msg: String(e2 && e2.message || e2) }); });
      } else {
        seq++;   
      }
    }

    return {
      start: function () {
        if (offs.length) return;
        offs.push(Bus.on("/lol-gameflow/v1/gameflow-phase", onPhase));
        Bus.peek("/lol-gameflow/v1/gameflow-phase").then(function (p) {
          if (p === "ChampSelect") onPhase({ data: "ChampSelect" });
        }).catch(function () {  });
        diag("autolock-on", { mode: cfg.autoLockMode, targets: (cfg.autoLockChampionIds || []).length });
      },
      stop: function () {
        seq++;
        for (var i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) {  } }
        offs = [];
        diag("autolock-off", null);
      },
      isOn: function () { return offs.length > 0; }
    };
  })();


  var AutoBanChampion = (function () {
    var MAX_TRIES = 600;
    var TICK_MS = 500;
    var VERIFY_MS = [80, 180];
    var offs = [];
    var seq = 0;

    async function verify(actionId, champId) {
      var readOk = false;
      for (var i = 0; i < VERIFY_MS.length; i++) {
        await sleep(VERIFY_MS[i]);
        try {
          var sess = await Bus.peek("/lol-champ-select/v1/session");
          readOk = true;
          var bans = sess.bans || {};
          if ((bans.myTeamBans || []).indexOf(champId) >= 0) return true;
          if ((bans.theirTeamBans || []).indexOf(champId) >= 0) return true;
          var acts = flatActions(sess);
          for (var j = 0; j < acts.length; j++) {
            var a = acts[j];
            if (a && a.id === actionId && a.completed && a.championId === champId) return true;
          }
        } catch (e) {  }
      }
      return readOk ? false : null;   
    }

    async function submit(action, champId) {
      var path = "/lol-champ-select/v1/session/actions/" + action.id;
      try {
        await lcuSend("PATCH", path, { championId: champId, completed: true, type: "ban" });
        var v1 = await verify(action.id, champId);
        if (v1 !== false) return true;
        diag("autoban-verify-lag", { champ: champId, actionId: action.id });
      } catch (e) {
        diag("autoban-patch-fail", { champ: champId, msg: String(e && e.message || e) });
      }
      try {
        await lcuSend("PATCH", path, { championId: champId });
        await lcuSend("POST", path + "/complete");
        var v2 = await verify(action.id, champId);
        return v2 !== false;
      } catch (e2) {
        diag("autoban-fallback-fail", { champ: champId, msg: String(e2 && e2.message || e2) });
        return false;
      }
    }

    async function run() {
      var ids = (cfg.autoBanChampionIds || []).slice();
      if (!ids.length) { diag("autoban-skip", { why: "no-target" }); return; }
      var my = ++seq;

      for (var i = 0; i < MAX_TRIES; i++) {
        if (my !== seq || !cfg.autoBanChampion) return;

        var sess = null;
        try { sess = await Bus.peek("/lol-champ-select/v1/session"); }
        catch (e) {
          if (!(await inChampSelect())) { diag("autoban-stop", { why: "left-champselect" }); return; }
          await sleep(TICK_MS); continue;
        }
        if (!sess || !sess.actions) { await sleep(TICK_MS); continue; }

        var acts = flatActions(sess);
        if (!acts.length) { await sleep(TICK_MS); continue; }

        var mine = [], anyDone = false;
        for (var j = 0; j < acts.length; j++) {
          var a = acts[j];
          if (!a || a.actorCellId !== sess.localPlayerCellId || a.type !== "ban") continue;
          if (a.completed) anyDone = true; else mine.push(a);
        }

        if (!mine.length) {
          if (anyDone) { diag("autoban-done", { why: "already-banned" }); return; }
          if (sess.benchEnabled) { diag("autoban-skip", { why: "bench-mode" }); return; }
          var phase0 = (sess.timer && sess.timer.phase) || "";
          if (phase0 === "FINALIZATION" || phase0 === "GAME_STARTING") {
            diag("autoban-skip", { why: "phase-" + phase0 });
            return;
          }
          await sleep(TICK_MS); continue;
        }

        var action = null;
        for (var m = 0; m < mine.length; m++) { if (mine[m].isInProgress) { action = mine[m]; break; } }
        if (!action) { await sleep(TICK_MS); continue; }

        var bannable = null, disabled = null;
        try { bannable = await idSet("/lol-champ-select/v1/bannable-champion-ids"); } catch (e) {  }
        try { disabled = await idSet("/lol-champ-select/v1/disabled-champion-ids"); } catch (e) {  }
        var target = chooseTarget(ids, takenForBan(sess), disabled, bannable);
        if (!target) { await sleep(TICK_MS); continue; }

        diag("autoban-try", { champ: target, actionId: action.id });
        if (await submit(action, target)) {
          diag("autoban-ok", { champ: target });
          return;
        }
        diag("autoban-retry", { champ: target });
        await sleep(TICK_MS);
      }
      diag("autoban-timeout", { tries: MAX_TRIES });
    }

    function onPhase(e) {
      if (e.data === "ChampSelect") {
        run().catch(function (e2) { diag("autoban-error", { msg: String(e2 && e2.message || e2) }); });
      } else {
        seq++;
      }
    }

    return {
      start: function () {
        if (offs.length) return;
        offs.push(Bus.on("/lol-gameflow/v1/gameflow-phase", onPhase));
        offs.push(Bus.on("/lol-champ-select/v1/session", function (e) {
          if (e.eventType === "Delete") { seq++; return; }
          if (cfg.autoBanChampion) {
            Bus.peek("/lol-gameflow/v1/gameflow-phase").then(function (p) {
              if (p === "ChampSelect") onPhase({ data: "ChampSelect" });
            }).catch(function () {  });
          }
        }));
        Bus.peek("/lol-gameflow/v1/gameflow-phase").then(function (p) {
          if (p === "ChampSelect") onPhase({ data: "ChampSelect" });
        }).catch(function () {  });
        diag("autoban-on", { targets: (cfg.autoBanChampionIds || []).length });
      },
      stop: function () {
        seq++;
        for (var i = 0; i < offs.length; i++) { try { offs[i](); } catch (e) {  } }
        offs = [];
        diag("autoban-off", null);
      },
      isOn: function () { return offs.length > 0; }
    };
  })();


  var MatchForge = (function () {
    var RE_MH = /\/lol-match-history\/v1\/products\/lol\/(?:current-summoner|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\/matches(?:\?|$)/;
    var RE_MH_GAME = /\/lol-match-history\/v1\/games\/\d+(?:\?|$)/;
    var TTL_MS = 90 * 1000;
    var cache = { want: "", puuid: "", text: "", count: 0, at: 0, busy: false, err: "",
                  summonerId: "", profile: null, cosmetic: null, tries: 0,
                  mates: null, matesMeta: null, matesWide: null, matesMetaWide: null };
    var stat = { reads: 0, hits: 0, warm: 0, err: 0, rewrite: 0, self: 0, chat: 0, restore: 0,
                 blocked: 0, trip: 0, game: 0 };

    var RE_CM = /\/lol-champion-mastery\/v1\/([^\/\?]+)\//;
    var localPuuid = "";
    var localSid = "";
    var localAccountId = 0;      

    var RE_SELF = /\/lol-summoner\/v1\/current-summoner(?:\?|$)/;
    var RE_CHAT = /\/lol-chat\/v1\/me(?:\?|$)/;
    var localProf = { gameName: "", tagLine: "", summonerLevel: 0, profileIconId: 0, ok: false };

    var RE_PROF = [
      [/^(\/lol-ranked\/v1\/(?:ranked-stats|league-ladders)\/)([^\/\?]+)/, "p"],
      [/^(\/lol-statstones\/v1\/profile-summary\/)([^\/\?]+)/, "p"],
      [/^(\/lol-banners\/v1\/players\/)([^\/\?]+)/, "p"],
      [/^(\/lol-trophies\/v1\/players\/)([^\/\?]+)/, "p"],
      [/^(\/lol-summoner\/v2\/summoners\/puuid\/)([^\/\?]+)/, "p"],
      [/^(\/lol-hovercard\/v1\/friend-info\/)([^\/\?]+)/, "p"],
      [/^(\/lol-regalia\/v2\/summoners\/)([^\/\?]+)/, "s"],
      [/^(\/lol-collections\/v1\/inventories\/)([^\/\?]+)(\/backdrop)/, "s"],
      [/^(\/lol-summoner\/v1\/summoners\/)([^\/\?]+)/, "s"]
    ];

    function learnLocalId() {
      if (localPuuid && localSid && localProf.ok) return;
      try {
        lcuRaw("/lol-summoner/v1/current-summoner").then(function (r) {
          return (r && r.ok) ? r.json() : null;
        }).then(function (o) {
          if (!o) return;
          if (o.puuid) localPuuid = String(o.puuid);
          if (o.summonerId) localSid = String(o.summonerId);
          if (o.accountId) localAccountId = Number(o.accountId) || 0;   
          localProf = {
            gameName: String(o.gameName || ""),
            tagLine: String(o.tagLine || ""),
            summonerLevel: Number(o.summonerLevel) || 0,
            profileIconId: Number(o.profileIconId) || 0,
            ok: true
          };
        }).catch(function () {  });
      } catch (e) {  }
    }

    var STRIKES = 3, STRIKE_WINDOW = 15000, BLOCK_MS = 10 * 60 * 1000;
    var BREAKER = { hits: {}, blocked: {} };

    function shapeOf(u) {
      var s = String(u || "").replace(/^https?:\/\/[^\/]+/i, "").split("?")[0];
      s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "#");
      s = s.replace(/\/\d{4,}/g, "/#");
      return s;
    }
    function noteFail(url) {
      var k = shapeOf(url), now = Date.now();
      if (!k || BREAKER.blocked[k]) return;
      var e = BREAKER.hits[k];
      if (!e || (now - e.at) > STRIKE_WINDOW) e = BREAKER.hits[k] = { n: 0, at: now };
      e.n++; e.at = now;
      if (e.n < STRIKES) return;
      delete BREAKER.hits[k];
      BREAKER.blocked[k] = now + BLOCK_MS;
      stat.trip++;
      try { diag("mh-forge-rewrite-block", { shape: k, strikes: STRIKES }); } catch (e2) {  }
    }
    function blockedNow(url) {
      var k = shapeOf(url);
      var until = BREAKER.blocked[k];
      if (!until) return false;
      if (Date.now() > until) { delete BREAKER.blocked[k]; return false; }
      stat.blocked++;
      return true;
    }
    function clearBreaker() { BREAKER.hits = {}; BREAKER.blocked = {}; }

    var forgeRev = 0, lastWant = "";
    function bumpForgeRev() {
      forgeRev++;
      try {
        var de = document.documentElement;
        if (de) de.setAttribute("data-prism-forge-rev", String(forgeRev));
      } catch (e) {  }
      try { diag("mh-forge-rev", { rev: forgeRev, want: cache.want }); } catch (e2) {  }
    }

    function rewriteUrl(url) {
      var s = String(url || "");
      if (!on() || !s) return null;
      try { if (blockedNow(s)) return null; } catch (e) {  }
      if (!cache.puuid) { try { warm(false); } catch (e) {  } return null; }
      var path = s.replace(/^https?:\/\/[^\/]+/i, "");
      var m, who, isLocal, tgt;
      var note = function (f, t) {
        stat.rewrite++;
        try { diag("mh-forge-rewrite", { from: f, to: t }); } catch (e) {  }
      };

      m = RE_CM.exec(s);
      if (m) {
        who = m[1];
        isLocal = (who === "local-player" || who === "current-summoner" ||
                   (localPuuid && who === localPuuid));
        if (isLocal && who !== cache.puuid) {
          note(who, cache.puuid);
          return s.replace("/v1/" + who + "/", "/v1/" + cache.puuid + "/");
        }
        return null;
      }

      m = /^\/lol-challenges\/v1\/summary-player-data\/(?:local-player|player\/([^\/\?]+))/.exec(path);
      if (m) {
        who = m[1] || "local-player";
        isLocal = (who === "local-player" || (localPuuid && who === localPuuid));
        if (isLocal && who !== cache.puuid) {
          note("summary/" + who, cache.puuid);
          return s.replace(/summary-player-data\/(?:local-player|player\/[^\/\?]+)/,
                           "summary-player-data/player/" + cache.puuid);
        }
        return null;
      }

      var RESHAPE = [
        [/^\/lol-regalia\/v2\/current-summoner\/regalia(?:\?|$)/,
         "/lol-regalia/v2/summoners/" + cache.summonerId + "/regalia"],
        [/^\/lol-trophies\/v1\/current-summoner\/trophies\/profile/,
         "/lol-trophies/v1/players/" + cache.puuid + "/trophies/profile"],
        [/^\/lol-ranked\/v1\/current-ranked-stats/,
         "/lol-ranked/v1/ranked-stats/" + cache.puuid]
      ];
      if (!cache.summonerId) {
        var keep = [];
        for (var k0 = 0; k0 < RESHAPE.length; k0++) {
          if (k0 !== 0) keep.push(RESHAPE[k0]);   
        }
        RESHAPE = keep;
      }
      for (var j = 0; j < RESHAPE.length; j++) {
        if (RESHAPE[j][0].test(path)) {
          note("reshape:" + path.slice(0, 34), RESHAPE[j][1]);
          return s.replace(path, RESHAPE[j][1]);
        }
      }

      for (var i = 0; i < RE_PROF.length; i++) {
        m = RE_PROF[i][0].exec(path);
        if (!m) continue;
        var kind = RE_PROF[i][1];
        who = m[2];
        tgt = (kind === "p") ? cache.puuid : String(cache.summonerId || "");
        if (!tgt) return null;
        isLocal = (who === "local-player" || who === "current-summoner" ||
                   (kind === "p" && localPuuid && who === localPuuid) ||
                   (kind === "s" && localSid && who === localSid));
        if (!isLocal || who === tgt) return null;
        note(path.slice(0, 40) + "::" + who, tgt);
        return s.replace(m[1] + who, m[1] + tgt);
      }
      return null;
    }
    function patchGameText(raw) {
      if (!cache.puuid) return null;
      try {
        var o = JSON.parse(raw);
        if (!o || typeof o !== "object") return null;
        var ids = o.participantIdentities, ps = o.participants;
        if (!ids || !ps || !ids.length) return null;
        var t = -1, i, pl, pu;
        for (i = 0; i < ids.length && t < 0; i++) {
          pl = (ids[i] && ids[i].player) || {};
          pu = String(pl.puuid || "");
          if (pu && pu === String(cache.puuid)) t = i;
        }
        if (t < 0 && localPuuid) {
          for (i = 0; i < ids.length && t < 0; i++) {
            pl = (ids[i] && ids[i].player) || {};
            if (String(pl.puuid || "") === String(localPuuid)) t = i;
          }
        }
        if (t < 0) return null;
        if (localPuuid) pl.puuid = localPuuid;
        if (localAccountId) { pl.accountId = localAccountId; pl.currentAccountId = localAccountId; }
        if (localSid) pl.summonerId = Number(localSid) || pl.summonerId;
        stat.game++;
        try { diag("mh-forge-game", { gameId: o.gameId, was: t, ids: ids.length, reorder: false }); } catch (e2) {  }
        return JSON.stringify(o);
      } catch (e3) { return null; }
    }

    function patchSelfText(raw) {
      var p = cache.profile;
      if (!p || !p.gameName) return null;
      try {
        var o = JSON.parse(raw);
        if (!o || typeof o !== "object") return null;
        o.gameName = String(p.gameName);
        o.tagLine = String(p.tagLine || "");
        if (typeof p.summonerLevel === "number" && p.summonerLevel > 0) o.summonerLevel = p.summonerLevel;
        if (typeof p.profileIconId === "number" && p.profileIconId > 0) o.profileIconId = p.profileIconId;
        if (typeof p.xpSinceLastLevel === "number") o.xpSinceLastLevel = p.xpSinceLastLevel;
        if (typeof p.xpUntilNextLevel === "number") o.xpUntilNextLevel = p.xpUntilNextLevel;
        if (typeof p.percentCompleteForNextLevel === "number") o.percentCompleteForNextLevel = p.percentCompleteForNextLevel;
        stat.self++;
        try { diag("mh-forge-self", { name: o.gameName, lv: o.summonerLevel, icon: o.profileIconId }); } catch (e) {  }
        return JSON.stringify(o);
      } catch (e) { return null; }
    }

    function patchChatText(raw, method) {
      var m = String(method || "GET").toUpperCase();
      var p = cache.profile;
      try {
        var o = JSON.parse(raw);
        if (!o || typeof o !== "object") return null;

        if (m !== "GET" && m !== "HEAD") {
          if (!localProf.ok) return null;
          var ch = false;
          if (p && localProf.gameName && o.gameName === p.gameName) { o.gameName = localProf.gameName; ch = true; }
          if (p && localProf.tagLine && o.gameTag === p.tagLine) { o.gameTag = localProf.tagLine; ch = true; }
          if (p && localProf.profileIconId && o.icon === p.profileIconId) { o.icon = localProf.profileIconId; ch = true; }
          if (p && localProf.summonerLevel && o.lol && typeof o.lol === "object" &&
              String(o.lol.level) === String(p.summonerLevel)) {
            o.lol.level = String(localProf.summonerLevel); ch = true;
          }
          if (ch) {
            stat.restore++;
            try { diag("mh-forge-restore", { method: m }); } catch (e2) {  }
          }
          return ch ? JSON.stringify(o) : null;
        }

        if (!p || !p.gameName) return null;
        o.gameName = String(p.gameName);
        o.gameTag = String(p.tagLine || "");
        if (typeof p.profileIconId === "number" && p.profileIconId > 0) o.icon = p.profileIconId;
        if (o.lol && typeof o.lol === "object" &&
            typeof p.summonerLevel === "number" && p.summonerLevel > 0) {
          o.lol.level = String(p.summonerLevel);
        }
        stat.chat++;
        try { diag("mh-forge-chat", { name: o.gameName, lv: (o.lol || {}).level, icon: o.icon }); } catch (e3) {  }
        return JSON.stringify(o);
      } catch (e) { return null; }
    }

    var installed = false;

    function on() { return !!(cfg && cfg.mhForge && cfg.mhForgeName); }

    function forgeClass(flag) {
      try {
        var de = document && document.documentElement;
        if (!de || !de.classList) return;
        if (flag) de.classList.add("prism-forge-on");
        else de.classList.remove("prism-forge-on");
      } catch (e) {  }
    }

    function want() {
      return String((cfg && cfg.mhForgeName) || "").trim().replace(/\s+/g, "");
    }

    function apiFetch(path) {
      var f = (typeof rawFetch === "function") ? rawFetch : fetch;
      return f(API + path, { cache: "no-store" });
    }

    function apiJson(path) {
      return apiFetch(path).then(function (r) { return (r && r.ok) ? r.json() : null; });
    }

    function warm(force) {
      if (!on()) return;
      var w = want();
      if (!w) return;
      var fresh = cache.text && cache.want === w && (Date.now() - cache.at) < TTL_MS;
      if (fresh && !force) return;
      if (cache.busy) return;
      cache.busy = true;
      apiFetch("/api/q/mh?endIndex=19&begIndex=0&name=" + encodeURIComponent(w))
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (o) {
          if (o && o.ok && o.payload) {
            cache.text = JSON.stringify(o.payload);
            if (w !== lastWant) { lastWant = w; bumpForgeRev(); }
            cache.want = w;
            cache.puuid = String(o.puuid || "");
            cache.summonerId = String(o.summonerId || "");
            cache.profile = (o.profile && typeof o.profile === "object" &&
                             o.profile.gameName) ? o.profile : null;
            cache.cosmetic = (o.cosmetic && typeof o.cosmetic === "object") ? o.cosmetic : null;
            cache.mates = (o.mates && o.mates.length) ? o.mates : null;
            cache.matesMeta = (o.matesMeta && typeof o.matesMeta === "object") ? o.matesMeta : null;
            cache.matesWide = (o.matesWide && o.matesWide.length) ? o.matesWide : null;
            cache.matesMetaWide = (o.matesMetaWide && typeof o.matesMetaWide === "object") ? o.matesMetaWide : null;
            forgeClass(on() && !!(cache.cosmetic && cache.cosmetic.iconUrl));
            cache.count = Number(o.count) || 0;
            cache.at = Date.now();
            cache.err = "";
            cache.tries = 0;      
            stat.warm++;
            try {
              diag("mh-forge-profile", cache.profile ? {
                gameName: cache.profile.gameName, tagLine: cache.profile.tagLine,
                lv: cache.profile.summonerLevel, icon: cache.profile.profileIconId,
                sid: cache.profile.summonerId
              } : { missing: true });
            } catch (e5) {  }
          } else {
            cache.err = (o && o.error) || "接口返回异常";
            stat.err++;
          }
          diag("mh-forge-warm", { want: w, ok: !!cache.text, err: cache.err,
                                  count: (o && o.count) || 0, puuid: cache.puuid });
        })
        .catch(function (e) {
          cache.err = String(e && e.message || e);
          stat.err++;
          try { diag("mh-forge-warm-err", { err: cache.err, tries: cache.tries,
                                            url: (API + "/api/q/mh") }); } catch (e3) {  }
          if (on() && cache.tries < 5) {
            cache.tries++;
            var wait = Math.min(1000 * Math.pow(2, cache.tries - 1), 15000);
            setTimeout(function () { try { warm(true); } catch (e2) {  } }, wait);
          }
        })
        .then(function () { cache.busy = false; });
    }

    function textFor(url, raw, method) {
      if (!on()) return null;
      var s = String(url || "");
      if (RE_MH.test(s)) {
        stat.reads++;
        if (cache.want !== want() || (Date.now() - cache.at) >= TTL_MS) {
          try { warm(false); } catch (e) {  }   
        }
        if (!cache.text) return null;
        stat.hits++;
        return cache.text;
      }
      if (RE_MH_GAME.test(s)) {
        return patchGameText(raw);
      }
      if (RE_SELF.test(s)) {
        if (!cache.profile) return null;
        return patchSelfText(raw);
      }
      if (RE_CHAT.test(s)) {
        if (!cache.profile && !localProf.ok) return null;
        return patchChatText(raw, method);
      }
      return null;
    }

    function descOn(xhr, proto, prop) {
      return Object.getOwnPropertyDescriptor(xhr, prop) ||
             Object.getOwnPropertyDescriptor(proto, prop);
    }

    function patchXhr(xhr) {
      var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
      if (!proto || !xhr || xhr.__prismMhPatched) return;
      var dTxt = descOn(xhr, proto, "responseText");
      var dResp = descOn(xhr, proto, "response");
      var compute = function (raw) {
        var c = xhr.__prismMhC;
        if (c && c.raw === raw) return c.out;
        var out = textFor(xhr.__prismMhUrl, raw, xhr.__prismMhMethod);
        xhr.__prismMhC = { raw: raw, out: (out == null ? raw : out) };
        return xhr.__prismMhC.out;
      };
      if (dTxt && dTxt.get) {
        Object.defineProperty(xhr, "responseText", {
          configurable: true,
          get: function () { return compute(dTxt.get.call(xhr)); }
        });
      }
      if (dResp && dResp.get) {
        Object.defineProperty(xhr, "response", {
          configurable: true,
          get: function () {
            var raw = dResp.get.call(xhr);
            if (typeof raw !== "string") return raw;      
            return compute(raw);
          }
        });
      }
      xhr.__prismMhPatched = true;
    }

    function installXhr() {
      var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
      if (!proto || typeof proto.open !== "function") return false;
      if (proto.__prismMhOpenHooked) return true;
      var origOpen = proto.open;
      proto.open = function (method, url) {
        var u = String(url || "");
        var nu = null;
        try { nu = rewriteUrl(u); } catch (e) { nu = null; }
        try {
          this.__prismRwOrig = nu ? u : "";
          if (nu && !this.__prismRwHooked) {
            this.__prismRwHooked = true;
            var xs = this;
            this.addEventListener("loadend", function () {
              try {
                if (xs.status >= 400 && xs.__prismRwOrig) noteFail(xs.__prismRwOrig);
              } catch (e) {  }
            });
          }
        } catch (e) {  }
        var r = origOpen.call(this, method, nu || url);
        try {
          if (RE_MH.test(u) || RE_MH_GAME.test(u) || RE_SELF.test(u) || RE_CHAT.test(u)) {
            this.__prismMhUrl = u;
            this.__prismMhMethod = method;
            this.__prismMhC = null;            
            patchXhr(this);
          }
        } catch (e) {  }
        return r;
      };
      proto.__prismMhOpenHooked = true;
      return true;
    }

    function installFetch() {
      var of = window.fetch;
      if (typeof of !== "function" || of.__prismMhWrapped) return !!of;
      var rebuild = function (res, text) {
        var r2 = new Response(text, {
          status: res.status, statusText: res.statusText, headers: res.headers
        });
        try { Object.defineProperty(r2, "url", { value: res.url }); } catch (e2) {  }
        return r2;
      };
      var wrapped = function (input, init) {
        var url = "", mm = "GET";
        try {
          url = (typeof input === "string") ? input : ((input && input.url) || "");
          mm = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
        } catch (e) { url = ""; }
        var s = String(url);
        var nu = null;
        try { nu = rewriteUrl(s); } catch (e2) { nu = null; }
        var realInput = input;
        if (nu) {
          try { realInput = (typeof input === "string") ? nu : new Request(nu, input); }
          catch (e3) { realInput = input; nu = null; }
        }
        if (RE_CHAT.test(s) && mm !== "GET" && mm !== "HEAD" &&
            init && typeof init.body === "string" && init.body) {
          try {
            var nb = patchChatText(init.body, mm);
            if (nb) init = Object.assign({}, init, { body: nb });
          } catch (e4) {  }
        }
        var p = of.call(this, realInput, init);
        if (nu) {
          try {
            p.then(function (res) {
              try { if (res && res.status >= 400) noteFail(s); } catch (e) {  }
              return res;
            }, function () {  });
          } catch (e) {  }
        }
        var hitMh = RE_MH.test(s), hitGame = RE_MH_GAME.test(s);
        var hitSelf = RE_SELF.test(s), hitChat = RE_CHAT.test(s);
        if (!hitMh && !hitGame && !hitSelf && !hitChat) return p;
        return p.then(function (res) {
          if (!res || !res.ok) return res;
          if (hitMh) {
            var out = textFor(s, null, mm);
            return (out == null) ? res : rebuild(res, out);
          }
          return res.text().then(function (raw) {
            var o2 = textFor(s, raw, mm);
            return rebuild(res, (o2 == null ? raw : o2));
          });
        }).catch(function () { return p; });
      };
      wrapped.__prismMhWrapped = true;
      window.fetch = wrapped;
      return true;
    }

    function install() {
      if (installed) { warm(false); return true; }
      var a = false, b = false;
      try { a = installFetch(); } catch (e) {  }
      try { b = installXhr(); } catch (e) {  }
      installed = true;
      diag("mh-forge-hook", { fetch: a, xhr: b, build: BUILD });
      learnLocalId();   
      warm(false);
      return a || b;
    }

    return {
      install: install,
      warm: warm,
      forgeData: function () {
        var c = cache.cosmetic || {};
        return {
          on: on(),
          name: want(),
          puuid: cache.puuid,
          summonerId: cache.summonerId,
          iconUrl: c.iconUrl || "",
          summonerLevel: (c.summonerLevel || 0),
          crestType: c.crestType || "",
          bannerType: c.bannerType || "",
          selectedPrestigeCrest: (c.selectedPrestigeCrest == null ? null : c.selectedPrestigeCrest),
          bannerId: (c.bannerId == null ? null : c.bannerId),
          crestId: (c.crestId == null ? null : c.crestId),
          prestigeCrestBorderLevel: (c.prestigeCrestBorderLevel == null ? null : c.prestigeCrestBorderLevel),
          titleName: c.titleName || "",
          challengeScore: (c.challengeScore == null ? null : c.challengeScore),
          challengeLevel: c.challengeLevel || "",
          ready: !!(c.iconUrl || c.summonerLevel || c.titleName || c.tokenIds ||
                    (c.bannerId != null) || (c.selectedPrestigeCrest != null)),
          tokenIds: (c.tokenIds && c.tokenIds.length) ? c.tokenIds : null,
          tokenTiers: (c.tokenTiers && c.tokenTiers.length) ? c.tokenTiers : null,
          tokenIcons: (c.tokenIcons && c.tokenIcons.length) ? c.tokenIcons : null,
          mates: (cache.mates && cache.mates.length) ? cache.mates : null,
          matesMeta: cache.matesMeta || null,
          matesWide: (cache.matesWide && cache.matesWide.length) ? cache.matesWide : null,
          matesMetaWide: cache.matesMetaWide || null,
          rev: forgeRev
        };
      },
      sync: function (wantOn) {
        try { if (on() && cache.want !== want()) clearBreaker(); } catch (e) {  }
        if (!wantOn || !on()) {
          cache.want = "";
          cache.at = 0;               
          forgeClass(false);          
          diag("mh-forge-off", {});
          apiJson("/api/q/mh/snap?action=verify").then(function (o) {
            diag("mh-forge-verify", o ? {
              same: !!o.same,
              diffs: (o.diffs || []).length,
              detail: (o.diffs || []).slice(0, 4)
            } : { err: "no-resp" });
          }).catch(function () {  });
          return;
        }
        apiJson("/api/q/mh/snap?action=take").then(function (o) {
          diag("mh-forge-snap", (o && o.snapshot) ? {
            taken: true, icon: o.snapshot.profileIconId,
            bg: o.snapshot.backgroundSkinId, sid: o.snapshot.summonerId
          } : { taken: false, resp: o });
        }).catch(function () {  });
        learnLocalId();
        warm(true);
      },
      isOn: function () { return on() && !!cache.text; },
      state: function () {
        return { on: on(), want: want(), cached: !!cache.text, count: cache.count,
                 puuid: cache.puuid, summonerId: cache.summonerId,
                 profile: cache.profile ? {
                   gameName: cache.profile.gameName, tagLine: cache.profile.tagLine,
                   summonerLevel: cache.profile.summonerLevel,
                   profileIconId: cache.profile.profileIconId } : null,
                 localPuuid: localPuuid, localSid: localSid,
                 ageMs: cache.at ? (Date.now() - cache.at) : -1, err: cache.err,
                 reads: stat.reads, hits: stat.hits, warm: stat.warm, errs: stat.err,
                 rewrite: stat.rewrite, self: stat.self, chat: stat.chat, restore: stat.restore,
                 rwBlocked: stat.blocked, rwTrips: stat.trip,
                 rwBlockedShapes: Object.keys(BREAKER.blocked).slice(0, 5),
                 rev: forgeRev,
                 installed: installed };
      }
    };
  })();


  var FEATURES = [
    { key: "autoAccept", kind: "behavior",
      start: function () { AutoAccept.start(); },
      stop: function () { AutoAccept.stop(); },
      running: function () { return AutoAccept.isOn(); } },
    { key: "allowDeclineAfterAccept", kind: "behavior",
      start: function () { DeclineAfterAccept.start(); },
      stop: function () { DeclineAfterAccept.stop(); },
      running: function () { return DeclineAfterAccept.isOn(); } },
    { key: "autoHonor", kind: "behavior",
      start: function () { AutoHonor.start(); },
      stop: function () { AutoHonor.stop(); },
      running: function () { return AutoHonor.isOn(); } },
    { key: "autoReturnToLobby", kind: "behavior",
      start: function () { AutoReturn.start(); },
      stop: function () { AutoReturn.stop(); },
      running: function () { return AutoReturn.isOn(); } },
    { key: "autoLockChampion", kind: "behavior",
      start: function () { AutoLockChampion.start(); },
      stop: function () { AutoLockChampion.stop(); },
      running: function () { return AutoLockChampion.isOn(); } },
    { key: "autoBanChampion", kind: "behavior",
      start: function () { AutoBanChampion.start(); },
      stop: function () { AutoBanChampion.stop(); },
      running: function () { return AutoBanChampion.isOn(); } },
    { key: "rankDisguise", kind: "sync",
      sync: function (want) { RankDisguise.sync(want); },
      running: function () { return RankDisguise.isOn(); } },
    { key: "challengeSpoof", kind: "sync",
      sync: function () {  },
      running: function () { return ChallengeSpoof.isOn(); } },
    { key: "mhForge", kind: "sync",
      sync: function (want) { MatchForge.sync(want); },
      running: function () { return MatchForge.isOn(); } },
    { key: "hideTFT", kind: "css" },
    { key: "hideRightNavText", kind: "css" },
    { key: "hideEsportsPopup", kind: "css" }
  ];

  function applyBehaviorSwitches() {
    for (var i = 0; i < FEATURES.length; i++) {
      var f = FEATURES[i];
      try {
        if (f.kind === "sync") {
          f.sync(!!cfg[f.key]);
          continue;
        }
        if (f.kind !== "behavior") continue;
        var want = !!cfg[f.key];
        if (want && !f.running()) f.start();
        else if (!want && f.running()) f.stop();
      } catch (e) {
        diag("feature-switch-error", { key: f.key, msg: String(e && e.message || e) });
      }
    }
  }

  function applyAll() {
    appliedJson = JSON.stringify(cfg);
    ensureCss();
    applyCssSwitches();
    applyBehaviorSwitches();
    try { ChallengeSpoof.applyCrest(false, "evt"); } catch (e) {  }
  }

  function watchCfg() {
    setInterval(function () {
      try {
        var raw = window.DataStore ? window.DataStore.get(CFG_KEY) : null;
        var next;
        if (typeof raw === "string") {
          if (raw === appliedJson) return;
          try { next = JSON.parse(raw); } catch (e) { return; }
        } else {
          next = raw;
        }
        var c = cloneCfg(next || {});
        if (JSON.stringify(c) === appliedJson) return;
        cfg = c;
        applyAll();
        diag("cfg-from-store", cfg);
      } catch (e) {  }
    }, 2000);
  }


  var crestPumpTimer = 0, crestPumpAt = 0, crestPumpBusy = false;
  var CREST_PUMP_COOL = 60;     
  function crestPumpClock() {
    try { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    catch (e) { return Date.now(); }
  }
  function crestPumpNow(by, t0) {
    if (crestPumpBusy) return;
    crestPumpBusy = true;
    var t1 = crestPumpClock();
    var n = 0;
    try { n = ChallengeSpoof.applyCrest(true, by) || 0; } catch (e) { n = 0; }
    var t2 = crestPumpClock();
    crestPumpBusy = false;
    crestPumpAt = Date.now();
    if (n) {
      diag("crest-pump", {
        by: by, n: n,
        lag: (t0 == null) ? -1 : Math.round(t1 - t0),
        ms: Math.round(t2 - t1)
      });
    }
  }
  function crestPumpSoon(by, t0) {
    var now = Date.now();
    if (t0 == null) t0 = crestPumpClock();
    if (!crestPumpBusy && (now - crestPumpAt) >= CREST_PUMP_COOL) {
      if (crestPumpTimer) { clearTimeout(crestPumpTimer); crestPumpTimer = 0; }
      crestPumpNow(by, t0);
      return;
    }
    if (crestPumpTimer) return;                       
    var wait = Math.max(16, CREST_PUMP_COOL - (now - crestPumpAt));
    crestPumpTimer = setTimeout(function () {
      crestPumpTimer = 0;
      crestPumpSoon(by, t0);                          
    }, wait);
  }

  function crestKeep() {
    if (typeof MutationObserver !== "function") return;

    function arm() {
      var n = 0;
      try {
        var hosts = document.querySelectorAll(
          "lol-regalia-profile-v2-element, lol-regalia-hovercard-v2-element, " +
          "lol-regalia-parties-v2-element, lol-regalia-identity-customizer-element");
        for (var i = 0; i < hosts.length; i++) {
          var sr = null;
          try { sr = hosts[i].shadowRoot; } catch (e) { sr = null; }
          if (!sr || sr.__prismCrestArmed) continue;
          sr.__prismCrestArmed = true;
          try {
            new MutationObserver(function () {
              try { crestPumpSoon("host"); } catch (e) {  }
            }).observe(sr, {
              childList: true, subtree: true,
              attributes: true, attributeFilter: ["crystal-level"]
            });
            n++;
          } catch (e) {  }
        }
      } catch (e) {  }
      if (n) { try { crestPumpSoon("arm-host"); } catch (e) {  } }
      return n;
    }

    var armAt = 0;
    function armThrottled() {
      var now = Date.now();
      if (now - armAt < 150) return 0;
      armAt = now;
      return arm();
    }

    function armShadows() {
      var n = 0;
      (function walk(root, depth) {
        if (!root || depth > 8) return;
        var all = null, i, sr;
        try { all = root.querySelectorAll("*"); } catch (e) { return; }
        for (i = 0; i < all.length; i++) {
          sr = null;
          try { sr = all[i].shadowRoot; } catch (e) { sr = null; }
          if (!sr) continue;
          if (!sr.__prismCrestShadowArmed) {
            sr.__prismCrestShadowArmed = true;
            n++;
            try {
              new MutationObserver(function (muts) {
                var hit = false, m, k, q, nd, ch, tn, ct;
                for (m = 0; m < muts.length && !hit; m++) {
                  var an = muts[m].addedNodes;
                  for (k = 0; k < an.length; k++) {
                    nd = an[k];
                    if (!nd || nd.nodeType !== 1) continue;
                    tn = "";
                    try { tn = String(nd.tagName || "").toLowerCase(); } catch (e) { tn = ""; }
                    if (tn.indexOf("crest") >= 0 || tn.indexOf("regalia") >= 0) { hit = true; break; }
                    ch = nd.children;
                    if (ch) {
                      for (q = 0; q < ch.length; q++) {
                        ct = "";
                        try { ct = String(ch[q].tagName || "").toLowerCase(); } catch (e) { ct = ""; }
                        if (ct.indexOf("crest") >= 0 || ct.indexOf("regalia") >= 0) { hit = true; break; }
                      }
                    }
                    if (hit) break;
                  }
                }
                if (!hit) return;
                try { crestPumpSoon("shadow"); } catch (e) {  }
              }).observe(sr, { childList: true, subtree: true });
            } catch (e) {  }
          }
          try { walk(sr, depth + 1); } catch (e) {  }
        }
      })(document, 0);
      if (n) { try { crestPumpSoon("arm-shadow"); } catch (e) {  } }
      return n;
    }

    var armShadowsAt = 0;
    function armShadowsThrottled() {
      var now = Date.now();
      if (now - armShadowsAt < 1000) return 0;
      armShadowsAt = now;
      return armShadows();
    }

    function onMutations(muts) {
      var hit = false, i, j;
      for (i = 0; i < muts.length && !hit; i++) {
        var an = muts[i].addedNodes;
        for (j = 0; j < an.length; j++) {
          if (an[j] && an[j].nodeType === 1) { hit = true; break; }
        }
      }
      if (!hit) return;
      try { armThrottled(); } catch (e) {  }
      try { armShadowsThrottled(); } catch (e) {  }
      try { crestPumpSoon("top"); } catch (e) {  }
    }

    var first = arm();
    var shFirst = 0;
    try { shFirst = armShadows(); } catch (e) {  }
    try { ChallengeSpoof.applyCrest(true, "boot"); } catch (e) {  }
    var topOk = false;
    try {
      new MutationObserver(onMutations).observe(document.documentElement, {
        childList: true, subtree: true
      });
      topOk = true;
    } catch (e) {  }
    var ctorOk = hookCrestCtor();                                 
    var foundOk = false;
    try { ChallengeSpoof.setFoundHook(watchCrestEl); foundOk = true; } catch (e) {  }
    diag("crest-keep", { armed: first, shadows: shFirst, topObserver: topOk, ctor: ctorOk, found: foundOk });
    setInterval(function () {                                   
      try { armThrottled(); } catch (e) {  }
      try {
        var sn = armShadowsThrottled();
        if (sn) diag("crest-arm-shadows", { n: sn });
      } catch (e) {  }
      try { maybeProbeCrest(); } catch (e) {  }
      try { ChallengeSpoof.applyCrest(false, "timer"); } catch (e) {  }
    }, 700);

    try {
      [2500, 7000, 16000].forEach(function (ms) {
        setTimeout(function () { probeCrestDiag("t+" + (ms / 1000) + "s"); }, ms);
      });
    } catch (e) {  }
  }

  var _crestProbeAt = 0, _crestProbeN = 0;
  function maybeProbeCrest() {
    var now = Date.now();
    if (_crestProbeN >= 5) return;          
    if (now - _crestProbeAt < 30000) return;
    _crestProbeAt = now;
    _crestProbeN++;
    probeCrestDiag("live#" + _crestProbeN, true);
  }

  function probeCrestDiag(tag, silentIfEmpty) {
    try {
      var C = (window.customElements && window.customElements.get)
        ? window.customElements.get("lol-regalia-crest-v2-element") : null;
      var ctorPatched = !!(C && C.prototype && C.prototype.__prismCrestPatched);
      var els = [];
      (function walk(root, depth) {
        if (!root || depth > 8) return;
        var list = null, i, sr;
        try { list = root.querySelectorAll("lol-regalia-crest-v2-element"); } catch (e) { return; }
        for (i = 0; i < list.length; i++) els.push(list[i]);
        var all = null;
        try { all = root.querySelectorAll("*"); } catch (e) { return; }
        for (i = 0; i < all.length; i++) {
          sr = null;
          try { sr = all[i].shadowRoot; } catch (e) { sr = null; }
          if (sr) walk(sr, depth + 1);
        }
      })(document, 0);

      var sample = [];
      for (var k = 0; k < els.length && k < 5; k++) {
        var el = els[k], cs = null, bg = "", mk = "", protoP = false, ownCC = false;
        try { cs = window.getComputedStyle(el); } catch (e) { cs = null; }
        try { bg = String((cs && cs.backgroundImage) || "").replace(/^url\(["']?/, "").slice(0, 84); } catch (e) {  }
        try {
          mk = String((cs && (cs.webkitMaskImage || cs.maskImage)) || "").replace(/^url\(["']?/, "").slice(0, 84);
        } catch (e) {  }
        try { protoP = !!(el.constructor && el.constructor.prototype && el.constructor.prototype.__prismCrestPatched); } catch (e) {  }
        try { ownCC = Object.prototype.hasOwnProperty.call(el, "connectedCallback"); } catch (e) {  }
        sample.push({
          crystal: el.getAttribute("crystal-level"),
          sizing: el.getAttribute("crest-sizing"),
          patched: protoP, ownCC: ownCC, bg: bg, mk: mk
        });
      }
      if (!els.length && silentIfEmpty) return;
      diag("crest-diag", { tag: tag, ctorPatched: ctorPatched, n: els.length, sample: sample });
    } catch (e) {  }
  }

  function hookCrestCtor() {
    try {
      if (!window.customElements || typeof window.customElements.whenDefined !== "function") return false;
      window.customElements.whenDefined("lol-regalia-crest-v2-element").then(function () {
        try {
          var C = window.customElements.get("lol-regalia-crest-v2-element");
          if (!C || !C.prototype || C.prototype.__prismCrestPatched) return;
          var occ = C.prototype.connectedCallback;
          C.prototype.connectedCallback = function () {
            var r;
            try { r = occ && occ.apply(this, arguments); } catch (e) {  }
            onCrestConnected(this);
            return r;
          };
          C.prototype.__prismCrestPatched = true;
          diag("crest-hook", { ok: true, hadCb: !!occ });
        } catch (e) {  }
      });
      return true;
    } catch (e) { return false; }
  }

  var crestWatchN = 0;
  var _crestWriterN = 0;      
  function watchCrestEl(el) {
    if (!el || typeof MutationObserver !== "function") return;
    try { if (el.__prismCrestWatched) return; } catch (e) { return; }
    try {
      el.__prismCrestWatched = true;
      crestWatchN++;
      try {
        if (!el.__prismCrestAttrWrap) {
          el.__prismCrestAttrWrap = true;
          var _origSetAttr = el.setAttribute;
          el.setAttribute = function (k, v) {
            try {
              if (_crestWriterN < 5 && k === "crystal-level"
                  && String(v).toUpperCase() !== String(ChallengeSpoof.level() || "")) {
                _crestWriterN++;
                diag("crest-writer", {
                  v: v,
                  stack: String((new Error()).stack || "")
                    .split("\n").slice(1, 5)
                    .map(function (s) { return s.trim(); })
                    .join(" | ").slice(0, 260)
                });
              }
            } catch (e) {  }
            return _origSetAttr.apply(this, arguments);
          };
        }
      } catch (e) {  }
      new MutationObserver(function (muts) {
        try {
          for (var k = 0; k < muts.length; k++) {
            var m = muts[k];
            diag("crest-mut", {
              old: m.oldValue,
              now: el.getAttribute("crystal-level"),
              sizing: el.getAttribute("crest-sizing"),
              pu: String(el.getAttribute("puuid") || "").slice(0, 8)
            });
          }
        } catch (e) {  }
        try { ChallengeSpoof.applyCrest(true, "mut"); } catch (e) {  }
      }).observe(el, { attributes: true, attributeFilter: ["crystal-level"], attributeOldValue: true });
      diag("crest-watch", { n: crestWatchN });
    } catch (e) {  }
  }

  function onCrestConnected(el) {
    if (!el) return;
    try { crestPumpSoon("conn"); } catch (e) {  }
    watchCrestEl(el);
  }

  function selProbe(reason) {
    function n(sel) {
      try { return document.querySelectorAll(sel).length; } catch (e) { return -1; }
    }
    diag("selprobe", {
      why: reason,
      tft: n(".menu_item_navbar_tft"),
      rightNavMenu: n(".right-nav-menu"),
      rightNavItem: n(".right-nav-menu lol-uikit-navigation-item"),
      rightNavSmallText: n(".right-nav-menu .menu-item-small-text"),
      esportsIframe: n("iframe#tv-official-pop"),
      playBtn: n(".play-button-container")
    });
  }


  function expose() {
    window.__PRISM_ENGINE = {
      version: BUILD,
      getCfg: function () { return cloneCfg(cfg); },
      defaults: function () { return cloneCfg(DEFAULT_CFG); },
      setCfg: function (patch) {
        cfg = cloneCfg(Object.assign({}, cfg, patch || {}));
        saveCfg();
        applyAll();
        diag("cfg-set", cfg);
        return cloneCfg(cfg);
      },
      mhState: function () { return MatchForge.state(); },
      mhWarm: function () { return MatchForge.warm(true); },
      forge: function () { return MatchForge.forgeData(); },
      status: function () {
        return {
          build: BUILD,
          hasDataStore: !!window.DataStore,
          hasSocket: Bus.hasSocket(),
          injectorTasks: Injector.taskCount(),
          rankProfile: RankProfile.state(),
          challenge: ChallengeSpoof.state(),
          matchForge: MatchForge.state(),
          features: FEATURES.map(function (f) {
            return {
              key: f.key,
              kind: f.kind,
              on: (f.kind === "css") ? !!cfg[f.key] : (f.running ? f.running() : null)
            };
          })
        };
      },
      probeSelectors: selProbe,
      rankState: function () { return RankDisguise.state(); },
      rankProfileState: function () { return RankProfile.state(); },
      challengeState: function () { return ChallengeSpoof.state(); },
      challengeLevels: function () { return CHAL_LEVELS.slice(); },
      challengeTokenInfo: function (id) { return ChallengeSpoof.tokenInfo(id); },
      challengeTokenDetail: function (id) { return ChallengeSpoof.tokenDetail(id); },
      challengeTokenIcon: function (id, tier) { return ChallengeSpoof.tokenIconUrl(id, tier); },
      challengeTokenCatalogSize: function () {
        try { return ChallengeSpoof.catalogSize(); } catch (e) { return -1; }
      },
      readRankNow: function () {
        return lcuJson("/lol-chat/v1/me").then(function (me) {
          var lol = (me && me.lol) || {};
          return {
            tier: lol.rankedLeagueTier || "",
            division: lol.rankedLeagueDivision || "",
            queue: lol.rankedLeagueQueue || ""
          };
        });
      },
      resolveChampions: function (text) {
        return ChampLib.resolve(text).then(function (r) {
          return { ids: r.ids, unresolved: r.unresolved, names: ChampLib.namesOf(r.ids) };
        });
      },
      championNames: function (ids) {
        return ChampLib.load().then(function () { return ChampLib.namesOf(ids || []); });
      },
      diag: diag
    };
  }


  var booted = false;

  function bootDom() {
    if (booted) return;
    booted = true;
    loadCfg();
    applyAll();
    Injector.start();
    watchCfg();
    try { RankProfile.install(); } catch (e) {  }
    try { ChallengeSpoof.install(); } catch (e) {  }
    try { MatchForge.install(); } catch (e) {  }
    diag("engine-boot", {
      build: BUILD,
      cfg: cfg,
      hasDataStore: !!window.DataStore,
      hasSocket: Bus.hasSocket(),
      readyState: document.readyState
    });
    selProbe("boot");
    setTimeout(function () { selProbe("t+8s"); }, 8000);
    setTimeout(function () { selProbe("t+20s"); }, 20000);
    try { crestKeep(); } catch (e) {  }
  }

  function safeBootDom(why) {
    try { bootDom(); }
    catch (e) {
      diag("engine-boot-error", {
        why: why,
        msg: String(e && e.message || e),
        stack: String(e && e.stack || "").slice(0, 500)
      });
    }
  }

  function init(context) {
    try {
      expose();
      diag("engine-init", { build: BUILD, hasContext: !!context, hasSocket: !!(context && context.socket) });
      if (context && context.socket) Bus.bindContext(context);
      RankProfile.install();
      ChallengeSpoof.install();
      MatchForge.install();
    } catch (e) {
      diag("engine-init-error", { msg: String(e && e.message || e) });
    }
  }

  function load() {
    safeBootDom("load");
  }

  try {
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { safeBootDom("domcontentloaded"); }, { once: true });
      } else {
        safeBootDom("immediate");
      }
    }
  } catch (e) {  }

  return { init: init, load: load };
})();

export function init(context) { return Engine.init(context); }
export function load() { return Engine.load(); }
