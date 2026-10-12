(function createPrismStore() {
  const API = "http://127.0.0.1:17888";
  const TAG = "[PRISM]";
  const NS = "prism";
  const BUILD = "prism-1.0.0";
  const NAV_CLASS = "menu_item_Prism";
  const ICON_URL = API + "/asset/icon.png";
  const SETTINGS_KEY = "prism-settings";
  const CURRENCY_MAXLEN = 15; 


  const state = {
    online: false,
    open: false,
    pane: "help",
    panelWidth: 1120,
    panelTop: 84,
    currency: { rp: "", be: "" },
    level: "",
    ui: {
      quiet: true,      
      slim: true,
    },
    honor: {
      level: null,      
    },
    regalia: {
      read: false,      
      bannerId: null,   
      crestId: null,    
      borderLevel: 0,   
      crestIndex: null, 
      baseline: null,   
      busy: false,
      err: "",
    },
    clash: {
      data: null,       
      pick: null,       
      filter: 0,        
      loaded: false,
      busy: false,
      err: "",
    },
    cban: {
      pick: null,       
      list: null,       
      err: "",          
    },
    regaliaIcon: {
      url: "",
      list: null,       
      busy: null,       
    },
    regaliaToken: {
      url: "",
    },
    regaliaSlots: [{ id: "", url: "" }, { id: "", url: "" }, { id: "", url: "" }],
    regaliaActiveSlot: -1,
    pbg: {
      on: false,        
      cur: null,        
      list: null,       
      err: "",          
      kw: "",           
      busy: false,      
    },
    trophy: {
      data: null,       
      pick: null,       
      filter: 0,        
      loaded: false,
      busy: false,
      err: "",
    },
    mastery: {
      level: null,      
      flag: null,       
    },
    profileCustom: {
      score: "",      
      champId: 0,     
    },
    regaliaBorder: {
      uniqueId: null,   
    },
    titleCustom: {
      name: "",         
      list: null,       
      err: "",
    },
    collection: {
      unlock: false,    
      level: 10,        
      text: "",         
    },
    skins: {
      all: true,        
      stats: null,      
      acct: undefined,  
      pre: undefined,   
      el: null,         
      date: "",           
      flipped: null,
    },
    cul: {
      wards:     { all: true, el: null, flipped: null, pre: undefined, stats: null, preCb: null, pushed: false },
      finishers: { all: true, el: null, flipped: null, pre: undefined, stats: null, preCb: null, pushed: false },
    },
  };

  let navItem = null;
  let host = null;        
  let shell = null;       
  let backdropEl = null;  
  let hoverProbed = false; 
  let activeStripped = 0;  

  console.log(`${TAG} JS Loaded`);

  setTimeout(() => {
    try { installToastHook(); } catch (e) {  }
  }, 0);

  try {
    fetch(API + "/api/diag?d=" + encodeURIComponent(JSON.stringify({
      evt: "script-loaded",
      build: BUILD,                       
      readyState: document.readyState,
      hasBody: !!document.body,
      href: String(location.href),
    })), { cache: "no-store" }).catch(() => {});
  } catch (e) {  }



  function diag(evt, data) {
    try {
      let payload;
      try {
        payload = JSON.stringify({ evt, data: data === undefined ? null : data, url: String(location.href) });
      } catch (e) {
        payload = JSON.stringify({ evt, data: "unserializable" });
      }
      if (payload.length > 5800) {
        payload = JSON.stringify({
          evt,
          data: {
            _tooBig: true,
            len: payload.length,
            keys: (data && typeof data === "object") ? Object.keys(data).slice(0, 14) : null,
          },
          url: String(location.href),
        });
      }
      fetch(API + "/api/diag?d=" + encodeURIComponent(payload), { cache: "no-store" }).catch(() => {});
    } catch (e) {  }
  }

  function apiGet(path, timeout) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout || 30000);
    return fetch(API + path, { cache: "no-store", signal: ctl.signal })
      .then((res) => res.json().then((d) => {
        if (!res.ok) {
          const err = new Error((d && d.error) || ("HTTP " + res.status));
          err.status = res.status; err.body = d;
          throw err;
        }
        return d;
      }))
      .finally(() => clearTimeout(t));
  }

  function rectOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }

  function probeIcon(iconEl) {
    if (!iconEl) return null;
    let cs = null;
    try { cs = getComputedStyle(iconEl); } catch (e) { cs = null; }
    return {
      backgroundColor: cs ? cs.backgroundColor : null,
      color: cs ? cs.color : null,
      maskImage: cs ? (cs.webkitMaskImage || cs.maskImage || null) : null,
      maskSize: cs ? (cs.webkitMaskSize || cs.maskSize || null) : null,
      display: cs ? cs.display : null,
      opacity: cs ? cs.opacity : null,
      visibility: cs ? cs.visibility : null,
    };
  }

  function snapshot(tag, extra) {
    const rightNav = document.querySelector(".right-nav-menu");
    const item = document.querySelector('lol-uikit-navigation-item[data-prism]');
    const icon = item ? item.querySelector(".menu-item-icon") : null;
    diag(tag, Object.assign({
      rightNavFound: !!rightNav,
      rightNavChildren: rightNav
        ? Array.prototype.slice.call(rightNav.children, 0, 16).map((e) => e.tagName + "." + (e.className || ""))
        : null,
      navBarFound: !!document.querySelector(".main-nav-bar"),
      itemFound: !!item,
      itemClass: item ? item.className : null,
      itemRect: rectOf(item),
      iconRect: rectOf(icon),
      iconStyle: probeIcon(icon),
      innerW: window.innerWidth,
      innerH: window.innerHeight,
    }, extra || {}));
  }


  const CSS = `
button.bug-reporter-button { display: none !important; }


[class^="${NS}-"], [class*=" ${NS}-"] { box-sizing: border-box; }
.${NS}-host { position: fixed; inset: 0; z-index: 10000; pointer-events: none; }
.${NS}-backdrop {
  position: fixed; inset: 0; z-index: 9999; background: transparent; pointer-events: all;
}
.${NS}-flyout {
  position: absolute; z-index: 10001; pointer-events: all;
  background: transparent !important; background-color: transparent !important;
  background-image: none !important; border: none !important;
  box-shadow: none !important; margin: 0 !important; padding: 0 !important;
}
.${NS}-flyout > * { background: transparent !important; }
.${NS}-content {
  display: block; width: 100%; height: 100%;
  padding: 0 !important; margin: 0 !important; border: none !important;
  box-shadow: none !important; background: transparent !important;
}


.${NS}-shell {
  width: 100%; min-width: 0; box-sizing: border-box;
  display: flex; flex-direction: column;
  background: #010a13; border: 1px solid #785a28; border-radius: 3px;
  box-shadow: 0 14px 48px rgba(0,0,0,.75), 0 0 0 1px rgba(0,0,0,.6);
  color: #a09b8c; font: 400 13px/1.5 "Segoe UI","Spiegel",sans-serif;
  overflow: hidden;
}
.${NS}-head {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: linear-gradient(180deg,#1e2328,#14191f);
  border-bottom: 1px solid #463714; flex: none;
}
.${NS}-title { color: #f0e6d2; font-size: 15px; font-weight: 600; letter-spacing: .6px; }
.${NS}-title small { color: #785a28; font-weight: 400; margin-left: 8px; font-size: 11px; letter-spacing: 0; }
.${NS}-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #4a4a4a; flex: none;
}
.${NS}-dot.online { background: #3fb950; box-shadow: 0 0 6px #3fb950; }
.${NS}-spacer { flex: 1; }
.${NS}-close {
  width: 28px; height: 28px; border: 1px solid #463714; border-radius: 2px; flex: none;
  background: #1e2328; color: #a09b8c; cursor: pointer; font-size: 15px; line-height: 1;
}
.${NS}-close:hover { border-color: #c89b3c; color: #f0e6d2; }

.${NS}-bar { display: flex; align-items: center; gap: 10px; padding: 11px 16px 0; flex: none; }
.${NS}-input {
  flex: 1; min-width: 0; padding: 8px 11px; border-radius: 2px;
  background: #010a13; border: 1px solid #463714; color: #f0e6d2;
  font: 400 13px "Segoe UI",sans-serif; outline: none;
}
.${NS}-input:focus { border-color: #c89b3c; }
.${NS}-input::placeholder { color: #5b5a56; }
.${NS}-sel {
  padding: 8px 9px; border-radius: 2px; background: #010a13; border: 1px solid #463714;
  color: #cdbe91; font: 400 12px "Segoe UI",sans-serif; outline: none;
}

.${NS}-body {
  flex: 1; overflow: hidden; padding: 0; min-height: 260px;
  display: flex; flex-direction: column;   
}
.${NS}-body::-webkit-scrollbar { width: 9px; }
.${NS}-body::-webkit-scrollbar-track { background: #010a13; }
.${NS}-body::-webkit-scrollbar-thumb { background: #463714; border-radius: 4px; }

.${NS}-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(206px,1fr)); gap: 12px; }
.${NS}-sub { color: #5b5a56; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${NS}-ghost {
  flex: 1; padding: 6px 8px; border-radius: 2px; cursor: pointer;
  font: 500 12px "Segoe UI",sans-serif; border: 1px solid #c89b3c;
  background: linear-gradient(180deg,#c89b3c,#a17f2c); color: #1e2328;
}
.${NS}-ghost { background: #1e2328; border-color: #463714; color: #cdbe91; flex: 0 0 auto; padding: 6px 10px; }
.${NS}-ghost:hover { border-color: #c89b3c; color: #f0e6d2; }
.${NS}-ghost.lsim-on {
  background: linear-gradient(180deg,#c89b3c,#a17f2c); border-color: #f0e6d2;
  color: #1e2328; font-weight: 600;
  box-shadow: 0 0 0 1px rgba(200,155,60,.55), 0 0 10px rgba(200,155,60,.35);
}
.${NS}-ghost.lsim-on:hover { filter: brightness(1.12); border-color: #fff; color: #12151c; }

.${NS}-foot {
  flex: none; display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; border-top: 1px solid #463714; background: #0a1119;
}
.${NS}-hint { flex: 1; color: #5b5a56; font-size: 11px; }
.${NS}-hint b { color: #cdbe91; font-weight: 500; }

.${NS}-tag {
  padding: 2px 7px; border-radius: 2px; background: #1e2328; border: 1px solid #463714;
  color: #cdbe91; font-size: 11px; flex: none;
}

.${NS}-layout { flex: 1; min-height: 0; display: flex; }
.${NS}-sidebar {
  width: 180px; flex: none; display: flex; flex-direction: column;
  background: rgba(1, 10, 19, .6);
  border-right: 1px solid rgba(200, 170, 110, .15);
}
.${NS}-snav {
  flex: 1; display: flex; flex-direction: column; gap: 2px;
  padding: 8px 6px; overflow-y: auto; overflow-x: hidden; min-height: 0;
}
.${NS}-snav::-webkit-scrollbar { width: 0; }
.${NS}-sitem {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  background: none; border: 1px solid transparent; border-radius: 4px;
  color: #a09b8c; cursor: pointer; font-family: inherit;
  font-size: 12px; font-weight: 500; letter-spacing: .03em;
  white-space: nowrap; width: 100%; text-align: left; transition: all .2s ease;
}
.${NS}-sitem:hover { color: #f0e6d2; background: #c8aa6e14; border-color: #c8aa6e1f; }
.${NS}-sitem.on {
  color: #c8aa6e; background: #c8aa6e1f; border-color: #c8aa6e40;
  box-shadow: inset 2px 0 #c8aa6e;
}
.${NS}-sitem.on:hover { color: #c8aa6e; background: #c8aa6e29; }
.${NS}-sitem i {                       
  width: 6px; height: 6px; border-radius: 50%;
  background: #463714; flex: none; transition: background .2s ease;
}
.${NS}-sitem.on i { background: #c8aa6e; box-shadow: 0 0 5px rgba(200, 170, 110, .7); }
.${NS}-sitem span { overflow: hidden; text-overflow: ellipsis; }
.${NS}-pane {
  flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden;
  padding: 24px 30px 34px;                    
}
.${NS}-pane::-webkit-scrollbar { width: 6px; }
.${NS}-pane::-webkit-scrollbar-track { background: transparent; }
.${NS}-pane::-webkit-scrollbar-thumb { background: #c8aa6e33; border-radius: 3px; }
.${NS}-pane::-webkit-scrollbar-thumb:hover { background: #c8aa6e59; }
.${NS}-paneh {
  margin: 0 0 26px;
  color: #f0e6d2; font-size: 22px; font-weight: 700; letter-spacing: 2px;
  text-shadow: 0 0 8px rgba(200, 170, 110, .2);
}
.${NS}-paneh:not(:first-child) { margin-top: 34px; }
.${NS}-box {
  position: relative; z-index: 1;
  margin-bottom: 16px; padding: 16px 20px 18px;
  background: #010a1366;
  border: 1px solid rgba(60, 46, 22, .6);
  border-radius: 4px;
  transition: background .3s ease, border-color .3s ease, box-shadow .3s ease;
}
.${NS}-box:hover {
  z-index: 2;
  background: #091428cc;
  border-color: #c8aa6e80;
  box-shadow: 0 4px 15px #0006, 0 0 10px #c8aa6e26;
}
.${NS}-box > .${NS}-setrow:last-child,
.${NS}-box > .${NS}-crestrow:last-child,
.${NS}-box > .${NS}-setgrid:last-child,
.${NS}-box > .${NS}-fltrow:last-child,
.${NS}-box > .${NS}-tropedrow:last-child,
.${NS}-box > [data-el="sfn-wrap"]:last-child { margin-bottom: 0; }
.${NS}-subh {
  margin: 0 0 14px; padding-bottom: 8px;
  color: #c8aa6e; font-size: 12.5px; font-weight: 700;
  letter-spacing: 1.6px; text-transform: uppercase;
  border-bottom: 1px solid rgba(200, 170, 110, .15);
}
.${NS}-subh::before { content: "◆"; color: #785a28; margin-right: 7px; font-size: 10px; }
.${NS}-setrow { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.${NS}-setlabel {
  width: 104px; flex: none; color: #f0e6d2; font-size: 13px; line-height: 1.35;
}   
.${NS}-setinput {
  width: 190px; box-sizing: border-box; padding: 7px 11px;
  background: #010a13; border: 1px solid #463714; border-radius: 2px;
  color: #f0e6d2; font: 400 13px/1.4 "Segoe UI", "Spiegel", sans-serif; letter-spacing: .04em;
}
.${NS}-setinput:focus { outline: none; border-color: #c8aa6e; }
.${NS}-setinput::placeholder { color: #5b5a56; }
.${NS}-setinputwide {
  flex: 1; min-width: 0; box-sizing: border-box; padding: 7px 11px;
  background: #010a13; border: 1px solid #463714; border-radius: 2px;
  color: #f0e6d2; font: 400 13px/1.4 "Segoe UI", "Spiegel", sans-serif; letter-spacing: .04em;
}
.${NS}-setinputwide:focus { outline: none; border-color: #c8aa6e; }
.${NS}-setinputwide::placeholder { color: #5b5a56; }
.${NS}-setsel {
  box-sizing: border-box; padding: 6px 8px; min-width: 92px;
  background: #010a13; border: 1px solid #463714; border-radius: 2px;
  color: #f0e6d2; font: 400 12px/1.4 "Segoe UI", "Spiegel", sans-serif;
  letter-spacing: .03em; color-scheme: dark;
}
.${NS}-setsel:focus { outline: none; border-color: #c8aa6e; }
.${NS}-setsel option { background: #010a13; color: #f0e6d2; }
.${NS}-setreal { color: #5b5a56; font-size: 12px; }
.${NS}-setpv { color: #5b5a56; font-size: 12px; }
.${NS}-setpv b { color: #c8aa6e; font-weight: 500; }
.${NS}-sethint { color: #0a98ac; font-size: 12px; }
.${NS}-currow { align-items: flex-start; gap: 16px; }
.${NS}-curcol { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.${NS}-curline { display: flex; align-items: center; gap: 8px; }
.${NS}-currow .${NS}-setlabel { width: 76px; }
.${NS}-curinp { width: 95px; }        
.${NS}-curreset { margin-left: auto; align-self: center; }
.${NS}-sfntag { width: 95px; }
.${NS}-setdate {
  width: 190px; box-sizing: border-box; padding: 6px 10px;
  background: #010a13; border: 1px solid #463714; border-radius: 2px;
  color: #f0e6d2; font: 400 13px/1.4 "Segoe UI", "Spiegel", sans-serif;
  color-scheme: dark;
}
.${NS}-setdate:focus { outline: none; border-color: #c8aa6e; }
.${NS}-setdate::-webkit-calendar-picker-indicator { filter: invert(.8) sepia(.3) saturate(3) hue-rotate(5deg); cursor: pointer; }
.${NS}-docp {
  margin: 0 0 11px; color: #a09b8c;
  font-size: 12.5px; line-height: 1.85; letter-spacing: .02em;
}
.${NS}-docp:last-child { margin-bottom: 0; }
.${NS}-docp b { color: #f0e6d2; font-weight: 600; }       
.${NS}-docp em { color: #c8aa6e; font-style: normal; }     
.${NS}-docp i { color: #5b5a56; font-style: normal; }      
.${NS}-docwhere {
  margin: 0 0 12px; padding: 9px 13px;
  background: #010a13; border-left: 2px solid #c8aa6e; border-radius: 0 2px 2px 0;
  color: #a09b8c; font-size: 12.5px; line-height: 1.85; letter-spacing: .02em;
}
.${NS}-docwhere:last-child { margin-bottom: 0; }
.${NS}-docwhere b { color: #f0e6d2; font-weight: 600; }
.${NS}-docwhere em { color: #c8aa6e; font-style: normal; }
.${NS}-docwhere i { color: #5b5a56; font-style: normal; }   
.${NS}-docsteps { margin: 0 0 12px; padding: 0; list-style: none; }
.${NS}-docsteps li {
  position: relative; padding-left: 20px; margin-bottom: 7px;
  color: #a09b8c; font-size: 12.5px; line-height: 1.85; letter-spacing: .02em;
}
.${NS}-docsteps li:last-child { margin-bottom: 0; }
.${NS}-docsteps li::before {
  content: "\u25B8"; position: absolute; left: 4px; top: 0;
  color: #785a28; font-size: 11px;
}
.${NS}-docsteps li b { color: #f0e6d2; font-weight: 600; }
.${NS}-docout { border-color: rgba(200, 170, 110, .38); }
.${NS}-crestrow { display: flex; gap: 10px; margin: 4px 0 20px; flex-wrap: wrap; }
.${NS}-tclist {
  max-height: 210px; overflow-y: auto; margin: 4px 0 18px;
  border: 1px solid #1e2328; border-radius: 3px; background: #010a13;
}
.${NS}-tclist .it {
  padding: 6px 11px; color: #a09b8c; font-size: 12.5px; cursor: pointer;
  border-bottom: 1px solid #10171e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.${NS}-tclist .it:hover { background: #1e2328; color: #f0e6d2; }
.${NS}-tclist .it.on { background: #1e2328; color: #c8aa6e; }
.${NS}-tclist .empty { padding: 10px 11px; color: #5b5a56; font-size: 12px; }
.${NS}-brow { display: flex; gap: 8px; margin: 4px 0 18px; flex-wrap: wrap; }
.${NS}-brow button {
  width: 54px; height: 54px; padding: 0; position: relative; cursor: pointer;
  background: #010a13; border: 1px solid #1e2328; border-radius: 3px;
}
.${NS}-brow button:hover { border-color: #c89b3c; }
.${NS}-brow button.on { border-color: #c8aa6e; box-shadow: 0 0 0 1px #c8aa6e inset; }
.${NS}-brow img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.${NS}-brow button span {
  position: absolute; left: 0; right: 0; bottom: 0; font-size: 9px; color: #7c7c74;
  background: #010a13cc; text-align: center; line-height: 12px;
}
.${NS}-crest {
  width: 76px; padding: 6px 4px 4px; cursor: pointer; text-align: center;
  background: #010a13; border: 1px solid #3c3c41; border-radius: 3px;
  color: #a09b8c; font: inherit; transition: border-color .12s, box-shadow .12s;
}
.${NS}-crest:hover { border-color: #785a28; }
.${NS}-crest.on { border-color: #c8aa6e; box-shadow: 0 0 0 1px #c8aa6e inset; }
.${NS}-crest.on span { color: #f0e6d2; }
.${NS}-crest img { width: 62px; height: 62px; display: block; margin: 0 auto 2px; object-fit: contain; }
.${NS}-crest span { font-size: 11px; }
.${NS}-msrow .${NS}-crest { width: 90px; }
.${NS}-msrow .${NS}-crest img { width: 80px; height: 66px; }
.${NS}-setgrid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 8px; margin: 6px 0 14px; max-height: 340px; overflow-y: auto;
  padding: 6px; background: #00000033; border-radius: 3px;
}
.${NS}-setgrid::-webkit-scrollbar { width: 8px; }
.${NS}-setgrid::-webkit-scrollbar-thumb { background: #3c3c41; border-radius: 4px; }
.${NS}-locked { opacity: .35; cursor: not-allowed; filter: grayscale(1); }
.${NS}-locked:hover { border-color: transparent; background: transparent; }
.${NS}-gridsep {
  grid-column: 1 / -1; color: #5b5a56; font-size: 11px; padding: 10px 2px 2px;
  border-top: 1px dashed #2a2f36; margin-top: 4px;
}
.${NS}-ghost.active { border-color: #c8aa6e; color: #f0e6d2; }

.${NS}-fltrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 2px 0 10px; }
.${NS}-flt {
  padding: 4px 12px; cursor: pointer; background: transparent; color: #a09b8c;
  border: 1px solid #3c3c41; border-radius: 2px; font: inherit; font-size: 12px;
  transition: border-color .12s, color .12s;
}
.${NS}-flt:hover { border-color: #785a28; color: #f0e6d2; }
.${NS}-flt.on { border-color: #c8aa6e; color: #f0e6d2; background: #1e2328; }
.${NS}-flag {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 4px 5px; cursor: pointer; background: transparent;
  border: 1px solid transparent; border-radius: 3px; color: #a09b8c; font: inherit;
  transition: border-color .12s, background .12s;
}
.${NS}-flag:hover { background: #0f1b2e; border-color: #785a28; }
.${NS}-flag.on { border-color: #c8aa6e; background: #1e2328; box-shadow: 0 0 0 1px #c8aa6e inset; }
.${NS}-flag.on em { color: #f0e6d2; }
.${NS}-flag img {
  width: 64px; height: 110px; display: block; object-fit: contain;
  background: #010a13; border-radius: 2px;
}
.${NS}-flag em {
  font-style: normal; font-size: 11px; line-height: 1.3; text-align: center;
  display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${NS}-flag s {
  text-decoration: none; font-size: 10px; color: #5b5a56; letter-spacing: .08em;
}
.${NS}-flag.on s { color: #a09b8c; }

.${NS}-pfbg {
  position: fixed; inset: 0; z-index: 99999;
  background: #010a13cc; display: flex; align-items: center; justify-content: center;
}
.${NS}-pfbg-panel {
  width: min(1110px, 92vw); height: min(620px, 86vh);
  display: flex; flex-direction: column; box-sizing: border-box;
  background: #0a1017; border: 1px solid #785a28; border-radius: 4px;
  box-shadow: 0 12px 48px #000000aa; color: #a09b8c; font: inherit; overflow: hidden;
}
.${NS}-pfbg-head {
  display: flex; align-items: center; gap: 10px; flex: none;
  padding: 12px 14px; border-bottom: 1px solid #2a2f36;
}
.${NS}-pfbg-title { color: #f0e6d2; font-size: 14px; letter-spacing: .04em; white-space: nowrap; }
.${NS}-pfbg-search {
  flex: 1 1 auto; min-width: 120px; padding: 5px 8px; font: inherit; font-size: 12px;
  background: #010a13; color: #f0e6d2; border: 1px solid #3c3c41; border-radius: 2px; outline: none;
}
.${NS}-pfbg-search:focus { border-color: #c8aa6e; }
.${NS}-pfbg-count { font-size: 11px; color: #5b5a56; white-space: nowrap; }
.${NS}-pfbg-x {
  flex: none; width: 26px; height: 26px; cursor: pointer; font: inherit; font-size: 16px;
  line-height: 1; background: transparent; color: #a09b8c;
  border: 1px solid #3c3c41; border-radius: 2px;
}
.${NS}-pfbg-x:hover { border-color: #c8aa6e; color: #f0e6d2; }
.${NS}-pfbg-warn {
  flex: none; padding: 7px 14px; font-size: 11px; color: #e0b96a;
  background: #2a1f0a; border-bottom: 1px solid #2a2f36;
}
.${NS}-pfbg-warn b { color: #f0e6d2; }
.${NS}-pfbg-status {
  flex: none; min-height: 16px; padding: 4px 14px 0; font-size: 11px; color: #7ea0c4;
}
.${NS}-pfbg-grid {
  flex: 1 1 auto; overflow-y: auto; padding: 10px 12px 14px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 8px; align-content: start;
}
.${NS}-pfbg-frag { display: contents; }
.${NS}-pfbg-grid::-webkit-scrollbar { width: 8px; }
.${NS}-pfbg-grid::-webkit-scrollbar-thumb { background: #3c3c41; border-radius: 4px; }
.${NS}-pfbg-msg { grid-column: 1 / -1; color: #5b5a56; font-size: 11px; padding: 10px 2px; }
.${NS}-pfcard {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 5px 4px 6px; cursor: pointer; background: transparent;
  border: 1px solid transparent; border-radius: 3px; color: #a09b8c; font: inherit;
  transition: border-color .12s, background .12s;
}
.${NS}-pfcard:hover { background: #0f1b2e; border-color: #785a28; }
.${NS}-pfcard.on { border-color: #c8aa6e; background: #1e2328; box-shadow: 0 0 0 1px #c8aa6e inset; }
.${NS}-pfcard.on em { color: #f0e6d2; }
.${NS}-pfcard img {
  width: 96px; height: 96px; display: block; object-fit: cover;
  background: #010a13; border-radius: 2px;
}
.${NS}-pfcard em {
  font-style: normal; font-size: 11px; line-height: 1.25; text-align: center;
  display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${NS}-pfcard s {
  text-decoration: none; font-size: 10px; color: #5b5a56;
  display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.${NS}-tro {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 4px 5px; cursor: pointer; background: transparent;
  border: 1px solid transparent; border-radius: 3px; color: #a09b8c; font: inherit;
  transition: border-color .12s, background .12s;
}
.${NS}-tro:hover { background: #0f1b2e; border-color: #785a28; }
.${NS}-tro.on { border-color: #c8aa6e; background: #1e2328; box-shadow: 0 0 0 1px #c8aa6e inset; }
.${NS}-tro.on em { color: #f0e6d2; }
.${NS}-trobox {
  position: relative; display: block; width: 84px; height: 105px;
  background: #010a13; border-radius: 2px; overflow: hidden;
}
.${NS}-trobox img {
  position: absolute; left: 50%; transform: translateX(-50%);
  image-rendering: auto; pointer-events: none;
}
.${NS}-trobox img.ped { width: 40.8px; top: 60.7px; }
.${NS}-trobox img.cup { height: 73.5px; top: 2.9px; }
.${NS}-tro em {
  font-style: normal; font-size: 11px; line-height: 1.3; text-align: center;
  display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${NS}-tro s {
  text-decoration: none; font-size: 10px; color: #5b5a56; letter-spacing: .08em;
}
.${NS}-tro.on s { color: #a09b8c; }
.${NS}-tropedrow {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 2px 0 12px;
}
.${NS}-tropedrow .${NS}-trobox { width: 64px; height: 64px; }
.${NS}-tropedrow .${NS}-trobox img.ped {
  width: 52px; top: 50%; transform: translate(-50%, -50%);
}
div.loot-recipe-help-button.lsim-on {
  outline: 1px solid rgba(200, 170, 110, 0.8);
  outline-offset: 1px;
  border-radius: 3px;
}
.identity-customizer-border[data-prism-border] .identity-customizer-border-icon {
  width: 100px; height: 100px; object-fit: contain; display: block; margin: 0 auto;
}
.identity-customizer-border[data-prism-border] { cursor: pointer; }

[class*="identity-customizer-title"] .title-icon { opacity: 1 !important; }
[class*="identity-customizer-title"] .title-text { color: #a09b8c !important; }
[class*="identity-customizer-title"] { cursor: pointer; }
[id^="title-id-"] { opacity: 1 !important; filter: none !important; }
.identity-customizer-tab-banners-component .identity-customizer-grid .identity-customizer-banner.unselectable .identity-customizer-banner-wrapper,
.identity-customizer-tab-banners-component .identity-customizer-banner.unselectable .identity-customizer-banner-wrapper {
  filter: none !important; opacity: 1 !important;
}
.identity-customizer-tab-banners-component .identity-customizer-banner-locked-container {
  display: none !important;
}
.identity-customizer-tab-banners-component .identity-customizer-banner[data-prism-banner-hide] {
  display: none !important;
}
.identity-customizer-tab-banners-component .identity-customizer-banner { cursor: pointer; }
.identity-customizer-tab-banners-component .identity-customizer-banner[data-prism-banner-picked] {
  outline: 2px solid #c8aa6e; outline-offset: 2px; border-radius: 3px;
}
.${NS}-qsum { display: flex; flex-wrap: wrap; gap: 8px; }
.${NS}-qprof { display: flex; flex-direction: column; gap: 8px; }
.${NS}-qprofrow { display: flex; align-items: center; gap: 12px; }
.${NS}-qav {
  width: 56px; height: 56px; border-radius: 50%; flex: 0 0 auto;
  border: 2px solid #463714; background: #1e2328; object-fit: cover;
}
.${NS}-qprofmeta { min-width: 0; flex: 1 1 auto; }
.${NS}-qname { color: #f0e6d2; font-size: 14px; font-weight: 600; letter-spacing: .03em; }
.${NS}-qsub { color: #a09b8c; font-size: 11.5px; line-height: 1.7; }
.${NS}-qsub b { color: #c8aa6e; font-weight: 600; }
.${NS}-qranks { display: flex; flex-wrap: wrap; gap: 8px; }
.${NS}-qrankcard {
  flex: 1 1 150px; min-width: 140px; box-sizing: border-box;
  padding: 8px 10px; background: #0a1428; border: 1px solid #1e2328; border-radius: 2px;
}
.${NS}-qrname { color: #a09b8c; font-size: 11px; letter-spacing: .05em; }
.${NS}-qrtier { color: #c8aa6e; font-size: 15px; font-weight: 700; margin: 2px 0; }
.${NS}-qrlp { color: #cdbe91; font-size: 11.5px; }
.${NS}-qrrec { color: #5b5a56; font-size: 11px; margin-top: 2px; }
.${NS}-qassets { display: flex; flex-wrap: wrap; gap: 8px; }
.${NS}-qchip {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 5px 11px; border: 1px solid #463714; border-radius: 2px;
  background: #010a13; color: #a09b8c; font-size: 12px; letter-spacing: .04em;
}
.${NS}-qchip b { color: #f0e6d2; font-weight: 600; }
.${NS}-qchip.hl b { color: #c8aa6e; }
.${NS}-qlist { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.${NS}-qempty { color: #5b5a56; font-size: 12px; padding: 4px 0; }
.${NS}-qrow {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; border-radius: 2px;
  border-left: 3px solid #463714; background: #010a13;
  transition: background .2s ease, border-color .2s ease;
}
.${NS}-qrow:hover { background: #091428; }
.${NS}-qrow.win { border-left-color: #3c8ac4; background: rgba(60, 138, 196, .10); }
.${NS}-qrow.win:hover { background: rgba(60, 138, 196, .18); }
.${NS}-qrow.loss { border-left-color: #b04a4a; background: rgba(176, 74, 74, .10); }
.${NS}-qrow.loss:hover { background: rgba(176, 74, 74, .18); }
.${NS}-qrow.remake { border-left-color: #5b5a56; background: rgba(91, 90, 86, .12); }
.${NS}-qhead { flex: 0 0 auto; display: flex; align-items: center; gap: 9px; width: 186px; }
.${NS}-qavatar {
  position: relative; width: 48px; height: 48px; flex: 0 0 48px;
  border-radius: 50%; overflow: hidden; border: 2px solid #463714; background: #1e2328;
}
.${NS}-qavatar img { width: 100%; height: 100%; display: block; }
.${NS}-qlv {
  position: absolute; right: -1px; bottom: -1px; min-width: 16px; height: 15px;
  box-sizing: border-box; padding: 0 3px; border-radius: 2px; background: #010a13;
  border: 1px solid #463714; color: #cdbe91; font-size: 10px; line-height: 13px;
  text-align: center;
}
.${NS}-qresbox { min-width: 0; }
.${NS}-qout { font-size: 13px; font-weight: 600; letter-spacing: .06em; }
.${NS}-qrow.win .${NS}-qout { color: #5aa9e6; }
.${NS}-qrow.loss .${NS}-qout { color: #d07373; }
.${NS}-qrow.remake .${NS}-qout { color: #a09b8c; }
.${NS}-qmodebox { color: #a09b8c; font-size: 11.5px; margin-top: 1px; }
.${NS}-qchamp {
  color: #c8aa6e; font-size: 11.5px; margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${NS}-qmid { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.${NS}-qirow { display: flex; align-items: center; gap: 3px; flex-wrap: nowrap; }
.${NS}-qslot {
  width: 22px; height: 22px; box-sizing: border-box; flex: 0 0 22px;
  display: inline-flex; align-items: center; justify-content: center; overflow: hidden;
  background: #0a1428; border: 1px solid #1e2328; border-radius: 2px;
}
.${NS}-qslot img { width: 100%; height: 100%; display: block; }
.${NS}-qeqslot img { width: 100%; height: 100%; display: block; }
.${NS}-qsep {
  width: 1px; height: 18px; flex: 0 0 1px; background: #463714; margin: 0 4px;
}
.${NS}-qaug { position: relative; border-color: #463714; }
.${NS}-qaug.prismatic { border-color: #b06be0; box-shadow: 0 0 4px rgba(176, 107, 224, .45); }
.${NS}-qaug.gold { border-color: #c8aa6e; }
.${NS}-qaug.silver { border-color: #8c9bb0; }
.${NS}-qaugtxt {
  position: absolute; left: 0; right: 0; top: 0; bottom: 0;
  display: none; align-items: center; justify-content: center;
  color: #a09b8c; font-size: 9px; font-style: normal; letter-spacing: -.02em;
}
.${NS}-qnoicon .${NS}-qaugtxt { display: flex; }
.${NS}-qaug img { position: relative; z-index: 1; }
.${NS}-qkda { flex: 0 0 104px; color: #a09b8c; font-size: 13px; text-align: right; }
.${NS}-qkda b { color: #f0e6d2; font-weight: 600; }
.${NS}-qkda s { color: #b04a4a; text-decoration: none; }
.${NS}-qnum {
  flex: 0 0 74px; text-align: right; color: #cdbe91; font-size: 12px; line-height: 1.35;
}
.${NS}-qnum i { display: block; color: #5b5a56; font-style: normal; font-size: 10px; }
.${NS}-qmap {
  flex: 0 0 132px; text-align: right; color: #a09b8c; font-size: 11.5px; line-height: 1.45;
}
.${NS}-qmap i { display: block; color: #5b5a56; font-style: normal; font-size: 10.5px; }
.${NS}-qrow { cursor: pointer; }
.${NS}-qrow.open { border-left-color: #c8aa6e; }
.${NS}-qdet {
  margin: -2px 0 6px 0; padding: 10px 12px 12px 12px;
  background: #060d17; border: 1px solid #1e2328; border-top: none;
  display: flex; flex-direction: column; gap: 9px;
}
.${NS}-qsec { display: flex; align-items: flex-start; gap: 8px; }
.${NS}-qlab {
  flex: 0 0 62px; color: #5b5a56; font-size: 11px; letter-spacing: .05em;
  padding-top: 5px; text-align: right;
}
.${NS}-qeqrow { display: flex; flex-wrap: wrap; gap: 4px; }
.${NS}-qeqslot {
  width: 30px; height: 30px; box-sizing: border-box; display: inline-flex;
  align-items: center; justify-content: center; overflow: hidden;
  background: #0a1428; border: 1px solid #463714; border-radius: 2px;
  color: #5b5a56; font-size: 10px;
}
.${NS}-qeqslot img { width: 100%; height: 100%; display: block; }
.${NS}-qaugrow { display: inline-flex; align-items: center; gap: 6px; margin: 2px 12px 2px 0; }
.${NS}-qaugname { color: #f0e6d2; font-size: 12px; font-weight: 600; }
.${NS}-qauglv { color: #a09b8c; font-size: 10.5px; font-style: normal; }
.${NS}-qsides { display: flex; gap: 10px; flex-wrap: wrap; }
.${NS}-qside { flex: 1 1 220px; min-width: 200px; display: flex; flex-direction: column; gap: 3px; }
.${NS}-qsideth { color: #a09b8c; font-size: 11px; letter-spacing: .05em; padding-bottom: 2px; }
.${NS}-qplrow {
  display: flex; align-items: center; gap: 8px; padding: 3px 6px;
  background: #0a1428; border-left: 2px solid #1e2328; font-size: 11.5px;
}
.${NS}-qplrow.me { border-left-color: #c8aa6e; }
.${NS}-qplname {
  flex: 1 1 auto; color: #f0e6d2; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${NS}-qplwho {
  flex: 0 1 auto; color: #5b5a56; font-size: 11px; max-width: 110px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${NS}-qplkda { flex: 0 0 auto; color: #a09b8c; }
.${NS}-qplnum { flex: 0 0 62px; text-align: right; color: #8a8a8a; }

.${NS}-mates-host {
  background: #010a13 !important; padding: 0 !important;
  overflow: hidden !important;      
}
.${NS}-mates-host > *:not(.${NS}-mates-list) { display: none !important; }
.${NS}-mates-list {
  display: flex; flex-direction: column; box-sizing: border-box;
  width: 100%; min-height: 0; max-height: 100%;
  background: #010a13; color: #a09b8c;
  font-size: 12px; line-height: 16px; letter-spacing: .025em;
  -webkit-font-smoothing: subpixel-antialiased;
}
.${NS}-mates-hd {
  display: flex; align-items: baseline; gap: 8px; padding: 8px 0 6px 1rem;
  border-bottom: 1px solid #1e2328; flex: 0 0 auto;
}
.${NS}-mates-title { color: #f0e6d2; font-size: 13px; font-weight: 700; letter-spacing: .05em; }
.${NS}-mates-sub { color: #5b5a56; font-size: 11px; }
.${NS}-mates-range { margin-left: auto; cursor: pointer; color: #c8aa6e; font-size: 11px; letter-spacing: .025em; }
.${NS}-mates-range:hover { color: #f0e6d2; }
.${NS}-mates-rows {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px 0;
  overscroll-behavior: contain;     
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.${NS}-mates-rows::-webkit-scrollbar { width: 0; height: 0; display: none; }
.${NS}-mates-rows .lol-social-roster-member { flex: 0 0 auto; }
.${NS}-mates-rows .icon-image { background-image: none !important; }
.${NS}-mates-host .no-friends { background-image: none !important; }
.${NS}-mates-rows .lol-social-avatar { background-image: none !important; }
.${NS}-mates-rows .icon-ring { background-image: none !important; }
.${NS}-mates-rows .availability-icon { background-image: none !important; }
.${NS}-mates-rows .member-name,
.${NS}-mates-rows .status-message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${NS}-mates-empty { color: #5b5a56; padding: 14px 1rem; text-align: center; }
.${NS}-mates-range-btn {
  display: flex !important; align-items: center !important; justify-content: center !important;
  background: none !important; background-color: transparent !important;
  -webkit-mask: none !important; mask: none !important;
  color: rgb(200, 170, 110);
  font-size: 11px; font-weight: 700; letter-spacing: .025em;
  cursor: pointer; user-select: none;
}
.${NS}-mates-range-btn:hover { color: rgb(240, 230, 210); }
.${NS}-mates-ft { flex: 0 0 auto; padding: 6px 1rem 9px; border-top: 1px solid #1e2328; }
.${NS}-mates-btn {
  display: block; width: 100%; box-sizing: border-box; padding: 5px 0; cursor: pointer;
  background: #1e2328; border: 1px solid #463714; border-radius: 2px;
  color: #cdbe91; font-size: 11px; letter-spacing: .05em;
}
.${NS}-mates-btn:hover { background: #0a1428; color: #f0e6d2; }
.${NS}-mates-bk { cursor: pointer; color: #c8aa6e; font-size: 11px; }
.${NS}-mates-g {
  display: flex; align-items: center; gap: 10px; height: 28px;
  padding: 0 0 0 1rem; border-left: 2px solid #5b5a56;
}
.${NS}-mates-g.w { border-left-color: #0ac8b9; }
.${NS}-mates-g.l { border-left-color: #d94c4c; }
.${NS}-mates-gc { color: #f0e6d2; min-width: 34px; }
.${NS}-mates-gk { color: #a09b8c; flex: 1 1 auto; }
.${NS}-mates-gr { font-size: 11px; }
.${NS}-mates-g.w .${NS}-mates-gr { color: #0ac8b9; }
.${NS}-mates-g.l .${NS}-mates-gr { color: #d94c4c; }
`;

  function injectCSS() {
    const old = document.getElementById(`${NS}-style`);
    if (old) old.remove();
    const s = document.createElement("style");
    s.id = `${NS}-style`;
    s.textContent = CSS;
    document.head.appendChild(s);
  }


  function cssEscape(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ");
  }

  function cleanAmount(v) {
    return String(v == null ? "" : v).replace(/[^0-9]/g, "").slice(0, CURRENCY_MAXLEN);
  }

  function parseAmount(v) {
    const d = cleanAmount(v);
    if (!d) return null;
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  }


  const fmtCache = {};
  let lastLocale = null;

  const COMPACT_LOCALE = "en-US";

  function getClientLocale() {
    try {
      const rl = window.RIOT && window.RIOT.CONSTANTS && window.RIOT.CONSTANTS.regionLocale;
      if (rl && rl.locale) return String(rl.locale).toLowerCase().replace("_", "-");
    } catch (e) {  }
    return String(navigator.language || "en-US").toLowerCase().replace("_", "-");
  }

  function fmtOf(loc, opts, tag) {
    const key = tag + "|" + loc;
    if (fmtCache[key] !== undefined) return fmtCache[key];
    let f = null;
    try { f = new Intl.NumberFormat(loc, opts); }
    catch (e) {
      try { f = new Intl.NumberFormat("en-US", opts); } catch (e2) { f = null; }
    }
    fmtCache[key] = f;
    return f;
  }

  function compactAmount(n) {
    if (!Number.isFinite(n)) return "";
    const f = fmtOf(COMPACT_LOCALE, {
      notation: "compact",
      minimumFractionDigits: 1, maximumFractionDigits: 1,
      maximumSignificantDigits: 3,
      roundingMode: "floor",
      numberingSystem: "latn",
    }, "c");
    if (!f) return String(n);
    const seg =
      n < 1e4 ? null :
      n < 1e5 ? 2 : n < 1e6 ? 3 : n < 1e8 ? 5 :
      n < 1e9 ? 6 : n < 1e11 ? 8 : n < 1e12 ? 9 :
      n < 1e14 ? 11 : n < 1e15 ? 12 : null;
    try {
      if (seg === null) return String(n);
      const cut = Math.floor(n / Math.pow(10, seg)) * Math.pow(10, seg);
      return f.format(cut);
    } catch (e) { return String(n); }
  }

  function fullAmount(n) {
    if (!Number.isFinite(n)) return "";
    const f = fmtOf(getClientLocale(), { numberingSystem: "latn" }, "f");
    if (!f) return String(n);
    try { return f.format(n); } catch (e) { return String(n); }
  }


  function buildCurrencyCSS() {
    const out = [];
    const rpN = parseAmount(state.currency.rp);
    const beN = parseAmount(state.currency.be);
    if (rpN != null) {
      const shown = cssEscape(compactAmount(rpN));
      out.push(`.currency-rp,.currency-rp-top-up-enabled{font-size:0 !important;}`);
      out.push(`.currency-rp::after,.currency-rp-top-up-enabled::after{content:"${shown}";font-size:14px;font-weight:700;letter-spacing:.075em;}`);
    }
    if (beN != null) {
      const shown = cssEscape(compactAmount(beN));
      out.push(`.currency-be-text{font-size:0 !important;}`);
      out.push(`.currency-be-text::after{content:"${shown}";font-size:14px;font-weight:700;}`);
    }
    return out.join("\n");
  }

  function applyCurrencyCSS() {
    let el = document.getElementById(`${NS}-currency`);
    const css = buildCurrencyCSS();
    if (!css) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("style");
      el.id = `${NS}-currency`;
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    el.textContent = css;
    scheduleFixTooltip();
  }


  let levelFsCache = null;   
  let xpFsCache = null;      

  function readRealLevel() {
    const el = document.querySelector(".summoner-level") ||
               document.querySelector(".summoner-xp-radial-numbers");
    if (!el) return "—";
    return (el.textContent || "").trim() || "0";
  }

  function measureFontSize(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const st = document.getElementById(`${NS}-level`);
    const had = !!st;
    if (had) st.remove();
    let fs = null;
    try { fs = getComputedStyle(el).fontSize || null; } catch (e) {  }
    if (had) document.head.appendChild(st);
    return fs;
  }

  function applyLevelCSS() {
    let el = document.getElementById(`${NS}-level`);
    const v = String(forgeLevel() || "").replace(/[^0-9]/g, "").slice(0, 4);
    if (!v) { if (el) el.remove(); return; }
    if (!levelFsCache) levelFsCache = measureFontSize(".summoner-level");
    if (!xpFsCache) xpFsCache = measureFontSize(".summoner-xp-radial-numbers");
    const fs1 = levelFsCache || "11px";   
    const fs2 = xpFsCache || "12px";
    const css =
      `.summoner-level{font-size:0 !important;}\n` +
      `.summoner-level::after{content:"${cssEscape(v)}";` +
      `position:absolute;left:0;top:0;right:0;bottom:0;` +
      `display:flex;align-items:center;justify-content:center;` +
      `line-height:1;font-size:${cssEscape(fs1)};letter-spacing:.075em;}\n` +
      `.summoner-xp-radial-numbers{position:relative !important;font-size:0 !important;}\n` +
      `.summoner-xp-radial-numbers::after{content:"${cssEscape(v)}";` +
      `position:absolute;left:0;top:0;right:0;bottom:0;` +
      `display:flex;align-items:center;justify-content:center;` +
      `line-height:1;font-size:${cssEscape(fs2)};letter-spacing:.075em;}`;
    if (!el) {
      el = document.createElement("style");
      el.id = `${NS}-level`;
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function saveSettings() {
    const s = JSON.stringify({ currency: state.currency, level: state.level });
    try { if (window.DataStore) window.DataStore.set(SETTINGS_KEY, s); } catch (e) {}
    try { localStorage.setItem(SETTINGS_KEY, s); } catch (e) {}
  }


  const REGALIA_KEY = SETTINGS_KEY + ".regalia";
  const HONOR_KEY = SETTINGS_KEY + ".honor";
  const PREF_URL = "/lol-challenges/v1/update-player-preferences";
  const SUMM_URL = "/lol-challenges/v1/summary-player-data/local-player";
  const REGALIA_URL = "/lol-regalia/v2/current-summoner/regalia";
  const BANNER_NONE = "1";
  const CREST_PRESTIGE = "1";
  const PRESTIGE_LEVELS = [1, 30, 50, 75, 100, 125, 150, 175, 200, 225,
                           250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 500];
  const CREST_MAX = 5;   

  function lcuFetch(path, opts) {
    return fetch(path, Object.assign({ cache: "no-store" }, opts || {}));
  }
  async function lcuJson(path) {
    const r = await lcuFetch(path);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function lcuSend(method, path, body) {
    const r = await lcuFetch(path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      let detail = "";
      try { detail = (await r.text()).slice(0, 160); } catch (e) {  }
      const err = new Error("HTTP " + r.status + (detail ? " · " + detail : ""));
      err.status = r.status;
      throw err;
    }
    return r;
  }

  function readChallengeSummary() {
    return lcuJson(SUMM_URL);
  }

  async function writePreferences(patch) {
    const s = (await readChallengeSummary()) || {};
    const ids = ((s.topChallenges) || []).map((c) => (c && c.id)).filter((x) => x != null);
    while (ids.length < 3) ids.push(-1);
    const ti = s.title && s.title.itemId;
    const pick = patch || {};
    const body = {
      challengeIds: ids.slice(0, 3),
      title: String(ti == null || ti < 0 ? -1 : ti),
      bannerAccent: String(pick.bannerId != null ? pick.bannerId : (s.bannerId || BANNER_NONE)),
      crestBorder: String(pick.crestId != null ? pick.crestId : (s.crestId || CREST_PRESTIGE)),
      prestigeCrestBorderLevel: pick.borderLevel != null
        ? pick.borderLevel : (s.prestigeCrestBorderLevel || 0),
    };
    await lcuSend("POST", PREF_URL, body);
    return body;
  }

  function readRegalia() {
    return lcuJson(REGALIA_URL);
  }
  async function writeRegalia(patch) {
    const cur = (await readRegalia()) || {};
    const p = patch || {};
    const body = {
      preferredCrestType: p.crestType || cur.crestType || "prestige",
      preferredBannerType: p.bannerType || cur.preferredBannerType || "blank",
      selectedPrestigeCrest: p.crest != null ? p.crest : cur.selectedPrestigeCrest,
    };
    await lcuSend("PUT", REGALIA_URL, body);
    return body;
  }


  const CLASH_GD = "/lol-game-data/assets/v1/summoner-banners.json";
  const CLASH_KEY = SETTINGS_KEY + ".clashflag";

  const CLASH_THEMES = {
    bandle_city: "班德尔城", base: "基础", bilgewater: "比尔吉沃特",
    copilot: "海克斯科技", conqueror: "征服者杯", demacia: "德玛西亚",
    eos2020: "冠军杯赛2020赛季", eos2021: "冠军杯赛 2021 赛季",
    eos2022: "冠军杯赛2022赛季", eos2023: "冠军杯赛2023赛季",
    eos2024: "冠军杯赛赛季", fst_2026: "First Stand 2026",
    freljord: "弗雷尔卓德", ionia: "艾欧尼亚", ixtal: "以绪塔尔",
    msi2021: "季中冠军赛", msi2022: "季中冠军赛", msi2023: "季中冠军赛",
    msi2024: "季中冠军赛", msi2025: "季中冠军赛", msi2026: "季中冠军赛",
    mount_targon: "巨神峰", noxus: "诺克萨斯", pilot: "Beta",
    piltover: "皮尔特沃夫", preseason2022: "熔铸之神",
    shadow_isles: "暗影岛", shurima: "恕瑞玛", void: "虚空",
    worlds2020: "全球总决赛", worlds2021: "全球总决赛", worlds2022: "全球总决赛",
    worlds2023: "全球总决赛", worlds2024: "全球总决赛", worlds2025: "全球总决赛",
    zaun: "祖安",
  };
  const CLASH_LV = { 1: "等级I", 2: "等级II", 3: "等级III", 4: "等级IV" };
  const CLASH_LV_EOS = { 1: "竞争者", 2: "征服者", 3: "冠军" };
  const CLASH_EOS = ["EOS2020", "EOS2021", "EOS2022", "EOS2023"];

  function clashThemeName(theme) {
    return CLASH_THEMES[String(theme).toLowerCase()] || String(theme);
  }
  function clashLevelName(level, theme) {
    const lv = parseInt(level, 10);
    if (CLASH_EOS.indexOf(String(theme)) >= 0 && CLASH_LV_EOS[lv]) return CLASH_LV_EOS[lv];
    return CLASH_LV[lv] || ("等级" + lv);
  }
  function clashFindFrame(level) {
    const d = state.clash.data;
    const list = (d && d.BannerFrames) || [];
    for (let i = 0; i < list.length; i++) {
      if (parseInt(list[i].level, 10) === parseInt(level, 10)) return list[i];
    }
    return list[0] || null;
  }
  function clashFindFlag(theme, level) {
    const d = state.clash.data;
    const list = (d && d.BannerFlags) || [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (String(f.theme).toLowerCase() === String(theme).toLowerCase() &&
          parseInt(f.level, 10) === parseInt(level, 10)) return f;
    }
    return null;
  }
  function clashAll() {
    const d = state.clash.data;
    const list = ((d && d.BannerFlags) || []).slice();
    list.sort((a, b) => {
      const ta = clashThemeName(a.theme), tb = clashThemeName(b.theme);
      if (ta !== tb) return ta.localeCompare(tb, "zh-Hans-CN");
      return parseInt(a.level, 10) - parseInt(b.level, 10);
    });
    return list;
  }

  async function loadClashBanners() {
    state.clash.err = "";
    if (!state.clash.data) {
      try {
        const r = await lcuFetch(CLASH_GD);
        if (!r.ok) throw new Error("HTTP " + r.status);
        state.clash.data = await r.json();
      } catch (e) {
        state.clash.err = String(e.message || e);
        diag("clash-banners-error", { msg: String(e) });
        return null;
      }
    }
    state.clash.loaded = true;
    const d = state.clash.data || {};
    diag("clash-banners-loaded", {
      flags: ((d.BannerFlags) || []).length,
      frames: ((d.BannerFrames) || []).length,
      themes: Object.keys(CLASH_THEMES).length,
    });
    try {
      const own = await lcuJson("/lol-banners/v1/current-summoner/flags");
      diag("clash-own-flags", { count: (own || []).length });
    } catch (e) { diag("clash-own-flags-error", { msg: String(e) }); }
    return state.clash.data;
  }

  function clashThumb(path, w) {
    if (!path) return "";
    return API + "/api/lcuimg?w=" + (w || 130) + "&p=" + encodeURIComponent(String(path));
  }

  function buildClashCSS() {
    const p = state.clash.pick;
    if (!p || !state.clash.data) return "";
    const flag = clashFindFlag(p.theme, p.level);
    if (!flag || !flag.inventoryIcon) return "";
    const frame = clashFindFrame(1);
    const fu = flag.inventoryIcon;
    const ru = frame && frame.inventoryIcon ? frame.inventoryIcon : "";
    const bg = ru ? `url("${cssEscape(ru)}"), url("${cssEscape(fu)}")` : `url("${cssEscape(fu)}")`;
    const sz = ru ? "90px auto, 60px auto" : "60px auto";
    const ps = ru ? "center 13px, center 30px" : "center 30px";
    const rp = ru ? "no-repeat, no-repeat" : "no-repeat";
    const label = clashThemeName(p.theme) + " · " + clashLevelName(p.level, p.theme);
    return `
html.${NS}-cflag .style-profile-clash-banner-component .style-profile-clash-banner-empty {
  background-image: ${bg} !important;
  background-size: ${sz} !important;
  background-position: ${ps} !important;
  background-repeat: ${rp} !important;
}
html.${NS}-cflag .style-profile-clash-banner-component .style-profile-emblem-header::after {
  content: "${cssEscape(label)}";
  display: block; color: #a09b8c; font-family: var(--font-display);
  font-size: 12px; font-weight: 700; line-height: 16px; letter-spacing: .075em;
  text-transform: uppercase; margin-top: 0;
}`;
  }

  function applyClashCSS() {
    const css = buildClashCSS();
    const root = document.documentElement;
    if (!css) {
      if (root) root.classList.remove(NS + "-cflag");
      const old = document.getElementById(NS + "-clashflag");
      if (old) old.remove();
      return;
    }
    let el = document.getElementById(NS + "-clashflag");
    if (!el) {
      el = document.createElement("style");
      el.id = NS + "-clashflag";
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    el.textContent = css;
    if (root) root.classList.add(NS + "-cflag");
  }

  function saveClashPick() {
    const t = JSON.stringify({ pick: state.clash.pick });
    try { if (window.DataStore) window.DataStore.set(CLASH_KEY, t); } catch (e) {  }
    try { localStorage.setItem(CLASH_KEY, t); } catch (e) {  }
  }

  function loadClashPick() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(CLASH_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(CLASH_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (o && o.pick && o.pick.theme) {
        state.clash.pick = { theme: String(o.pick.theme), level: parseInt(o.pick.level, 10) || 1 };
      }
    } catch (e) {  }
  }

  const CBAN_KEY = SETTINGS_KEY + ".custombanner";
  const CBAN_URL = "/lol-regalia/v3/inventory/REGALIA_BANNER";
  const CBAN_TAGS = ["lol-regalia-identity-customizer-element",
                     "lol-regalia-banner-v2-element",
                     "lol-regalia-parties-v2-element"];
  const CBAN_SEL = CBAN_TAGS.join(",");
  const CBAN_ATTRS = ["banner-id", "banner-type", "banner-rank",
                      "summoner-id", "puuid", "member-type"];
  const CBAN_OWN = ["banner-id", "banner-type", "banner-rank"];
  const CBAN_TIERS = {
    IRON: "坚韧黑铁", BRONZE: "英勇青铜", SILVER: "不屈白银", GOLD: "荣耀黄金",
    PLATINUM: "华贵铂金", EMERALD: "流光翡翠", DIAMOND: "璀璨钻石",
    MASTER: "超凡大师", GRANDMASTER: "傲世宗师", CHALLENGER: "最强王者",
  };
  const CBAN_TIER_EXTRA = { UNRANKED: "无排名" };

  let cbanEnabled = false;    
  let cbanOrig = null;        
  let cbanPending = null;     
  let cbanSetAttr = null;     
  let cbanDelAttr = null;     
  let cbanHijacked = false;   
  let cbanMeReq = null;       
  let cbanMe = { id: "", puuid: "" };
  let cbanProbeAt = 0;        

  function cbanTagHit(el) {
    if (!el || el.nodeType !== 1) return false;
    return CBAN_TAGS.indexOf(String(el.tagName || "").toLowerCase()) >= 0;
  }

  function cbanNorm(s) {
    return String(s == null ? "" : s).replace(/[\s_-]+/g, "").toUpperCase();
  }

  function cbanRankOf(it) {
    if (!it || String(it.id) !== "2") return "";
    const pool = [it.idSecondary, it.localizedName,
                  String(it.assetPath || "").split("/").pop() || ""];
    const keys = Object.keys(CBAN_TIERS).sort((a, b) => b.length - a.length);
    for (let i = 0; i < pool.length; i++) {
      const n = cbanNorm(pool[i]);
      if (!n) continue;
      for (let j = 0; j < keys.length; j++) {
        if (n.indexOf(keys[j]) >= 0) return keys[j];
      }
    }
    return "";
  }

  function cbanNameOf(it) {
    const rank = cbanRankOf(it);
    if (rank) return CBAN_TIERS[rank] + " 旗帜";
    const sec = cbanNorm(it.idSecondary);
    if (sec && CBAN_TIER_EXTRA[sec]) return CBAN_TIER_EXTRA[sec] + " 旗帜";
    const ln = String(it.localizedName || "").trim();
    if (ln) return ln;
    const base = String(it.assetPath || "").split("/").pop() || "";
    const stem = base.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (stem) return stem.replace(/\b\w/g, (c) => c.toUpperCase());
    return "旗帜 " + String(it.id);
  }

  function cbanFlatten(raw) {
    const groups = Array.isArray(raw) ? raw
      : (raw && typeof raw === "object" ? Object.keys(raw).map((k) => raw[k]) : []);
    const out = [];
    groups.forEach((g, gi) => {
      if (!g || typeof g !== "object" || !Array.isArray(g.items)) return;
      g.items.forEach((it) => {
        if (!it || !it.assetPath) return;
        const id = String(it.id);
        const rank = cbanRankOf(it);
        out.push({
          id: id,
          idSecondary: String(it.idSecondary || ""),
          name: cbanNameOf(it),
          assetPath: String(it.assetPath),
          bannerRank: rank,
          key: id + ":" + rank,
          isOwned: !!g.isOwned,
          groupIndex: gi,
        });
      });
    });
    out.sort((a, b) => (Number(b.id) - Number(a.id)) || a.name.localeCompare(b.name));
    return out;
  }

  async function cbanLoadList(force) {
    if (state.cban.list && !force) return state.cban.list;
    try {
      state.cban.list = cbanFlatten(await lcuJson(CBAN_URL));
      state.cban.err = "";
      diag("cban-list-loaded", { count: state.cban.list.length });
    } catch (e) {
      state.cban.err = String((e && e.message) || e);
      state.cban.list = null;
      diag("cban-list-error", { msg: state.cban.err });
    }
    return state.cban.list;
  }

  function cbanPick() {
    const fg = forgeData();
    if (fg && fg.bannerId != null && String(fg.bannerId) !== "") {
      return { id: String(fg.bannerId), name: "", assetPath: "",
               bannerRank: "", bannerType: "blank",
               key: "forge:" + String(fg.bannerId) };
    }
    const p = state.cban.pick;
    if (!p || !p.id || !p.assetPath) return null;
    const rank = String(p.bannerRank || "");
    return {
      id: String(p.id),
      name: String(p.name || ""),
      assetPath: String(p.assetPath),
      bannerRank: rank,
      bannerType: "blank",          
      key: String(p.key || (String(p.id) + ":" + rank)),
    };
  }

  function saveCbanPick() {
    writeStored(CBAN_KEY, JSON.stringify({ pick: state.cban.pick }));
  }

  function loadCbanPick() {
    const raw = readStored(CBAN_KEY);
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      const p = o && o.pick;
      if (p && p.id && p.assetPath) {
        const rank = String(p.bannerRank || "");
        state.cban.pick = {
          id: String(p.id),
          name: String(p.name || ""),
          assetPath: String(p.assetPath),
          bannerRank: rank,
          key: String(p.key || (String(p.id) + ":" + rank)),
        };
      }
    } catch (e) {  }
  }

  function cbanLoadMe() {
    if (cbanMeReq) return cbanMeReq;
    cbanMeReq = lcuJson("/lol-summoner/v1/current-summoner").then((s) => {
      cbanMe = {
        id: String((s && s.summonerId) || ""),
        puuid: String((s && s.puuid) || "").toLowerCase(),
      };
      diag("cban-me", { hasId: !!cbanMe.id, hasPuuid: !!cbanMe.puuid });
      return cbanMe;
    }).catch((e) => {
      cbanMeReq = null;
      diag("cban-me-error", { msg: String(e) });
      return cbanMe;
    });
    return cbanMeReq;
  }

  function cbanHostOf(el) {
    let r = null;
    try { r = el.getRootNode ? el.getRootNode() : null; } catch (e) { r = null; }
    return (r && r.host) ? r.host : el;
  }

  function cbanInPickerDisplay(el) {
    let node = el && el.parentNode, inPage = false, inGrid = false, hop = 0;
    while (node && hop < 16) {
      try {
        const cl = String(node.className || "");
        if (cl.indexOf("identity-customizer-grid") >= 0) inGrid = true;
        if (cl.indexOf("identity-customizer") >= 0) inPage = true;
      } catch (e) {  }
      node = node.parentNode;
      if (node && node.nodeType === 11) node = node.host;   
      if (!node || node === document) break;
      hop++;
    }
    return inPage && !inGrid;
  }

  function cbanIsMine(el) {
    if (!cbanTagHit(el)) return false;
    if (cbanInPickerDisplay(el)) return true;         
    const h = cbanHostOf(el);
    const mt = h.getAttribute("member-type");
    if (mt) return mt === "current-player";          
    const hp = h.getAttribute("puuid");
    const hi = h.getAttribute("summoner-id");
    const ep = (h !== el) ? el.getAttribute("puuid") : null;
    const ei = (h !== el) ? el.getAttribute("summoner-id") : null;
    if (cbanMe.puuid && hp && String(hp).toLowerCase() !== cbanMe.puuid) return false;
    if (cbanMe.puuid && ep && String(ep).toLowerCase() !== cbanMe.puuid) return false;
    if (cbanMe.id && hi && String(hi) !== cbanMe.id) return false;
    if (cbanMe.id && ei && String(ei) !== cbanMe.id) return false;
    const posHost = !!(hp || hi);
    const posEl = !!(ep || ei);
    return posHost || posEl;
  }

  function cbanSnap(el) {
    if (cbanOrig.has(el)) return;
    const o = {};
    CBAN_OWN.forEach((k) => { o[k] = el.getAttribute(k); });
    cbanOrig.set(el, o);
  }

  function cbanSnapTouch(el, attr, val) {
    const o = cbanOrig.get(el);
    if (!o) return;
    o[attr] = (val == null) ? null : String(val);
  }

  function cbanRestoreAttr(el, k) {
    const o = cbanOrig.get(el);
    const v = o ? o[k] : null;
    try {
      if (v == null) cbanDelAttr.call(el, k);
      else cbanSetAttr.call(el, k, v);
    } catch (e) {  }
  }

  function cbanRestoreEl(el) {
    if (!cbanOrig.has(el)) return;
    CBAN_OWN.forEach((k) => cbanRestoreAttr(el, k));
    cbanOrig.delete(el);
  }

  function cbanRestoreAll() {
    cbanEnabled = false;
    const els = [];
    cbanOrig.forEach((o, el) => { els.push(el); });
    els.forEach((el) => cbanRestoreEl(el));
    cbanOrig.clear();
    cbanPending = new WeakSet();
  }

  async function cbanApplyEl(el, sel) {
    if (!sel) return;
    await cbanLoadMe();
    if (!cbanEnabled && !forgeData()) return;  
    if (!cbanIsMine(el)) { cbanRestoreEl(el); return; }
    cbanSnap(el);
    const w = (k, v) => { try { cbanSetAttr.call(el, k, v); } catch (e) {  } };
    w("banner-id", sel.id);
    w("banner-type", sel.bannerType || "blank");
    if (sel.bannerRank) w("banner-rank", sel.bannerRank);
    else cbanRestoreAttr(el, "banner-rank");   
  }

  function cbanFindAll() {
    const out = [];
    const push = (el) => { if (el && out.indexOf(el) < 0) out.push(el); };
    const scan = (root) => {
      let list = null;
      try { list = root.querySelectorAll(CBAN_SEL); } catch (e) { return; }
      Array.prototype.forEach.call(list, push);
      let all = null;
      try { all = root.querySelectorAll("*"); } catch (e) { return; }
      Array.prototype.forEach.call(all, (el2) => { if (el2.shadowRoot) scan(el2.shadowRoot); });
    };
    scan(document);
    return out;
  }

  async function cbanSweep() {
    const sel = cbanPick();
    if (!sel || !cbanSetAttr) return;
    const els = cbanFindAll();
    await Promise.all(els.map((el) => cbanApplyEl(el, sel)));
    return els.length;
  }

  function cbanTouch(el) {
    if ((!cbanEnabled && !forgeData()) || !cbanTagHit(el)) return;
    if (cbanPending.has(el)) return;           
    cbanPending.add(el);
    queueMicrotask(() => {
      cbanPending.delete(el);
      const sel = cbanPick();
      if (sel) cbanApplyEl(el, sel);
    });
  }

  function cbanInstallHijack() {
    if (cbanHijacked) return;
    cbanHijacked = true;
    cbanSetAttr = Element.prototype.setAttribute;
    cbanDelAttr = Element.prototype.removeAttribute;
    cbanOrig = new Map();
    cbanPending = new WeakSet();
    Element.prototype.setAttribute = function (n, v) {
      cbanSetAttr.call(this, n, v);
      const l = String(n).toLowerCase();
      if (CBAN_ATTRS.indexOf(l) < 0 || !cbanTagHit(this)) return;
      if (CBAN_OWN.indexOf(l) >= 0) cbanSnapTouch(this, l, v);
      cbanTouch(this);
    };
    Element.prototype.removeAttribute = function (n) {
      cbanDelAttr.call(this, n);
      const l = String(n).toLowerCase();
      if (CBAN_ATTRS.indexOf(l) < 0 || !cbanTagHit(this)) return;
      if (CBAN_OWN.indexOf(l) >= 0) cbanSnapTouch(this, l, null);
      cbanTouch(this);
    };
    diag("cban-hijack-installed", {});
  }

  async function cbanEnable(sel) {
    if (!sel) return;
    cbanInstallHijack();
    cbanEnabled = true;
    await cbanLoadMe();
    const n = await cbanSweep();
    diag("cban-enabled", { id: sel.id, rank: sel.bannerRank || "", els: n || 0 });
  }

  function cbanDisable() {
    if (!cbanOrig) { cbanEnabled = false; return; }
    cbanRestoreAll();
    diag("cban-disabled", {});
  }

  function cbanThumb(path, w) { return clashThumb(path, w); }

  function probeCban(force) {
    const now = Date.now();
    if (!force && now - cbanProbeAt < 120000) return;   
    cbanProbeAt = now;
    try {
      const els = cbanFindAll();
      const sample = els.slice(0, 6).map((el) => {
        const h = cbanHostOf(el);
        return {
          tag: String(el.tagName || "").toLowerCase(),
          host: (h === el) ? null : String(h.tagName || "").toLowerCase(),
          bid: el.getAttribute("banner-id"),
          btype: el.getAttribute("banner-type"),
          brank: el.getAttribute("banner-rank"),
          memberType: h.getAttribute("member-type"),
          hasId: !!h.getAttribute("summoner-id"),
          hasPuuid: !!h.getAttribute("puuid"),
          mine: cbanIsMine(el),
          overridden: cbanOrig ? cbanOrig.has(el) : false,
        };
      });
      diag("cban-probe", {
        count: els.length, enabled: cbanEnabled,
        picked: (cbanPick() || {}).id || null, sample: sample,
      });
    } catch (e) { diag("cban-probe-error", { msg: String(e) }); }
  }


  const PBG_KEY = SETTINGS_KEY + ".customprofilebg";
  const PBG_PROF = "/lol-summoner/v1/current-summoner/summoner-profile";
  const PBG_SUMM = "/lol-summoner/v1/current-summoner";
  const PBG_CHAMPS = "/lol-game-data/assets/v1/champion-summary.json";
  const PBG_BTN = ".style-profile-skin-picker-button";
  const PBG_MARK = "data-prism-profile-bg";   
  const PBG_BATCH = 60;                       

  let pbgArmed = false;    
  let pbgObs = null;       
  let pbgBtn = null;       
  let pbgHandler = null;   
  let pbgRoot = null;      
  let pbgShown = 0;        
  let pbgMe = { id: "" };  
  let pbgProbeAt = 0;      

  function pbgOn() { return state.pbg.on === true; }

  function savePbg() {
    writeStored(PBG_KEY, JSON.stringify({ on: state.pbg.on }));
  }
  function loadPbg() {
    const raw = readStored(PBG_KEY);
    if (!raw) return;
    try { state.pbg.on = !!(JSON.parse(raw) || {}).on; } catch (e) {  }
  }

  function pbgTile(sk) {
    if (!sk) return "";
    return String(sk.tilePath || sk.uncenteredSplashPath || sk.splashPath || "");
  }

  function pbgTierName(base, tier) {
    const bn = String((base && base.name) || "");
    if (!tier) return bn;
    if (tier.name) return String(tier.name);
    if (tier.stage != null) return bn + " 阶段 " + tier.stage;
    return bn;
  }

  function pbgPush(map, sk, champId, champName) {
    if (!sk || !sk.id || map.has(sk.id)) return;
    const tile = pbgTile(sk);
    if (!tile) return;
    map.set(sk.id, {
      id: String(sk.id),
      name: String(sk.name || ""),
      championId: champId,
      champName: String(champName || ""),
      tilePath: tile,
    });
  }

  function pbgPushChamp(map, champ, champName) {
    const cid = Number(champ && champ.id);
    if (!Number.isFinite(cid) || cid <= 0) return;
    const cn = String(champName || (champ && champ.name) || ("英雄 " + cid));
    const skins = (champ && champ.skins) || [];
    skins.forEach(function (f) {
      pbgPush(map, f, cid, cn);
      const tiers = (f && f.questSkinInfo && f.questSkinInfo.tiers) || [];
      tiers.forEach(function (g) {
        const merged = Object.assign({}, g, { name: pbgTierName(f, g) });
        if (!pbgTile(merged)) merged.tilePath = pbgTile(f);
        pbgPush(map, merged, cid, cn);
      });
    });
  }

  function pbgFlatten(champs, nameOf) {
    const map = new Map();
    (champs || []).forEach(function (c) {
      const nm = nameOf ? nameOf(c && c.id) : "";
      pbgPushChamp(map, c, nm || (c && c.name));
    });
    const out = Array.from(map.values());
    out.sort(function (a, b) {
      const d = String(a.champName).localeCompare(String(b.champName));
      if (d) return d;
      return Number(a.id) - Number(b.id);
    });
    return out;
  }

  function pbgHijack() {
    if (!pbgOn()) return false;
    let btn = null;
    try { btn = document.querySelector(PBG_BTN); } catch (e) { return false; }
    if (!btn) return false;
    if (btn === pbgBtn && btn.hasAttribute(PBG_MARK)) return true;   
    pbgRelease();                       
    pbgHandler = function (e) {
      try {
        e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault();
      } catch (err) {  }
      pbgOpen();
      diag("pbg-hijack-click", {});
    };
    try { btn.setAttribute(PBG_MARK, "1"); } catch (e) {  }
    btn.addEventListener("click", pbgHandler, true);   
    pbgBtn = btn;
    diag("pbg-hijacked", {});
    return true;
  }

  function pbgRelease() {
    if (pbgBtn && pbgHandler) {
      try { pbgBtn.removeEventListener("click", pbgHandler, true); } catch (e) {  }
    }
    if (pbgBtn) { try { pbgBtn.removeAttribute(PBG_MARK); } catch (e) {  } }
    pbgBtn = null; pbgHandler = null;
  }

  function pbgArm() {
    if (pbgArmed) return;
    pbgArmed = true;
    let ticking = false;
    pbgObs = new MutationObserver(function () {
      if (ticking || !pbgOn()) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        try { pbgHijack(); } catch (e) {  }
      });
    });
    try { pbgObs.observe(document.body, { childList: true, subtree: true }); } catch (e) {  }
    pbgHijack();
  }

  function pbgDisarm() {
    pbgArmed = false;
    if (pbgObs) { try { pbgObs.disconnect(); } catch (e) {  } }
    pbgObs = null;
    pbgRelease();
    pbgClose();
  }

  function pbgSetOn(on) {
    state.pbg.on = !!on;
    savePbg();
    if (state.pbg.on) pbgArm(); else pbgDisarm();
    diag("pbg-toggle", { on: state.pbg.on });
    return state.pbg.on;
  }

  async function pbgLoadMe() {
    if (pbgMe.id) return pbgMe;
    const s = await lcuJson(PBG_SUMM);
    pbgMe.id = String((s && s.summonerId) || "");
    return pbgMe;
  }

  async function pbgLoadCurrent() {
    try {
      const p = await lcuJson(PBG_PROF);
      state.pbg.cur = (p && p.backgroundSkinId != null) ? String(p.backgroundSkinId) : null;
    } catch (e) {  }
    return state.pbg.cur;
  }

  async function pbgLoadList(force) {
    if (state.pbg.list && !force) return state.pbg.list;
    state.pbg.err = "";
    try {
      const me = await pbgLoadMe();
      if (!me.id) throw new Error("拿不到 summonerId");
      const sum = await lcuJson(PBG_CHAMPS);
      const nameMap = new Map();
      (sum || []).forEach(function (c) {
        if (c && c.id != null) nameMap.set(String(c.id), String(c.name || ""));
      });
      const inv = await lcuJson("/lol-champions/v1/inventories/" + me.id + "/champions");
      state.pbg.list = pbgFlatten(inv, function (id) { return nameMap.get(String(id)) || ""; });
      diag("pbg-list", { n: state.pbg.list.length });
    } catch (e) {
      state.pbg.err = String((e && e.message) || e);
      diag("pbg-list-error", { msg: state.pbg.err });
    }
    return state.pbg.list || [];
  }

  async function pbgApply(skinId) {
    const v = Number(skinId);
    if (!Number.isFinite(v) || v <= 0) throw new Error("皮肤 id 非法：" + skinId);
    await lcuSend("POST", PBG_PROF, { key: "backgroundSkinId", value: v });
    state.pbg.cur = String(v);
    diag("pbg-applied", { skinId: v });
    return true;
  }

  function pbgThumb(path, w) { return clashThumb(path, w); }

  function pbgClose() {
    if (!pbgRoot) return;
    try {
      if (pbgRoot.__pbgEsc) document.removeEventListener("keydown", pbgRoot.__pbgEsc, true);
    } catch (e) {  }
    try { pbgRoot.remove(); } catch (e) {  }
    pbgRoot = null;
    pbgShown = 0;
    state.pbg.kw = "";
  }

  function pbgRenderGrid(append) {
    if (!pbgRoot) return;
    const grid = pbgRoot.querySelector('[data-el="pbg-grid"]');
    const cnt = pbgRoot.querySelector('[data-el="pbg-count"]');
    if (!grid) return;
    if (state.pbg.err) {
      grid.innerHTML = `<div class="${NS}-pfbg-msg">读不到皮肤清单：${esc(state.pbg.err)}</div>`;
      if (cnt) cnt.textContent = "";
      return;
    }
    const kw = String(state.pbg.kw || "").trim().toLowerCase();
    const all = (state.pbg.list || []).filter(function (f) {
      if (!kw) return true;
      return f.name.toLowerCase().indexOf(kw) >= 0 ||
             f.champName.toLowerCase().indexOf(kw) >= 0;
    });
    if (cnt) cnt.textContent = all.length + " 款";
    if (!all.length) {
      grid.innerHTML = `<div class="${NS}-pfbg-msg">没有找到相关皮肤</div>`;
      pbgShown = 0;
      return;
    }
    if (!append) { grid.innerHTML = ""; pbgShown = 0; }
    const from = pbgShown;
    const to = Math.min(all.length, from + PBG_BATCH);
    const cur = state.pbg.cur;
    let html = "";
    for (let i = from; i < to; i++) {
      const f = all[i];
      html += `<button class="${NS}-pfcard${cur === f.id ? " on" : ""}" data-skin-id="${esc(f.id)}" title="${esc(f.champName + " · " + f.name)}"><img loading="lazy" draggable="false" src="${pbgThumb(f.tilePath, 110)}" data-local="${esc(f.tilePath)}" alt=""><em>${esc(f.name)}</em><s>${esc(f.champName)}</s></button>`;
    }
    const frag = document.createElement("div");
    frag.className = NS + "-pfbg-frag";
    frag.innerHTML = html;
    Array.prototype.forEach.call(frag.querySelectorAll("img"), function (im) {
      const alt = im.getAttribute("data-local") || "";
      im.addEventListener("error", function () {
        if (im.dataset.fellBack || !alt) return;
        im.dataset.fellBack = "1";
        im.src = alt;
      }, { once: true });
    });
    grid.appendChild(frag);
    pbgShown = to;
    const sent = grid.querySelector('[data-el="pbg-sent"]');
    if (sent) sent.remove();
    if (pbgShown < all.length) {
      const s = document.createElement("div");
      s.className = NS + "-pfbg-msg";
      s.setAttribute("data-el", "pbg-sent");
      s.textContent = "滚动加载更多…（已 " + pbgShown + " / " + all.length + "）";
      grid.appendChild(s);
    }
  }

  async function pbgPick(skinId, say) {
    if (state.pbg.busy) return;
    const hit = (state.pbg.list || []).filter(function (x) { return x.id === String(skinId); })[0];
    const label = hit ? (hit.champName + " · " + hit.name) : ("#" + skinId);
    state.pbg.busy = true;
    if (say) say("正在应用 " + label + " …");
    try {
      await pbgApply(skinId);
      if (say) say("✅ 已设为：" + label + "（已写入账号，好友可见）");
      if (pbgRoot) {
        Array.prototype.forEach.call(pbgRoot.querySelectorAll("[data-skin-id]"), function (c) {
          c.classList.toggle("on", c.getAttribute("data-skin-id") === String(skinId));
        });
      }
    } catch (e) {
      if (say) say("❌ 设置失败：" + String((e && e.message) || e));
      diag("pbg-apply-error", { msg: String(e) });
    } finally {
      state.pbg.busy = false;
    }
  }

  function pbgOpen() {
    if (pbgRoot) return;
    const root = document.createElement("div");
    root.className = NS + "-pfbg";
    root.setAttribute("data-el", "pbg-root");
    root.innerHTML =
      `<div class="${NS}-pfbg-panel">` +
        `<div class="${NS}-pfbg-head">` +
          `<span class="${NS}-pfbg-title">自定义生涯背景</span>` +
          `<input class="${NS}-pfbg-search" data-el="pbg-search" type="text" placeholder="搜索英雄或皮肤…" autocomplete="off">` +
          `<span class="${NS}-pfbg-count" data-el="pbg-count"></span>` +
          `<button class="${NS}-pfbg-x" data-act="pbg-close" title="关闭">×</button>` +
        `</div>` +
        `<div class="${NS}-pfbg-warn">⚠️ 点击皮肤即<b>写入账号</b>，好友可见（与原生「修改生涯背景」同一端点）。</div>` +
        `<div class="${NS}-pfbg-status" data-el="pbg-status"></div>` +
        `<div class="${NS}-pfbg-grid" data-el="pbg-grid"><div class="${NS}-pfbg-msg">正在读取皮肤清单…</div></div>` +
      `</div>`;
    document.body.appendChild(root);
    pbgRoot = root;
    const say = function (t) {
      const el = root.querySelector('[data-el="pbg-status"]');
      if (el) el.textContent = t || "";
    };

    root.addEventListener("click", function (e) {
      if (e.target === root) { pbgClose(); return; }
      const x = e.target.closest ? e.target.closest('[data-act="pbg-close"]') : null;
      if (x) pbgClose();
    });
    root.__pbgEsc = function (e) { if (e.key === "Escape") pbgClose(); };
    document.addEventListener("keydown", root.__pbgEsc, true);

    const searchEl = root.querySelector('[data-el="pbg-search"]');
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        state.pbg.kw = searchEl.value || "";
        pbgRenderGrid(false);
      });
    }
    const grid = root.querySelector('[data-el="pbg-grid"]');
    if (grid) {
      grid.addEventListener("scroll", function () {
        if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 120) pbgRenderGrid(true);
      });
      grid.addEventListener("click", function (e) {
        const card = e.target.closest ? e.target.closest("[data-skin-id]") : null;
        if (!card) return;
        pbgPick(card.getAttribute("data-skin-id"), say);
      });
    }

    (async () => {
      await pbgLoadCurrent();
      const list = await pbgLoadList();
      if (!pbgRoot) return;                       
      if (!list.length && !state.pbg.err) {
        const g = pbgRoot.querySelector('[data-el="pbg-grid"]');
        if (g) g.innerHTML = `<div class="${NS}-pfbg-msg">皮肤清单是空的</div>`;
        return;
      }
      pbgRenderGrid(false);
      say("共 " + list.length + " 款皮肤，点一下即设为生涯背景。");
    })().catch(function (e) {
      say("加载失败：" + String((e && e.message) || e));
      diag("pbg-open-error", { msg: String(e) });
    });
  }

  function probePbg(force) {
    const now = Date.now();
    if (!force && now - pbgProbeAt < 120000) return;
    pbgProbeAt = now;
    try {
      const btn = document.querySelector(PBG_BTN);
      diag("pbg-probe", {
        on: pbgOn(),
        armed: pbgArmed,
        btn: !!btn,
        marked: !!(btn && btn.hasAttribute(PBG_MARK)),
        open: !!pbgRoot,
        cur: state.pbg.cur,
        n: (state.pbg.list || []).length,
      });
    } catch (e) { diag("pbg-probe-error", { msg: String(e) }); }
  }


  const TROPHY_GD = "/lol-game-data/assets/v1/summoner-trophies.json";
  const TROPHY_KEY = SETTINGS_KEY + ".trophy";

  const TROPHY_THEMES = {
    bandle_city: "班德尔城", base: "基础", bilgewater: "比尔吉沃特",
    copilot: "海克斯科技", conqueror: "征服者杯", demacia: "德玛西亚",
    freljord: "弗雷尔卓德", ionia: "艾欧尼亚", ixtal: "以绪塔尔",
    mount_targon: "巨神峰", noxus: "诺克萨斯", piltover: "皮尔特沃夫",
    preseason2022: "熔铸之神", shadow_isles: "暗影岛", shurima: "恕瑞玛",
    void: "虚空", zaun: "祖安",
    msi2021: "季中冠军赛 2021", msi2022: "季中冠军赛 2022",
    msi2023: "季中冠军赛 2023", msi2024: "季中冠军赛 2024",
    worlds2020: "全球总决赛 2020", worlds2021: "全球总决赛 2021",
    worlds2022: "全球总决赛 2022", worlds2023: "全球总决赛 2023",
    worlds2024: "全球总决赛 2024",
  };
  const TROPHY_BRACKET = { 0: "基础", 4: "4人队", 8: "8人队", 16: "16人队" };
  const TROPHY_TIER = { 1: "底座 I", 2: "底座 II", 3: "底座 III", 4: "底座 IV" };
  const TROPHY_TIER_DEFAULT = 4;   

  function trophyThemeName(theme) {
    const key = String(theme).toLowerCase().replace(/[^a-z0-9]/g, "");
    const alt = String(theme).toLowerCase();
    return TROPHY_THEMES[alt] || TROPHY_THEMES[key] || String(theme);
  }
  function trophyBracketName(b) {
    const n = parseInt(b, 10);
    return TROPHY_BRACKET[n] || (n + "人队");
  }
  function trophyTierName(t) {
    const n = parseInt(t, 10);
    return TROPHY_TIER[n] || ("底座 " + n);
  }
  function trophyFindCup(theme, bracket) {
    const d = state.trophy.data;
    const list = (d && d.Trophies) || [];
    const th = String(theme).toLowerCase();
    const br = parseInt(bracket, 10);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (String(t.theme).toLowerCase() === th && parseInt(t.bracket, 10) === br) return t;
    }
    return null;
  }
  function trophyFindPedestal(tier) {
    const d = state.trophy.data;
    const list = (d && d.TrophyPedestals) || [];
    const want = parseInt(tier, 10);
    for (let i = 0; i < list.length; i++) {
      if (parseInt(list[i].tier, 10) === want) return list[i];
    }
    return list[0] || null;
  }
  function trophyAllCups() {
    const d = state.trophy.data;
    const list = ((d && d.Trophies) || []).slice();
    list.sort((a, b) => {
      const ba = parseInt(a.bracket, 10) || 0, bb = parseInt(b.bracket, 10) || 0;
      if ((ba === 0) !== (bb === 0)) return ba === 0 ? 1 : -1;
      const ta = trophyThemeName(a.theme), tb = trophyThemeName(b.theme);
      if (ta !== tb) return ta.localeCompare(tb, "zh-Hans-CN");
      return ba - bb;
    });
    return list;
  }

  async function loadTrophies() {
    state.trophy.err = "";
    if (!state.trophy.data) {
      try {
        const r = await lcuFetch(TROPHY_GD);
        if (!r.ok) throw new Error("HTTP " + r.status);
        state.trophy.data = await r.json();
      } catch (e) {
        state.trophy.err = String(e.message || e);
        diag("trophy-list-error", { msg: String(e) });
        return null;
      }
    }
    state.trophy.loaded = true;
    const d = state.trophy.data || {};
    diag("trophy-list-loaded", {
      cups: ((d.Trophies) || []).length,
      pedestals: ((d.TrophyPedestals) || []).length,
      themes: Object.keys(TROPHY_THEMES).length,
    });
    try {
      const own = await lcuJson("/lol-trophies/v1/current-summoner/trophies/profile");
      diag("trophy-own", { has: !!own, raw: JSON.stringify(own || null).slice(0, 120) });
    } catch (e) { diag("trophy-own-none", { msg: String(e).slice(0, 80) }); }
    return state.trophy.data;
  }


  function buildTrophyCSS() {
    const p = state.trophy.pick;
    if (!p || !state.trophy.data) return "";
    const cup = trophyFindCup(p.theme, p.bracket);
    const ped = trophyFindPedestal(p.tier);
    if (!cup || !cup.profileIcon) return "";
    const cu = cup.profileIcon;
    const pu = ped && ped.profileIcon ? ped.profileIcon : "";
    const label = trophyThemeName(p.theme) + " · " + trophyBracketName(p.bracket);
    const bg = pu ? `url("${cssEscape(cu)}"), url("${cssEscape(pu)}")` : `url("${cssEscape(cu)}")`;
    const sz = pu ? "auto 126px, 70px auto" : "auto 126px";
    const ps = pu ? "center 5px, center 104px" : "center 5px";
    const rp = pu ? "no-repeat, no-repeat" : "no-repeat";
    return `
html.${NS}-ctrophy .style-profile-trophy-component .style-profile-emblem-content {
  background-image: ${bg} !important;
  background-size: ${sz} !important;
  background-position: ${ps} !important;
  background-repeat: ${rp} !important;
}
html.${NS}-ctrophy .style-profile-trophy-component .style-profile-trophy-empty,
html.${NS}-ctrophy .style-profile-trophy-component .style-profile-trophy-container,
html.${NS}-ctrophy .style-profile-trophy-component .style-profile-trophy-icon {
  visibility: hidden !important;
  background-image: none !important;
}
html.${NS}-ctrophy .style-profile-trophy-component .style-profile-emblem-header::after {
  content: "${cssEscape(label)}";
  display: block; color: #a09b8c; font-family: var(--font-display);
  font-size: 12px; font-weight: 700; line-height: 16px; letter-spacing: .075em;
  text-transform: uppercase; margin-top: 0;
}`;
  }

  function applyTrophyCSS() {
    const css = buildTrophyCSS();
    const root = document.documentElement;
    if (!css) {
      if (root) root.classList.remove(NS + "-ctrophy");
      const old = document.getElementById(NS + "-trophyflag");
      if (old) old.remove();
      return;
    }
    let el = document.getElementById(NS + "-trophyflag");
    if (!el) {
      el = document.createElement("style");
      el.id = NS + "-trophyflag";
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    el.textContent = css;
    if (root) root.classList.add(NS + "-ctrophy");
  }

  function saveTrophyPick() {
    const t = JSON.stringify({ pick: state.trophy.pick });
    try { if (window.DataStore) window.DataStore.set(TROPHY_KEY, t); } catch (e) {  }
    try { localStorage.setItem(TROPHY_KEY, t); } catch (e) {  }
  }

  function loadTrophyPick() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(TROPHY_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(TROPHY_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (o && o.pick && o.pick.theme) {
        state.trophy.pick = {
          theme: String(o.pick.theme),
          bracket: parseInt(o.pick.bracket, 10) || 16,
          tier: parseInt(o.pick.tier, 10) || TROPHY_TIER_DEFAULT,
        };
      }
    } catch (e) {  }
  }


  const HONOR_MAX = 5;   

  function buildHonorCSS() {
    const n = state.honor.level;
    if (!n) return "";
    const u = cssEscape(crestImg(n));
    return [
      `.style-profile-honor-component .style-profile-honor-icon-v3{content:url("${u}") !important;}`,
      `.style-profile-honor-component .style-profile-honor-icon{content:url("${u}") !important;}`,
      `.style-profile-honor-component .style-profile-honor-empty{` +
        `background-image:url("${u}") !important;background-position-y:center !important;}`,
    ].join("\n");
  }

  function applyHonorCSS() {
    const css = buildHonorCSS();
    const root = document.documentElement;
    try { fixHonorText(); } catch (e) {  }
    if (!css) {
      if (root) root.classList.remove(NS + "-honor");
      const old = document.getElementById(NS + "-honorflag");
      if (old) old.remove();
      return;
    }
    let el = document.getElementById(NS + "-honorflag");
    if (!el) {
      el = document.createElement("style");
      el.id = NS + "-honorflag";
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    el.textContent = css;
    if (root) root.classList.add(NS + "-honor");
  }

  function saveHonorPick() {
    const t = JSON.stringify({ level: state.honor.level });
    try { if (window.DataStore) window.DataStore.set(HONOR_KEY, t); } catch (e) {  }
    try { localStorage.setItem(HONOR_KEY, t); } catch (e) {  }
  }

  function loadHonorPick() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(HONOR_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(HONOR_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      const n = parseInt(o && o.level, 10);
      if (n >= 1 && n <= HONOR_MAX) state.honor.level = n;
    } catch (e) {  }
  }

  const HONOR_WRAP_SEL = ".style-profile-emblem-wrapper";     
  const HONOR_COMP_SEL = ".style-profile-honor-component";    
  const HONOR_SUB_SEL = HONOR_COMP_SEL + " .style-profile-emblem-header-subtitle";
  const HONOR_TT_SCOPE_SEL = HONOR_COMP_SEL + " lol-uikit-content-block p";   
  const HONOR_TT_ANY_SEL = "lol-uikit-content-block p";                       

  const HONOR_WORD_RE = new RegExp(
    ["荣誉", "榮譽", "名誉", "榮耀", "荣耀",
     "honou?r", "honneur", "honra", "honoru", "honorze", "honor", "onor", "onoare",
     "ehre", "ehrung", "onore", "onori",
     "чест", "честь", "명예", "kitüntet",
     "vinh danh", "kehormatan", "terhormat", "poct",
     "takdir", "τιμ", "σεβαστ", "достойн", "legtisztel", "เกียรติ", "تكريم"].join("|"), "i");
  const HONOR_CP_RE = new RegExp(
    ["里程点", "进度点", "检查点", "檢查點", "里程點", "進度點", "里程碑",
     "체크포인트", "마일스톤",
     "チェックポイント", "マイルストーン", "mílník", "míln", "záchytn",
     "checkpoint", "check point", "milestone",
     "point de contr", "jalon", "kontrollpunkt", "meilenstein", "zwischenziel",
     "punto de control", "hito", "ponto de verifica", "marcação", "marcacao", "marco",
     "punto di controllo", "traguardo", "punct-cheie", "เช็คพอยท",
     "контрольн", "рубеж", "punkt kontrolny", "kamień milowy",
     "kilometre ta", "kontrol noktası", "dönüm noktası", "mérföldk", "cột mốc",
     "οροσήμ", "στόχο", "última meta", "مرحلي"].join("|"), "i");
  const HONOR_OTHER_RE = new RegExp(
    ["其他", "別的", "别的", "other", "autre",
     "anderen", "anderer", "andere",
     "otros", "otro", "outros", "outro", "demás", "demas", "más j",
     "altri", "altro", "innych", "inny", "ostatních", "ostatnich",
     "diğer", "друг", "다른", "他の", "その他",
     "άλλων", "άλλο", "الآخر", "آخرين", "celorlal", "อื่น", "lain", "khác"].join("|"), "i");

  const HONOR_SIBLING_RE = new RegExp(
    ["奖杯", "獎盃", "成就", "旗帜", "旗幟", "段位",
     "trophy", "trophies", "achievement", "banner",
     "trophée", "trophee", "erfolg", "trophä", "trofeo", "trofeu",
     "достижен", "кубок", "трофей",
     "업적", "트로피", "実績", "トロフィー", "成就點數",
     "osiągnięc", "úspěch"].join("|"), "i");

  function looksLikeHonorTooltip(txt) {
    if (!txt) return false;
    if (HONOR_OTHER_RE.test(txt)) return false;      
    if (HONOR_SIBLING_RE.test(txt)) return false;    
    return HONOR_WORD_RE.test(txt) || HONOR_CP_RE.test(txt);
  }

  let honorTextFixed = 0;
  let honorTextPending = false;

  function isZhLocale() {
    return /^zh/i.test(getClientLocale() || "");
  }

  function honorSubText(n, orig) {
    const o = (orig == null ? "" : String(orig));
    if (/\d/.test(o)) return o.replace(/\d+/, String(n));   
    return isZhLocale() ? (n + "级") : ("Level " + n);      
  }
  function honorTooltipText(n) {
    return isZhLocale() ? ("荣誉等级 " + n + " 级") : ("Honor Level " + n);
  }


  const HONOR_OWN_ICON_SEL = ".style-profile-honor-icon-v3, .style-profile-honor-icon";

  function ownHonorHost(el) {
    if (!el || !el.closest) return null;
    const c = el.closest(HONOR_COMP_SEL);
    if (c && c.querySelector(HONOR_OWN_ICON_SEL)) return c;
    const w = (c || el).closest(HONOR_WRAP_SEL);
    if (w && w.querySelector(HONOR_OWN_ICON_SEL)) return w;
    return null;
  }

  function honorSubEls() {
    const out = [];
    const comps = document.querySelectorAll(HONOR_COMP_SEL);
    for (let i = 0; i < comps.length; i++) {
      if (!ownHonorHost(comps[i])) continue;
      const s = comps[i].querySelector(".style-profile-emblem-header-subtitle");
      if (s && out.indexOf(s) < 0) out.push(s);
      const w = comps[i].closest(HONOR_WRAP_SEL);
      if (w) {
        const s2 = w.querySelector(".style-profile-emblem-header-subtitle");
        if (s2 && out.indexOf(s2) < 0) out.push(s2);
      }
    }
    return out;
  }

  function setText(el, txt) {
    if (!el) return;
    const first = el.firstChild;
    if (first && first.nodeType === 3 && el.childNodes.length === 1) {
      if (first.nodeValue !== txt) first.nodeValue = txt;
      return;
    }
    if (el.textContent !== txt) el.textContent = txt;
  }

  function fixHonorText() {
    const n = state.honor.level;

    const subs = honorSubEls();
    for (let i = 0; i < subs.length; i++) {
      const el = subs[i];
      if (!el.dataset) continue;
      if (el.dataset.hmOrig == null) el.dataset.hmOrig = el.textContent;
      if (!n) {
        if (el.dataset.hmOrig != null) {
          setText(el, el.dataset.hmOrig);
          delete el.dataset.hmOrig;
        }
        continue;
      }
      const want = honorSubText(n, el.dataset.hmOrig);
      if ((el.textContent || "").trim() !== want) setText(el, want);
    }

    const ps = document.querySelectorAll(HONOR_TT_ANY_SEL);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.dataset) continue;
      const raw = (p.textContent || "").replace(/\s+/g, " ").trim();
      const inScope = !!ownHonorHost(p);                            
      const byText = looksLikeHonorTooltip(raw);                    
      if (!n) {
        if (p.dataset.hmOrig != null) {
          setText(p, p.dataset.hmOrig);
          delete p.dataset.hmOrig;
        }
        continue;
      }
      if (HONOR_OTHER_RE.test(raw)) continue;
      if (!inScope && !byText) continue;          
      if (p.dataset.hmOrig == null) p.dataset.hmOrig = raw;
      const want = honorTooltipText(n);
      if ((p.textContent || "").trim() !== want) {
        setText(p, want);
        if (honorTextFixed++ === 0) {
          diag("honor-tooltip-fixed", {
            was: raw.slice(0, 80),
            now: want,
            layer: inScope ? "scope" : "text",
          });
        }
      }
    }
  }

  function scheduleFixHonorText() {
    if (honorTextPending) return;
    honorTextPending = true;
    setTimeout(() => {
      honorTextPending = false;
      try { if (state.honor.level) fixHonorText(); } catch (e) {  }
    }, 60);
  }

  let honorNoWrapProbed = 0;
  let honorWrapSeen = 0;
  let honorTipProbed = 0;

  function probeHonorTooltip() {
    if (honorTipProbed >= 6 && honorWrapSeen >= 3) return;
    try {
      const wraps = document.querySelectorAll(HONOR_WRAP_SEL);
      const any = document.querySelectorAll(HONOR_TT_ANY_SEL);
      const n0 = state.honor.level;

      if (!wraps.length) {
        if (honorNoWrapProbed >= 2) return;
        honorNoWrapProbed++;
        diag("honor-tooltip-probe", {
          stage: "no-wrapper-yet", wrapperCount: 0, scopeHits: 0,
          anyHits: any.length, pick: n0,
        });
        return;
      }

      const scoped = document.querySelectorAll(HONOR_TT_SCOPE_SEL);
      const mine = [];
      for (let i = 0; i < scoped.length; i++) if (ownHonorHost(scoped[i])) mine.push(scoped[i]);
      const scopedTexts = mine.map((e) =>
        String(e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90));
      const s0 = honorSubEls()[0] || document.querySelector(HONOR_SUB_SEL);
      if (honorWrapSeen < 3) {
        honorWrapSeen++;
        diag("honor-tooltip-probe", {
          stage: "wrapper-found",
          wrapperCount: wraps.length,
          ownHostCount: (function () {
            let c = 0;
            for (let i = 0; i < wraps.length; i++) if (ownHonorHost(wraps[i])) c++;
            return c;
          })(),
          scopeHits: scoped.length,
          ownScopeHits: mine.length,
          scopeTexts: scopedTexts.slice(0, 3),
          anyHits: any.length,
          honorCompCount: document.querySelectorAll(HONOR_COMP_SEL).length,
          subText: s0 ? String(s0.textContent || "").trim().slice(0, 24) : null,
          subExpect: n0 ? honorSubText(n0, s0 && s0.dataset ? s0.dataset.hmOrig : null) : null,
          pick: n0,
        });
      }

      let p = mine.length ? mine[0] : null;
      if (!p) {
        for (let i = 0; i < any.length; i++) {
          if ((any[i].textContent || "").trim()) { p = any[i]; break; }
        }
      }
      if (!p || !(p.textContent || "").trim()) return;
      if (honorTipProbed >= 6) return;

      const raw = (p.textContent || "").replace(/\s+/g, " ").trim();
      honorTipProbed++;
      const s = honorSubEls()[0] || document.querySelector(HONOR_SUB_SEL);
      const n = state.honor.level;
      diag("honor-tooltip-probe", {
        stage: "tooltip",
        text: raw.slice(0, 120),
        inScope: !!ownHonorHost(p),
        blockedAsSiblingCell: HONOR_SIBLING_RE.test(raw),
        looksHonorByText: looksLikeHonorTooltip(raw),
        blockedAsOtherPlayer: HONOR_OTHER_RE.test(raw),
        rewrittenByUs: !!(p.dataset && p.dataset.hmOrig != null),
        origBeforeUs: p.dataset ? (p.dataset.hmOrig || null) : null,
        expect: n ? honorTooltipText(n) : null,
        matches: n ? (raw === honorTooltipText(n)) : null,
        subText: s ? String(s.textContent || "").trim().slice(0, 24) : null,
        subExpect: n ? honorSubText(n, s ? s.dataset && s.dataset.hmOrig : null) : null,
        wrapperCount: document.querySelectorAll(HONOR_WRAP_SEL).length,
        scopeHits: scoped.length,
        anyHits: any.length,
        pick: n,
      });
    } catch (e) {  }
  }

  const CREST_DIR = "/fe/lol-static-assets/images/honor/profile/";
  const CREST_FILES = { 1: "emblem_1.png", 2: "emblem_2-0.png", 3: "emblem_3-0.png",
                        4: "emblem_4-0.png", 5: "emblem_5.png" };
  const CREST_CDN = "https://raw.communitydragon.org/latest/plugins/" +
                    "rcp-fe-lol-static-assets/global/default/images/honor/profile/";

  function crestImg(n) {
    return CREST_DIR + (CREST_FILES[n] || ("emblem_" + n + ".png"));
  }
  function crestImgProxy(n, w) {
    return API + "/img?w=" + (w || 120) + "&u=" +
      encodeURIComponent(CREST_CDN + (CREST_FILES[n] || ("emblem_" + n + ".png")));
  }

  function rememberBaseline(s, reg, crestIndex) {
    if (state.regalia.baseline) return;
    state.regalia.baseline = {
      bannerId: (s && s.bannerId) || null,
      crestId: (s && s.crestId) || null,
      borderLevel: (s && s.prestigeCrestBorderLevel) || 0,
      title: s && s.title ? s.title.itemId : null,
      challengeIds: (((s && s.topChallenges) || []).map((c) => (c && c.id))),
      crestIndex: crestIndex != null ? crestIndex : (reg ? reg.selectedPrestigeCrest : null),
      crestType: reg ? reg.crestType : null,
    };
    try {
      const t = JSON.stringify(state.regalia.baseline);
      if (window.DataStore) window.DataStore.set(REGALIA_KEY, t);
      localStorage.setItem(REGALIA_KEY, t);
    } catch (e) {  }
  }

  function loadBaseline() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(REGALIA_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(REGALIA_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (!o || o.bannerId === undefined) return;
      state.regalia.baseline = o;
    } catch (e) {  }
  }

  function crestIndexFromBorder(lvl) {
    if (lvl == null) return null;
    const i = PRESTIGE_LEVELS.indexOf(Number(lvl));
    return i >= 0 ? i + 1 : null;
  }

  async function refreshRegalia() {
    const out = state.regalia;
    out.err = "";
    try {
      const s = await readChallengeSummary();
      out.bannerId = s.bannerId != null ? String(s.bannerId) : null;
      out.crestId = s.crestId != null ? String(s.crestId) : null;
      out.borderLevel = s.prestigeCrestBorderLevel;
      let reg = null;
      try { reg = await readRegalia(); } catch (e) {  }
      out.crestIndex = crestIndexFromBorder(s.prestigeCrestBorderLevel);
      if (out.crestIndex == null && reg) out.crestIndex = reg.selectedPrestigeCrest;
      out.read = true;
      rememberBaseline(s, reg, out.crestIndex);
    } catch (e) {
      out.err = String(e.message || e);
    }
    return out;
  }

  async function applyCrest(index) {
    const lvl = PRESTIGE_LEVELS[Math.max(0, Math.min(PRESTIGE_LEVELS.length - 1, index - 1))];
    await writePreferences({ crestId: CREST_PRESTIGE, borderLevel: lvl });
    await writeRegalia({ crestType: "prestige", crest: index });
    await refreshRegalia();
  }

  async function restoreBaseline() {
    const b = state.regalia.baseline;
    if (!b) throw new Error("还没记录到原始值");
    const ids = (b.challengeIds || []).filter((x) => x != null);
    while (ids.length < 3) ids.push(-1);
    await lcuSend("POST", PREF_URL, {
      challengeIds: ids.slice(0, 3),
      title: String(b.title == null || b.title < 0 ? -1 : b.title),
      bannerAccent: String(b.bannerId || BANNER_NONE),
      crestBorder: String(b.crestId || CREST_PRESTIGE),
      prestigeCrestBorderLevel: b.borderLevel || 0,
    });
    if (b.crestIndex != null) {
      await writeRegalia({ crestType: b.crestType || "prestige", crest: b.crestIndex });
    }
    await refreshRegalia();
  }

  const RENAME_OLD = "hallmods";
  const RENAME_NEW = "prism";
  const MIGRATE_SUFFIXES = [
    "", ".regalia", ".honor", ".clashflag", ".trophy", ".quiet", ".slim",
    ".mastery", ".profilecustom", ".regaliaborder", ".titlecustom",
    ".collection", ".skins",
    ".custombanner",
    ".customprofilebg",
    ".summonericon", ".summonertoken", ".tokentier",
  ];

  function readStored(key) {
    let v = null;
    try { if (window.DataStore) v = window.DataStore.get(key); } catch (e) {}
    if (v == null || v === "") { try { v = localStorage.getItem(key); } catch (e) {} }
    return v;
  }

  function writeStored(key, val) {
    try { if (window.DataStore) window.DataStore.set(key, val); } catch (e) {}
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function migrateLegacyKeys() {
    const moved = [];
    const keys = MIGRATE_SUFFIXES.map((s) => SETTINGS_KEY + s)
      .concat([RENAME_NEW + ":chroma-name"]);
    keys.forEach((newKey) => {
      const cur = readStored(newKey);
      if (cur != null && cur !== "") return;                 
      const oldKey = RENAME_OLD + newKey.slice(RENAME_NEW.length);
      const old = readStored(oldKey);
      if (old == null || old === "") return;                 
      writeStored(newKey, old);
      moved.push(newKey);
    });
    if (moved.length) diag("legacy-keys-migrated", { keys: moved });
    return moved.length;
  }

  function loadSettings() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(SETTINGS_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(SETTINGS_KEY); } catch (e) {} }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (o && o.currency) {
        state.currency.rp = cleanAmount(o.currency.rp);
        state.currency.be = cleanAmount(o.currency.be);
      }
      if (o && o.level != null) {
        state.level = String(o.level).replace(/[^0-9]/g, "").slice(0, 4);
      }
    } catch (e) {}
  }

  const PANES = [
    { id: "help", label: "使用说明" },
    { id: "summoner", label: "召唤师" },
    { id: "profile", label: "个人主页" },
    { id: "battle", label: "对局增强" },
    { id: "query", label: "战绩查询" },
    { id: "prism", label: "棱镜" },
  ];

  let _fgCache = { at: 0, v: null };
  function forgeData() {
    const now = Date.now();
    if (now - _fgCache.at < 800) return _fgCache.v;
    _fgCache.at = now;
    let v = null;
    try {
      const a = window.__PRISM_ENGINE;
      if (a && typeof a.forge === "function") {
        const f = a.forge();
        if (f && f.on && f.ready) v = f;
      }
    } catch (e) { v = null; }
    _fgCache.v = v;
    return v;
  }

  function forgeIconUrl() {
    const fg = forgeData();
    if (fg && fg.iconUrl) return fg.iconUrl;
    return state.regaliaIcon.url;
  }

  function forgeLevel() {
    const fg = forgeData();
    if (fg && fg.summonerLevel) return String(fg.summonerLevel);
    return state.level;
  }

  function replayCosmetics() {
    try { applySummonerIcon(true); } catch (e) {  }
    try { applyTopSummonerIcon(); } catch (e) {  }
    try { applyLevelCSS(); } catch (e) {  }
    try { cbanSweep(); } catch (e) {  }
    try { applyClashCSS(); } catch (e) {  }
    try { applyHonorCSS(); } catch (e) {  }
    try { applyRegaliaBorder(); } catch (e) {  }
    try { applyTitleCustom(); } catch (e) {  }
    try { matesPaint(true); } catch (e) {  }
  }

  function watchForgeClass() {
    try {
      const de = document.documentElement;
      let last = de.classList.contains("prism-forge-on");
      let lastRev = de.getAttribute("data-prism-forge-rev") || "";
      new MutationObserver(function () {
        let now = false, rev = "";
        try {
          now = de.classList.contains("prism-forge-on");
          rev = de.getAttribute("data-prism-forge-rev") || "";
        } catch (e) { return; }
        if (now === last && rev === lastRev) return;
        last = now; lastRev = rev;
        _fgCache = { at: 0, v: null };     
        replayCosmetics();
      }).observe(de, { attributes: true, attributeFilter: ["class", "data-prism-forge-rev"] });
    } catch (e) {  }
  }

  const PANE_HTML = {
    summoner: () => `
      <div class="${NS}-paneh">召唤师</div>

      <div class="${NS}-box">
        <div class="${NS}-subh">顶栏数值</div>
        <div class="${NS}-setrow ${NS}-currow">
          <div class="${NS}-curcol">
            <div class="${NS}-curline">
              <span class="${NS}-setlabel">点券 RP</span>
              <input class="${NS}-setinput ${NS}-curinp" data-el="cur-rp" maxlength="${CURRENCY_MAXLEN}"
                     placeholder="留空 = 真实值" value="${esc(state.currency.rp)}" />
            </div>
            <span class="${NS}-setpv" data-el="pv-rp"></span>
          </div>
          <div class="${NS}-curcol">
            <div class="${NS}-curline">
              <span class="${NS}-setlabel">精粹 BE</span>
              <input class="${NS}-setinput ${NS}-curinp" data-el="cur-be" maxlength="${CURRENCY_MAXLEN}"
                     placeholder="留空 = 真实值" value="${esc(state.currency.be)}" />
            </div>
            <span class="${NS}-setpv" data-el="pv-be"></span>
          </div>
          <div class="${NS}-curcol">
            <div class="${NS}-curline">
              <span class="${NS}-setlabel">召唤师等级</span>
              <input class="${NS}-setinput ${NS}-curinp" data-el="cur-lv" maxlength="4"
                     placeholder="留空 = 真实值" value="${esc(state.level)}" />
            </div>
            <span class="${NS}-setpv" data-el="pv-lv"></span>
          </div>
          <button class="${NS}-ghost ${NS}-curreset" data-act="cur-reset">恢复真实值</button>
        </div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="cur-hint"></span></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">召唤师名字</div>
        <div data-el="sfn-wrap" data-selfname-skip="1"></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">段位伪装</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">启用伪装</span>
          <span class="${NS}-setpv" data-el="rd-rankDisguise">读取中…</span>
          <button class="${NS}-ghost" data-act="rd-rankDisguise">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">排位类型</span>
          <select class="${NS}-setsel" data-el="rd-rankQueue">
            <option value="RANKED_SOLO_5x5">单双排位</option>
            <option value="RANKED_FLEX_SR">灵活组排</option>
            <option value="RANKED_FLEX_TT">灵活组排 3v3</option>
            <option value="RANKED_TFT">云顶之弈</option>
            <option value="RANKED_TFT_DOUBLE_UP">云顶双人</option>
            <option value="RANKED_TFT_TURBO">云顶狂暴</option>
          </select>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">段位</span>
          <select class="${NS}-setsel" data-el="rd-rankTier">
            <option value="CHALLENGER">最强王者</option>
            <option value="GRANDMASTER">傲世宗师</option>
            <option value="MASTER">超凡大师</option>
            <option value="DIAMOND">璀璨钻石</option>
            <option value="EMERALD">流光翡翠</option>
            <option value="PLATINUM">华贵铂金</option>
            <option value="GOLD">荣耀黄金</option>
            <option value="SILVER">不屈白银</option>
            <option value="BRONZE">英勇青铜</option>
            <option value="IRON">坚韧黑铁</option>
          </select>
          <select class="${NS}-setsel" data-el="rd-rankDivision">
            <option value="I">I</option>
            <option value="II">II</option>
            <option value="III">III</option>
            <option value="IV">IV</option>
          </select>
        </div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="rd-ranknow"></span></div>
        <div class="${NS}-setrow">
          <span class="${NS}-sethint" data-el="rd-rankhint">好友名片 + 你自己个人主页的段位一起变；关掉开关即还原。</span>
        </div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">英雄</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">全英雄显示为已解锁</span>
          <span class="${NS}-setpv" data-el="coll-now">读取中…</span>
          <button class="${NS}-ghost" data-act="coll-toggle">切换</button>
        </div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="coll-hint"></span></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">皮肤</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">统计按全部算</span>
          <span class="${NS}-setpv" data-el="sk-now">读取中…</span>
          <button class="${NS}-ghost" data-act="sk-toggle">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">获得时间</span>
          <input class="${NS}-setdate" type="date" data-el="sk-date" />
          <button class="${NS}-ghost" data-act="sk-date-apply">应用</button>
          <button class="${NS}-ghost" data-act="sk-date-clear">清除</button>
        </div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="sk-hint"></span></div>
      </div>
    `,

    profile: () => `
      <div class="${NS}-paneh">个人主页</div>

      <div class="${NS}-box">
        <div class="${NS}-subh">荣誉等级</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">荣誉等级</span>
          <span class="${NS}-setpv" data-el="hn-now">读取中…</span>
          <button class="${NS}-ghost" data-act="hn-reset">恢复真实值</button>
        </div>
        <div class="${NS}-crestrow" data-el="honorrow"></div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="hn-hint"></span></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">冠军杯赛旗帜</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">旗帜</span>
          <span class="${NS}-setpv" data-el="cf-now">读取中…</span>
          <button class="${NS}-ghost" data-act="cf-reset">恢复空白</button>
        </div>
        <div class="${NS}-fltrow" data-el="cf-filter"></div>
        <div class="${NS}-setgrid" data-el="cf-grid"></div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="cf-hint"></span></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">冠军杯赛奖杯</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">杯身</span>
          <span class="${NS}-setpv" data-el="tr-now">读取中…</span>
          <button class="${NS}-ghost" data-act="tr-reset">恢复空白</button>
        </div>
        <div class="${NS}-fltrow" data-el="tr-filter"></div>
        <div class="${NS}-setgrid" data-el="tr-grid"></div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">底座</span>
          <span class="${NS}-sethint" data-el="tr-pedhint"></span>
        </div>
        <div class="${NS}-tropedrow" data-el="tr-pedrow"></div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="tr-hint"></span></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">英雄成就纹章</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">纹章等级</span>
          <span class="${NS}-setpv" data-el="ms-now">读取中…</span>
          <button class="${NS}-ghost" data-act="ms-reset">恢复真实等级</button>
        </div>
        <div class="${NS}-crestrow ${NS}-msrow" data-el="msrow"></div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">旗幡跟随等级</span>
          <span class="${NS}-setpv" data-el="ms-flagnow">读取中…</span>
          <button class="${NS}-ghost" data-act="ms-flag">切换</button>
        </div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="ms-hint"></span></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">成就积分格</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">积分数</span>
          <input class="${NS}-setinput" data-el="pc-score" type="text" inputmode="numeric"
                 placeholder="留空 = 不改（显示真实值）" maxlength="7" autocomplete="off">
          <button class="${NS}-ghost" data-act="pc-apply">应用</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">头像英雄</span>
          <select class="${NS}-setinput" data-el="pc-champ">
            <option value="0">不改（显示真实最高成就英雄）</option>
          </select>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-sethint" data-el="pc-hint"></span>
          <button class="${NS}-ghost" data-act="pc-reset">全部恢复</button>
        </div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">成就阶位</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">启用伪装</span>
          <span class="${NS}-setpv" data-el="ch-cs-challengeSpoof">读取中…</span>
          <button class="${NS}-ghost" data-act="ch-cs-challengeSpoof">开启成就伪装</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">成就阶位</span>
          <select class="${NS}-setinput" data-el="ch-cs-challengeLevel"></select>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">全部成就解锁</span>
          <span class="${NS}-setpv" data-el="ch-cs-challengeUnlockAll">读取中…</span>
          <button class="${NS}-ghost" data-act="ch-cs-challengeUnlockAll">切换</button>
        </div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="ch-cs-hint"></span></div>
      </div>
    `,

    help: () => `
      <div class="${NS}-paneh">使用说明</div>

      <div class="${NS}-box">
        <div class="${NS}-subh">召唤师</div>
        <p class="${NS}-docp">
          <b>顶栏数值</b>（点券 RP / 精粹 BE / 召唤师等级）—— 直接填数字，<b>留空就是真实值</b>。
          填完后右边会实时告诉你「顶栏显示成什么、鼠标悬停小窗显示成什么」。
        </p>
        <p class="${NS}-docp">
          <b>召唤师名字</b> —— 点「<em>切换</em>」开启，再填<b>名字</b>（最多 16 字）和<b>标签</b>（最多 5 位）。
          标签留空就只改名字。点「<em>恢复原名</em>」还原。
        </p>
        <p class="${NS}-docp">
          <b>段位伪装</b> —— 选好「排位类型 + 段位 + 小段位」，点「<em>切换</em>」打开，
          好友在聊天名片里看到的段位、以及你自己<b>个人主页</b>上的段位，都会变成你选的这个；
          关掉立刻还原。
          <i>它同时改写两处：聊天名片是写进账号的（好友可见），个人主页是本机显示（别人看你主页不受影响）。
          王者/宗师/大师没有小段位，选了会自动按 I 处理。</i>
        </p>
        <p class="${NS}-docp">
          <b>全英雄显示为已解锁</b> —— 点「<em>切换</em>」，然后去「<em>藏品 → 英雄</em>」看效果。
        </p>
        <p class="${NS}-docp">
          <b>皮肤统计按全部算</b> —— 点「<em>切换</em>」后去「<em>藏品 → 皮肤</em>」看：
          四个数字变成全部口径，网格会列出全部皮肤，未拥有的也带稀有度边框。
        </p>
        <p class="${NS}-docp">
          <b>皮肤获得时间</b> —— 选一个年月日，点「<em>应用</em>」，皮肤的悬浮弹窗里就会显示这个「已获取」时间；
          「<em>清除</em>」去掉那一行。<i>（你自己真有的皮肤日期不会被改动。）</i>
        </p>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">个人主页</div>
        <p class="${NS}-docp"><b>荣誉等级</b> —— 点下面那一排勋章选等级。</p>
        <p class="${NS}-docp"><b>冠军杯赛旗帜</b> —— 先在上方筛选栏挑一类，再点格子选中。</p>
        <p class="${NS}-docp"><b>冠军杯赛奖杯</b> —— 先在下面那排选<b>底座</b>，再点杯身格（每格是一个「主题 + 人数档」组合）。</p>
        <p class="${NS}-docp"><b>英雄成就纹章</b> —— 点勋章选等级；「<em>旗幡跟随等级</em>」决定旗幡要不要跟着换成同一档。</p>
        <p class="${NS}-docp"><b>成就积分格</b> —— 填积分数、选头像英雄，点「<em>应用</em>」；「<em>全部恢复</em>」还原。</p>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">对局增强</div>
        <p class="${NS}-docp">
          每一项都用旁边的按钮「<em>开启…</em>」/「<em>关闭…</em>」切换，切完立刻生效。
        </p>
        <p class="${NS}-docp">
          <b>自动化 · 自动接受对局</b> —— 排到人后自动点接受。
          <b>接受前延迟</b>是"等多久再接受"的随机区间（毫秒，0 ~ 15000），
          填完点「<em>保存延迟</em>」；不想等就填 0 和 0。
          <i>你自己点了「拒绝」的局，本局不会再自动接受，回到大厅才恢复。</i>
        </p>
        <p class="${NS}-docp">
          <b>自动化 · 接受后可拒绝</b> ——
          正常情况下点了「接受」，「拒绝」按钮就灰了、点不动；打开这一项之后随时能反悔，
          两个按钮一直可点。<i>只在"匹配确认"那几秒里工作。</i>
        </p>
        <p class="${NS}-docp">
          <b>自动化 · 结束自动点赞</b> —— 对局结束自动把票投出去（随机队友/对手，随机荣誉类型）。<br />
          <b>自动化 · 结束自动返回</b> —— 对局结束自动回房间；「返回后」选「<em>自动排队</em>」就顺带把下一把的匹配也开上（队友没就绪会自动重试）。
        </p>
        <p class="${NS}-docp">
          <b>自动化 · 秒抢英雄</b> —— 在「抢英雄目标」里填想玩的英雄（中文名、英文别名、数字 ID 都认，逗号分隔），
          点「<em>保存</em>」，再打开开关。轮到选人时按你填的<b>先后顺序</b>挑第一个还选得到的，
          前面的被 Ban 或队友抢了就顺位往下。
          「锁定方式」选「<em>轮到就锁</em>」= 一到你的回合立刻锁定；选「<em>只预选</em>」= 只把英雄亮出来，锁不锁你自己按。
          <i>系统给你补位（你会玩的位置之外）时这一项会自动跳过，避免用熟手英雄去顶不熟的位置。</i>
        </p>
        <p class="${NS}-docp">
          <b>自动化 · 自动 Ban</b> —— 和「秒抢英雄」同样的填法，填你想禁掉的英雄，
          轮到你 Ban 的时候按顺序挑第一个还禁得掉的自动禁。
          <i>两个目标框都是空的时候开关不会做任何事 —— 不会替你随机乱 Ban。</i>
        </p>
        <p class="${NS}-docp">
          <b>界面 · 隐藏首页云顶 / 隐藏右侧导航文字 / 关闭赛事弹窗</b> ——
          纯显示开关，只影响你自己这台机器，随时能关回来。
        </p>
      </div>

      <div class="${NS}-box ${NS}-docout">
        <div class="${NS}-subh">不在这个面板里的功能</div>

        <p class="${NS}-docp"><b>换头像框 / 头衔</b></p>
        <div class="${NS}-docwhere">
          位置：打开官方的「<em>自定义身份标识</em>」弹窗 → 切到「<em>边框</em>」栏或「<em>头衔</em>」栏<br />
          操作：<b>点卡片即换</b>。边框栏里所有框都已解锁，召唤师等级还没到的也能直接选。
        </div>

        <p class="${NS}-docp"><b>换自定义旗帜</b></p>
        <div class="${NS}-docwhere">
          位置：打开官方的「<em>自定义身份标识</em>」弹窗 → 切到「<em>旗帜</em>」栏<br />
          操作：<b>点任意一面旗帜即换</b>。这一栏所有旗帜都已解锁（鼠标能点就是能用），
          列表里还比官方多出「<em>过往赛季排位</em>」那 10 档段位旗；
          再点一下同一面就取消。<i>只改你自己屏幕上的样子，不写账号、好友看到的还是原样。</i>
        </div>

        <p class="${NS}-docp"><b>自定义生涯背景</b></p>
        <div class="${NS}-docwhere">
          位置：官方的「<em>个人主页</em>」页面 → <b>修改生涯背景</b> 按钮
          <i>（已被接管，按钮外观没变，但点它弹出来的是我们的皮肤列表）</i><br />
          操作：在弹出来的浮层里<b>选择皮肤</b>即生效。
          <b>这一项会把背景写进你的账号，好友点开你的主页也能看到</b>；
          想换回原样，就用客户端自带的背景设置再选一次。
        </div>

        <p class="${NS}-docp"><b>模拟开箱</b></p>
        <div class="${NS}-docwhere">
          位置：「<em>藏品 → 战利品</em>」页，<b>左下角那个 ? 按钮</b>
          <i>（原本是「战利品页面介绍」，已被接管，外观没变）</i><br />
          操作：点它开面板，然后
        </div>
        <ol class="${NS}-docsteps">
          <li>打开「<b>模拟模式</b>」开关</li>
          <li>选一张「<b>用哪张爆率表结算</b>」</li>
          <li>回战利品页，<b>点你自己的箱子开</b></li>
        </ol>
        <p class="${NS}-docp">
          开启后，你开的<b>任何</b>箱子都会被本地拦下、按你选的那张爆率表出结果 ——
          真请求不发、道具不消耗，同一批箱子想开几次开几次。
        </p>
      </div>
    `,

    battle: () => `
      <div class="${NS}-paneh">对局增强</div>

      <div class="${NS}-box">
        <div class="${NS}-subh">自动化</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">自动接受对局</span>
          <span class="${NS}-setpv" data-el="eng-autoAccept">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-autoAccept">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">接受前延迟</span>
          <input class="${NS}-setinput" data-el="eng-min" maxlength="5" placeholder="2000" />
          <span class="${NS}-setpv">~</span>
          <input class="${NS}-setinput" data-el="eng-max" maxlength="5" placeholder="5000" />
          <span class="${NS}-setpv">ms</span>
        </div>
        <div class="${NS}-setrow">
          <button class="${NS}-ghost" data-act="eng-delay">保存延迟</button>
          <span class="${NS}-sethint" data-el="eng-delayhint"></span>
        </div>

        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">接受后可拒绝</span>
          <span class="${NS}-setpv" data-el="eng-allowDeclineAfterAccept">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-allowDeclineAfterAccept">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">结束自动点赞</span>
          <span class="${NS}-setpv" data-el="eng-autoHonor">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-autoHonor">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">结束自动返回</span>
          <span class="${NS}-setpv" data-el="eng-autoReturnToLobby">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-autoReturnToLobby">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">返回后</span>
          <select class="${NS}-setsel" data-el="eng-autoReturnMode">
            <option value="lobby">留在房间</option>
            <option value="queue">自动排队</option>
          </select>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">秒抢英雄</span>
          <span class="${NS}-setpv" data-el="eng-autoLockChampion">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-autoLockChampion">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">锁定方式</span>
          <select class="${NS}-setsel" data-el="eng-autoLockMode">
            <option value="instant">轮到就锁</option>
            <option value="preselect">只预选</option>
          </select>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">抢英雄目标</span>
          <input class="${NS}-setinputwide" data-el="eng-lockids" placeholder="英雄名或 ID，逗号分隔，如：亚索, 劫, 157" />
          <button class="${NS}-ghost" data-act="eng-lockids">保存</button>
        </div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="eng-lockhint"></span></div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">自动 Ban</span>
          <span class="${NS}-setpv" data-el="eng-autoBanChampion">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-autoBanChampion">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">Ban 目标</span>
          <input class="${NS}-setinputwide" data-el="eng-banids" placeholder="英雄名或 ID，逗号分隔，如：盖伦, 提莫" />
          <button class="${NS}-ghost" data-act="eng-banids">保存</button>
        </div>
        <div class="${NS}-setrow"><span class="${NS}-sethint" data-el="eng-banhint"></span></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">界面</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">隐藏首页云顶</span>
          <span class="${NS}-setpv" data-el="eng-hideTFT">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-hideTFT">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">隐藏右侧导航文字</span>
          <span class="${NS}-setpv" data-el="eng-hideRightNavText">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-hideRightNavText">切换</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">关闭赛事弹窗</span>
          <span class="${NS}-setpv" data-el="eng-hideEsportsPopup">读取中…</span>
          <button class="${NS}-ghost" data-act="eng-hideEsportsPopup">切换</button>
        </div>
      </div>

      <div class="${NS}-setrow">
        <span class="${NS}-sethint" data-el="eng-status"></span>
      </div>
    `,

    query: () => `
      <div class="${NS}-paneh">战绩查询</div>

      <div class="${NS}-box">
        <div class="${NS}-subh">跨大区查战绩</div>
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">召唤师</span>
          <input class="${NS}-setinputwide" data-el="q-name" spellcheck="false"
                 placeholder="名称#尾标，例：张三#1234" />
          <button class="${NS}-ghost" data-act="q-go">查询</button>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-sethint" data-el="q-status">输入「名称#尾标」后点查询。走 Riot 全区服接口，国服任意大区都能查到，纯只读。</span>
        </div>
      </div>

      <div class="${NS}-box" data-el="q-prof" style="display:none">
        <div class="${NS}-subh">玩家资料</div>
        <div class="${NS}-qprof" data-el="q-profbox"></div>
      </div>

      <div class="${NS}-box" data-el="q-rank" style="display:none">
        <div class="${NS}-subh">段位</div>
        <div class="${NS}-qranks" data-el="q-rankbox"></div>
      </div>

      <div class="${NS}-box" data-el="q-assets" style="display:none">
        <div class="${NS}-subh">资产</div>
        <div class="${NS}-qassets" data-el="q-assetsbox"></div>
      </div>

      <div class="${NS}-box" data-el="q-head" style="display:none">
        <div class="${NS}-subh">概览</div>
        <div class="${NS}-qsum" data-el="q-sum"></div>
      </div>

      <div class="${NS}-box">
        <div class="${NS}-subh">最近对局</div>
        <div class="${NS}-qlist" data-el="q-list">
          <div class="${NS}-qempty">还没有查询结果。</div>
        </div>
        <div class="${NS}-setrow" data-el="q-morewrap" style="display:none">
          <button class="${NS}-ghost" data-act="q-more">加载更多</button>
          <span class="${NS}-sethint" data-el="q-morehint"></span>
        </div>
      </div>


    `,

    prism: () => `
      <div class="${NS}-paneh">棱镜</div>

      <div class="${NS}-box">
        <div class="${NS}-setrow">
          <span class="${NS}-setlabel">目标账号</span>
          <input class="${NS}-setinputwide" data-el="mh-name" spellcheck="false"
                 placeholder="名称#尾标，例：张三#1234" />
          <button class="${NS}-ghost" data-act="mh-apply">应用</button>
        </div>
        <div class="${NS}-setrow">
          <button class="${NS}-ghost" data-act="mh-mhForge">开启显示替换</button>
          <span class="${NS}-setpv" data-el="mh-mhForge">关闭</span>
        </div>
        <div class="${NS}-setrow">
          <span class="${NS}-sethint">输入 名称+尾标，例：张三#12345；然后点击 应用；只能复刻同大区账号，跨区账号无法复刻，复刻可能需要等待十几秒，成功后会同时替换个人主页和生涯战绩为目标数据；功能开启前会先对之前的相关改动项做一次备份；关闭复刻自动回到复刻前备份。注意：只是复刻个人主页与生涯战绩，游戏对局依旧使用本机原账号。功能仅供娱乐，请勿用于其他非法用途！</span>
        </div>
        <span class="${NS}-sethint" data-el="mh-status"></span>
      </div>
    `,
  };

  function renderTopbarSection(body) {
    const hint = body.querySelector('[data-el="cur-hint"]');
    const say = (t) => { if (hint) hint.textContent = t; };

    const preview = () => {
      [["rp", "pv-rp"], ["be", "pv-be"]].forEach((pair) => {
        const el = body.querySelector(`[data-el="${pair[1]}"]`);
        if (!el) return;
        const n = parseAmount(state.currency[pair[0]]);
        el.innerHTML = n == null
          ? "留空中，显示真实值"
          : `显示 <b>${esc(compactAmount(n))}</b> · 悬停 <b>${esc(fullAmount(n))}</b>`;
      });
      const pvLv = body.querySelector('[data-el="pv-lv"]');
      if (pvLv) {
        const v = String(state.level || "").replace(/[^0-9]/g, "");
        pvLv.innerHTML = v ? `显示 <b>${esc(v)}</b>` : "留空中，显示真实值";
      }
    };
    preview();

    const bindOne = (key, sel) => {
      const inp = body.querySelector(sel);
      if (!inp) return;
      let timer = null;
      inp.addEventListener("input", () => {
        state.currency[key] = cleanAmount(inp.value);
        clearTimeout(timer);
        timer = setTimeout(() => {
          applyCurrencyCSS();
          saveSettings();
          preview();
          const n = parseAmount(state.currency[key]);
          say(n == null ? "已恢复真实值" : `已应用 ${compactAmount(n)}`);
        }, 240);
      });
    };
    bindOne("rp", '[data-el="cur-rp"]');
    bindOne("be", '[data-el="cur-be"]');

    const lvInp = body.querySelector('[data-el="cur-lv"]');
    if (lvInp) {
      let lt = null;
      lvInp.addEventListener("input", () => {
        state.level = lvInp.value.replace(/[^0-9]/g, "").slice(0, 4);
        clearTimeout(lt);
        lt = setTimeout(() => {
          applyLevelCSS();
          saveSettings();
          preview();
          say(state.level ? `等级已设为 ${state.level}` : "等级已恢复真实值");
        }, 240);
      });
    }

    const rb = body.querySelector('[data-act="cur-reset"]');
    if (rb) {
      rb.addEventListener("click", () => {
        state.currency.rp = "";
        state.currency.be = "";
        state.level = "";
        const a = body.querySelector('[data-el="cur-rp"]');
        const b = body.querySelector('[data-el="cur-be"]');
        const c = body.querySelector('[data-el="cur-lv"]');
        if (a) a.value = "";
        if (b) b.value = "";
        if (c) c.value = "";
        applyCurrencyCSS();
        applyLevelCSS();
        saveSettings();
        preview();
        say("已恢复真实值");
      });
    }
  }

  const QSTATE = { raw: "", name: "", tag: "", puuid: "", cluster: "", games: [],
                   done: false,
                   full: null,        
                   open: -1,          
                   augments: {} };    
  const Q_PAGE = 20;                       

  const Q_MODE = {
    CLASSIC: "经典模式", ARAM: "极地大乱斗", CHERRY: "斗魂竞技场", URF: "无限火力",
    ONEFORALL: "克隆大作战", NEXUSBLITZ: "极限闪击", ULTBOOK: "无限乱斗",
    SWIFTPLAY: "快速模式", PRACTICETOOL: "训练模式", TUTORIAL: "新手教程",
    DOOMBOTSTEEMO: "末日人机", TFT: "云顶之弈",
    KIWI: "海克斯大乱斗", KIWI_JADE: "海克斯大乱斗（经典）", JADE: "经典模式",
    BRAWL: "无尽狂潮", CRAB: "激流狂潮", STRAWBERRY: "激流狂潮",
  };
  const Q_QUEUE = {
    400: "普通征召", 420: "单双排位", 430: "普通匹配", 440: "灵活组排",
    450: "极地大乱斗", 480: "快速模式", 700: "斗魂竞技场", 720: "克隆大作战",
    830: "人机(入门)", 840: "人机(新手)", 850: "人机(一般)",
    900: "无限火力", 1020: "无限乱斗", 1700: "斗魂竞技场", 1710: "斗魂竞技场",
    1750: "斗魂竞技场 3x6", 1810: "无尽狂潮", 1900: "无限乱斗",
    2300: "神木之门", 2400: "海克斯大乱斗", 2450: "海克斯大乱斗 经典模式版",
    3270: "海克斯大乱斗（自定义）", 4310: "经典匹配",
  };
  function qInt(v) {
    const n = Number(v);
    return (typeof n === "number" && isFinite(n)) ? Math.round(n) : 0;
  }
  function qPad2(n) { return (n < 10 ? "0" : "") + n; }
  function qTime(ms) {
    const n = Number(ms);
    if (!n) return "-";
    try {
      const d = new Date(n);
      return d.getFullYear() + "-" + qPad2(d.getMonth() + 1) + "-" + qPad2(d.getDate())
        + " " + qPad2(d.getHours()) + ":" + qPad2(d.getMinutes());
    } catch (e) { return "-"; }
  }
  function qDur(sec) {
    const s = qInt(sec);
    return Math.floor(s / 60) + ":" + qPad2(s % 60);
  }
  const Q_QUEUE_DYN = {};
  const Q_QN = { busy: false, done: false };
  function qLoadQueueNames(after) {
    if (Q_QN.busy || Q_QN.done) return;
    Q_QN.busy = true;
    lcuJson("/lol-game-data/assets/v1/queues.json").then((arr) => {
      (arr || []).forEach((x) => {
        const id = Number(x && x.id);
        const nm = String((x && (x.name || x.shortName)) || "").trim();
        if (isFinite(id) && nm) Q_QUEUE_DYN[id] = nm;
      });
      Q_QN.done = true; Q_QN.busy = false;
      diag("query-queue-names", { n: Object.keys(Q_QUEUE_DYN).length });
      if (typeof after === "function") after();
    }).catch(() => { Q_QN.busy = false; });
  }
  function qQueueName(id, mode) {
    const n = qInt(id);
    return Q_QUEUE_DYN[n] || Q_QUEUE[n] || Q_MODE[String(mode || "").toUpperCase()]
      || ("队列 " + n);
  }

  const QASSET = { items: null, spells: null, styles: null, perks: null,
                   busy: false, waiters: [] };
  function qLoadAssets(after) {
    if (QASSET.items) { if (typeof after === "function") after(); return; }
    if (typeof after === "function") QASSET.waiters.push(after);
    if (QASSET.busy) return;
    QASSET.busy = true;
    const grab = (p) => lcuJson(p).catch(() => null);
    Promise.all([
      grab("/lol-game-data/assets/v1/items.json"),
      grab("/lol-game-data/assets/v1/summoner-spells.json"),
      grab("/lol-game-data/assets/v1/perkstyles.json"),
      grab("/lol-game-data/assets/v1/perks.json"),
    ]).then((r) => {
      const byId = (arr) => {
        const m = {};
        (arr || []).forEach((x) => { if (x && x.id != null) m[x.id] = x; });
        return m;
      };
      QASSET.items = byId(r[0]);
      QASSET.spells = byId(r[1]);
      QASSET.perks = byId(r[3]);
      const sm = {};
      (((r[2] || {}).styles) || []).forEach((s) => { if (s && s.id != null) sm[s.id] = s; });
      QASSET.styles = sm;
      QASSET.busy = false;
      const ws = QASSET.waiters.slice();
      QASSET.waiters.length = 0;
      diag("query-assets", { items: Object.keys(QASSET.items).length,
                             spells: Object.keys(QASSET.spells).length,
                             styles: Object.keys(QASSET.styles).length,
                             perks: Object.keys(QASSET.perks).length,
                             waiters: ws.length });
      Array.prototype.forEach.call(ws, (f) => {
        try { f(); } catch (e) {  }
      });
    }).catch(() => { QASSET.busy = false; QASSET.waiters.length = 0; });
  }
  function qSlot(map, id, small) {
    const n = qInt(id);
    const c = small ? (NS + "-qslot") : (NS + "-qeqslot");
    if (!n) return '<span class="' + c + '"></span>';
    if (!map) return '<span class="' + c + '"></span>';
    const x = map[n] || null;
    if (!x) return '<span class="' + c + '" title="' + esc("#" + n) + '">' + esc(String(n)) + '</span>';
    const nm = x.name || ("#" + n);
    const icon = x.iconPath || x.icon || "";
    return '<span class="' + c + '" title="' + esc(nm + " (" + n + ")") + '">'
      + (icon ? '<img src="' + esc(icon) + '" alt="">' : esc(String(n))) + '</span>';
  }

  const Q_AUG_LV = { kPrismatic: "棱彩", kGold: "黄金", kSilver: "白银", kBronze: "青铜" };
  function qAugChip(aid, small) {
    const id = qInt(aid);
    if (!id) return "";
    const info = (QSTATE.augments && QSTATE.augments[id]) || null;
    const nm = (info && info.name) || ("强化 " + id);
    const lv = (info && info.level) || "";
    const cls = (lv === "kPrismatic") ? "prismatic"
      : (lv === "kGold") ? "gold" : (lv === "kSilver") ? "silver" : "";
    const tip = info
      ? (nm + (Q_AUG_LV[lv] ? ("（" + Q_AUG_LV[lv] + "阶）") : "") + " · " + id)
      : ("强化符文 #" + id);
    const c = small ? (NS + "-qslot") : (NS + "-qeqslot");
    return '<span class="' + c + " " + NS + '-qaug ' + cls + '" title="' + esc(tip) + '">'
      + '<em class="' + NS + '-qaugtxt">' + id + '</em>'
      + '<img src="' + esc(API + "/api/q/aicon?id=" + id) + '" alt="">'
      + '</span>';
  }

  const Q_MAP = { 0: "常规", 11: "召唤师峡谷", 12: "嚎哭深渊", 21: "斗魂竞技场",
                  22: "云顶之弈", 30: "斗魂竞技场", 453: "经典召唤师峡谷" };
  const Q_MAPSKIN = { mapskin_map12_bloom: "莲华栈桥" };
  function qMapName(js) {
    const ms = (js && js.gameModeMutators) || [];
    for (let i = 0; i < ms.length; i++) {
      if (Q_MAPSKIN[ms[i]]) return Q_MAPSKIN[ms[i]];
    }
    const id = qInt(js && js.mapId);
    return Q_MAP[id] || ("地图 " + id);
  }
  function qTh(n) {
    const s = String(qInt(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function qRow(g, puuid, idx) {
    const qi = (idx == null) ? -1 : qInt(idx);
    const js = (g && g.json) || {};
    const md = (g && g.metadata) || {};
    const ps = js.participants || [];
    let me = null;
    for (let i = 0; i < ps.length; i++) {
      if (!puuid || ps[i].puuid === puuid) { me = ps[i]; break; }
    }
    if (!me) me = ps[0] || {};
    const win = !!me.win;
    const dur = qInt(js.gameDuration);
    const remake = (js.gameEndedInEarlySurrender === true) || (dur > 0 && dur <= 180);
    const cls = remake ? "remake" : (win ? "win" : "loss");
    const cid = qInt(me.championId);
    const isOpen = (qi >= 0 && QSTATE.open === qi);
    const cs = qInt(me.totalMinionsKilled) + qInt(me.neutralMinionsKilled);
    const csmin = (dur > 0) ? (Math.round(cs / dur * 60 * 10) / 10) : 0;

    let eq = "";
    for (let i = 0; i < 7; i++) eq += qSlot(QASSET.items, me["item" + i], true);
    let sp = qSlot(QASSET.spells, me.spell1Id, true) + qSlot(QASSET.spells, me.spell2Id, true);
    let aug = "";
    for (let i = 1; i <= 6; i++) aug += qAugChip(me["playerAugment" + i], true);

    const head = '<div class="' + NS + '-qrow ' + cls
      + (isOpen ? " open" : "") + '" data-qrow="' + qi + '">'
      + '<div class="' + NS + '-qhead">'
      + '<div class="' + NS + '-qavatar">'
      + '<img data-ci="' + cid + '" src="/lol-game-data/assets/v1/champion-icons/'
      + cid + '.png" alt="">'
      + '<span class="' + NS + '-qlv">' + qInt(me.champLevel) + '</span>'
      + '</div>'
      + '<div class="' + NS + '-qresbox">'
      + '<div class="' + NS + '-qout">' + (remake ? "重开" : (win ? "胜利" : "失败")) + '</div>'
      + '<div class="' + NS + '-qmodebox">'
      + esc(qQueueName(qInt(js.queueId), js.gameMode)) + '</div>'
      + '<div class="' + NS + '-qchamp" data-cid="' + cid + '">'
      + esc(me.championName || ("#" + cid)) + '</div>'
      + '</div></div>'
      + '<div class="' + NS + '-qmid">'
      + '<div class="' + NS + '-qirow">' + eq + '</div>'
      + '<div class="' + NS + '-qirow">' + sp
      + (aug ? ('<span class="' + NS + '-qsep"></span>' + aug) : "") + '</div>'
      + '</div>'
      + '<div class="' + NS + '-qkda"><b>' + qInt(me.kills) + '</b> / <s>' + qInt(me.deaths)
      + '</s> / <b>' + qInt(me.assists) + '</b></div>'
      + '<div class="' + NS + '-qnum">' + cs + '<i>补刀 ' + csmin + '/分</i></div>'
      + '<div class="' + NS + '-qnum">' + esc(qTh(me.goldEarned)) + '<i>经济</i></div>'
      + '<div class="' + NS + '-qmap">' + esc(qMapName(js))
      + '<i>' + esc(qDur(dur)) + ' · ' + esc(qTime(md.timestamp || js.gameCreation)) + '</i></div>'
      + '</div>';
    return isOpen ? (head + qDetail(g, puuid, qi)) : head;
  }

  function qDetail(g, puuid, idx) {
    const js = (g && g.json) || {};
    const ps = js.participants || [];
    let me = null;
    for (let i = 0; i < ps.length; i++) {
      if (puuid && ps[i].puuid === puuid) { me = ps[i]; break; }
    }
    if (!me) me = ps[0] || {};
    const dur = Math.max(1, qInt(js.gameDuration));
    const cs = qInt(me.totalMinionsKilled) + qInt(me.neutralMinionsKilled);
    const ch = me.challenges || {};
    const per = (v) => Math.round(qInt(v) / dur * 60);
    const pct = (v) => (v == null ? "" : (Math.round(Number(v) * 1000) / 10) + "%");

    const sec = (label, inner) => (inner
      ? '<div class="' + NS + '-qsec"><span class="' + NS + '-qlab">' + esc(label)
        + '</span><div class="' + NS + '-qeqrow">' + inner + '</div></div>'
      : "");

    const eq = [];
    for (let i = 0; i < 7; i++) eq.push(qSlot(QASSET.items, me["item" + i]));
    const sp = qSlot(QASSET.spells, me.spell1Id) + qSlot(QASSET.spells, me.spell2Id);

    const styles = (me.perks && me.perks.styles) || [];
    const runes = [];
    const hasRune = styles.some((s) => (s.selections || []).some((x) => qInt(x.perk) > 0));
    if (hasRune) {
      styles.forEach((s) => {
        runes.push(qSlot(QASSET.styles, s.style));
        (s.selections || []).forEach((x) => { if (qInt(x.perk) > 0) runes.push(qSlot(QASSET.perks, x.perk)); });
      });
    } else {
      for (let i = 1; i <= 6; i++) {
        const id = qInt(me["playerAugment" + i]);
        if (!id) continue;
        const info = (QSTATE.augments && QSTATE.augments[id]) || null;
        const nm = (info && info.name) || ("强化 " + id);
        const lv = Q_AUG_LV[(info && info.level) || ""] || "";
        runes.push('<span class="' + NS + '-qaugrow">' + qAugChip(id, false)
          + '<b class="' + NS + '-qaugname">' + esc(nm) + '</b>'
          + (lv ? ('<i class="' + NS + '-qauglv">' + esc(lv) + '阶</i>') : "")
          + '</span>');
      }
    }

    const st = [];
    const chip = (k, v) => { if (v !== "" && v != null) st.push('<span class="' + NS + '-qchip">' + esc(k) + '<b>' + esc(String(v)) + '</b></span>'); };
    chip("分均经济", ch.goldPerMinute != null ? Math.round(ch.goldPerMinute) : per(me.goldEarned));
    chip("总经济", qInt(me.goldEarned));
    chip("分均伤害", ch.damagePerMinute != null ? Math.round(ch.damagePerMinute) : per(me.totalDamageDealtToChampions));
    chip("总伤害", qInt(me.totalDamageDealtToChampions));
    chip("分均承伤", per(me.totalDamageTaken));
    chip("总承伤", qInt(me.totalDamageTaken));
    chip("补刀", cs + "（" + (Math.round(cs / dur * 60 * 10) / 10) + "/分）");
    chip("参团率", pct(ch.killParticipation));
    chip("伤害占比", pct(ch.teamDamagePercentage));
    chip("视野分", qInt(me.visionScore));
    chip("插眼/拆眼", qInt(me.wardsPlaced) + "/" + qInt(me.wardsKilled));
    chip("英雄等级", qInt(me.champLevel));

    const ach = [];
    const ach1 = (k, on) => { if (on) ach.push('<span class="' + NS + '-qchip hl">' + esc(k) + '</span>'); };
    ach1("一血", !!me.firstBloodKill);
    ach1("一血助攻", !!me.firstBloodAssist);
    ach1("首塔", !!me.firstTowerKill);
    [["双杀", me.doubleKills], ["三杀", me.tripleKills],
     ["四杀", me.quadraKills], ["五杀", me.pentaKills]].forEach((x) => {
      if (qInt(x[1]) > 0) ach.push('<span class="' + NS + '-qchip hl">' + esc(x[0]) + '<b>' + qInt(x[1]) + '</b></span>');
    });
    if (qInt(ch.legendaryCount) > 0) ach.push('<span class="' + NS + '-qchip hl">超神<b>' + qInt(ch.legendaryCount) + '</b></span>');
    if (qInt(me.largestKillingSpree) > 1) ach.push('<span class="' + NS + '-qchip">最大连杀<b>' + qInt(me.largestKillingSpree) + '</b></span>');
    if (qInt(me.killingSprees) > 0) ach.push('<span class="' + NS + '-qchip">多杀次数<b>' + qInt(me.killingSprees) + '</b></span>');
    if (qInt(me.longestTimeSpentLiving) > 0) ach.push('<span class="' + NS + '-qchip">最长存活<b>' + qDur(me.longestTimeSpentLiving) + '</b></span>');
    if (qInt(me.timeCCingOthers) > 0) ach.push('<span class="' + NS + '-qchip">控制时长<b>' + qDur(me.timeCCingOthers) + '</b></span>');

    const side = (tid, title) => {
      const arr = ps.filter((x) => qInt(x.teamId) === tid);
      if (!arr.length) return "";
      const rows = arr.map((x) => {
        const mine = !!(x.puuid && x.puuid === puuid);
        const cid = qInt(x.championId);
        return '<div class="' + NS + '-qplrow' + (mine ? " me" : "") + '" title="'
          + esc(x.riotIdGameName || x.summonerName || "") + '">'
          + '<span class="' + NS + '-qplname" data-cid="' + cid + '">'
          + esc(x.championName || ("#" + cid)) + '</span>'
          + '<span class="' + NS + '-qplwho">'
          + esc(x.riotIdGameName || x.summonerName || "") + '</span>'
          + '<span class="' + NS + '-qplkda">' + qInt(x.kills) + "/" + qInt(x.deaths)
          + "/" + qInt(x.assists) + '</span>'
          + '<span class="' + NS + '-qplnum">' + qInt(x.goldEarned) + '</span>'
          + '<span class="' + NS + '-qplnum">' + qInt(x.totalDamageDealtToChampions) + '</span>'
          + '</div>';
      }).join("");
      return '<div class="' + NS + '-qside"><div class="' + NS + '-qsideth">' + esc(title)
        + '（英雄 · 名字 · K/D/A · 经济 · 伤害）</div>' + rows + '</div>';
    };

    const tids = [];
    ps.forEach((x) => { const t = qInt(x.teamId); if (t && tids.indexOf(t) < 0) tids.push(t); });
    const myTid = tids.length ? (qInt(me.teamId) || tids[0]) : 0;
    const others = tids.filter((t) => t !== myTid);
    let sides = "";
    if (ps.length > 1 && myTid) {
      sides = '<div class="' + NS + '-qsides">' + side(myTid, "我方")
        + others.map((t) => side(t, "敌方")).join("") + '</div>';
    }

    return '<div class="' + NS + '-qdet">'
      + sec("装备", eq.join(""))
      + sec("技能", sp)
      + sec("符文", runes.join(""))
      + sec("数据", st.join(""))
      + sec("成就", ach.join(""))
      + sides
      + '</div>';
  }

  function renderMatchForgeSection(body) {
    const hint = body.querySelector('[data-el="mh-status"]');
    const DEFAULT_HINT = "";
    const say = (t) => { if (hint) hint.textContent = t; };
    const api = () => (window.__PRISM_ENGINE && typeof window.__PRISM_ENGINE.setCfg === "function")
      ? window.__PRISM_ENGINE : null;

    const TOGGLE = "mhForge";
    const NAME = "mhForgeName";

    const mark = () => {
      const a = api();
      let c = null;
      if (a) { try { c = a.getCfg(); } catch (e) { c = null; } }
      const on = !!(c && c[TOGGLE]);
      const el = body.querySelector('[data-el="mh-' + TOGGLE + '"]');
      const btn = body.querySelector('[data-act="mh-' + TOGGLE + '"]');
      const inp = body.querySelector('[data-el="mh-name"]');
      if (el) el.textContent = !a ? "引擎未加载" : (on ? "已开启" : "关闭");
      if (btn && a) btn.textContent = on ? "关闭显示替换" : "开启显示替换";
      if (inp && c && c[NAME] != null && document.activeElement !== inp) inp.value = String(c[NAME]);
      return { a: a, on: on };
    };

    let pollT = 0;
    const pollState = (wantName) => {
      clearTimeout(pollT);
      let n = 0;
      const tick = () => {
        const a = api();
        if (!a || typeof a.mhState !== "function") { say("引擎不支持该状态查询，直接去「对局记录」页即可。"); return; }
        let st = null;
        try { st = a.mhState(); } catch (e) { st = null; }
        if (!st) return;
        if (st.cached) {
          say("已就绪：" + (st.want || wantName) + "（" + (st.count || 0) + " 场）—— 打开「对局记录」页看看。");
          return;
        }
        n++;
        if (n > 240) {                     
          say(st.err ? ("取数失败：" + st.err + "（确认「昵称#尾标」写对、且对方没设为不公开）")
                     : "预热还在跑，切到「对局记录」页时会自动重试。");
          return;
        }
        if (st.err) say("正在重试取数…（第 " + n + " 次，" + st.err + "）");
        pollT = setTimeout(tick, 500);
      };
      pollT = setTimeout(tick, 400);
    };

    const apply = () => {
      const a = api();
      if (!a) { say("引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
      const inp = body.querySelector('[data-el="mh-name"]');
      const name = String((inp && inp.value) || "").trim().replace(/\s+/g, "");
      if (name && name.indexOf("#") < 0) { say("要写「昵称#尾标」（尾标必填），例：张三#1234"); return; }
      try { a.setCfg({ [NAME]: name, [TOGGLE]: !!name }); }
      catch (e) { say("写入失败：" + String((e && e.message) || e)); return; }
      mark();
      if (!name) { say("已清空目标 —— 本机「对局记录」页恢复真实数据。"); return; }
      say("正在取数…");
      diag("mh-forge-apply", { name: name });
      try { if (typeof a.mhWarm === "function") a.mhWarm(); } catch (e) {  }
      pollState(name);
    };

    const btn = body.querySelector('[data-act="mh-' + TOGGLE + '"]');
    if (btn) {
      btn.addEventListener("click", () => {
        const a = api();
        if (!a) { say("引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
        const cur = mark();
        const inp = body.querySelector('[data-el="mh-name"]');
        const name = String((inp && inp.value) || "").trim().replace(/\s+/g, "");
        const next = !cur.on;
        if (next && !name) { say("先填「昵称#尾标」再开启。"); return; }
        try { a.setCfg({ [TOGGLE]: next, [NAME]: name }); }
        catch (e) { say("写入失败：" + String((e && e.message) || e)); return; }
        mark();
        if (next) { say("正在取数…"); try { if (typeof a.mhWarm === "function") a.mhWarm(); } catch (e) {  } pollState(name); }
        else { say("已关闭 —— 本机「对局记录」页恢复真实数据。"); }
        diag("mh-forge-toggle", { on: next, name: name });
      });
    }

    const go = body.querySelector('[data-act="mh-apply"]');
    if (go) go.addEventListener("click", apply);

    try {
      const m0 = mark();
      const inpNow = body.querySelector('[data-el="mh-name"]');
      if (m0.a && m0.on) pollState(String((inpNow && inpNow.value) || ""));
    } catch (e) {  }

    const inp0 = body.querySelector('[data-el="mh-name"]');
    if (inp0) {
      inp0.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
      inp0.addEventListener("change", () => {
        const a = api();
        if (!a) return;
        const v = String(inp0.value || "").trim().replace(/\s+/g, "");
        try { a.setCfg({ [NAME]: v }); } catch (e) {  }
        mark();
      });
    }

    mark();
    let tries = 0;
    const t = setInterval(() => {
      if (!btn || btn.isConnected === false) { clearInterval(t); return; }
      if (api() || ++tries > 25) { clearInterval(t); mark(); say(DEFAULT_HINT); return; }
      mark();
    }, 800);
  }

  function renderQuerySection(body) {
    const nameEl = body.querySelector('[data-el="q-name"]');
    const statusEl = body.querySelector('[data-el="q-status"]');
    const headBox = body.querySelector('[data-el="q-head"]');
    const sumEl = body.querySelector('[data-el="q-sum"]');
    const listEl = body.querySelector('[data-el="q-list"]');
    const moreWrap = body.querySelector('[data-el="q-morewrap"]');
    const moreHint = body.querySelector('[data-el="q-morehint"]');
    const profBox = body.querySelector('[data-el="q-prof"]');
    const profEl = body.querySelector('[data-el="q-profbox"]');
    const rankBox = body.querySelector('[data-el="q-rank"]');
    const rankEl = body.querySelector('[data-el="q-rankbox"]');
    const assetBox = body.querySelector('[data-el="q-assets"]');
    const assetEl = body.querySelector('[data-el="q-assetsbox"]');
    const say = (t) => { if (statusEl) statusEl.textContent = t; };
    let busy = false;

    const paintChampNames = () => {
      const a = (window.__PRISM_ENGINE && typeof window.__PRISM_ENGINE.championNames === "function")
        ? window.__PRISM_ENGINE : null;
      if (!a || !listEl) return;
      const nodes = listEl.querySelectorAll("[data-cid]");
      if (!nodes.length) return;
      const ids = [];
      Array.prototype.forEach.call(nodes, (n) => {
        const id = parseInt(n.getAttribute("data-cid"), 10) || 0;
        if (id && ids.indexOf(id) < 0) ids.push(id);
      });
      if (!ids.length) return;
      a.championNames(ids).then((names) => {
        if (!names || !names.length) return;
        const map = {};
        ids.forEach((id, i) => { if (names[i]) map[id] = names[i]; });
        Array.prototype.forEach.call(nodes, (n) => {
          const id = parseInt(n.getAttribute("data-cid"), 10) || 0;
          if (map[id]) n.textContent = map[id];
        });
      }).catch(() => {  });
    };

    const paintSum = () => {
      if (!headBox || !sumEl) return;
      if (!QSTATE.puuid) { headBox.style.display = "none"; return; }
      headBox.style.display = "";
      const label = QSTATE.name + (QSTATE.tag ? ("#" + QSTATE.tag) : "");
      const chips = ['<span class="' + NS + '-qchip"><b>' + esc(label) + '</b></span>'];
      if (QSTATE.cluster) {
        chips.push('<span class="' + NS + '-qchip hl">大区<b>' + esc(QSTATE.cluster) + '</b></span>');
      }
      chips.push('<span class="' + NS + '-qchip">已加载<b>' + QSTATE.games.length + '</b>场</span>');
      sumEl.innerHTML = chips.join("");
    };

    const paintList = () => {
      if (!listEl) return;
      if (!QSTATE.games.length) {
        listEl.innerHTML = '<div class="' + NS + '-qempty">'
          + (QSTATE.puuid ? "这个玩家没查到对局。" : "还没有查询结果。") + '</div>';
        if (moreWrap) moreWrap.style.display = "none";
        return;
      }
      listEl.innerHTML = QSTATE.games.map((g, i) => qRow(g, QSTATE.puuid, i)).join("");
      if (moreWrap) moreWrap.style.display = QSTATE.done ? "none" : "";
      paintChampNames();
      if (!QASSET.items) qLoadAssets(() => { if (QSTATE.games.length) paintList(); });
    };

    const drowOf = (ev) => {
      const path = (ev && ev.composedPath) ? ev.composedPath() : [];
      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (n && n.getAttribute && n.getAttribute("data-qrow") != null) return n;
      }
      return (ev && ev.target && ev.target.closest) ? ev.target.closest("[data-qrow]") : null;
    };
    if (listEl) listEl.addEventListener("click", (ev) => {
      const row = drowOf(ev);
      if (!row) return;
      const i = qInt(row.getAttribute("data-qrow"));
      QSTATE.open = (QSTATE.open === i) ? -1 : i;
      paintList();     
      diag("query-row-toggle", { i: QSTATE.open });
    });
    if (listEl) listEl.addEventListener("error", (ev) => {
      const t = ev.target;
      if (!t || t.tagName !== "IMG") return;
      try { t.style.display = "none"; } catch (e) {  }
      try { if (t.parentNode && t.parentNode.classList) t.parentNode.classList.add(NS + "-qnoicon"); }
      catch (e) {  }
    }, true);

    const clearFull = () => {
      [profBox, rankBox, assetBox].forEach((b) => { if (b) b.style.display = "none"; });
      [profEl, rankEl, assetEl].forEach((e) => { if (e) e.innerHTML = ""; });
    };
    const fmtTime = (ms) => {
      const t = Number(ms || 0);
      if (!t) return "—";
      const d = new Date(t);
      if (isNaN(d.getTime())) return "—";
      const p = (n) => String(n).padStart(2, "0");
      const when = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
        + " " + p(d.getHours()) + ":" + p(d.getMinutes());
      const dif = Date.now() - t;
      const h = Math.floor(dif / 3600000), day = Math.floor(h / 24);
      const ago = day >= 1 ? ("（" + day + " 天前）") : (h >= 1 ? ("（" + h + " 小时前）") : "（最近）");
      return when + ago;
    };
    const TIER_CN = { IRON: "坚韧黑铁", BRONZE: "英勇黄铜", SILVER: "不屈白银",
      GOLD: "荣耀黄金", PLATINUM: "华贵铂金", EMERALD: "流光翡翠",
      DIAMOND: "璀璨钻石", MASTER: "超凡大师", GRANDMASTER: "傲世宗师",
      CHALLENGER: "最强王者", SALT: "坚韧盐晶", WOOD: "英勇秀木",
      LEGEND: "最强传奇", NONE: "未定级" };
    const RANK_LABEL = { RANKED_SOLO_5x5: "单双排", RANKED_FLEX_SR: "灵活组排",
      RANKED_TFT: "云顶之弈", RANKED_TFT_TURBO: "云顶狂暴",
      RANKED_TFT_DOUBLE_UP: "云顶双人", RANKED_PREMADE_5x5: "战队排位",
      JADE_RANKED_SOLO_5x5: "经典单双" };

    const paintFull = (o) => {
      const pl = o.player || {};
      try {
        if (profEl && profBox) {
          profBox.style.display = "";
          const av = pl.profileIconId
            ? ('<img class="' + NS + '-qav" src="/lol-game-data/assets/v1/profile-icons/'
               + esc(String(pl.profileIconId)) + '.jpg" alt="">')
            : ('<span class="' + NS + '-qav"></span>');
          const exp = (pl.expPoints != null && pl.expToNextLevel)
            ? (" · 经验 " + Math.round(100 * pl.expPoints / pl.expToNextLevel) + "%") : "";
          const pv = pl.privacy === "PUBLIC" ? "公开" : (pl.privacy ? "隐藏" : "");
          profEl.innerHTML = '<div class="' + NS + '-qprofrow">' + av
            + '<div class="' + NS + '-qprofmeta">'
            + '<div class="' + NS + '-qname">' + esc((pl.gameName || "") + "#" + (pl.tagLine || "")) + '</div>'
            + '<div class="' + NS + '-qsub">等级 <b>' + esc(String(pl.level != null ? pl.level : "—")) + '</b>'
            + exp + " · " + esc(pl.region || "—") + '</div>'
            + '<div class="' + NS + '-qsub">上次游戏 ' + esc(fmtTime(pl.lastGameDate))
            + " · " + esc(pl.online || "状态未知")
            + (pv ? (" · 战绩" + pv) : "") + '</div>'
            + '</div></div>';
        }
      } catch (e) {  }

      try {
        const qs = (((o.rank || {}).queues) || []).filter((x) => x && x.tier && x.tier !== "NONE");
        if (rankEl && rankBox && qs.length) {
          rankBox.style.display = "";
          rankEl.innerHTML = qs.map((q) => {
            const t = TIER_CN[q.tier] || q.tier;
            const peak = (q.highestTier && q.highestTier !== q.tier)
              ? (" · 最高 " + (TIER_CN[q.highestTier] || q.highestTier) + (q.highestRank || "")) : "";
            return '<div class="' + NS + '-qrankcard">'
              + '<div class="' + NS + '-qrname">' + esc(RANK_LABEL[q.queueType] || q.queueType) + '</div>'
              + '<div class="' + NS + '-qrtier">' + esc(t) + " " + esc(q.rank || "") + '</div>'
              + '<div class="' + NS + '-qrlp">' + esc(String(q.leaguePoints || 0)) + " LP"
              + (q.cumulativeLp != null ? (" · 累计 " + esc(String(q.cumulativeLp))) : "") + '</div>'
              + '<div class="' + NS + '-qrrec">' + esc(String(q.wins || 0)) + "胜 "
              + esc(String(q.losses || 0)) + "负"
              + (q.winStreak ? (" · 连胜" + esc(String(q.winStreak))) : "") + esc(peak) + '</div>'
              + '</div>';
          }).join("");
        }
      } catch (e) {  }

      try {
        const a = o.assets || {};
        if (assetEl && assetBox && !a.error && (a.heros != null || a.skins != null)) {
          assetBox.style.display = "";
          const chips = [["英雄", a.heros], ["皮肤", a.skins], ["炫彩", a.colorfuls],
                         ["守卫", a.guards], ["图标", a.icons], ["表情", a.emotes]]
            .filter((x) => x[1] != null)
            .map((x) => '<span class="' + NS + '-qchip">' + x[0] + "<b>" + esc(String(x[1])) + "</b></span>");
          if (a.levels) chips.push('<span class="' + NS + '-qchip hl">全服等级<b>' + esc(a.levels) + "</b></span>");
          if (a.titles) chips.push('<span class="' + NS + '-qchip hl">称号<b>' + esc(a.titles) + "</b></span>");
          assetEl.innerHTML = chips.join("");
        }
      } catch (e) {  }

    };

    const load = (append) => {
      if (busy || !QSTATE.puuid) return;
      busy = true;
      const start = append ? QSTATE.games.length : 0;
      say(append ? "正在加载更多…" : "正在查战绩（首次要探大区，可能要几秒）…");
      if (moreHint) moreHint.textContent = append ? "加载中…" : "";
      const p = "/api/q/matches?puuid=" + encodeURIComponent(QSTATE.puuid)
        + "&count=" + Q_PAGE + "&start=" + start
        + (QSTATE.cluster ? ("&cluster=" + encodeURIComponent(QSTATE.cluster)) : "");
      apiGet(p, 45000).then((d) => {
        busy = false;
        if (moreHint) moreHint.textContent = "";
        if (!d || d.ok === false) {
          say("查询失败：" + ((d && d.error) || "未知错误"));
          diag("query-matches-fail", { puuid: QSTATE.puuid, start: start, err: (d && d.error) || "" });
          if (!append) { QSTATE.games = []; paintList(); }
          return;
        }
        QSTATE.cluster = d.cluster || QSTATE.cluster;
        const got = d.games || [];
        QSTATE.games = append ? QSTATE.games.concat(got) : got;
        QSTATE.done = got.length < Q_PAGE;      
        paintSum();
        paintList();
        say("已加载 " + QSTATE.games.length + " 场" + (QSTATE.done ? "（已到底）" : "")
          + " · 大区集群 " + (QSTATE.cluster || "?") + " · 数据源 Riot 全区服接口");
        diag("query-matches-ok", { puuid: QSTATE.puuid, cluster: QSTATE.cluster,
          n: got.length, start: start });
      }).catch((e) => {
        busy = false;
        if (moreHint) moreHint.textContent = "";
        say("查询失败：" + String((e && e.message) || e));
        diag("query-matches-error", { puuid: QSTATE.puuid,
          msg: String((e && e.message) || e).slice(0, 160) });
      });
    };

    const Q_TRY_MAX = 3;
    const resetFull = () => {
      QSTATE.puuid = ""; QSTATE.cluster = ""; QSTATE.games = [];
      QSTATE.done = false; QSTATE.full = null; QSTATE.open = -1;
      QSTATE.augments = {};
      if (headBox) headBox.style.display = "none";
      clearFull();
      paintList();
    };
    const gotFull = (d, raw) => {
      const pl = d.player || {};
      QSTATE.puuid = pl.puuid || "";
      QSTATE.name = pl.gameName || raw;
      QSTATE.tag = pl.tagLine || "";
      QSTATE.cluster = pl.region || "";
      QSTATE.games = d.matches || [];
      QSTATE.done = true;              
      QSTATE.full = d;                 
      QSTATE.augments = d.augments || {};   
      QSTATE.open = -1;                
      qLoadQueueNames();               
      qLoadAssets();                   
      paintFull(d);
      paintSum();
      paintList();
      say("已加载 " + QSTATE.games.length + " 场"
        + (d.matchesError ? ("（战绩取得失败：" + d.matchesError + "）") : "")
        + " · 大区 " + (pl.region || "?"));
      diag("query-full-ok", { name: raw, puuid: QSTATE.puuid,
                              n: QSTATE.games.length, region: pl.region || "" });
    };
    const missFull = (b, e, n, raw, retry) => {
      const rl = !!(b && b.rateLimited);
      const netFail = !b;
      const wait = rl ? Math.min(30, Math.ceil(Number(b.retryAfter) || 1))
                      : (netFail ? 3 : 1.5);
      if (retry && n < Q_TRY_MAX) {
        say((rl ? ("后端说查询太频繁，等 " + wait + " 秒自动重试…")
                : "连不上本地后端，等它起来…正在自动重试")
            + "（第 " + (n + 1) + "/" + Q_TRY_MAX + " 次）");
        diag("query-full-retry", { name: raw, attempt: n + 1, rl: rl, wait: wait,
                                   st: (e && e.status) || 0 });
        busy = true;
        setTimeout(() => { askFull(n + 1, raw); }, Math.max(400, wait * 1000));
        return;
      }
      busy = false;
      resetFull();
      if (rl) {
        say("查询太频繁 —— 约 " + wait + " 秒后可再查（每次查询至少间隔 10 秒）。");
      } else if (netFail) {
        say("后端连接失败，重启 PRISM 唤起即可");
        diag("query-backend-down", { tries: n + 1 });
      } else {
        say("查询失败：" + String((b && b.error) || (e && e.message) || "未知错误"));
      }
      if (b) {
        diag("query-full-miss", { name: raw, err: (b && b.error) || "",
                                  rl: rl, tries: n + 1 });
      } else {
        diag("query-full-error", { name: raw, st: (e && e.status) || 0, tries: n + 1,
          msg: String((e && e.message) || "").slice(0, 160) });
      }
    };
    const askFull = (n, raw) => {
      apiGet("/api/q/full?name=" + encodeURIComponent(raw) + "&masteryLimit=0", 120000)
        .then((d) => {
          if (d && d.ok !== false) { busy = false; gotFull(d, raw); return; }
          const rl = !!(d && d.rateLimited);
          missFull(d, null, n, raw, rl || !d);
        })
        .catch((e) => {
          const b = (e && e.body) || null;
          missFull(b, e, n, raw, !b || (e && e.status >= 500));
        });
    };

    const go = () => {
      const raw = (nameEl ? nameEl.value : "").trim();
      QSTATE.raw = raw;
      const keep = () => (QSTATE.puuid ? "（下方仍是上次「" + QSTATE.name + "」的结果）" : "");
      if (!raw) { say("先填「名称#尾标」。" + keep()); return; }
      if (raw.indexOf("#") < 0) {
        say("格式要「名称#尾标」，例如：张三#1234 " + keep());
        return;
      }
      if (busy) return;
      busy = true;
      say("正在查询（资料 / 段位 / 资产 / 战绩；可能要十几秒）…");
      resetFull();
      askFull(0, raw);
    };

    if (nameEl) {
      nameEl.value = QSTATE.raw || "";
      nameEl.addEventListener("input", () => { QSTATE.raw = nameEl.value; });
      nameEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); go(); }
      });
    }
    const goBtn = body.querySelector('[data-act="q-go"]');
    if (goBtn) goBtn.addEventListener("click", go);
    const moreBtn = body.querySelector('[data-act="q-more"]');
    if (moreBtn) moreBtn.addEventListener("click", () => load(true));

    if (QSTATE.full) paintFull(QSTATE.full);
    paintSum();
    paintList();
    if (QSTATE.puuid) {
      say("上次查询：" + QSTATE.name + (QSTATE.tag ? ("#" + QSTATE.tag) : "")
        + " · 已加载 " + QSTATE.games.length + " 场");
    }
    qLoadQueueNames(() => { if (QSTATE.games.length) paintList(); });
  }

  function paintPane(pane, id) {
    if (id === "summoner") {
      renderTopbarSection(pane);
      renderSelfNameSection(pane);
      renderRankDisguiseSection(pane);
      renderCollectionSection(pane);
      renderSkinsSection(pane);
      renderCulSection(pane);      
    } else if (id === "profile") {
      renderHonorSection(pane);
      renderClashSection(pane);
      renderTrophySection(pane);
      renderMasterySection(pane);
      renderProfileSection(pane);
      renderChallengeSection(pane);
    } else if (id === "battle") {
      renderEngineSection(pane);
    } else if (id === "query") {
      renderQuerySection(pane);
    } else if (id === "prism") {
      renderMatchForgeSection(pane);
    }
  }

  function switchPane(body, id) {
    if (!PANES.some((p) => p.id === id)) id = PANES[0].id;
    state.pane = id;
    let nav = null, pane = null;
    try { nav = body.querySelector('[data-el="pane-nav"]'); } catch (e) {  }
    try { pane = body.querySelector('[data-el="pane"]'); } catch (e) {  }
    if (nav) {
      Array.prototype.forEach.call(nav.children, (b) => {
        try { b.classList.toggle("on", b.getAttribute("data-pane") === id); } catch (e) {  }
      });
    }
    if (!pane) return;
    pane.innerHTML = (PANE_HTML[id] || (() => ""))();
    try { pane.scrollTop = 0; } catch (e) {  }
    try { paintPane(pane, id); }
    catch (e) { diag("pane-paint-error", { id: id, msg: String((e && e.message) || e).slice(0, 160) }); }
  }

  function renderCurrencySettings(body) {
    body.innerHTML = `
      <div class="${NS}-layout">
        <div class="${NS}-sidebar">
          <div class="${NS}-snav" data-el="pane-nav"></div>
        </div>
        <div class="${NS}-pane" data-el="pane"></div>
      </div>
    `;
    const nav = body.querySelector('[data-el="pane-nav"]');
    PANES.forEach((p) => {
      const b = document.createElement("button");
      b.className = `${NS}-sitem`;
      b.setAttribute("data-pane", p.id);
      b.innerHTML = `<i></i><span>${esc(p.label)}</span>`;
      b.addEventListener("click", () => switchPane(body, p.id));
      nav.appendChild(b);
    });
    switchPane(body, state.pane || PANES[0].id);
  }


  function renderRankDisguiseSection(body) {
    const hint = body.querySelector('[data-el="rd-rankhint"]');
    const DEFAULT_HINT = "好友名片 + 你自己个人主页的段位一起变；关掉开关即还原。";
    const say = (t) => { if (hint) hint.textContent = t; };
    const api = () => (window.__PRISM_ENGINE && typeof window.__PRISM_ENGINE.setCfg === "function")
      ? window.__PRISM_ENGINE : null;

    const TOGGLE = "rankDisguise";
    const RD_SELS = ["rankQueue", "rankTier", "rankDivision"];

    let nowPainted = false;
    const paintNow = (a) => {
      const el = body.querySelector('[data-el="rd-ranknow"]');
      if (!el || nowPainted || typeof a.readRankNow !== "function") return;
      nowPainted = true;
      a.readRankNow().then((r) => {
        if (el.isConnected === false) { nowPainted = false; return; }
        el.textContent = (r && r.tier)
          ? ("当前名片段位：" + r.tier + " " + (r.division || "") + " · " + (r.queue || "-"))
          : "当前名片段位：真实段位（未伪装）";
      }).catch(() => { nowPainted = false; });
    };

    const mark = () => {
      const a = api();
      let cfgNow = null;
      if (a) { try { cfgNow = a.getCfg(); } catch (e) { cfgNow = null; } }
      const el = body.querySelector('[data-el="rd-' + TOGGLE + '"]');
      const btn = body.querySelector('[data-act="rd-' + TOGGLE + '"]');
      const on = !!(cfgNow && cfgNow[TOGGLE]);
      if (el) el.textContent = !a ? "引擎未加载" : (on ? "已开启" : "关闭");
      if (btn && a) btn.textContent = on ? "关闭段位伪装" : "开启段位伪装";
      RD_SELS.forEach((k) => {
        const s = body.querySelector('[data-el="rd-' + k + '"]');
        if (s && cfgNow && cfgNow[k] != null) s.value = String(cfgNow[k]);
      });
      if (a) paintNow(a);
    };

    const btn = body.querySelector('[data-act="rd-' + TOGGLE + '"]');
    if (btn) {
      btn.addEventListener("click", () => {
        const a = api();
        if (!a) { say("引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
        const next = !a.getCfg()[TOGGLE];
        try { a.setCfg({ [TOGGLE]: next }); }
        catch (e) { say("写入失败：" + String((e && e.message) || e)); return; }
        mark();
        diag("rank-disguise-toggle", { on: next });
      });
    }

    RD_SELS.forEach((k) => {
      const s = body.querySelector('[data-el="rd-' + k + '"]');
      if (!s) return;
      s.addEventListener("change", () => {
        const a = api();
        if (!a) { say("引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
        try { a.setCfg({ [k]: s.value }); }
        catch (e) { say("写入失败：" + String((e && e.message) || e)); return; }
        mark();
        diag("rank-disguise-select", { key: k, value: s.value });
      });
    });

    mark();
    let tries = 0;
    const t = setInterval(() => {
      if (!btn || btn.isConnected === false) { clearInterval(t); return; }
      if (api() || ++tries > 25) { clearInterval(t); mark(); say(DEFAULT_HINT); return; }
      mark();
    }, 800);
  }

  const CH_LEVEL_CN = {
    IRON: "黑铁", BRONZE: "青铜", SILVER: "白银", GOLD: "黄金", PLATINUM: "铂金",
    DIAMOND: "钻石", MASTER: "大师", GRANDMASTER: "宗师", CHALLENGER: "王者"
  };

  function renderChallengeSection(body) {
    const hint = body.querySelector('[data-el="ch-cs-hint"]');
    const DEFAULT_HINT = "成就页 / 总览页头像下方 / 右上角头像浮窗 三处一起变；只改本机显示（好友看到的仍是真实阶位），关掉即还原。";
    const say = (t) => { if (hint) hint.textContent = t; };
    const api = () => (window.__PRISM_ENGINE && typeof window.__PRISM_ENGINE.setCfg === "function")
      ? window.__PRISM_ENGINE : null;

    const TGL = "challengeSpoof", UNL = "challengeUnlockAll", LEVEL = "challengeLevel";
    const levelSel = body.querySelector('[data-el="ch-cs-' + LEVEL + '"]');

    let optsPainted = false;
    const paintOptions = (a) => {
      if (!levelSel || optsPainted) return;
      let list = null;
      if (a && typeof a.challengeLevels === "function") {
        try { list = a.challengeLevels(); } catch (e) { list = null; }
      }
      if (!Array.isArray(list) || !list.length) return;
      levelSel.innerHTML = list.map((L) =>
        `<option value="${esc(L)}">${esc((CH_LEVEL_CN[L] || L) + " " + L)}</option>`).join("");
      optsPainted = true;
    };

    const mark = () => {
      const a = api();
      let c = null;
      if (a) { try { c = a.getCfg(); } catch (e) { c = null; } }
      const onEl = body.querySelector('[data-el="ch-cs-' + TGL + '"]');
      const onBtn = body.querySelector('[data-act="ch-cs-' + TGL + '"]');
      const unEl = body.querySelector('[data-el="ch-cs-' + UNL + '"]');
      const unBtn = body.querySelector('[data-act="ch-cs-' + UNL + '"]');
      const on = !!(c && c[TGL]);
      if (onEl) onEl.textContent = !a ? "引擎未加载" : (on ? "已开启" : "关闭");
      if (onBtn && a) onBtn.textContent = on ? "关闭成就伪装" : "开启成就伪装";
      if (unEl) unEl.textContent = !a ? "引擎未加载" : ((c && c[UNL]) ? "已开启" : "关闭");
      if (unBtn && a) unBtn.textContent = (c && c[UNL]) ? "关闭全部解锁" : "开启全部解锁";
      if (levelSel && c && c[LEVEL] != null) levelSel.value = String(c[LEVEL]);
      paintOptions(a);
    };

    [TGL, UNL].forEach((key) => {
      const btn = body.querySelector('[data-act="ch-cs-' + key + '"]');
      if (!btn) return;
      btn.addEventListener("click", () => {
        const a = api();
        if (!a) { say("引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
        const next = !a.getCfg()[key];
        try { a.setCfg({ [key]: next }); }
        catch (e) { say("写入失败：" + String((e && e.message) || e)); return; }
        mark();
        diag("challenge-panel-toggle", { key: key, on: next });
      });
    });

    if (levelSel) {
      levelSel.addEventListener("change", () => {
        const a = api();
        if (!a) { say("引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
        try { a.setCfg({ [LEVEL]: levelSel.value }); }
        catch (e) { say("写入失败：" + String((e && e.message) || e)); return; }
        mark();
        diag("challenge-panel-level", { level: levelSel.value });
      });
    }

    mark();
    let tries = 0;
    const t = setInterval(() => {
      if (!levelSel || levelSel.isConnected === false) { clearInterval(t); return; }
      if (api() || ++tries > 25) { clearInterval(t); mark(); say(DEFAULT_HINT); return; }
      mark();
    }, 800);
  }

  function renderEngineSection(body) {
    const statusEl = body.querySelector('[data-el="eng-status"]');
    const delayHint = body.querySelector('[data-el="eng-delayhint"]');
    const say = (t) => { if (statusEl) statusEl.textContent = t; };
    const api = () => (window.__PRISM_ENGINE && typeof window.__PRISM_ENGINE.setCfg === "function")
      ? window.__PRISM_ENGINE : null;

    const KEYS = ["autoAccept", "allowDeclineAfterAccept", "autoHonor", "autoReturnToLobby",
      "autoLockChampion", "autoBanChampion",
      "hideTFT", "hideRightNavText", "hideEsportsPopup"];
    const SEL_KEYS = ["autoReturnMode", "autoLockMode"];
    const LABELS = {
      autoAccept: "自动接受对局",
      allowDeclineAfterAccept: "接受后可拒绝",
      autoHonor: "结束自动点赞",
      autoReturnToLobby: "结束自动返回",
      autoLockChampion: "秒抢英雄",
      autoBanChampion: "自动 Ban",
      hideTFT: "隐藏首页云顶",
      hideRightNavText: "隐藏右侧导航文字",
      hideEsportsPopup: "关闭赛事弹窗",
    };
    const TARGET_KEYS = [
      { input: "eng-lockids", cfg: "autoLockChampionIds", hint: "eng-lockhint", act: "eng-lockids" },
      { input: "eng-banids", cfg: "autoBanChampionIds", hint: "eng-banhint", act: "eng-banids" },
    ];


    let targetsPainted = false;
    const paintTargets = (a, cfgNow) => {
      if (targetsPainted || !cfgNow || typeof a.championNames !== "function") return;
      targetsPainted = true;
      TARGET_KEYS.forEach((T) => {
        const el = body.querySelector('[data-el="' + T.input + '"]');
        if (!el) return;
        const ids = cfgNow[T.cfg] || [];
        if (!ids.length) { el.value = ""; return; }
        a.championNames(ids).then((names) => {
          if (el.isConnected === false) { targetsPainted = false; return; }
          el.value = names.join(", ");
        }).catch(() => {  });
      });
    };

    const mark = () => {
      const a = api();
      const st = a ? a.status() : null;
      let cfgNow = null;
      if (a) { try { cfgNow = a.getCfg(); } catch (e) { cfgNow = null; } }
      KEYS.forEach((k) => {
        const el = body.querySelector('[data-el="eng-' + k + '"]');
        const btn = body.querySelector('[data-act="eng-' + k + '"]');
        const on = !!(cfgNow && cfgNow[k]);
        if (el) el.textContent = !a ? "引擎未加载" : (on ? "已开启" : "关闭");
        if (btn && a) btn.textContent = on ? ("关闭" + LABELS[k]) : ("开启" + LABELS[k]);
      });
      SEL_KEYS.forEach((k) => {
        const el = body.querySelector('[data-el="eng-' + k + '"]');
        if (el && cfgNow && cfgNow[k] != null) el.value = String(cfgNow[k]);
      });
      const minEl = body.querySelector('[data-el="eng-min"]');
      const maxEl = body.querySelector('[data-el="eng-max"]');
      if (cfgNow && minEl && !minEl.value) minEl.value = String(cfgNow.autoAcceptDelayMin);
      if (cfgNow && maxEl && !maxEl.value) maxEl.value = String(cfgNow.autoAcceptDelayMax);
      if (a) { paintTargets(a, cfgNow); }
    };

    KEYS.forEach((k) => {
      const btn = body.querySelector('[data-act="eng-' + k + '"]');
      if (!btn) return;
      btn.addEventListener("click", () => {
        const a = api();
        if (!a) { say("引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
        const next = !a.getCfg()[k];
        try { a.setCfg({ [k]: next }); } catch (e) { say("写入失败：" + String((e && e.message) || e)); return; }
        mark();
        diag("engine-toggle", { key: k, on: next });
      });
    });

    SEL_KEYS.forEach((k) => {
      const el = body.querySelector('[data-el="eng-' + k + '"]');
      if (!el) return;
      el.addEventListener("change", () => {
        const a = api();
        if (!a) { say("引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
        try { a.setCfg({ [k]: el.value }); }
        catch (e) { say("写入失败：" + String((e && e.message) || e)); return; }
        mark();
        diag("engine-select", { key: k, value: el.value });
      });
    });

    const dbtn = body.querySelector('[data-act="eng-delay"]');
    if (dbtn) {
      dbtn.addEventListener("click", () => {
        const a = api();
        if (!a) { if (delayHint) delayHint.textContent = "引擎还在加载，稍后再试。"; return; }
        const minEl = body.querySelector('[data-el="eng-min"]');
        const maxEl = body.querySelector('[data-el="eng-max"]');
        const min = parseInt((minEl && minEl.value) || "", 10);
        const max = parseInt((maxEl && maxEl.value) || "", 10);
        if (!isFinite(min) || !isFinite(max) || min < 0 || max < min || max > 15000) {
          if (delayHint) delayHint.textContent = "要满足 0 ≤ 最小 ≤ 最大 ≤ 15000";
          return;
        }
        try { a.setCfg({ autoAcceptDelayMin: min, autoAcceptDelayMax: max }); }
        catch (e) { if (delayHint) delayHint.textContent = "写入失败：" + String((e && e.message) || e); return; }
        if (delayHint) delayHint.textContent = "已保存：" + min + " ~ " + max + " ms";
        diag("engine-delay", { min: min, max: max });
      });
    }

    TARGET_KEYS.forEach((T) => {
      const btn = body.querySelector('[data-act="' + T.act + '"]');
      const input = body.querySelector('[data-el="' + T.input + '"]');
      const hint = body.querySelector('[data-el="' + T.hint + '"]');
      if (!btn || !input) return;
      btn.addEventListener("click", () => {
        const a = api();
        if (!a) { if (hint) hint.textContent = "引擎还在加载，稍后再试。"; return; }
        if (typeof a.resolveChampions !== "function") {
          if (hint) hint.textContent = "引擎版本偏旧（缺 resolveChampions），重载插件后再试。";
          return;
        }
        btn.disabled = true;
        a.resolveChampions(input.value).then((r) => {
          a.setCfg({ [T.cfg]: r.ids });
          if (hint) {
            if (r.ids.length === 0) hint.textContent = "已清空：没解析出任何英雄。";
            else if (r.unresolved && r.unresolved.length) {
              hint.textContent = "已保存 " + r.names.join("、") + "；认不出：" + r.unresolved.join("、");
            } else hint.textContent = "已保存 " + r.names.join("、");
          }
        }).catch((e) => {
          if (hint) hint.textContent = "解析失败：" + String((e && e.message) || e);
        }).then(() => { btn.disabled = false; });
      });
    });

    mark();
    let tries = 0;
    const t = setInterval(() => {
      if (!statusEl || statusEl.isConnected === false) { clearInterval(t); return; }
      if (api() || ++tries > 25) { clearInterval(t); mark(); return; }
      mark();
    }, 800);
  }

  const QUIET_KEY = SETTINGS_KEY + ".quiet";
  const QUIET_TEXTS = [
    "已激活", "已啟用", "Pengu Loader activated",
    "Sona 已启动", "Sona 已啟動", "Sona is running",
  ];
  let quietObserver = null;   
  let quietSr = null;         
  let quietArmed = false;     
  let quietSearched = 0;      

  const QUIET_STYLE_ID = "prism-quiet-static";
  const QUIET_STATIC_MS = 30000;
  let quietStyleTimer = null;
  const quietHandled = new Set();
  let quietRootWatch = null;      
  let quietRootWatchTimer = null;
  let shadowHookOn = false;       

  function quietRoot() {
    const host = document.getElementById("pengu-root");
    return host && host.shadowRoot ? host.shadowRoot : null;
  }

  const QUIET_STATIC_CSS =
    '.sldt-active:not([style*="flex-end"]):not([style*="center"]){display:none !important;}';

  function quietStaticEl(sr) {
    if (!sr) return null;
    try { return sr.querySelector("#" + QUIET_STYLE_ID); } catch (e) { return null; }
  }

  function injectQuietStatic(sr) {
    if (!sr) return false;
    const exist = quietStaticEl(sr);
    if (!state.ui.quiet) {
      if (exist) { try { exist.remove(); } catch (e) {  } }
      quietHandled.delete(sr);
      return false;
    }
    if (quietHandled.has(sr)) return !!exist;
    if (quietHandled.size > 4) {
      const dead = [];
      quietHandled.forEach((r) => {
        try { if (!r.host || !r.host.isConnected) dead.push(r); } catch (e) { dead.push(r); }
      });
      dead.forEach((r) => quietHandled.delete(r));
    }
    quietHandled.add(sr);
    if (!exist) {
      try {
        const st = document.createElement("style");
        st.id = QUIET_STYLE_ID;
        st.setAttribute("data-prism", "1");
        st.textContent = QUIET_STATIC_CSS;
        sr.appendChild(st);
        diag("quiet-start-static-injected", { css: QUIET_STATIC_CSS });
      } catch (e) {
        diag("quiet-start-static-error", { msg: String(e) });
        quietHandled.delete(sr);
        return false;
      }
      if (quietStyleTimer) clearTimeout(quietStyleTimer);
      quietStyleTimer = setTimeout(() => {
        expireQuietStatic();
        quietStyleTimer = null;
        diag("quiet-start-static-expired", { afterMs: QUIET_STATIC_MS });
      }, QUIET_STATIC_MS);
    }
    return true;
  }

  function expireQuietStatic() {
    quietHandled.forEach((sr) => {
      const x = quietStaticEl(sr);
      if (x) { try { x.remove(); } catch (e) {  } }
    });
  }

  function removeQuietStatic() {
    if (quietStyleTimer) { clearTimeout(quietStyleTimer); quietStyleTimer = null; }
    const list = [];
    quietHandled.forEach((sr) => list.push(sr));
    quietHandled.clear();      
    const r0 = quietRoot();
    if (r0 && list.indexOf(r0) < 0) list.push(r0);
    list.forEach((sr) => {
      const x = quietStaticEl(sr);
      if (x) { try { x.remove(); } catch (e) {  } }
    });
  }

  function installShadowHook() {
    if (shadowHookOn) return true;
    try {
      const proto = window.Element && Element.prototype;
      if (!proto || typeof proto.attachShadow !== "function") return false;
      if (proto.attachShadow.__prismQuietHooked) { shadowHookOn = true; return true; }
      const orig = proto.attachShadow;
      const patched = function () {
        const sr = orig.apply(this, arguments);
        try {
          const host = this;
          if (sr && state.ui.quiet && host && host.id === "pengu-root") {
            injectQuietStatic(sr);
          }
        } catch (e) {  }
        return sr;
      };
      patched.__prismQuietHooked = true;
      patched.__prismOrig = orig;
      proto.attachShadow = patched;
      shadowHookOn = true;
      diag("quiet-start-shadow-hooked", null);
    } catch (e) {
      diag("quiet-start-shadow-hook-error", { msg: String(e) });
      return false;
    }
    return true;
  }

  function uninstallShadowHook() {
    if (!shadowHookOn) return;
    try {
      const proto = window.Element && Element.prototype;
      const cur = proto && proto.attachShadow;
      if (cur && cur.__prismOrig) proto.attachShadow = cur.__prismOrig;
    } catch (e) {  }
    shadowHookOn = false;
    diag("quiet-start-shadow-unhooked", null);
  }

  let toastHooked = false;
  let toastBacking = null;        
  let toastViaAccessor = false;   
  let toastOrigValue = null;      
  let toastBlocked = 0;           

  function toastHitText(txt) {
    const t = String(txt == null ? "" : txt);
    for (let i = 0; i < QUIET_TEXTS.length; i++) if (t.indexOf(QUIET_TEXTS[i]) >= 0) return QUIET_TEXTS[i];
    return null;
  }

  function wrapToastValue(orig) {
    if (!orig || typeof orig !== "object") return orig;
    if (orig.__hmQuietWrapped) return orig;
    const mk = (fn, name) => {
      if (typeof fn !== "function") return fn;
      const w = function () {
        const args = Array.prototype.slice.call(arguments);
        const hit = state.ui.quiet ? toastHitText(args[0]) : null;
        if (hit) {
          toastBlocked++;
          diag("quiet-start-api-block", { via: name, match: hit, txt: String(args[0]).slice(0, 40) });
          return name === "promise" ? Promise.resolve() : undefined;
        }
        return fn.apply(this, args);
      };
      w.__hmOrig = fn;
      return w;
    };
    const out = {
      success: mk(orig.success, "success"),
      error: mk(orig.error, "error"),
      promise: mk(orig.promise, "promise"),
    };
    out.__hmQuietWrapped = true;
    out.__hmOrigObj = orig;
    return out;
  }

  function installToastHook() {
    if (toastHooked) return true;
    try {
      if ("Toast" in window && window.Toast) {
        toastOrigValue = window.Toast;
        window.Toast = wrapToastValue(window.Toast);
        toastHooked = !!(window.Toast && window.Toast.__hmQuietWrapped);
        if (toastHooked) diag("quiet-start-api-hooked", { mode: "direct" });
      } else {
        Object.defineProperty(window, "Toast", {
          configurable: true,
          enumerable: true,
          get() { return toastBacking; },
          set(v) {
            toastBacking = v ? wrapToastValue(v) : v;
            diag("quiet-start-api-hooked", {
              mode: "accessor",
              wrapped: !!(toastBacking && toastBacking.__hmQuietWrapped),
            });
          },
        });
        toastViaAccessor = true;
        toastHooked = true;
        diag("quiet-start-api-armed-accessor", null);
      }
    } catch (e) {
      diag("quiet-start-api-hook-error", { msg: String(e) });
      return false;
    }
    return toastHooked;
  }

  function uninstallToastHook() {
    if (!toastHooked) return;
    try {
      if (toastViaAccessor) {
        const keep = (toastBacking && toastBacking.__hmOrigObj) ? toastBacking.__hmOrigObj : toastBacking;
        Object.defineProperty(window, "Toast", {
          configurable: true, enumerable: true, writable: true,
          value: keep === undefined ? toastOrigValue : keep,
        });
      } else if (toastOrigValue) {
        window.Toast = toastOrigValue;
      }
    } catch (e) {  }
    toastHooked = false;
    toastViaAccessor = false;
    toastBacking = null;
    diag("quiet-start-api-unhooked", { blockedTotal: toastBlocked });
  }

  function watchQuietRoot() {
    if (quietRootWatch) return;
    const sr0 = quietRoot();
    if (sr0) { injectQuietStatic(sr0); return; }
    try {
      quietRootWatch = new MutationObserver(() => {
        const sr = quietRoot();
        if (!sr) return;
        injectQuietStatic(sr);          
        unwatchQuietRoot();
        diag("quiet-start-static-early", { at: Date.now() });
      });
      quietRootWatch.observe(document.documentElement || document, { childList: true, subtree: true });
      quietRootWatchTimer = setTimeout(() => {
        unwatchQuietRoot();
        diag("quiet-start-rootwatch-timeout", null);
      }, 20000);
    } catch (e) {
      quietRootWatch = null;
      diag("quiet-start-rootwatch-error", { msg: String(e) });
    }
  }

  function unwatchQuietRoot() {
    if (quietRootWatch) { try { quietRootWatch.disconnect(); } catch (e) {  } quietRootWatch = null; }
    if (quietRootWatchTimer) { clearTimeout(quietRootWatchTimer); quietRootWatchTimer = null; }
  }

  function scrubQuietToasts(sr) {
    if (!sr || !state.ui.quiet) return 0;
    let stacks = null;
    try { stacks = sr.querySelectorAll(".sldt-active"); } catch (e) { return 0; }
    let hit = 0;
    Array.prototype.forEach.call(stacks, (st) => {
      const t = String(st.textContent || "");
      for (let i = 0; i < QUIET_TEXTS.length; i++) {
        if (t.indexOf(QUIET_TEXTS[i]) >= 0) {
          const fresh = !st.hasAttribute("data-prism-quiet");
          const r0 = fresh ? rectOf(st) : null;
          const dispBefore = fresh
            ? (function () { try { return getComputedStyle(st).display; } catch (e) { return null; } })()
            : null;
          st.style.setProperty("display", "none", "important");
          st.setAttribute("data-prism-quiet", "1");   
          if (fresh) {
            diag("quiet-start-hid", {
              match: QUIET_TEXTS[i],
              txt: t.replace(/\s+/g, " ").trim().slice(0, 40),
              rectBefore: r0,          
              dispBefore: dispBefore,  
              staticOn: !!quietStaticEl(sr),   
              hits: hit + 1,           
              disp: (function () { try { return getComputedStyle(st).display; } catch (e) { return null; } })(),
              vis: (function () { try { return getComputedStyle(st).visibility; } catch (e) { return null; } })(),
            });
            witnessNoPaint(st, QUIET_TEXTS[i], r0);
          }
          hit++;
          break;
        }
      }
    });
    return hit;
  }

  function witnessNoPaint(st, match, r0) {
    if (typeof requestAnimationFrame !== "function") return;
    const seq = [];
    const take = () => { try { seq.push(rectOf(st)); } catch (e) { seq.push(null); } };
    try {
      requestAnimationFrame(() => {
        try {
          take();
          requestAnimationFrame(() => {
            take();
            const bad = seq.some((r) => r && (r.w > 0 || r.h > 0));
            diag("quiet-start-paint-witness", {
              match: match,
              rectObserve: r0,
              rectFrame1: seq[0] || null,
              rectFrame2: seq[1] || null,
              painted: bad,          
              verdict: bad ? "LEAKED(有帧画上去了)" : "NO-PAINT(首帧前已无盒子)",
            });
          });
        } catch (e) {  }
      });
    } catch (e) {  }
  }

  function unhideQuietToasts(sr) {
    if (!sr) return 0;
    let els = null;
    try { els = sr.querySelectorAll("[data-prism-quiet]"); } catch (e) { return 0; }
    Array.prototype.forEach.call(els, (st) => {
      try { st.style.removeProperty("display"); } catch (e) { st.style.display = ""; }
      st.removeAttribute("data-prism-quiet");
    });
    return els.length;
  }

  function armQuietStart() {
    if (!state.ui.quiet) return;
    installToastHook();
    installShadowHook();          
    const sr = quietRoot();
    if (!sr) {
      watchQuietRoot();                                  
      if (quietSearched++ < 60) setTimeout(armQuietStart, 250);   
      return;
    }
    quietSearched = 0;
    injectQuietStatic(sr);        
    const hid = scrubQuietToasts(sr);
    if (quietSr === sr && quietObserver) return;      
    if (quietObserver) { try { quietObserver.disconnect(); } catch (e) {  } }
    quietSr = sr;
    try {
      quietObserver = new MutationObserver(() => { try { scrubQuietToasts(sr); } catch (e) {  } });
      quietObserver.observe(sr, { childList: true, subtree: true });
      quietArmed = true;
      diag("quiet-start-armed", {
        stacks: sr.querySelectorAll(".sldt-active").length,
        hid: hid,
        staticOn: !!quietStaticEl(sr),
      });
    } catch (e) {
      quietObserver = null;
      diag("quiet-start-arm-error", { msg: String(e) });
    }
  }

  function disarmQuietStart() {
    if (quietObserver) { try { quietObserver.disconnect(); } catch (e) {  } }
    quietObserver = null;
    quietSr = null;
    quietArmed = false;
    quietSearched = 0;
    unwatchQuietRoot();
    uninstallShadowHook();        
    removeQuietStatic();          
    uninstallToastHook();         
    const back = unhideQuietToasts(quietRoot());
    diag("quiet-start-disarmed", { restored: back });
  }

  function saveQuietStartPick() {
    const t = JSON.stringify({ hide: !!state.ui.quiet });
    try { if (window.DataStore) window.DataStore.set(QUIET_KEY, t); } catch (e) {  }
    try { localStorage.setItem(QUIET_KEY, t); } catch (e) {  }
  }

  function loadQuietStartPick() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(QUIET_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(QUIET_KEY); } catch (e) {  } }
    if (!raw) return;   
    try {
      const o = JSON.parse(raw);
      if (o && typeof o.hide === "boolean") state.ui.quiet = o.hide;
    } catch (e) {  }
  }

  const SLIM_KEY = SETTINGS_KEY + ".slim";
  const SLIM_STYLE_ID = "prism-slim";
  const SLIM_CSS = [
    'lol-uikit-navigation-item[class*="menu_item_Golden"]{display:none !important;}',
    '.lol-social-actions-bar .buttons .action-bar-button:has(.party-mode-icon){display:none !important;}',
  ].join("\n");

  function slimStyleEl() {
    return document.getElementById(SLIM_STYLE_ID);
  }

  function applySlimCSS() {
    let el = slimStyleEl();
    if (!state.ui.slim) {
      if (el) { try { el.remove(); } catch (e) {  } }
      return false;
    }
    if (el) return true;                       
    try {
      el = document.createElement("style");
      el.id = SLIM_STYLE_ID;
      el.textContent = SLIM_CSS;
      document.head.appendChild(el);
    } catch (e) { return false; }
    return true;
  }

  function saveSlimPick() {
    const t = JSON.stringify({ hide: !!state.ui.slim });
    try { if (window.DataStore) window.DataStore.set(SLIM_KEY, t); } catch (e) {  }
    try { localStorage.setItem(SLIM_KEY, t); } catch (e) {  }
  }

  function loadSlimPick() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(SLIM_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(SLIM_KEY); } catch (e) {  } }
    if (!raw) return;   
    try {
      const o = JSON.parse(raw);
      if (o && typeof o.hide === "boolean") state.ui.slim = o.hide;
    } catch (e) {  }
  }

  let slimProbeAt = 0;
  function probeSlim(force) {
    const now = Date.now();
    if (!force && now - slimProbeAt < 60000) return;
    slimProbeAt = now;
    const pick = (sel) => {
      let el = null;
      try { el = document.querySelector(sel); } catch (e) { return null; }
      if (!el) return null;
      let vis = "";
      try { vis = getComputedStyle(el).display; } catch (e) {  }
      return { found: true, display: vis };
    };
    diag("slim-probe", {
      on: !!state.ui.slim,
      styleInjected: !!slimStyleEl(),
    });
  }



  function renderSelfNameSection(body) {
    const wrap = body.querySelector('[data-el="sfn-wrap"]');
    if (!wrap) return;

    wrap.innerHTML = `
      <div class="${NS}-setrow">
        <span class="${NS}-setlabel">启用改名</span>
        <span class="${NS}-setpv" data-el="sfn-state">读取中…</span>
        <button class="${NS}-ghost" data-act="sfn-toggle">切换</button>
        <button class="${NS}-ghost" data-act="sfn-restore">恢复原名</button>
      </div>
      <div class="${NS}-setrow">
        <span class="${NS}-setlabel">名字（最多 16 字）</span>
        <input class="${NS}-setinput" data-el="sfn-name" maxlength="16"
               placeholder="留空 = 不改名，显示真实名字" />
        <span class="${NS}-setlabel">标签（最多 5 位）</span>
        <input class="${NS}-setinput ${NS}-sfntag" data-el="sfn-tag" maxlength="5"
               placeholder="留空 = 不改标签" />
      </div>
      <div class="${NS}-setrow">
        <span class="${NS}-sethint" data-el="sfn-hint"></span>
      </div>
    `;

    const hintEl = wrap.querySelector('[data-el="sfn-hint"]');
    const say = (t) => { if (hintEl) hintEl.textContent = t; };
    const stateEl = wrap.querySelector('[data-el="sfn-state"]');
    const nameInp = wrap.querySelector('[data-el="sfn-name"]');
    const tagInp = wrap.querySelector('[data-el="sfn-tag"]');
    const toggleBtn = wrap.querySelector('[data-act="sfn-toggle"]');
    const resetBtn = wrap.querySelector('[data-act="sfn-restore"]');

    const api = () => (window.__SELFNAME && typeof window.__SELFNAME.setCfg === "function")
      ? window.__SELFNAME : null;

    let cur = { enabled: false, gameName: "", tagLine: "" };
    let deb = null;

    const paint = () => {
      if (stateEl) stateEl.textContent = cur.enabled ? "已开启" : "关闭";
      if (toggleBtn) toggleBtn.textContent = cur.enabled ? "关闭" : "开启";
      if (nameInp && document.activeElement !== nameInp) nameInp.value = cur.gameName || "";
      if (tagInp && document.activeElement !== tagInp) tagInp.value = cur.tagLine || "";
      const a = api();
      const self = a && a.getSelf ? a.getSelf() : null;
      const real = self && self.ready ? self.name : "";
      if (cur.enabled) {
        say("本机显示 " + (cur.gameName || "?") + (cur.tagLine ? "#" + cur.tagLine : "") +
            (real ? "　·　真实 " + real : "") + "　（好友看到的仍是真实名字）");
      } else {
        say(real ? "关闭中 —— 显示真实名字 " + real : "关闭中 —— 显示真实名字");
      }
    };

    const syncFromApi = () => {
      const a = api();
      if (!a) return false;
      const c = a.getCfg();
      cur = { enabled: !!c.enabled, gameName: c.gameName || "", tagLine: c.tagLine || "" };
      paint();
      return true;
    };
    if (!window.__PRISM_SFN_HOOK) {
      window.__PRISM_SFN_HOOK = true;
      window.addEventListener("selfname-change", () => {
        const p = window.__PRISM_SFN_PAINT;
        if (typeof p === "function") { try { p(); } catch (e) {} }
      });
    }
    window.__PRISM_SFN_PAINT = syncFromApi;

    const push = (o, note) => {
      const a = api();
      if (!a) { say("改名引擎还在加载（插件自启，约一秒），稍后再试。"); return; }
      const wantOn = ("enabled" in o) ? !!o.enabled : cur.enabled;
      const c = a.setCfg(o);
      cur = { enabled: !!c.enabled, gameName: c.gameName || "", tagLine: c.tagLine || "" };
      paint();
      if (note) say(note);
      if (wantOn && !cur.enabled) say("没生效 —— 先在上面填一个名字（留空会被当成「不改名」）。");
    };

    if (nameInp) {
      nameInp.addEventListener("input", () => {
        clearTimeout(deb);
        deb = setTimeout(() => {
          const v = nameInp.value.trim();
          if (v && !cur.enabled) push({ gameName: v, enabled: true });
          else push({ gameName: v });
        }, 400);
      });
    }

    if (tagInp) {
      tagInp.addEventListener("input", () => {
        clearTimeout(deb);
        deb = setTimeout(() => {
          const v = tagInp.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 5);
          if (v !== tagInp.value) tagInp.value = v;
          push({ tagLine: v });
        }, 400);
      });
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        if (cur.enabled) { push({ enabled: false }, "已关闭 —— 名字恢复成真实值。"); return; }
        const n = nameInp ? nameInp.value.trim() : "";
        if (!n) { say("先在上面填一个名字，再点开启。"); return; }
        push({ gameName: n, tagLine: tagInp ? tagInp.value.trim() : "", enabled: true },
             "已开启 —— 顶栏 / 个人主页 / 好友列表里你自己那一行都会变（只影响你这台机器）。");
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        push({ enabled: false, gameName: "", tagLine: "" }, "已恢复：名字和标签都回到真实值。");
      });
    }

    if (!syncFromApi()) {
      say("改名引擎还在加载…");
      let tries = 0;
      const iv = setInterval(() => {
        if (syncFromApi() || ++tries > 20) clearInterval(iv);
      }, 250);
    }
  }


  function renderHonorSection(body) {
    const row = body.querySelector('[data-el="honorrow"]');
    const nowEl = body.querySelector('[data-el="hn-now"]');
    const hint = body.querySelector('[data-el="hn-hint"]');
    if (!row) return;
    const say = (t) => { if (hint) hint.textContent = t; };

    const realLevel = () => {
      const im = document.querySelector(".style-profile-honor-component .style-profile-honor-icon-v3")
              || document.querySelector(".style-profile-honor-component .style-profile-honor-icon");
      const src = im ? String(im.getAttribute("src") || "") : "";
      const m = src.match(/Emblem_Level_(\d)/i) || src.match(/emblem_(\d)/i);
      return m ? parseInt(m[1], 10) : null;
    };

    const mark = () => {
      const cur = state.honor.level;
      Array.prototype.forEach.call(row.querySelectorAll("[data-honor]"), (b) => {
        b.classList.toggle("on", String(cur) === b.getAttribute("data-honor"));
      });
      if (nowEl) {
        if (cur == null) {
          const r = realLevel();
          nowEl.textContent = r == null ? "真实值" : ("真实值（" + r + " 级）");
        } else {
          nowEl.textContent = cur + " 级（本机）";
        }
      }
    };

    let h = "";
    for (let n = 1; n <= HONOR_MAX; n++) {
      h += `<button class="${NS}-crest" data-honor="${n}" title="${n} 级荣誉（仅本机显示）">` +
           `<img src="${crestImg(n)}" data-fall="${esc(crestImgProxy(n, 96))}" ` +
           `alt="${n}" draggable="false"><span>${n}</span></button>`;
    }
    row.innerHTML = h;
    Array.prototype.forEach.call(row.querySelectorAll("img"), (im) => {
      im.addEventListener("error", () => {
        if (im.dataset.fellBack) return;
        im.dataset.fellBack = "1";
        const alt = im.getAttribute("data-fall") || "";
        if (alt) im.src = alt;
      }, { once: true });
    });

    row.addEventListener("click", (e) => {
      const btn = e.target.closest ? e.target.closest("[data-honor]") : null;
      if (!btn) return;
      const n = parseInt(btn.getAttribute("data-honor"), 10);
      state.honor.level = (state.honor.level === n) ? null : n;   
      applyHonorCSS();
      saveHonorPick();
      mark();
      say(state.honor.level == null
        ? "已恢复成你账号里的真实荣誉等级"
        : ("已把本机显示的荣誉等级改成 " + state.honor.level + " 级（只影响你自己这台机器）"));
      diag("honor-pick", { level: state.honor.level });
    });

    const rb = body.querySelector('[data-act="hn-reset"]');
    if (rb) {
      rb.addEventListener("click", () => {
        state.honor.level = null;
        applyHonorCSS();
        saveHonorPick();
        mark();
        say("已恢复成你账号里的真实荣誉等级");
      });
    }

    mark();
  }


  const MASTERY_MAX = 10;
  const MASTERY_KEY = SETTINGS_KEY + ".mastery";
  const MASTERY_DIR = "/fe/lol-shared-components/";

  function masteryImg(n) {
    return MASTERY_DIR + "mastery-" + n + ".png";
  }

  const BANNER_BY_LEVEL = { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 3 };

  const BANNER_TONE = { 0: "无", 1: "深棕", 2: "靛蓝", 3: "紫" };

  function bannerToneByFile(f) {
    const m = /mastery-banner-(\d)\.(?:svg|png)/.exec(String(f || ""));
    return m ? (BANNER_TONE[parseInt(m[1], 10)] || "?") : "?";
  }

  function bannerImg(level) {
    const lv = Math.max(0, Math.min(MASTERY_MAX, parseInt(level, 10) || 0));
    const k = BANNER_BY_LEVEL[lv];
    return MASTERY_DIR + "mastery-banner-" + k + (k === 0 ? ".png" : ".svg");
  }

  function buildMasteryCSS() {
    const n = state.mastery.level;
    const out = [];

    if (n) {
      const u = cssEscape(masteryImg(n));

      const sels = [".mastery-crest-component .mastery-crest-image"];
      for (let i = 1; i <= MASTERY_MAX; i++) {
        sels.push(`.mastery-crest-component .mastery-crest-image[data-mastery-level="${i}"]`);
      }
      sels.push("img.mastery-crest-image");

      out.push(sels.join(",") + `{content:url("${u}") !important;}`);

      if (state.mastery.flag !== 0) {
        const bu = cssEscape(bannerImg(n));
        out.push(
          ".style-profile-legendary-champion-mastery-icon-component .style-profile-banner-image," +
          "img.style-profile-banner-image," +
          ".style-profile-banner-image" +
          `{content:url("${bu}") !important;}`
        );
      }
    }

    return out.join("\n");
  }

  function applyMasteryCSS() {
    const css = buildMasteryCSS();
    if (!css) {
      const old = document.getElementById(NS + "-masteryflag");
      if (old) old.remove();
      return;
    }
    let el = document.getElementById(NS + "-masteryflag");
    if (!el) {
      el = document.createElement("style");
      el.id = NS + "-masteryflag";
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function saveMasteryPick() {
    const t = JSON.stringify({ level: state.mastery.level, flag: state.mastery.flag });
    try { if (window.DataStore) window.DataStore.set(MASTERY_KEY, t); } catch (e) {  }
    try { localStorage.setItem(MASTERY_KEY, t); } catch (e) {  }
  }

  function loadMasteryPick() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(MASTERY_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(MASTERY_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      const n = parseInt(o && o.level, 10);
      if (n >= 1 && n <= MASTERY_MAX) state.mastery.level = n;
      if (o && parseInt(o.flag, 10) === 0) state.mastery.flag = 0;
    } catch (e) {  }
  }

  let masteryProbeAt = 0;
  function probeMasteryOnProfile(force) {
    const now = Date.now();
    if (!force && now - masteryProbeAt < 60000) return;
    const n = state.mastery.level;
    const el = document.querySelector(".mastery-crest-component .mastery-crest-image");
    if (!el && !n) return;   
    if (!el) {
      diag("mastery-probe", { level: n, flag: state.mastery.flag, found: false });
      masteryProbeAt = now; return;
    }
    let content = "";
    try { content = String(getComputedStyle(el).content || ""); } catch (e) {  }
    const hit = content.indexOf("mastery-" + n + ".png") >= 0;

    const bEl = document.querySelector("img.style-profile-banner-image");
    let bSrc = "", bContent = "";
    if (bEl) {
      try { bSrc = String(bEl.getAttribute("src") || ""); } catch (e) {  }
      try { bContent = String(getComputedStyle(bEl).content || ""); } catch (e) {  }
    }
    const wantBanner = n ? bannerImg(n) : "";
    const bannerHit = n ? (bContent.indexOf("mastery-banner-") >= 0 &&
                          bContent.indexOf(wantBanner.replace(/^.*\//, "")) >= 0) : null;

    diag("mastery-probe", {
      level: n,
      flag: state.mastery.flag,
      found: true,
      domLevel: el.getAttribute("data-mastery-level"),
      content: content.slice(0, 160),
      want: masteryImg(n),
      count: document.querySelectorAll(".mastery-crest-component .mastery-crest-image").length,
      bannerPresent: !!bEl,
      bannerSrc: bSrc,
      bannerContent: bContent.slice(0, 160),
      bannerWant: wantBanner,
      bannerHit: bannerHit,
      verdict: hit ? "OK" : "MISMATCH",
    });
    masteryProbeAt = now;
  }


  function resetMasteryProbe() {
    masteryProbeAt = 0;
    probeMasteryOnProfile(true);
  }

  const PROFILE_KEY = SETTINGS_KEY + ".profilecustom";
  const CHAMP_ICON_DIR = "/lol-game-data/assets/v1/champion-icons/";

  function buildProfileCSS() {
    const p = state.profileCustom;
    const out = [];

    const n = String(p.score == null ? "" : p.score).trim();
    if (n && /^\d{1,7}$/.test(n)) {
      const SCORE_SELS = [
        ".style-profile-emblem-wrapper .style-profile-champion-mastery-score",
        ".hover-card-mastery-score",
      ];
      out.push(
        SCORE_SELS.join(",") + "{visibility:hidden !important;position:relative !important;}",
        SCORE_SELS.map((s) => s + "::after").join(",") + "{" +
          'content:"' + cssEscape(n) + '";' +
          'visibility:visible !important;' +
          'position:absolute !important;left:0;top:0;width:100%;height:100%;' +
          'display:flex;align-items:center;justify-content:center;}'
      );
    }

    const cid = parseInt(p.champId, 10);
    if (cid > 0) {
      out.push(
        '.style-profile-emblem-wrapper .style-profile-champion-icon-masked img' +
          '{content:url("' + cssEscape(CHAMP_ICON_DIR + cid + ".png") + '") !important;}'
      );
    }

    return out.join("\n");
  }

  function applyProfileCSS() {
    const css = buildProfileCSS();
    const old = document.getElementById(NS + "-profileflag");
    if (!css) { if (old) old.remove(); return; }
    let el = old;
    if (!el) {
      el = document.createElement("style");
      el.id = NS + "-profileflag";
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function saveProfileCustom() {
    const t = JSON.stringify({
      score: state.profileCustom.score,
      champId: state.profileCustom.champId,
    });
    try { if (window.DataStore) window.DataStore.set(PROFILE_KEY, t); } catch (e) {  }
    try { localStorage.setItem(PROFILE_KEY, t); } catch (e) {  }
  }

  function loadProfileCustom() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(PROFILE_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(PROFILE_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (o && o.score != null) state.profileCustom.score = String(o.score);
      const c = parseInt(o && o.champId, 10);
      if (c > 0) state.profileCustom.champId = c;
    } catch (e) {  }
  }

  let profileProbeAt = 0;
  function probeProfileOnProfile(force) {
    const now = Date.now();
    if (!force && now - profileProbeAt < 60000) return;
    const p = state.profileCustom;
    const scoreEl = document.querySelector(".style-profile-emblem-wrapper .style-profile-champion-mastery-score");
    const imgEl = document.querySelector(".style-profile-emblem-wrapper .style-profile-champion-icon-masked img");
    const hcEl = document.querySelector(".hover-card-mastery-score");
    if (!scoreEl && !imgEl && !hcEl) return;          
    profileProbeAt = now;
    let scoreVis = "", scoreAfter = "";
    try {
      if (scoreEl) {
        scoreVis = String(getComputedStyle(scoreEl).visibility || "");
        scoreAfter = String(getComputedStyle(scoreEl, "::after").content || "");
      }
    } catch (e) {  }
    let hcVis = "", hcAfter = "";
    try {
      if (hcEl) {
        hcVis = String(getComputedStyle(hcEl).visibility || "");
        hcAfter = String(getComputedStyle(hcEl, "::after").content || "");
      }
    } catch (e) {  }
    let imgContent = "";
    try { if (imgEl) imgContent = String(getComputedStyle(imgEl).content || ""); } catch (e) {  }
    diag("profile-probe", {
      wantScore: p.score || null,
      wantChamp: p.champId || null,
      scoreFound: !!scoreEl,
      scoreText: scoreEl ? String(scoreEl.textContent || "").trim() : null,
      scoreVisibility: scoreVis,
      scoreAfter: scoreAfter,
      scoreHit: !!(p.score && scoreAfter.indexOf(String(p.score)) >= 0),
      imgFound: !!imgEl,
      imgSrc: imgEl ? String(imgEl.getAttribute("src") || "") : null,
      imgContent: imgContent.replace(/https?:\/\/127\.0\.0\.1:\d+/g, ""),
      imgHit: !!(p.champId && imgContent.indexOf("/" + p.champId + ".png") >= 0),
      hcFound: !!hcEl,
      hcText: hcEl ? String(hcEl.textContent || "").trim() : null,
      hcVisibility: hcVis,
      hcAfter: hcAfter.replace(/^"|"$/g, ""),
      hcHit: !!(p.score && hcAfter.indexOf(String(p.score)) >= 0),
    });
  }

  const BORDER_KEY = SETTINGS_KEY + ".regaliaborder";
  const BORDER_HOSTS = [
    "lol-regalia-hovercard-v2-element",
    ".hover-card",
    "lol-regalia-identity-customizer-element",
    ".regalia-identity-customizer-crest-element",
    ".style-profile-summoner-info-component",
    ".lobby-player.local-player",
    ".v2-banner-component.local-player",
    ".local-player [prestige-crest-id]",
    ".local-player [crest-type]",
    ".player-card.local-player",
    ".summoner-profile.local-player",
  ];
  const BORDER_INNER = [
    "lol-regalia-crest-v2-element",
    "lol-regalia-emblem-element",
    ".regalia-emblem",
    "[prestige-crest-id]",
    "[crest-type]",
    "[ranked-tier]",
  ];
  const REGALIA_BORDERS = [].concat(
    Array.from({ length: 21 }, (_, i) => i + 1).map((n) => ({
      id: String(n),
      crestType: "prestige",
      rankedTier: "",
      previewPath: "/fe/lol-static-assets/images/uikit/themed-borders/theme-" + n + "-border.png",
    })),
    [["23", "iron"], ["25", "bronze"], ["26", "silver"], ["27", "gold"], ["28", "platinum"],
     ["29", "emerald"], ["30", "diamond"], ["31", "master"], ["32", "grandmaster"], ["33", "challenger"]]
      .map(([id, tier]) => ({
        id, crestType: "ranked", rankedTier: tier,
        previewPath: "/fe/lol-shared-components/" + tier + ".png",
      }))
  );
  const HIGH_TIERS = ["MASTER", "GRANDMASTER", "CHALLENGER"];
  const BORDER_EMBLEM_CSS =
    [":host .regalia-emblem-container .regalia-emblem[ranked-tier=\"unranked\"]"]
      .concat(["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond",
               "master", "grandmaster", "challenger"]
        .map((t) => ":host .regalia-emblem-container .regalia-emblem[ranked-tier=\"" + t + "\"]"))
      .join(",") + "{background-image:var(--current-border);}";

  const borderOrigAttrs = new WeakMap();   

  function borderUniqueId(b) {
    return b.rankedTier ? (b.id + "-" + b.rankedTier) : b.id;
  }
  function borderFind(uid) {
    if (!uid) return null;
    for (let i = 0; i < REGALIA_BORDERS.length; i++) {
      if (borderUniqueId(REGALIA_BORDERS[i]) === String(uid)) return REGALIA_BORDERS[i];
    }
    return null;
  }

  function findCrestElements() {
    const out = [];
    const push = (el) => { if (el && out.indexOf(el) < 0) out.push(el); };
    const scan = (root) => {
      BORDER_INNER.forEach((sel) => {
        let list = null;
        try { list = root.querySelectorAll(sel); } catch (e) { return; }
        Array.prototype.forEach.call(list, push);
      });
      let all = null;
      try { all = root.querySelectorAll("*"); } catch (e) { return; }
      Array.prototype.forEach.call(all, (el) => { if (el.shadowRoot) scan(el.shadowRoot); });
    };
    BORDER_HOSTS.forEach((host) => {
      let cs = null;
      try { cs = document.querySelectorAll(host); } catch (e) { return; }
      Array.prototype.forEach.call(cs, (el) => {
        scan(el);
        if (el.shadowRoot) scan(el.shadowRoot);
      });
    });
    return out;
  }

  function saveBorderOrig(el) {
    if (borderOrigAttrs.has(el)) return;
    borderOrigAttrs.set(el, {
      "prestige-crest-id": el.getAttribute("prestige-crest-id"),
      "crest-type": el.getAttribute("crest-type"),
      "ranked-tier": el.getAttribute("ranked-tier"),
      "ranked-division": el.getAttribute("ranked-division"),
    });
  }
  function restoreBorderOrig(el) {
    const o = borderOrigAttrs.get(el);
    if (!o) return;
    Object.keys(o).forEach((k) => {
      try {
        if (o[k] === null) { if (el.hasAttribute(k)) el.removeAttribute(k); }
        else if (el.getAttribute(k) !== o[k]) el.setAttribute(k, o[k]);
      } catch (e) {  }
    });
  }

  function freezeCrestProps(el, props) {
    if (!el) return;
    props.forEach((type) => {
      const cur = el[type];
      try {
        Object.defineProperty(el, type, {
          configurable: false,
          get: () => cur,
          set: () => {},     
        });
      } catch (e) {  }
    });
  }

  function applyBorderToEl(el, b) {
    try {
      saveBorderOrig(el);
      const setIf = (k, v) => {
        try { if (el.getAttribute(k) !== v) el.setAttribute(k, v); } catch (e) {  }
      };
      const delIf = (k) => {
        try { if (el.hasAttribute(k)) el.removeAttribute(k); } catch (e) {  }
      };
      if (b.crestType === "prestige") {
        setIf("prestige-crest-id", b.id);
        setIf("crest-type", "prestige");
        if (el.hasAttribute("ranked-tier")) setIf("ranked-tier", "");
        const o = borderOrigAttrs.get(el);
        if (o && o["ranked-division"] !== null) setIf("ranked-division", o["ranked-division"]);
        else delIf("ranked-division");
      } else {
        setIf("prestige-crest-id", b.id);
        setIf("crest-type", "ranked");
        if (b.rankedTier) {
          const T = b.rankedTier.toUpperCase();
          setIf("ranked-tier", T);
          if (HIGH_TIERS.indexOf(T) >= 0) {
            setIf("ranked-division", " ");   
          } else {
            const o = borderOrigAttrs.get(el);
            if (o && o["ranked-division"] !== null) setIf("ranked-division", o["ranked-division"]);
          }
        }
      }
    } catch (e) {  }
  }

  function applyBorderCss(b) {
    const on = !!(b && b.crestType === "ranked" && b.previewPath);
    if (on) {
      try {
        document.documentElement.style.setProperty("--current-border", 'url("' + b.previewPath + '")');
      } catch (e) {  }
      let st = document.getElementById(NS + "-border-emblems");
      if (!st) {
        st = document.createElement("style");
        st.id = NS + "-border-emblems";
        st.setAttribute("data-prism", "1");
        document.head.appendChild(st);
      }
      st.textContent = BORDER_EMBLEM_CSS;
    } else {
      try { document.documentElement.style.removeProperty("--current-border"); } catch (e) {  }
      const st = document.getElementById(NS + "-border-emblems");
      if (st) st.remove();
    }
    let embs = null;
    try { embs = document.querySelectorAll("lol-regalia-emblem-element"); } catch (e) { return; }
    Array.prototype.forEach.call(embs, (el) => {
      if (!el.shadowRoot) return;
      const id = NS + "-border-emblem";
      const ex = el.shadowRoot.getElementById(id);
      if (on) {
        const s2 = ex || (() => {
          const n = document.createElement("style");
          n.id = id;
          el.shadowRoot.appendChild(n);
          return n;
        })();
        s2.textContent = BORDER_EMBLEM_CSS;
      } else if (ex) ex.remove();
    });
  }

  let borderObserver = null;

  const BORDER_TRIP_N = 30;
  let borderApplyQueued = false, borderApplying = false;
  let borderRevAt = 0, borderRevWin = 0, borderDisarmedUntil = 0, borderTripN = 0;

  function borderArmed() { return Date.now() >= borderDisarmedUntil; }

  function requestApplyBorder() {
    if (!borderArmed()) return;
    if (borderApplying || borderApplyQueued) return;
    borderApplyQueued = true;
    const run = () => {
      borderApplyQueued = false;
      borderApplying = true;
      try { applyRegaliaBorder(); } catch (e) {  } finally { borderApplying = false; }
    };
    try { requestAnimationFrame(run); } catch (e) { setTimeout(run, 16); }
  }

  function borderDisarm() {
    borderDisarmedUntil = Date.now() + 10 * 60 * 1000;
    borderTripN++;
    try {
      shadowObservers.forEach((o) => { try { o.disconnect(); } catch (e) {  } });
    } catch (e) {  }
    try { shadowObservers.length = 0; } catch (e) {  }
    try { if (borderObserver) { borderObserver.disconnect(); borderObserver = null; } } catch (e) {  }
    try { diag("border-runaway-block", { win: borderRevWin, trips: borderTripN, muteMs: 600000 }); } catch (e) {  }
  }
  function borderNodeHit(n) {
    if (!n || n.nodeType !== 1) return false;
    const tag = String(n.tagName || "").toLowerCase();
    const cls = String(n.className || "");
    if (tag.indexOf("regalia") >= 0 || tag.indexOf("crest") >= 0) return true;
    if (/crest|hovercard|hover-card/i.test(cls)) return true;
    if (/identity-customizer/i.test(cls)) return true;
    try {
      if (n.querySelector && (
        n.querySelector("lol-regalia-crest-v2-element") ||
        n.querySelector("lol-regalia-hovercard-v2-element") ||
        n.querySelector(".hover-card") ||
        n.querySelector("[prestige-crest-id]") ||
        n.querySelector("[crest-type]")
      )) return true;
    } catch (e) {  }
    return false;
  }
  function armBorderObserver() {
    if (!borderArmed()) return;
    if (borderObserver || !document.body) return;
    borderObserver = new MutationObserver((muts) => {
      let hitCrest = false, hitIdent = false;
      const crestNodes = [];        
      const scanNodes = (nodes) => {
        for (let j = 0; j < nodes.length; j++) {
          const n = nodes[j];
          if (!borderNodeHit(n)) continue;
          hitCrest = true;
          if (crestNodes.length < 6) crestNodes.push(n);
          try {
            if (/identity-customizer/i.test(String(n.className || ""))) hitIdent = true;
            if (!hitIdent && n.querySelector && n.querySelector(IDENT_GRID_SEL)) hitIdent = true;
          } catch (e) {  }
        }
      };
      for (let i = 0; i < muts.length; i++) {
        scanNodes(muts[i].addedNodes);
        scanNodes(muts[i].removedNodes);
      }
      if (hitIdent) {
        applyIdentityBorders();
        unlockTitleTab();
        try { dumpIdentTabs(); } catch (e) {  }
      }
      if (hitCrest) {
        requestApplyBorder();
        for (let i = 0; i < crestNodes.length; i++) {
          try { armRootsIn(crestNodes[i]); } catch (e) {  }
        }
        try { applySummonerIcon(true); } catch (e) {  }
      }
    });
    try {
      borderObserver.observe(document.body, { childList: true, subtree: true });
    } catch (e) { borderObserver = null; }
  }

  const shadowObserved = new WeakSet();
  const shadowObservers = [];
  const SHADOW_HOST_SELECTORS = [
    "lol-regalia-hovercard-v2-element",
    "lol-regalia-identity-customizer-element",
    "lol-regalia-crest-v2-element",
  ];
  function armShadowObservers() {
    if (!borderArmed()) return;
    SHADOW_HOST_SELECTORS.forEach((sel) => {
      let hosts = null;
      try { hosts = document.querySelectorAll(sel); } catch (e) { return; }
      Array.prototype.forEach.call(hosts, (h) => {
        if (!h.shadowRoot || shadowObserved.has(h)) return;
        shadowObserved.add(h);
        try {
          const ob = new MutationObserver(() => {
            if (state.regaliaBorder.uniqueId) requestApplyBorder();
          });
          ob.observe(h.shadowRoot, {
            childList: true, subtree: true,
            attributes: true,
            attributeFilter: ["crest-type", "prestige-crest-id", "ranked-tier", "ranked-division"],
          });
          shadowObservers.push(ob);
        } catch (e) {  }
      });
    });
  }

  const crestObserved = new WeakSet();
  function armCrestObservers(els) {
    if (!borderArmed()) return;
    if (!els) { try { els = findCrestElements(); } catch (e) { return; } }
    els.forEach((el) => {
      if (crestObserved.has(el)) return;
      crestObserved.add(el);
      try {
        const ob = new MutationObserver(() => {
          if (state.regaliaBorder.uniqueId) requestApplyBorder();
        });
        ob.observe(el, {
          attributes: true,
          attributeFilter: ["crest-type", "prestige-crest-id", "ranked-tier", "ranked-division"],
        });
        shadowObservers.push(ob);
      } catch (e) {  }
    });
  }

  const IDENT_GRID_SEL = ".identity-customizer-tab-borders-component .identity-customizer-grid";
  const IDENT_CARD_SEL = ".identity-customizer-border";
  let identHolderRef = null;
  let identNativeDumped = false;
  const RANK_TIER_CN = {
    iron: "铁", bronze: "青铜", silver: "白银", gold: "黄金", platinum: "铂金",
    emerald: "翡翠", diamond: "钻石", master: "大师", grandmaster: "宗师", challenger: "王者",
  };
  const THEMED_BORDER_NAME = [
    "皮尔特沃夫", "祖安", "海克斯", "火焰", "圣光",
    "灌注", "暗影岛", "恕瑞玛", "皎月", "战国",
    "弗雷尔卓德", "战地机甲", "艾欧尼亚", "比尔吉沃特", "符文",
    "诺克萨斯", "天神", "永恒之森", "虚空", "腥红之月", "Eternus",
  ];
  const THEMED_BORDER_LV = [1, 30, 50, 75, 100, 125, 150, 175, 200, 225,
                            250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 500];
  function identBorderName(b) {
    if (b.rankedTier) return RANK_TIER_CN[b.rankedTier] || b.rankedTier;
    const i = parseInt(b.id, 10) - 1;
    return THEMED_BORDER_NAME[i] || ("主题边框 " + b.id);
  }
  function identBorderDesc(b) {
    if (b.rankedTier) return "排位框";
    const i = parseInt(b.id, 10) - 1;
    return (THEMED_BORDER_LV[i] != null) ? (THEMED_BORDER_LV[i] + " 级") : "饰框";
  }

  let identLiveSig = "";

  const identCardRep = {};

  let spotSig = "", spotAt = 0;


  let identTabSig = "";
  function dumpIdentTabs() {
    let cont = null;
    try {
      cont = document.querySelector(".challenges-identity-customizer-container")
          || document.querySelector('[class*="identity-customizer-container"]');
    } catch (e) { return; }
    if (!cont) return;

    const desc = (el, deep) => {
      const cls = String(el.className || "");
      let box = "";
      try { const r = el.getBoundingClientRect(); box = Math.round(r.width) + "x" + Math.round(r.height); }
      catch (e) { box = ""; }
      const o = { cls: cls.slice(0, 58), box: box, tag: String(el.tagName || "").toLowerCase().slice(0, 26) };
      const attrs = ["src", "prestige-crest-id", "crest-type", "ranked-tier", "crystal-level", "id"];
      const av = {};
      for (let i = 0; i < attrs.length; i++) {
        let v = "";
        try { v = String(el.getAttribute(attrs[i]) || ""); } catch (e) { v = ""; }
        if (v) av[attrs[i]] = v.slice(-34);
      }
      if (Object.keys(av).length) o.at = av;
      if (deep && el.children) {
        const kids = [];
        for (let i = 0; i < el.children.length && i < 4; i++) kids.push(desc(el.children[i], false).tag + "." + desc(el.children[i], false).cls.slice(0, 26));
        o.kids = kids;
      }
      return o;
    };

    const tabs = [];
    try {
      const all = cont.querySelectorAll('[class*="identity-customizer-tab"]');
      for (let i = 0; i < all.length && tabs.length < 24; i++) {
        const el = all[i], cls = String(el.className || "");
        if (/-component/.test(cls)) continue;
        if (cls.indexOf("identity-customizer-tab") < 0) continue;
        const txt = String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 10);
        if (!txt) continue;                                   
        tabs.push({ cls: cls.slice(0, 54), txt: txt, box: desc(el).box });
      }
    } catch (e) {  }

    const panes = [];
    try {
      const all = cont.querySelectorAll('[class*="-component"]');
      const seenC = {};
      for (let i = 0; i < all.length && panes.length < 8; i++) {
        const el = all[i], cls = String(el.className || "");
        if (!/-tab-[a-z]+-component/.test(cls)) continue;
        const key = cls.split(" ")[0];
        if (seenC[key]) continue;
        seenC[key] = 1;
        const cards = [];
        try {
          const ck = el.querySelectorAll(
            '[class*="-icon-component"], [class*="identity-customizer-border"], [class*="identity-customizer-banner"],' +
            ' [class*="-title-component"], [class*="prestige"], [class*="crest"], [class*="token-component"]');
          for (let k = 0; k < ck.length && cards.length < 3; k++) cards.push(desc(ck[k], true));
        } catch (e) {  }
        panes.push({ cls: cls.split(" ")[0].slice(0, 54), kids: el.children ? el.children.length : 0, cards: cards });
      }
    } catch (e) {  }

    const payload = { tabs: tabs, panes: panes };
    const sig = JSON.stringify(payload);
    if (sig === identTabSig) return;
    identTabSig = sig;
    try { diag("ident-tabs", payload); } catch (e) {  }
  }

  let titleTabDumped = false;

  function applyIdentityBorders() {
    let grid = null;
    try { grid = document.querySelector(IDENT_GRID_SEL); } catch (e) { return false; }
    if (!grid) return false;                                  

    let holder = null;
    try {
      if (identHolderRef && grid.contains(identHolderRef)) holder = identHolderRef;
    } catch (e) { holder = null; }
    if (!holder) {
      try {
        const nativeCard = grid.querySelector(".identity-customizer-border:not([data-prism-border])");
        if (nativeCard && nativeCard.parentElement && nativeCard.parentElement !== grid) {
          holder = nativeCard.parentElement;
        } else {
          const others = [];
          for (let i = 0; i < grid.children.length; i++) {
            if (!grid.children[i].getAttribute("data-prism-border")) others.push(grid.children[i]);
          }
          if (others.length === 1) holder = others[0];
        }
      } catch (e) { holder = null; }
      if (!holder) holder = grid;
      identHolderRef = holder;
    }

    let ready = false;
    try {
      let mineCount = 0, nativeCount = 0;
      const all = holder.querySelectorAll(".identity-customizer-border");
      for (let i = 0; i < all.length; i++) {
        if (all[i].getAttribute("data-prism-border")) mineCount++; else nativeCount++;
      }
      if (mineCount === REGALIA_BORDERS.length && nativeCount === 0) ready = true;
    } catch (e) { ready = false; }

    if (ready) {
      const c0 = state.regaliaBorder.uniqueId || "";
      try {
        const mine = grid.querySelectorAll("[data-prism-border]");
        for (let i = 0; i < mine.length; i++) {
          mine[i].classList.toggle("selected",
            !!c0 && mine[i].getAttribute("data-prism-border") === c0);
        }
      } catch (e) {  }
      return true;
    }

    try {
      const natives = holder.querySelectorAll(".identity-customizer-border");
      for (let i = 0; i < natives.length; i++) {
        const el = natives[i];
        if (el.getAttribute("data-prism-border")) continue;                       
        if (!identNativeDumped) {
          identNativeDumped = true;
          try {
            const list = [];
            const readAttrs = (n, cap) => {
              const a = [];
              if (!n) return a;
              for (let m = 0; m < n.attributes.length && a.length < cap; m++) {
                a.push(n.attributes[m].name + "=" + String(n.attributes[m].value).slice(0, 38));
              }
              return a;
            };
            for (let k = 0; k < natives.length && k < 6; k++) {
              const c = natives[k];
              list.push({
                title: String(c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30),
                cls: String(c.className || "").slice(0, 44),
                card: readAttrs(c, 14),
                inner: readAttrs(c.querySelector("*"), 14),
                ring: readAttrs(c.querySelector("lol-uikit-themed-level-ring-v2"), 16),
              });
            }
            diag("ident-native-dump", list);
          } catch (e) {  }
        }
        el.setAttribute("data-prism-native", "1");
        el.remove();
      }
    } catch (e) {  }

    const cur = state.regaliaBorder.uniqueId || "";
    REGALIA_BORDERS.forEach((b) => {
      const uid = borderUniqueId(b);
      let card = null;
      try { card = grid.querySelector('[data-prism-border="' + uid + '"]'); } catch (e) { card = null; }
      if (!card) {
        card = document.createElement("div");
        card.className = "identity-customizer-border ember-view";
        card.setAttribute("data-prism-border", uid);

        const box = document.createElement("div");
        box.className = "identity-customizer-border-container";

        const img = document.createElement("img");
        img.className = "identity-customizer-border-icon prestige-border-icon";
        img.setAttribute("data-prism-icon", "1");
        img.src = b.previewPath;

        const title = document.createElement("div");
        title.className = "identity-customizer-border-title";
        title.textContent = identBorderName(b);

        const desc = document.createElement("div");
        desc.className = "identity-customizer-border-desc";
        desc.textContent = identBorderDesc(b);

        box.appendChild(img);
        box.appendChild(title);
        box.appendChild(desc);
        card.appendChild(box);

        card.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          state.regaliaBorder.uniqueId = uid;
          saveRegaliaBorder();
          applyRegaliaBorder();
          applyIdentityBorders();
          diag("ident-border-pick", { uid });
        }, true);

        holder.appendChild(card);                 
      } else if (card.parentElement !== holder) {
        try { holder.appendChild(card); } catch (e) {  }
      }
      try { card.classList.toggle("selected", !!cur && uid === cur); } catch (e) {  }
    });
    try { grid.setAttribute("data-prism-filled", "1"); } catch (e) {  }
    try {
      let nativeTotal = 0, nativeHidden = 0;
      const ns = holder.querySelectorAll(".identity-customizer-border");
      for (let i = 0; i < ns.length; i++) {
        if (ns[i].getAttribute("data-prism-border")) continue;
        nativeTotal++;
        if (ns[i].style.display === "none") nativeHidden++;
      }
      const hr = holder.getBoundingClientRect();
      diag("ident-borders-filled", {
        count: holder.querySelectorAll("[data-prism-border]").length,
        total: REGALIA_BORDERS.length,
        gridCls: String(grid.className || "").slice(0, 40),
        holderCls: String(holder.className || "") || "(无 class)",
        holderIsGrid: holder === grid,
        holderBox: Math.round(hr.width) + "x" + Math.round(hr.height),
        nativeTotal, nativeHidden,
      });
    } catch (e) {  }
    return true;
  }

  function applyRegaliaBorder() {
    if (forgeData()) { try { revertRegaliaBorder(); } catch (e) {  } return; }
    const b = borderFind(state.regaliaBorder.uniqueId);
    if (!b) { revertRegaliaBorder(); return; }
    armBorderObserver();
    armShadowObservers();
    const els = findCrestElements();
    armCrestObservers(els);
    els.forEach((el) => {
      applyBorderToEl(el, b);
      freezeCrestProps(el, ["prestige-crest-id", "crest-type", "ranked-tier", "ranked-division"]);
    });
    try {
      const cz = document.querySelector("lol-regalia-identity-customizer-element");
      if (cz && cz.shadowRoot) {
        const cc = cz.shadowRoot.querySelector(
          "lol-regalia-crest-v2-element.regalia-identity-customizer-crest-element");
        if (cc) {
          applyBorderToEl(cc, b);
          freezeCrestProps(cc, ["prestige-crest-id", "crest-type", "ranked-tier", "ranked-division"]);
        }
      }
    } catch (e) {  }
    applyBorderCss(b);
  }

  function revertRegaliaBorder() {
    const now = Date.now();
    if (now - borderRevAt > 1000) { borderRevAt = now; borderRevWin = 0; }
    borderRevWin++;
    if (borderRevWin > BORDER_TRIP_N && borderArmed()) borderDisarm();
    applyBorderCss(null);
    let els = [];
    try { els = findCrestElements(); } catch (e) {  }
    els.forEach(restoreBorderOrig);
    if (els.length) diag("border-revert", { count: els.length });
  }

  function saveRegaliaBorder() {
    const t = JSON.stringify({ uniqueId: state.regaliaBorder.uniqueId });
    try { if (window.DataStore) window.DataStore.set(BORDER_KEY, t); } catch (e) {  }
    try { localStorage.setItem(BORDER_KEY, t); } catch (e) {  }
  }

  function loadRegaliaBorder() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(BORDER_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(BORDER_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (o && o.uniqueId) state.regaliaBorder.uniqueId = String(o.uniqueId);
    } catch (e) {  }
  }


  let borderProbeAt = 0;
  function probeRegaliaBorder(force) {
    const now = Date.now();
    if (!force && now - borderProbeAt < 60000) return;
    const uid = state.regaliaBorder.uniqueId;
    const els = (() => { try { return findCrestElements(); } catch (e) { return []; } })();
    if (!els.length && !uid) return;
    borderProbeAt = now;
    const first = els[0];
    diag("border-probe", {
      want: uid || null,
      crestCount: els.length,
      firstType: first ? first.getAttribute("crest-type") : null,
      firstId: first ? first.getAttribute("prestige-crest-id") : null,
      firstTier: first ? first.getAttribute("ranked-tier") : null,
      cssOn: !!document.getElementById(NS + "-border-emblems"),
      cssVar: (() => {
        try { return String(getComputedStyle(document.documentElement)
          .getPropertyValue("--current-border") || "").slice(0, 70); } catch (e) { return ""; }
      })(),
    });
  }

  let identityDumped = false;
  let identityHbSig = "";   


  const TITLE_KEY = SETTINGS_KEY + ".titlecustom";
  const TITLE_API = "/lol-game-data/assets/v1/achievementtitles.json";

  function loadTitles(force) {
    if (state.titleCustom.list && !force) return Promise.resolve(state.titleCustom.list);
    return fetch(location.origin + TITLE_API, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const arr = (Array.isArray(d) ? d : [])
          .map((t) => ({ itemId: t && t.itemId, name: String((t && t.titleName) || "").trim() }))
          .filter((t) => t.name);
        arr.sort((a, b) => a.name.localeCompare(b.name, "zh"));
        state.titleCustom.list = arr;
        state.titleCustom.err = "";
        return arr;
      })
      .catch((e) => {
        state.titleCustom.err = String((e && e.message) || e).slice(0, 60);
        return [];
      });
  }

  const titleOrigText = new WeakMap();

  let titleObserver = null;
  function armTitleObserver() {
    if (titleObserver || !document.body) return;
    titleObserver = new MutationObserver((muts) => {
      if (!state.titleCustom.name) return;
      for (let i = 0; i < muts.length; i++) {
        const nodes = muts[i].addedNodes;
        for (let j = 0; j < nodes.length; j++) {
          const n = nodes[j];
          if (!n || n.nodeType !== 1) continue;
          try {
            if (n.classList && (n.classList.contains("banner-title") ||
                n.classList.contains("challenge-banner-title-container"))) {
              applyTitleCustom(); return;
            }
            if (n.querySelector && (n.querySelector(".banner-title") ||
                n.querySelector(".challenge-banner-title-container"))) {
              applyTitleCustom(); return;
            }
          } catch (e) {  }
        }
      }
    });
    try {
      titleObserver.observe(document.body, { childList: true, subtree: true });
    } catch (e) { titleObserver = null; }
  }

  const TITLE_CARD_ID_SEL = "[id^='title-id-']";
  function installTitleTabEntry() {
    if (window.__prismTitleTabBound) return;         
    window.__prismTitleTabBound = true;
    document.addEventListener("click", (e) => {
      let card = null;
      try { card = (e.target && e.target.closest) ? e.target.closest(TITLE_CARD_ID_SEL) : null; }
      catch (err) { card = null; }
      if (!card) return;
      const m = /^title-id-(-?\d+)$/.exec(String(card.id || ""));
      if (!m) return;
      const itemId = parseInt(m[1], 10);
      e.preventDefault();
      e.stopImmediatePropagation();
      if (itemId < 0) {
        state.titleCustom.name = "";                    
      } else {
        const t = card.querySelector(".title-text");
        const name = t ? String(t.textContent || "").trim() : "";
        if (!name) return;
        state.titleCustom.name = name;
      }
      saveTitleCustom();
      applyTitleCustom();
      try { diag("title-tab-pick", { itemId: itemId, name: state.titleCustom.name }); }
      catch (err) {  }
    }, true);
  }

  function hmRoots() {
    const roots = [document];
    (function rec(r, d) {
      if (d > 5) return;
      let els = null;
      try { els = r.querySelectorAll("*"); } catch (e) { return; }
      for (let i = 0; i < els.length; i++) {
        const sr = els[i].shadowRoot;
        if (sr && roots.indexOf(sr) < 0) { roots.push(sr); rec(sr, d + 1); }
      }
    })(document, 0);
    return roots;
  }

  const TITLE_ROOT_SELS = [
    ".challenges-identity-customizer-tab-titles-component",
    '[class*="identity-customizer-tab-titles"]',
    '[class*="identity-customizer-titles"]',
  ];
  function titleRoots() {
    const out = [];
    const roots = hmRoots();
    for (let s = 0; s < TITLE_ROOT_SELS.length; s++) {
      for (let i = 0; i < roots.length; i++) {
        let els = null;
        try { els = roots[i].querySelectorAll(TITLE_ROOT_SELS[s]); } catch (e) { continue; }
        for (let j = 0; j < els.length; j++) {
          let r = null;
          try { r = els[j].getBoundingClientRect(); } catch (e) { r = null; }
          if (!r || r.width < 120 || r.height < 80) continue;
          if (out.indexOf(els[j]) < 0) out.push(els[j]);
        }
      }
      if (out.length) return out;          
    }
    return out;
  }

  function unlockTitleTab() {
    const scopes = titleRoots();
    if (!scopes.length) return false;
    let touched = 0;
    for (let k = 0; k < scopes.length; k++) {
      const scope = scopes[k];
      let texts = null, icons = null;
      try { texts = scope.querySelectorAll(".title-text"); } catch (e) { texts = null; }
      try { icons = scope.querySelectorAll(".title-icon"); } catch (e) { icons = null; }
      if (texts) {
        for (let i = 0; i < texts.length; i++) {
          const t = texts[i];
          try {
            if (t.style.getPropertyPriority("color") !== "important") {
              t.style.setProperty("color", "#a09b8c", "important");
            }
            touched++;
          } catch (e) {  }
        }
      }
      if (icons) {
        for (let i = 0; i < icons.length; i++) {
          const ic = icons[i];
          try {
            if (ic.style.getPropertyPriority("opacity") !== "important") {
              ic.style.setProperty("opacity", "1", "important");
            }
          } catch (e) {  }
        }
      }
      let cards = null;
      try { cards = scope.querySelectorAll("[id^='title-id-']"); } catch (e) { cards = null; }
      if (cards) {
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i];
          try {
            const cs = getComputedStyle(c);
            if (cs && parseFloat(cs.opacity) < 1 && c.style.getPropertyPriority("opacity") !== "important") {
              c.style.setProperty("opacity", "1", "important");
            }
            if (cs && cs.filter && cs.filter !== "none" && c.style.getPropertyPriority("filter") !== "important") {
              c.style.setProperty("filter", "none", "important");
            }
          } catch (e) {  }
        }
      }
      const neutralizeDim = (el) => {
        if (!el || el.nodeType !== 1) return;
        try {
          const cs = getComputedStyle(el);
          if (!cs) return;
          if (cs.color === "rgb(91, 90, 86)" && el.style.getPropertyPriority("color") !== "important") {
            el.style.setProperty("color", "rgb(160, 155, 140)", "important");
          }
          if (parseFloat(cs.opacity) < 1 && el.style.getPropertyPriority("opacity") !== "important") {
            el.style.setProperty("opacity", "1", "important");
          }
          if (cs.filter && cs.filter !== "none" && el.style.getPropertyPriority("filter") !== "important") {
            el.style.setProperty("filter", "none", "important");
          }
        } catch (e) {  }
      };
      if (cards && cards.length) {
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          const stack = [card];
          let seen = 0;
          while (stack.length && seen < 600) {
            const el = stack.pop();
            seen++;
            let skip = false;
            try { skip = !!(el.classList && el.classList.contains("player-title-data")); } catch (e) { skip = false; }
            if (skip) continue;
            neutralizeDim(el);
            try {
              for (let k = 0; k < el.children.length; k++) stack.push(el.children[k]);
            } catch (e) {  }
          }
          let n = card, d = 0;
          while (n && n !== scope && d < 10) { n = n.parentElement; if (n) neutralizeDim(n); d++; }
        }
      } else {
        let seeds = [];
        try {
          const ts = scope.querySelectorAll(".title-text,.title-icon");
          for (let i = 0; i < ts.length; i++) seeds.push(ts[i]);
        } catch (e) {  }
        for (let i = 0; i < seeds.length; i++) neutralizeDim(seeds[i]);
      }
      let up = scope, ud = 0;
      while (up && ud < 8) {
        up = up.parentElement;
        if (!up || up === document.body || up === document.documentElement) break;
        neutralizeDim(up);
        ud++;
      }
    }
    return touched > 0;
  }



  const BANNER_ROOT_SELS = [
    ".challenges-identity-customizer-tab-banners-component",
    ".identity-customizer-tab-banners-component",
    '[class*="identity-customizer-tab-banners"]',
    '[class*="tab-banners-component"]',
  ];
  let bannerRootCache = null;

  let bannerDeepCache = null, bannerDeepCacheAt = 0;
  function bannerDeepRoots() {
    const now = Date.now();
    if (bannerDeepCache && (now - bannerDeepCacheAt) < 1500) return bannerDeepCache;
    const out = [document];
    (function rec(r, d) {
      if (d > 12) return;
      let els = null;
      try { els = r.querySelectorAll("*"); } catch (e) { return; }
      for (let i = 0; i < els.length; i++) {
        const sr = els[i].shadowRoot;
        if (sr && out.indexOf(sr) < 0) { out.push(sr); rec(sr, d + 1); }
      }
    })(document, 0);
    bannerDeepCache = out;
    bannerDeepCacheAt = now;
    return out;
  }

  function bannerRoots() {
    if (bannerRootCache) {
      let alive = false;
      try {
        const r = bannerRootCache.getBoundingClientRect();
        alive = !!bannerRootCache.isConnected && !!r && r.width > 120 && r.height > 80;
      } catch (e) { alive = false; }
      if (alive) return [bannerRootCache];
      bannerRootCache = null;                 
    }
    const out = [];
    const roots = bannerDeepRoots();          
    for (let s = 0; s < BANNER_ROOT_SELS.length; s++) {
      for (let i = 0; i < roots.length; i++) {
        let els = null;
        try { els = roots[i].querySelectorAll(BANNER_ROOT_SELS[s]); } catch (e) { continue; }
        for (let j = 0; j < els.length; j++) {
          let r = null;
          try { r = els[j].getBoundingClientRect(); } catch (e) { r = null; }
          if (!r || r.width < 120 || r.height < 80) continue;
          if (out.indexOf(els[j]) < 0) out.push(els[j]);
        }
      }
      if (out.length) break;                  
    }
    if (out.length) bannerRootCache = out[0];
    return out;
  }

  function bannerGrids() {
    const out = [];
    const roots = bannerDeepRoots();
    for (let i = 0; i < roots.length; i++) {
      let gs = null;
      try { gs = roots[i].querySelectorAll(".identity-customizer-grid"); } catch (e) { gs = null; }
      if (!gs) continue;
      for (let j = 0; j < gs.length; j++) {
        const g = gs[j];
        let hasBanner = false;
        try { hasBanner = !!g.querySelector(".identity-customizer-banner"); } catch (e) { hasBanner = false; }
        if (!hasBanner) continue;                 
        let r = null;
        try { r = g.getBoundingClientRect(); } catch (e) { r = null; }
        if (!r || r.width < 120 || r.height < 80) continue;   
        if (out.indexOf(g) < 0) out.push(g);
      }
    }
    return out;
  }

  const BANNER_RANK_TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM",
                             "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];

  function stripEmberActions(el) {
    if (!el || el.nodeType !== 1) return 0;
    let n = 0;
    try {
      const all = [el].concat(Array.prototype.slice.call(el.querySelectorAll("*")));
      for (let i = 0; i < all.length; i++) {
        const node = all[i];
        if (!node.attributes) continue;
        const drop = [];
        for (let j = 0; j < node.attributes.length; j++) {
          const nm = String(node.attributes[j].name || "");
          if (nm.indexOf("data-ember-action") === 0) drop.push(nm);
        }
        for (let j = 0; j < drop.length; j++) {
          try {
            if (cbanDelAttr) cbanDelAttr.call(node, drop[j]);
            else node.removeAttribute(drop[j]);
            n++;
          } catch (e) {  }
        }
      }
    } catch (e) {  }
    return n;
  }

  function bannerCellInfo(card) {
    if (!card || card.nodeType !== 1) return null;
    let rc = null;
    try { rc = card.getAttribute("data-prism-rank-cell"); } catch (e) { rc = null; }
    if (rc) return { id: "2", rank: String(rc), type: "blank", from: "rank-cell" };
    let el = null;
    try { el = card.querySelector(CBAN_SEL); } catch (e) { el = null; }
    if (!el) {
      try {
        const all = card.querySelectorAll("*");
        for (let i = 0; i < all.length && !el; i++) {
          const sr = all[i].shadowRoot;
          if (sr) { const t = sr.querySelector(CBAN_SEL); if (t) el = t; }
        }
      } catch (e) {  }
    }
    if (!el) return null;                     
    return {
      id: String(el.getAttribute("banner-id") || ""),
      rank: String(el.getAttribute("banner-rank") || ""),
      type: String(el.getAttribute("banner-type") || ""),
      from: "native",
    };
  }

  function bannerFindInList(list, id, rank) {
    const arr = list || [];
    const rk = String(rank || "");
    let sameId = null;
    for (let i = 0; i < arr.length; i++) {
      if (String(arr[i].id) !== String(id)) continue;
      const lr = String(arr[i].bannerRank || "");
      if (rk) { if (lr === rk) return arr[i]; }
      else if (!lr) return arr[i];
      if (!sameId) sameId = arr[i];
    }
    return sameId;
  }

  function bannerClickTarget(e) {
    let path = null;
    try { path = (e && typeof e.composedPath === "function") ? e.composedPath() : null; }
    catch (err) { path = null; }
    if (!path || !path.length) return null;
    let card = null, owner = false;
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (!n || n.nodeType !== 1 || !n.classList) continue;
      if (!card && n.classList.contains("identity-customizer-banner")) card = n;
      if (n.classList.contains("identity-customizer-tab-banners-component")) owner = true;
    }
    if (!card || !owner) return null;
    return card;
  }

  function applyBannerCellPick(card) {
    const info = bannerCellInfo(card);
    if (!info || !info.id) {
      diag("banner-tab-pick-miss", { why: "读不出这格代表哪面旗" });
      return;
    }
    const go = (list) => {
      const f = bannerFindInList(list, info.id, info.rank);
      if (!f) { diag("banner-tab-pick-miss", { id: info.id, rank: info.rank }); return; }
      const p = cbanPick();
      if (p && p.key === f.key) {
        state.cban.pick = null;
        saveCbanPick();
        cbanDisable();
        diag("banner-tab-pick", { key: f.key, off: true });
        return;
      }
      state.cban.pick = {
        id: f.id, name: f.name, assetPath: f.assetPath,
        bannerRank: f.bannerRank, key: f.key,
      };
      saveCbanPick();
      cbanEnable(cbanPick()).catch((err) =>
        diag("banner-tab-enable-error", { msg: String((err && err.message) || err) }));
      diag("banner-tab-pick", { key: f.key, name: f.name, from: info.from });
    };
    if (state.cban.list) { go(state.cban.list); return; }
    cbanLoadList().then(go).catch((err) =>
      diag("banner-tab-list-error", { msg: String((err && err.message) || err) }));
  }

  function installBannerTabEntry() {
    if (window.__prismBannerTabBound) return;     
    window.__prismBannerTabBound = true;
    document.addEventListener("click", (e) => {
      const card = bannerClickTarget(e);
      if (!card) return;
      try { e.preventDefault(); } catch (err) {  }
      try { e.stopImmediatePropagation(); } catch (err) {  }
      try { e.stopPropagation(); } catch (err) {  }
      try { applyBannerCellPick(card); }
      catch (err) { diag("banner-tab-pick-error", { msg: String((err && err.message) || err) }); }
    }, true);
  }

  function bannerPickedSync() {
    const roots = bannerDeepRoots();          
    const p = cbanPick();
    const want = p ? String(p.key) : "";
    let on = 0;
    for (let k = 0; k < roots.length; k++) {
      let cards = null;
      try { cards = roots[k].querySelectorAll(".identity-customizer-banner"); } catch (e) { cards = null; }
      if (!cards) continue;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const info = bannerCellInfo(c);
        const key = (info && info.id) ? (String(info.id) + ":" + String(info.rank || "")) : "";
        const hit = !!want && key === want;
        try {
          if (hit) { if (!c.hasAttribute("data-prism-banner-picked")) c.setAttribute("data-prism-banner-picked", "1"); on++; }
          else if (c.hasAttribute("data-prism-banner-picked")) c.removeAttribute("data-prism-banner-picked");
        } catch (e) {  }
      }
    }
    return on > 0;
  }

  let bannerRankCellsBuilt = 0;   
  function buildBannerRankCellsIn(grid) {
    if (!grid || grid.nodeType !== 1) return 0;
    let nodeList = null;
    try { nodeList = grid.querySelectorAll(".identity-customizer-banner"); } catch (e) { nodeList = null; }
    if (!nodeList || nodeList.length < 3) return 0;   
    const kids = Array.prototype.slice.call(nodeList);

    let ph = null;              
    let tmpl = null;            
    let have = {};              
    let firstCard = null;
    let ourCount = 0;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (!firstCard) firstCard = c;
      const rc = c.getAttribute("data-prism-rank-cell");
      if (rc) { have[String(rc)] = true; ourCount++; continue; }
      if (!ph) {
        let dis = null;
        try { dis = c.querySelector(".identity-customizer-banner-disabled-container"); } catch (e) { dis = null; }
        if (dis) { ph = c; continue; }
      }
      if (!tmpl) {
        const info = bannerCellInfo(c);
        if (info && info.id && info.id !== "2") tmpl = c;
      }
    }

    if (ph) {
      try {
        if (!ph.hasAttribute("data-prism-banner-hide")) ph.setAttribute("data-prism-banner-hide", "1");
      } catch (e) {  }
    }

    if (ourCount >= BANNER_RANK_TIERS.length) return 0;   
    if (!tmpl) return 0;                                 

    let anchor = ph || firstCard;
    const host = (anchor && anchor.parentElement) || grid;
    let added = 0;
    for (let t = 0; t < BANNER_RANK_TIERS.length; t++) {
      const tier = BANNER_RANK_TIERS[t];
      if (have[tier]) {
        let ex = null;
        try { ex = grid.querySelector('[data-prism-rank-cell="' + tier + '"]'); } catch (e) { ex = null; }
        if (ex) anchor = ex;
        continue;
      }
      const cell = makeBannerRankCell(tmpl, tier);
      if (!cell) continue;
      try {
        const par = (anchor && anchor.parentElement) || host;
        if (anchor && par && anchor.parentNode === par) par.insertBefore(cell, anchor.nextSibling);
        else par.insertBefore(cell, par.firstChild);
      } catch (e) { continue; }
      anchor = cell;
      added++;
    }
    if (added) {
      bannerRankCellsBuilt = added;
      diag("banner-rank-cells", { added: added, total: ourCount + added, tiers: BANNER_RANK_TIERS.length });
    }
    return added;
  }

  function makeBannerRankCell(tmpl, tier) {
    let cell = null;
    try { cell = tmpl.cloneNode(true); } catch (e) { return null; }
    if (!cell || cell.nodeType !== 1) return null;
    stripEmberActions(cell);
    try { cell.removeAttribute("id"); } catch (e) {  }
    try { if (cell.classList) cell.classList.remove("selected"); } catch (e) {  }
    try { cell.setAttribute("data-prism-rank-cell", tier); } catch (e) {  }
    try {
      const lc = cell.querySelector(".identity-customizer-banner-locked-container");
      if (lc && lc.parentElement) lc.parentElement.removeChild(lc);
    } catch (e) {  }
    let rel = null;
    try { rel = cell.querySelector(CBAN_SEL); } catch (e) { rel = null; }
    if (!rel) {
      try {
        const all = cell.querySelectorAll("*");
        for (let i = 0; i < all.length && !rel; i++) {
          const sr = all[i].shadowRoot;
          if (sr) { const t = sr.querySelector(CBAN_SEL); if (t) rel = t; }
        }
      } catch (e) {  }
    }
    if (!rel) return null;
    const w = (k, v) => {
      try {
        if (cbanSetAttr) cbanSetAttr.call(rel, k, v);
        else rel.setAttribute(k, v);
      } catch (e) {  }
    };
    w("banner-id", "2");
    w("banner-type", "blank");
    w("banner-rank", tier);
    const zh = CBAN_TIERS[tier] || tier;
    try {
      const tt = cell.querySelector('[class*="banner-title"]');
      if (tt) { if (tt.classList) tt.classList.remove("locked"); tt.textContent = zh + " 旗帜"; }
      const dd = cell.querySelector('[class*="banner-description"]');
      if (dd) { if (dd.classList) dd.classList.remove("locked"); dd.textContent = "过往赛季排位"; }
    } catch (e) {  }
    return cell;
  }

  let bannerRankMissCnt = 0;
  function probeBannerRankWhy(grid) {
    if (bannerRankMissCnt >= 4) return;
    bannerRankMissCnt++;
    let cards = 0, ours = 0, ph = 0, tmplOk = 0;
    try {
      const list = grid.querySelectorAll(".identity-customizer-banner");
      cards = list.length;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.hasAttribute("data-prism-rank-cell")) { ours++; continue; }
        if (c.querySelector(".identity-customizer-banner-disabled-container")) ph++;
        const info = bannerCellInfo(c);
        if (info && info.id && info.id !== "2") tmplOk++;
      }
    } catch (e) {  }
    diag("banner-rank-why", {
      cards: cards, ours: ours, ph: ph, tmplOk: tmplOk,
      kids: (function () { try { return grid.children.length; } catch (e) { return -1; } })(),
      host: (function () {
        try {
          const c = grid.querySelector(".identity-customizer-banner");
          return c && c.parentElement ? String(c.parentElement.className || c.parentElement.tagName).slice(0, 60) : "";
        } catch (e) { return ""; }
      })(),
    });
  }

  function buildBannerRankCells() {
    const grids = bannerGrids();
    if (!grids.length) return 0;
    let n = 0;
    for (let i = 0; i < grids.length; i++) {
      const got = buildBannerRankCellsIn(grids[i]);
      n += got;
      if (!got) {
        let have = 0;
        try { have = grids[i].querySelectorAll("[data-prism-rank-cell]").length; } catch (e) { have = -1; }
        if (have === 0) probeBannerRankWhy(grids[i]);   
      }
    }
    return n;
  }

  const BANNER_TAB_HOST = "lol-regalia-identity-customizer-element";
  let bannerPumpTimer = 0;
  let bannerPumpBusy = false;           
  let bannerPumpAt = 0;                 
  const BANNER_PUMP_COOL = 150;         
  const bannerTabObserved = new WeakSet();
  const bannerTabObservers = [];        

  function bannerDeepFlush() {
    bannerDeepCache = null; bannerDeepCacheAt = 0;
    bannerRootCache = null;
  }

  function bannerPagePresent() {
    try {
      if (document.querySelector(BANNER_TAB_HOST)) return true;
      if (document.querySelector('[class*="identity-customizer-tab-banners"]')) return true;
    } catch (e) {  }
    return false;
  }

  function bannerPerfNow() {
    try {
      if (typeof performance !== "undefined" && performance && performance.now) return performance.now();
    } catch (e) {  }
    return Date.now();
  }

  function bannerPagePump(src, hard) {
    if (hard) bannerDeepFlush();
    let bDeep = [];
    try { bDeep = bannerDeepRoots(); } catch (e) { bDeep = []; }
    const out = { added: 0, have: 0, injected: 0, unlocked: false, src: src || "?" };
    try { out.injected = injectBannerShadowCss(bDeep); } catch (e) {  }
    try { armBannerTabShadow(); } catch (e) {  }   
    if (!bannerRoots().length) return out;
    try { out.unlocked = unlockBannerTab(bDeep); }
    catch (e) { diag("banner-unlock-error", { msg: String((e && e.message) || e).slice(0, 140) }); }
    try { out.added = buildBannerRankCells(); }
    catch (e) { diag("banner-rankcell-error", { msg: String((e && e.message) || e).slice(0, 140) }); }
    try { bannerPickedSync(); }
    catch (e) { diag("banner-picked-error", { msg: String((e && e.message) || e).slice(0, 140) }); }
    try {
      const gs = bannerGrids();
      for (let i = 0; i < gs.length; i++) {
        out.have += gs[i].querySelectorAll("[data-prism-rank-cell]").length;
      }
    } catch (e) {  }
    return out;
  }

  function bannerPumpNow(src, hard, t0) {
    if (bannerPumpBusy) return null;
    bannerPumpBusy = true;
    const t1 = bannerPerfNow();
    let r = null;
    try { r = bannerPagePump(src, hard); } catch (e) { r = null; }
    const t2 = bannerPerfNow();
    bannerPumpBusy = false;
    bannerPumpAt = Date.now();
    if (r && (r.injected || r.unlocked || r.added)) {
      diag("banner-pump", {
        src: r.src, added: r.added, have: r.have, css: r.injected,
        lag: (t0 == null) ? -1 : Math.round(t1 - t0), ms: Math.round(t2 - t1),
      });
    }
    return r;
  }

  function bannerPumpSoon(src, tries, hard, t0) {
    const t = (tries == null) ? 1 : tries;
    const now = Date.now();
    if (t0 == null) t0 = bannerPerfNow();
    if (!bannerPumpBusy && (now - bannerPumpAt) >= BANNER_PUMP_COOL) {
      if (bannerPumpTimer) { clearTimeout(bannerPumpTimer); bannerPumpTimer = 0; }
      const r = bannerPumpNow(src, hard, t0);
      if (r && r.added === 0 && r.have === 0 && t < 4 && bannerPagePresent()) {
        bannerPumpSoon(src, t + 1, hard, t0);    
      }
      return;
    }
    if (bannerPumpTimer) return;               
    const wait = Math.max(16, BANNER_PUMP_COOL - (now - bannerPumpAt));
    bannerPumpTimer = setTimeout(() => {
      bannerPumpTimer = 0;
      bannerPumpSoon(src, t, hard, t0);
    }, wait);
  }

  function armBannerTabShadow() {
    if (typeof MutationObserver === "undefined") return;
    let roots = null;
    try { roots = bannerDeepRoots(); } catch (e) { return; }
    for (let k = 0; k < roots.length; k++) {
      let hosts = null;
      try { hosts = roots[k].querySelectorAll(BANNER_TAB_HOST); } catch (e) { continue; }
      for (let i = 0; i < hosts.length; i++) {
        const h = hosts[i];
        if (!h.shadowRoot || bannerTabObserved.has(h)) continue;
        bannerTabObserved.add(h);
        try {
          const ob = new MutationObserver(() => { bannerPumpSoon("obs-shadow", 1, false); });
          ob.observe(h.shadowRoot, { childList: true, subtree: true });
          bannerTabObservers.push(ob);
        } catch (e) {  }
      }
    }
  }

  function armBannerTabObservers() {
    if (typeof MutationObserver === "undefined") return;
    if (!window.__prismBannerTabDocObs) {
      window.__prismBannerTabDocObs = true;
      try {
        const ob = new MutationObserver((muts) => {
          for (let i = 0; i < muts.length; i++) {
            const m = muts[i];
            if (m.type !== "childList" || !m.addedNodes) continue;
            const ns = m.addedNodes;
            for (let j = 0; j < ns.length; j++) {
              const nd = ns[j];
              if (!nd || nd.nodeType !== 1) continue;
              if (String(nd.nodeName || "").toLowerCase() === BANNER_TAB_HOST) {
                armBannerTabShadow(); bannerPumpSoon("obs-doc", 1, true); return;
              }
              let cl = "";
              try { cl = String(nd.className || ""); } catch (e) { cl = ""; }
              if (cl.indexOf("identity-customizer") >= 0) {
                armBannerTabShadow(); bannerPumpSoon("obs-doc", 1, true); return;
              }
            }
          }
        });
        ob.observe(document.documentElement || document, { childList: true, subtree: true });
        bannerTabObservers.push(ob);
      } catch (e) {  }
    }
    armBannerTabShadow();
  }

  function unlockBannerTab(roots) {
    const list = roots || bannerDeepRoots();
    let touched = 0;
    for (let k = 0; k < list.length; k++) {
      let ws = null;
      try {
        ws = list[k].querySelectorAll(
          ".identity-customizer-banner.unselectable .identity-customizer-banner-wrapper");
      } catch (e) { ws = null; }
      if (!ws || !ws.length) continue;
      for (let i = 0; i < ws.length; i++) {
        const el = ws[i];
        try {
          const cs = getComputedStyle(el);
          if (!cs) continue;
          if (parseFloat(cs.opacity) < 1 && el.style.getPropertyPriority("opacity") !== "important") {
            el.style.setProperty("opacity", "1", "important");
            touched++;
          }
          if (cs.filter && cs.filter !== "none" && el.style.getPropertyPriority("filter") !== "important") {
            el.style.setProperty("filter", "none", "important");
            touched++;
          }
        } catch (e) {  }
      }
    }
    return touched > 0;
  }

  const BANNER_SHADOW_CSS = [
    ".identity-customizer-banner.unselectable .identity-customizer-banner-wrapper,",
    '[class*="identity-customizer-banner"].unselectable [class*="identity-customizer-banner-wrapper"] {',
    "  filter: none !important;",
    "  opacity: 1 !important;",
    "}",
    ".identity-customizer-banner-locked-container { display: none !important; }",
    ".identity-customizer-banner[data-prism-banner-hide] { display: none !important; }",
    ".identity-customizer-banner { cursor: pointer; }",
    ".identity-customizer-banner[data-prism-banner-picked] {",
    "  outline: 2px solid #c8aa6e;",
    "  outline-offset: 2px;",
    "  border-radius: 3px;",
    "}",
  ].join("\n");

  function injectBannerShadowCss(roots) {
    const list = roots || bannerDeepRoots();
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r === document) continue;               
      let has = false, page = false;
      try { has = !!r.querySelector("style[data-prism-banner-css]"); } catch (e) { has = false; }
      if (has) continue;                          
      try { page = !!r.querySelector('[class*="identity-customizer"]'); } catch (e) { page = false; }
      if (!page) continue;                        
      try {
        const st = document.createElement("style");
        st.setAttribute("data-prism-banner-css", "1");
        st.textContent = BANNER_SHADOW_CSS;
        r.appendChild(st);                        
        n++;
      } catch (e) {  }
    }
    return n;
  }

  let probeBannerDomCnt = 0;

  let probeBannerMineCnt = 0;
  function probeBannerMine() {
    if (probeBannerMineCnt >= 8) return 0;
    const list = bannerDeepRoots();
    let grids = 0;
    for (let i = 0; i < list.length; i++) {
      try { grids += list[i].querySelectorAll(".identity-customizer-grid").length; } catch (e) {  }
    }
    if (!grids) return 0;                    
    probeBannerMineCnt++;
    const els = cbanFindAll();
    const out = [];
    let inGridN = 0, dispN = 0, mineN = 0;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      let mine = false, disp = false;
      try { mine = cbanIsMine(el); } catch (e) { mine = false; }
      try { disp = cbanInPickerDisplay(el); } catch (e) { disp = false; }
      if (mine) mineN++;
      let node = el, hop = 0, g = false;
      while (node && hop < 16) {
        try { if (String(node.className || "").indexOf("identity-customizer-grid") >= 0) { g = true; break; } } catch (e) {  }
        node = node.parentNode;
        if (node && node.nodeType === 11) node = node.host;
        if (!node || node === document) break;
        hop++;
      }
      if (g) inGridN++; else dispN++;
      if (!g && out.length < 3) {
        const o = {};
        try {
          ["member-type", "puuid", "summoner-id", "banner-id", "banner-rank", "banner-type"].forEach((k) => {
            const v = el.getAttribute(k);
            if (v != null) o[k] = String(v).slice(0, 20);
          });
        } catch (e) {  }
        o.tag = String(el.tagName || "").toLowerCase().slice(0, 34);
        o.mine = mine; o.disp = disp;
        const chain = [];
        let p = el, hp = 0;
        while (p && hp < 6) {
          let cl = "";
          try { cl = String(p.className || "").slice(0, 56); } catch (e) { cl = "?"; }
          chain.push(String(p.tagName || "?").toLowerCase() + (cl ? "." + cl.split(" ")[0] : ""));
          p = p.parentNode;
          if (p && p.nodeType === 11) { chain.push("#shadowRoot"); p = p.host; }
          if (!p || p === document) { chain.push("#document"); break; }
          hp++;
        }
        o.chain = chain;
        out.push(o);
      }
    }
    const pk = (function () { try { const p = cbanPick(); return p ? String(p.key) : ""; } catch (e) { return ""; } })();
    diag("banner-mine", { roots: list.length, grids: grids, total: els.length,
      inGrid: inGridN, disp: dispN, mine: mineN, pick: pk, sample: out });
    return out.length;
  }

  function applyTitleCustom() {
    const fg = forgeData();
    const fname = (fg && fg.titleName) ? String(fg.titleName) : "";
    const name = fname || String(state.titleCustom.name || "");
    if (name) armTitleObserver();
    try {
      diag("title-apply", { forge: !!fg, fname: fname,
                            userName: String(state.titleCustom.name || ""), name: name });
    } catch (e0) {  }
    try {
      const bt = document.querySelector(".banner-title");
      if (bt) {
        if (!titleOrigText.has(bt) && bt.textContent) titleOrigText.set(bt, bt.textContent);
        const want = name || titleOrigText.get(bt) || "";
        if (want && bt.textContent !== want) bt.textContent = want;   
      }
      const cb = document.querySelector(".challenge-banner-title-container");
      if (cb) {
        if (!titleOrigText.has(cb) && cb.innerHTML) titleOrigText.set(cb, cb.innerHTML);
        if (!name) {
          const orig = titleOrigText.get(cb);
          if (orig && cb.innerHTML !== orig) cb.innerHTML = orig;
        } else if (cb.textContent.trim() !== name) {
          cb.innerHTML = "";
          cb.appendChild(document.createTextNode("\n  " + name + "\n"));
          const tt = document.createElement("div");
          tt.className = "lol-tooltip-component ember-view";
          cb.appendChild(tt);
        }
      }
    } catch (e) {  }
  }


  const IDENT_ICON_CARD_CLS = "identity-customizer-tab-icon-component";
  const IDENT_TOKEN_CARD_CLS = "challenge-identity-customizer-token-container";
  const CREST_TAG = "lol-regalia-crest-v2-element";
  const ICON_ATTR = "profile-icon-url";
  const TOKEN_IMG_SEL = "img.achievement-token";

  const ICON_STORE_KEY = SETTINGS_KEY + ".summonericon";
  const TOKEN_STORE_KEY = SETTINGS_KEY + ".summonertoken";

  function saveSummonerIcon() {
    try { writeStored(ICON_STORE_KEY, JSON.stringify({ url: state.regaliaIcon.url })); }
    catch (e) {  }
  }
  function loadSummonerIcon() {
    try {
      const raw = readStored(ICON_STORE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      const u = o && o.url;
      if (u && String(u).indexOf("profile-icons/") >= 0) state.regaliaIcon.url = String(u);
    } catch (e) {  }
  }
  function saveSummonerToken() {
    try {
      writeStored(TOKEN_STORE_KEY, JSON.stringify({
        url: state.regaliaToken.url,
        slots: state.regaliaSlots.slice(0, TOKEN_SLOT_N),
      }));
    }
    catch (e) {  }
  }
  function loadSummonerToken() {
    try {
      const raw = readStored(TOKEN_STORE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      const u = o && o.url;
      if (u && String(u).indexOf("/Tokens/") >= 0) state.regaliaToken.url = String(u);
      if (o && Array.isArray(o.slots)) {
        for (let i = 0; i < TOKEN_SLOT_N; i++) {
          const sl = o.slots[i];
          if (!sl) { state.regaliaSlots[i] = { id: "", url: "" }; continue; }
          if (typeof sl === "string") {
            state.regaliaSlots[i] = { id: tokenIdOfUrl(sl), url: sl };
          } else {
            const u = String(sl.url || "");
            state.regaliaSlots[i] = { id: String(sl.id || tokenIdOfUrl(u)), url: u };
          }
        }
      }
    } catch (e) {  }
  }

  function deepFind(sel, cap) {
    const out = [];
    (function scan(root, d) {
      if (!root || d > 8 || out.length >= cap) return;
      let list = null;
      try { list = root.querySelectorAll(sel); } catch (e) { return; }
      for (let i = 0; i < list.length && out.length < cap; i++) out.push(list[i]);
      let all = null;
      try { all = root.querySelectorAll("*"); } catch (e) { return; }
      for (let j = 0; j < all.length && out.length < cap; j++) {
        let sr = null;
        try { sr = all[j].shadowRoot; } catch (e) { sr = null; }
        if (sr) scan(sr, d + 1);
      }
    })(document, 0);
    return out;
  }

  const deepCache = {}, deepCacheAt = {};
  function deepFindCached(sel, cap, ttl, strict) {
    const now = Date.now();
    const c = deepCache[sel];
    if (c && now - (deepCacheAt[sel] || 0) < (ttl || 1500)) {
      const alive = [];
      for (let i = 0; i < c.length; i++) {
        try { if (c[i].isConnected) alive.push(c[i]); } catch (e) {  }
      }
      if (!strict) {
        if (alive.length) return alive;
      } else if (alive.length === c.length) {
        return alive;
      }
    }
    const out = deepFind(sel, cap);
    deepCache[sel] = out; deepCacheAt[sel] = now;
    return out;
  }

  const iconOrig = new WeakMap();      
  const iconWatched = new WeakSet();   

  function watchCrestIcon(el) {
    if (!el || typeof MutationObserver !== "function") return;
    try { if (iconWatched.has(el)) return; iconWatched.add(el); } catch (e) { return; }
    try {
      new MutationObserver(function () {
        const url = forgeIconUrl();
        if (!url) return;
        try {
          if (String(el.getAttribute(ICON_ATTR) || "") !== url) el.setAttribute(ICON_ATTR, url);
        } catch (e) {  }
      }).observe(el, { attributes: true, attributeFilter: [ICON_ATTR] });
    } catch (e) {  }
  }

  const TOP_ICON_SEL = "img.icon-image";
  const topOrig = new WeakMap();
  const topWatched = new WeakSet();

  function isTopSummonerIcon(im) {
    let p = im, d = 0;
    while (p && d < 7) {
      try {
        const c = String(p.className || "");
        if (c.indexOf("summoner-level-icon") >= 0) return true;
        if (c.indexOf("identity-customizer") >= 0) return false;
      } catch (e) {  }
      p = p.parentNode;
      d++;
      if (p && p.host) { p = p.host; d++; }        
    }
    return false;
  }

  function watchTopIcon(im) {
    if (!im || typeof MutationObserver !== "function") return;
    try { if (topWatched.has(im)) return; topWatched.add(im); } catch (e) { return; }
    try {
      new MutationObserver(function () {
        const url = forgeIconUrl();
        if (!url) return;
        try { if (String(im.getAttribute("src") || "") !== url) im.setAttribute("src", url); }
        catch (e) {  }
      }).observe(im, { attributes: true, attributeFilter: ["src"] });
    } catch (e) {  }
  }

  function applyTopSummonerIcon() {
    const url = forgeIconUrl();
    if (!url) return 0;
    const ims = deepFindCached(TOP_ICON_SEL, 40, 1500);
    let n = 0;
    for (let i = 0; i < ims.length; i++) {
      const im = ims[i];
      if (!isTopSummonerIcon(im)) continue;
      watchTopIcon(im);
      try {
        if (String(im.getAttribute("src") || "") === url) continue;
        if (!topOrig.has(im)) topOrig.set(im, im.getAttribute("src"));
        im.setAttribute("src", url);
        n++;
      } catch (e) {  }
    }
    return n;
  }

  function applySummonerIcon(force) {
    try { applyTopSummonerIcon(); } catch (e) {  }
    const els = deepFindCached(CREST_TAG, 60, force === true ? 0 : 1500);
    if (!els.length) return 0;
    const url = forgeIconUrl();
    let n = 0;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      watchCrestIcon(el);                     
      if (!url) continue;
      try {
        if (String(el.getAttribute(ICON_ATTR) || "") === url) continue;
        if (!iconOrig.has(el)) iconOrig.set(el, el.getAttribute(ICON_ATTR));
        el.setAttribute(ICON_ATTR, url);
        n++;
      } catch (e) {  }
    }
    return n;
  }

  function revertSummonerIcon() {
    try {
      const tims = deepFindCached(TOP_ICON_SEL, 40, 0);
      for (let i = 0; i < tims.length; i++) {
        const im = tims[i];
        if (!isTopSummonerIcon(im)) continue;
        if (!topOrig.has(im)) continue;
        const o = topOrig.get(im);
        if (o === null || o === undefined || o === "") im.removeAttribute("src");
        else im.setAttribute("src", o);
        topOrig.delete(im);
      }
    } catch (e) {  }
    const els = deepFindCached(CREST_TAG, 60, 0);
    let n = 0;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      try {
        if (!iconOrig.has(el)) continue;
        const o = iconOrig.get(el);
        if (o === null || o === undefined || o === "") el.removeAttribute(ICON_ATTR);
        else el.setAttribute(ICON_ATTR, o);
        iconOrig.delete(el);
        n++;
      } catch (e) {  }
    }
    return n;
  }

  const tokenOrig = new WeakMap();
  const tokenWatched = new WeakSet();

  function watchTokenImg(im) {
    if (!im || typeof MutationObserver !== "function") return;
    try { if (tokenWatched.has(im)) return; tokenWatched.add(im); } catch (e) { return; }
    try {
      new MutationObserver(function () {
        try { fixWornImg(im); } catch (e) {  }
      }).observe(im, { attributes: true, attributeFilter: ["src"] });
    } catch (e) {  }
  }

  function fixWornImg(im) {
    if (!im) return 0;
    let mine = false;
    try { mine = tokenMade.has(im); } catch (e) { mine = false; }
    if (mine) return 0;                          
    const cur = String(im.getAttribute("src") || "");
    const id = tokenIdOfUrl(cur);
    if (!id) return 0;
    const tier = tokenTierPick[id];
    if (!tier) return 0;                         
    const nv = tokenIconFor(id, tier, cur);
    if (!nv || nv === cur) return 0;
    try {
      if (!tokenOrig.has(im)) tokenOrig.set(im, cur);
      im.setAttribute("src", nv);
      return 1;
    } catch (e) { return 0; }
  }

  function applySummonerToken(force) {
    try { applyTokenSlots(false); } catch (e) {  }
    const imgs = deepFindCached(TOKEN_IMG_SEL, 40, force === true ? 0 : 1500);
    if (!imgs.length) return 0;
    let n = 0;
    for (let i = 0; i < imgs.length; i++) {
      const im = imgs[i];
      watchTokenImg(im);
      try { n += fixWornImg(im); } catch (e) {  }
    }
    return n;
  }

  const TOKEN_SLOT_N = 3;   
  const TOKEN_SLOT_SEL = ".challenges-identity-customizer-mini-tokens-container .mini-token";
  const TOKEN_SLOT_WRAP = ".challenges-identity-customizer-mini-tokens-container";
  const TOKEN_SLOT_BOX = ".achievement-token-container";
  const TOKEN_SLOT_ATTR = "data-" + NS + "-tokenslot";
  const tokenMade = new WeakSet();        
  const tokenSlotArmed = new WeakSet();   
  let scanSig = "";                       
  let tokenPoke = 0;                      

  function tokenSlots(force) {
    return deepFindCached(TOKEN_SLOT_SEL, 8, force === true ? 0 : 1200, true);
  }
  function slotBox(slot) {
    if (!slot) return null;
    try {
      if (slot.classList && slot.classList.contains("achievement-token-container")) return slot;
      return slot.querySelector(TOKEN_SLOT_BOX) || slot;
    } catch (e) { return null; }
  }
  function slotImgEl(slot) {
    const b = slotBox(slot);
    if (!b) return null;
    try { return b.querySelector("img.achievement-token") || b.querySelector("img") || null; }
    catch (e) { return null; }
  }
  function slotIsEmpty(slot) {
    if (!slot || slotImgEl(slot)) return false;
    const b = slotBox(slot);
    try { return !!(b && b.classList && b.classList.contains("empty")); } catch (e) { return false; }
  }
  function slotIndexOfSlot(slot, slots) {
    for (let i = 0; i < slots.length; i++) if (slots[i] === slot) return i;
    return -1;
  }
  function firstFreeSlot() {
    for (let i = 0; i < TOKEN_SLOT_N; i++) {
      const s = state.regaliaSlots[i];
      if (!s || !s.url) return i;
    }
    return -1;
  }
  function slotOfTokenId(id) {
    if (!id) return -1;
    for (let i = 0; i < TOKEN_SLOT_N; i++) {
      const s = state.regaliaSlots[i];
      if (s && s.id && String(s.id) === String(id)) return i;
    }
    return -1;
  }
  function pokeChallengeCatalog() {
    if (tokenPoke >= 4) return 0;
    let have = -2, why = "";
    try {
      const a = window.__PRISM_ENGINE;
      if (!a) why = "no-engine";
      else if (typeof a.challengeTokenCatalogSize !== "function") why = "no-api";
      else { have = a.challengeTokenCatalogSize(); why = (have > 0) ? "ok" : "empty"; }
    } catch (e) { have = -1; why = "threw"; }
    if (have > 0) {
      tokenPoke = 4;
      diag("ident-token-poke", { skip: "catalog-ok", n: have });
      return 0;
    }
    tokenPoke++;
    try {
      const u = "/lol-challenges/v1/challenges/local-player";
      if (typeof window.fetch === "function") { window.fetch(u, { method: "GET" }); }
      else { const x = new XMLHttpRequest(); x.open("GET", u, true); x.send(); }
    } catch (e) {  }
    diag("ident-token-poke", { n: tokenPoke, why: why, have: have });
    return 1;
  }

  function slotProbe() {
    const out = [];
    const slots = tokenSlots(true);
    for (let i = 0; i < slots.length && i < TOKEN_SLOT_N; i++) {
      const slot = slots[i];
      const b = slotBox(slot);
      const im = slotImgEl(slot);
      const o = { i: i, cls: "", src: "", w: 0, h: 0, op: "", fl: "", bop: "", bfl: "", ours: false };
      try { o.ours = !!(im && tokenMade.has(im)); } catch (e) { o.ours = false; }
      try { o.cls = b ? String(b.className || "") : "(no-box)"; } catch (e) {  }
      try {
        if (im) {
          const r = im.getBoundingClientRect();
          o.w = Math.round(r.width); o.h = Math.round(r.height);
          const u = String(im.getAttribute("src") || "");
          o.src = u.length > 44 ? ("…" + u.slice(-44)) : u;
          const ci = window.getComputedStyle(im);
          o.op = String(ci.opacity); o.fl = String(ci.filter);
          o.nw = Number(im.naturalWidth || 0);
          o.nh = Number(im.naturalHeight || 0);
          o.ok = !!im.complete;
        }
      } catch (e) {  }
      try {
        if (b) {
          const cb = window.getComputedStyle(b);
          o.bop = String(cb.opacity); o.bfl = String(cb.filter);
        }
      } catch (e) {  }
      out.push(o);
    }
    return out;
  }

  function slotDump() {
    const out = [];
    const slots = tokenSlots(true);
    for (let i = 0; i < slots.length && i < TOKEN_SLOT_N; i++) {
      const im = slotImgEl(slots[i]);
      let ours = false;
      try { ours = !!(im && tokenMade.has(im)); } catch (e) { ours = false; }
      out.push({
        i: i,
        empty: slotIsEmpty(slots[i]),
        ours: ours,
        id: im ? tokenIdOfUrl(String(im.getAttribute("src") || "")) : "",   
        want: (state.regaliaSlots[i] || {}).id || "",                       
      });
    }
    return out;
  }

  function paintBox(b, url, id) {
    if (!b || !url) return 0;
    let im = null;
    try { im = b.querySelector("img.achievement-token") || b.querySelector("img") || null; }
    catch (e) { return 0; }
    try {
      if (!im) {
        im = document.createElement("img");
        im.className = "achievement-token";
        b.appendChild(im);
        tokenMade.add(im);
      } else if (!tokenOrig.has(im)) {
        tokenOrig.set(im, im.getAttribute("src"));   
      }
      if (b.classList && b.classList.contains("empty")) b.classList.remove("empty");
      try {
        const ph = b.querySelector(".empty");
        if (ph && ph !== im) ph.style.display = "none";
      } catch (e) {  }
      try {
        const r0 = im.getBoundingClientRect();
        if (r0.width < 2 || r0.height < 2) {
          let rw = 0, rh = 0;
          try {
            const p0 = b.parentNode || b;
            const cands = p0.querySelectorAll("img.achievement-token");
            for (let q = 0; q < cands.length; q++) {
              if (cands[q] === im) continue;
              const rq = cands[q].getBoundingClientRect();
              if (rq.width >= 2 && rq.height >= 2) { rw = rq.width; rh = rq.height; break; }
            }
          } catch (e0) {  }
          const w0 = Math.round(rw || 32), h0 = Math.round(rh || 32);
          im.style.width = w0 + "px";
          im.style.height = h0 + "px";
          diag("ident-token-size-fallback", { w: w0, h: h0, from: rw ? "sibling" : "default" });
        }
      } catch (e0) {  }
      im.setAttribute(TOKEN_SLOT_ATTR, String(id || tokenIdOfUrl(url)));
      if (String(im.getAttribute("src") || "") !== url) im.setAttribute("src", url);
      return 1;
    } catch (e) { return 0; }
  }

  let _fgSlotCache = { at: 0, key: "", v: null };
  function forgeTokenSlots() {
    const fg = forgeData();
    const key = (fg && fg.tokenIds && fg.tokenIds.length)
      ? fg.tokenIds.join(",") + "|" + (fg.tokenTiers || []).join(",") : "";
    const now = Date.now();
    if (_fgSlotCache.key === key && (now - _fgSlotCache.at) < 800) return _fgSlotCache.v;
    _fgSlotCache = { at: now, key: key, v: null };
    if (!fg) return null;
    if (!key) return [{ id: "", url: "" }, { id: "", url: "" }, { id: "", url: "" }];
    const out = [];
    for (let i = 0; i < TOKEN_SLOT_N; i++) {
      const id = String(fg.tokenIds[i] || "");
      if (!id) { out.push({ id: "", url: "" }); continue; }
      let u = "";
      try {
        const ic = fg.tokenIcons && fg.tokenIcons[i];
        if (ic) u = String(ic);
      } catch (e) { u = ""; }
      if (!u) {
        let tier = "";
        try { tier = (fg.tokenTiers && fg.tokenTiers[i]) || tokenTopTier(id); }
        catch (e) { tier = ""; }
        try { u = tokenIconFor(id, tier, ""); } catch (e) { u = ""; }
      }
      out.push({ id: id, url: u });
    }
    _fgSlotCache.v = out;
    return out;
  }

  function paintSlotAt(idx, url, force, idOverride) {
    if (!url) return 0;
    const slots = tokenSlots(force === true);     
    const slot = slots[idx];
    if (!slot) return 0;
    return paintBox(slotBox(slot), url, idOverride !== undefined ? idOverride
                                                               : (state.regaliaSlots[idx] || {}).id);
  }

  const TOKEN_TIP_ATTR = "data-" + NS + "-token-tip";
  const TOKEN_TIP_CLS = NS + "-ttip";
  const TOKEN_MODE_CN = { CLASSIC: "召唤师峡谷", ARAM: "极乐净土", ARURF: "无限火力",
                          TFT: "云顶之弈", NEXUSBLITZ: "无双剑姬", URF: "无限火力" };
  const TOKEN_MODE_ICON = { CLASSIC: "icon-map-classic", ARAM: "icon-map-aram",
                            CHERRY: "icon-map-cherry" };
  const TOKEN_ASSET = "/fe/lol-static-assets/images/challenges-shared/";

  const TOKEN_TIP_CSS = `
.` + TOKEN_TIP_CLS + `{position:fixed;z-index:2147483001;pointer-events:none;display:none}
.` + TOKEN_TIP_CLS + ` .challenge-item-tooltip-component{display:block}
.` + TOKEN_TIP_CLS + ` .prism-ttip-pick{color:#c8aa6e;font-size:11px;margin:8px 15px 0}
`;

  let tokenTipHost = null, tokenTipBody = null, tokenTipIm = null;

  function tokenDetailApi() {
    const a = window.__PRISM_ENGINE;
    if (!a || typeof a.challengeTokenDetail !== "function") return null;
    return a;
  }

  function tokenRewardIcon(file) {
    const box = tipEl("div", "challenge-item-reward-icon-container");
    const im = tipEl("img", "challenge-item-reward-icon");
    im.setAttribute("src", TOKEN_ASSET + file);
    box.appendChild(im);
    return box;
  }

  function tipEl(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = String(text);
    return d;
  }

  function buildTokenTip() {
    if (tokenTipHost) return tokenTipHost;
    const st = document.createElement("style");
    st.textContent = TOKEN_TIP_CSS;
    document.head.appendChild(st);
    const host = document.createElement("div");
    host.className = TOKEN_TIP_CLS;
    host.setAttribute(TOKEN_TIP_ATTR, "1");
    const body = document.createElement("div");
    body.className = "challenge-item-tooltip-component";
    host.appendChild(body);
    document.body.appendChild(host);
    tokenTipHost = host;
    tokenTipBody = body;
    return host;
  }

  function renderTokenTip(d) {
    const b = tokenTipBody;
    if (!b) return 0;
    while (b.firstChild) b.removeChild(b.firstChild);

    const hd = tipEl("div", "challenge-item-tooltip-header-container");
    const modeCn = d.mode ? (TOKEN_MODE_CN[String(d.mode).toUpperCase()] || "") : "";
    if (modeCn) {
      const mc = tipEl("div", "challenge-item-tooltip-map-container");
      const icoCls = TOKEN_MODE_ICON[String(d.mode).toUpperCase()] || "";
      const ik = tipEl("div", "challenge-item-tooltip-map-icon"
        + (icoCls ? (" " + icoCls) : (d.headerIcon ? (" " + String(d.headerIcon)) : "")));
      mc.appendChild(ik);
      mc.appendChild(tipEl("div", null, "仅限【" + modeCn + "】"));
      hd.appendChild(mc);
    }
    if (d.points) {
      const pc = tipEl("div", "challenge-item-tooltip-points-container");
      if (d.ribbon) {
        const bg = tipEl("img", "challenge-item-points-background");
        bg.setAttribute("src", String(d.ribbon));
        pc.appendChild(bg);
      }
      pc.appendChild(tipEl("div", "challenge-item-points", d.points));
      hd.appendChild(pc);
    }
    b.appendChild(hd);

    const wantTier = tokenTierPick[String(d.id)] || d.level || tokenTopTier(String(d.id));
    const cc = tipEl("div", "tooltip-content-container");
    const ic = tipEl("div", "tooltip-icon-container");
    const iu = tokenIconFor(String(d.id), wantTier, "");
    if (iu) {
      const im = tipEl("img", "tooltip-icon");
      im.setAttribute("src", iu);
      ic.appendChild(im);
    }
    cc.appendChild(ic);
    const dt = tipEl("div", "tooltip-details-container");
    dt.appendChild(tipEl("div", "tooltip-title", d.name || ("挑战 " + d.id)));
    const cn = TOKEN_TIER_CN[String(wantTier).toUpperCase()] || "";
    dt.appendChild(tipEl("div", "tooltip-tier", cn ? (cn + "阶") : ""));
    if (d.percentile != null) {
      const pp = tipEl("div", "tooltip-position-percentile" + (d.apex ? " apex" : ""));
      pp.appendChild(tipEl("div", "icon-people"));
      pp.appendChild(tipEl("div", null, d.percentile + "%的玩家已获取"));
      dt.appendChild(pp);
    }
    if (d.desc) dt.appendChild(tipEl("div", "tooltip-description", d.desc));
    cc.appendChild(dt);
    b.appendChild(cc);

    if (d.group) {
      const rc = tipEl("div", "challenge-item-reward-container");
      rc.appendChild(tokenRewardIcon("icon-capstone.svg"));      
      const rcc = tipEl("div", "challenge-item-reward-content");
      rcc.appendChild(tipEl("div", "challenge-item-reward-value", d.group));
      rc.appendChild(rcc);
      b.appendChild(rc);
    }

    b.appendChild(tipEl("div", "challenge-item-horizontal-line"));
    const nr = tipEl("div", "challenge-item-next-rewards-container");
    nr.appendChild(tipEl("div", "challenge-item-next-rewards-header", "下一级奖励"));
    const rr = tipEl("div", "challenge-item-reward-container");
    rr.appendChild(tokenRewardIcon("icon_points.svg"));        
    const rrc = tipEl("div", "challenge-item-reward-content");
    rrc.appendChild(tipEl("div", "challenge-item-reward-value",
      d.nextReward ? (d.nextReward + "核心进度") : "已是最高等级"));
    rr.appendChild(rrc);
    nr.appendChild(rr);
    b.appendChild(nr);

    b.appendChild(tipEl("div", "prism-ttip-pick",
      d.own ? "账号已拥有" : "本机显示（账号未拥有）"));
    return 1;
  }

  function showTokenTip(im) {
    const id = String(im.getAttribute(TOKEN_SLOT_ATTR) || "");
    if (!id) { diag("ident-token-tip-skip", { why: "no-id" }); return 0; }
    const api = tokenDetailApi();
    if (!api) { diag("ident-token-tip-skip", { why: "no-engine-api", id: id }); return 0; }
    let d = null;
    try { d = api.challengeTokenDetail(id); } catch (e) { d = null; }
    if (!d) {
      diag("ident-token-tip-skip", { why: "no-detail", id: id });
      try { pokeChallengeCatalog(); } catch (e) {  }
      return 0;
    }
    try { buildTokenTip(); renderTokenTip(d); }
    catch (e) {
      diag("ident-token-tip-skip", { why: "render-error", id: id,
                                     msg: String((e && e.message) || e) });
      return 0;
    }
    const host = tokenTipHost;
    host.style.display = "block";
    host.style.left = "0px";
    host.style.top = "0px";
    let w = 300, h = 200;
    try { const bb = host.getBoundingClientRect(); w = bb.width; h = bb.height; } catch (e) {  }
    let l = 0, t = 0;
    try { const r = im.getBoundingClientRect(); l = r.left + r.width / 2 - w / 2; t = r.top - h - 10; } catch (e) {  }
    const vw = window.innerWidth || 1280;
    l = Math.max(4, Math.min(l, vw - w - 4));
    if (t < 4) {
      try { t = im.getBoundingClientRect().bottom + 10; } catch (e) { t = 4; }
    }
    host.style.left = l + "px";
    host.style.top = t + "px";
    tokenTipIm = im;
    diag("ident-token-tip", { id: id, own: !!d.own, level: d.level, w: w, h: h });
    return 1;
  }

  function hideTokenTip() {
    tokenTipIm = null;
    if (!tokenTipHost) return;
    try { tokenTipHost.style.display = "none"; } catch (e) {  }
  }

  function tokenTipHit(e) {
    let path = null;
    try { path = (e && typeof e.composedPath === "function") ? e.composedPath() : null; }
    catch (err) { path = null; }
    if (!path) return null;
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (!n || n.nodeType !== 1) continue;
      if (!n.classList || !n.classList.contains("achievement-token")) continue;
      let mine = false;
      try { mine = tokenMade.has(n); } catch (err) { mine = false; }
      if (!mine) continue;                      
      let id = String(n.getAttribute(TOKEN_SLOT_ATTR) || "");
      if (!id) {
        const src = String(n.getAttribute("src") || "");
        id = tokenIdOfUrl(src);
        if (!id) {
          for (let k = 0; k < TOKEN_SLOT_N; k++) {
            const sl = state.regaliaSlots[k];
            if (sl && sl.url === src && sl.id) { id = String(sl.id); break; }
          }
        }
        if (id) { try { n.setAttribute(TOKEN_SLOT_ATTR, id); } catch (err) {  } }
      }
      if (id) return n;
    }
    return null;
  }


  const TOKEN_BANNER_WRAP = ".challenge-banner-container";
  const TOKEN_BANNER_TOKEN_CONT = ".challenge-banner-token-container";
  const TOKEN_BANNER_BOX = ".achievement-token-container";
  const tokenBannerArmed = new WeakSet();
  const tokenLeftArmed = new WeakSet();     

  function bannerBoxes(force) {
    return deepFindCached(TOKEN_BANNER_TOKEN_CONT + " " + TOKEN_BANNER_BOX, 24,
                          force === true ? 0 : 1200, true);
  }
  function bannerGroups(force) {
    const conts = deepFindCached(TOKEN_BANNER_TOKEN_CONT, 16, force === true ? 0 : 1200, true);
    const out = [];
    for (let i = 0; i < conts.length; i++) {
      const bs = [];
      try {
        const raw = conts[i].querySelectorAll(TOKEN_BANNER_BOX);
        for (let j = 0; j < raw.length; j++) bs.push(raw[j]);
      } catch (e) {  }
      if (bs.length) out.push(bs);
    }
    if (!out.length) {
      const flat = bannerBoxes(force === true);
      if (flat.length) out.push(flat);
    }
    return out;
  }
  function tokenAnatomy() {
    const out = [];
    let imgs = [];
    try { imgs = deepFind("img.achievement-token", 40); } catch (e) { imgs = []; }
    for (let i = 0; i < imgs.length && i < 14; i++) {
      const im = imgs[i], chain = [];
      let nd = im.parentNode, d = 0;
      while (nd && d < 6) {
        try {
          if (nd.classList) {
            const c0 = String(nd.className || "").replace(/\s+/g, " ").trim().slice(0, 34);
            chain.push(c0 || nd.tagName);
          } else { chain.push(nd.tagName || "?"); }
        } catch (e) {  }
        nd = nd.parentNode; d++;
      }
      let r = null;
      try { r = im.getBoundingClientRect(); } catch (e) { r = null; }
      let mine = false;
      try { mine = tokenMade.has(im); } catch (e) { mine = false; }
      out.push({ mine: mine, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
                 nw: Number(im.naturalWidth || 0),
                 top: r ? Math.round(r.top) : 0, left: r ? Math.round(r.left) : 0,
                 chain: chain.join(" < ") });
    }
    return out;
  }

  function reportBanner(groups, total, filled, tag) {
    let dump = [];
    try {
      for (let g2 = 0; g2 < groups.length; g2++) {
        const row = { g: g2, cells: [] };
        for (let k2 = 0; k2 < groups[g2].length; k2++) {
          const bx = groups[g2][k2], im2 = slotImgEl(bx);
          let mine2 = false, w2 = 0, h2 = 0;
          try { mine2 = !!(im2 && tokenMade.has(im2)); } catch (e2) { mine2 = false; }
          try { if (im2) { const r2 = im2.getBoundingClientRect(); w2 = Math.round(r2.width); h2 = Math.round(r2.height); } }
          catch (e2) {  }
          row.cells.push({ i: k2, hasImg: !!im2, ours: mine2, w: w2, h: h2,
                           empty: !!(bx.classList && bx.classList.contains("empty")),
                           nw: im2 ? Number(im2.naturalWidth || 0) : 0,
                           src: im2 ? String(im2.getAttribute("src") || "").slice(-34) : "" });
        }
        dump.push(row);
      }
    } catch (e2) { dump = []; }
    diag("ident-token-banner", { groups: groups.length, boxes: total, filled: filled, at: tag, dump: dump });
  }

  const TOKEN_LEFT_SEL =
    ".challenges-identity-customizer-banner-container .banner-tokens-container .banner-token";
  let leftSig = "";

  function leftBoxes(force) {
    return deepFindCached(TOKEN_LEFT_SEL, 12, force === true ? 0 : 1200, true);
  }
  function slotManaged(box) {
    let im = null;
    try { im = slotImgEl(box); } catch (e) { im = null; }
    if (!im) return false;
    try { if (tokenMade.has(im)) return true; } catch (e) {  }
    try { return !!im.getAttribute(TOKEN_SLOT_ATTR); } catch (e) { return false; }
  }
  function clearManagedAt(box) {
    const im = slotImgEl(box);
    if (!im) return 0;
    let mine = false;
    try { mine = tokenMade.has(im); } catch (e) { mine = false; }
    if (!mine) return 0;                       
    try {
      if (im.parentNode) im.parentNode.removeChild(im);
      const b0 = slotBox(box);
      if (b0 && b0.classList) b0.classList.add("empty");
      tokenMade.delete(im);
      return 1;
    } catch (e) { return 0; }
  }
  function fillSlotFromState(box, idx) {
    const f = forgeTokenSlots();                    
    const sl = f ? f[idx] : state.regaliaSlots[idx];
    const managed = slotManaged(box);
    if (!sl || !sl.url) {
      return managed ? clearManagedAt(box) : 0;    
    }
    if (slotImgEl(box) && !managed) return 0;      
    return paintBox(slotBox(box), sl.url, sl.id);
  }

  function applyLeftSlots(force) {
    const boxes = leftBoxes(force === true);
    if (!boxes.length) return 0;
    let n = 0;
    for (let i = 0; i < boxes.length && i < TOKEN_SLOT_N; i++) {
      n += fillSlotFromState(boxes[i], i);
    }
    const sig = boxes.length + ":" + n;
    if (n > 0 && leftSig !== sig) {
      leftSig = sig;
      diag("ident-token-left", { boxes: boxes.length, filled: n });
    }
    return n;
  }
  function clearLeftSlots() {
    const boxes = leftBoxes(true);
    let n = 0;
    for (let i = 0; i < boxes.length; i++) {
      const im = slotImgEl(boxes[i]);
      if (!im) continue;
      let mine = false;
      try { mine = tokenMade.has(im); } catch (e) { mine = false; }
      if (!mine) continue;
      try {
        if (im.parentNode) im.parentNode.removeChild(im);
        const b = slotBox(boxes[i]);
        if (b && b.classList && !b.classList.contains("empty")) b.classList.add("empty");
        tokenMade.delete(im);
        n++;
      } catch (e) {  }
    }
    return n;
  }

  function applyBannerSlots(force) {
    const groups = bannerGroups(force === true);
    if (!groups.length) return 0;
    let n = 0, total = 0;
    for (let g = 0; g < groups.length; g++) {
      const boxes = groups[g];
      total += boxes.length;
      for (let i = 0; i < boxes.length && i < TOKEN_SLOT_N; i++) {
        n += fillSlotFromState(boxes[i], i);
      }
    }
    if (n > 0) {
      reportBanner(groups, total, n, "now");
      try { setTimeout(function () { reportBanner(groups, total, n, "after"); }, 400); }
      catch (e2) {  }
    }
    return n;
  }
  function clearBannerSlots() {
    const groups = bannerGroups(true);
    let n = 0;
    for (let g = 0; g < groups.length; g++) {
      const boxes = groups[g];
      for (let i = 0; i < boxes.length; i++) {
        const im = slotImgEl(boxes[i]);
        if (!im) continue;
        let mine = false;
        try { mine = tokenMade.has(im); } catch (e) { mine = false; }
        if (!mine) continue;
        try {
          if (im.parentNode) im.parentNode.removeChild(im);
          const b = slotBox(boxes[i]);
          if (b && b.classList && !b.classList.contains("empty")) b.classList.add("empty");
          tokenMade.delete(im);
          n++;
        } catch (e) {  }
      }
    }
    return n;
  }

  function applyTokenSlots(force) {
    const slots = tokenSlots(force === true);
    let n = 0;
    const fslots = forgeTokenSlots();   
    for (let i = 0; i < slots.length && i < TOKEN_SLOT_N; i++) {
      const s = fslots ? fslots[i] : state.regaliaSlots[i];
      if (!s || !s.url) {
        if (fslots) n += clearSlotAt(i);
        continue;
      }
      n += paintSlotAt(i, s.url, force === true, s.id);
    }
    n += applyBannerSlots(force);
    n += applyLeftSlots(force);
    try {
      const gcont = deepFindCached(TOKEN_BANNER_TOKEN_CONT, 16, 1200, true).length;
      const mwrap = deepFindCached(TOKEN_SLOT_WRAP, 4, 1200, true).length;
      const sig = slots.length + "/" + mwrap + "/" + gcont;
      if (scanSig !== sig) {
        scanSig = sig;
        diag("ident-token-scan", { mini: slots.length, miniWraps: mwrap,
                                   bannerConts: gcont, picked: n,
                                   probe: slotProbe(), anatomy: tokenAnatomy() });
      }
    } catch (e) {  }
    return n;
  }
  function clearSlotAt(idx) {
    const slots = tokenSlots(true);
    const slot = slots[idx];
    if (!slot) return 0;
    const im = slotImgEl(slot);
    if (!im) return 0;
    let mine = false;
    try { mine = tokenMade.has(im); } catch (e) { mine = false; }
    const b = slotBox(slot);
    try {
      if (mine) {
        if (im.parentNode) im.parentNode.removeChild(im);
        if (b && b.classList) b.classList.add("empty");
        tokenMade.delete(im);
      } else {
        if (tokenOrig.has(im)) {
          const o = tokenOrig.get(im);
          if (o === null || o === undefined || o === "") im.removeAttribute("src");
          else im.setAttribute("src", o);
          tokenOrig.delete(im);
        }
        try { im.removeAttribute(TOKEN_SLOT_ATTR); } catch (e) {  }
      }
      return 1;
    } catch (e) { return 0; }
  }
  function clearMadeTokenSlots() {
    let n = 0;
    for (let i = 0; i < TOKEN_SLOT_N; i++) n += clearSlotAt(i);
    n += clearBannerSlots();
    n += clearLeftSlots();        
    return n;
  }
  let tokenPagePending = false, tokenPageHits = 0;
  const TOKEN_HOT_CLS = ["banner-token", "mini-token",
                         "challenge-banner-token-container",
                         "challenges-identity-customizer-banner-container",
                         "challenges-identity-customizer-mini-tokens-container"];
  function tokenHotNode(nd) {
    if (!nd || nd.nodeType !== 1) return false;
    try {
      const cl = nd.classList;
      if (cl) {
        for (let h = 0; h < TOKEN_HOT_CLS.length; h++) {
          if (cl.contains(TOKEN_HOT_CLS[h])) return true;
        }
      }
      if (nd.querySelector) {
        for (let h = 0; h < TOKEN_HOT_CLS.length; h++) {
          if (nd.querySelector("." + TOKEN_HOT_CLS[h])) return true;
        }
      }
    } catch (e) {  }
    return false;
  }
  function armTokenPageObserver() {
    if (window.__prismTokenPageBound) return 0;
    window.__prismTokenPageBound = true;
    if (typeof MutationObserver !== "function") return 0;
    try {
      new MutationObserver(function (muts) {
        let hit = false;
        for (let i = 0; i < muts.length && !hit; i++) {
          const ad = muts[i].addedNodes;
          if (ad.length > 60) continue;              
          for (let j = 0; j < ad.length; j++) {
            if (tokenHotNode(ad[j])) { hit = true; break; }
          }
        }
        if (!hit || tokenPagePending) return;
        tokenPagePending = true;
        try {
          Promise.resolve().then(function () {       
            tokenPagePending = false;
            tokenPageHits++;
            try { armTokenSlots(); } catch (e) {  }
            try { applyTokenSlots(true); } catch (e) {  }
            diag("ident-token-page-hit", { n: tokenPageHits });
          });
        } catch (e) { tokenPagePending = false; }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {  }
    return 1;
  }

  function armTokenSlots() {
    if (typeof MutationObserver !== "function") return 0;
    const wraps = deepFindCached(TOKEN_SLOT_WRAP, 2, 1200);
    let n = 0;
    for (let i = 0; i < wraps.length; i++) {
      const w = wraps[i];
      try { if (tokenSlotArmed.has(w)) continue; tokenSlotArmed.add(w); } catch (e) { continue; }
      try {
        new MutationObserver(function () {
          try { applyTokenSlots(true); } catch (e) {  }
        }).observe(w, { childList: true, subtree: true });
        try { applyTokenSlots(true); } catch (e) {  }
        n++;
      } catch (e) {  }
    }
    const leftWraps = deepFindCached(
      ".challenges-identity-customizer-banner-container .banner-tokens-container", 6, 1200, true);
    for (let l = 0; l < leftWraps.length; l++) {
      const lw = leftWraps[l];
      try { if (tokenLeftArmed.has(lw)) continue; tokenLeftArmed.add(lw); } catch (e) { continue; }
      try {
        new MutationObserver(function () {
          try { applyLeftSlots(true); } catch (e) {  }
        }).observe(lw, { childList: true, subtree: true });
        try { applyLeftSlots(true); } catch (e) {  }
        n++;
      } catch (e) {  }
    }
    const bannerWraps = deepFindCached(TOKEN_BANNER_TOKEN_CONT, 16, 1200, true);
    for (let j = 0; j < bannerWraps.length; j++) {
      const bw = bannerWraps[j];
      try { if (tokenBannerArmed.has(bw)) continue; tokenBannerArmed.add(bw); } catch (e) { continue; }
      try {
        new MutationObserver(function () {
          try { applyBannerSlots(true); } catch (e) {  }
        }).observe(bw, { childList: true, subtree: true });
        try { applyBannerSlots(true); } catch (e) {  }
        n++;
      } catch (e) {  }
    }
    return n;
  }


  function identCardHit(e) {
    let path = null;
    try { path = (e && typeof e.composedPath === "function") ? e.composedPath() : null; }
    catch (err) { path = null; }
    if (!path || !path.length) return null;
    let iconUrl = "", tokenUrl = "", tokenId = "", passOfficial = false;
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (!n || n.nodeType !== 1 || !n.classList) continue;
      if (!iconUrl && n.classList.contains(IDENT_ICON_CARD_CLS)) {
        const im = n.querySelector("img.identity-customizer-icon");
        if (im) iconUrl = String(im.getAttribute("src") || "");
      }
      if (!tokenUrl && !passOfficial && n.classList.contains(IDENT_TOKEN_CARD_CLS)) {
        const im = n.querySelector(TOKEN_CARD_SEL) || n.querySelector("img");
        if (im) {
          const raw = String(im.getAttribute("src") || "");
          const cid = tokenIdOfCard(n);
          if (tokenOwned(cid) === true) {
            passOfficial = true;
          }
          else {
            const want = tokenWantTier(cid);
            tokenUrl = want ? (tokenIconFor(cid, want, raw) || raw) : raw;
            tokenId = cid;                      
          }
        }
      }
    }
    if (passOfficial) return null;                 
    if (iconUrl) return { kind: "icon", url: iconUrl };
    if (tokenUrl) return { kind: "token", url: tokenUrl, id: tokenId };
    return null;
  }

  function applyIdentCardPick(hit) {
    if (hit.kind === "icon") {
      if (state.regaliaIcon.url === hit.url) {          
        state.regaliaIcon.url = "";
        saveSummonerIcon();
        const m = revertSummonerIcon();
        diag("ident-icon-pick", { off: true, n: m });
        return;
      }
      state.regaliaIcon.url = hit.url;
      saveSummonerIcon();
      const n = applySummonerIcon(true);
      diag("ident-icon-pick", { url: hit.url, n: n });
      return;
    }
    if (hit.kind === "token") {
      const id = String(hit.id || tokenIdOfUrl(hit.url) || "");
      const at = slotOfTokenId(id);
      if (at >= 0) {
        state.regaliaSlots[at] = { id: "", url: "" };
        saveSummonerToken();
        const m = clearSlotAt(at);
        diag("ident-token-pick", { off: true, slot: at, id: id, n: m, dump: slotDump() });
        return;
      }
      let k = state.regaliaActiveSlot;
      if (k < 0 || k >= TOKEN_SLOT_N) k = firstFreeSlot();
      if (k < 0) k = 0;
      state.regaliaSlots[k] = { id: id, url: hit.url };
      state.regaliaToken.url = hit.url;    
      saveSummonerToken();
      const n = applyTokenSlots(true);
      diag("ident-token-pick", { url: hit.url, id: id, slot: k, n: n, dump: slotDump() });
      return;
    }
  }


  const TOKEN_TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND",
                            "MASTER", "GRANDMASTER", "CHALLENGER"];
  const TOKEN_TIER_CN = {
    IRON: "黑铁", BRONZE: "青铜", SILVER: "白银", GOLD: "黄金", PLATINUM: "铂金",
    DIAMOND: "钻石", MASTER: "大师", GRANDMASTER: "宗师", CHALLENGER: "王者"
  };
  const TOKEN_TIER_STORE_KEY = SETTINGS_KEY + ".tokentier";
  const TOKEN_CARD_SEL = "img.identity-customizer-token";
  const TOKEN_GRID_SEL = ".challenges-identity-customizer-grid";
  const TOKEN_GENERIC_DIR = "/fe/lol-static-assets/images/challenges-shared/icon_achievement_";
  const TOKEN_MENU_ATTR = "data-" + NS + "-token-tier-menu";

  let tokenTierPick = {};       
  let tokenMenuHost = null;     
  let tokenMenuCard = null;     
  let tokenMenuId = "";         
  let tokenMenuCur = "";        

  function saveTokenTier() {
    try { writeStored(TOKEN_TIER_STORE_KEY, JSON.stringify(tokenTierPick)); }
    catch (e) {  }
  }
  function loadTokenTier() {
    try {
      const raw = readStored(TOKEN_TIER_STORE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw), out = {};
      if (o && typeof o === "object") {
        Object.keys(o).forEach(function (k) {
          const t = String(o[k] || "").toUpperCase();
          if (TOKEN_TIER_ORDER.indexOf(t) >= 0) out[String(k)] = t;
        });
      }
      tokenTierPick = out;
    } catch (e) {  }
  }

  function tokenEngineApi() {
    const a = window.__PRISM_ENGINE;
    return (a && typeof a.challengeTokenInfo === "function" &&
            typeof a.challengeTokenIcon === "function") ? a : null;
  }

  function tokenOwned(id) {
    if (!id) return null;
    const api = tokenEngineApi();
    if (!api) return null;
    let info = null;
    try { info = api.challengeTokenInfo(String(id)); } catch (e) { info = null; }
    if (!info || typeof info.own !== "boolean") return null;
    return info.own;
  }

  function tokenTopTier(id) {
    if (!id) return "";
    const api = tokenEngineApi();
    if (!api) return "";
    let info = null;
    try { info = api.challengeTokenInfo(String(id)); } catch (e) { info = null; }
    const ts = (info && info.tiers && info.tiers.length) ? info.tiers : null;
    if (!ts) return "";
    const t = String(ts[ts.length - 1] || "").toUpperCase();
    return TOKEN_TIER_ORDER.indexOf(t) >= 0 ? t : "";
  }

  function tokenWantTier(id) {
    if (!id) return "";
    return tokenTierPick[id] || tokenTopTier(id) || "";
  }

  function tokenIdOfCard(card) {
    if (!card) return "";
    try {
      const id = String(card.id || "");
      if (id.indexOf("token-id-") === 0) return id.slice(9);
    } catch (e) {  }
    try {
      const im = card.querySelector
        ? (card.querySelector(TOKEN_CARD_SEL) || card.querySelector("img")) : null;
      if (im) return tokenIdOfUrl(String(im.getAttribute("src") || ""));
    } catch (e) {  }
    return "";
  }

  function tokenIdOfUrl(u) {
    const m = /\/Challenges\/Config\/(\d+)\//i.exec(String(u || ""));
    return m ? m[1] : "";
  }

  function tokenTierOfUrl(u) {
    const s = String(u || "");
    let m = /\/Tokens\/([A-Za-z]+)\.png$/i.exec(s);
    if (!m) m = /icon_achievement_([A-Za-z]+)\.png$/i.exec(s);
    if (!m) return "";
    const t = String(m[1]).toUpperCase();
    return TOKEN_TIER_ORDER.indexOf(t) >= 0 ? t : "";
  }

  function tokenUrlWithTier(u, tier) {
    const s = String(u || ""), t = String(tier || "").toUpperCase();
    if (TOKEN_TIER_ORDER.indexOf(t) < 0) return "";
    if (/\/Tokens\/[A-Za-z]+\.png$/i.test(s)) {
      return s.replace(/\/Tokens\/[A-Za-z]+\.png$/i, "/Tokens/" + t + ".png");
    }
    const m = /^(.*\/)icon_achievement_[A-Za-z]+\.png$/i.exec(s);
    if (m) return m[1] + "icon_achievement_" + t.toLowerCase() + ".png";
    return "";
  }

  function tokenIconFor(id, tier, curUrl) {
    const t = String(tier || "").toUpperCase();
    if (TOKEN_TIER_ORDER.indexOf(t) < 0) return "";
    const api = tokenEngineApi();
    if (api) {
      let info = null;
      try { info = api.challengeTokenInfo(String(id)); } catch (e) { info = null; }
      if (info && info.tiers && info.tiers.length) {
        let use = t;
        if (info.tiers.indexOf(use) < 0) {
          const want = TOKEN_TIER_ORDER.indexOf(t);
          for (let k = want; k >= 0; k--) {
            if (info.tiers.indexOf(TOKEN_TIER_ORDER[k]) >= 0) { use = TOKEN_TIER_ORDER[k]; break; }
          }
        }
        if (info.tiers.indexOf(use) >= 0) {
          try {
            const u = api.challengeTokenIcon(String(id), use);
            if (u) return String(u);
          } catch (e) {  }
        }
        return TOKEN_GENERIC_DIR + t.toLowerCase() + ".png";
      }
    }
    return tokenUrlWithTier(curUrl, t) || (TOKEN_GENERIC_DIR + t.toLowerCase() + ".png");
  }

  function fixTokenImg(im) {
    if (!im || !im.classList || !im.classList.contains("identity-customizer-token")) return 0;
    let card = null;
    try { card = im.closest("." + IDENT_TOKEN_CARD_CLS); } catch (e) { card = null; }
    const id = tokenIdOfCard(card);
    const want = tokenWantTier(id);
    if (!want) return 0;
    const cur = String(im.getAttribute("src") || "");
    const url = tokenIconFor(id, want, cur);
    if (!url || url === cur) return 0;
    try { im.setAttribute("src", url); return 1; } catch (e) { return 0; }
  }

  function applyTokenTierCards(force) {
    const imgs = deepFindCached(TOKEN_CARD_SEL, 60, force === true ? 0 : 1200);
    if (!imgs.length) return 0;
    let n = 0;
    for (let i = 0; i < imgs.length; i++) {
      try { n += fixTokenImg(imgs[i]); } catch (e) {  }
    }
    if (n > 0) {
      let picked = 0;
      try { picked = Object.keys(tokenTierPick).length; } catch (e) { picked = 0; }
      diag("ident-token-tier-apply", { cards: imgs.length, changed: n, picked: picked });
    }
    return n;
  }

  const tokenGridArmed = new WeakSet();
  function armTokenTierGrid() {
    if (typeof MutationObserver !== "function") return 0;
    const grids = deepFindCached(TOKEN_GRID_SEL, 4, 1200);
    let n = 0;
    for (let i = 0; i < grids.length; i++) {
      const g = grids[i];
      try { if (tokenGridArmed.has(g)) continue; tokenGridArmed.add(g); } catch (e) { continue; }
      try {
        new MutationObserver(function (recs) {
          for (let r = 0; r < recs.length; r++) {
            const rec = recs[r];
            try {
              if (rec.type === "attributes") { fixTokenImg(rec.target); continue; }
              const kids = rec.addedNodes || [];
              for (let k = 0; k < kids.length; k++) {
                const nd = kids[k];
                if (!nd || nd.nodeType !== 1) continue;
                if (nd.matches && nd.matches(TOKEN_CARD_SEL)) fixTokenImg(nd);
                if (nd.querySelectorAll) {
                  const l = nd.querySelectorAll(TOKEN_CARD_SEL);
                  for (let q = 0; q < l.length; q++) fixTokenImg(l[q]);
                }
              }
            } catch (e) {  }
          }
        }).observe(g, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
        try {
          const l = g.querySelectorAll(TOKEN_CARD_SEL);
          for (let q = 0; q < l.length; q++) fixTokenImg(l[q]);
        } catch (e) {  }
        n++;
      } catch (e) {  }
    }
    return n;
  }

  const TOKEN_MENU_CSS = `
.ttm-box{background:linear-gradient(180deg,#0a1428 0%,#010a13 100%);border:1px solid #c8aa6e;box-shadow:0 10px 28px rgba(0,0,0,.85);border-radius:2px;overflow:hidden}
.ttm-hd{padding:7px 10px;color:#f0e6d2;font-size:12px;letter-spacing:.4px;border-bottom:1px solid #1e2328;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ttm-list{max-height:392px;overflow-y:auto;padding:3px 0}
.ttm-row{display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;cursor:pointer}
.ttm-row:hover{background:rgba(200,170,110,.18)}
.ttm-row.cur{background:rgba(200,170,110,.10);border-left:3px solid #c8aa6e}
.ttm-ic{width:26px;height:26px;flex:0 0 26px;object-fit:contain}
.ttm-nm{flex:1 1 auto;color:#cdbe91;font-size:13px}
.ttm-mk{flex:0 0 auto;color:#c8aa6e;font-size:11px}
.ttm-sep{height:1px;background:#1e2328;margin:3px 0}
.ttm-ft{padding:6px 10px;color:#7a7a6a;font-size:11px;border-top:1px solid #1e2328;white-space:nowrap}
`;

  function buildTokenMenu() {
    if (tokenMenuHost) return tokenMenuHost;
    const host = document.createElement("div");
    host.setAttribute(TOKEN_MENU_ATTR, "1");
    host.style.cssText = "position:fixed;left:0;top:0;z-index:2147483000;display:none;";
    let root = host;
    try { if (host.attachShadow) root = host.attachShadow({ mode: "open" }); } catch (e) { root = host; }
    const st = document.createElement("style");
    st.textContent = TOKEN_MENU_CSS;
    const box = document.createElement("div");
    box.className = "ttm-box";
    const hd = document.createElement("div");
    hd.className = "ttm-hd";
    const list = document.createElement("div");
    list.className = "ttm-list";
    const ft = document.createElement("div");
    ft.className = "ttm-ft";
    ft.textContent = "只改本机显示 · 右键选档 · 左键点卡片佩戴";
    box.appendChild(hd); box.appendChild(list); box.appendChild(ft);
    root.appendChild(st); root.appendChild(box);
    try {
      list.addEventListener("click", onTokenMenuClick, true);
    } catch (e) {  }
    host.__prismRoot = root;
    host.__prismHd = hd;
    host.__prismList = list;
    document.body.appendChild(host);
    tokenMenuHost = host;
    return host;
  }

  function tokenMenuRow(id, tier, curUrl) {
    const row = document.createElement("div");
    row.className = "ttm-row" + (tier && tier === tokenMenuCur ? " cur" : "");
    row.setAttribute("data-tier", tier || "");
    const ic = document.createElement("img");
    ic.className = "ttm-ic";
    ic.setAttribute("src", tier ? tokenIconFor(id, tier, curUrl)
                                : (tokenIconFor(id, tokenTopTier(id), curUrl)
                                   || curUrl || TOKEN_GENERIC_DIR + "iron.png"));
    const nm = document.createElement("span");
    nm.className = "ttm-nm";
    nm.textContent = tier ? ((TOKEN_TIER_CN[tier] || tier) + " · " + tier) : "恢复默认（该勋章最高档）";
    const mk = document.createElement("span");
    mk.className = "ttm-mk";
    mk.textContent = (tier && tier === tokenMenuCur) ? "当前" : "";
    row.appendChild(ic); row.appendChild(nm); row.appendChild(mk);
    return row;
  }

  function openTokenTierMenu(card, x, y) {
    const im = (card.querySelector && (card.querySelector(TOKEN_CARD_SEL) || card.querySelector("img")))
      || null;
    if (!im) return 0;
    const id = tokenIdOfCard(card) || tokenIdOfUrl(String(im.getAttribute("src") || ""));
    if (!id) return 0;
    const curUrl = String(im.getAttribute("src") || "");
    const host = buildTokenMenu();
    const list = host.__prismList, hd = host.__prismHd;
    tokenMenuCard = card; tokenMenuId = id;
    tokenMenuCur = tokenTierOfUrl(curUrl) || tokenWantTier(id);
    let name = "";
    const api = tokenEngineApi();
    if (api) { try { const inf = api.challengeTokenInfo(id); name = (inf && inf.name) || ""; } catch (e) { name = ""; } }
    hd.textContent = (name ? name + " · " : "") + "选择佩戴档位";
    while (list.firstChild) list.removeChild(list.firstChild);
    const pick = tokenTierPick[id] || "";
    for (let i = TOKEN_TIER_ORDER.length - 1; i >= 0; i--) {
      list.appendChild(tokenMenuRow(id, TOKEN_TIER_ORDER[i], curUrl));
    }
    const sep = document.createElement("div");
    sep.className = "ttm-sep";
    list.appendChild(sep);
    const rst = tokenMenuRow(id, "", curUrl);
    rst.setAttribute("data-tier", "");
    rst.className = "ttm-row" + (pick ? "" : " cur");
    list.appendChild(rst);
    host.style.display = "block";
    host.style.left = "0px";
    host.style.top = "0px";
    let w = 0, h = 0;
    try {
      const b = host.getBoundingClientRect();
      w = b.width; h = b.height;
    } catch (e) { w = 250; h = 430; }
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
    const left = Math.max(4, Math.min(x, vw - w - 4));
    const top = Math.max(4, Math.min(y, vh - h - 4));
    host.style.left = left + "px";
    host.style.top = top + "px";
    diag("ident-token-menu", { id: id, cur: tokenMenuCur, pick: pick, w: w, h: h });
    return 1;
  }

  function closeTokenTierMenu() {
    if (!tokenMenuHost) return;
    try { tokenMenuHost.style.display = "none"; } catch (e) {  }
    tokenMenuCard = null; tokenMenuId = ""; tokenMenuCur = "";
  }

  function insideTokenMenu(e) {
    if (!tokenMenuHost) return false;
    let path = null;
    try { path = (e && typeof e.composedPath === "function") ? e.composedPath() : null; }
    catch (err) { path = null; }
    if (!path) return false;
    for (let i = 0; i < path.length; i++) if (path[i] === tokenMenuHost) return true;
    return false;
  }

  function onTokenMenuClick(e) {
    let row = null;
    try { row = e.target && e.target.closest ? e.target.closest(".ttm-row") : null; }
    catch (err) { row = null; }
    if (!row || !tokenMenuId) return;
    try { e.preventDefault(); e.stopPropagation(); } catch (err) {  }
    const tier = String(row.getAttribute("data-tier") || "").toUpperCase();
    const id = tokenMenuId;
    if (TOKEN_TIER_ORDER.indexOf(tier) >= 0) tokenTierPick[id] = tier;
    else delete tokenTierPick[id];
    saveTokenTier();
    const n = applyTokenTierCards(true);
    let wn = 0;
    const slotAt = slotOfTokenId(id);
    if (slotAt >= 0) {
      const cur2 = String((state.regaliaSlots[slotAt] || {}).url || "");
      const useT2 = tier || tokenTopTier(id);
      const u2 = useT2 ? tokenIconFor(id, useT2, cur2) : "";
      if (u2) {
        if (!state.regaliaSlots[slotAt]) state.regaliaSlots[slotAt] = { id: String(id), url: "" };
        state.regaliaSlots[slotAt].url = u2;
        if (tokenIdOfUrl(state.regaliaToken.url) === id) state.regaliaToken.url = u2;
        saveSummonerToken();
      }
      wn = applyTokenSlots(true);
      try { applySummonerToken(true); } catch (e) {  }
    } else if (tokenIdOfUrl(state.regaliaToken.url) === id) {
      const cur = String(state.regaliaToken.url || "");
      const useTier = tier || tokenTopTier(id);
      const u = useTier ? tokenIconFor(id, useTier, cur) : "";
      if (u && u !== cur) {
        state.regaliaToken.url = u;
        saveSummonerToken();
        wn = applySummonerToken(true);
      }
    }
    diag("ident-token-tier", { id: id, tier: tier || "(默认/" + tokenTopTier(id) + ")", cards: n, worn: wn });
    closeTokenTierMenu();
  }

  function installTokenTierEntry() {
    if (window.__prismTokenTierBound) return;
    window.__prismTokenTierBound = true;
    document.addEventListener("contextmenu", (e) => {
      let card = null, path = null;
      try { path = (typeof e.composedPath === "function") ? e.composedPath() : null; }
      catch (err) { path = null; }
      if (path && path.length) {
        for (let i = 0; i < path.length; i++) {
          const n = path[i];
          if (n && n.nodeType === 1 && n.classList && n.classList.contains(IDENT_TOKEN_CARD_CLS)) {
            card = n; break;
          }
        }
      }
      if (!card) { closeTokenTierMenu(); return; }   
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {  }
      try { openTokenTierMenu(card, e.clientX, e.clientY); }
      catch (err) { diag("ident-token-tier-error", { msg: String((err && err.message) || err) }); }
    }, true);
    document.addEventListener("mousedown", (e) => {
      if (!tokenMenuHost) return;
      if (!insideTokenMenu(e)) closeTokenTierMenu();   
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e && (e.key === "Escape" || e.keyCode === 27)) closeTokenTierMenu();
    }, true);
    document.addEventListener("scroll", (e) => {
      if (!tokenMenuHost) return;
      if (!insideTokenMenu(e)) closeTokenTierMenu();   
    }, true);
  }

  function installIdentCardEntry() {
    if (window.__prismIdentCardBound) return;      
    window.__prismIdentCardBound = true;
    document.addEventListener("click", (e) => {
      {
        let slot = null, sp = null;
        try { sp = (typeof e.composedPath === "function") ? e.composedPath() : null; }
        catch (err) { sp = null; }
        if (sp) {
          for (let i = 0; i < sp.length; i++) {
            const nd = sp[i];
            if (nd && nd.nodeType === 1 && nd.classList && nd.classList.contains("mini-token")) {
              slot = nd; break;
            }
          }
        }
        if (slot) {
          const slots = tokenSlots(true);
          const idx = slotIndexOfSlot(slot, slots);
          if (idx >= 0) state.regaliaActiveSlot = idx;
          diag("ident-token-slot-sel", { idx: idx, empty: slotIsEmpty(slot), dump: slotDump() });
          try { applyTokenSlots(true); } catch (err) {  }
        }
      }
      const hit = identCardHit(e);
      if (!hit) return;
      try { e.preventDefault(); } catch (err) {  }
      try { e.stopImmediatePropagation(); } catch (err) {  }
      try { e.stopPropagation(); } catch (err) {  }
      try { applyIdentCardPick(hit); }
      catch (err) { diag("ident-card-pick-error", { msg: String((err && err.message) || err) }); }
    }, true);
  }

  const ICON_ALL_URL = "/lol-game-data/assets/v1/profile-icons.json";
  const ICON_FILL_ATTR = "data-prism-icon";
  const ICON_FILL_MAX = 6000;                 
  const ICON_PANE_SELS = [
    ".challenges-identity-customizer-tab-icons-component",
    ".identity-customizer-tab-icons-component",
    '[class*="identity-customizer-tab-icons"]'
  ];
  let iconPaneCache = null, iconPaneAt = 0, iconFilling = false;

  function iconPane() {
    const now = Date.now();
    if (now - iconPaneAt < 1500) {
      if (!iconPaneCache) return null;
      try {
        if (iconPaneCache.isConnected) {
          const r0 = iconPaneCache.getBoundingClientRect();
          if (r0 && r0.width > 120 && r0.height > 80) return iconPaneCache;
        }
      } catch (e) {  }
    }
    for (let s = 0; s < ICON_PANE_SELS.length; s++) {
      const els = deepFind(ICON_PANE_SELS[s], 4);
      for (let i = 0; i < els.length; i++) {
        let r = null;
        try { r = els[i].getBoundingClientRect(); } catch (e) { r = null; }
        if (!r || r.width < 120 || r.height < 80) continue;
        iconPaneCache = els[i]; iconPaneAt = now;
        return els[i];
      }
    }
    iconPaneCache = null; iconPaneAt = now;
    return null;
  }

  function iconCardId(card) {
    try {
      const im = card.querySelector("img.identity-customizer-icon");
      if (!im) return "";
      const s = String(im.getAttribute("src") || "");
      const m = s.match(/profile-icons\/([0-9]+)\./);
      return m ? m[1] : "";
    } catch (e) { return ""; }
  }

  function iconLoadList() {
    if (state.regaliaIcon.list) return Promise.resolve(state.regaliaIcon.list);
    if (state.regaliaIcon.busy) return state.regaliaIcon.busy;
    const p = (async function () {
      const arr = (await lcuJson(ICON_ALL_URL)) || [];
      const out = [];
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (!it || !it.iconPath) continue;
        out.push({ id: String(it.id), iconPath: String(it.iconPath) });
      }
      if (!out.length) throw new Error("profile-icons.json 为空");
      state.regaliaIcon.list = out;
      return out;
    })();
    state.regaliaIcon.busy = p;
    const done = function () { state.regaliaIcon.busy = null; };
    return p.then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }

  function makeIconCell(tmplWrap, it) {
    let cell = null;
    try { cell = tmplWrap.cloneNode(true); } catch (e) { return null; }
    if (!cell || cell.nodeType !== 1) return null;
    try { stripEmberActions(cell); } catch (e) {  }
    try { cell.removeAttribute("id"); } catch (e) {  }
    try { cell.setAttribute(ICON_FILL_ATTR, String(it.id)); } catch (e) {  }
    let card = null;
    try {
      card = (cell.classList && cell.classList.contains(IDENT_ICON_CARD_CLS))
        ? cell : cell.querySelector("." + IDENT_ICON_CARD_CLS);
    } catch (e) { card = null; }
    if (!card) return null;
    try { card.removeAttribute("id"); } catch (e) {  }
    try { if (card.classList) card.classList.remove("selected"); } catch (e) {  }
    let ok = false;
    try {
      const im = card.querySelector("img.identity-customizer-icon");
      if (im) {
        try { im.setAttribute("loading", "lazy"); } catch (e2) {  }
        im.setAttribute("src", it.iconPath);
        ok = true;
      }
    } catch (e) {  }
    if (!ok) {
      try {
        const all = card.querySelectorAll("*");
        for (let i = 0; i < all.length && !ok; i++) {
          const sr = all[i].shadowRoot;
          if (!sr) continue;
          const im = sr.querySelector("img.identity-customizer-icon");
          if (im) { im.setAttribute("src", it.iconPath); ok = true; }
        }
      } catch (e) {  }
    }
    if (!ok) return null;
    try {
      const rar = cell.querySelector("img.identity-customizer-icon-rarity");
      if (rar && rar.parentElement) rar.parentElement.removeChild(rar);
    } catch (e) {  }
    return cell;
  }

  function fillIconGrid() {
    if (iconFilling) return 0;
    const pane = iconPane();
    if (!pane) return 0;
    let cards = null;
    try { cards = pane.querySelectorAll("." + IDENT_ICON_CARD_CLS); } catch (e) { return 0; }
    if (!cards || !cards.length) return 0;
    if (pane.__prismIconFilled === true) return 0;        

    const list = state.regaliaIcon.list;
    if (!list) {
      iconLoadList().then(function () {
        try { fillIconGrid(); } catch (e) {  }
      }).catch(function (e) {
        diag("ident-icon-fill-error", { msg: String((e && e.message) || e).slice(0, 120) });
      });
      return 0;
    }

    let base = null;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      let dirty = false;
      try { dirty = !!(c.parentNode && c.parentNode.getAttribute && c.parentNode.getAttribute(ICON_FILL_ATTR)); }
      catch (e) { dirty = false; }
      if (dirty) continue;
      try { if (c.getAttribute(ICON_FILL_ATTR)) continue; } catch (e) {  }
      base = c; break;
    }
    if (!base) base = cards[0];
    const wrap = base.parentNode;                          
    if (!wrap || wrap.nodeType !== 1) return 0;
    const grid = (wrap.parentNode && wrap.parentNode.nodeType === 1) ? wrap.parentNode : wrap;

    try {
      const dirtyOnes = grid.querySelectorAll("[" + ICON_FILL_ATTR + "]");
      for (let i = 0; i < dirtyOnes.length; i++) {
        const o = dirtyOnes[i];
        if (o.parentNode === grid) continue;
        if (o.parentNode && o.parentNode.removeChild) o.parentNode.removeChild(o);
      }
    } catch (e) {  }

    const have = {};
    let ourN = 0;
    try {
      const ours = grid.querySelectorAll("[" + ICON_FILL_ATTR + "]");
      for (let i = 0; i < ours.length; i++) {
        if (ours[i].parentNode !== grid) continue;
        const v = ours[i].getAttribute(ICON_FILL_ATTR);
        if (v) { have[v] = 1; ourN++; }
      }
    } catch (e) {  }
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].parentNode !== grid) continue;
      const id = iconCardId(cards[i]);
      if (id) have[id] = 1;
    }
    if (ourN >= list.length) { pane.__prismIconFilled = true; return 0; }

    iconFilling = true;
    let n = 0;
    try {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < list.length && n < ICON_FILL_MAX; i++) {
        const it = list[i];
        if (have[it.id]) continue;
        const cell = makeIconCell(wrap, it);
        if (!cell) continue;
        frag.appendChild(cell);
        n++;
      }
      if (n) grid.appendChild(frag);                       
    } catch (e) {  }
    iconFilling = false;

    if (n === 0 || ourN + n >= list.length) pane.__prismIconFilled = true;
    if (n) diag("ident-icon-fill", { n: n, total: list.length, ourN: ourN, grid: String(grid.className || "").slice(0, 30) });
    return n;
  }

  const crestRootObserved = new WeakSet();
  const crestRootObs = [];        
  let crestRootScanAt = 0;

  function armOneCrestRoot(sr) {
    if (!sr) return 0;
    try { if (crestRootObserved.has(sr)) return 0; crestRootObserved.add(sr); }
    catch (e) { return 0; }
    let n = 1;
    try {
      const ob = new MutationObserver(function (muts) {
        let hit = false;
        for (let k = 0; k < muts.length && !hit; k++) {
          const an = muts[k].addedNodes;
          for (let j = 0; j < an.length; j++) {
            const nd = an[j];
            if (!nd || nd.nodeType !== 1) continue;
            let tn = "";
            try { tn = String(nd.tagName || "").toLowerCase(); } catch (e2) { tn = ""; }
            if (tn.indexOf("crest") >= 0) { hit = true; break; }
          }
        }
        if (!hit) return;
        try { applySummonerIcon(true); } catch (e2) {  }
      });
      ob.observe(sr, { childList: true, subtree: true });
      crestRootObs.push(ob);
    } catch (e) {  }
    let all = null;
    try { all = sr.querySelectorAll("*"); } catch (e) { return n; }
    for (let i = 0; i < all.length; i++) {
      let s2 = null;
      try { s2 = all[i].shadowRoot; } catch (e) { s2 = null; }
      if (s2) n += armOneCrestRoot(s2);
    }
    return n;
  }

  function armCrestRoots(force) {
    const now = Date.now();
    if (!force && now - crestRootScanAt < 2000) return 0;
    try { if (iconPane()) return 0; } catch (e) {  }
    crestRootScanAt = now;
    let n = 0;
    let all = null;
    try { all = document.querySelectorAll("*"); } catch (e) { return 0; }
    for (let i = 0; i < all.length; i++) {
      let sr = null;
      try { sr = all[i].shadowRoot; } catch (e) { sr = null; }
      if (sr) n += armOneCrestRoot(sr);        
    }
    return n;
  }

  function armRootsIn(node) {
    if (!node || node.nodeType !== 1) return 0;
    let n = 0;
    try { if (node.shadowRoot) n += armOneCrestRoot(node.shadowRoot); } catch (e) {  }
    let all = null;
    try { all = node.querySelectorAll("*"); } catch (e) { return n; }
    for (let i = 0; i < all.length; i++) {
      let sr = null;
      try { sr = all[i].shadowRoot; } catch (e) { sr = null; }
      if (sr) n += armOneCrestRoot(sr);
    }
    return n;
  }

  const iconScrollHooked = new WeakSet();
  let iconMechAt = 0;


  let gridDumpAt = 0;


  var iconLightSig = "";
  function probeIconGridLight() {
    var pane = null;
    try { pane = iconPane(); } catch (e) { return; }
    if (!pane) return;
    var cards = null;
    try { cards = pane.getElementsByClassName(IDENT_ICON_CARD_CLS); } catch (e) { return; }
    if (!cards || !cards.length) return;
    var pr = null;
    try { pr = pane.getBoundingClientRect(); } catch (e) { return; }
    var yA = -1, yB = -1;
    try { yA = Math.round(cards[0].getBoundingClientRect().top - pr.top); } catch (e) {  }
    try { yB = Math.round(cards[cards.length - 1].getBoundingClientRect().top - pr.top); } catch (e) {  }
    var oMin = -1, oMax = -1;
    for (var ci = 0; ci < cards.length; ci++) {
      var ot = -1;
      try { ot = Math.round(cards[ci].offsetTop || 0); } catch (e) { continue; }
      if (oMin < 0 || ot < oMin) oMin = ot;
      if (ot > oMax) oMax = ot;
    }
    var payload = { n: cards.length, yA: yA, yB: yB, ph: Math.round(pr.height), oMin: oMin, oMax: oMax };
    var sig = JSON.stringify(payload);
    if (sig === iconLightSig) return;
    iconLightSig = sig;
    try { diag("icon-grid-light", payload); } catch (e) {  }
  }

  var iconErrBound = false;
  function bindIconErrProbe() {
    if (iconErrBound) return;
    iconErrBound = true;
    try {
      window.addEventListener("error", function (ev) {
        try {
          var er = (ev && ev.error) || {};
          diag("icon-page-error", {
            msg: String((ev && ev.message) || "").slice(0, 200),
            line: (ev && ev.lineno) || 0,
            col: (ev && ev.colno) || 0,
            stack: String(er.stack || "").slice(0, 600)
          });
        } catch (e) {  }
      }, true);
      window.addEventListener("unhandledrejection", function (ev) {
        try {
          var r = ev && ev.reason;
          diag("icon-page-reject", {
            msg: String((r && r.message) || r || "").slice(0, 200),
            stack: String((r && r.stack) || "").slice(0, 400)
          });
        } catch (e) {  }
      });
      try {
        if (!window.__prismCEHooked) {
          window.__prismCEHooked = true;
          var _ce = console.error;
          var _ceLast = "", _ceAt = 0;
          console.error = function () {
            try {
              var a = Array.prototype.slice.call(arguments);
              var msg = "", st = "", i;
              for (i = 0; i < a.length; i++) {
                var x = a[i];
                if (x && x.stack && !st) st = String(x.stack).slice(0, 700);
                if (x && x.message) msg += (msg ? " | " : "") + String(x.message);
                else if (typeof x === "string") msg += (msg ? " | " : "") + x;
              }
              msg = msg.slice(0, 300);
              if (msg || st) {
                var now = Date.now();
                if (msg !== _ceLast || now - _ceAt > 6000) {
                  _ceLast = msg; _ceAt = now;
                  diag("page-console-error", { msg: msg, stack: st });
                }
              }
            } catch (e2) {  }
            try { return _ce.apply(console, arguments); } catch (e3) {  }
          };
          diag("ce-hook", { ok: true });
        }
      } catch (e) {  }
      diag("icon-err-probe", { ok: true });
    } catch (e) {  }
  }

  var iconTierSig = "";


  function saveTitleCustom() {
    const t = JSON.stringify({ name: state.titleCustom.name || "" });
    try { if (window.DataStore) window.DataStore.set(TITLE_KEY, t); } catch (e) {  }
    try { localStorage.setItem(TITLE_KEY, t); } catch (e) {  }
  }

  function loadTitleCustom() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(TITLE_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(TITLE_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (o && o.name) state.titleCustom.name = String(o.name);
    } catch (e) {  }
  }

  const COLLECTION_ITEM = ".rcp-fe-lol-champion-mastery-champion-item-lcm";
  const COLLECTION_APP = ".collections-application";
  const COLLECTION_CREST_DIR = "/fe/lol-collections/images/item-element/";
  const COLLECTION_MAX = 10;
  const COLLECTION_KEY = SETTINGS_KEY + ".collection";

  function collectionCrestImg(lv) {
    const n = Math.max(0, Math.min(COLLECTION_MAX, parseInt(lv, 10) || 0));
    return COLLECTION_CREST_DIR + "crest-and-banner-mastery-" + n + ".png";
  }

  function collectionLevelText() {
    const t = String(state.collection.text || "");
    if (!t || !/\d/.test(t)) return "";
    return t.replace(/\d+/, String(state.collection.level));
  }

  function buildCollectionCSS() {
    if (!state.collection.unlock) return "";
    const u = cssEscape(collectionCrestImg(state.collection.level));
    const S = COLLECTION_APP + " " + COLLECTION_ITEM;
    const out = [];
    const tpl = collectionLevelText();

    const CREST_DECL =
      "content:\"\" !important;position:absolute !important;" +
      "left:-8px !important;top:-5px !important;width:65px !important;height:62px !important;" +
      "background-image:url(\"" + u + "\") !important;background-repeat:no-repeat !important;" +
      "background-size:100% 100% !important;pointer-events:none !important;";

    const TEXT_DECL =
      "font-size:12px !important;font-weight:400 !important;letter-spacing:.025em !important;" +
      "color:#a09b8c !important;text-transform:capitalize !important;" +
      "font-family:var(--font-body) !important;";

    out.push(S + " .lock-icon{display:none !important;}");

    out.push(S + " .lock-wrapper{position:absolute !important;left:0 !important;top:164px !important;" +
      "width:100% !important;height:35px !important;pointer-events:none !important;" +
      "background:linear-gradient(0deg,#010a13,rgba(1,10,19,.65)) !important;" +
      "border-top:1px solid #1e2328 !important;}");

    out.push(S + " .lock-wrapper::after{" + CREST_DECL + "}");

    if (tpl) {
      out.push(S + " .lock-wrapper::before{content:\"" + cssEscape(tpl) + "\" !important;" +
        "position:absolute !important;left:51.8px !important;right:0 !important;top:0 !important;" +
        "height:35px !important;line-height:35px !important;text-align:center !important;" +
        "margin:0 !important;" + TEXT_DECL + "pointer-events:none !important;}");
    }

    const OW = S + " .champion-mastery-info";

    out.push(S + " .champion-mastery-badge-container > .mastery-crest-banner-display," +
      S + " .champion-mastery-badge-container > .champion-mastery-badge," +
      OW + " .mastery-progress{display:none !important;}");

    out.push(S + " .champion-mastery-badge-container{width:51.8px !important;}");

    out.push(OW + "::after{" + CREST_DECL + "}");

    if (tpl) {
      out.push(S + " .champion-mastery-description{display:block !important;font-size:0 !important;}");
      out.push(S + " .champion-mastery-description::after{content:\"" + cssEscape(tpl) + "\" !important;" +
        TEXT_DECL + "}");
    }
    return out.join("\n");
  }

  function applyCollectionCSS() {
    const css = buildCollectionCSS();
    if (!css) {
      const old = document.getElementById(NS + "-collflag");
      if (old) old.remove();
      return;
    }
    let el = document.getElementById(NS + "-collflag");
    if (!el) {
      el = document.createElement("style");
      el.id = NS + "-collflag";
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function saveCollectionPick() {
    const t = JSON.stringify({
      unlock: !!state.collection.unlock,
      level: state.collection.level,
    });
    try { if (window.DataStore) window.DataStore.set(COLLECTION_KEY, t); } catch (e) {  }
    try { localStorage.setItem(COLLECTION_KEY, t); } catch (e) {  }
  }

  function loadCollectionPick() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(COLLECTION_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(COLLECTION_KEY); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (o && o.unlock) state.collection.unlock = true;
      const n = parseInt(o && o.level, 10);
      if (n >= 1 && n <= COLLECTION_MAX) state.collection.level = n;
    } catch (e) {  }
  }

  let collProbeAt = 0;
  let collCrestProbed = false;
  function probeCollectionGrid(force) {
    const now = Date.now();
    if (!force && now - collProbeAt < 60000) return;
    const cells = document.querySelectorAll(COLLECTION_APP + " " + COLLECTION_ITEM);
    if (!cells.length && !force) return;
    collProbeAt = now;

    let locked = 0, iconTotal = 0, iconShown = 0, sample = "";
    Array.prototype.forEach.call(cells, (c) => {
      if (c.querySelector(".lock-wrapper")) locked++;
      const ic = c.querySelector(".lock-icon");
      if (ic) {
        iconTotal++;
        try { if (getComputedStyle(ic).display !== "none") iconShown++; } catch (e) {  }
      }
      if (!sample) {
        const d = c.querySelector(".champion-mastery-description");
        const tx = d ? String(d.textContent || "").trim() : "";
        if (tx && tx.length <= 32 && /\d/.test(tx)) sample = tx;
      }
    });

    if (sample && sample !== state.collection.text) {
      state.collection.text = sample;
      if (state.collection.unlock) applyCollectionCSS();
    }

    diag("collection-grid-probe", {
      cells: cells.length,
      locked: locked,                       
      iconTotal: iconTotal,
      iconShown: iconShown,                 
      unlock: state.collection.unlock,
      level: state.collection.level,
      textSample: sample,
      textOut: collectionLevelText(),
      stylePresent: !!document.getElementById(NS + "-collflag"),
      barStyled: document.querySelectorAll(COLLECTION_APP + " " + COLLECTION_ITEM + " .lock-wrapper").length,
    });

    if (!collCrestProbed) { collCrestProbed = true; probeCollectionCrestImages(); }
  }

  function resetCollectionProbe() { collProbeAt = 0; probeCollectionGrid(true); }

  function probeCollectionCrestImages() {
    const list = [0, 1, 5, 10];
    const out = [];
    let done = 0;
    const finish = () => {
      if (++done < list.length) return;
      out.sort((a, b) => a.n - b.n);
      diag("collection-crest-img", out);
    };
    list.forEach((n) => {
      const im = new Image();
      im.onload = () => {
        const rec = { n, w: im.naturalWidth, h: im.naturalHeight };
        try {
          const cv = document.createElement("canvas");
          cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          const g = cv.getContext("2d");
          g.drawImage(im, 0, 0);
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          let any = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 16) any++;
          rec.anyPct = +(any / (cv.width * cv.height) * 100).toFixed(3);
          let x = 0x811c9dc5;
          for (let i = 0; i < d.length; i += 97) { x ^= d[i]; x = (x * 0x01000193) >>> 0; }
          rec.hash = ("0000000" + x.toString(16)).slice(-8);
        } catch (e) { rec.hash = "tainted"; }
        out.push(rec); finish();
      };
      im.onerror = () => { out.push({ n, err: "load-failed" }); finish(); };
      im.src = collectionCrestImg(n);
    });
  }

  let masteryImgProbed = false;
  function probeMasteryImages() {
    if (masteryImgProbed) return;
    masteryImgProbed = true;
    const out = [];
    let done = 0;
    const finish = () => {
      if (++done < MASTERY_MAX) return;
      out.sort((a, b) => a.n - b.n);
      diag("mastery-images", out);
    };
    for (let n = 1; n <= MASTERY_MAX; n++) {
      const im = new Image();
      im.onload = () => {
        const rec = { n, w: im.naturalWidth, h: im.naturalHeight };
        try {
          const c = document.createElement("canvas");
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          const g = c.getContext("2d");
          g.drawImage(im, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let any = 0, op = 0;
          for (let i = 3; i < d.length; i += 4) {
            const a = d[i];
            if (a > 16) any++;
            if (a > 200) op++;
          }
          const tot = c.width * c.height;
          rec.anyPct = +(any / tot * 100).toFixed(4);
          rec.opPct = +(op / tot * 100).toFixed(4);
          let x = 0x811c9dc5;
          for (let i = 0; i < d.length; i += 97) { x ^= d[i]; x = (x * 0x01000193) >>> 0; }
          rec.hash = ("0000000" + x.toString(16)).slice(-8);
        } catch (e) {
          rec.hash = "tainted";
          rec.note = String((e && e.message) || e).slice(0, 60);
        }
        out.push(rec);
        finish();
      };
      im.onerror = () => { out.push({ n, err: "load-failed" }); finish(); };
      im.src = masteryImg(n);
    }
  }

  let bannerProbed = false;
  function probeBannerImages() {
    if (bannerProbed) return;
    bannerProbed = true;
    const files = ["mastery-banner-0.png", "mastery-banner-1.svg", "mastery-banner-2.svg", "mastery-banner-3.svg"];
    let done = 0;
    const out = [];
    const finish = () => {
      if (++done < files.length) return;
      out.sort((a, b) => String(a.file).localeCompare(String(b.file)));
      diag("mastery-banner-img", out);
    };
    files.forEach((f) => {
      const im = new Image();
      im.onload = () => {
        out.push({
          file: f, ok: true,
          w: im.naturalWidth, h: im.naturalHeight,
          ratio: +(im.naturalWidth / im.naturalHeight).toFixed(4),
        });
        finish();
      };
      im.onerror = () => { out.push({ file: f, ok: false, err: "load-failed" }); finish(); };
      im.src = MASTERY_DIR + f;
    });
  }

  function renderMasterySection(body) {
    const row = body.querySelector('[data-el="msrow"]');
    const nowEl = body.querySelector('[data-el="ms-now"]');
    const flagNowEl = body.querySelector('[data-el="ms-flagnow"]');
    const hint = body.querySelector('[data-el="ms-hint"]');
    if (!row) return;
    const say = (t) => { if (hint) hint.textContent = t; };

    const realLevel = () => {
      const im = document.querySelector(".mastery-crest-component .mastery-crest-image");
      const v = im ? parseInt(im.getAttribute("data-mastery-level"), 10) : NaN;
      return isNaN(v) ? null : v;
    };
    const realFlag = () => {
      const b = document.querySelector("img.style-profile-banner-image");
      if (!b) return null;
      try { return String(b.getAttribute("src") || "").replace(/^.*\//, ""); } catch (e) { return null; }
    };
    const mark = () => {
      const cur = state.mastery.level;
      Array.prototype.forEach.call(row.querySelectorAll("[data-mastery]"), (b) => {
        b.classList.toggle("on", String(cur) === b.getAttribute("data-mastery"));
      });
      if (nowEl) {
        if (cur == null) {
          const r = realLevel();
          nowEl.textContent = r == null ? "真实等级" : ("真实等级（" + r + " 级）");
        } else {
          nowEl.textContent = "全部显示 " + cur + " 级";
        }
      }
      if (flagNowEl) {
        if (cur == null) {
          const rf = realFlag();
          flagNowEl.textContent = "需先选纹章等级" +
            (rf ? "（该英雄真实：" + bannerToneByFile(rf) + "旗）" : "");
        } else if (state.mastery.flag === 0) {
          flagNowEl.textContent = "已关闭（旗保持真实）";
        } else {
          flagNowEl.textContent = "跟随 " + cur + " 级（" +
            (BANNER_TONE[BANNER_BY_LEVEL[cur]] || "?") + "旗）";
        }
      }
    };

    let h = "";
    for (let n = 1; n <= MASTERY_MAX; n++) {
      h += `<button class="${NS}-crest" data-mastery="${n}" title="${n} 级纹章（仅本机显示）">` +
           `<img src="${masteryImg(n)}" alt="${n}" draggable="false"><span>${n}</span></button>`;
    }
    row.innerHTML = h;
    Array.prototype.forEach.call(row.querySelectorAll("img"), (im) => {
      im.addEventListener("error", () => {
        im.style.visibility = "hidden";
        diag("mastery-thumb-error", { src: im.getAttribute("src") });
      }, { once: true });
    });

    row.addEventListener("click", (e) => {
      const btn = e.target.closest ? e.target.closest("[data-mastery]") : null;
      if (!btn) return;
      const n = parseInt(btn.getAttribute("data-mastery"), 10);
      state.mastery.level = (state.mastery.level === n) ? null : n;   
      applyMasteryCSS();
      saveMasteryPick();
      mark();
      say(state.mastery.level == null
        ? "已恢复成每个英雄显示自己的真实等级"
        : ("已让所有成就纹章都显示 " + state.mastery.level + " 级那张（只影响你自己这台机器）"));
      diag("mastery-pick", { level: state.mastery.level, via: "crest" });
      resetMasteryProbe();
    });

    const rb = body.querySelector('[data-act="ms-reset"]');
    if (rb) {
      rb.addEventListener("click", () => {
        state.mastery.level = null;
        applyMasteryCSS();
        saveMasteryPick();
        mark();
        say("已恢复成每个英雄显示自己的真实等级");
        diag("mastery-pick", { level: null, via: "reset" });
        resetMasteryProbe();
      });
    }

    const fb = body.querySelector('[data-act="ms-flag"]');
    if (fb) {
      fb.addEventListener("click", () => {
        state.mastery.flag = (state.mastery.flag === 0) ? null : 0;
        applyMasteryCSS();
        saveMasteryPick();
        mark();
        if (state.mastery.level == null) {
          say("旗幡跟随是配合纹章等级用的 —— 先在上面选一个纹章等级，它才会生效");
        } else {
          say(state.mastery.flag === 0
            ? "已关闭跟随：只换纹章，旗保持每个英雄的真实等级"
            : "已开启跟随：旗会跟着纹章换成同一档（仅本机显示）");
        }
        diag("mastery-pick", { flag: state.mastery.flag, via: "flag" });
        resetMasteryProbe();
      });
    }

    probeMasteryImages();
    probeBannerImages();

    mark();
  }

  function renderProfileSection(body) {
    const scoreEl = body.querySelector('[data-el="pc-score"]');
    const champEl = body.querySelector('[data-el="pc-champ"]');
    const hint = body.querySelector('[data-el="pc-hint"]');
    const say = (t) => { if (hint) hint.textContent = t || ""; };
    const p = state.profileCustom;

    if (scoreEl) scoreEl.value = p.score || "";
    if (champEl) champEl.value = String(p.champId || 0);

    if (champEl && !champEl.getAttribute("data-filled")) {
      fetch(location.origin + "/lol-game-data/assets/v1/champion-summary.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const list = (Array.isArray(d) ? d : (d && d.champions) || [])
            .filter((c) => c && c.id > 0);
          if (!list.length) { say("英雄列表是空的，只填积分数也行"); return; }
          champEl.setAttribute("data-filled", "1");
          list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh"));
          const frag = document.createDocumentFragment();
          list.forEach((c) => {
            const o = document.createElement("option");
            o.value = String(c.id);
            o.textContent = (c.name || c.alias || c.id) + "（" + c.id + "）";
            frag.appendChild(o);
          });
          champEl.appendChild(frag);
          champEl.value = String(p.champId || 0);
        })
        .catch(() => say("英雄列表没拉到 —— 可以只填积分数"));
    }

    const apply = (via) => {
      let bad = false;
      if (scoreEl) {
        const v = String(scoreEl.value || "").trim();
        if (!v) { p.score = ""; }
        else if (/^\d{1,7}$/.test(v)) { p.score = v; }
        else { p.score = ""; scoreEl.value = ""; bad = true; }
      }
      if (champEl) p.champId = parseInt(champEl.value, 10) || 0;
      applyProfileCSS();
      saveProfileCustom();
      probeProfileOnProfile(true);
      if (bad) say("积分数只认纯数字（最多 7 位），已按「不改」处理");
      else if (p.score || p.champId) say("已应用（只影响你自己这台机器）");
      else say("已恢复成官方真实值");
      diag("profile-pick", { score: p.score || null, champId: p.champId || 0, via });
    };

    const ab = body.querySelector('[data-act="pc-apply"]');
    if (ab) ab.addEventListener("click", () => apply("apply"));
    if (champEl) champEl.addEventListener("change", () => apply("champ"));

    const rb = body.querySelector('[data-act="pc-reset"]');
    if (rb) {
      rb.addEventListener("click", () => {
        p.score = ""; p.champId = 0;
        if (scoreEl) scoreEl.value = "";
        if (champEl) champEl.value = "0";
        applyProfileCSS();
        saveProfileCustom();
        probeProfileOnProfile(true);
        say("两项都恢复成官方真实值");
        diag("profile-pick", { score: null, champId: 0, via: "reset" });
      });
    }
  }


  function renderCollectionSection(body) {
    const nowEl = body.querySelector('[data-el="coll-now"]');
    const hint = body.querySelector('[data-el="coll-hint"]');
    if (!nowEl) return;
    const say = (t) => { if (hint) hint.textContent = t; };

    const stats = () => {
      const cells = document.querySelectorAll(COLLECTION_APP + " " + COLLECTION_ITEM);
      let locked = 0;
      Array.prototype.forEach.call(cells, (c) => { if (c.querySelector(".lock-wrapper")) locked++; });
      return { cells: cells.length, locked: locked };
    };

    const mark = () => {
      if (state.collection.unlock) {
        const s = stats();
        nowEl.textContent = "已开启（未拥有的也显示 " + state.collection.level + " 级成就）" +
          (s.cells ? "　当前页 " + s.cells + " 格 / 未拥有 " + s.locked : "　（切到藏品页即生效）");
      } else {
        nowEl.textContent = "关闭（各英雄按真实拥有/成就显示）";
      }
    };

    const btn = body.querySelector('[data-act="coll-toggle"]');
    if (btn) {
      btn.addEventListener("click", () => {
        state.collection.unlock = !state.collection.unlock;
        applyCollectionCSS();
        saveCollectionPick();
        mark();
        say(state.collection.unlock
          ? "已开启：去「藏品 → 英雄」看看，没拥有的英雄也会显示成已拥有 + 最高成就（只影响你自己这台机器）"
          : "已关闭：恢复成未拥有显示锁、拥有显示各自真实成就等级");
        diag("collection-pick", {
          unlock: state.collection.unlock,
          level: state.collection.level,
          cells: stats().cells,
        });
        resetCollectionProbe();
      });
    }

    probeCollectionGrid();
    mark();
  }

  const SKINS_KEY = SETTINGS_KEY + ".skins";
  const SKINS_APP = COLLECTION_APP;                       
  const SKINS_ROUTE_SEL = SKINS_APP + " .skins-route";
  const SKINS_DETAILS_SEL = ".rcp-fe-lol-collections-collection-details";
  const SKINS_SETTINGS_PATH = "/lol-settings/v2/account/LCUPreferences/lol-skins-viewer";

  const SKINS_ITEM_SEL = SKINS_ROUTE_SEL + " .rcp-fe-lol-collections-inventory-item";
  const SKINS_UNLOCK_CSS_ID = NS + "-skinsunlock";
  const SKINS_TIP_MARK = "data-prism-skintip";
  const SKINS_TIP_SEL = ".inventory-item-tooltip-container[" + SKINS_TIP_MARK + "]";
  const SKIN_OWNED_CLIP = "polygon(12px 2px,3px 12px,3px 36px,5px 38px,5px 159px,3px 162px,4px 171px,0 173px," +
    "0 184px,11px 193px,117px 193px,130px 184px,130px 173px,126px 171px,126px 162px,125px 159px,125px 38px," +
    "128px 36px,128px 12px,118px 2px,70px 2px,65px 8px,60px 2px)";
  const SKINS_UNLOCK_CSS =
    SKINS_ITEM_SEL + " .border-wrapper.unowned{display:block !important}\n" +
    SKINS_ITEM_SEL + " .inventory-item-image-container.unowned{clip-path:" + SKIN_OWNED_CLIP + " !important}\n" +
    SKINS_ITEM_SEL + " .lock-wrapper{display:none !important}\n" +
    SKINS_ITEM_SEL + " .inventory-item-image-container{opacity:.8 !important}\n" +
    SKINS_ITEM_SEL + ":hover .inventory-item-image-container{opacity:1 !important}\n" +
    SKINS_TIP_SEL + " .price{display:none !important}\n" +
    SKINS_TIP_SEL + " .bottom-row:not(:has(*)){display:none !important}\n";

  const SKIN_BORDER_RARITIES = ["normal", "rare", "epic", "legendary", "mythic", "ultimate", "exalted", "transcendent"];
  const SKIN_BORDER_BASE = "/fe/lol-collections/images/skins-viewer/borders/borders_";
  const SKIN_GEM_BASE = "/lol-game-data/assets/v1/rarity-gem-icons/cn-gem-";
  const SKIN_GEM_BY_BR = {
    epic: 3, legendary: 4, mythic: 7, ultimate: 9, exalted: 10, transcendent: 11,
  };
  const SKINS_ACQ_LABEL = "已获取";


  const SKINS_FALLBACK = { total: 1982, tiers: [3, 5, 7, 177, 428, 142, 215, 7, 5, 6], chromas: 7028 };

  let skinsObs = null;          
  let skinsScrollAt = 0, skinsScrollBound = false;   
  let skinsTargets = null;      
  let skinsCtl = null;          
  let skinsCtlVia = "";         
  let skinsOwnerVia = "";       
  let skinsXhrPatched = false;  
  let skinsBaseAsked = false;   
  let skinsLastDiag = 0;        
  let skinsScanAt = 0;          
  let skinsScanTryAt = 0;       
  let skinsSweepAt = 0;         
  const SKINS_SCAN_MS = 250;

  function skinsStats() {
    const s = state.skins.stats;
    return (s && s.total) ? s : SKINS_FALLBACK;
  }

  function skinsHasSkinsById(o) {
    if (!o || typeof o.get !== "function") return false;
    try { return !!o.get("skinsById"); } catch (e) { return false; }
  }

  function skinsViewHost(el) {          
    let n = el, d = 0;
    while (n && n.nodeType === 1 && d < 12) {
      try { if (n.classList && n.classList.contains("ember-view")) return n; } catch (e) {  }
      n = n.parentElement; d++;
    }
    return null;
  }

  function skinsViewControllerFromView(v) {   
    let cur = v, d = 0;
    while (cur && d < 16) {
      let ctx = null;
      try { ctx = cur.context || cur._context || null; } catch (e) { ctx = null; }
      if (!ctx && typeof cur.get === "function") {
        try { ctx = cur.get("context") || cur.get("controller") || cur.get("target") || null; } catch (e) { ctx = null; }
      }
      if (skinsHasSkinsById(ctx)) return ctx;
      if (skinsHasSkinsById(cur)) return cur;
      try { cur = cur._parentView || cur.parentView || null; } catch (e) { cur = null; }
      d++;
    }
    return null;
  }

  function skinsViewController(el) {          
    const host = skinsViewHost(el);
    if (host) {
      let v = null;
      try { v = host.__ember_view__ || host._view || null; } catch (e) { v = null; }
      if (!v) {
        try {
          const E = window.Ember;
          if (E && E.View && E.View.views && host.id) v = E.View.views[host.id] || null;
        } catch (e) { v = null; }
      }
      if (v) {
        const c = skinsViewControllerFromView(v);
        if (c) { skinsCtlVia = "view:" + (host.className || host.id || "?").toString().slice(0, 40); return c; }
      }
    }
    try {
      const E = window.Ember;
      if (E && E.getOwner) {
        const o = E.getOwner(el);
        if (o && typeof o.lookup === "function") {
          const c = o.lookup("controller:skins");
          if (c && typeof c.get === "function") { skinsCtlVia = "getOwner"; return c; }
        }
      }
    } catch (e) {  }
    return null;
  }

  function skinsControllerByScan() {          
    const E = window.Ember;
    if (!E || !E.View || !E.View.views) return null;
    const now = Date.now();
    if (now - skinsScanTryAt < 3000) return null;
    skinsScanTryAt = now;
    let vs = null;
    try { vs = E.View.views; } catch (e) { return null; }
    let keys = null;
    try { keys = Object.keys(vs); } catch (e) { return null; }
    for (let i = 0; i < keys.length; i++) {
      const v = vs[keys[i]];
      if (!v) continue;
      if (skinsHasSkinsById(v)) { skinsCtlVia = "scan:view"; return v; }
      let ctx = null;
      try { ctx = v.context || v._context; } catch (e) { ctx = null; }
      if (skinsHasSkinsById(ctx)) { skinsCtlVia = "scan:ctx"; return ctx; }
    }
    return null;
  }

  const SKINS_PROP_RE = /ember|view|context|owner|container/i;
  function skinsViewFromPropSweep(el) {
    const now = Date.now();
    if (now - skinsSweepAt < 2000) return null;
    skinsSweepAt = now;
    let n = el, d = 0;
    while (n && n.nodeType === 1 && d < 12) {
      let names = null;
      try { names = Object.getOwnPropertyNames(n); } catch (e) { names = null; }
      for (let i = 0; names && i < names.length; i++) {
        const k = names[i];
        if (k === "classList" || k === "parentElement" || k === "ownerDocument") continue;
        if (!SKINS_PROP_RE.test(k)) continue;
        let v = null;
        try { v = n[k]; } catch (e) { continue; }
        if (!v) continue;
        const t = typeof v;
        if (t !== "object" && t !== "function") continue;
        if (skinsHasSkinsById(v)) { skinsCtlVia = "sweep:" + k; return v; }
        try {
          if (v.context || v._context) {
            const c = skinsViewControllerFromView(v);
            if (c) { skinsCtlVia = "sweep-ctx:" + k; return c; }
          }
        } catch (e) {  }
        try {
          if (typeof v.lookup === "function") {
            const c = v.lookup("controller:skins");
            if (c && skinsHasSkinsById(c)) { skinsCtlVia = "sweep-lookup:" + k; return c; }
          }
        } catch (e) {  }
      }
      n = n.parentElement; d++;
    }
    return null;
  }

  let skinsAnnounceHooked = false, skinsPluginHost = null;
  function skinsEmberFromHost() {
    if (skinsEmberObj) return skinsEmberObj;
    const h = skinsPluginHost;
    if (!h) return null;
    let libs = null;
    try { libs = h.get("rcp-fe-ember-libs"); } catch (e) { libs = null; }
    if (!libs) return null;
    try {
      if (typeof libs.getEmber === "function") {
        const E = libs.getEmber();
        if (E) { skinsEmberObj = E; diag("skins-ember", { via: "host.getEmber", ver: String(E.VERSION) }); return E; }
      }
    } catch (e) { diag("skins-ember-error", { via: "host", msg: String(e) }); }
    return null;
  }

  const SKINS_ANNOUNCE_PREFIX_FALLBACK = "riotPlugin.announce:";
  function skinsHookAnnounceRegistration() {
    if (skinsAnnounceHooked) return;
    skinsAnnounceHooked = true;
    let prefix = "";
    try { if (typeof window.getPluginAnnounceEventName === "function") prefix = window.getPluginAnnounceEventName(""); } catch (e) { prefix = ""; }
    if (!prefix) prefix = SKINS_ANNOUNCE_PREFIX_FALLBACK;
    const proto = (window.EventTarget && window.EventTarget.prototype) || null;
    if (!proto || typeof proto.addEventListener !== "function") {
      diag("skins-announce-wrap", { skipped: "no-EventTarget" });
      return;
    }
    const origAdd = proto.addEventListener;
    const onHost = function (host) {
      if (skinsPluginHost) return;
      if (!host || typeof host.get !== "function") return;
      skinsPluginHost = host;
      diag("skins-host", { via: "announce-wrap" });
      skinsCtl = null;
      skinsCtlDiagDone = false;
      skinsEmberFromHost();
      skinsScanAt = 0;
      try { tickSkins(); } catch (e) {  }
    };
    proto.addEventListener = function (type, fn, opts) {
      try {
        if (typeof type === "string" && type.indexOf(prefix) === 0 && typeof fn === "function") {
          const wrapped = function (ev) {
            try {
              const rh = ev && ev.registrationHandler;
              if (typeof rh === "function" && !ev.__hmAnnounceWrapped) {
                ev.__hmAnnounceWrapped = 1;
                ev.registrationHandler = function (cb) {
                  if (typeof cb !== "function") return rh.call(this, cb);
                  return rh.call(this, function (host) {
                    try { onHost(host); } catch (e) {  }
                    return cb.apply(this, arguments);        
                  });
                };
              }
            } catch (e) {  }
            return fn.apply(this, arguments);
          };
          return origAdd.call(this, type, wrapped, opts);
        }
      } catch (e) {  }
      return origAdd.apply(this, arguments);
    };
    diag("skins-announce-wrap", { prefix: prefix });
  }

  function skinsWebpackRequires() {
    const out = [];
    let names = null;
    try { names = Object.getOwnPropertyNames(window); } catch (e) { return out; }
    for (let i = 0; i < names.length; i++) {
      if (names[i].indexOf("webpackChunk") !== 0) continue;
      let chunk = null;
      try { chunk = window[names[i]]; } catch (e) { continue; }
      if (!chunk || typeof chunk.push !== "function") continue;
      let req = null;
      try {
        chunk.push([[Math.floor(Math.random() * 1e9)], {}, function (r) { req = r; }]);
      } catch (e) { req = null; }
      if (typeof req === "function") out.push({ name: names[i], req: req });
    }
    return out;
  }

  let skinsEmberObj = null, skinsEmberTryAt = 0;
  function skinsLooksEmber(o) {
    if (!o || typeof o !== "object") return false;
    try { return !!o.VERSION && !!o.computed && !!(o.Component || o.Controller || o.Object); } catch (e) { return false; }
  }
  function skinsPickEmber(ex) {
    if (!ex) return null;
    if (skinsLooksEmber(ex)) return ex;
    if (skinsLooksEmber(ex.Ember)) return ex.Ember;
    if (ex.default) {
      if (skinsLooksEmber(ex.default)) return ex.default;
      if (skinsLooksEmber(ex.default.Ember)) return ex.default.Ember;
    }
    return null;
  }
  function skinsWpShape() {
    const list = skinsWebpackRequires();
    return list.map(function (o) {
      const r = o.req;
      let keys2 = [], mN = -1, cN = -1, instN = -1;
      try { keys2 = Object.keys(r).slice(0, 24); } catch (e) {}
      try { if (r.m) mN = Object.keys(r.m).length; } catch (e) {}
      try { if (r.c) cN = Object.keys(r.c).length; } catch (e) {}
      try { if (r.s) instN = Object.keys(r.s).length; } catch (e) {}    
      return o.name + "{m:" + mN + ",c:" + cN + ",s:" + instN + ",k:" + keys2.join("/") + "}";
    }).join(" | ");
  }

  function skinsEmberFromWebpack() {
    if (skinsEmberObj) return skinsEmberObj;
    const fromHost = skinsEmberFromHost();
    if (fromHost) return fromHost;
    const now = Date.now();
    if (skinsEmberTryAt && now - skinsEmberTryAt < 2000) return null;   
    skinsEmberTryAt = now;
    const list = skinsWebpackRequires();
    if (!list.length) return null;
    for (let n = 0; n < list.length; n++) {
      const r = list[n].req;
      const caches = [];
      try { if (r.c) caches.push(r.c); } catch (e) {}
      try { if (r.s) caches.push(r.s); } catch (e) {}
      for (let ci = 0; ci < caches.length; ci++) {
        let keys = null;
        try { keys = Object.keys(caches[ci]); } catch (e) { continue; }
        for (let i = 0; i < keys.length; i++) {
          const m = caches[ci][keys[i]];
          const hit = skinsPickEmber(m && m.exports);
          if (hit) {
            skinsEmberObj = hit;
            diag("skins-ember", { via: "cache", chunk: list[n].name, size: keys.length });
            return hit;
          }
        }
      }
      try {
        const cache = r.c || r.s;
        if (cache && cache[1]) {
          const hit2 = skinsPickEmber(r(1));
          if (hit2) { skinsEmberObj = hit2; diag("skins-ember", { via: "m1", chunk: list[n].name }); return hit2; }
        }
      } catch (e) {  }
    }
    return null;
  }

  function skinsControllerViaWebpack() {
    const E = skinsEmberFromWebpack();
    if (!E) return null;
    let host = null;
    try {
      const d = document.querySelector(SKINS_DETAILS_SEL) || document.querySelector(SKINS_ROUTE_SEL);
      host = d ? (skinsViewHost(d) || d) : null;
    } catch (e) { host = null; }
    if (host) {
      let v = null;
      try { v = host.__ember_view__ || host._view || null; } catch (e) { v = null; }
      if (!v) { try { if (E.View && E.View.views && host.id) v = E.View.views[host.id] || null; } catch (e) {} }
      if (v) { const c = skinsViewControllerFromView(v); if (c) { skinsCtlVia = "wp-view"; return c; } }
    }
    try {
      const vs = (E.View && E.View.views) || null;
      if (vs) {
        const keys = Object.keys(vs);
        for (let i = 0; i < keys.length; i++) {
          const v = vs[keys[i]];
          if (!v) continue;
          if (skinsHasSkinsById(v)) { skinsCtlVia = "wp-reg-view"; return v; }
          let ctx = null;
          try { ctx = v.context || v._context; } catch (e) { ctx = null; }
          if (skinsHasSkinsById(ctx)) { skinsCtlVia = "wp-reg-ctx"; return ctx; }
        }
      }
    } catch (e) {  }
    return null;
  }

  function skinsEmberShape() {
    const out = {};
    let E = null, A = null;
    try { E = window.Ember; } catch (e) { E = null; }
    out.tE = typeof E;
    if (E && (typeof E === "object" || typeof E === "function")) {
      let ks = [];
      try { ks = Object.keys(E); } catch (e) {}
      out.Ek = ks.slice(0, 20).join(",");
      try { out.ver = String(E.VERSION || ""); } catch (e) {}
      try { out.view = !!E.View; } catch (e) {}
      try { out.reg = !!(E.View && E.View.views); } catch (e) {}
      try { out.regN = (E.View && E.View.views) ? Object.keys(E.View.views).length : -1; } catch (e) {}
      try { out.comp = !!E.computed; } catch (e) {}
      try { out.comp2 = !!E.Component; } catch (e) {}
      try { out.ctl = !!E.Controller; } catch (e) {}
      try { out.getOwner = typeof E.getOwner; } catch (e) {}
    }
    try { A = window.emberApp; } catch (e) { A = null; }
    out.tA = typeof A;
    if (A) {
      let ks2 = [];
      try { ks2 = Object.keys(A); } catch (e) {}
      out.Ak = ks2.slice(0, 16).join(",");
      try { out.A_lk = typeof A.lookup; } catch (e) {}
      try { out.A_ct = !!A.__container__; } catch (e) {}
      try { out.A_ctLk = !!(A.__container__ && typeof A.__container__.lookup === "function"); } catch (e) {}
      try { out.A_skins = (typeof A.lookup === "function") ? !!A.lookup("controller:skins") : "no-lookup"; } catch (e) { out.A_skins = "err"; }
      try {
        out.A_null = (A.__container__ && typeof A.__container__.lookup === "function")
          ? !!A.__container__.lookup("controller:skins") : "no-ct";
      } catch (e) { out.A_null = "err"; }
    }
    const hits = [];
    try {
      const names = Object.getOwnPropertyNames(window);
      for (let i = 0; i < names.length && hits.length < 10; i++) {
        let v = null;
        try { v = window[names[i]]; } catch (e) { continue; }
        if (!v || (typeof v !== "object" && typeof v !== "function")) continue;
        let m = "";
        try { if (typeof v.lookup === "function") m += "L"; } catch (e) {}
        try { if (v.__container__) m += "C"; } catch (e) {}
        try { if (v.VERSION && v.computed) m += "E"; } catch (e) {}
        try { if (v.View && v.View.views) m += "R"; } catch (e) {}
        if (m) hits.push(names[i] + ":" + m);
      }
    } catch (e) {}
    out.hits = hits.join(",");
    return out;
  }

  let skinsLookupHooked = 0;
  function skinsHookLookup(obj, tag) {
    if (!obj || typeof obj.lookup !== "function") return false;
    if (obj.__hmLookupHooked) return true;
    const orig = obj.lookup;
    obj.__hmLookupHooked = 1;
    obj.lookup = function (name) {
      const r = orig.apply(this, arguments);
      try {
        if (r && skinsHasSkinsById(r)) {
          skinsCtl = r;
          diag("skins-ctl-capture", { via: "lookup:" + tag, name: String(name) });
          skinsScanAt = 0;
          try { tickSkins(); } catch (e) {}
        }
      } catch (e) {  }
      return r;
    };
    skinsLookupHooked++;
    return true;
  }

  function skinsNormalizeEmber(x) {
    if (!x || typeof x !== "object") return null;
    const cand = [x, x.Ember, x.default, x.default && x.default.Ember, x.ember];
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i];
      if (!c || typeof c !== "object") continue;
      try {
        if (c.computed && (c.Component || c.Controller || c.Object || c.View)) return c;
        if (c.View && c.View.views) return c;
      } catch (e) {  }
    }
    return null;
  }

  function skinsControllerViaWindowEmber() {
    let A = null, Eraw = null;
    try { A = window.emberApp; } catch (e) { A = null; }
    try { Eraw = window.Ember; } catch (e) { Eraw = null; }
    const E = skinsNormalizeEmber(Eraw);
    if (E && !skinsEmberObj) {
      skinsEmberObj = E;
      diag("skins-ember", { via: "window.Ember(unwrapped)", ver: String(E.VERSION || "") });
    }
    if (A) {
      try { const c = (typeof A.lookup === "function") ? A.lookup("controller:skins") : null; if (skinsHasSkinsById(c)) { skinsCtlVia = "app.lookup"; return c; } } catch (e) {}
      try {
        const ct = A.__container__;
        const c2 = (ct && typeof ct.lookup === "function") ? ct.lookup("controller:skins") : null;
        if (skinsHasSkinsById(c2)) { skinsCtlVia = "app.container"; return c2; }
      } catch (e) {}
      skinsHookLookup(A, "app");
      try { skinsHookLookup(A.__container__, "container"); } catch (e) {}
    }
    try {
      const vs = (E && E.View && E.View.views) || null;
      if (vs) {
        const keys = Object.keys(vs);
        for (let i = 0; i < keys.length; i++) {
          const v = vs[keys[i]];
          if (!v) continue;
          if (skinsHasSkinsById(v)) { skinsCtlVia = "win.Ember.views"; return v; }
          let ctx = null;
          try { ctx = v.context || v._context; } catch (e) {}
          if (skinsHasSkinsById(ctx)) { skinsCtlVia = "win.Ember.views.ctx"; return ctx; }
        }
      }
    } catch (e) {}
    try {
      if (E && typeof E.getOwner === "function") {
        const el = document.querySelector(SKINS_DETAILS_SEL) || document.querySelector(SKINS_ROUTE_SEL);
        const o = el ? E.getOwner(el) : null;
        if (o && typeof o.lookup === "function") {
          const c = o.lookup("controller:skins");
          if (skinsHasSkinsById(c)) { skinsCtlVia = "win.Ember.getOwner"; return c; }
        }
      }
    } catch (e) {}
    return null;
  }

  function skinsController() {
    let d = null;
    try { d = document.querySelector(SKINS_DETAILS_SEL) || document.querySelector(SKINS_ROUTE_SEL) || null; } catch (e) { d = null; }
    if (d) { const c = skinsViewController(d); if (c) return c; }
    let any = null;
    try { any = document.querySelector(SKINS_ITEM_SEL); } catch (e) { any = null; }
    if (any) { const c = skinsViewController(any); if (c) return c; }
    const we = skinsControllerViaWindowEmber();
    if (we) return we;
    const w = skinsControllerViaWebpack();
    if (w) return w;
    const host = d || any;
    if (host) { const c = skinsViewFromPropSweep(host); if (c) return c; }
    return skinsControllerByScan();
  }

  function skinsControllerCached() {
    if (skinsCtl) {
      try { if (skinsCtl.get("skinsById")) return skinsCtl; } catch (e) {  }
      skinsCtl = null;
    }
    const c = skinsController();
    if (c) skinsCtl = c;
    if (!c) skinsDiagCtl();               
    return c;
  }

  let skinsCtlDiagDone = false;
  function skinsDiagCtl() {
    if (skinsCtlDiagDone) return;
    let routeN = 0;
    try { routeN = document.querySelectorAll(SKINS_ROUTE_SEL).length; } catch (e) { return; }
    if (!routeN) return;                       
    skinsCtlDiagDone = true;
    const E = window.Ember || skinsEmberObj;
    let emberViewN = -1;
    try { emberViewN = document.querySelectorAll(".ember-view").length; } catch (e) {}
    let host = null, evN = 0;
    try {
      host = document.querySelector(SKINS_DETAILS_SEL) || document.querySelector(SKINS_ROUTE_SEL);
      let p = host, d = 0;
      while (p && p.nodeType === 1 && d < 12) {
        try { if (p.classList && p.classList.contains("ember-view")) evN++; } catch (e) {}
        p = p.parentElement; d++;
      }
    } catch (e) {}
    let sv = false, uv = false, props = [];
    if (host) {
      try { sv = !!host.__ember_view__; } catch (e) {}
      try { uv = !!host._view; } catch (e) {}
      try {
        props = Object.getOwnPropertyNames(host)
          .filter(function (k) { return /ember|view|owner|context|container/i.test(k); })
          .slice(0, 12);
      } catch (e) {}
    }
    diag("skins-ctl-miss", {
      ember: typeof E,
      emberView: !!(E && E.View),
      registry: !!(E && E.View && E.View.views),
      getOwner: !!(E && E.getOwner),
      emberViewNodes: emberViewN,
      routeNodes: routeN,
      emberViewAncestors: evN,
      hostCls: host ? String(host.className || "").slice(0, 60) : null,
      hasEmberView: sv,
      hasUnderscoreView: uv,
      hostProps: props.join(","),
      req: typeof window.require,
      pengu: typeof window.Pengu,
      wp: skinsWpShape(),
      host: !!skinsPluginHost,
      emberShape: skinsEmberShape(),
      emberFound: !!skinsEmberObj,
      emberVer: (skinsEmberObj && String(skinsEmberObj.VERSION)) || null,
      emberViewCls: !!(skinsEmberObj && skinsEmberObj.View),
      emberRegistry: !!(skinsEmberObj && skinsEmberObj.View && skinsEmberObj.View.views),
      riot: (function () {
        try { return window.RIOT ? Object.keys(window.RIOT).slice(0, 18).join(",") : null; } catch (e) { return null; }
      })(),
    });
  }

  let skinsOwnerObj = null;
  let skinsOwnerTryAt = 0;
  function skinsOwner(obj) {
    if (skinsOwnerObj) return skinsOwnerObj;
    const now = Date.now();
    if (skinsOwnerTryAt && now - skinsOwnerTryAt < 3000) return null;   
    skinsOwnerTryAt = now;
    const cands = [];
    const push = (o) => { if (o && typeof o.lookup === "function") cands.push(o); };
    try { if (obj) { push(obj.container); push(obj.__container__); push(obj.owner); } } catch (e) {}
    try {
      const c = skinsControllerCached();
      if (c) { push(c.container); push(c.__container__); push(c.owner); }
    } catch (e) {}
    try {
      const E = window.Ember || skinsEmberObj;      
      if (E && E.getOwner && obj) push(E.getOwner(obj));
      if (E && E.getOwner) {
        const el = document.querySelector(SKINS_DETAILS_SEL) || document.querySelector(SKINS_ROUTE_SEL);
        if (el) push(E.getOwner(el));
      }
    } catch (e) {}
    try {
      const host = skinsViewHost(document.querySelector(SKINS_DETAILS_SEL) || document.querySelector(SKINS_ROUTE_SEL));
      if (host) {
        const v = host.__ember_view__ || host._view || null;
        if (v) { push(v.container); push(v.__container__); push(v.targetObject && v.targetObject.container); }
      }
    } catch (e) {}
    for (let i = 0; i < cands.length; i++) {
      try {
        const sp = cands[i].lookup("service:settings-preferences");
        if (sp) { skinsOwnerVia = "owner" + i; skinsOwnerObj = cands[i]; return cands[i]; }
      } catch (e) {  }
    }
    return null;
  }

  function computeSkinsStats(ctrl) {
    let m = null;
    try { m = ctrl.get("skinsById"); } catch (e) { return null; }
    if (!m || typeof m.forEach !== "function") return null;
    let total = 0, chromas = 0;
    const byRid = new Map();   
    m.forEach((s) => {
      if (!s) return;
      total++;
      if (Array.isArray(s.chromas)) chromas += s.chromas.length;
      const rar = s.rarity;
      if (!rar) return;
      const rid = rar.id;
      if (!rid || rid === "kNoRarity") return;
      if (!(rid >= 1 && rid <= 11)) return;
      let rec = byRid.get(rid);
      if (!rec) { rec = { order: rar.order || 0, n: 0 }; byRid.set(rid, rec); }
      rec.n++;
    });
    if (!total) return null;
    const tiers = Array.from(byRid.values())
      .sort((a, b) => b.order - a.order)     
      .map((r) => r.n);
    return { total: total, tiers: tiers, chromas: chromas };
  }

  function skinsTargetsFor(root) {
    if (skinsTargets && skinsTargets.root === root &&
        skinsTargets.big && skinsTargets.big.isConnected &&
        skinsTargets.counts.length && skinsTargets.counts[0].isConnected) {
      return skinsTargets;
    }
    skinsTargets = {
      root: root,
      big: root.querySelector(".collection-owned-totals .total-owned"),
      counts: Array.prototype.slice.call(
        root.querySelectorAll(".collection-tier-information .item .count")),
      chroma: root.querySelector(".collection-chroma-info .legacy-count"),
    };
    return skinsTargets;
  }

  function paintSkinsNumbers(root) {
    const st = skinsStats();
    const t = skinsTargetsFor(root);
    if (t.big && t.big.textContent !== String(st.total)) t.big.textContent = String(st.total);
    if (t.counts.length === st.tiers.length) {
      for (let i = 0; i < t.counts.length; i++) {
        const v = String(st.tiers[i]);
        if (t.counts[i].textContent !== v) t.counts[i].textContent = v;
      }
    }
    if (t.chroma && t.chroma.textContent !== String(st.chromas)) {
      t.chroma.textContent = String(st.chromas);
    }
  }


  let skinsGemByPath = null, skinsGemById = null, skinsGemLoading = false, skinsFillProbe = 0;
  let skinsCardProbe = 0;      

  function skinsSkinKeyFromCard(card) {
    let src = "";
    try {
      const im = card.querySelector("img.inventory-item-image");
      src = im ? String(im.getAttribute("src") || "") : "";
    } catch (e) { return ""; }
    if (!src) return "";
    const tail = src.split("?")[0].split("/").pop() || "";
    return tail.trim().toLowerCase();
  }

  function skinsSkinDirFromCard(card) {
    let src = "";
    try {
      const im = card.querySelector("img.inventory-item-image");
      src = im ? String(im.getAttribute("src") || "") : "";
    } catch (e) { return ""; }
    if (!src) return "";
    const pp = src.split("?")[0].toLowerCase().split("/");
    for (let i = 0; i < pp.length; i++) {
      if (pp[i] === "skins" && i + 1 < pp.length) return pp.slice(0, i + 2).join("/");
    }
    return "";
  }

  function skinsSkinIdFromCard(card) {
    let src = "";
    try {
      const im = card.querySelector("img.inventory-item-image");
      src = im ? String(im.getAttribute("src") || "") : "";
    } catch (e) { return 0; }
    if (!src) return 0;
    const m = /([0-9]{4,8})(?:\.[A-Za-z0-9]+)?(?:\?.*)?$/.exec(src);
    return m ? parseInt(m[1], 10) : 0;
  }

  function skinsGemFromOwnTooltip(card) {
    try {
      const g = card.querySelector(".inventory-item-tooltip-container img.gem");
      const m = g ? /cn-gem-([0-9]+)\.png/.exec(String(g.getAttribute("src") || "")) : null;
      return m ? parseInt(m[1], 10) : 0;
    } catch (e) { return 0; }
  }

  function skinsSetGem(gm, br, n) {
    if (!gm) return;
    try {
      const cls = "gem" + (br ? " " + br : "") + (n ? " cn-gem-" + n : "");
      if (gm.className !== cls) gm.className = cls;
      gm.setAttribute("data-prism-br", br || "");
      if (n && gm.getAttribute("data-prism-gem") !== String(n)) {
        gm.setAttribute("style", "background-image: url(" + SKIN_GEM_BASE + n + ".png)");
        gm.setAttribute("data-prism-gem", String(n));
      }
    } catch (e) {  }
  }

  function skinsExactGem(card, br) {
    if (!card) return 0;
    const own = skinsGemFromOwnTooltip(card);
    if (own) return own;
    const key = skinsSkinKeyFromCard(card);
    if (key && skinsGemByPath) {
      const a = skinsGemByPath[key];
      if (typeof a === "number") return a;
    }
    const dir = skinsSkinDirFromCard(card);      
    if (dir && skinsGemByPath) {
      const c = skinsGemByPath[dir];
      if (typeof c === "number") return c;
    }
    const sid = skinsSkinIdFromCard(card);
    if (sid && skinsGemById) {
      const b = skinsGemById[String(sid)];
      if (typeof b === "number") return b;
    }
    return 0;
  }

  function loadSkinsGemMap() {
    if (skinsGemByPath || skinsGemLoading) return;
    skinsGemLoading = true;
    apiGet("/api/skins/gems", 60000).then(function (d) {
      skinsGemLoading = false;
      if (!d || (!d.byPath && !d.map && !d.byId)) { diag("skins-gemmap", { skip: "no-map" }); return; }
      skinsGemByPath = d.byPath || d.map || {};
      skinsGemById = d.byId || {};
      diag("skins-gemmap", { n: d.count || Object.keys(skinsGemByPath).length,
                             nId: d.countId || Object.keys(skinsGemById).length });
      try {
        const root = document.querySelector(SKINS_ROUTE_SEL);
        if (root) diag("skins-gem-fix", { n: skinsRepairGems(root) });
      } catch (e) {  }
    }).catch(function (e) {
      skinsGemLoading = false;
      diag("skins-gemmap-error", { msg: String(e) });
    });
  }

  function skinsRepairGems(root) {
    let n = 0;
    try {
      const gs = root.querySelectorAll('[data-prism-fill="1"] .gem');
      for (let i = 0; i < gs.length; i++) {
        const gm = gs[i];
        const br = gm.getAttribute("data-prism-br") || "";
        let card = null;
        try { card = gm.closest ? gm.closest(".rcp-fe-lol-collections-inventory-item") : null; } catch (e) { card = null; }
        const exact = skinsExactGem(card, br);
        if (!exact) continue;
        if (gm.getAttribute("data-prism-gem") === String(exact)) continue;
        skinsSetGem(gm, br, exact);
        n++;
      }
      const items = root.querySelectorAll(".inventory-item-thumbnail.available");
      for (let j = 0; j < items.length; j++) { items[j].__hmSig = null; }
    } catch (e) {  }
    return n;
  }

  function skinsDropFillNodes(card) {
    let n = 0;
    try {
      const ours = card.querySelectorAll("[data-prism-fill]");
      for (let i = 0; i < ours.length; i++) {
        const el = ours[i];
        if (el && el.parentNode) { el.parentNode.removeChild(el); n++; }
      }
    } catch (e) {  }
    return n;
  }

  function skinsFillLockCards(root) {
    let items = null;
    try { items = root.querySelectorAll(".inventory-item-thumbnail.available"); } catch (e) { return; }
    if (!items || !items.length) return;
    let made = 0, dropped = 0;
    for (let i = 0; i < items.length; i++) {
      const th = items[i];
      let ourBw = null, offBw = null, ourN = 0;
      try {
        const ch = th.children;
        for (let j = 0; j < ch.length; j++) {
          const c = ch[j];
          if (!c || !c.classList || !c.classList.contains("border-wrapper")) continue;
          if (c.getAttribute("data-prism-fill")) { ourBw = c; ourN++; }
          else if (!offBw) offBw = c;
        }
      } catch (e) {  }
      if (offBw && !ourBw) continue;
      let ic = null;
      try { ic = th.querySelector(".inventory-item-image-container"); } catch (e) { ic = null; }
      if (!ic) continue;
      let br = "";
      try {
        for (let k = 0; k < SKIN_BORDER_RARITIES.length; k++) {
          if (ic.classList.contains(SKIN_BORDER_RARITIES[k])) { br = SKIN_BORDER_RARITIES[k]; break; }
        }
      } catch (e) {  }
      let type = "item-type-skin";
      try {
        if (ic.classList.contains("item-type-general")) type = "item-type-general";
        else if (ic.classList.contains("item-type-finisher")) type = "item-type-finisher";
      } catch (e) {  }
      const need = !!br && !offBw;
      const key = skinsSkinKeyFromCard(th);
      const dir = skinsSkinDirFromCard(th);
      const exact = need ? skinsExactGem(th, br) : 0;
      const gemN = exact || (br ? (SKIN_GEM_BY_BR[br] || 0) : 0);
      const sig = (need ? "1" : "0") + "|" + br + "|" + (need ? gemN : 0) + "|" + type + "|" + key +
        "|" + (ourN > 1 ? 2 : ourN);
      if (th.__hmSig === sig && (!need || (ourBw && ourBw.parentNode === th))) continue;
      dropped += skinsDropFillNodes(th);
      th.__hmSig = sig;
      if (!need) continue;
      if (skinsCardProbe < 40) {
        skinsCardProbe++;
        let icCls = "", src = "";
        try { icCls = String(ic.className || ""); } catch (e) {  }
        try {
          const im = th.querySelector("img.inventory-item-image");
          src = im ? String(im.getAttribute("src") || "") : "";
        } catch (e) {  }
        const gems = [];
        try {
          const gs2 = th.querySelectorAll(".gem");
          for (let z = 0; z < gs2.length && z < 3; z++) {
            const g2 = gs2[z];
            let st = "";
            try { st = String(g2.getAttribute("style") || ""); } catch (e) {  }
            const mm = /cn-gem-([0-9]+)\.png/.exec(st);
            gems.push((g2.getAttribute("data-prism-fill") ? "H" : "O") + ":" +
              String(g2.className || "").replace(/\s+/g, ".") + ":" + (mm ? mm[1] : "-"));
          }
        } catch (e) {  }
        const hit = (k2) => (k2 && skinsGemByPath && typeof skinsGemByPath[k2] === "number")
          ? skinsGemByPath[k2] : 0;
        diag("skins-card-scan", {
          cls: icCls.slice(0, 90), br: br, guess: br ? (SKIN_GEM_BY_BR[br] || 0) : 0,
          exact: exact || 0, gem: gemN, key: key || null, dir: dir || null,
          hitKey: hit(key), hitDir: hit(dir), mapN: skinsGemByPath ? Object.keys(skinsGemByPath).length : -1,
          src: src.slice(-58), nGem: gems.length, gems: gems.join(" | "),
          ourFill: ourN,
        });
      }
      if (skinsFillProbe < 3) {
        skinsFillProbe++;
        let imgTail = "";
        try {
          const im = th.querySelector("img.inventory-item-image");
          imgTail = im ? String(im.getAttribute("src") || "").slice(-46) : "";
        } catch (e) {  }
        diag("skins-fill-probe", {
          br: br, guess: SKIN_GEM_BY_BR[br] || 0, exact: exact || 0,
          key: key || null,
          skinId: skinsSkinIdFromCard(th),
          hasOwnTip: (function () { try { return !!th.querySelector(".inventory-item-tooltip-container"); } catch (e) { return null; } })(),
          ownGem: skinsGemFromOwnTooltip(th) || 0,
          hasMap: !!skinsGemByPath,
          imgTail: imgTail,
        });
      }
      try {
        const bw = document.createElement("div");
        bw.className = "border-wrapper " + br + " " + type;
        bw.setAttribute("data-prism-fill", "1");
        const bd = document.createElement("div");
        bd.className = "border " + br + " " + type;
        bd.setAttribute("style", "background-image: url(" + SKIN_BORDER_BASE + br + ".png)");
        const gw = document.createElement("div");
        gw.className = "gem-wrapper";
        const gm = document.createElement("div");
        skinsSetGem(gm, br, gemN);
        gw.appendChild(gm); bd.appendChild(gw); bw.appendChild(bd); th.appendChild(bw);
        made++;
      } catch (e) {  }
    }
    if (made || dropped) diag("skins-fill-sync", { made: made, dropped: dropped, n: items.length });
  }

  function skinsTipHasOfficialDate(tip) {
    try {
      const all = tip.querySelectorAll(".row.acquisition-date");
      for (let i = 0; i < all.length; i++) {
        if (!all[i].getAttribute("data-prism-row")) return true;
      }
    } catch (e) {  }
    return false;
  }

  function skinsDropOwnDateRows(tip) {
    let n = 0;
    try {
      const ours = tip.querySelectorAll(".row.acquisition-date[data-prism-row]");
      for (let i = 0; i < ours.length; i++) {
        if (ours[i].parentNode) { ours[i].parentNode.removeChild(ours[i]); n++; }
      }
    } catch (e) {  }
    return n;
  }

  let skinsTipRecheckTimers = [];
  function skinsTipScheduleRecheck(tip) {
    for (let i = 0; i < skinsTipRecheckTimers.length; i++) {
      try { clearTimeout(skinsTipRecheckTimers[i]); } catch (e) {  }
    }
    skinsTipRecheckTimers = [];
    const run = function () {
      try {
        if (!tip || !tip.isConnected) return;
        if (!skinsTipHasOfficialDate(tip)) return;
        const n = skinsDropOwnDateRows(tip);
        if (n) diag("skins-tip-date", { undone: n, at: "recheck" });
      } catch (e) {  }
    };
    try {
      skinsTipRecheckTimers.push(setTimeout(run, 300));
      skinsTipRecheckTimers.push(setTimeout(run, 1200));
    } catch (e) {  }
  }

  function skinsPatchTooltip() {
    const dateTxt = state.skins.date ? String(state.skins.date).split("-").join("/") : "";
    let tip = null;
    try { if (skinsHoverItem) tip = skinsHoverItem.querySelector(".inventory-item-tooltip-container"); } catch (e) { tip = null; }
    if (!tip) { try { tip = document.querySelector(".inventory-item-tooltip-container"); } catch (e) { return; } }
    if (!tip) return;
    try { tip.setAttribute(SKINS_TIP_MARK, "1"); } catch (e) {  }
    try {
      const ps = tip.querySelectorAll(".price");
      for (let i = 0; i < ps.length; i++) {
        if (ps[i] && ps[i].parentNode) ps[i].parentNode.removeChild(ps[i]);
      }
    } catch (e) {  }
    try {
      const brs = tip.querySelectorAll(".info-container .bottom-row");
      for (let i = 0; i < brs.length; i++) {
        const br = brs[i];
        if (!br || br.querySelector("*")) continue;
        if (br.parentNode) br.parentNode.removeChild(br);
        diag("skins-tip-date", { dropped: "empty-bottom-row" });
      }
    } catch (e) {  }
    try {
      const gimg = tip.querySelector("img.gem");
      const src = gimg ? String(gimg.getAttribute("src") || "") : "";
      const m = /cn-gem-(\d+)\.png/.exec(src);
      if (m && skinsHoverItem) {
        const g = skinsHoverItem.querySelector('[data-prism-fill="1"] .gem');
        if (g && g.getAttribute("data-prism-gem") !== m[1]) {
          skinsSetGem(g, g.getAttribute("data-prism-br") || "", parseInt(m[1], 10));
        }
      }
    } catch (e) {  }
    let box = null;
    try { box = tip.querySelector(".info-container"); } catch (e) { box = null; }
    if (!box) return;
    if (skinsTipHasOfficialDate(tip)) {
      const dropped = skinsDropOwnDateRows(tip);
      if (dropped) diag("skins-tip-date", { undone: dropped });
      return;
    }
    if (box.querySelector(".row.acquisition-date[data-prism-row]")) {
      skinsTipScheduleRecheck(tip);        
      return;
    }
    if (!dateTxt) return;
    try {
      const row = document.createElement("div");
      row.className = "row acquisition-date";
      row.setAttribute("data-prism-row", "1");
      const p = document.createElement("p");
      p.className = "gold-text";
      p.textContent = SKINS_ACQ_LABEL + " " + dateTxt;
      row.appendChild(p);
      const after = box.querySelector(".bottom-row, .chroma-info, .limited-label");
      if (after && after.parentNode === box) box.insertBefore(row, after);
      else box.appendChild(row);
      diag("skins-tip-date", { d: dateTxt });
      skinsTipScheduleRecheck(tip);        
    } catch (e) {  }
  }

  let skinsGuardsOn = false, skinsHoverItem = null, skinsTipTimer = null;
  let skinsCbHost = null;       
  let skinsCbEl = null;         
  let skinsCbWant = null;       
  let skinsCbPushed = false;    

  function skinsIsUnownedCb(t) {
    if (!t || typeof t.getAttribute !== "function") return false;
    if (t.getAttribute("name") === "isUnownedShown") return true;
    try { if (t.id === "isUnownedShown") return true; } catch (e) {  }
    return false;
  }

  function skinsBindCbHost(host) {
    if (!host || host.__hmCbGuard) return false;
    host.__hmCbGuard = true;
    host.addEventListener("change", function (e) {
      const t = e && e.target;
      if (!skinsIsUnownedCb(t)) return;
      skinsCbWant = !!t.checked;
      if (t.checked === false) {
        try { e.stopPropagation(); } catch (er) {  }
        diag("skins-unowned-toggle", { checked: false, stoppedAt: "host" });
      } else {
        diag("skins-unowned-toggle", { checked: true, allowed: true });
      }
    }, false);
    return true;
  }

  function ensureSkinsUnownedOn() {
    if (skinsCbPushed) return;
    const t = (skinsCbEl && skinsCbEl.isConnected) ? skinsCbEl : null;
    if (!t) return;
    if (t.checked) { skinsCbPushed = true; return; }   
    try {
      t.checked = true;        
      t.dispatchEvent(new Event("change", { bubbles: true }));   
      skinsCbPushed = true;
      diag("skins-unowned-push", { at: "entry" });
    } catch (e) {  }
  }

  function ensureSkinsCbGuard(root) {
    if (skinsCbHost && skinsCbHost.isConnected && skinsCbEl && skinsCbEl.isConnected) return;
    skinsCbHost = null;
    skinsCbEl = null;
    skinsCbPushed = false;      
    let t = null;
    try { t = (root || document).querySelector('input[name="isUnownedShown"]'); } catch (e) { return; }
    if (!t) return;
    skinsCbEl = t;
    let host = null;
    try { host = t.closest ? t.closest("lol-uikit-flat-checkbox") : null; } catch (e) { host = null; }
    if (!host) return;
    if (skinsBindCbHost(host)) skinsCbHost = host;
  }

  function syncSkinsCb(root) {
    if (skinsCbWant === null) return;
    const t = (skinsCbEl && skinsCbEl.isConnected) ? skinsCbEl
      : (function () { try { return (root || document).querySelector('input[name="isUnownedShown"]'); } catch (e) { return null; } })();
    if (!t) return;
    if (!!t.checked === skinsCbWant) return;
    try { t.checked = skinsCbWant; diag("skins-unowned-resync", { to: skinsCbWant }); } catch (e) {  }
  }

  function skinsInstallGuards() {
    if (skinsGuardsOn) return;
    skinsGuardsOn = true;
    try {
      document.addEventListener("change", function (e) {
        const t = e && e.target;
        if (!skinsIsUnownedCb(t)) return;
        let host = null;
        try { host = t.closest ? t.closest("lol-uikit-flat-checkbox") : null; } catch (er) { host = null; }
        if (host) { skinsBindCbHost(host); skinsCbHost = host; return; }
        if (t.checked !== false) {
          diag("skins-unowned-toggle", { checked: true, allowed: true, at: "capture-fallback" });
          return;                                  
        }
        diag("skins-unowned-toggle", { checked: false, stoppedAt: "capture-fallback" });
        try { e.stopImmediatePropagation(); } catch (er) {  }
        try { e.stopPropagation(); } catch (er) {  }
      }, true);
      document.addEventListener("mouseover", function (e) {
        let it = null;
        try { it = (e.target && e.target.closest) ? e.target.closest(SKINS_ITEM_SEL) : null; } catch (er) { it = null; }
        if (!it) return;
        skinsHoverItem = it;
        if (skinsTipTimer) return;                 
        skinsTipTimer = setTimeout(function () {
          skinsTipTimer = null;
          try { skinsPatchTooltip(); } catch (er) {  }
        }, 120);
      }, true);
    } catch (e) {  }
  }


  function paintSkinsGroupCounts(root) {
    let els = null;
    try { els = root.querySelectorAll(".group-owned-count"); } catch (e) { return; }
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const txt = el.textContent || "";
      const m = /^(\s*)(\d+)(\s*\/\s*)(\d+)(\s*)$/.exec(txt);
      if (!m) continue;
      const total = m[4];
      if (m[2] === total) continue;                    
      const next = m[1] + total + m[3] + total + m[5];
      if (el.textContent !== next) el.textContent = next;
    }
  }

  function captureSkinsBaseline(ctrl) {
    if (skinsBaseAsked) return;
    const o = skinsOwner(ctrl);
    if (!o) {
      return;
    }
    skinsBaseAsked = true;
    try {
      const sp = o.lookup("service:settings-preferences");
      if (!sp || typeof sp.getSkinsAccountSettings !== "function") {
        diag("skins-baseline", { skipped: "no-settings-service", via: skinsOwnerVia });
        return;
      }
      sp.getSkinsAccountSettings().then((s) => {
        if (s && s.data && Object.prototype.hasOwnProperty.call(s.data, "unownedFilter")) {
          state.skins.acct = s.data.unownedFilter;
          diag("skins-baseline", { unownedFilter: String(state.skins.acct), via: skinsOwnerVia });
        } else {
          diag("skins-baseline", { missing: true, via: skinsOwnerVia });
        }
      }).catch((e) => { diag("skins-baseline-error", { msg: String(e) }); });
    } catch (e) { diag("skins-baseline-error", { msg: String(e) }); }
  }

  function installSkinsXhrGuard() {
    if (skinsXhrPatched) return;
    if (typeof XMLHttpRequest === "undefined") return;
    const XO = XMLHttpRequest.prototype.open;
    const XS = XMLHttpRequest.prototype.send;
    if (typeof XO !== "function" || typeof XS !== "function") return;

    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        this.__hmSkinsSettings =
          !!state.skins.all &&
          String(method || "").toUpperCase() === "PUT" &&
          String(url || "").indexOf(SKINS_SETTINGS_PATH) >= 0;
      } catch (e) {  }
      return XO.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (this.__hmSkinsSettings && typeof body === "string" && body) {
          const o = JSON.parse(body);
          if (o && o.data && Object.prototype.hasOwnProperty.call(o.data, "unownedFilter")) {
            const want = (typeof state.skins.acct === "undefined") ? false : state.skins.acct;
            if (o.data.unownedFilter !== want) {
              o.data.unownedFilter = want;
              body = JSON.stringify(o);
              diag("skins-settings-guard", { to: String(want), acct: String(state.skins.acct) });
            }
          }
        }
      } catch (e) {
        diag("skins-settings-guard-error", { msg: String(e) });
      }
      return XS.call(this, body);
    };

    skinsXhrPatched = true;
    diag("skins-xhr-guard", { installed: true });
  }

  function skinsEachById(m, fn) {
    if (!m) return;
    if (typeof m.forEach === "function") {
      m.forEach(function (s, k) { fn(s, (s && s.id !== undefined && s.id !== null) ? s.id : k); });
      return;
    }
    if (typeof m === "object") {
      let ks = null;
      try { ks = Object.keys(m); } catch (e) { return; }
      for (let i = 0; i < ks.length; i++) fn(m[ks[i]], ks[i]);
    }
  }

  function skinsDateTs(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 2009 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d, 0, 0, 1, 0);
    const t = dt.getTime();
    if (isNaN(t)) return null;
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return t;
  }

  function skinsFlipOwned(ctrl) {
    const m = (function () { try { return ctrl.get("skinsById"); } catch (e) { return null; } })();
    if (!m) return 0;
    const rec = state.skins.flipped || (state.skins.flipped = {});
    const ts = skinsDateTs(state.skins.date);
    const FAR = 8640000000000000;
    let n = 0;
    skinsEachById(m, function (s, key) {
      if (!s || !s.ownership) return;
      if (s.ownership.owned) return;
      const tiers = s.questSkinInfo && s.questSkinInfo.tiers;
      let tierIdx = -1;
      if (Array.isArray(tiers) && tiers.length) {
        for (let i = tiers.length - 1; i >= 0; i--) {
          if (tiers[i] && tiers[i].ownership && !tiers[i].ownership.owned) { tierIdx = i; break; }
        }
      }
      rec[key] = {
        o: false,                                             
        p: (s.ownership.rental ? s.ownership.rental.purchaseDate : null),
        l: s.lastVisitTime,
        t: tierIdx,                                           
      };
      s.ownership.owned = true;
      if (s.ownership.rental && ts) s.ownership.rental.purchaseDate = ts;
      s.lastVisitTime = FAR;
      if (tierIdx >= 0) {
        const t = tiers[tierIdx];
        rec[key].to = !!t.ownership.owned;
        t.ownership.owned = true;
        if (t.ownership.rental && ts) t.ownership.rental.purchaseDate = ts;
      }
      n++;
    });
    return n;
  }

  function skinsRestoreOwned(ctrl) {
    const rec = state.skins.flipped;
    if (!rec) return 0;
    const m = (function () { try { return ctrl ? ctrl.get("skinsById") : null; } catch (e) { return null; } })();
    let n = 0;
    skinsEachById(m, function (s, key) {
      if (!s || !s.ownership) return;
      const bak = rec[key];
      if (!bak) return;
      if (s.ownership.owned === true) {
        s.ownership.owned = !!bak.o;
        if (s.ownership.rental) s.ownership.rental.purchaseDate = (bak.p === undefined ? null : bak.p);
        if (bak.l === undefined) { try { delete s.lastVisitTime; } catch (e) {  } }
        else s.lastVisitTime = bak.l;
        n++;
      }
      if (bak.t >= 0 && Array.isArray(s.questSkinInfo && s.questSkinInfo.tiers)) {
        const t = s.questSkinInfo.tiers[bak.t];
        if (t && t.ownership) {
          t.ownership.owned = !!bak.to;
          if (t.ownership.rental) t.ownership.rental.purchaseDate = (bak.p === undefined ? null : bak.p);
        }
      }
    });
    state.skins.flipped = null;
    return n;
  }

  function notifySkinsData(ctrl, why) {
    const keys = ["filteredSkins", "groupedSkins", "itemSizes"];
    for (let i = 0; i < keys.length; i++) {
      try { ctrl.notifyPropertyChange(keys[i]); }
      catch (e) { diag("skins-notify-error", { why: why, key: keys[i], msg: String(e) }); }
    }
    diag("skins-notify", { why: why });
  }

  function applySkinsUnlockCSS() {
    let el = document.getElementById(SKINS_UNLOCK_CSS_ID);
    if (!state.skins.all) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = SKINS_UNLOCK_CSS_ID;
      el.setAttribute("data-prism", "1");
      document.head.appendChild(el);
    }
    if (el.textContent !== SKINS_UNLOCK_CSS) el.textContent = SKINS_UNLOCK_CSS;
  }

  function forceSkinsAllMode() {
    const ctrl = skinsControllerCached();
    if (!ctrl) return false;
    if (!state.skins.stats) {
      const st = computeSkinsStats(ctrl);
      if (st) {
        state.skins.stats = st;
        diag("skins-stats", { total: st.total, tiers: st.tiers, chromas: st.chromas, src: "live", via: skinsCtlVia });
      }
    }
    const flipped = skinsFlipOwned(ctrl);
    if (flipped) {
      diag("skins-unlock", { flipped: flipped, date: state.skins.date || null, via: skinsCtlVia });
      notifySkinsData(ctrl, "unlock");
    }
    captureSkinsBaseline(ctrl);   
    let cur = null;
    try { cur = ctrl.get("isUnownedShown"); } catch (e) { return false; }
    if (typeof state.skins.pre === "undefined") state.skins.pre = !!cur;
    if (cur === true) return true;
    try {
      ctrl.set("isUnownedShown", true);
      diag("skins-force-unowned", { prev: String(cur) });
      return true;
    } catch (e) {
      diag("skins-force-unowned-error", { msg: String(e) });
      return false;
    }
  }

  function applySkinsDate(v) {
    state.skins.date = String(v || "");
    saveSkinsPick();
    const ctrl = skinsControllerCached();
    if (!ctrl) return 0;
    const back = skinsRestoreOwned(ctrl);
    if (back) notifySkinsData(ctrl, "date-restore");
    const n = skinsFlipOwned(ctrl);
    if (n) notifySkinsData(ctrl, "date-apply");
    diag("skins-date", { date: state.skins.date || null, restored: back, flipped: n });
    return n;
  }

  function watchSkinsOptOut(root) {
    if (root.__hmOptOutBound) return;
    root.__hmOptOutBound = true;
    root.addEventListener("change", (e) => {
      const t = e && e.target;
      if (!t || t.getAttribute("name") !== "isUnownedShown") return;
      diag("skins-unowned-toggle", { checked: !!t.checked });
      skinsScanAt = 0;
      try { tickSkins(); } catch (er) {  }
    });
  }

  function skinsLeaveSkinsPage() {
    state.skins.el = null;
    skinsTargets = null;
    skinsOwnerObj = null;     
    skinsCtlVia = "";
    skinsCbHost = null;       
    skinsCbEl = null;
    skinsCbPushed = false;    
    try {
      const tips = document.querySelectorAll(SKINS_TIP_SEL);
      for (let i = 0; i < tips.length; i++) tips[i].removeAttribute(SKINS_TIP_MARK);
    } catch (e) {  }
    const c = skinsCtl;
    if (c) {
      const back = skinsRestoreOwned(c);
      if (back) {
        diag("skins-unlock-release", { restored: back, at: "leave" });
        notifySkinsData(c, "leave");
      }
    }
    skinsCtl = null;          
    diag("skins-leave", {});
  }

  function tickSkins() {
    if (!state.skins.all) return;

    if (state.skins.el && state.skins.el.isConnected) {
      watchSkinsOptOut(state.skins.el);
      forceSkinsAllMode();
      ensureSkinsCbGuard(state.skins.el);      
      ensureSkinsUnownedOn();                  
      syncSkinsCb(state.skins.el);             
      paintSkinsNumbers(state.skins.el);
      paintSkinsGroupCounts(state.skins.el);   
      skinsFillLockCards(state.skins.el);      
      skinsDiag(false, state.skins.el);
      return;
    }

    if (state.skins.el) {
      skinsLeaveSkinsPage();
      skinsScanAt = 0;
    }

    const now = Date.now();
    if (now - skinsScanAt < SKINS_SCAN_MS) return;
    skinsScanAt = now;

    const root = document.querySelector(SKINS_ROUTE_SEL);
    if (!root) {
      if (state.skins.el || skinsCtl) skinsLeaveSkinsPage();
      return;
    }
    if (state.skins.el !== root) {
      state.skins.el = root;
      skinsTargets = null;
      skinsCtl = null;
      skinsFillProbe = 0;
      diag("skins-enter", {
        items: root.querySelectorAll(".collection-tier-information .item").length,
      });
    }
    loadSkinsGemMap();
    watchSkinsOptOut(root);
    forceSkinsAllMode();
    ensureSkinsCbGuard(root);
    ensureSkinsUnownedOn();
    syncSkinsCb(root);
    paintSkinsNumbers(root);
    paintSkinsGroupCounts(root);
    skinsFillLockCards(root);
    skinsDiag(true, root);
  }

  function skinsDiag(fresh, root) {
    const now = Date.now();
    if (now - skinsLastDiag < 15000) return;
    skinsLastDiag = now;
    const st = skinsStats();
    const t = skinsTargetsFor(root);
    diag("skins-paint", {
      fresh: !!fresh,
      mode: state.skins.all ? "all" : "off",
      statsSrc: state.skins.stats ? "live" : "fallback",
      want: [st.total].concat(st.tiers).concat([st.chromas]),
      tierCells: t.counts.length,
      bigShown: t.big ? t.big.textContent : null,
      chromaShown: t.chroma ? t.chroma.textContent : null,
      date: state.skins.date || null,
      via: skinsCtlVia,
    });
  }

  function ensureSkinsObserver() {
    if (skinsObs || typeof MutationObserver === "undefined") return;
    const attach = () => {
      if (skinsObs || !document.body) return;
      skinsObs = new MutationObserver(() => {
        try { tickSkins(); } catch (e) {  }
      });
      skinsObs.observe(document.body, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ["src"],
      });
      if (!skinsScrollBound) {
        skinsScrollBound = true;
        document.addEventListener("scroll", function () {
          if (!state.skins.all) return;
          const now = Date.now();
          if (now - skinsScrollAt < 120) return;
          skinsScrollAt = now;
          try { tickSkins(); } catch (e) {  }
        }, true);
      }
      diag("skins-observer", { attached: true });
    };
    if (document.body) attach();
    else document.addEventListener("DOMContentLoaded", attach, { once: true });
  }

  let skinsEnvTimers = false;
  function probeSkinsEnv() {
    skinsHookAnnounceRegistration();
    const E = skinsEmberFromWebpack();
    let vcls = false, reg = false, viewsN = -1;
    if (E) {
      try { vcls = !!E.View; } catch (e) {}
      try { if (E.View && E.View.views) { reg = true; viewsN = Object.keys(E.View.views).length; } } catch (e) {}
    }
    diag("skins-env", {
      wp: skinsWpShape(),
      emberShape: skinsEmberShape(),
      host: !!skinsPluginHost,
      announceGen: (function () { try { return typeof window.getPluginAnnounceEventName; } catch (e) { return "err"; } })(),
      emberFound: !!E,
      emberVer: E ? String(E.VERSION) : null,
      emberViewCls: vcls,
      registry: reg,
      views: viewsN,
      emberViewNodes: (function () { try { return document.querySelectorAll(".ember-view").length; } catch (e) { return -1; } })(),
      riot: (function () {
        try { return window.RIOT ? Object.keys(window.RIOT).slice(0, 18).join(",") : null; } catch (e) { return null; }
      })(),
      onSkinsPage: (function () { try { return document.querySelectorAll(SKINS_ROUTE_SEL).length > 0; } catch (e) { return false; } })(),
    });
  }
  function scheduleSkinsEnvProbe() {
    if (skinsEnvTimers) return;
    skinsEnvTimers = true;
    try { setTimeout(probeSkinsEnv, 6000); } catch (e) {}
    try { setTimeout(probeSkinsEnv, 25000); } catch (e) {}
    try { setTimeout(probeSkinsEnv, 70000); } catch (e) {}
  }

  let skinsRetryTimer = null, skinsRetryN = 0;
  function skinsRetrySoon() {
    if (skinsRetryTimer) return;
    skinsRetryTimer = setTimeout(function () {
      skinsRetryTimer = null;
      if (!state.skins.all || skinsCtl) return;
      if (skinsRetryN++ >= 8) return;
      skinsScanAt = 0;
      try { tickSkins(); } catch (e) {  }
      if (!skinsCtl) skinsRetrySoon();
    }, 3000);
  }

  function applySkinsOverride() {
    installSkinsXhrGuard();   
    applySkinsUnlockCSS();
    skinsHookAnnounceRegistration();
    skinsInstallGuards();     
    scheduleSkinsEnvProbe();  
    if (!state.skins.all) return;
    skinsRetryN = 0;
    skinsRetrySoon();
    ensureSkinsObserver();
    skinsScanAt = 0;          
    tickSkins();
  }

  function releaseSkinsOverride() {
    const ctrl = skinsControllerCached();
    if (ctrl) {
      const back = skinsRestoreOwned(ctrl);
      if (back) {
        diag("skins-unlock-release", { restored: back, at: "toggle-off" });
        notifySkinsData(ctrl, "toggle-off");
      }
      try {
        const want = (typeof state.skins.pre === "undefined") ? false : !!state.skins.pre;
        if (ctrl.get("isUnownedShown") !== want) ctrl.set("isUnownedShown", want);
      } catch (e) { diag("skins-release-error", { msg: String(e) }); }
    }
    applySkinsUnlockCSS();    
    state.skins.el = null;
    skinsTargets = null;
  }

  function probeSkinsPage(force) {
    const root = document.querySelector(SKINS_ROUTE_SEL);
    if (!root) return;
    if (!state.skins.all && !force) return;
    const cells = root.querySelectorAll(".item-grid .items > *");
    let locked = 0;
    Array.prototype.forEach.call(root.querySelectorAll(".item-grid .lock-icon"), (ic) => {
      try { if (getComputedStyle(ic).display !== "none") locked++; } catch (e) {  }
    });
    diag("skins-grid-probe", {
      mode: state.skins.all ? "all" : "off",
      gridCells: cells.length,
      visibleLockIcons: locked,
      forcedUnowned: (() => {
        const c = skinsControllerCached();
        try { return c ? !!c.get("isUnownedShown") : null; } catch (e) { return null; }
      })(),
      acct: String(state.skins.acct),
      pre: String(state.skins.pre),
      guard: skinsXhrPatched,
      styleNone: true,
    });
  }

  function skinsTodayStr() {
    const d = new Date();
    const p = (n) => (n < 10 ? "0" + n : "" + n);
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function saveSkinsPick() {
    const t = JSON.stringify({ all: !!state.skins.all, date: String(state.skins.date || "") });
    try { if (window.DataStore) window.DataStore.set(SKINS_KEY, t); } catch (e) {  }
    try { localStorage.setItem(SKINS_KEY, t); } catch (e) {  }
  }

  function loadSkinsPick() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(SKINS_KEY); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(SKINS_KEY); } catch (e) {  } }
    if (!raw) { state.skins.date = skinsTodayStr(); return; }
    try {
      const o = JSON.parse(raw);
      if (o && typeof o.all === "boolean") state.skins.all = o.all;
      state.skins.date = (o && typeof o.date === "string") ? o.date : skinsTodayStr();
    } catch (e) { state.skins.date = skinsTodayStr(); }
  }

  function renderSkinsSection(body) {
    const nowEl = body.querySelector('[data-el="sk-now"]');
    const hint = body.querySelector('[data-el="sk-hint"]');
    const dateEl = body.querySelector('[data-el="sk-date"]');
    if (!nowEl) return;
    const say = (t) => { if (hint) hint.textContent = t; };

    const mark = () => {
      const st = skinsStats();
      if (dateEl && dateEl.value !== (state.skins.date || "")) dateEl.value = state.skins.date || "";
      if (state.skins.all) {
        const here = !!document.querySelector(SKINS_ROUTE_SEL);
        nowEl.textContent = "已开启（全皮肤 " + st.total + " · 炫彩 " + st.chromas + "）" +
          (here ? "　当前正在皮肤页" : "　（切到藏品 → 皮肤即生效）");
      } else {
        nowEl.textContent = '关闭（各数字按客户端原生的"已拥有"口径）';
      }
    };

    const applyDate = (v) => {
      if (!state.skins.all) {
        state.skins.date = String(v || ""); saveSkinsPick();
        say("已记住这个日期。但上面的开关是关的，开启后才会生效。");
        mark();
        return;
      }
      const n = applySkinsDate(v);
      if (!n) {
        say("日期已记住。不过现在没在皮肤页（或者没拿到客户端数据），切到藏品 → 皮肤即生效。");
      } else {
        say("已把 " + n + " 款皮肤的「获得时间」改成 " + (state.skins.date || "（清空）") +
            "；悬浮上去就能看到。原有皮肤的日期没动。");
      }
      mark();
    };

    const btn = body.querySelector('[data-act="sk-toggle"]');
    if (btn) {
      btn.addEventListener("click", () => {
        state.skins.all = !state.skins.all;
        if (state.skins.all) {
          state.skins.el = null;
          skinsTargets = null;
          applySkinsOverride();
        } else {
          releaseSkinsOverride();
        }
        saveSkinsPick();
        mark();
        say(state.skins.all
          ? "已开启：去「藏品 → 皮肤」看，四处数字会变成全部口径，网格列出全部皮肤，" +
            "未拥有的也会带稀有度边框 + 品质宝石"
          : "已关闭：恢复成客户端原生的「已拥有」口径");
        diag("skins-pick", { all: state.skins.all });
      });
    }

    const applyBtn = body.querySelector('[data-act="sk-date-apply"]');
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        if (!dateEl || !dateEl.value) { say("先在上面选一个年月日。"); return; }
        applyDate(dateEl.value);
      });
    }
    const clearBtn = body.querySelector('[data-act="sk-date-clear"]');
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        applyDate("");
        say("已清空：这些皮肤的悬浮弹窗不再显示「已获取」那一行（你自己真有的皮肤不受影响）。");
      });
    }

    tickSkins();
    probeSkinsPage();
    mark();
  }

  function renderCulSection(body) {
    if (!body) return;
    let host = null;
    try { host = body.querySelector('[data-el="cul-host"]'); } catch (e) { host = null; }
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-el", "cul-host");
      body.appendChild(host);
    }
    const rows = CUL_PAGES.map(function (pg) {
      const st = state.cul[pg.key];
      return '<div class="' + NS + '-setrow">' +
               '<span class="' + NS + '-setlabel">' + pg.label + '显示为已解锁</span>' +
               '<span class="' + NS + '-setpv" data-el="cul-' + pg.key + '-now">' + (st.all ? "已开启" : "已关闭") + '</span>' +
               '<button class="' + NS + '-ghost" data-act="cul-toggle" data-cul="' + pg.key + '">切换</button>' +
             '</div>';
    }).join("");

    host.innerHTML =
      '<div class="' + NS + '-box">' +
        '<div class="' + NS + '-subh">藏品页 · 守卫 / 终结特效</div>' +
        rows +
        '<div class="' + NS + '-setrow"><span class="' + NS + '-sethint">' +
          '打开后，去「藏品 → 守卫」和「藏品 → 终结特效」看：所有条目都会显示成已拥有' +
          '（带品质边框、没有锁）。' +
        '</span></div>' +
        '<div class="' + NS + '-setrow"><span class="' + NS + '-sethint">' +
          '只改大厅里你看到的样子，<b>不会真的解锁</b>，也<b>不影响游戏里能不能用</b>。' +
        '</span></div>' +
        '<div class="' + NS + '-setrow"><span class="' + NS + '-sethint" data-el="cul-hint"></span></div>' +
      '</div>';

    const hintEl = host.querySelector('[data-el="cul-hint"]');
    const say = function (t) { if (hintEl) hintEl.textContent = t; };

    const btns = host.querySelectorAll('[data-act="cul-toggle"]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        const key = String(this.getAttribute("data-cul") || "");
        const st = state.cul[key];
        const inst = CUL[key];
        if (!st || !inst) return;
        st.all = !st.all;
        const nowEl = host.querySelector('[data-el="cul-' + key + '-now"]');
        if (nowEl) nowEl.textContent = st.all ? "已开启" : "已关闭";
        if (st.all) inst.arm(); else inst.disarm();
        culSave();
        const label = (function () {
          for (let j = 0; j < CUL_PAGES.length; j++) if (CUL_PAGES[j].key === key) return CUL_PAGES[j].label;
          return key;
        })();
        say(st.all ? ("已开启「" + label + "」——去那一页看看（没生效就切走再进来一次）。")
                   : ("已关闭「" + label + "」——恢复成客户端原生的已拥有口径。"));
        diag("cul-pick", { key: key, all: st.all });
      });
    }
    try { culTickAll(); } catch (e) {  }
  }


  const CUL_ITEM_CLS = "rcp-fe-lol-collections-inventory-item";

  const CUL_PAGES = [
    {
      key: "wards",
      label: "守卫",
      routeSel: COLLECTION_APP + " .wards-route",
      itemSel: COLLECTION_APP + " .wards-route ." + CUL_ITEM_CLS,
      modelKey: "wardsById",
      lookupName: "controller:wards",
      notifyKeys: ["filteredWards", "groupedWards"],
      cssId: NS + "-wardsunlock",
      storeKey: SETTINGS_KEY + ".cul.wards",
    },
    {
      key: "finishers",
      label: "终结特效",
      routeSel: COLLECTION_APP + " .finishers-route",
      itemSel: COLLECTION_APP + " .finishers-route ." + CUL_ITEM_CLS,
      modelKey: "finishersById",
      lookupName: "controller:finishers",
      notifyKeys: ["filteredFinishers", "searchedFinishers"],
      cssId: NS + "-finishersunlock",
      storeKey: SETTINGS_KEY + ".cul.finishers",
    },
  ];

  const CUL_FALLBACK = {
    wards:     { total: 266, tiers: [12, 17, 114] },
    finishers: { total: 7,   tiers: [6] },
  };

  const CUL_CB_ACCT_KEY = { isUnownedShown: "unownedFilter", isUnavailableShown: "unavailableFilter" };

  function culCssText(page) {
    const s = page.itemSel;
    return s + " .border-wrapper.unowned{display:block !important}\n" +
           s + " .lock-wrapper{display:none !important}\n" +
           s + " .inventory-item-image-container{opacity:.8 !important}\n" +
           s + ":hover .inventory-item-image-container{opacity:1 !important}\n";
  }

  let culWpAt = 0;
  function culEmber() {
    try { if (skinsEmberObj) return skinsEmberObj; } catch (e) {  }
    let Eraw = null;
    try { Eraw = window.Ember; } catch (e) { Eraw = null; }
    if (Eraw) {
      let E = null;
      try { E = skinsNormalizeEmber(Eraw); } catch (e) { E = null; }
      if (E) { try { skinsEmberObj = E; } catch (e) {  }
               diag("cul-ember", { via: "window.Ember(unwrapped)" }); return E; }
    }
    try { const h = skinsEmberFromHost(); if (h) { diag("cul-ember", { via: "host" }); return h; } } catch (e) {  }
    const now = Date.now();
    if (now - culWpAt > 10000) {
      culWpAt = now;
      try { const w = skinsEmberFromWebpack(); if (w) { diag("cul-ember", { via: "webpack" }); return w; } } catch (e) {  }
    }
    return null;
  }

  const CUL_ALL = [];
  function culWrapLookup(obj, tag) {
    if (!obj || typeof obj.lookup !== "function") return;
    try { if (obj.__culWrapped) return; obj.__culWrapped = 1; } catch (e) { return; }
    const orig = obj.lookup;
    const wrapped = function () {
      const r = orig.apply(this, arguments);
      try {
        for (let i = 0; i < CUL_ALL.length; i++) {
          try { CUL_ALL[i].onLookup(r); } catch (e) {  }
        }
      } catch (e) {  }
      return r;
    };
    try {
      obj.lookup = wrapped;
    } catch (e) { return; }               
    diag("cul-lookup-wrap", { tag: tag });
  }

  function culMake(page) {
    const st = state.cul[page.key];
    const SEL = page.routeSel;
    const SCAN_MS = 250;              
    let ctl = null, ctlVia = "";
    let scanAt = 0, scanTryAt = 0, sweepAt = 0, lastDiag = 0, ctlDiagDone = false;
    let tgt = null;                   
    let cellDiagAt = 0;               
    let visAt = 0;                    

    function hasModel(o) {
      if (!o || typeof o.get !== "function") return false;
      try { return !!o.get(page.modelKey); } catch (e) { return false; }
    }

    function viewHost(el) {
      let n = el, d = 0;
      while (n && n.nodeType === 1 && d < 12) {
        try { if (n.classList && n.classList.contains("ember-view")) return n; } catch (e) {  }
        n = n.parentElement; d++;
      }
      return null;
    }

    function ctlFromView(v) {
      let cur = v, d = 0;
      while (cur && d < 16) {
        let ctx = null;
        try { ctx = cur.context || cur._context || null; } catch (e) { ctx = null; }
        if (!ctx && typeof cur.get === "function") {
          try { ctx = cur.get("context") || cur.get("controller") || cur.get("target") || null; } catch (e) { ctx = null; }
        }
        if (hasModel(ctx)) return ctx;
        if (hasModel(cur)) return cur;
        try { cur = cur._parentView || cur.parentView || null; } catch (e) { cur = null; }
        d++;
      }
      return null;
    }

    function ctlFromEl(el, E) {
      const host = viewHost(el);
      if (host) {
        let v = null;
        try { v = host.__ember_view__ || host._view || null; } catch (e) { v = null; }
        if (!v && E) {
          try { if (E.View && E.View.views && host.id) v = E.View.views[host.id] || null; } catch (e) { v = null; }
        }
        if (v) {
          const c = ctlFromView(v);
          if (c) { ctlVia = "view:" + String(host.className || host.id || "?").slice(0, 40); return c; }
        }
      }
      try {
        const EE = E || culEmber();
        if (EE && EE.getOwner) {
          const o = EE.getOwner(el);
          if (o && typeof o.lookup === "function") {
            const c = o.lookup(page.lookupName);
            if (hasModel(c)) { ctlVia = "getOwner"; return c; }
          }
        }
      } catch (e) {  }
      return null;
    }

    function scanViews(E) {
      const vs = E && E.View && E.View.views;
      if (!vs) return null;
      const now = Date.now();
      if (now - scanTryAt < 3000) return null;
      scanTryAt = now;
      let keys = null;
      try { keys = Object.keys(vs); } catch (e) { return null; }
      for (let i = 0; i < keys.length; i++) {
        const v = vs[keys[i]];
        if (!v) continue;
        if (hasModel(v)) { ctlVia = "reg:view"; return v; }
        let ctx = null;
        try { ctx = v.context || v._context; } catch (e) { ctx = null; }
        if (hasModel(ctx)) { ctlVia = "reg:ctx"; return ctx; }
      }
      return null;
    }

    const PROP_RE = /ember|view|context|owner|container/i;
    function bySweep(el) {              
      const now = Date.now();
      if (now - sweepAt < 2000) return null;
      sweepAt = now;
      let n = el, d = 0;
      while (n && n.nodeType === 1 && d < 12) {
        let names = null;
        try { names = Object.getOwnPropertyNames(n); } catch (e) { names = null; }
        for (let i = 0; names && i < names.length; i++) {
          const k = names[i];
          if (k === "classList" || k === "parentElement" || k === "ownerDocument") continue;
          if (!PROP_RE.test(k)) continue;
          let v = null;
          try { v = n[k]; } catch (e) { continue; }
          if (!v) continue;
          const t = typeof v;
          if (t !== "object" && t !== "function") continue;
          if (hasModel(v)) { ctlVia = "sweep:" + k; return v; }
          try {
            if (v.context || v._context) {
              const c = ctlFromView(v);
              if (c) { ctlVia = "sweep-ctx:" + k; return c; }
            }
          } catch (e) {  }
          try {
            if (typeof v.lookup === "function") {
              const c = v.lookup(page.lookupName);
              if (c && hasModel(c)) { ctlVia = "sweep-lookup:" + k; return c; }
            }
          } catch (e) {  }
        }
        n = n.parentElement; d++;
      }
      return null;
    }

    function find() {
      const E = culEmber();
      let d = null, any = null;
      try { d = document.querySelector(SEL); } catch (e) { d = null; }
      try { any = document.querySelector(page.itemSel); } catch (e) { any = null; }

      if (d) { const c = ctlFromEl(d, E); if (c) return c; }
      if (any) { const c = ctlFromEl(any, E); if (c) return c; }

      if (E) { const c = scanViews(E); if (c) return c; }

      try {
        const A = window.emberApp;
        if (A) {
          try {
            const c = (typeof A.lookup === "function") ? A.lookup(page.lookupName) : null;
            if (hasModel(c)) { ctlVia = "app.lookup"; return c; }
          } catch (e) {  }
          try {
            const ct = A.__container__;
            const c2 = (ct && typeof ct.lookup === "function") ? ct.lookup(page.lookupName) : null;
            if (hasModel(c2)) { ctlVia = "app.container"; return c2; }
          } catch (e) {  }
          culWrapLookup(A, "app");
          try { culWrapLookup(A.__container__, "container"); } catch (e) {  }
        }
      } catch (e) {  }

      const host = d || any;
      if (host) { const c = bySweep(host); if (c) return c; }
      return null;
    }

    function cached() {
      if (ctl) {
        try { if (ctl.get(page.modelKey)) return ctl; } catch (e) {  }
        ctl = null;
      }
      const c = find();
      if (c) ctl = c;
      else missDiag();
      return c;
    }

    function onLookup(r) {
      if (!r || ctl === r) return;
      if (!hasModel(r)) return;
      ctl = r;
      ctlVia = "lookup-hook";
      diag("cul-ctl-capture", { page: page.key, via: ctlVia });
      scanAt = 0;
      try { tick(); } catch (e) {  }
    }

    function missDiag() {
      if (ctlDiagDone) return;
      let n = 0;
      try { n = document.querySelectorAll(SEL).length; } catch (e) { return; }
      if (!n) return;                       
      ctlDiagDone = true;
      let views = -1, evN = 0, props = "", emberVia = "none", regN = -1, A = "?";
      try { views = document.querySelectorAll(".ember-view").length; } catch (e) {  }
      try {
        let p = document.querySelector(SEL), d = 0;
        while (p && p.nodeType === 1 && d < 12) {
          try { if (p.classList && p.classList.contains("ember-view")) evN++; } catch (e) {  }
          p = p.parentElement; d++;
        }
      } catch (e) {  }
      let host2 = null;
      try { host2 = document.querySelector(SEL); } catch (e) { host2 = null; }
      if (host2) { try { props = Object.getOwnPropertyNames(host2).slice(0, 14).join(","); } catch (e) {  } }
      const E = culEmber();
      emberVia = E ? ("ok" + (E.VERSION ? ":" + E.VERSION : "")) : "null";
      if (E && E.View && E.View.views) { try { regN = Object.keys(E.View.views).length; } catch (e) {  } }
      try { A = typeof window.emberApp; } catch (e) {  }
      diag("cul-ctl-miss", {
        page: page.key, routeN: n, emberViewNodes: views, emberViewAncestors: evN,
        hostProps: props, ember: emberVia, regViews: regN, emberApp: A,
        wrapped: (function () { try { return !!window.emberApp && !!window.emberApp.__culWrapped; } catch (e) { return "?"; } })(),
      });
    }

    function eachById(m, fn) {
      if (!m) return;
      if (typeof m.forEach === "function") {
        m.forEach(function (s, k) { fn(s, (s && s.id !== undefined && s.id !== null) ? s.id : k); });
        return;
      }
      if (typeof m === "object") {
        let ks = null;
        try { ks = Object.keys(m); } catch (e) { return; }
        for (let i = 0; i < ks.length; i++) fn(m[ks[i]], ks[i]);
      }
    }

    function model() {
      try { return ctl ? ctl.get(page.modelKey) : null; } catch (e) { return null; }
    }

    function flipOwned(c) {
      const m = (function () { try { return c.get(page.modelKey); } catch (e) { return null; } })();
      if (!m) return 0;
      const rec = st.flipped || (st.flipped = {});
      let n = 0;
      eachById(m, function (s, key) {
        if (!s || typeof s !== "object") return;
        if (!s.ownership) s.ownership = { owned: false, rental: {} };
        if (s.ownership.owned) return;              
        rec[key] = { o: false, p: (s.ownership.rental ? s.ownership.rental.purchaseDate : null) };
        s.ownership.owned = true;
        n++;
      });
      return n;
    }

    function restoreOwned(c) {
      const rec = st.flipped;
      if (!rec) return 0;
      const m = (function () { try { return c ? c.get(page.modelKey) : null; } catch (e) { return null; } })();
      if (!m) { st.flipped = null; return 0; }
      let n = 0;
      eachById(m, function (s, key) {
        const bak = rec[key];
        if (!bak || !s || typeof s !== "object" || !s.ownership) return;
        if (s.ownership.owned === true) {
          s.ownership.owned = !!bak.o;
          if (s.ownership.rental) {
            s.ownership.rental.purchaseDate = (bak.p === undefined ? null : bak.p);
          }
          n++;
        }
      });
      st.flipped = null;
      return n;
    }

    function notify(c, why) {
      for (let i = 0; i < page.notifyKeys.length; i++) {
        try { c.notifyPropertyChange(page.notifyKeys[i]); }
        catch (e) { diag("cul-notify-error", { page: page.key, why: why, key: page.notifyKeys[i], msg: String(e) }); }
      }
      diag("cul-notify", { page: page.key, why: why });
    }

    function targets(root) {
      if (tgt && tgt.root === root &&
          tgt.big && tgt.big.isConnected &&
          tgt.counts.length && tgt.counts[0].isConnected) {
        return tgt;
      }
      tgt = {
        root: root,
        big: root.querySelector(".collection-owned-totals .total-owned"),
        counts: Array.prototype.slice.call(
          root.querySelectorAll(".collection-tier-information .item .count")),
        chroma: root.querySelector(".collection-chroma-info .legacy-count"),
      };
      return tgt;
    }

    function stats(c) {
      const m = (function () { try { return c.get(page.modelKey); } catch (e) { return null; } })();
      if (!m || typeof m.forEach !== "function") return null;
      let total = 0, chromas = 0;
      const byOrder = new Map();
      m.forEach(function (s) {
        if (!s) return;
        total++;
        if (Array.isArray(s.chromas)) chromas += s.chromas.length;
        const rar = s.rarity;
        const o = rar ? rar.order : 0;
        if (!o) return;
        byOrder.set(o, (byOrder.get(o) || 0) + 1);
      });
      if (!total) return null;
      const tiers = Array.from(byOrder.entries())
        .sort(function (a, b) { return b[0] - a[0]; })
        .map(function (e) { return e[1]; });
      return { total: total, tiers: tiers, chromas: chromas };
    }
    function paintNumbers(root) {
      const c = ctl;
      if (!st.stats && c) { const s0 = stats(c); if (s0) st.stats = s0; }
      const s = st.stats || CUL_FALLBACK[page.key] || null;
      if (!s) return;
      const t = targets(root);
      if (t.big && t.big.textContent !== String(s.total)) t.big.textContent = String(s.total);
      if (t.counts.length && s.tiers.length) {
        const n = Math.min(t.counts.length, s.tiers.length);
        if (t.counts.length !== s.tiers.length) {
          const now = Date.now();
          if (now - cellDiagAt > 15000) {
            cellDiagAt = now;
            diag("cul-cells-mismatch", {
              page: page.key, cells: t.counts.length, tiers: s.tiers.length, live: !!st.stats,
            });
          }
        }
        for (let i = 0; i < n; i++) {
          const v = String(s.tiers[i]);
          if (t.counts[i].textContent !== v) t.counts[i].textContent = v;
        }
      }
      if (t.chroma && s.chromas && t.chroma.textContent !== String(s.chromas)) {
        t.chroma.textContent = String(s.chromas);
      }
    }

    function paintGroupCounts(root) {
      let els = null;
      try { els = root.querySelectorAll(".group-owned-count"); } catch (e) { return; }
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const m = /^(\s*)(\d+)(\s*\/\s*)(\d+)(\s*)$/.exec(el.textContent || "");
        if (!m) continue;                            
        let want = m[4];
        try {
          const box = el.parentElement;              
          const tc = box ? box.querySelector(".group-total-count") : null;
          const tm = tc ? /(\d+)/.exec(tc.textContent || "") : null;
          if (tm) want = tm[1];
        } catch (e) {  }
        if (m[2] === want && m[4] === want) continue;  
        el.textContent = m[1] + want + m[3] + want + m[5];
      }
    }

    function cbInputs(root) {
      const out = [];
      try {
        const els = root.querySelectorAll("input[type=checkbox]");
        for (let i = 0; i < els.length; i++) out.push(els[i]);
      } catch (e) {  }
      return out;
    }

    function bindCbHost(inp) {
      let h = null;
      try { h = inp.closest ? inp.closest("lol-uikit-flat-checkbox") : null; } catch (e) { h = null; }
      if (!h) h = inp.parentElement;
      if (!h) return;
      try { if (h.__culCbGuard) return; h.__culCbGuard = 1; } catch (e) { return; }
      h.addEventListener("change", function (e) {
        const t = e && e.target;
        if (!t || String(t.type || "") !== "checkbox") return;
        if (!state.cul[page.key].all) return;          
        if (t.checked !== false) return;               
        try { e.stopPropagation(); } catch (er) {  }
        diag("cul-cb-stop", { page: page.key, name: String(t.getAttribute("name") || "") });
      }, false);
    }

    function syncControls(root) {
      const ins = cbInputs(root);
      if (!ins.length) return;
      for (let i = 0; i < ins.length; i++) bindCbHost(ins[i]);
      if (st.pushed) return;
      if (!st.preCb) st.preCb = {};
      let pushed = 0, names = [];
      for (let i = 0; i < ins.length; i++) {
        const inp = ins[i];
        const raw = String(inp.getAttribute("name") || ("cb" + i));
        const key = CUL_CB_ACCT_KEY[raw] || raw;      
        names.push(raw + "->" + key);
        if (!(key in st.preCb)) st.preCb[key] = !!inp.checked;
        if (inp.checked) continue;
        try {
          inp.checked = true;                          
          inp.dispatchEvent(new Event("change", { bubbles: true }));  
          pushed++;
        } catch (e) {  }
      }
      st.pushed = true;
      diag("cul-cb-push", {
        page: page.key, n: ins.length, pushed: pushed, names: names.join(","),
        pre: JSON.stringify(st.preCb),
      });
      if (pushed) scanAt = 0;                          
    }
    function culDropFill(el) {
      let n = 0;
      try {
        const ours = el.querySelectorAll("[data-prism-culfill]");
        for (let i = 0; i < ours.length; i++) {
          const o = ours[i];
          if (o && o.parentNode) { o.parentNode.removeChild(o); n++; }
        }
      } catch (e) {  }
      return n;
    }

    let culCardProbe = 0, culMissDiag = false;
    function culFillCards(root) {
      let cards = null, via = "thumb";
      try { cards = root.querySelectorAll(".inventory-item-thumbnail"); } catch (e) { cards = null; }
      if (!cards || !cards.length) {
        via = "cls";
        try { cards = root.querySelectorAll("." + CUL_ITEM_CLS); } catch (e) { cards = null; }
      }
      if (!cards || !cards.length) {
        if (!culMissDiag) { culMissDiag = true; diag("cul-fill-miss", { page: page.key }); }
        return;
      }
      let made = 0, dropped = 0;
      for (let i = 0; i < cards.length; i++) {
        const th = cards[i];
        if (!th) continue;
        let ourBw = null, offBw = null, ourN = 0;
        try {
          const ch = th.children;
          for (let j = 0; j < ch.length; j++) {
            const c = ch[j];
            if (!c || !c.classList || !c.classList.contains("border-wrapper")) continue;
            if (c.getAttribute("data-prism-culfill")) { ourBw = c; ourN++; }
            else if (!offBw) offBw = c;
          }
        } catch (e) {  }
        if (offBw && !ourBw) continue;                  
        let ic = null;
        try { ic = th.querySelector(".inventory-item-image-container"); } catch (e) { ic = null; }
        let br = "", type = "";
        if (ic) {
          try {
            const cl = ic.classList;
            for (let k = 0; k < SKIN_BORDER_RARITIES.length; k++) {
              if (cl.contains(SKIN_BORDER_RARITIES[k])) { br = SKIN_BORDER_RARITIES[k]; break; }
            }
            for (let k = 0; k < cl.length; k++) {
              if (String(cl[k]).indexOf("item-type-") === 0) { type = cl[k]; break; }
            }
          } catch (e) {  }
        }
        let locked = false;
        try { locked = !!th.querySelector(".lock-wrapper") || !!(ic && ic.classList.contains("unowned")); }
        catch (e) { locked = false; }
        const sig = (locked ? "1" : "0") + "|" + br + "|" + type + "|" + (ourN > 1 ? 2 : ourN);
        if (th.__prismCulSig === sig && (!locked || (ourBw && ourBw.parentNode === th))) continue;
        dropped += culDropFill(th);
        th.__prismCulSig = sig;
        if (culCardProbe < 3) {
          culCardProbe++;
          let icCls = "";
          try { icCls = String(ic && ic.className ? ic.className : "").replace(/\s+/g, " ").slice(0, 90); }
          catch (e) {  }
          diag("cul-card-probe", {
            page: page.key, icCls: icCls, br: br, type: type, locked: locked, ourN: ourN, off: !!offBw,
          });
        }
        if (!locked || !br) continue;
        try {
          const bw = document.createElement("div");
          bw.className = "border-wrapper " + br + (type ? " " + type : "");
          bw.setAttribute("data-prism-culfill", "1");
          const bd = document.createElement("div");
          bd.className = "border " + br + (type ? " " + type : "");
          bd.setAttribute("style", "background-image: url(" + SKIN_BORDER_BASE + br + ".png)");
          bw.appendChild(bd);
          th.appendChild(bw);
          made++;
        } catch (e) {  }
      }
      if (made || dropped) diag("cul-fill-sync", { page: page.key, made: made, dropped: dropped, n: cards.length, via: via });
    }

    function paintAll(root) {
      if (!root) return;
      paintNumbers(root);
      paintGroupCounts(root);
      culFillCards(root);            
    }
    let probeAt = 0;
    function domProbe(tag) {
      const now = Date.now();
      if (now - probeAt < 900) return;
      probeAt = now;
      const rc = function (el) {
        try { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join("x"); }
        catch (e) { return "?"; }
      };
      const txt = function (el) { try { return String(el.textContent || "").slice(0, 8); } catch (e) { return "?"; } };
      const out = { page: page.key, tag: tag };
      try {
        out.apps = document.querySelectorAll(".collections-application").length;
        try {
          out.env = [
            "vis:" + String(document.visibilityState),
            "focus:" + String(document.hasFocus()),
            "top:" + String(window.top === window),
            "frames:" + String(window.length),
            "inner:" + window.innerWidth + "x" + window.innerHeight,
            "outer:" + window.outerWidth + "x" + window.outerHeight,
            "sx:" + window.screenX + ",sy:" + window.screenY,
          ].join(" ");
        } catch (e) { out.env = "?"; }
        const routes = document.querySelectorAll(SEL);
        out.routes = routes.length;
        const rows = [];
        for (let i = 0; i < routes.length && i < 4; i++) {
          const r = routes[i];
          const tot = r.querySelector(".collection-owned-totals .total-owned");
          rows.push({ i: i, rect: rc(r), cur: st.el === r, tot: tot ? txt(tot) : null });
        }
        out.rows = rows;
        const all = document.querySelectorAll(".collection-owned-totals");
        const arows = [];
        for (let i = 0; i < all.length && i < 4; i++) {
          const t2 = all[i].querySelector(".total-owned");
          arows.push({
            i: i, rect: rc(all[i]), txt: t2 ? txt(t2) : null,
            inCur: !!(st.el && st.el.contains(all[i])),
          });
        }
        out.totals = arows;
        const box2 = st.el ? st.el.querySelector(".collection-owned-totals") : null;
        const kids = [];
        if (box2) {
          let list2 = null;
          try { list2 = box2.querySelectorAll(".total-owned,.total-count,[class*=total]"); } catch (e) { list2 = null; }
          for (let i = 0; list2 && i < list2.length && i < 4; i++) {
            kids.push({
              i: i, cls: String(list2[i].className || "").slice(0, 40),
              tx: txt(list2[i]), rc: rc(list2[i]),
            });
          }
        }
        out.boxKids = kids;
        const gh = [];
        try {
          const gl = st.el ? st.el.querySelectorAll(".group-owned-count") : null;
          for (let i = 0; gl && i < gl.length && i < 3; i++) {
            let totTxt = null;
            try {
              const box = gl[i].parentElement;
              const tc = box ? box.querySelector(".group-total-count") : null;
              totTxt = tc ? String(tc.textContent || "").slice(0, 8) : null;
            } catch (e) {  }
            gh.push({ i: i, cnt: String(gl[i].textContent || "").replace(/\s+/g, " ").slice(0, 14), tot: totTxt, rc: rc(gl[i]) });
          }
          out.ghN = gl ? gl.length : -1;
        } catch (e) { out.ghErr = String(e); }
        out.gh = gh;
        const big = st.el ? st.el.querySelector(".collection-owned-totals .total-owned") : null;
        if (big) {
          out.bigTag = String(big.tagName || "") + "|" + String(big.className || "").slice(0, 70);
          out.bigRect = rc(big);
          out.bigKids = big.childElementCount;
          out.bigHTML = String(big.innerHTML || "").replace(/\s+/g, " ").slice(0, 90);
          try {
            const rr = big.getBoundingClientRect();
            const top = document.elementFromPoint(Math.round(rr.left + rr.width / 2), Math.round(rr.top + rr.height / 2));
            out.hit = top ? (String(top.tagName) + "|" + String(top.className || "").slice(0, 40)) : "null";
          } catch (e) { out.hit = "?"; }
          const chain = [];
          let cur = big, d = 0;
          while (cur && cur.nodeType === 1 && d < 8) {
            let cs = null;
            try { cs = window.getComputedStyle(cur); } catch (e) { cs = null; }
            chain.push(String(cur.tagName) + "|" + String(cur.className || "").slice(0, 22) +
              "|tf:" + String(cs ? cs.transform : "?").slice(0, 18) +
              "|wc:" + String(cs ? cs.willChange : "?") +
              "|an:" + String(cs ? cs.animationName : "?").slice(0, 16) +
              "|fl:" + String(cs ? cs.filter : "?").slice(0, 10) +
              "|cv:" + String(cs ? cs.contentVisibility : "?") +
              "|ct:" + String(cs ? cs.contain : "?").slice(0, 14) +
              "|vis:" + String(cs ? cs.visibility : "?"));
            cur = cur.parentElement; d++;
          }
          out.chain = chain;
          try {
            const csH = window.getComputedStyle(document.documentElement);
            const csB = window.getComputedStyle(document.body);
            out.rootStyle = "html[tf:" + String(csH.transform).slice(0, 20) + "|zoom:" + String(csH.zoom) +
              "] body[tf:" + String(csB.transform).slice(0, 20) + "|zoom:" + String(csB.zoom) + "]";
          } catch (e) { out.rootStyle = "?"; }
          try {
            out.bigShadow = big.shadowRoot
              ? ("yes:" + String(big.shadowRoot.textContent || "").replace(/\s+/g, " ").slice(0, 20))
              : "no";
          } catch (e) { out.bigShadow = "?"; }
        } else { out.bigTag = "null"; }
      } catch (e) { out.err = String(e); }
      diag("cul-dom-probe", out);
    }
    function applyCss() {
      let el = document.getElementById(page.cssId);
      if (!st.all) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement("style");
        el.id = page.cssId;
        el.setAttribute("data-prism", "1");
        document.head.appendChild(el);
      }
      const want = culCssText(page);
      if (el.textContent !== want) el.textContent = want;
    }

    function forceAll() {
      const c = cached();
      if (!c) return false;
      const flipped = flipOwned(c);
      if (flipped) {
        diag("cul-unlock", { page: page.key, flipped: flipped, via: ctlVia });
        notify(c, "unlock");
      }
      let cur = null;
      try { cur = c.get("isUnownedShown"); } catch (e) { return false; }
      if (typeof st.pre === "undefined") st.pre = !!cur;
      if (cur === true) return true;
      try {
        c.set("isUnownedShown", true);
        diag("cul-force-unowned", { page: page.key, prev: String(cur) });
        return true;
      } catch (e) {
        diag("cul-force-unowned-error", { page: page.key, msg: String(e) });
        return false;
      }
    }

    function leavePage() {
      st.el = null;
      st.stats = null;
      tgt = null;
      st.pushed = false;             
      const c = ctl;
      if (c) {
        const back = restoreOwned(c);
        if (back) {
          diag("cul-release", { page: page.key, restored: back, at: "leave" });
          notify(c, "leave");
        }
      }
      ctl = null;
      ctlVia = "";
      diag("cul-leave", { page: page.key });
    }

    function tick() {
      if (!st.all) return;

      if (st.el && st.el.isConnected) {
        const nowV = Date.now();
        if (nowV - visAt > 1000) {
          visAt = nowV;
          let w = 1;
          try { w = st.el.getBoundingClientRect().width; } catch (e) { w = 1; }
          if (!(w > 0)) {
            st.el = null; st.pushed = false; st.stats = null; tgt = null;
            scanAt = 0;
            diag("cul-switch-instance", { page: page.key, why: "hidden" });
          }
        }
        if (st.el && st.el.isConnected) {
          if (!st.pushed) syncControls(st.el);   
          forceAll();
          paintAll(st.el);
          paintDiag(false);
          return;
        }
      }

      if (st.el) { leavePage(); scanAt = 0; }

      const now = Date.now();
      if (now - scanAt < SCAN_MS) return;
      scanAt = now;
      let root = null;
      try {
        const list = document.querySelectorAll(SEL);
        for (let i = 0; i < list.length; i++) {
          const el = list[i];
          let w = 0;
          try { w = el.getBoundingClientRect().width; } catch (e) { w = 0; }
          if (w > 0) { root = el; break; }
        }
        if (!root && list.length) root = list[0];
      } catch (e) { root = null; }
      if (!root) {
        if (ctl) leavePage();
        return;
      }
      if (st.el !== root) {
        st.el = root;
        ctl = null;                  
        st.stats = null;
        tgt = null;
        st.pushed = false;           
        diag("cul-enter", { page: page.key });
        domProbe("enter");
      }
      forceAll();
      paintAll(root);
      if (!st.pushed) syncControls(root);
      paintDiag(true);
    }

    function paintDiag(fresh) {
      const now = Date.now();
      if (now - lastDiag < 15000) return;
      lastDiag = now;
      let n = 0;
      try {
        const m = model();
        if (m && typeof m.forEach === "function") m.forEach(function () { n++; });
      } catch (e) {  }
      const t = st.el ? targets(st.el) : null;
      diag("cul-paint", {
        page: page.key, fresh: !!fresh, mode: st.all ? "all" : "off",
        size: n, via: ctlVia,
        big: t && t.big ? t.big.textContent : null,
        cells: t ? t.counts.length : 0,
        want: (function () {
          const s = st.stats || CUL_FALLBACK[page.key];
          return s ? [s.total].concat(s.tiers) : null;
        })(),
        src: st.stats ? "live" : "fallback",
      });
    }

    return {
      page: page, st: st,
      tick: tick, applyCss: applyCss, leavePage: leavePage,
      cached: cached, onLookup: onLookup,
      arm: function () {
        try { skinsHookAnnounceRegistration(); } catch (e) {  }
        try { culEmber(); } catch (e) {  }
        try { culEnvProbe(); } catch (e) {  }
        scanAt = 0; ctlDiagDone = false; ctlVia = "";
        st.stats = null; tgt = null; st.pushed = false;
        tick(); applyCss();
      },
      disarm: function () {
        const c = cached();
        if (c) {
          const back = restoreOwned(c);
          if (back) { diag("cul-release", { page: page.key, restored: back, at: "toggle-off" }); notify(c, "toggle-off"); }
          try {
            const want = (typeof st.pre === "undefined") ? false : !!st.pre;
            if (c.get("isUnownedShown") !== want) c.set("isUnownedShown", want);
          } catch (e) { diag("cul-disarm-error", { page: page.key, msg: String(e) }); }
        }
        applyCss();                  
        st.el = null; st.stats = null; tgt = null; st.pushed = false;
        ctl = null; ctlVia = "";
      },
    };
  }

  const CUL = {};
  for (let i = 0; i < CUL_PAGES.length; i++) {
    CUL[CUL_PAGES[i].key] = culMake(CUL_PAGES[i]);
    CUL_ALL.push(CUL[CUL_PAGES[i].key]);
  }

  function culSave() {
    const o = {};
    for (let i = 0; i < CUL_PAGES.length; i++) o[CUL_PAGES[i].key] = !!state.cul[CUL_PAGES[i].key].all;
    const t = JSON.stringify(o);
    try { if (window.DataStore) window.DataStore.set(SETTINGS_KEY + ".cul", t); } catch (e) {  }
    try { localStorage.setItem(SETTINGS_KEY + ".cul", t); } catch (e) {  }
  }

  function culLoad() {
    let raw = null;
    try { if (window.DataStore) raw = window.DataStore.get(SETTINGS_KEY + ".cul"); } catch (e) {  }
    if (!raw) { try { raw = localStorage.getItem(SETTINGS_KEY + ".cul"); } catch (e) {  } }
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === "object") {
        for (let i = 0; i < CUL_PAGES.length; i++) {
          const k = CUL_PAGES[i].key;
          if (typeof o[k] === "boolean") state.cul[k].all = o[k];
        }
      }
    } catch (e) {  }
  }

  let culXhrPatched = false, culPutDiagDone = false;
  function culInstallXhrGuard() {
    if (culXhrPatched) return;
    if (typeof XMLHttpRequest === "undefined") return;
    const XS = XMLHttpRequest.prototype.send;
    if (typeof XS !== "function") return;
    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (typeof body === "string" && body && body.indexOf("Filter") >= 0) {
          if (!culPutDiagDone) {
            culPutDiagDone = true;
            let ks = "";
            try { const o0 = JSON.parse(body); ks = Object.keys((o0 && o0.data) || {}).join(","); } catch (e) { ks = "unparsed"; }
            diag("cul-settings-seen", { keys: ks, len: body.length });
          }
          if (body.indexOf("unavailableFilter") >= 0) {
            const o = JSON.parse(body);
            if (o && o.data && Object.prototype.hasOwnProperty.call(o.data, "unavailableFilter")) {
              const pre = {};
              for (let i = 0; i < CUL_PAGES.length; i++) {
                const pc = state.cul[CUL_PAGES[i].key].preCb;
                if (!pc) continue;
                for (const kk in pc) { if (!(kk in pre)) pre[kk] = pc[kk]; }
              }
              let ch = 0;
              const keys = ["unownedFilter", "unavailableFilter"];
              for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                if (!Object.prototype.hasOwnProperty.call(o.data, k)) continue;
                const want = Object.prototype.hasOwnProperty.call(pre, k) ? !!pre[k] : false;
                if (o.data[k] !== want) { o.data[k] = want; ch++; }
              }
              if (ch) { body = JSON.stringify(o); diag("cul-settings-guard", { keys: ch, pre: JSON.stringify(pre) }); }
            }
          }
        }
      } catch (e) {
        diag("cul-settings-guard-error", { msg: String(e) });
      }
      return XS.call(this, body);
    };
    culXhrPatched = true;
    diag("cul-xhr-guard", { installed: true });
  }

  let culEnvProbed = false;
  function culEnvProbe() {
    if (culEnvProbed) return;
    culEnvProbed = true;
    const out = {};
    try {
      const names = Object.getOwnPropertyNames(window);
      out.winN = names.length;
      const hit = [];
      for (let i = 0; i < names.length; i++) {
        const n = names[i];
        if (!/ember|riot|rcp|plugin|announce|binding|pengu|webpack|require/i.test(n)) continue;
        let t = "?";
        try { t = typeof window[n]; } catch (e) { t = "!"; }
        hit.push(n + ":" + t);
        if (hit.length >= 40) break;
      }
      out.globals = hit.join(",");
    } catch (e) { out.globals = "err"; }
    try {
      out.announceName = (typeof window.getPluginAnnounceEventName === "function")
        ? String(window.getPluginAnnounceEventName("rcp-fe-lol-collections")) : "none";
    } catch (e) { out.announceName = "err"; }
    try {
      const n = document.querySelector(".ember-view");
      out.firstViewId = n ? String(n.id || "") : "";
      out.firstViewCls = n ? String(n.className || "").slice(0, 60) : "";
    } catch (e) {  }
    diag("cul-env2", out);
  }

  let culObs = null, culScrollAt = 0, culScrollBound = false, culRetryTimer = null, culRetryN = 0;
  function culTickAll() {
    for (let i = 0; i < CUL_PAGES.length; i++) {
      try { CUL[CUL_PAGES[i].key].tick(); } catch (e) {  }
    }
  }

  function culEnsureObserver() {
    if (culObs || typeof MutationObserver === "undefined") return;
    const attach = function () {
      if (culObs || !document.body) return;
      culObs = new MutationObserver(function () { culTickAll(); });
      culObs.observe(document.body, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ["src"],
      });
      if (!culScrollBound) {
        culScrollBound = true;
        document.addEventListener("scroll", function () {
          let any = false;
          for (let i = 0; i < CUL_PAGES.length; i++) if (state.cul[CUL_PAGES[i].key].all) any = true;
          if (!any) return;
          const now = Date.now();
          if (now - culScrollAt < 120) return;
          culScrollAt = now;
          culTickAll();
        }, true);
      }
      diag("cul-observer", { attached: true });
    };
    if (document.body) attach();
    else document.addEventListener("DOMContentLoaded", attach, { once: true });
  }

  function culRetrySoon() {
    if (culRetryTimer) return;
    culRetryTimer = setTimeout(function () {
      culRetryTimer = null;
      let need = false;
      for (let i = 0; i < CUL_PAGES.length; i++) {
        const pg = CUL_PAGES[i];
        if (!state.cul[pg.key].all) continue;
        if (!CUL[pg.key].cached()) need = true;
      }
      if (!need || culRetryN++ >= 8) return;
      culTickAll();
      culRetrySoon();
    }, 3000);
  }

  function culApplyAll() {
    culEnsureObserver();
    culInstallXhrGuard();
    for (let i = 0; i < CUL_PAGES.length; i++) {
      const pg = CUL_PAGES[i];
      CUL[pg.key].applyCss();
      if (state.cul[pg.key].all) { state.cul[pg.key].el = null; CUL[pg.key].arm(); }
    }
    culRetrySoon();
  }

  function renderClashSection(body) {
    const grid = body.querySelector('[data-el="cf-grid"]');
    const nowEl = body.querySelector('[data-el="cf-now"]');
    const fRow = body.querySelector('[data-el="cf-filter"]');
    const hint = body.querySelector('[data-el="cf-hint"]');
    if (!grid) return;
    const say = (t) => { if (hint) hint.textContent = t; };

    const mark = () => {
      const p = state.clash.pick;
      Array.prototype.forEach.call(grid.querySelectorAll("[data-theme]"), (c) => {
        c.classList.toggle("on", !!p &&
          c.getAttribute("data-theme") === p.theme &&
          parseInt(c.getAttribute("data-level"), 10) === p.level);
      });
      if (nowEl) {
        nowEl.textContent = p
          ? (clashThemeName(p.theme) + " · " + clashLevelName(p.level, p.theme))
          : "空白（官方默认）";
      }
    };

    const RIDX = ["", "I", "II", "III", "IV"];

    const renderFilter = () => {
      if (!fRow) return;
      let h = "";
      [0, 1, 2, 3, 4].forEach((n) => {
        h += `<button class="${NS}-flt${state.clash.filter === n ? " on" : ""}" data-lv="${n}">` +
             (n ? ("等级 " + RIDX[n]) : "全部") + `</button>`;
      });
      fRow.innerHTML = h;
    };

    const renderGrid = () => {
      if (state.clash.err) {
        grid.innerHTML = `<div class="${NS}-gridsep">读不到旗帜清单：${esc(state.clash.err)}</div>`;
        return;
      }
      const all = clashAll().filter((f) =>
        !state.clash.filter || parseInt(f.level, 10) === state.clash.filter);
      if (!all.length) {
        grid.innerHTML = `<div class="${NS}-gridsep">没有符合条件的旗帜</div>`;
        return;
      }
      grid.innerHTML = all.map((f) => {
        const lv = parseInt(f.level, 10);
        const nm = clashThemeName(f.theme);
        const lvName = clashLevelName(lv, f.theme);
        const ip = f.inventoryIcon || "";
        return `<button class="${NS}-flag" data-theme="${esc(f.theme)}" data-level="${lv}" ` +
               `title="${esc(nm + " · " + lvName)}">` +
               `<img loading="lazy" draggable="false" src="${clashThumb(ip, 130)}" ` +
               `data-local="${esc(ip)}" alt="">` +
               `<em>${esc(nm)}</em><s>${esc(RIDX[lv] || String(lv))}</s></button>`;
      }).join("");
      Array.prototype.forEach.call(grid.querySelectorAll("img"), (im) => {
        const alt = im.getAttribute("data-local") || "";
        im.addEventListener("error", () => {
          if (im.dataset.fellBack || !alt) return;
          im.dataset.fellBack = "1";
          im.src = alt;
        }, { once: true });
      });
      mark();
    };

    if (fRow) {
      fRow.addEventListener("click", (e) => {
        const b = e.target.closest ? e.target.closest("[data-lv]") : null;
        if (!b) return;
        state.clash.filter = parseInt(b.getAttribute("data-lv"), 10) || 0;
        renderFilter();
        renderGrid();
      });
    }

    grid.addEventListener("click", (e) => {
      const card = e.target.closest ? e.target.closest("[data-theme]") : null;
      if (!card) return;
      const theme = card.getAttribute("data-theme");
      const level = parseInt(card.getAttribute("data-level"), 10);
      const p = state.clash.pick;
      if (p && p.theme === theme && p.level === level) {
        state.clash.pick = null;
        say("已恢复成官方的空白格");
      } else {
        state.clash.pick = { theme: theme, level: level };
        say("已挂上「" + clashThemeName(theme) + " · " + clashLevelName(level, theme) +
            "」，去个人主页最下排看看（只有你自己看得见）");
      }
      saveClashPick();
      applyClashCSS();
      mark();
      diag("clash-pick", { pick: state.clash.pick });
    });

    const rb3 = body.querySelector('[data-act="cf-reset"]');
    if (rb3) {
      rb3.addEventListener("click", () => {
        state.clash.pick = null;
        saveClashPick();
        applyClashCSS();
        mark();
        say("已恢复成官方的空白格");
        diag("clash-pick", { pick: null });
      });
    }

    (async () => {
      renderFilter();
      grid.innerHTML = `<div class="${NS}-gridsep">正在读取旗帜清单…</div>`;
      await loadClashBanners();
      renderGrid();
      if (state.clash.err) say("读取失败：" + state.clash.err);
      else say("共 " + clashAll().length + " 面旗帜，点一下挂上、再点一下取消。");
    })();
  }



  function renderTrophySection(body) {
    const grid = body.querySelector('[data-el="tr-grid"]');
    const nowEl = body.querySelector('[data-el="tr-now"]');
    const fRow = body.querySelector('[data-el="tr-filter"]');
    const pedRow = body.querySelector('[data-el="tr-pedrow"]');
    const pedHint = body.querySelector('[data-el="tr-pedhint"]');
    const hint = body.querySelector('[data-el="tr-hint"]');
    if (!grid) return;
    const say = (t) => { if (hint) hint.textContent = t; };

    const curTier = () => (state.trophy.pick && state.trophy.pick.tier) || TROPHY_TIER_DEFAULT;

    const mark = () => {
      const p = state.trophy.pick;
      const t = curTier();
      Array.prototype.forEach.call(grid.querySelectorAll("[data-theme]"), (c) => {
        c.classList.toggle("on", !!p &&
          c.getAttribute("data-theme") === p.theme &&
          parseInt(c.getAttribute("data-bracket"), 10) === p.bracket);
      });
      Array.prototype.forEach.call(grid.querySelectorAll("img.ped"), (im) => {
        const ped = trophyFindPedestal(t);
        const u = ped && ped.profileIcon ? ped.profileIcon : "";
        if (u && im.getAttribute("src") !== u) im.setAttribute("src", u);
      });
      Array.prototype.forEach.call(
        pedRow ? pedRow.querySelectorAll("[data-tier]") : [], (c) => {
          c.classList.toggle("on", parseInt(c.getAttribute("data-tier"), 10) === t);
        });
      if (nowEl) {
        nowEl.textContent = p
          ? (trophyThemeName(p.theme) + " · " + trophyBracketName(p.bracket) + " · " + trophyTierName(t))
          : "空白（官方默认）";
      }
      if (pedHint) pedHint.textContent = "底座会叠在杯身下面，选中的就是这个组合预览用的那档";
    };

    const cupCell = (t, pedUrl) => {
      const br = parseInt(t.bracket, 10) || 0;
      const nm = trophyThemeName(t.theme);
      const brn = trophyBracketName(br);
      const cu = t.profileIcon || "";
      return `<button class="${NS}-tro" data-theme="${esc(t.theme)}" data-bracket="${br}" ` +
             `title="${esc(nm + " · " + brn)}">` +
             `<span class="${NS}-trobox">` +
             `<img class="ped" loading="lazy" draggable="false" src="${esc(pedUrl)}" alt="">` +
             `<img class="cup" loading="lazy" draggable="false" src="${esc(cu)}" alt="">` +
             `</span><em>${esc(nm)}</em><s>${esc(br ? String(br) : "—")}</s></button>`;
    };

    const renderPedestals = () => {
      if (!pedRow) return;
      const list = (state.trophy.data && state.trophy.data.TrophyPedestals) || [];
      if (!list.length) { pedRow.innerHTML = ""; return; }
      const t = curTier();
      pedRow.innerHTML = list.slice().sort((a, b) =>
        parseInt(a.tier, 10) - parseInt(b.tier, 10)).map((p) => {
        const n = parseInt(p.tier, 10);
        return `<button class="${NS}-tro" data-tier="${n}" title="${esc(trophyTierName(n))}">` +
               `<span class="${NS}-trobox">` +
               `<img class="ped" loading="lazy" draggable="false" src="${esc(p.profileIcon || "")}" alt="">` +
               `</span><em>${esc(trophyTierName(n))}</em></button>`;
      }).join("");
      Array.prototype.forEach.call(pedRow.querySelectorAll("[data-tier]"), (c) => {
        c.classList.toggle("on", parseInt(c.getAttribute("data-tier"), 10) === t);
      });
    };

    const RBR = { 0: "基础", 4: "4人", 8: "8人", 16: "16人" };

    const renderFilter = () => {
      if (!fRow) return;
      let h = "";
      [0, 4, 8, 16].forEach((n) => {
        h += `<button class="${NS}-flt${state.trophy.filter === n ? " on" : ""}" data-br="${n}">` +
             (n ? (RBR[n] + " 队") : "全部") + `</button>`;
      });
      fRow.innerHTML = h;
    };

    const renderGrid = () => {
      if (state.trophy.err) {
        grid.innerHTML = `<div class="${NS}-gridsep">读不到奖杯清单：${esc(state.trophy.err)}</div>`;
        return;
      }
      const all = trophyAllCups().filter((t) =>
        !state.trophy.filter || (parseInt(t.bracket, 10) || 0) === state.trophy.filter);
      if (!all.length) {
        grid.innerHTML = `<div class="${NS}-gridsep">没有符合条件的奖杯</div>`;
        return;
      }
      const ped = trophyFindPedestal(curTier());
      const pedUrl = ped && ped.profileIcon ? ped.profileIcon : "";
      grid.innerHTML = all.map((t) => cupCell(t, pedUrl)).join("");
      mark();
    };

    if (fRow) {
      fRow.addEventListener("click", (e) => {
        const b = e.target.closest ? e.target.closest("[data-br]") : null;
        if (!b) return;
        state.trophy.filter = parseInt(b.getAttribute("data-br"), 10) || 0;
        renderFilter();
        renderGrid();
      });
    }

    if (pedRow) {
      pedRow.addEventListener("click", (e) => {
        const c = e.target.closest ? e.target.closest("[data-tier]") : null;
        if (!c) return;
        const t = parseInt(c.getAttribute("data-tier"), 10) || TROPHY_TIER_DEFAULT;
        if (state.trophy.pick && state.trophy.pick.theme) {
          state.trophy.pick.tier = t;
          saveTrophyPick();
          applyTrophyCSS();
          say("底座换成「" + trophyTierName(t) + "」");
          diag("trophy-pick", { pick: state.trophy.pick, via: "pedestal" });
          resetTrophyProbe();
        } else {
          state.trophy.pick = null;
          say("先在上面挑一个杯身，再选底座");
          diag("trophy-pick", { pick: null, via: "pedestal-needs-cup" });
        }
        renderGrid();
        mark();
      });
    }

    grid.addEventListener("click", (e) => {
      const card = e.target.closest ? e.target.closest("[data-theme]") : null;
      if (!card) return;
      const theme = card.getAttribute("data-theme");
      const bracket = parseInt(card.getAttribute("data-bracket"), 10) || 0;
      const p = state.trophy.pick;
      if (p && p.theme === theme && p.bracket === bracket) {
        state.trophy.pick = null;
        say("已恢复成官方的空白格");
      } else {
        const tier = (p && p.tier) || TROPHY_TIER_DEFAULT;
        state.trophy.pick = { theme: theme, bracket: bracket, tier: tier };
        say("已挂上「" + trophyThemeName(theme) + " · " + trophyBracketName(bracket) +
            " · " + trophyTierName(tier) + "」，去个人主页最下排看看（只有你自己看得见）");
      }
      saveTrophyPick();
      applyTrophyCSS();
      mark();
      diag("trophy-pick", { pick: state.trophy.pick, via: "cup" });
      resetTrophyProbe();
    });

    const rb = body.querySelector('[data-act="tr-reset"]');
    if (rb) {
      rb.addEventListener("click", () => {
        state.trophy.pick = null;
        saveTrophyPick();
        applyTrophyCSS();
        mark();
        say("已恢复成官方的空白格");
        diag("trophy-pick", { pick: null, via: "reset" });
        resetTrophyProbe();
      });
    }

    (async () => {
      renderFilter();
      grid.innerHTML = `<div class="${NS}-gridsep">正在读取奖杯清单…</div>`;
      await loadTrophies();
      renderPedestals();
      renderGrid();
      if (state.trophy.err) say("读取失败：" + state.trophy.err);
      else {
        const n = ((state.trophy.data || {}).Trophies || []).length;
        say("共 " + n + " 个杯身 × 4 个底座，点一下挂上、再点一下取消。");
      }
    })();
  }

  let tooltipScanCount = 0;
  const MAX_TOOLTIP_SCANS = 5;

  function pickNode(n) {
    let cls = "";
    try {
      cls = typeof n.className === "string" ? n.className : (n.getAttribute("class") || "");
    } catch (e) {  }
    let rect = null;
    try {
      const r = n.getBoundingClientRect();
      rect = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(",");
    } catch (e) {  }
    const st = (function () { try { const c = getComputedStyle(n); return c.position + "/" + c.zIndex + "/" + c.display; } catch (e) { return ""; } })();
    return {
      tag: n.tagName,
      cls: cls.slice(0, 110),
      txt: (n.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
      rect: rect,
      css: st,
    };
  }

  function snapshotAll() {
    return new Set(Array.prototype.slice.call(document.querySelectorAll("*")));
  }

  function scanTooltip(reason, before) {
    if (tooltipScanCount >= MAX_TOOLTIP_SCANS) return;
    tooltipScanCount++;
    try {
      const all = Array.prototype.slice.call(document.querySelectorAll("*"));
      const byClass = all.filter((n) => {
        const c = typeof n.className === "string" ? n.className : "";
        return /tooltip/i.test(c) && (n.textContent || "").trim();
      }).map(pickNode);
      const byText = all.filter((n) => {
        const t = (n.textContent || "").trim();
        return t && t.length <= 80 && /点券|精萃/.test(t);
      }).map(pickNode);
      const fresh = before ? all.filter((n) => !before.has(n)).map(pickNode) : [];
      diag("tooltip-scan", {
        reason: reason,
        n: tooltipScanCount,
        locale: getClientLocale(),
        byClassCount: byClass.length,
        byClass: byClass.slice(0, 8),
        byTextCount: byText.length,
        byText: byText.slice(0, 12),
        freshCount: fresh.length,
        fresh: fresh.slice(0, 16),
      });
    } catch (e) {
      diag("tooltip-scan-error", { msg: String(e) });
    }
  }



  const TT_SEL = ".currency-container-tooltip";
  let tooltipFixed = 0;
  let fixPending = false;

  function fixTooltip() {
    const boxes = document.querySelectorAll(TT_SEL);
    if (!boxes.length) return;
    for (let i = 0; i < boxes.length; i++) {
      const p = boxes[i].querySelector("p");
      if (!p) continue;
      const raw = (p.textContent || "").replace(/\s+/g, " ").trim();
      if (!raw) continue;
      const isRp = /点券|Riot Points|\bRP\b/i.test(raw);
      const isBe = /精萃|精粹|Blue Essence/i.test(raw);
      const n = isRp ? parseAmount(state.currency.rp)
              : isBe ? parseAmount(state.currency.be)
              : null;
      if (n == null) {
        if (p.dataset && p.dataset.hmOrig) {
          p.textContent = p.dataset.hmOrig;
          delete p.dataset.hmOrig;
        }
        continue;
      }
      if (p.dataset && !p.dataset.hmOrig) p.dataset.hmOrig = raw;
      const label = raw
        .replace(/^[\s0-9,.]+/, "")
        .replace(/^[KMB万千亿]+\s*/i, "")
        .trim();
      const want = fullAmount(n) + (label ? " " + label : "");
      if (p.textContent.trim() !== want) {
        p.textContent = want;
        if (tooltipFixed++ === 0) {
          diag("tooltip-fixed", { was: raw.slice(0, 50), now: want.slice(0, 50) });
        }
      }
    }
  }

  function scheduleFixTooltip() {
    if (fixPending) return;
    fixPending = true;
    setTimeout(() => {
      fixPending = false;
      try { if (state.currency.rp || state.currency.be) fixTooltip(); } catch (e) {  }
    }, 60);
  }

  function watchTooltip() {
    try {
      new MutationObserver(() => {
        scheduleFixTooltip();
        scheduleLevelScan();   
        scheduleFixHonorText();
        probeHonorTooltip();   
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      diag("tooltip-watch-error", { msg: String(e) });
    }
  }

  const levelSpots = new Set();
  let levelScanCount = 0;
  let levelScanPending = false;

  function scanLevelSpots() {
    levelScanCount++;
    try {
      const real = readRealLevel();
      if (!real || real === "—" || real === "0") return;
      const all = Array.prototype.slice.call(document.querySelectorAll("*"));
      for (let i = 0; i < all.length; i++) {
        const n = all[i];
        if (n.children.length !== 0) continue;
        if ((n.textContent || "").trim() !== real) continue;
        const o = pickNode(n);
        const key = o.tag + "|" + o.cls;
        if (levelSpots.has(key)) continue;
        levelSpots.add(key);
        diag("level-spot", o);
      }
    } catch (e) {  }
  }

  const levelScanStart = Date.now();

  function scheduleLevelScan() {
    if (levelScanPending) return;
    if (Date.now() - levelScanStart > 300000) return;  
    levelScanPending = true;
    setTimeout(() => {
      levelScanPending = false;
      const hadXp = xpFsCache;
      scanLevelSpots();
      try { if (state.level) applyLevelCSS(); } catch (e) {  }
      if (!hadXp && xpFsCache) {
        diag("level-fs-ready", { topbar: levelFsCache, profile: xpFsCache });
      }
    }, 1200);
  }

  function watchLevelRoutes() {
    try {
      window.addEventListener("hashchange", () => {
        scheduleLevelScan();
        scheduleClashScan();
      });
      window.addEventListener("popstate", () => {
        scheduleLevelScan();
        scheduleClashScan();
      });
    } catch (e) {  }
  }

  function scheduleClashScan() {
    setTimeout(() => {
      try {
        if (state.clash.pick) applyClashCSS();
        if (state.trophy.pick) applyTrophyCSS();
        if (state.honor.level) applyHonorCSS();
        probeClashOnProfile();
        probeTrophyOnProfile();
        probeHonorOnProfile();
      } catch (e) {  }
    }, 1200);
  }

  let clashProbedAt = 0;
  let clashProbeCount = 0;
  function probeClashOnProfile() {
    const cell = document.querySelector(".style-profile-clash-banner-component");
    if (!cell) return false;                      
    if (clashProbeCount >= 6) return false;       
    if (Date.now() - clashProbedAt < 60000) return false;
    clashProbedAt = Date.now();
    clashProbeCount++;
    try {
      const empty = cell.querySelector(".style-profile-clash-banner-empty");
      const imgs = cell.querySelectorAll(
        ".style-profile-clash-banner-image, .style-profile-clash-banner-frame");
      const sheet = document.getElementById(NS + "-clashflag");
      let bgNow = null, labelNow = null;
      if (empty) {
        try {
          const cs = getComputedStyle(empty);
          bgNow = String(cs.backgroundImage || "").slice(0, 90);
        } catch (e) {  }
      }
      const hdr = cell.querySelector(".style-profile-emblem-header");
      if (hdr) {
        try { labelNow = String(getComputedStyle(hdr, "::after").content || "").slice(0, 60); }
        catch (e) {  }
      }
      const titleEl = cell.querySelector(".style-profile-emblem-header-title");
      diag("clash-cell-probe", {
        cellFound: true,
        state: empty ? "empty" : (imgs.length ? "equipped" : "unknown"),
        emptyFound: !!empty,
        equippedImgs: imgs.length,
        headerTitle: titleEl ? String(titleEl.textContent || "").trim().slice(0, 20) : null,
        cflagClass: (document.documentElement.className || "").indexOf(NS + "-cflag") >= 0,
        sheetFound: !!sheet,
        sheetRules: sheet ? String(sheet.textContent || "").length : 0,
        appliedBg: bgNow,
        appliedLabel: labelNow,
        pick: state.clash.pick,
        dataLoaded: !!state.clash.data,
      });
    } catch (e) {
      diag("clash-cell-probe-error", { msg: String(e) });
    }
    return true;
  }

  let trophyProbedAt = 0;
  let trophyProbeCount = 0;
  function probeTrophyOnProfile(force) {
    const cell = document.querySelector(".style-profile-trophy-component");
    if (!cell) return false;                      
    if (!force) {
      if (trophyProbeCount >= 6) return false;    
      if (Date.now() - trophyProbedAt < 60000) return false;
    }
    trophyProbedAt = Date.now();
    trophyProbeCount++;
    try {
      const empty = cell.querySelector(".style-profile-trophy-empty");
      const cup = cell.querySelector(".style-profile-trophy-cupgem");
      const ped = cell.querySelector(".style-profile-trophy-pedestal");
      const sheet = document.getElementById(NS + "-trophyflag");

      const contentEl = cell.querySelector(".style-profile-emblem-content");
      let bgNow = null, szNow = null, posNow = null, contentBox = null;
      if (contentEl) {
        try {
          const cs = getComputedStyle(contentEl);
          bgNow = String(cs.backgroundImage || "").slice(0, 200);
          szNow = String(cs.backgroundSize || "");
          posNow = String(cs.backgroundPosition || "");
          const r = contentEl.getBoundingClientRect();
          contentBox = Math.round(r.width) + "x" + Math.round(r.height);
        } catch (e) {  }
      }

      const vis = (el) => {
        if (!el) return "missing";
        try { return String(getComputedStyle(el).visibility || "?"); } catch (e) { return "err"; }
      };
      const official = {
        empty: vis(empty),
        container: vis(cell.querySelector(".style-profile-trophy-container")),
        icon: vis(cell.querySelector(".style-profile-trophy-icon")),
      };

      const hdr = cell.querySelector(".style-profile-emblem-header");
      let labelNow = null;
      if (hdr) {
        try { labelNow = String(getComputedStyle(hdr, "::after").content || "").slice(0, 60); }
        catch (e) {  }
      }
      const titleEl = cell.querySelector(".style-profile-emblem-header-title");

      const hasPick = !!(state.trophy.pick && state.trophy.pick.theme);
      const layers = bgNow && bgNow !== "none" ? bgNow.split("url(").length - 1 : 0;
      const szSegs = szNow ? szNow.split(",").map((s) => s.trim()) : [];
      const posSegs = posNow ? posNow.split(",").map((s) => s.trim()) : [];
      const oneOf = (v, list) => list.indexOf(v) >= 0;
      let verdict;
      if (!hasPick) {
        verdict = "未选奖杯（不校验覆盖；官方默认内容此刻应可见）";
      } else {
        const bad = [];
        if (layers !== 2) bad.push("背景层数=" + layers + "（应 2：杯身+底座）");
        if (bgNow && bgNow.indexOf("/api/lcuimg") >= 0) bad.push("走了代理 → 透明被毁、叠不起来");
        if (szSegs.length !== 2) bad.push("size 段数=" + szSegs.length + "（1 段 = 底座丢了）");
        else {
          if (!oneOf(szSegs[0], ["auto 126px"])) bad.push('size 第1段="' + szSegs[0] + '"（应 auto 126px）');
          if (!oneOf(szSegs[1], ["70px auto", "70px"])) bad.push('size 第2段="' + szSegs[1] + '"（应 70px auto）');
        }
        if (posSegs.length !== 2) bad.push("pos 段数=" + posSegs.length + "（1 段 = 底座丢了）");
        else {
          if (!oneOf(posSegs[0], ["center 5px", "50% 5px"])) bad.push('pos 第1段="' + posSegs[0] + '"（应 center 5px）');
          if (!oneOf(posSegs[1], ["center 104px", "50% 104px"])) bad.push('pos 第2段="' + posSegs[1] + '"（应 center 104px）');
        }
        if (contentBox !== "144x180") bad.push("内容区=" + contentBox + "（应 144x180）");
        if (official.empty !== "hidden") bad.push("官方 -empty 没藏住(" + official.empty + ")");
        const wantLabel = trophyThemeName(state.trophy.pick.theme) + " · " +
                          trophyBracketName(state.trophy.pick.bracket);
        const gotLabel = String(labelNow || "").replace(/^"|"$/g, "");
        if (gotLabel !== wantLabel) {
          bad.push('副标题="' + gotLabel + '"（应 "' + wantLabel + '"）');
        }
        verdict = bad.length
          ? "✗ " + bad.join(" / ")
          : "✓ 覆盖生效：两层原始 PNG、几何与官方一致、官方内容已隐藏、副标题正确";
      }

      diag("trophy-cell-probe", {
        cellFound: true,
        state: empty ? "empty" : ((cup || ped) ? "equipped" : "unknown"),
        emptyFound: !!empty,
        cupFound: !!cup,
        pedestalFound: !!ped,
        headerTitle: titleEl ? String(titleEl.textContent || "").trim().slice(0, 20) : null,
        ctrophyClass: (document.documentElement.className || "").indexOf(NS + "-ctrophy") >= 0,
        sheetFound: !!sheet,
        sheetRules: sheet ? String(sheet.textContent || "").length : 0,
        contentBox: contentBox,
        appliedBg: bgNow,
        appliedSize: szNow,
        appliedPos: posNow,
        bgLayers: layers,
        officialVis: official,
        appliedLabel: labelNow,
        verdict: verdict,
        pick: state.trophy.pick,
        dataLoaded: !!state.trophy.data,
      });
    } catch (e) {
      diag("trophy-cell-probe-error", { msg: String(e) });
    }
    return true;
  }

  function resetTrophyProbe() {
    trophyProbedAt = 0;
    trophyProbeCount = 0;
    return probeTrophyOnProfile(true);
  }

  let honorProbedAt = 0;
  let honorProbeCount = 0;
  function probeHonorOnProfile() {
    const cell = document.querySelector(".style-profile-honor-component");
    if (!cell) return false;
    if (honorProbeCount >= 6) return false;
    if (Date.now() - honorProbedAt < 60000) return false;
    honorProbedAt = Date.now();
    honorProbeCount++;
    try {
      const v3 = cell.querySelector(".style-profile-honor-icon-v3");
      const v1 = cell.querySelector(".style-profile-honor-icon");
      const empty = cell.querySelector(".style-profile-honor-empty");
      const sheet = document.getElementById(NS + "-honorflag");
      let contentNow = null, srcNow = null, natW = null;
      const im = v3 || v1;
      if (im) {
        try {
          contentNow = String(getComputedStyle(im).content || "").slice(0, 120);
        } catch (e) {  }
        srcNow = String(im.getAttribute("src") || "").slice(0, 90);
        natW = im.naturalWidth || null;
      }
      const hdr = cell.closest(".style-profile-emblem-wrapper");
      const titleEl = hdr ? hdr.querySelector(".style-profile-emblem-header-title") : null;
      const subEl = hdr ? hdr.querySelector(".style-profile-emblem-header-subtitle") : null;
      const subRaw = subEl ? String(subEl.textContent || "").trim() : null;
      const subOrig = subEl && subEl.dataset ? (subEl.dataset.hmOrig || null) : null;
      diag("honor-cell-probe", {
        cellFound: true,
        state: empty ? "empty" : (im ? (v3 ? "v3" : "v1") : "unknown"),
        headerTitle: titleEl ? String(titleEl.textContent || "").trim().slice(0, 20) : null,
        honorClass: (document.documentElement.className || "").indexOf(NS + "-honor") >= 0,
        sheetFound: !!sheet,
        sheetRules: sheet ? String(sheet.textContent || "").length : 0,
        computedContent: contentNow,
        imgSrc: srcNow,
        imgNaturalW: natW,
        subText: subRaw ? subRaw.slice(0, 24) : null,
        subOrig: subOrig ? String(subOrig).slice(0, 24) : null,
        subExpect: state.honor.level ? honorSubText(state.honor.level, subOrig) : null,
        ttScopeHits: hdr ? hdr.querySelectorAll("lol-uikit-content-block p").length : null,
        isOwnHonorCell: !!ownHonorHost(cell),
        pick: state.honor.level,
      });

      if (hdr && !hdr.querySelectorAll("lol-uikit-content-block p").length) {
        const tgt = hdr.querySelector(".style-profile-emblem-content-container") || hdr;
        const mk = (t) => new MouseEvent(t, { bubbles: true, cancelable: true, view: window });
        tgt.dispatchEvent(mk("mouseover"));
        tgt.dispatchEvent(mk("mouseenter"));
        tgt.dispatchEvent(mk("mousemove"));
        setTimeout(() => { try { probeHonorTooltip(); } catch (e) {  } }, 400);
        setTimeout(() => { try { fixHonorText(); probeHonorTooltip(); } catch (e) {  } }, 1000);
      }
    } catch (e) {
      diag("honor-cell-probe-error", { msg: String(e) });
    }
    return true;
  }


  function probeLevel() {
    try {
      const all = Array.prototype.slice.call(document.querySelectorAll("*"));
      const clsOf = (n) => {
        try {
          return typeof n.className === "string" ? n.className : (n.getAttribute("class") || "");
        } catch (e) { return ""; }
      };

      const byCls = all.filter((n) => /level/i.test(clsOf(n))).map(pickNode);

      const rings = all.filter((n) => /level-ring/i.test(n.tagName)).map((n) => {
        const o = pickNode(n);
        try {
          o.attrs = {
            level: n.getAttribute("level"),
            size: n.getAttribute("size"),
            id: n.getAttribute("id"),
          };
        } catch (e) {  }
        return o;
      });

      const icons = all.filter((n) => /summoner-icon|profile-icon/i.test(clsOf(n))).map(pickNode);

      diag("level-probe", {
        byClsCount: byCls.length,
        byCls: byCls.slice(0, 24),
        ringsCount: rings.length,
        rings: rings.slice(0, 8),
        iconsCount: icons.length,
        icons: icons.slice(0, 8),
      });
    } catch (e) {
      diag("level-probe-error", { msg: String(e) });
    }
  }

  function watchCurrencyHover() {
    document.addEventListener("mouseover", (e) => {
      const t = e.target;
      const c = t && typeof t.className === "string" ? t.className : "";
      if (!/currency-(rp|be)/.test(c)) return;
      if (tooltipScanCount >= MAX_TOOLTIP_SCANS) return;
      const before = snapshotAll();
      setTimeout(() => scanTooltip("user-hover", before), 420);
    }, true);
  }

  function probeCurrency(tag) {
    const rp = document.querySelector(".currency-rp, .currency-rp-top-up-enabled");
    const be = document.querySelector(".currency-be-text");
    const st = document.getElementById(`${NS}-currency`);
    const cs = (el, pseudo) => { try { return getComputedStyle(el, pseudo); } catch (e) { return null; } };
    diag("currency-probe" + (tag ? ":" + tag : ""), {
      foundRp: !!rp,
      foundBe: !!be,
      rpBg: rp ? rp.className : null,
      beBg: be ? (be.parentElement ? be.parentElement.className : null) : null,
      rpRealText: rp ? (rp.textContent || "").trim() : null,
      beRealText: be ? (be.textContent || "").trim() : null,
      rpFontSize: rp && cs(rp) ? cs(rp).fontSize : null,
      beFontSize: be && cs(be) ? cs(be).fontSize : null,
      rpAfter: rp && cs(rp, "::after") ? cs(rp, "::after").content : null,
      beAfter: be && cs(be, "::after") ? cs(be, "::after").content : null,
      styleInjected: !!st,
      styleText: st ? st.textContent.slice(0, 220) : null,
      saved: { rp: state.currency.rp, be: state.currency.be },
    });
  }

  let currencyTested = false;

  function syncLootsimButton(ev) {
    let btn = null;
    try { btn = document.querySelector(LOOT_HELP_SEL_ROOT); } catch (e) { return; }
    if (!btn) return;                       
    let on = false, ver = null;
    if (ev && ev.detail) { on = !!ev.detail.on; ver = ev.detail.ver; }
    else {
      const L = window.__LOOTSIM;
      try { on = !!(L && typeof L.isOn === "function" && L.isOn()); ver = L ? L.VER : null; } catch (e) { on = false; }
    }
    btn.classList.toggle("lsim-on", on);
    try {
      btn.setAttribute("title", (on ? "模拟开箱 · 已开启（点击开合）" : "模拟开箱（PRISM）")
        + (ver ? " · v" + ver : ""));
    } catch (e) {  }
  }

  const LOOT_HELP_SEL_ROOT = "div.loot-recipe-help-button";
  const LOOT_HELP_SEL = "div.loot-recipe-help-button, div.recipe-help-button";
  let lootsimDelegated = false;

  function onLootHelpClick(e) {
    const t = e.target;
    if (!t || typeof t.closest !== "function") return;
    let hit = null;
    try { hit = t.closest(LOOT_HELP_SEL); } catch (err) { return; }
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const L = window.__LOOTSIM;
    if (!L || typeof L.toggle !== "function") {
      diag("lootsim-anchor-miss", { hasL: !!L });
      return;
    }
    try {
      if (typeof L.setAnchor === "function") L.setAnchor(hit);
      L.toggle(hit);
      syncLootsimButton();
      diag("lootsim-anchor-click", null);
    } catch (err) {
      diag("lootsim-anchor-error", { msg: String((err && err.message) || err) });
    }
  }

  function installLootsimEntry() {
    let btn = null;
    try { btn = document.querySelector(LOOT_HELP_SEL_ROOT); } catch (e) {  }
    if (btn && btn.getAttribute("data-prism-lsim") !== "1") {
      btn.setAttribute("data-prism-lsim", "1");
      diag("lootsim-anchor-found", { cls: String(btn.className || "").slice(0, 50) });
    }
    if (!lootsimDelegated) {
      lootsimDelegated = true;
      document.addEventListener("click", onLootHelpClick, true);
    }
    if (btn) syncLootsimButton();          
    return !!btn;
  }

  if (!window.__prismLsimBound) {
    window.__prismLsimBound = true;
    window.addEventListener("lootsim-change", (e) => { try { syncLootsimButton(e); } catch (err) {  } });
  }


  async function checkOnline() {
    try {
      await apiGet("/api/ping", 3000);
      state.online = true;
    } catch {
      state.online = false;
    }
    const dot = shell && shell.querySelector(`.${NS}-dot`);
    if (dot) dot.classList.toggle("online", state.online);
    return state.online;
  }



  const BUG_BTN_SEL = "button.bug-report-button-always-top";
  let anchorDelegated = false;

  function onAnchorClick(e) {
    const t = e.target;
    if (!t || typeof t.closest !== "function") return;
    let hit = null;
    try { hit = t.closest(BUG_BTN_SEL); } catch (err) { return; }
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    diag("anchor-click", null);
    togglePanel(hit);
  }

  function installPanelAnchor() {
    let btn = null;
    try { btn = document.querySelector(BUG_BTN_SEL); } catch (e) { return false; }
    if (!btn) return false;
    navItem = btn;                                  

    if (btn.getAttribute("data-prism-anchor") !== "1") {
      btn.setAttribute("data-prism-anchor", "1");
      try {
        if (btn.getAttribute("data-prism-orig-title") === null) {
          btn.setAttribute("data-prism-orig-title", btn.getAttribute("title") || "");
        }
        btn.setAttribute("title", "PRISM 设置");
      } catch (e) {  }
      diag("anchor-found", { cls: String(btn.className || "").slice(0, 60) });
    }

    if (!anchorDelegated) {
      anchorDelegated = true;
      document.addEventListener("click", onAnchorClick, true);
      console.log(`${TAG} 面板入口已接管：${BUG_BTN_SEL}`);
    }
    return true;
  }

  function watchPanelAnchor() {
    if (installPanelAnchor()) return;
    const root = document.body || document.documentElement;
    if (!root) return;
    const obs = new MutationObserver(() => {
      if (installPanelAnchor()) obs.disconnect();
    });
    obs.observe(root, { childList: true, subtree: true });
    const timer = setInterval(() => {
      if (installPanelAnchor()) {
        clearInterval(timer);
        obs.disconnect();
      }
    }, 800);
    setTimeout(() => { obs.disconnect(); clearInterval(timer); }, 60000);
  }


  function togglePanel(anchor) {
    if (state.open) closePanel();
    else openPanel(anchor);
  }

  function closePanel() {
    state.open = false;
    if (navItem) navItem.removeAttribute("active");
    if (host) {
      host.remove();
      host = null;
      shell = null;
    }
    diag("panel-closed", null);
  }

  const FLYOUT_SHADOW_CSS = ".caret{display:none !important;}";
  const FLYOUT_SHADOW_STYLE_ID = "prism-flyout-shadow-style";

  function hideFlyoutCaret(frame) {
    const f = frame || document.getElementById(`${NS}-flyout`);
    if (!f) return false;
    let sr = null;
    try { sr = f.shadowRoot; } catch (e) { return false; }
    if (!sr) return false;
    try { if (sr.querySelector("#" + FLYOUT_SHADOW_STYLE_ID)) return true; } catch (e) {  }
    try {
      const st = document.createElement("style");
      st.id = FLYOUT_SHADOW_STYLE_ID;
      st.textContent = FLYOUT_SHADOW_CSS;
      sr.appendChild(st);
      diag("flyout-caret-hidden", { ok: true });
      return true;
    } catch (e) { return false; }
  }

  function boxBrief(el, tag) {
    if (!el) return null;
    let cs = null;
    try { cs = getComputedStyle(el); } catch (e) { cs = null; }
    const r = rectOf(el);
    return {
      tag: tag || el.tagName,
      cls: String(el.className || "").slice(0, 34),
      r: r,
      outerW: el.offsetWidth, outerH: el.offsetHeight,
      bs: cs ? cs.boxSizing : null,
      bd: cs ? [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join("/") : null,
      bdColor: cs ? cs.borderRightColor : null,
      of: cs ? (cs.overflowX + "/" + cs.overflowY) : null,
      pad: cs ? cs.padding : null,
      right: r ? r.x + r.w : null,
    };
  }

  function dumpFlyoutBox() {
    const f = document.getElementById(`${NS}-flyout`);
    if (!f) return;
    let sr = null;
    try { sr = f.shadowRoot; } catch (e) { sr = null; }
    let shadow = null;
    if (sr) {
      shadow = Array.prototype.slice.call(sr.children, 0, 6).map((k) => {
        const o = boxBrief(k);
        if (o) { o.kids = Array.prototype.slice.call(k.children, 0, 6).map((j) => boxBrief(j)); }
        return o;
      });
    }
    const out = {
      vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio,
      frame: boxBrief(f, "flyout"),
      content: boxBrief(document.querySelector(`.${NS}-content`), "content"),
      shell: boxBrief(shell, "shell"),
      shadow: shadow,
      shellInlineW: shell ? shell.style.width : null,
    };
    diag("flyout-box", out);
  }

  function openPanel(anchor) {
    if (state.open) return;
    state.open = true;
    if (anchor && anchor !== navItem) navItem = anchor;
    if (navItem) navItem.removeAttribute("active");

    host = document.createElement("div");
    host.className = `${NS}-host`;

    const backdrop = document.createElement("div");
    backdrop.className = `${NS}-backdrop`;
    backdrop.addEventListener("click", closePanel);
    backdropEl = backdrop;

    const frame = document.createElement("lol-uikit-flyout-frame");
    frame.id = `${NS}-flyout`;
    frame.className = `${NS}-flyout flyout`;
    frame.setAttribute("orientation", "bottom");
    frame.setAttribute("animated", "true");
    frame.setAttribute("show", "true");

    hideFlyoutCaret(frame);
    [0, 120, 420].forEach((ms) => setTimeout(() => {
      try { hideFlyoutCaret(frame); } catch (e) {  }
    }, ms));

    const content = document.createElement("lc-flyout-content");
    content.className = `${NS}-content`;

    shell = document.createElement("div");
    shell.className = `${NS}-shell`;
    shell.innerHTML = `
      <div class="${NS}-head">
        <span class="${NS}-dot"></span>
        <div class="${NS}-title">PRISM</div>
        <span class="${NS}-spacer"></span>
        <button class="${NS}-close" data-act="close">×</button>
      </div>
      <div class="${NS}-body" data-el="body"></div>
      <div class="${NS}-foot">
        <span class="${NS}-hint" data-el="hint"></span>
      </div>
    `;
    shell.addEventListener("click", (e) => e.stopPropagation());

    content.appendChild(shell);
    frame.appendChild(content);
    host.appendChild(backdrop);
    host.appendChild(frame);
    document.body.appendChild(host);

    positionFlyout(frame);
    window.addEventListener("resize", () => positionFlyout(frame), { passive: true });

    bindPanel();
    checkOnline();
    refresh();
    diag("panel-opened", null);

    requestAnimationFrame(() => {
      try {
        const f = document.getElementById(`${NS}-flyout`);
        const b = backdropEl;
        diag("panel-geom", {
          frameRect: rectOf(f),
          shellRect: rectOf(shell),
          bodyRect: rectOf(shell && shell.querySelector(`.${NS}-body`)),
          backdropTop: b ? b.style.top : null,
          frameInlineW: f ? f.style.width : null,
          shellInlineW: shell ? shell.style.width : null,
          shellComputedW: shell ? getComputedStyle(shell).width : null,
          frameTag: f ? f.tagName : null,
        });
      } catch (err) {
        diag("panel-geom-error", { msg: String(err) });
      }
      try { dumpFlyoutBox(); } catch (e) { diag("flyout-box-error", { msg: String(e) }); }
    });
  }

  let selfTested = false;

  const UIKIT_PAD = 4;

  function positionFlyout(frame) {
    const nav = document.querySelector(".main-nav-bar") || document.querySelector(".right-nav-menu");
    const barBottom = nav ? nav.getBoundingClientRect().bottom : 64;
    const iconEl = navItem
      ? (navItem.querySelector(".menu-item-icon") || navItem)
      : null;
    const iconRect = iconEl ? iconEl.getBoundingClientRect() : null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.max(720, Math.min(1180, vw - 64));
    const top = Math.max(barBottom + 10, 56);
    const height = Math.max(360, Math.min(700, vh - top - 28));

    let left = vw - width - 28;
    const isNavItem = navItem && String(navItem.tagName || "").toUpperCase() === "LOL-UIKIT-NAVIGATION-ITEM";
    if (isNavItem && iconRect) left = iconRect.left + iconRect.width / 2 - width / 2;
    else left = (vw - width) / 2;
    left = Math.max(16, Math.min(vw - width - 16, left));

    if (backdropEl) backdropEl.style.top = `${Math.round(barBottom)}px`;

    frame.style.top = `${Math.round(top)}px`;
    frame.style.left = `${Math.round(left)}px`;
    frame.style.width = `${Math.round(width)}px`;
    frame.style.height = `${Math.round(height)}px`;
    if (shell) {
      shell.style.width = "100%";
      shell.style.height = `${Math.round(height) - UIKIT_PAD}px`;
    }
    state.panelWidth = width;
    state.panelTop = top;
  }

  function bindPanel() {
    shell.querySelector('[data-act="close"]').addEventListener("click", closePanel);


    if (!window.__prismEscBound) {
      window.__prismEscBound = true;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.open) closePanel();
      }, true);
    }
  }




  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }



  async function refresh() {
    if (!shell) return;
    const body = shell.querySelector('[data-el="body"]');
    return renderCurrencySettings(body);
  }




  let regaliaProbed = false;

  let crestSynced = false;

  function enforceFixedPicks() {
    state.ui.quiet = true;
    try { saveQuietStartPick(); } catch (e) {  }
    try { armQuietStart(); } catch (e) {  }

    state.ui.slim = true;
    try { saveSlimPick(); } catch (e) {  }
    try { applySlimCSS(); } catch (e) {  }

    let tries = 0;
    const forceChroma = () => {
      const a = (window.__PRISM_CHROMA && typeof window.__PRISM_CHROMA.setCfg === "function")
        ? window.__PRISM_CHROMA : null;
      if (!a) {
        if (++tries <= 20) setTimeout(forceChroma, 400);
        else diag("fixed-pick-chroma-timeout", { tries: tries });
        return;
      }
      try {
        if (!a.getCfg().enabled) a.setCfg({ enabled: true });
        diag("fixed-pick-chroma", { enabled: !!a.getCfg().enabled, tries: tries });
      } catch (e) { diag("fixed-pick-chroma-error", { msg: String(e) }); }
    };
    forceChroma();

    state.pbg.on = true;
    try { savePbg(); } catch (e) {  }
    try { pbgArm(); } catch (e) {  }
  }

  const FP_MAX_NODES = 2500;
  let fpDoneCount = 0, fpObserver = null, fpMutAt = 0;
  function fpTag(e) {
    if (!e) return "?";
    let s = String(e.tagName || "?").toLowerCase();
    if (e.id) s += "#" + e.id;
    const c = String(e.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
    if (c) s += "." + c;
    return s.slice(0, 90);
  }
  function fpDesc(el, depth) {
    let r = { left: 0, top: 0, width: 0, height: 0 };
    try { r = el.getBoundingClientRect(); } catch (e) {  }
    const chain = [];
    let n = el, up = 0;
    while (n && up < 6) {
      chain.push(fpTag(n));
      let p = n.parentElement;
      if (!p) {
        try {
          const rn = n.getRootNode && n.getRootNode();
          p = (rn && rn.host) || null;
        } catch (e) { p = null; }
      }
      n = p;
      up++;
    }
    let inShadow = false;
    try { inShadow = !!(el.getRootNode && el.getRootNode() !== document); } catch (e) {  }
    return {
      tag: fpTag(el), depth: depth, shadow: inShadow,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      chain: chain,
    };
  }
  function fpScan(by) {
    const t0 = Date.now();
    const hits = [];
    let scanned = 0, hosts = 0;
    try { diag("fp-probe-begin", { by: by, build: BUILD }); } catch (e) {  }
    try {
      const roots = [document];
      try {
        const all = document.querySelectorAll("*");
        for (let i = 0; i < all.length && i < 3000; i++) {
          let sr = null;
          try { sr = all[i].shadowRoot; } catch (e) { sr = null; }
          if (sr) { hosts++; if (roots.length < 60) roots.push(sr); }
        }
      } catch (e) {  }
      roots.forEach(function (root) {
        try {
          const quick = root.querySelectorAll('[class*="friend" i],[id*="friend" i],[class*="Friend"]');
          for (let i = 0; i < quick.length && hits.length < 20; i++) hits.push(fpDesc(quick[i], -1));
        } catch (e) {  }
      });
      const scan = function (root, depth) {
        if (!root || scanned >= FP_MAX_NODES || Date.now() - t0 > 900) return;
        let all = null;
        try { all = root.querySelectorAll("*"); } catch (e) { return; }
        for (let i = 0; i < all.length && scanned < FP_MAX_NODES; i++) {
          const el = all[i];
          scanned++;
          let t = "";
          try { t = String(el.textContent || ""); } catch (e) { t = ""; }
          if (t.length < 40 && (t.indexOf("好友列表") >= 0 || t.indexOf("还没有添加任何好友") >= 0)) {
            if (hits.length < 20) hits.push(fpDesc(el, depth));
          }
        }
      };
      scan(document, 0);
      diag("fp-probe-done", { by: by, ms: Date.now() - t0, scanned: scanned, hosts: hosts,
                              n: hits.length, hits: hits.slice(0, 14),
                              vw: window.innerWidth, vh: window.innerHeight });
      fpDoneCount++;
    } catch (e) {
      try { diag("fp-probe-error", { by: by, msg: String((e && e.message) || e).slice(0, 200) }); } catch (e2) {  }
    }
  }

  function cssProbe(tag) {
    const out = [];
    let total = 0, denied = 0, got = 0;
    const sheets = (document.styleSheets || []);
    for (let i = 0; i < sheets.length; i++) {
      let rules = null;
      try { rules = sheets[i].cssRules || sheets[i].rules; } catch (e) { denied++; continue; }
      if (!rules) continue;
      got++;
      for (let j = 0; j < rules.length; j++) {
        const r = rules[j];
        total++;
        let sel = "";
        try { sel = String(r.selectorText || ""); } catch (e) { sel = ""; }
        const blob = sel + " " + String(r.cssText || "");
        if (/social|friend|roster|avatar|icon-image|member-name|status-message/i.test(blob)) {
          if (out.length < 260) {
            out.push({ sel: sel.slice(0, 150), css: String(r.cssText || "").slice(0, 300) });
          }
        }
      }
    }
    try {
      diag("css-probe", { tag: tag, sheets: sheets.length, readable: got, rules: total,
                          denied: denied, n: out.length });
      for (let k = 0; k < out.length; k += 6) {
        diag("css-probe-part", { tag: tag, from: k, rows: out.slice(k, k + 6) });
      }
    } catch (e2) {  }
  }

  function rosterProbe(tag) {
    const out = [];
    try {
      const roster = document.querySelector(".lol-social-roster");
      if (!roster) {
        try { diag("roster-probe", { tag: tag, found: false }); } catch (e) {  }
        return;
      }
      const walk = (root, path, depth) => {
        if (!root || depth > 7) return;
        const kids = root.children || [];
        for (let i = 0; i < kids.length; i++) {
          if (out.length >= 46) return;
          const el = kids[i];
          let cls = "";
          try { cls = String(el.className || ""); } catch (e) { cls = ""; }
          let r = { left: 0, top: 0, width: 0, height: 0 };
          try { r = el.getBoundingClientRect(); } catch (e) {  }
          out.push({
            p: path + "/" + i, tag: String(el.tagName || "").toLowerCase(),
            cls: cls.slice(0, 110),
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
            txt: String(el.textContent || "").trim().slice(0, 50),
            html: String(el.outerHTML || "").slice(0, 320),
          });
          walk(el, path + "/" + i, depth + 1);
        }
      };
      walk(roster, ".r", 0);
      let one = null;
      try { one = document.querySelector(".lol-social-roster-member"); } catch (e) { one = null; }
      if (one) {
        let h = "";
        try { h = String(one.outerHTML || ""); } catch (e) { h = ""; }
        try { diag("roster-row-len", { len: h.length }); } catch (e) {  }
        for (let k = 0, seg = 0; k < h.length && seg < 12; k += 3000, seg++) {
          try { diag("roster-row-html", { seg: seg, s: h.slice(k, k + 3000) }); } catch (e) { break; }
        }
      }
      try {
        const imgs = document.querySelectorAll('img[class*="icon-image"], .lol-social-avatar img, .member-icon img');
        const out2 = [];
        for (let i = 0; i < imgs.length && i < 6; i++) {
          const el = imgs[i];
          let bg = "";
          try { bg = String(window.getComputedStyle(el).backgroundImage || "").slice(0, 180); } catch (e) { bg = ""; }
          let r = { left: 0, top: 0, width: 0, height: 0 };
          try { r = el.getBoundingClientRect(); } catch (e) {  }
          out2.push({
            src: String(el.src || "").slice(0, 180),
            attr: String(el.getAttribute("src") || "").slice(0, 180),
            cls: String(el.className || "").slice(0, 70),
            complete: el.complete === true, nw: el.naturalWidth || 0,
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
            bg: bg,
          });
        }
        try { diag("img-src-probe", { n: imgs.length, origin: String(location.origin), rows: out2 }); } catch (e) {  }
      } catch (e) {  }
      try {
        diag("roster-probe", { tag: tag, found: true, n: out.length, rows: out.slice(0, 14) });
        for (let k = 14; k < out.length; k += 10) {
          diag("roster-probe-part", { tag: tag, from: k, rows: out.slice(k, k + 10) });
        }
      } catch (e2) {  }
    } catch (e3) {
      try { diag("roster-probe-err", { tag: tag, msg: String((e3 && e3.message) || e3).slice(0, 160) }); } catch (e4) {  }
    }
  }


  const MATES_HOST_CLS = "prism-mates-host";
  const MATES_LIST_CLS = "prism-mates-list";
  const MATES_RANGE_BTN_CLS = "prism-mates-range-btn";
  const MATES_ACTIONS_SEL = ".lol-social-actions-bar .buttons";
  const MATES_ROWS_CLS = NS + "-mates-rows";
  const MATES_MIN_TEAM = 3;
  const MATES_RANGES = [50, 100];
  let matesShowAll = false;
  let matesRange = 50;
  let matesPick = null;
  let matesGames = null;
  let matesFetching = false;
  let matesSig = "";
  let matesObs = null, matesObsAt = 0;
  let matesRowProbeN = 0;
  let actionsProbed = false;
  let rangeProbed = false;

  function matesData() {
    const fg = forgeData();
    if (!fg || !fg.on) return null;
    const wide = matesRange >= 100;
    const rows = wide ? fg.matesWide : fg.mates;
    const meta = (wide ? fg.matesMetaWide : fg.matesMeta) || {};
    if (!rows || !rows.length) return null;
    return { rows: rows, meta: meta, wide: wide,
             hasWide: !!(fg.matesWide && fg.matesWide.length),
             hasNarrow: !!(fg.mates && fg.mates.length) };
  }

  function matesHostEl() {
    try {
      const roster = document.querySelector(".lol-social-roster");
      if (!roster) return null;
      return roster.querySelector(".list-content") || roster;
    } catch (e) { return null; }
  }

  function matesEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function matesClear() {
    try { matesRangeBtnSync(false); } catch (e) {  }
    if (!matesSig) return;
    matesSig = "";
    try {
      const h = matesHostEl();
      if (!h) return;
      h.classList.remove(MATES_HOST_CLS);
      const old = h.querySelector("." + MATES_LIST_CLS);
      if (old && old.parentNode) old.parentNode.removeChild(old);
    } catch (e) {  }
  }

  function matesToggleRange() {
    matesRange = (matesRange >= 100) ? 50 : 100;
    try { diag("mates-range", { range: matesRange }); } catch (e) {  }
    matesPaint(true);
    matesRangeBtnSync(true);
  }

  let matesRangeBtnOn = false;

  function matesRangeBtnSync(on) {
    if (!on && !matesRangeBtnOn) return;
    let btns = null;
    try { btns = document.querySelector(MATES_ACTIONS_SEL); } catch (e) { btns = null; }
    if (!btns) {
      if (on && !rangeProbed) {
        rangeProbed = true;
        try { diag("range-sync", { skip: "no-btns" }); } catch (e) {  }
      }
      return;
    }
    let mine = null, nat = null;
    try { mine = btns.querySelector("." + MATES_RANGE_BTN_CLS); } catch (e) { mine = null; }
    try { nat = btns.querySelector(".filter-button"); } catch (e) { nat = null; }
    const drop = function () {
      try { if (mine && mine.parentNode) mine.parentNode.removeChild(mine); } catch (e) {  }
      try { if (nat) nat.style.removeProperty("display"); } catch (e) {  }
      matesRangeBtnOn = false;
    };
    if (!on) { drop(); return; }
    let hasWide = false;
    try {
      const fg = forgeData();
      hasWide = !!(fg && fg.matesWide && fg.matesWide.length);
    } catch (e) { hasWide = false; }
    if (!hasWide) {
      if (!rangeProbed) {
        rangeProbed = true;
        try { diag("range-sync", { skip: "no-wide" }); } catch (e) {  }
      }
      drop(); return;
    }
    try { if (nat && nat.style.display !== "none") nat.style.display = "none"; } catch (e) {  }
    try {
      if (!mine) {
        mine = document.createElement("span");
        mine.className = "action-bar-button " + MATES_RANGE_BTN_CLS;
        mine.setAttribute("data-mates", "range");
        if (nat && nat.parentNode) nat.parentNode.insertBefore(mine, nat);
        else btns.appendChild(mine);
        mine.onclick = function () { try { matesToggleRange(); } catch (e) {  } };
      }
      const txt = String(matesRange);
      if (mine.textContent !== txt) mine.textContent = txt;
      const other = (matesRange >= 100) ? 50 : 100;
      const tip = "统计近 " + matesRange + " 局 · 点击切到近 " + other + " 局";
      if (mine.getAttribute("title") !== tip) mine.setAttribute("title", tip);
      matesRangeBtnOn = true;
      if (!rangeProbed) {
        rangeProbed = true;
        try {
          const r = mine.getBoundingClientRect();
          const ord = Array.prototype.map.call(btns.children, function (c) {
            const k = String((c && c.className) || "");
            return k.indexOf(MATES_RANGE_BTN_CLS) >= 0 ? "[MINE]"
                 : k.indexOf("filter-button") >= 0 ? "[FILTER]" : k.split(" ").pop();
          }).join(">");
          diag("range-sync", {
            ok: true, txt: mine.textContent,
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
            order: ord,
            natDisp: nat ? String(nat.style.display || "(空)") : "-",
          });
        } catch (e) {  }
      }
    } catch (e) {  }
  }

  function matesGamesHtml() {
    if (matesFetching) return `<div class="${NS}-mates-empty">读取中…</div>`;
    const gs = matesGames || [];
    if (!gs.length) return `<div class="${NS}-mates-empty">没有取到对局</div>`;
    return gs.map(function (g) {
      const p = (g.participants || [{}])[0] || {};
      const st = p.stats || {};
      const t = (g.teams || []).filter(function (x) { return x.teamId === p.teamId; })[0] || {};
      const win = t.win === true;
      const kda = (st.kills || 0) + " / " + (st.deaths || 0) + " / " + (st.assists || 0);
      return `<div class="${NS}-mates-g ${win ? "w" : "l"}">` +
             `<span class="${NS}-mates-gc">${matesEsc(p.championId || "?")}</span>` +
             `<span class="${NS}-mates-gk">${matesEsc(kda)}</span>` +
             `<span class="${NS}-mates-gr">${win ? "胜" : "负"}</span></div>`;
    }).join("");
  }

  function matesBodyHtml(rows, meta, all, d) {
    const cnt = meta.counted || 0;
    if (matesPick) {
      const n = matesGames ? matesGames.length : 0;
      return `<div class="${NS}-mates-hd"><span class="${NS}-mates-bk" data-mates="back">&lsaquo; 返回</span>` +
             `<span class="${NS}-mates-title">${matesEsc(matesPick.full)}</span>` +
             `<span class="${NS}-mates-sub">最近 ${n} 局</span></div>` +
             `<div class="${NS}-mates-rows">${matesGamesHtml()}</div>`;
    }
    const body = rows.length
      ? rows.map(function (r) {
          const full = (r.gameName || "") + "#" + (r.tagLine || "");
          const src = r.profileIcon
            ? `/lol-game-data/assets/v1/profile-icons/${matesEsc(r.profileIcon)}.jpg` : "";
          const wr = (r.winRate == null) ? "&mdash;" : (Math.round(r.winRate * 100) + "%");
          const sub = `同队 ${r.sameTeam || 0}/${cnt} 局 · 胜率 ${wr}`;
          const cls = src ? "icon-image has-icon" : "icon-image";
          return `<div draggable="false" class="lol-social-roster-member online ember-view" data-mate="${matesEsc(full)}">
  <div class="member layout online use-animation">
    <div class="open-party-indicator"></div>
    <div class="ember-view"><div class="lol-social-avatar member-icon"><div>
      <img src="${matesEsc(src)}" class="${cls}">
      <div class="icon-ring"></div>
      <div class="ember-view"><div class="lol-social-availability-hitbox">
        <div class="availability-icon online remote"></div>
      </div></div>
    </div></div></div>
    <div class="member-name-wrapper">
      <div class="member-name">${matesEsc(full)}</div>
      <div class="member-status lol-social-status ember-view">
        <div class="status-message-wrapper online"><span class="status-message online">${matesEsc(sub)}</span></div>
      </div>
    </div>
  </div>
</div>`;
        }).join("")
      : `<div class="${NS}-mates-empty">没有同队 &ge;${MATES_MIN_TEAM} 局的人</div>`;
    const ft = (all > rows.length || matesShowAll)
      ? `<div class="${NS}-mates-ft"><div class="${NS}-mates-btn" data-mates="toggle">` +
        (matesShowAll ? `只看同队 &ge;${MATES_MIN_TEAM} 局` : `显示全部 ${all} 人`) + `</div></div>`
      : "";
    return `<div class="${NS}-mates-rows">${body}</div>` + ft;
  }

  function matesOpen(full) {
    matesPick = { full: full };
    matesGames = null;
    matesFetching = true;
    matesPaint(true);
    try { diag("mates-open", { name: full }); } catch (e) {  }
    fetch(API + "/api/q/mh?begIndex=0&endIndex=4&name=" + encodeURIComponent(full), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (o) {
        matesFetching = false;
        const gs = (((o || {}).payload || {}).games || {}).games || [];
        matesGames = gs.slice(0, 5);
        matesPaint(true);
        try { diag("mates-open-done", { name: full, n: matesGames.length }); } catch (e) {  }
      })
      .catch(function () {
        matesFetching = false; matesGames = [];
        matesPaint(true);
        try { diag("mates-open-err", { name: full }); } catch (e) {  }
      });
  }

  function matesHostProbe() {
    try {
      const roster = document.querySelector(".lol-social-roster") || matesHostEl();
      if (!roster) { try { diag("mates-host-probe", { found: false }); } catch (e) {  } return; }
      const out = [];
      const walk = (el, depth) => {
        if (!el || depth > 9 || out.length > 70) return;
        let cs = null;
        try { cs = window.getComputedStyle(el); } catch (e) { cs = null; }
        let r = { left: 0, top: 0, width: 0, height: 0 };
        try { r = el.getBoundingClientRect(); } catch (e) {  }
        let bg = "none", bef = "none", aft = "none";
        try { bg = String((cs && cs.backgroundImage) || "none"); } catch (e) {  }
        try { const p = window.getComputedStyle(el, "::before"); bef = String((p && p.backgroundImage) || "none"); } catch (e) {  }
        try { const p = window.getComputedStyle(el, "::after"); aft = String((p && p.backgroundImage) || "none"); } catch (e) {  }
        const vis = (r.width > 1 && r.height > 1) && cs && cs.display !== "none" && cs.visibility !== "hidden";
        if (vis && (bg !== "none" || bef !== "none" || aft !== "none")) {
          let inList = false;
          try { inList = !!(el.closest && el.closest("." + MATES_LIST_CLS)); } catch (e) { inList = false; }
          out.push({
            d: depth, tag: String(el.tagName || "").toLowerCase(),
            cls: String(el.className || "").slice(0, 56),
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
            bg: bg.slice(0, 110), bef: bef.slice(0, 110), aft: aft.slice(0, 110),
            inList: inList,
          });
        }
        const kids = el.children || [];
        for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
      };
      walk(roster, 0);
      try {
        diag("mates-host-probe", { found: true, hostCls: String(roster.className || "").slice(0, 80),
                                   n: out.length, rows: out.slice(0, 18) });
      } catch (e) {  }
      for (let k = 18; k < out.length; k += 8) {
        try { diag("mates-host-probe-part", { from: k, rows: out.slice(k, k + 8) }); } catch (e) { break; }
      }
    } catch (e) {
      try { diag("mates-host-probe-err", { msg: String((e && e.message) || e).slice(0, 160) }); } catch (e2) {  }
    }
  }

  function actionsProbe(tag) {
    try {
      const bar = document.querySelector(".lol-social-actions-bar");
      if (!bar) { try { diag("actions-probe", { found: false, by: tag }); } catch (e) {  } return; }
      const out = [];
      const walk = (el, depth) => {
        if (!el || depth > 5 || out.length > 60) return;
        let cs = null;
        try { cs = window.getComputedStyle(el); } catch (e) { cs = null; }
        let r = { left: 0, top: 0, width: 0, height: 0 };
        try { r = el.getBoundingClientRect(); } catch (e) {  }
        let bg = "none";
        try { bg = String((cs && cs.backgroundImage) || "none"); } catch (e) {  }
        const cls = String(el.className || "");
        const isBtn = cls.indexOf("action-bar-button") >= 0;
        if (isBtn || depth <= 3) {
          let title = "";
          try {
            title = String((el.getAttribute && (el.getAttribute("title") ||
                        el.getAttribute("aria-label") || el.getAttribute("data-tooltip"))) || "");
          } catch (e) { title = ""; }
          out.push({
            d: depth, tag: String(el.tagName || "").toLowerCase(), cls: cls.slice(0, 70),
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
            title: title.slice(0, 40),
            txt: String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24),
            bg: bg.slice(0, 90),
            btn: isBtn,
          });
        }
        const kids = el.children || [];
        for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
      };
      walk(bar, 0);
      try {
        diag("actions-probe", { found: true, by: tag, barCls: String(bar.className || "").slice(0, 70),
                                n: out.length, rows: out.slice(0, 20) });
      } catch (e) {  }
      for (let k = 20; k < out.length; k += 10) {
        try { diag("actions-probe-part", { from: k, rows: out.slice(k, k + 10) }); } catch (e) { break; }
      }
    } catch (e) {
      try { diag("actions-probe-err", { msg: String((e && e.message) || e).slice(0, 160) }); } catch (e2) {  }
    }
  }

  function matesRowProbe(tag) {
    try {
      const box = document.querySelector("." + MATES_LIST_CLS);
      if (!box) { try { diag("mates-row-probe", { tag: tag, found: false, why: "no-box" }); } catch (e) {  } return; }
      const row = box.querySelector(".lol-social-roster-member");
      if (!row) { try { diag("mates-row-probe", { tag: tag, found: false, why: "no-row" }); } catch (e) {  } return; }
      const out = [];
      const walk = (el, depth) => {
        if (!el || depth > 8 || out.length > 46) return;
        let cs = null;
        try { cs = window.getComputedStyle(el); } catch (e) { cs = null; }
        let r = { left: 0, top: 0, width: 0, height: 0 };
        try { r = el.getBoundingClientRect(); } catch (e) {  }
        const pe = {};
        ["::before", "::after"].forEach(function (sel) {
          try {
            const p = window.getComputedStyle(el, sel);
            if (!p) return;
            const img = String(p.backgroundImage || "");
            const ct = String(p.content || "");
            if ((img && img !== "none") || (ct && ct !== "none" && ct !== '""' && ct !== "normal")) {
              pe[sel] = { bg: img.slice(0, 110), content: ct.slice(0, 60), bgc: String(p.backgroundColor || "") };
            }
          } catch (e) {  }
        });
        out.push({
          d: depth, tag: String(el.tagName || "").toLowerCase(),
          cls: String(el.className || "").slice(0, 60),
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
          src: (el.tagName === "IMG") ? String(el.getAttribute("src") || "").slice(0, 80) : null,
          nw: (el.tagName === "IMG") ? (el.naturalWidth || 0) : null,
          bg: cs ? String(cs.backgroundImage || "").slice(0, 130) : "",
          bgc: cs ? String(cs.backgroundColor || "") : "",
          pos: cs ? String(cs.position || "") : "",
          z: cs ? String(cs.zIndex || "") : "",
          op: cs ? String(cs.opacity || "") : "",
          pe: (pe["::before"] || pe["::after"]) ? pe : null,
          peImg: cs ? String(cs.objectFit || "") : "",
          w: cs ? String(cs.width || "") : "",
          h: cs ? String(cs.height || "") : "",
          vis: cs ? String(cs.visibility || "") : "",
          rad: cs ? String(cs.borderRadius || "") : "",
        });
        const kids = el.children || [];
        for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
      };
      walk(row, 0);
      let html = "";
      try {
        const av = row.querySelector(".lol-social-avatar");
        html = av ? String(av.outerHTML || "").slice(0, 1400) : "(no .lol-social-avatar)";
      } catch (e) { html = "(err)"; }
      try { diag("mates-avatar-html", { tag: tag, nw: row.querySelectorAll("img").length, html: html }); } catch (e) {  }
      try { diag("mates-row-probe", { tag: tag, found: true, n: out.length, rows: out.slice(0, 14) }); } catch (e) {  }
      for (let k = 14; k < out.length; k += 8) {
        try { diag("mates-row-probe-part", { tag: tag, from: k, rows: out.slice(k, k + 8) }); } catch (e) { break; }
      }
    } catch (e) {
      try { diag("mates-row-probe-err", { msg: String((e && e.message) || e).slice(0, 160) }); } catch (e2) {  }
    }
  }

  function matesBindWheel(host) {
    if (host.__prismMatesWheel) return;
    host.__prismMatesWheel = true;
    host.addEventListener("wheel", function (e) {
      const path = (e && e.composedPath) ? e.composedPath() : [e && e.target];
      let rows = null;
      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (n && n.classList && n.classList.contains(MATES_ROWS_CLS)) { rows = n; break; }
      }
      if (!rows) return;
      const d = e.deltaY || 0;
      if (!d) return;
      const top = rows.scrollTop, sh = rows.scrollHeight, ch = rows.clientHeight;
      if (sh <= ch + 1) return;                        
      const canUp = (d < 0 && top > 0);
      const canDown = (d > 0 && top + ch < sh - 1);
      if (canUp || canDown) {
        rows.scrollTop = top + d;
        e.preventDefault();
        e.stopPropagation();
      }
    }, { passive: false, capture: true });
  }

  function matesBind(host) {
    if (host.__prismMatesBound) return;
    host.__prismMatesBound = true;
    host.addEventListener("click", function (e) {
      const path = (e && e.composedPath) ? e.composedPath() : [e && e.target];
      let el = null;
      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (n && n.getAttribute && (n.hasAttribute("data-mate") || n.hasAttribute("data-mates"))) { el = n; break; }
      }
      if (!el) return;
      const act = el.getAttribute("data-mates");
      if (act === "toggle") {
        matesShowAll = !matesShowAll; matesPaint(true);
        try { diag("mates-toggle", { all: matesShowAll }); } catch (e2) {  }
        return;
      }
      if (act === "back") { matesPick = null; matesGames = null; matesPaint(true); return; }
      if (act === "range") {
        try { matesToggleRange(); } catch (e2) {  }
        return;
      }
      const who = el.getAttribute("data-mate");
      if (who) matesOpen(who);
    }, true);
    matesBindWheel(host);
  }

  function matesPaint(force) {
    const d = matesData();
    if (!d) { matesClear(); return; }
    let host = null;
    try { host = matesHostEl(); } catch (e) { host = null; }
    if (!host) { matesSig = ""; return; }
    const all = d.rows.length;
    let rows = d.rows;
    if (!matesShowAll) {
      const f = rows.filter(function (r) { return (r.sameTeam || 0) >= MATES_MIN_TEAM; });
      if (f.length) rows = f;
    }
    const sig = [matesPick ? "P:" + matesPick.full : "L", matesShowAll ? "all" : "min",
                 "R" + matesRange, String(d.meta.counted || ""), String(all), String(rows.length),
                 matesFetching ? "F" : String((matesGames || []).length)].join("|");
    if (!force && sig === matesSig) return;
    matesSig = sig;
    try {
      host.classList.add(MATES_HOST_CLS);
      let box = host.querySelector("." + MATES_LIST_CLS);
      if (!box) {
        box = document.createElement("div");
        box.className = MATES_LIST_CLS;
        host.appendChild(box);
        matesBind(host);
      }
      box.innerHTML = matesBodyHtml(rows, d.meta, all, d);
      try {
        const hr = host.getBoundingClientRect();
        const avail = Math.max(140, Math.round(window.innerHeight - hr.top - 16));
        box.style.maxHeight = avail + "px";
      } catch (e2) {  }
      try { matesRangeBtnSync(true); } catch (e7) {  }
      if (matesRowProbeN < 3) {
        matesRowProbeN++;
        try { setTimeout(function () { matesRowProbe("paint" + matesRowProbeN); }, 1500); } catch (e3) {  }
      }
      if (matesRowProbeN === 1) {
        try { setTimeout(function () { matesHostProbe(); }, 1600); } catch (e4) {  }
      }
    } catch (e) {  }
  }

  function boot() {
    if (window.__PRISM_BOOTED__) {
      try {
        diag("duplicate-load-blocked", { firstAt: window.__PRISM_BOOTED__, nowAt: Date.now() });
      } catch (e) {  }
      return;
    }
    window.__PRISM_BOOTED__ = Date.now();
    try {
      if (!matesObs && document.body) {
        matesObs = new MutationObserver(function (recs) {
          const nowT = Date.now();
          if (nowT - matesObsAt < 800) return;
          matesObsAt = nowT;
          let hit = false;
          for (let i = 0; i < recs.length && !hit; i++) {
            const ns = recs[i].addedNodes || [];
            for (let j = 0; j < ns.length; j++) {
              const n = ns[j];
              if (!n || n.nodeType !== 1) continue;
              let cls = "";
              try { cls = String(n.className || ""); } catch (e2) { cls = ""; }
              if (/lol-social|list-content|no-friends|roster/.test(cls)) { hit = true; break; }
            }
          }
          if (hit) { try { matesPaint(false); } catch (e3) {  } }
        });
        matesObs.observe(document.body, { childList: true, subtree: true });
      }
    } catch (e) {  }
    try {
      injectCSS();
      watchForgeClass();
      migrateLegacyKeys();
      loadSettings();
      loadBaseline();
      applyCurrencyCSS();
      applyLevelCSS();
      loadClashPick();
      if (state.clash.pick) {
        loadClashBanners().then(() => applyClashCSS())
          .catch((e) => diag("clash-boot-apply-error", { msg: String(e) }));
      }
      loadTrophyPick();
      if (state.trophy.pick) {
        loadTrophies().then(() => applyTrophyCSS())
          .catch((e) => diag("trophy-boot-apply-error", { msg: String(e) }));
      }
      loadCbanPick();
      if (state.cban.pick) {
        cbanEnable(cbanPick()).catch((e) => diag("cban-boot-apply-error", { msg: String(e) }));
      }
      loadPbg();
      loadHonorPick();
      applyHonorCSS();
      loadMasteryPick();
      applyMasteryCSS();
      loadProfileCustom();
      applyProfileCSS();
      loadRegaliaBorder();
      applyRegaliaBorder();
      loadTitleCustom();
      applyTitleCustom();
      installTitleTabEntry();          
      installBannerTabEntry();
      loadSummonerIcon();
      loadSummonerToken();
      loadTokenTier();
      installIdentCardEntry();
      installTokenTierEntry();
      bindIconErrProbe();
      try { applySummonerIcon(true); } catch (e) {  }
      try { applySummonerToken(true); } catch (e) {  }
      try { applyTokenTierCards(true); } catch (e) {  }
      try { armTokenTierGrid(); } catch (e) {  }
      try { armTokenPageObserver(); } catch (e) {  }
      try { armTokenSlots(); } catch (e) {  }
      try { pokeChallengeCatalog(); } catch (e) {  }
      try { armBannerTabObservers(); } catch (e) {  }
      loadCollectionPick();
      applyCollectionCSS();
      loadSkinsPick();
      applySkinsOverride();
      culLoad();
      culApplyAll();
      loadQuietStartPick();
      armQuietStart();
      loadSlimPick();
      applySlimCSS();
      enforceFixedPicks();
      watchPanelAnchor();
      let lastTickErr = "", lastTickErrAt = 0;
      setInterval(() => {
        try {
          installPanelAnchor();
          if ((state.currency.rp || state.currency.be) &&
              !document.getElementById(`${NS}-currency`)) {
            applyCurrencyCSS();
          }
          if (state.level) {
            const needXp = !xpFsCache && !!document.querySelector(".summoner-xp-radial-numbers");
            if (!document.getElementById(`${NS}-level`) || !levelFsCache || needXp) {
              applyLevelCSS();
            }
          }
          const loc = getClientLocale();
          if (loc !== lastLocale) {
            lastLocale = loc;
            if (state.currency.rp || state.currency.be) applyCurrencyCSS();
          }
          if (state.clash.pick && state.clash.data &&
              !document.getElementById(`${NS}-clashflag`)) {
            applyClashCSS();
          }
          if (state.trophy.pick && state.trophy.data &&
              !document.getElementById(`${NS}-trophyflag`)) {
            applyTrophyCSS();
          }
          if (state.cban.pick && document.querySelector(CBAN_SEL)) {
            cbanSweep().catch(() => {});
          }
          if (document.querySelector(CBAN_SEL)) probeCban();
          if (pbgOn()) pbgHijack();
          if (document.querySelector(PBG_BTN)) probePbg();
          if (state.honor.level && !document.getElementById(`${NS}-honorflag`)) {
            applyHonorCSS();
          }
          if (state.mastery.level &&
              !document.getElementById(`${NS}-masteryflag`)) {
            applyMasteryCSS();
          }
          if (state.collection.unlock &&
              !document.getElementById(`${NS}-collflag`)) {
            applyCollectionCSS();
          }
          if (state.ui.quiet) armQuietStart();
          if (state.honor.level) fixHonorText();
          probeClashOnProfile();
          probeTrophyOnProfile();
          probeHonorOnProfile();
          probeMasteryOnProfile();
          probeProfileOnProfile();
          if (state.regaliaBorder.uniqueId) applyRegaliaBorder();
          if (state.titleCustom.name) applyTitleCustom();
          probeRegaliaBorder();
          probeSlim();
          installLootsimEntry();
          unlockTitleTab();
          applyIdentityBorders();
          try { bannerPumpNow("tick", true); } catch (e) {  }
          try { probeBannerMine(); } catch (e) {  }
          probeCollectionGrid();
          try { applySummonerIcon(false); } catch (e) {  }
          try { applySummonerToken(false); } catch (e) {  }
          try { applyTokenTierCards(false); } catch (e) {  }
          try { armTokenTierGrid(); } catch (e) {  }
          try { armTokenPageObserver(); } catch (e) {  }
          try { armTokenSlots(); } catch (e) {  }
          try { pokeChallengeCatalog(); } catch (e) {  }   
          try { armCrestRoots(); } catch (e) {  }
          try { probeIconGridLight(); } catch (e) {  }   
          if (state.skins.all) tickSkins();
          matesPaint(false);
          if (!actionsProbed) {
            try {
              if (document.querySelector(".lol-social-actions-bar")) {
                actionsProbed = true;
                actionsProbe("tick");
              }
            } catch (e2) {  }
          }
        } catch (e) {
          const m = String((e && e.message) || e).slice(0, 160);
          const nowT = Date.now();
          if (m !== lastTickErr || nowT - lastTickErrAt > 30000) {
            lastTickErr = m; lastTickErrAt = nowT;
            diag("tick-error", { msg: m });
          }
        }
      }, 4000);
      setInterval(checkOnline, 30000);
      checkOnline();

      window.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === "M" || e.key === "m")) {
          e.preventDefault();
          togglePanel(navItem);
        }
      });

      snapshot("boot");
      setTimeout(() => snapshot("boot+2s"), 2000);
      setTimeout(() => snapshot("boot+8s"), 8000);
      watchTooltip();
      watchCurrencyHover();
      watchLevelRoutes();
      setTimeout(probeLevel, 18000);
      setTimeout(() => {
        try {
          const kids = document.querySelectorAll(".right-nav-menu > lol-uikit-navigation-item");
          for (let i = 0; i < Math.min(kids.length, 3); i++) {
            const el = kids[i];
            diag("nav-ref-item" + i, {
              cls: el.className.slice(0, 90),
              kids: Array.prototype.slice.call(el.children).map((c) => c.tagName + "." + ((c.className || "") + "").slice(0, 60)),
              html: el.innerHTML.slice(0, 900),
            });
          }
        } catch (err) { diag("nav-ref-error", { msg: String(err) }); }
      }, 9000);
    } catch (e) {
      diag("boot-error", { msg: String(e), stack: e && e.stack ? String(e.stack).slice(0, 600) : null });
      console.error(`${TAG} 初始化失败`, e);
    }
  }

  window.addEventListener("error", (e) => {
    diag("window-error", { msg: String(e.message), src: e.filename, line: e.lineno });
  });

  if (typeof document === "undefined") {
    console.warn(`${TAG} document 不可用，放弃`);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
