
(function createPrismLoading() {
  "use strict";

  var VER = "1.0.0";


  var API = "http://127.0.0.1:17888";
  var LOGO_FILE = "prism-loading-logo.png";
  var LOGO_URL = API + "/asset/" + LOGO_FILE;

  var BRAND = "PRISM";

  var LOGO_BOX = 180;

  var BRAND_COLOR = "#c8aa6e";

  var CSS_ID = "prism-loading-css";
  var SEL = "div[id^=index_loading_div]";
  var DIAG_BASE = API;
  var TAG = "[PRISM]";

  function buildCss() {
    return "" +
      SEL + "{ background-color:#010a13 !important; }\n" +

      SEL + ">img{ display:none !important; }\n" +

      SEL + ":before{\n" +
      "  content:\"\" !important;\n" +
      "  background-color:transparent !important;\n" +
      "  background-image:url(\"" + LOGO_URL + "\") !important;\n" +
      "  background-repeat:no-repeat !important;\n" +
      "  background-position:center center !important;\n" +
      "  background-size:contain !important;\n" +
      "  width:" + LOGO_BOX + "px !important;\n" +
      "  height:" + LOGO_BOX + "px !important;\n" +
      "  border-radius:0 !important;\n" +
      "  box-shadow:none !important;\n" +
      "}\n" +

      SEL + ":after{\n" +
      "  content:\"" + BRAND + "\" !important;\n" +
      "  margin-top:32px !important;\n" +
      "  color:" + BRAND_COLOR + " !important;\n" +
      "  font-family:\"Inter\",\"Segoe UI\",system-ui,sans-serif !important;\n" +
      "  font-size:1rem !important;\n" +
      "  font-weight:700 !important;\n" +
      "  letter-spacing:.34em !important;\n" +
      "  text-indent:.34em !important;\n" +
      "  text-transform:uppercase !important;\n" +
      "}\n";
  }

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return false;
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent = buildCss();
    (document.head || document.documentElement).appendChild(st);
    return true;
  }

  var lastKey = "";

  function report(kind, obj) {
    var key;
    try { key = kind + "|" + JSON.stringify(obj); } catch (e) { return; }
    if (key === lastKey) return;
    lastKey = key;
    try {
      var env = JSON.stringify({ evt: "LOADING:" + kind, d: JSON.stringify(obj) });
      fetch(DIAG_BASE + "/api/diag?d=" + encodeURIComponent(env), { cache: "no-store" })
        .catch(function () {  });
    } catch (e) {  }
  }

  function css(el, pseudo, prop) {
    try { return window.getComputedStyle(el, pseudo).getPropertyValue(prop) || ""; }
    catch (e) { return ""; }
  }

  function probe() {
    var els = document.querySelectorAll(SEL);
    var el = els[0] || null;
    var out = {
      v: VER,
      injected: !!document.getElementById(CSS_ID),
      found: els.length,
      url: String(location.href).slice(0, 110)
    };
    if (el) {
      var r = el.getBoundingClientRect();
      var img = el.querySelector("img");
      out.box = [Math.round(r.width), Math.round(r.height)];
      out.imgHidden = img ? (css(img, null, "display") === "none") : "no-img";
      out.afterContent = css(el, "::after", "content");
      out.afterColor = css(el, "::after", "color");
      out.beforeImage = css(el, "::before", "background-image").slice(0, 200);
      out.beforeW = css(el, "::before", "width");
      out.won = (out.afterContent === '"' + BRAND + '"') &&
                (out.beforeImage.indexOf("prism-loading-logo.png") >= 0);
    }
    return out;
  }

  function armProbe() {
    var shots = [400, 1500, 4000];
    for (var i = 0; i < shots.length; i++) {
      (function (t) {
        setTimeout(function () {
          try {
            var s = probe();
            if (s.found > 0) report(s.won ? "win" : "lose", s);
          } catch (e) {  }
        }, t);
      })(shots[i]);
    }
  }


  window.__PRISM_LOADING = {
    version: VER,
    brand: BRAND,
    logoUrl: LOGO_URL,
    css: buildCss,
    probe: probe,
    report: function () { report("manual", probe()); return probe(); }
  };


  function boot() {
    ensureCss();
    armProbe();
  }

  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
