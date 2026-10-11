r"""tools_plugin_toggle.py — **可逆地停用 / 启用** Pengu 插件（改入口文件名，不删任何东西）。

为什么用"改名"而不是"删除"
--------------------------
  · Pengu 只加载插件目录里的 `index.js`；改名成 `index.js_` 就等于**停用**。
  · ★ 这不是我们发明的：这套生态里"停用"的通行写法就是 `index.js_`
    （Pengu 只认 `index.js`，认不出别的名字）。
  · 好处：**完全可逆**、不丢文件、不丢配置。

用法：
    python tools_plugin_toggle.py                 # 看状态（插件目录里所有插件的入口状态）
    python tools_plugin_toggle.py --status A B    # 只看这几个
    python tools_plugin_toggle.py --disable A B C # 停用（index.js -> index.js_）
    python tools_plugin_toggle.py --enable  A B C # 启用（index.js_ -> index.js）

★ 每次操作都会追加一条记录到 `_diag/plugin-toggle-manifest.json`（谁、从什么改成什么、什么时候），
  要还原照着它来就行。**本工具永远不删文件。**

★ 排障用途：想验证"客户端/注入器启动时会不会把插件补回来"，就 --disable 一批 → 重启客户端 →
  再 --status 看三个信号：① 入口名还是不是 `index.js_`；② 目录 mtime 有没有变；
  ③ 有没有**同时**出现 `index.js` 和 `index.js_`（= 被重新拷了一份）。
"""

import argparse
import io
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
def _prism_home():
    """我们自己的「家」（PRISM_HOME → 注册表 → 兜底 %LOCALAPPDATA%\\PRISM）。"""
    v = os.environ.get("PRISM_HOME")
    if v and os.path.isdir(v):
        return v
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\PRISM") as k:
            v, _ = winreg.QueryValueEx(k, "Home")
            if v and os.path.isdir(v):
                return v
    except Exception:
        pass
    return os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "PRISM")


PLUGINS_DIR = os.path.join(_prism_home(), "pengu", "plugins")
MANIFEST = os.path.join(HERE, "_diag", "plugin-toggle-manifest.json")

ON = "index.js"
OFF = "index.js_"


def entry_state(d):
    """-> (状态, 说明)；状态 ∈ on / off / both / none"""
    p = os.path.join(PLUGINS_DIR, d)
    if not os.path.isdir(p):
        return "missing", "目录不存在"
    has_on = os.path.isfile(os.path.join(p, ON))
    has_off = os.path.isfile(os.path.join(p, OFF))
    if has_on and has_off:
        return "both", "★ 同时存在 index.js 与 index.js_（像是被重新补过一份）"
    if has_on:
        return "on", "启用中"
    if has_off:
        return "off", "已停用（index.js_）"
    return "none", "既没有 index.js 也没有 index.js_（入口名可能不同）"


def dir_mtime(d):
    try:
        return time.strftime("%Y-%m-%d %H:%M:%S",
                             time.localtime(os.path.getmtime(os.path.join(PLUGINS_DIR, d))))
    except Exception:
        return "-"


def all_dirs():
    try:
        return sorted(x for x in os.listdir(PLUGINS_DIR)
                      if os.path.isdir(os.path.join(PLUGINS_DIR, x)))
    except Exception:
        return []


def show(names=None):
    names = names or all_dirs()
    print("插件目录 : %s" % PLUGINS_DIR)
    print("%-22s %-8s %-20s %s" % ("插件", "状态", "目录 mtime", "说明"))
    print("-" * 92)
    tally = {"on": 0, "off": 0, "both": 0, "none": 0, "missing": 0}
    for d in names:
        st, note = entry_state(d)
        tally[st] = tally.get(st, 0) + 1
        print("%-22s %-8s %-20s %s" % (d, {"on": "启用", "off": "停用", "both": "冲突",
                                           "none": "?  ", "missing": "缺失"}[st],
                                       dir_mtime(d), note))
    print("-" * 92)
    print("合计：启用 %d · 停用 %d · 冲突 %d · 异常 %d"
          % (tally["on"], tally["off"], tally["both"], tally["none"] + tally["missing"]))
    return 0


def log_manifest(rows):
    try:
        os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
        hist = []
        if os.path.isfile(MANIFEST):
            try:
                with io.open(MANIFEST, encoding="utf-8") as f:
                    hist = json.load(f) or []
            except Exception:
                hist = []
        hist.extend(rows)
        with io.open(MANIFEST, "w", encoding="utf-8") as f:
            json.dump(hist, f, ensure_ascii=False, indent=2)
        print("[+] 记录已追加到 %s（共 %d 条）" % (MANIFEST, len(hist)))
    except Exception as e:
        print("[!] 清单写入失败（不影响本次改名）：%s: %s" % (type(e).__name__, e))


def toggle(names, turn_on):
    src_name, dst_name = (OFF, ON) if turn_on else (ON, OFF)
    verb = "启用" if turn_on else "停用"
    changed, rows, problems = 0, [], []
    for d in names:
        p = os.path.join(PLUGINS_DIR, d)
        if not os.path.isdir(p):
            problems.append("%s：目录不存在" % d)
            continue
        src, dst = os.path.join(p, src_name), os.path.join(p, dst_name)
        if os.path.isfile(dst) and not os.path.isfile(src):
            print("[=] %-22s 已经是%s状态，跳过" % (d, verb))
            continue
        if not os.path.isfile(src):
            problems.append("%s：找不到 %s" % (d, src_name))
            continue
        if os.path.isfile(dst):
            problems.append("%s：%s 已存在，不敢覆盖（先人工确认）" % (d, dst_name))
            continue
        os.rename(src, dst)
        changed += 1
        print("[+] %-22s %s -> %s（%s）" % (d, src_name, dst_name, verb))
        rows.append({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "plugin": d,
                     "action": "enable" if turn_on else "disable",
                     "from": src_name, "to": dst_name})
    print()
    print("%s完成：改了 %d 个%s" % (verb, changed,
                                  ("，%d 个有问题：%s" % (len(problems), "；".join(problems)))
                                  if problems else ""))
    if rows:
        log_manifest(rows)
    print()
    show(names)
    return 0 if not problems else 1


def main():
    ap = argparse.ArgumentParser(description="可逆地停用/启用 Pengu 插件（改入口文件名）")
    ap.add_argument("--status", nargs="*", metavar="插件名", default=None)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--disable", nargs="+", metavar="插件名")
    g.add_argument("--enable", nargs="+", metavar="插件名")
    args = ap.parse_args()

    if not os.path.isdir(PLUGINS_DIR):
        print("[X] 插件目录不存在：%s" % PLUGINS_DIR)
        return 2
    if args.disable:
        return toggle(args.disable, turn_on=False)
    if args.enable:
        return toggle(args.enable, turn_on=True)
    return show(args.status or None)


if __name__ == "__main__":
    sys.exit(main())
