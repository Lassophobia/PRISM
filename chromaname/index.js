(function () {
  "use strict";

  var LOG_PREFIX = "[PRISM-ChromaName]";
  var STORE_KEY = "prism:chroma-name";
  var CSS_ID = "prism-chroma-name-css";
  var SUFFIX_VAR = "--prism-chroma-suffix";

  var NAME_SELECTOR = ".champion-skin-name .skin-name-text";

  var PANEL_SELECTOR = ".lu-chroma-panel";
  var PANEL_NAME_SELECTOR = ".lu-chroma-panel .child-skin-name";
  var PANEL_IMG_SELECTOR = ".lu-chroma-panel .chroma-information-image";
  var PANEL_ATTR = "data-prism-chroma-name";   

  var VER = "2.1";                
  var INTERVAL_ACTIVE_MS = 500;   
  var INTERVAL_IDLE_MS = 4000;    

  var log = {
    info: function (m) { try { console.info(LOG_PREFIX + " " + m); } catch (e) {} },
    warn: function (m) { try { console.warn(LOG_PREFIX + " " + m); } catch (e) {} }
  };


  var cfg = { enabled: true };   

  var LEGACY_KEY = "hallmods:chroma-name";
  function migrateLegacyKey() {
    var cur = null;
    try { if (window.DataStore) cur = window.DataStore.get(STORE_KEY); } catch (e) {}
    if (!cur) { try { cur = localStorage.getItem(STORE_KEY); } catch (e) {} }
    if (cur) return;                        
    var old = null;
    try { if (window.DataStore) old = window.DataStore.get(LEGACY_KEY); } catch (e) {}
    if (!old) { try { old = localStorage.getItem(LEGACY_KEY); } catch (e) {} }
    if (!old) return;                       
    try { if (window.DataStore) window.DataStore.set(STORE_KEY, old); } catch (e) {}
    try { localStorage.setItem(STORE_KEY, old); } catch (e) {}
    log.info("已把老键 " + LEGACY_KEY + " 迁移到 " + STORE_KEY);
  }

  function loadCfg() {
    var raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(STORE_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(STORE_KEY); } catch (e) {} }
    if (!raw) return;
    try {
      var o = JSON.parse(raw);
      if (o && typeof o.enabled === "boolean") cfg.enabled = o.enabled;
    } catch (e) {  }
  }

  function saveCfg() {
    var s = "";
    try { s = JSON.stringify(cfg); } catch (e) { return; }
    try { if (window.DataStore) window.DataStore.set(STORE_KEY, s); } catch (e) {}
    try { localStorage.setItem(STORE_KEY, s); } catch (e) {}
  }


  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/[\u00a0\u2007\u202f\u2028\u2029]/g, " ")
      .trim();
  }

  function squash(s) {
    return norm(s).replace(/\s+/g, "").toLowerCase();
  }

  function cssQuote(s) {
    return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }


  var DIAG_BASE = "http://127.0.0.1:17888";
  var lastReportKey = "";

  function report(kind, obj) {
    var key;
    try { key = kind + "|" + JSON.stringify(obj); } catch (e) { return; }
    if (key === lastReportKey) return;
    lastReportKey = key;
    try {
      var env = JSON.stringify({ evt: "CHROMANAME:" + kind, d: JSON.stringify(obj) });
      fetch(DIAG_BASE + "/api/diag?d=" + encodeURIComponent(env), { cache: "no-store" })
        .catch(function () {  });
    } catch (e) {  }
  }

  var CSS_TEXT =
    NAME_SELECTOR + "::after {\n" +
    "  content: var(" + SUFFIX_VAR + ", \"\");\n" +
    "}\n";

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent = CSS_TEXT;
    (document.head || document.documentElement).appendChild(st);
  }


  var champMap = Object.create(null);
  var champPending = Object.create(null);

  function pathKey(p) {
    if (!p) return "";
    var s = String(p).split("?")[0].split("#")[0].replace(/\\/g, "/");
    var segs = s.split("/");
    var parts = [];
    for (var i = 0; i < segs.length; i++) { if (segs[i]) parts.push(segs[i]); }
    if (parts.length < 2) return "";
    return (parts[parts.length - 2] + "/" + parts[parts.length - 1]).toLowerCase();
  }

  function ensureChamp(champId) {
    if (!champId) return Promise.resolve(null);
    if (champMap[champId]) return Promise.resolve(champMap[champId]);
    if (champPending[champId]) return champPending[champId];

    var url = location.origin + "/lol-game-data/assets/v1/champions/" + champId + ".json";
    champPending[champId] = fetch(url, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var map = { chroma: Object.create(null), byPath: Object.create(null) };
        var skins = (d && d.skins) || [];
        for (var i = 0; i < skins.length; i++) {
          var s = skins[i] || {};
          var chromas = s.chromas || [];
          for (var j = 0; j < chromas.length; j++) {
            var c = chromas[j] || {};
            if (!c.id || !c.name) continue;
            map.chroma[c.id] = { full: norm(c.name), parent: norm(s.name) };
            var k = pathKey(c.chromaPath) || pathKey(c.tilePath);
            if (k && !map.byPath[k]) map.byPath[k] = c.id;
          }
        }
        champMap[champId] = map;
        try { delete champPending[champId]; } catch (e) {}
        return map;
      })
      .catch(function () {
        try { delete champPending[champId]; } catch (e) {}
        return null;
      });

    return champPending[champId];
  }


  function suffixFor(curText, hit) {
    var cur = norm(curText);
    var full = hit.full;
    if (!cur || !full) return "";
    if (cur === full) return "";                      
    if (full.indexOf(cur) === 0) {                    
      var rest = full.slice(cur.length);
      return rest.replace(/\s+/g, "") ? rest : "";
    }
    return "";
  }

  function applySuffix(hit) {
    ensureCss();
    var els = document.querySelectorAll(NAME_SELECTOR);
    var applied = "";
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var suf = suffixFor(el.textContent, hit);
      if (suf) {
        el.style.setProperty(SUFFIX_VAR, cssQuote(suf));
        if (!applied) applied = norm(el.textContent) + suf;
      } else {
        el.style.removeProperty(SUFFIX_VAR);
      }
    }
    return applied;
  }

  function clearSuffixAll() {
    var els = document.querySelectorAll(NAME_SELECTOR);
    for (var i = 0; i < els.length; i++) {
      els[i].style.removeProperty(SUFFIX_VAR);
    }
  }


  var lastPanelDebug = {};

  function firstTextNode(el) {
    if (!el) return null;
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) return el.childNodes[i];   
    }
    return null;
  }

  function stripCssUrl(raw) {
    var s = String(raw == null ? "" : raw).trim();
    var m = /^url\(\s*([\s\S]*?)\s*\)$/i.exec(s);
    if (m) s = m[1];
    return s.replace(/^['"]/, "").replace(/['"]$/, "").trim();
  }

  function chromaIdFromUrl(url, map) {
    if (!url || !map) return 0;
    var k = pathKey(url);
    if (k && map.byPath && map.byPath[k]) return map.byPath[k];
    var nums = String(url).match(/\d{2,8}/g);
    if (!nums) return 0;
    for (var i = nums.length - 1; i >= 0; i--) {
      var n = parseInt(nums[i], 10);
      if (map.chroma[n]) return n;
    }
    return 0;
  }

  function renamePanel(map, fallbackSkinId) {
    lastPanelDebug = {};
    if (!map) return "";
    var els = document.querySelectorAll(PANEL_NAME_SELECTOR);
    if (!els.length) return "";

    var img = document.querySelector(PANEL_IMG_SELECTOR);
    var url = stripCssUrl(img ? (img.style.backgroundImage || img.style.background || "") : "");
    var hasUrl = !!url && url !== "none";
    var chromaId = hasUrl ? chromaIdFromUrl(url, map) : 0;

    if (!hasUrl && fallbackSkinId && map.chroma[fallbackSkinId]) chromaId = fallbackSkinId;

    lastPanelDebug = {
      url: url.slice(-90),
      key: pathKey(url),
      byPathHit: !!(hasUrl && pathKey(url) && map.byPath && map.byPath[pathKey(url)]),
      chromaId: chromaId || 0,
      cur: els.length ? norm(firstTextNode(els[0]) ? firstTextNode(els[0]).nodeValue : "") : "",
      src: chromaId ? (hasUrl ? "img" : "fallback") : "none"
    };

    if (!chromaId) return "";

    var hit = map.chroma[chromaId];
    if (!hit) return "";

    var applied = "";
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tn = firstTextNode(el);
      if (!tn) continue;

      var cur = norm(tn.nodeValue);
      if (squash(cur) === squash(hit.full)) {          
        el.setAttribute(PANEL_ATTR, hit.full);
        continue;
      }
      var mine = el.getAttribute(PANEL_ATTR) || "";
      var isBase = squash(cur) === squash(hit.parent);
      var isMine = !!mine && squash(cur) === squash(mine);
      if (!isBase && !isMine) continue;                

      tn.nodeValue = hit.full;
      el.setAttribute(PANEL_ATTR, hit.full);
      if (!applied) applied = hit.full;
    }
    return applied;
  }


  var bodyObserver = null;
  var innerObserver = null;
  var debounceTimer = 0;
  var lastSelectorSkinId = 0;

  function onDomChange() {
    var panel = document.querySelector(PANEL_SELECTOR);
    if (!panel) {
      if (innerObserver) { innerObserver.disconnect(); innerObserver = null; }
      return;
    }
    if (!innerObserver) {
      innerObserver = new MutationObserver(schedulePanelSync);
      innerObserver.observe(panel, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style"]      
      });
    }
    schedulePanelSync();
  }

  function schedulePanelSync() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(function () {
      debounceTimer = 0;
      syncPanelNow();
    }, 40);
  }

  function syncPanelNow() {
    if (!armed || !cfg.enabled) return;
    if (!document.querySelector(PANEL_SELECTOR)) return;
    fetch(location.origin + "/lol-champ-select/v1/skin-selector-info", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (info) {
        var cid = info && info.selectedChampionId;
        if (!cid) return null;
        lastSelectorSkinId = (info && info.selectedSkinId) || 0;
        return ensureChamp(cid).then(function (map) {
          var shown = renamePanel(map, lastSelectorSkinId);
          report("panel", {
            v: VER,
            champId: cid,
            shown: shown,
            skinId: lastSelectorSkinId,
            dbg: lastPanelDebug
          });
        });
      })
      .catch(function () {  });
  }

  function installObservers() {
    if (bodyObserver || !document.body) return;
    bodyObserver = new MutationObserver(onDomChange);
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function removeObservers() {
    if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
    if (innerObserver) { innerObserver.disconnect(); innerObserver = null; }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = 0; }
  }


  var timer = null;
  var armed = false;

  function schedule(ms) {
    if (!armed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  function tick() {
    timer = null;
    if (!armed || !cfg.enabled) return;

    fetch(location.origin + "/lol-champ-select/v1/skin-selector-info", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (info) {
        var sid = info && info.selectedSkinId;
        var cid = info && info.selectedChampionId;
        if (!sid || !cid) {           
          clearSuffixAll();
          report("idle", { v: VER, panel: !!document.querySelector(PANEL_SELECTOR) });
          schedule(INTERVAL_IDLE_MS);
          return null;
        }
        lastSelectorSkinId = sid;
        return ensureChamp(cid).then(function (map) {
          var hit = map && map.chroma[sid];
          var shown = "";
          if (hit) {
            shown = applySuffix(hit);
          } else {
            clearSuffixAll();       
          }
          var panelShown = renamePanel(map, sid);
          report("tick", {
            v: VER,
            skinId: sid, champId: cid,
            isChroma: !!hit,
            full: hit ? hit.full : "",
            suffix: shown || "",
            panel: panelShown || "",
            panelOpen: !!document.querySelector(PANEL_SELECTOR)
          });
          schedule(INTERVAL_ACTIVE_MS);
        });
      })
      .catch(function () {             
        clearSuffixAll();
        schedule(INTERVAL_IDLE_MS);
      });
  }

  function start() {
    if (armed) return;
    armed = true;
    lastReportKey = "";   
    ensureCss();
    installObservers();
    onDomChange();   
    log.info("引擎已启动");
    tick();
  }

  function stop() {
    armed = false;
    if (timer) { clearTimeout(timer); timer = null; }
    clearSuffixAll();
    removeObservers();
    report("off", {});
    log.info("引擎已停止");
  }


  window.__PRISM_CHROMA = {
    version: VER,
    getCfg: function () { return { enabled: !!cfg.enabled }; },
    setCfg: function (o) {
      if (o && typeof o.enabled === "boolean") cfg.enabled = o.enabled;
      saveCfg();
      if (cfg.enabled) start(); else stop();
      try {
        window.dispatchEvent(new CustomEvent("prism-chroma-name-change"));
      } catch (e) {}
      return { enabled: !!cfg.enabled };
    },
    probe: function () {
      return fetch(location.origin + "/lol-champ-select/v1/skin-selector-info", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (info) {
          var sid = info && info.selectedSkinId;
          var cid = info && info.selectedChampionId;
          var panelEl = document.querySelector(PANEL_NAME_SELECTOR);
          if (!sid || !cid) return { inChampSelect: false, panelOpen: !!panelEl };
          return ensureChamp(cid).then(function (map) {
            var hit = map && map.chroma[sid];
            var el = document.querySelector(NAME_SELECTOR);
            return {
              inChampSelect: true,
              selectedSkinId: sid,
              isChroma: !!hit,
              chromaFullName: hit ? hit.full : "",
              baseName: hit ? hit.parent : "",
              shownText: el ? norm(el.textContent) : "",
              suffixApplied: el ? (el.style.getPropertyValue(SUFFIX_VAR) || "") : "",
              panelOpen: !!panelEl,
              panelText: panelEl ? norm(panelEl.textContent) : ""
            };
          });
        })
        .catch(function () { return { inChampSelect: false, error: "fetch-failed" }; });
    }
  };


  function boot() {
    migrateLegacyKey();
    loadCfg();
    if (cfg.enabled) start();
    else ensureCss();   
  }

  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
