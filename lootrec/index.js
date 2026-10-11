(function createLootRecorder() {
  "use strict";

  const API = "http://127.0.0.1:17888";
  const MAX_BODY = 14000;     
  const LIMIT = 150;          
  const HIT = /\/lol-loot\/|\/fe\/lol-loot/i;

  const OF = window.fetch;
  let seq = 0;
  let sent = 0;

  function post(evt, data, force) {
    try {
      if (!force && sent >= LIMIT) return;
      sent++;
      let s = JSON.stringify({ evt: evt, data: data });
      if (s.length > MAX_BODY) s = s.slice(0, MAX_BODY) + '"CUT"';
      OF.call(window, API + "/api/diag?d=" + encodeURIComponent(s), { cache: "no-store" }).catch(function () {});
    } catch (e) {  }
  }

  try {
    const proto = XMLHttpRequest.prototype;
    const O = proto.open, S = proto.send;
    if (typeof O === "function" && typeof S === "function") {
      proto.open = function (m, u) {
        try { this.__lr = { m: String(m || ""), u: String(u || "") }; } catch (e) {  }
        return O.apply(this, arguments);          
      };
      proto.send = function (b) {
        try {
          const r = this.__lr;
          if (r && HIT.test(r.u)) {
            let body = null;
            try { body = (typeof b === "string") ? b.slice(0, 3000) : (b ? "[non-string]" : null); } catch (e) {  }
            const self = this;
            self.addEventListener("loadend", function () {
              try {
                let txt = "", hs = "";
                try { txt = String(self.responseText || ""); }
                catch (e) { txt = "[no-text responseType=" + self.responseType + "]"; }
                try { hs = String(self.getAllResponseHeaders() || ""); } catch (e) {  }
                post("lootrec-xhr", {
                  i: ++seq, m: r.m, u: r.u, st: self.status, req: body,
                  hd: hs.slice(0, 500), res: txt.slice(0, 9000),
                }, /craft|open|player-loot/i.test(r.u));   
              } catch (e) {  }
            });
          }
        } catch (e) {  }
        return S.apply(this, arguments);          
      };
      post("lootrec-init", { xhr: true });
    }
  } catch (e) { post("lootrec-init-error", { xhr: String(e) }); }

  try {
    window.fetch = function (input, init) {
      let u = "";
      try { u = String((typeof input === "string") ? input : (input && input.url) || ""); } catch (e) {  }
      const pr = OF.apply(this, arguments);        
      try {
        if (HIT.test(u)) {
          pr.then(function (res) {
            try {
              res.clone().text().then(function (t) {
                post("lootrec-fetch", {
                  i: ++seq, m: String((init && init.method) || "GET"), u: u, st: res.status,
                  res: String(t).slice(0, 9000),
                }, /craft|open|player-loot/i.test(u));
              }).catch(function () {});
            } catch (e) {  }
          }).catch(function () {});
        }
      } catch (e) {  }
      return pr;                                   
    };
    post("lootrec-init", { fetch: true });
  } catch (e) { post("lootrec-init-error", { fetch: String(e) }); }

  function dumpText(url, tag) {
    try {
      OF.call(window, url, { cache: "no-store" }).then(function (r) {
        if (!r.ok) { post("lootrec-dump", { tag: tag, url: url, http: r.status, n: 0 }, true); return null; }
        return r.text().then(function (t) {
          const CH = 1500, n = Math.ceil(t.length / CH);
          post("lootrec-dump", { tag: tag, url: url, len: t.length, n: n }, true);
          for (let i = 0; i < n; i++) {
            post("lootrec-dump", { tag: tag, i: i, of: n, s: t.slice(i * CH, (i + 1) * CH) }, true);
          }
        });
      }).catch(function (e) { post("lootrec-dump", { tag: tag, url: url, err: String(e).slice(0, 120), n: 0 }, true); });
    } catch (e) {  }
  }

  function dumpB64(url, tag) {
    try {
      OF.call(window, url, { cache: "no-store" }).then(function (r) {
        if (!r.ok) { post("lootrec-dump", { tag: tag, url: url, http: r.status, n: 0, bin: 1 }, true); return null; }
        return r.arrayBuffer().then(function (ab) {
          const u8 = new Uint8Array(ab);
          let s = "";
          for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
          const b = btoa(s);
          const CH = 1500, n = Math.ceil(b.length / CH);
          post("lootrec-dump", { tag: tag, url: url, len: u8.length, b64len: b.length, n: n, bin: 1 }, true);
          for (let i = 0; i < n; i++) {
            post("lootrec-dump", { tag: tag, i: i, of: n, s: b.slice(i * CH, (i + 1) * CH) }, true);
          }
        });
      }).catch(function (e) { post("lootrec-dump", { tag: tag, url: url, err: String(e).slice(0, 120), n: 0, bin: 1 }, true); });
    } catch (e) {  }
  }

  try {
    post("lootrec-loc", {
      origin: String(location.origin), href: String(location.href),
      base: String(document.baseURI || ""), ua: String(navigator.userAgent || "").slice(0, 120),
    }, true);
  } catch (e) {  }

  setTimeout(function () {
    try {
      dumpText("/fe/lol-loot/trans.json", "trans");
      dumpB64("/fe/lol-loot/assets/loot_item_icons/chest_128.png", "icon_chest128");
      dumpB64("/fe/lol-loot/assets/loot_item_icons/chest_champion_mastery.png", "icon_cm");
      dumpB64("/fe/lol-loot/assets/loot_item_icons/CHEST_promotion.png", "icon_generic");
    } catch (e) {  }
  }, 2500);

  window.__LOOTREC = { get count() { return seq; }, limit: LIMIT,
    dumpText: dumpText, dumpB64: dumpB64 };

})();
