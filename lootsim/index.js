(function createLootSim() {
  "use strict";

  if (window.__LOOTSIM) return;

  const LS_KEY = "lootsim.state.v2";
  const P_LIST = /^\/lol-loot\/v1\/player-loot(\?|$)/i;      
  const P_MAP = /^\/lol-loot\/v1\/player-loot-map(\?|$)/i;
  const P_MAP2 = /^\/lol-loot\/v2\/player-loot-map(\?|$)/i;  
  const P_CRAFT = /^\/lol-loot\/v1\/recipes\/([^\/\?]+)\/craft/i;

  let lootFetchAt = 0;
  const isLootRead = u => P_LIST.test(u) || P_MAP.test(u) || P_MAP2.test(u);
  const noteLootFetch = u => { try { if (isLootRead(u)) lootFetchAt = Date.now(); } catch (e) {  } };

  const OF = window.fetch.bind(window);
  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;

  const SRC = {
    skins: "/lol-game-data/assets/v1/skins.json",
    icons: "/lol-game-data/assets/v1/summoner-icons.json",
    wards: "/lol-game-data/assets/v1/ward-skins.json",
    emotes: "/lol-game-data/assets/v1/summoner-emotes.json",
    loot: "/lol-game-data/assets/v1/loot.json",
  };

  const CHESTS = {
    CHEST_generic: {
      label: "紫色宝箱",
      clientName: "海克斯科技宝箱",
      recipe: "CHEST_generic_OPEN",
      slots: ["CHEST_generic", "MATERIAL_key"],
      oddsSource: "国服官方公示（该道具 hasVisibleLootOdds=true）",
      main: [
        { kind: "SKIN_SHARD", p: 45.135, label: "皮肤碎片" },
        { kind: "SKIN", p: 29.255, label: "永久皮肤" },
        { kind: "CHAMP_SHARD", p: 14.61, label: "英雄碎片" },
        { kind: "CHAMPION", p: 7, label: "永久英雄" },
        { kind: "ICON", p: 2, label: "召唤师图标" },
        { kind: "WARD_PERM", p: 2, label: "守卫皮肤" },
      ],
      bonus: [
        { kind: "MYTHIC", p: 20, n: 10, label: "神话精萃×10" },
        { kind: "HEXTECH_SKIN", p: 0.04, label: "海克斯限定永久皮肤" },
      ],
    },

    CHEST_champion_mastery: {
      label: "普通海克斯宝箱",
      clientName: "海克斯宝箱",
      recipe: "CHEST_champion_mastery_OPEN",
      slots: ["CHEST_champion_mastery", "MATERIAL_key"],
      oddsSource: "拳头官方 FAQ",
      main: [
        { kind: "SKIN_SHARD", p: 50, label: "皮肤碎片" },
        { kind: "CHAMP_SHARD", p: 25, label: "英雄碎片" },
        { kind: "WARD", p: 11.5, label: "守卫皮肤碎片+150橙精", essence: 150 },
        { kind: "EMOTE", p: 10, label: "表情" },
        { kind: "ICON", p: 3.5, label: "召唤师图标+150橙精", essence: 150 },
      ],
      bonus: [
        { kind: "MYTHIC", p: 3.6, n: 10, label: "神话精萃×10" },
        { kind: "REBATE", p: 10, label: "额外宝箱+钥匙" },
      ],
      pity: { skinEvery: 3, mythicEvery: 50 },
    },
  };

  const KIND_META = {
    ICON: { type: "SUMMONER_ICON", disp: "ICON", extra: { disenchantLootName: "CURRENCY_cosmetic", disenchantRecipeName: "SUMMONER_ICON_disenchant", disenchantValue: 150, redeemableStatus: "REDEEMABLE" } },
    WARD: { type: "WARD_SKIN", disp: "WARD_SKIN", extra: { disenchantLootName: "CURRENCY_cosmetic", disenchantValue: 0, redeemableStatus: "REDEEMABLE" } },
    EMOTE: { type: "EMOTE", disp: "EMOTE", extra: { disenchantLootName: "CURRENCY_cosmetic", disenchantValue: 675, redeemableStatus: "REDEEMABLE" } },
    MYTHIC: { type: "CURRENCY", disp: "CHEST", extra: {} },
    CHEST: { type: "CHEST", disp: "CHEST", extra: {} },
    MATERIAL: { type: "MATERIAL", disp: "", extra: {} },
    OTHER: { type: "", disp: "", extra: {} },
  };

  KIND_META.WARD_PERM = KIND_META.WARD;
  KIND_META.ESSENCE = KIND_META.MYTHIC;
  KIND_META.SKIN_SHARD = { type: "SKIN_RENTAL", disp: "SKIN", extra: { isRental: true, redeemableStatus: "REDEEMABLE_RENTAL" } };
  KIND_META.SKIN = { type: "SKIN", disp: "SKIN", extra: { redeemableStatus: "REDEEMABLE" } };
  KIND_META.CHAMP_SHARD = { type: "CHAMPION_RENTAL", disp: "CHAMPION", extra: { isRental: true } };
  KIND_META.CHAMPION = { type: "CHAMPION", disp: "CHAMPION", extra: {} };

  function localImg(lootId) {
    let m, p;
    if ((m = lootId.match(/^SUMMONER_ICON_(\d+)$/))) { p = pools.iconImg && pools.iconImg[m[1]]; return p ? { tile: p, splash: p } : null; }
    if ((m = lootId.match(/^WARD_SKIN(?:_RENTAL)?_(\d+)$/))) { p = pools.wardImg && pools.wardImg[m[1]]; return p ? { tile: p, splash: p } : null; }
    if ((m = lootId.match(/^EMOTE_(\d+)$/))) { p = pools.emoteImg && pools.emoteImg[m[1]]; return p ? { tile: p, splash: p } : null; }
    if ((m = lootId.match(/^CHAMPION_SKIN(?:_RENTAL)?_(\d+)$/))) {          
      const v = pools.skinImg && pools.skinImg[m[1]];
      if (v) return { tile: v.tile || v.splash, splash: v.splash || v.tile };
    }
    return null;
  }

  function localName(lootId) {
    if (!pools.names) return "";
    return pools.names[lootId] || "";
  }

  const LOCALIZED_NAMES = {
    CHEST_generic: "海克斯科技宝箱",
    CURRENCY_mythic: "神话精萃",
  };
  function localLocalized(lootId) { return LOCALIZED_NAMES[lootId] || ""; }

  function loadState() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {  }
    return null;
  }
  const state = loadState() || {
    on: false, dry: false,
    simChest: "CHEST_generic",   
    gains: {},     
    counters: {},  
    log: [],
  };
  delete state.phantom;            
  state.gains = state.gains || {};
  state.counters = state.counters || {};
  state.log = state.log || [];
  if (!CHESTS[state.simChest]) state.simChest = "CHEST_generic";

  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {  } };
  const logBuf = [];
  const log = (evt, data) => { try { logBuf.push({ evt, data, t: Date.now() }); if (logBuf.length > 200) logBuf.shift(); } catch (e) {  } };
  const active = () => state.on && !state.dry;

  const pools = { skins: null, champs: null, icons: null, wards: null, emotes: null, hext: null, iconImg: null, wardImg: null, emoteImg: null, skinImg: null, names: null, loading: null };

  async function fetchJson(url) {
    const r = await OF(url, { cache: "no-store" });
    if (!r.ok) throw new Error(url + " -> " + r.status);
    return r.json();
  }

  async function ensurePools() {
    if (pools.skins) return pools;
    if (pools.loading) return pools.loading;
    pools.loading = (async () => {
      pools.names = {};
      const skins = await fetchJson(SRC.skins);
      const skinIds = [], champSet = {}, mythic = [];
      pools.skinImg = {};
      for (const k in skins) {
        const s = skins[k];
        if (!s) continue;
        const id = Number(s.id != null ? s.id : k);
        if (!Number.isFinite(id) || id <= 0) continue;
        const cid = Math.floor(id / 1000);
        if (cid < 1 || cid > 999) continue;
        if (s.isBase) {
          if (s.name) { pools.names["CHAMPION_" + cid] = s.name; pools.names["CHAMPION_RENTAL_" + cid] = s.name; }
          continue;
        }
        skinIds.push(id);
        champSet[cid] = 1;
        if (s.rarity === "kMythic") mythic.push(id);      
        if (s.tilePath || s.splashPath) pools.skinImg[id] = { tile: s.tilePath, splash: s.splashPath };
        if (s.name) { pools.names["CHAMPION_SKIN_" + id] = s.name; pools.names["CHAMPION_SKIN_RENTAL_" + id] = s.name; }
      }
      pools.skins = skinIds;
      pools.champs = Object.keys(champSet).map(Number);

      pools.iconImg = {};
      try {
        const ic = await fetchJson(SRC.icons);
        const arr = Array.isArray(ic) ? ic : [];
        pools.icons = [];
        for (const x of arr) {
          if (!x || x.id == null) continue;
          pools.icons.push(x.id);
          if (x.imagePath) pools.iconImg[x.id] = x.imagePath;
          if (x.title) pools.names["SUMMONER_ICON_" + x.id] = x.title;   
        }
      } catch (e) { pools.icons = []; }

      pools.wardImg = {};
      try {
        const wd = await fetchJson(SRC.wards);
        const arr = Array.isArray(wd) ? wd : [];
        pools.wards = [];
        for (const x of arr) {
          if (!x || x.id == null || x.id === 0) continue;   
          pools.wards.push(x.id);
          if (x.wardImagePath) pools.wardImg[x.id] = x.wardImagePath;
          if (x.name) { pools.names["WARD_SKIN_" + x.id] = x.name; pools.names["WARD_SKIN_RENTAL_" + x.id] = x.name; }
        }
      } catch (e) { pools.wards = []; }

      pools.emoteImg = {};
      try {
        const em = await fetchJson(SRC.emotes);
        const arr = Array.isArray(em) ? em : [];
        pools.emotes = [];
        for (const x of arr) {
          if (!x || x.id == null || x.id === 0) continue;
          if (!/\.(png|jpe?g|webp)$/i.test(String(x.inventoryIcon || ""))) continue;
          pools.emotes.push(x.id);
          pools.emoteImg[x.id] = x.inventoryIcon;
          if (x.name) pools.names["EMOTE_" + x.id] = x.name;
        }
      } catch (e) { pools.emotes = []; }

      let fromLoot = [];
      try {
        const lt = await fetchJson(SRC.loot);
        fromLoot = (lt.LootItems || [])
          .filter(x => x.type === "Skin" || x.type === "Skin_Rental")
          .map(x => String(x.id).replace(/^CHAMPION_SKIN_RENTAL_/, "").replace(/^CHAMPION_SKIN_/, ""));
      } catch (e) {  }
      pools.hext = Array.from(new Set(fromLoot.concat(mythic.map(String)))).filter(Boolean);

      log("pools", { skins: pools.skins.length, champs: pools.champs.length, icons: pools.icons.length, wards: pools.wards.length, emotes: pools.emotes.length, hext: pools.hext.length });
      return pools;
    })().catch(e => { pools.loading = null; throw e; });
    return pools.loading;
  }

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function rollKind(cfg, ctr) {
    if (cfg.pity && cfg.pity.skinEvery && ctr.sinceSkin >= cfg.pity.skinEvery - 1) return "SKIN_SHARD"; 
    const r = Math.random() * 100;
    let acc = 0;
    for (const e of cfg.main) { acc += e.p; if (r < acc) return e.kind; }
    return cfg.main[cfg.main.length - 1].kind;
  }

  function rollBonus(cfg, ctr) {
    const out = [];
    for (const b of cfg.bonus) {
      if (b.kind === "MYTHIC" && cfg.pity && cfg.pity.mythicEvery && ctr.sinceMythic >= cfg.pity.mythicEvery - 1) { out.push(b); continue; }
      if (Math.random() * 100 < b.p) out.push(b);
    }
    return out;
  }

  function resolveLootId(kind, n) {
    switch (kind) {
      case "SKIN_SHARD": return { lootId: "CHAMPION_SKIN_RENTAL_" + pick(pools.skins), qty: 1, kind };
      case "SKIN": return { lootId: "CHAMPION_SKIN_" + pick(pools.skins), qty: 1, kind };
      case "CHAMP_SHARD": return { lootId: "CHAMPION_RENTAL_" + pick(pools.champs), qty: 1, kind };
      case "CHAMPION": return { lootId: "CHAMPION_" + pick(pools.champs), qty: 1, kind };
      case "ICON": return pools.icons.length ? { lootId: "SUMMONER_ICON_" + pick(pools.icons), qty: 1, kind } : { lootId: "SUMMONER_ICON_3384", qty: 1, kind };
      case "WARD": return pools.wards.length ? { lootId: "WARD_SKIN_RENTAL_" + pick(pools.wards), qty: 1, kind } : { lootId: "CURRENCY_cosmetic", qty: 640, kind: "ESSENCE" };
      case "WARD_PERM": return pools.wards.length ? { lootId: "WARD_SKIN_" + pick(pools.wards), qty: 1, kind } : { lootId: "CURRENCY_cosmetic", qty: 640, kind: "ESSENCE" };
      case "EMOTE": return { lootId: "EMOTE_" + ((pools.emotes && pools.emotes.length) ? pick(pools.emotes) : 1), qty: 1, kind };
      case "MYTHIC": return { lootId: "CURRENCY_mythic", qty: n || 10, kind };
      case "HEXTECH_SKIN": return { lootId: "CHAMPION_SKIN_" + pick((pools.hext && pools.hext.length) ? pools.hext : pools.skins), qty: 1, kind };
      case "REBATE": return { lootId: "CHEST_generic", qty: 1, kind: "CHEST" };
      case "ESSENCE": return { lootId: "CURRENCY_cosmetic", qty: n || 150, kind: "ESSENCE" };
      default: return { lootId: "CURRENCY_cosmetic", qty: 150, kind: "ESSENCE" };
    }
  }

  const defCache = {};

  function synthDef(lootId, kind) {
    const meta = KIND_META[kind] || KIND_META.OTHER;
    const d = {
      asset: "", count: 0, disenchantLootName: "", disenchantRecipeName: "", disenchantValue: 0,
      displayCategories: meta.disp, expiryTime: -1, isNew: false, isRental: false,
      itemDesc: "", itemStatus: "NONE",
      localizedDescription: "", localizedName: "", localizedRecipeSubtitle: "", localizedRecipeTitle: "",
      lootId: lootId, lootName: lootId, parentItemStatus: "NONE", parentStoreItemId: -1,
      rarity: "DEFAULT", redeemableStatus: "NOT_REDEEMABLE", refId: "",
      rentalGames: 0, rentalSeconds: 0, shadowPath: "", splashPath: "",
      storeItemId: 0, tags: "", tilePath: "", type: meta.type,
      upgradeEssenceName: "", upgradeEssenceValue: 0, upgradeLootName: "", value: 0,
    };
    Object.assign(d, meta.extra);
    return d;
  }

  const DEF_KEYS = Object.keys(synthDef("x", "OTHER"));

  function cloneDef(d) {
    const out = Object.assign({}, d);
    try { Object.defineProperty(out, "__synth", { value: d.__synth, enumerable: false, configurable: true }); } catch (e) {  }
    return out;
  }

  async function resolveDef(lootId, kind) {
    if (defCache[lootId]) return cloneDef(defCache[lootId]);

    const def = synthDef(lootId, kind);
    def.lootId = lootId;
    def.lootName = lootId;
    if (lootId.indexOf("CHEST") === 0) {
      def.type = "CHEST"; def.displayCategories = "CHEST"; def.asset = "CHEST_promotion";
      def.splashPath = def.tilePath = "/fe/lol-loot/assets/loot_item_icons/CHEST_promotion.png";
      def.storeItemId = 1;
      if (lootId === "CHEST_generic") def.localizedDescription = "需要一个钥匙来开启。";
    }
    if (/^CURRENCY_/.test(lootId)) def.redeemableStatus = "NOT_REDEEMABLE";

    let lcu = null;
    try {
      const r = await OF("/lol-loot/v1/player-loot/" + encodeURIComponent(lootId), { cache: "no-store" }); 
      if (r.ok) { const j = await r.json(); if (j && j.type) lcu = j; }
    } catch (e) {  }
    if (lcu) for (const k in lcu) if (lcu[k] !== undefined && lcu[k] !== null) def[k] = lcu[k];

    if (!def.tilePath || !def.splashPath) {
      const img = localImg(lootId);
      if (img) { if (!def.tilePath) def.tilePath = img.tile; if (!def.splashPath) def.splashPath = img.splash; }
    }
    if (!def.tilePath && lootId.indexOf("CHEST") === 0) {
      def.tilePath = def.splashPath = lootId === "CHEST_generic"
        ? "/fe/lol-loot/assets/loot_item_icons/CHEST_promotion.png"
        : "/fe/lol-loot/assets/loot_item_icons/" + lootId.toLowerCase() + ".png";
    }

    for (const k of DEF_KEYS) if (def[k] === undefined) def[k] = synthDef(lootId, kind)[k];
    def.lootId = lootId;
    def.lootName = def.lootName || lootId;

    if (!def.itemDesc) { const nm = localName(lootId); if (nm) def.itemDesc = nm; }
    if (!def.localizedName) { const ln = localLocalized(lootId); if (ln) def.localizedName = ln; }

    try { Object.defineProperty(def, "__synth", { value: !lcu, enumerable: false, configurable: true }); } catch (e) {  }

    defCache[lootId] = def;
    return cloneDef(def);
  }

  function fakeXhr(xhr, status, obj) {
    const text = typeof obj === "string" ? obj : JSON.stringify(obj);
    let resp = text;
    try { if (xhr.responseType === "json") resp = JSON.parse(text); } catch (e) { resp = text; }
    const isJsonType = xhr.responseType === "json" || xhr.responseType === "";

    const props = { readyState: 4, status: status, statusText: "OK", response: resp, responseText: isJsonType && xhr.responseType !== "json" ? text : "" };
    for (const k in props) {
      try { Object.defineProperty(xhr, k, { value: props[k], configurable: true, writable: true }); }
      catch (e) { try { xhr[k] = props[k]; } catch (e2) {  } }
    }
    try {
      xhr.getAllResponseHeaders = function () { return "content-type: application/json\r\ncontent-length: " + text.length + "\r\n"; };
      xhr.getResponseHeader = function (n) { return String(n).toLowerCase() === "content-type" ? "application/json" : null; };
    } catch (e) {  }

    const fire = (type) => {
      try {
        const ev = new Event(type);
        xhr.dispatchEvent(ev);
        const h = xhr["on" + type];
        if (typeof h === "function") h.call(xhr, ev);
      } catch (e) {  }
    };
    fire("readystatechange");
    fire("load");
    fire("loadend");
  }

  function findChestByRecipe(recipeName) {
    for (const k in CHESTS) if (CHESTS[k].recipe === recipeName) return { key: k, cfg: CHESTS[k] };
    return null;
  }

  async function buildCraftResponse(chestKey, cfg, reqBody, craftedKey) {
    const ctr = state.counters[chestKey] || (state.counters[chestKey] = { n: 0, sinceSkin: 0, sinceMythic: 0 });
    ctr.n++;

    const kind = rollKind(cfg, ctr);                       
    const bonuses = rollBonus(cfg, ctr);                    
    if (kind === "SKIN_SHARD" || kind === "SKIN") ctr.sinceSkin = 0; else ctr.sinceSkin++;
    if (bonuses.some(b => b.kind === "MYTHIC")) ctr.sinceMythic = 0; else ctr.sinceMythic++;

    const results = [resolveLootId(kind, 1)];
    for (const b of bonuses) results.push(resolveLootId(b.kind, b.n));

    const mainEntry = cfg.main.find(e => e.kind === kind);
    if (mainEntry && mainEntry.essence) results.push(resolveLootId("ESSENCE", mainEntry.essence));

    const added = [];
    for (const r of results) {
      const def = await resolveDef(r.lootId, r.kind);
      def.count = r.qty; def.isNew = true; def.itemStatus = "NONE";
      if (def.__synth) {
        if (/_RENTAL$/.test(String(def.type)) || def.isRental) { def.isRental = true; def.redeemableStatus = "REDEEMABLE_RENTAL"; }
        else if (def.type === "SKIN" || def.type === "CHAMPION" || def.type === "SUMMONER_ICON" || def.type === "WARD_SKIN" || def.type === "EMOTE") { def.redeemableStatus = "REDEEMABLE"; }
      }
      const out = { deltaCount: r.qty, playerLoot: def };
      added.push(out);
      state.gains[r.lootId] = (state.gains[r.lootId] || 0) + r.qty;   
    }

    const removed = [];
    const fallback = (craftedKey && CHESTS[craftedKey]) ? CHESTS[craftedKey].slots : cfg.slots;
    const slots = (Array.isArray(reqBody) && reqBody.length) ? reqBody.slice() : fallback.slice();
    for (const sid of slots) {
      const def = await resolveDef(sid, /MATERIAL/i.test(sid) ? "MATERIAL" : "CHEST");
      def.count = Math.max(0, (state.gains[sid] || 0) - 1); def.isNew = false;
      removed.push({ deltaCount: 1, playerLoot: def });
    }

    state.log.unshift({ t: Date.now(), chest: chestKey, opened: craftedKey || chestKey, kind, kinds: results.map(x => x.kind), items: results.map(x => x.lootId), src: cfg.oddsSource });
    state.log = state.log.slice(0, 30);
    save();
    log("craft-faked", { odds: chestKey, opened: craftedKey, kinds: results.map(x => x.kind), items: results.map(x => x.lootId) });
    return { added, redeemed: [], removed };
  }




  const needCraft = () => state.on && !!CHESTS[state.simChest];

  try {
    XMLHttpRequest.prototype.open = function (m, u) {
      try {
        this.__ls = { m: String(m || "").toUpperCase(), u: String(u || "") };
        noteLootFetch(String(u || ""));
      } catch (e) {  }
      return XO.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const self = this, r = self.__ls;
      try {
        if (r) {
          const mc = r.u.match(P_CRAFT);
          if (mc && r.m === "POST" && needCraft()) {
            const recipe = decodeURIComponent(mc[1].split("?")[0]);
            const hit = findChestByRecipe(recipe);
            if (hit) {
              if (state.dry) {                                  
                log("dry-block", { recipe });
                fakeXhr(self, 200, { added: [], redeemed: [], removed: [] });
                return;
              }
              let parsed = null;
              try { parsed = JSON.parse(body); } catch (e) {  }
              const oddsKey = state.simChest;
              const oddsCfg = CHESTS[oddsKey];
              log("hit-craft", { recipe, 实际开的: hit.key, 用哪张表: oddsKey, body: parsed });
              ensurePools()
                .then(() => buildCraftResponse(oddsKey, oddsCfg, parsed, hit.key))
                .then(resp => fakeXhr(self, 200, resp))
                .catch(err => { log("craft-err", String(err)); fakeXhr(self, 200, { added: [], redeemed: [], removed: [] }); });
              return;
            }
          }
        }
      } catch (e) { log("send-err", String(e)); }
      return XS.apply(this, arguments);
    };
    log("install-xhr", {});
  } catch (e) { log("install-xhr-err", String(e)); }

  try {
    window.fetch = function (input, init) {
      try {
        const u = String((typeof input === "string") ? input : (input && input.url) || "");
        noteLootFetch(u);
      } catch (e) {  }
      return OF.apply(this, arguments);
    };
    log("install-fetch", {});
  } catch (e) { log("install-fetch-err", String(e)); }

  const VER = 6;   
  const CSS = `
  .lsim-panel{position:fixed;width:338px;overflow:auto;
    background:#12151c;color:#dfe3ea;border:1px solid #2a3040;border-radius:10px;
    z-index:2147483647 !important;pointer-events:auto !important;
    font:12px/1.55 "Microsoft YaHei",system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.7);display:none}
  .lsim-panel.open{display:block}
  .lsim-hd{padding:9px 12px;background:#1a2030;border-bottom:1px solid #2a3040;border-radius:10px 10px 0 0;
    display:flex;align-items:center;gap:8px}
  .lsim-hd b{color:#c9a86a;font-size:13px;flex:1}
  .lsim-ver{display:inline-block;margin-left:6px;padding:0 5px;border-radius:3px;vertical-align:1px;
    background:#c8aa6e;color:#12151c;font-size:10px;font-weight:700;line-height:15px;
    font-family:system-ui,sans-serif}
  .lsim-bd{padding:10px 12px}
  .lsim-sec{margin:0 0 9px;padding:8px 10px;background:#171b24;border:1px solid #252b38;border-radius:8px}
  .lsim-sec h4{margin:0 0 6px;font-size:11px;color:#8d97a8;font-weight:600;letter-spacing:.5px}
  .lsim-row{display:flex;align-items:center;gap:8px;margin:5px 0}
  .lsim-btn{flex:1;padding:6px 8px;border-radius:6px;border:1px solid #333c4e;background:#232a38;
    color:#dfe3ea;cursor:pointer;font-size:12px}
  .lsim-btn:hover{background:#2c3546;border-color:#4a5570}
  .lsim-btn.pri{background:#3a2f7a;border-color:#5b4bb8;color:#e8e2ff}
  .lsim-btn.pri:hover{background:#463a90}
  .lsim-btn.dan{background:#3a2226;border-color:#6b3138;color:#ffd7da}
  .lsim-sel{flex:1;padding:6px;background:#232a38;color:#dfe3ea;border:1px solid #333c4e;border-radius:6px;font-size:12px}
  .lsim-num{width:56px;padding:6px;background:#232a38;color:#dfe3ea;border:1px solid #333c4e;border-radius:6px;text-align:center;font-size:12px}
  .lsim-x{flex:0 0 auto;width:21px;height:21px;padding:0;line-height:19px;text-align:center;
    border-radius:5px;border:1px solid #3a4356;background:#232a38;color:#9aa5b8;
    cursor:pointer;font-size:15px;font-weight:700;font-family:system-ui,sans-serif}
  .lsim-x:hover{background:#3a2226;border-color:#6b3138;color:#ffd7da}
  .lsim-tag{display:inline-block;padding:1px 6px;border-radius:4px;background:#2a3040;color:#9aa5b8;font-size:10px}
  .lsim-ok{color:#7ddc9a}.lsim-off{color:#8d97a8}.lsim-warn{color:#e8c07d}
  .lsim-list{margin:4px 0 0;padding:0;list-style:none;max-height:104px;overflow:auto}
  .lsim-list li{padding:3px 0;border-bottom:1px dashed #252b38;color:#b9c2d0;font-size:11px}
  .lsim-foot{padding:7px 12px;border-top:1px solid #2a3040;color:#6b7488;font-size:10px}
  .lsim-sw{display:inline-block;width:32px;height:17px;border-radius:9px;background:#3a4152;position:relative;cursor:pointer;vertical-align:middle}
  .lsim-sw.on{background:#5b4bb8}
  .lsim-sw i{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#dfe3ea;transition:.15s}
  .lsim-sw.on i{left:17px}
  .lsim-note{color:#8d97a8;font-size:10.5px;line-height:1.5}
  `;

  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  let panel = null, gainEl = null, logEl = null, statEl = null, oddsEl = null, selfTestEl = null;
  let anchorEl = null;

  async function runSelfTest() {
    const rows = [];
    const add = (ok, text) => rows.push({ ok: !!ok, text });
    try {
      await ensurePools();
      add(pools.skins.length > 1000 && pools.champs.length > 100 && pools.icons.length > 1000 && pools.wards.length > 100,
        "奖池：皮肤 " + pools.skins.length + " ／英雄 " + pools.champs.length + " ／图标 " + pools.icons.length +
        " ／守卫 " + pools.wards.length + " ／表情 " + pools.emotes.length + " ／神话皮肤 " + pools.hext.length);

      const N = 20000;
      for (const k in CHESTS) {
        const cfg = CHESTS[k], cnt = {};
        for (let i = 0; i < N; i++) {
          const kk = rollKind(cfg, { n: 0, sinceSkin: 0, sinceMythic: 0 });   
          cnt[kk] = (cnt[kk] || 0) + 1;
        }
        let worst = 0, who = "";
        for (const e of cfg.main) { const d = Math.abs((cnt[e.kind] || 0) / N * 100 - e.p); if (d > worst) { worst = d; who = e.label; } }
        add(worst < 1.5, cfg.label + " 爆率：" + N + " 次最大偏差 " + worst.toFixed(2) + "%（" + who + "）");
      }

      const probes = [["SUMMONER_ICON_" + (pools.icons[0] || 3384), "ICON"], ["WARD_SKIN_" + (pools.wards[0] || 1), "WARD"], ["EMOTE_" + (pools.emotes[0] || 1), "EMOTE"]];
      for (const [lid, kind] of probes) {
        const d = await resolveDef(lid, kind);
        add(!!d.tilePath && !!d.type, "图片兜底 " + lid + " → " + String(d.tilePath).slice(0, 46));
      }
      const sk = await resolveDef("CHAMPION_SKIN_" + pools.skins[0], "SKIN");
      add(!!sk.type && (sk.tilePath || "").length > 0, "皮肤真身 " + sk.lootId + " type=" + sk.type);

      const probeKey = Object.keys(CHESTS)[0];
      const probeReq = CHESTS[probeKey].slots.slice();
      const resp = await buildCraftResponse(probeKey, CHESTS[probeKey], probeReq, probeKey);
      const fields = resp.added[0] ? Object.keys(resp.added[0].playerLoot).length : 0;
      add(resp.added.length >= 1 && fields === 34, "伪造响应：added " + resp.added.length + " 条／removed " + resp.removed.length + " 条／字段 " + fields + "/34");

      const reProbes = [
        ["/lol-loot/v1/recipes/CHEST_generic_open/craft?repeat=1", P_CRAFT, true],
        ["/lol-loot/v1/recipes/CHEST_champion_mastery_open/craft", P_CRAFT, true],
        ["/lol-loot/v1/recipes/CHEST_generic_open/craft", P_CRAFT, true],
        ["/lol-loot/v1/player-loot", P_CRAFT, false],
        ["/lol-loot/v1/player-loot", P_LIST, true],
        ["/lol-loot/v1/player-loot-map", P_LIST, false],
        ["/lol-loot/v1/player-loot-map", P_MAP, true],
        ["/lol-loot/v2/player-loot-map", P_MAP2, true],
      ];
      const reBad = reProbes.filter(p => p[1].test(p[0]) !== p[2]);
      add(reBad.length === 0, "端点正则：8 项断言" + (reBad.length ? " 失败 " + reBad.map(b => b[0]).join(",") : "全部正确"));

      const snapPick = state.simChest;
      const pickOk = Object.keys(CHESTS).every(k => { state.simChest = k; return CHESTS[k] && rollKind(CHESTS[k], { n: 0, sinceSkin: 0, sinceMythic: 0 }); });
      state.simChest = snapPick;
      add(pickOk && !!CHESTS[state.simChest], "爆率表选择：可选 " + Object.keys(CHESTS).map(k => CHESTS[k].label).join(" / ") + "（当前 " + CHESTS[state.simChest].label + "）");

      const snapOn = state.on;
      state.on = false; const offRes = needCraft();
      state.on = true; const onRes = needCraft();
      state.on = snapOn;
      add(!offRes && onRes, "拦截策略：关闭 → " + (offRes ? "会拦(错)" : "透传") + " ／ 开启 → " + (onRes ? "拦下所有宝箱开箱" : "透传(错)"));
    } catch (e) {
      add(false, "自检异常：" + String(e));
    }
    return rows;
  }

  let lastToggleAt = 0;
  function toggleGuard() {
    const now = Date.now();
    if (now - lastToggleAt < 280) return;          
    lastToggleAt = now;
    togglePanel();
  }
  function hitTest(node, x, y) {
    try {
      if (!node) return false;
      const r = node.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) return false;
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    } catch (e) { return false; }
  }
  function onHotkey(e) {
    try {
      if (e.ctrlKey && e.shiftKey && String(e.key || "").toLowerCase() === "l") {
        e.preventDefault(); e.stopPropagation(); toggleGuard();
      }
    } catch (err) {  }
  }

  function onGlobalPointer(e) {
    try {
      if (!panel || !panel.classList.contains("open")) return;
      const x = e.clientX, y = e.clientY;
      if (typeof x !== "number" || typeof y !== "number") return;
      if (hitTest(panel, x, y)) return;      
      if (hitTest(anchorEl, x, y)) return;   
      closePanel();
    } catch (err) {  }
  }


  function placePanel() {
    if (!panel) return;
    try {
      const W = window.innerWidth || 1280, H = window.innerHeight || 720;
      const gap = 12, pw = 338;
      const width = Math.min(pw, Math.max(240, W - 2 * gap));

      let left, top;
      const ar = (() => { try { return anchorEl ? anchorEl.getBoundingClientRect() : null; } catch (e) { return null; } })();
      if (ar && (ar.width || ar.height)) {
        left = ar.right - width;
        top = ar.bottom + 6;
      } else {
        left = W - width - 16;
        top = 64;
      }
      left = Math.max(gap, Math.min(W - width - gap, left));
      const maxTop = Math.max(gap, H - 220);
      top = Math.max(gap, Math.min(maxTop, top));
      const need = Math.min(panel.scrollHeight || 320, H - 2 * gap);
      if (top + need > H - gap && ar) {
        const above = ar.top - need - 6;
        if (above >= gap) top = above;
      }

      const S = panel.style;
      S.setProperty("position", "fixed", "important");
      S.setProperty("right", "auto", "important");
      S.setProperty("left", left + "px", "important");
      S.setProperty("top", top + "px", "important");
      S.setProperty("bottom", "auto", "important");
      S.setProperty("width", width + "px", "important");
      S.setProperty("max-height", Math.max(180, H - top - gap) + "px", "important");
    } catch (e) {  }
  }

  function installUI() {
    if (document.getElementById("lsim-panel") || !document.body) return;
    try {
      if (!document.getElementById("lsim-css")) {
        const st = el("style"); st.id = "lsim-css"; st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
      }

      panel = el("div", "lsim-panel");
      panel.id = "lsim-panel";
      buildPanel();

      const root = document.documentElement || document.body;
      root.appendChild(panel);

      if (!window.__lsimBound) {
        window.__lsimBound = true;
        document.addEventListener("pointerdown", onGlobalPointer, true);
        document.addEventListener("keydown", onHotkey, true);
        window.addEventListener("resize", () => { try { placePanel(); } catch (e) {  } }, { passive: true });
      }
      log("ui-ready", { root: root.tagName, W: window.innerWidth, H: window.innerHeight });
    } catch (e) { log("ui-install-err", String(e)); }
  }

  function buildPanel() {
    panel.innerHTML = "";
    const hd = el("div", "lsim-hd");
    const ttl = el("b", null, "模拟开箱");
    ttl.appendChild(el("span", "lsim-ver", "v" + VER));  
    hd.appendChild(ttl);
    statEl = el("span", "lsim-tag", "");
    hd.appendChild(statEl);
    const bX = el("button", "lsim-x", "×");
    bX.id = "lsim-close";                            
    bX.title = "收起面板（也可点面板外面任意处 / Ctrl+Shift+L）";
    bX.addEventListener("click", (e) => {
      try { e.stopPropagation(); e.preventDefault(); } catch (err) {  }
      closePanel();
    });
    hd.appendChild(bX);
    panel.appendChild(hd);

    const bd = el("div", "lsim-bd");

    const s1 = el("div", "lsim-sec");
    s1.appendChild(el("h4", null, "模拟模式"));
    const r1 = el("div", "lsim-row");
    r1.appendChild(el("span", null, "开启（拦下真实开箱）"));
    const sw = el("span", "lsim-sw" + (state.on ? " on" : ""));
    sw.id = "lsim-on";                               
    sw.appendChild(el("i"));
    sw.addEventListener("click", () => {
      state.on = !state.on; save(); sw.classList.toggle("on", state.on);
      log("toggle-sim", { on: state.on }); refreshAll();
    });
    r1.appendChild(sw);
    s1.appendChild(r1);
    s1.appendChild(el("div", "lsim-note",
      state.on
        ? "⚠ 已开启：从现在起，你在客户端里开的任何箱子都会被本地拦下并按下面的爆率表结算，真请求不发、道具不消耗。"
        : "关闭时：插件完全静默，开箱走真实流程，账号真扣道具。"));
    bd.appendChild(s1);

    const s2 = el("div", "lsim-sec");
    s2.appendChild(el("h4", null, "用哪张爆率表结算"));
    const r2 = el("div", "lsim-row");
    oddsEl = el("select", "lsim-sel");
    oddsEl.id = "lsim-odds";                         
    for (const k in CHESTS) {
      const o = document.createElement("option");
      o.value = k; o.textContent = CHESTS[k].label + "（" + CHESTS[k].clientName + "）";
      oddsEl.appendChild(o);
    }
    oddsEl.value = state.simChest;
    oddsEl.addEventListener("change", () => {
      if (CHESTS[oddsEl.value]) { state.simChest = oddsEl.value; save(); log("pick-odds", { k: state.simChest }); refreshAll(); }
    });
    r2.appendChild(oddsEl);
    s2.appendChild(r2);
    s2.appendChild(el("div", "lsim-note", "★ 不管你在客户端里点的是哪个箱子，结果都按这张表出 —— 这样只有 1 个紫箱也能无限刷紫箱爆率。"));
    bd.appendChild(s2);

    const s3 = el("div", "lsim-sec");
    s3.appendChild(el("h4", null, "怎么玩"));
    s3.appendChild(el("div", "lsim-note",
      "① 打开上面的开关 → ② 选一张爆率表 → ③ 直接去「战利品」页点你自己的箱子开。"));
    s3.appendChild(el("div", "lsim-note",
      "★ 开箱结果会当场在开箱动画里揭示，并计入下面的产出统计；但不会真的进你的收藏（账号零改动）。"));
    bd.appendChild(s3);

    const s4 = el("div", "lsim-sec");
    s4.appendChild(el("h4", null, "模拟产出统计（账号里不会真的多出来）"));
    gainEl = el("ul", "lsim-list"); s4.appendChild(gainEl);
    bd.appendChild(s4);

    const s5 = el("div", "lsim-sec");
    s5.appendChild(el("h4", null, "最近开箱"));
    logEl = el("ul", "lsim-list"); s5.appendChild(logEl);
    bd.appendChild(s5);

    const s6 = el("div", "lsim-sec");
    s6.appendChild(el("h4", null, "爆率来源"));
    s6.appendChild(el("div", "lsim-note", "紫色宝箱 = 国服官方公示 ｜ 普通海克斯宝箱 = 拳头官方 FAQ。真实账号零改动。"));
    bd.appendChild(s6);

    const s7 = el("div", "lsim-sec");
    s7.appendChild(el("h4", null, "自检"));
    const bTest = el("button", "lsim-btn", "运行自检");
    selfTestEl = el("ul", "lsim-list");
    bTest.addEventListener("click", async () => {
      bTest.disabled = true; bTest.textContent = "检测中…";
      selfTestEl.innerHTML = "";
      const rows = await runSelfTest();
      selfTestEl.innerHTML = "";
      rows.forEach(r => selfTestEl.appendChild(el("li", null, (r.ok ? "✅ " : "❌ ") + r.text)));
      bTest.disabled = false; bTest.textContent = "运行自检";
    });
    s7.appendChild(bTest);
    s7.appendChild(el("div", "lsim-note", "检查奖池、爆率偏差、产出图片、拦截策略。全部 ✅ 即正常。"));
    s7.appendChild(selfTestEl);
    bd.appendChild(s7);

    const bClrG = el("button", "lsim-btn dan", "清空模拟产出与计数");
    bClrG.style.width = "100%";
    bClrG.addEventListener("click", () => { state.gains = {}; state.counters = {}; state.log = []; save(); refreshAll(); });    bd.appendChild(bClrG);
    panel.appendChild(bd);

    const ft = el("div", "lsim-foot", "v" + VER + " · 只拦 craft，不做任何 UI 注入 · 数据存本地 · 不写账号 · 卸载即还原");
    panel.appendChild(ft);

    refreshAll();
  }

  function refreshAll() {
    try {
      if (oddsEl && oddsEl.value !== state.simChest) oddsEl.value = state.simChest;
      if (gainEl) {
        gainEl.innerHTML = "";
        const ks = Object.keys(state.gains);
        if (!ks.length) gainEl.appendChild(el("li", "lsim-off", "（还没开出过东西）"));
        ks.slice(0, 12).forEach(k => gainEl.appendChild(el("li", null, k + "   ×" + state.gains[k])));
      }
      if (logEl) {
        logEl.innerHTML = "";
        if (!state.log.length) logEl.appendChild(el("li", "lsim-off", "（还没开过）"));
        state.log.slice(0, 8).forEach(x => {
          const d = new Date(x.t);
          const hh = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
          logEl.appendChild(el("li", null, hh + "  " + (x.kinds || []).join(" + ") + " → " + (x.items || []).join(", ").slice(0, 40)));
        });
      }
      refreshStat();
    } catch (e) { log("refresh-err", String(e)); }
  }

  function refreshStat() {
    if (!statEl) return;
    statEl.textContent = !state.on ? "已停用" : (state.dry ? "诊断" : "模拟中");
    statEl.className = "lsim-tag " + (!state.on ? "lsim-off" : (state.dry ? "lsim-warn" : "lsim-ok"));
    broadcast();   
  }

  function broadcast() {
    try {
      window.dispatchEvent(new CustomEvent("lootsim-change", {
        detail: { on: !!state.on, dry: !!state.dry, chest: state.simChest, open: !!(panel && panel.classList.contains("open")), ver: VER },
      }));
    } catch (e) {  }
  }

  function closePanel() {
    if (!panel) return false;
    try {
      panel.classList.remove("open");
      panel.style.setProperty("display", "none", "important");
      log("close", {});
      broadcast();
      return true;
    } catch (e) { log("close-err", String(e)); return false; }
  }

  function openPanel(anchor) {
    if (anchor) anchorEl = anchor;
    if (!panel) { log("open-no-panel", {}); installUI(); }
    if (!panel) return false;
    try {
      panel.classList.add("open");
      panel.style.setProperty("display", "block", "important"); 
      placePanel();                          
      refreshAll();
      log("open", { anchored: !!anchorEl });
      broadcast();
      return true;
    } catch (e) { log("open-err", String(e)); return false; }
  }

  function isOpen() { return !!(panel && panel.classList.contains("open")); }

  function togglePanel(anchor) {
    if (anchor) anchorEl = anchor;
    if (isOpen()) closePanel();
    else openPanel(anchor);
  }

  function boot() {
    try { installUI(); } catch (e) { log("ui-err", String(e)); }
    setInterval(() => {
      try {
        const dPanel = document.getElementById("lsim-panel");
        if (dPanel !== panel) {
          const wasOpen = !!(panel && panel.classList && panel.classList.contains("open"));
          panel = null;
          try { if (dPanel && dPanel.parentNode) dPanel.parentNode.removeChild(dPanel); } catch (e) {  }
          installUI();
          if (wasOpen) openPanel();
        }
      } catch (e) {  }
    }, 3000);
    log("boot", {
      on: state.on, simChest: state.simChest, gains: Object.keys(state.gains).length,
      readyState: document.readyState, W: window.innerWidth, H: window.innerHeight,
      rootTag: document.documentElement ? document.documentElement.tagName : "?",
      bodyTransform: (() => { try { return getComputedStyle(document.body).transform; } catch (e) { return "?"; } })(),
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__LOOTSIM = {
    VER,
    get state() { return state; },
    get log() { return logBuf; },
    pools, CHESTS, save, ensurePools, findChestByRecipe, synthDef,
    rollKind, rollBonus, resolveLootId, resolveDef, buildCraftResponse, fakeXhr, runSelfTest,
    localImg, localName, localLocalized, LOCALIZED_NAMES,
    P_LIST, P_MAP, P_MAP2, P_CRAFT, isLootRead, needCraft,
    setOn(v) { state.on = !!v; save(); refreshAll(); },
    setOdds(k) { if (CHESTS[k]) { state.simChest = k; save(); refreshAll(); } },
    reset() { state.gains = {}; state.counters = {}; state.log = []; save(); refreshAll(); },
    toggle: togglePanel, open: openPanel, close: closePanel, isOpen,
    isOn() { return !!state.on; },
    installUI, placePanel,
    setAnchor(n) { anchorEl = n || null; },
    diag() {
      const rect = n => { try { const r = n && n.getBoundingClientRect(); return r ? { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null; } catch (e) { return null; } };
      const out = { env: {}, ui: {}, state: {} };
      try {
        out.env = {
          readyState: document.readyState, W: window.innerWidth, H: window.innerHeight,
          root: document.documentElement ? document.documentElement.tagName : "?",
          bodyTransform: (() => { try { return getComputedStyle(document.body).transform; } catch (e) { return "?"; } })(),
        };
        const dPanel = document.getElementById("lsim-panel");
        out.ui = {
          panelInDom: !!dPanel,
          panelRefOk: dPanel === panel,
          anchored: !!anchorEl,
          globalBound: !!window.__lsimBound,
          panelDisplay: panel ? panel.style.display : null,
          panelOpen: !!(panel && panel.classList && panel.classList.contains("open")),
          recentLog: logBuf.slice(-8),
        };
        out.state = {
          on: state.on, dry: state.dry, simChest: state.simChest,
          simChestLabel: CHESTS[state.simChest] ? CHESTS[state.simChest].label : null,
          needCraft: needCraft(), gains: Object.keys(state.gains).length,
          opened: state.log.length, lootFetchAt,
        };
      } catch (e) { out.err = String(e); }
      return out;
    },
  };

})();
