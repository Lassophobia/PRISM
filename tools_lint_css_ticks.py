"""
CSS 模板串里的反引号闸门 —— 本项目已栽过三次的头号低级坑。

【为什么会栽】`plugin/index.js` 上面那张整张样式表长在 JS **模板字面量**里：

    const CSS = `
      .foo { color: red; }
    `;

模板串的定界符就是反引号（U+0060）。所以只要在 CSS 注释里写一个反引号 ——
哪怕只是想把 `inset 2px` 括起来 —— 模板串就**在那一行提前结束**，后面的 CSS 全被
当成 JS 解析，`node --check` 报一个离真凶十万八千里的语法错（实测报在第 507 行的
"inset" 上，真凶是同一行的注释）。

【踩坑记录（别再犯第四次）】
  · 2026-09-23  `[class*="x"]` 那段注释
  · 2026-10-04  `[id^="title-id-"]` 那段注释（注释里写了 opacity / !important）
  · 2026-10-04  `.hm-sitem.on` 那段注释（注释里写了 inset 2px）
  三次都是 node --check 当场抓住的 —— 也就是说每次都得"先犯错再被拦"。
  这个脚本把拦截点**提前**，而且**直接报哪一行**。

【判据（不是"数反引号"，那样会被 ${} 里的嵌套模板串误伤）】
  用状态栈正确解析模板串 / 表达式两种上下文的嵌套 —— 对每个**长模板串**
  （跨 >= MIN_LINES 行）看它的**闭合反引号**：合法情况下，闭合反引号后面
  只允许跟空白和 `; , ) ] }` 这类收尾符；一旦后面还挂着别的正文，
  就说明这个"闭合"是被注释里的野反引号**提前顶掉**的 ⇒ 报错。

用法：
  python tools_lint_css_ticks.py                 # 扫默认的 plugin/index.js
  python tools_lint_css_ticks.py <file> [...]    # 扫指定文件
  python tools_lint_css_ticks.py --all           # 连短模板串也一起报（排查用）
  python tools_lint_css_ticks.py --no-check      # 只做扫描，不跑 node --check
退出码：0 = 干净；1 = 发现问题。
"""

import io
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
def _find_node():
    """找 node：`$PRISM_NODE` → PATH → 常见安装位置。

    ★ 别写死路径 / 版本号 —— 写死的后果不是报错，而是**静默跳过** node --check
      （看着"闸门全过"，其实那一道根本没跑）。"""
    import os as _o
    import shutil as _s
    n = _o.environ.get("PRISM_NODE")
    if n and _o.path.isfile(n):
        return n
    n = _s.which("node")
    if n:
        return n
    for c in (r"C:\Program Files\nodejs\node.exe",
              _o.path.join(_o.environ.get("LOCALAPPDATA", ""), "Programs", "nodejs", "node.exe")):
        if c and _o.path.isfile(c):
            return c
    return ""


NODE = _find_node()
MIN_LINES = 10

ALLOWED_TAIL = set(" \t;,)]}:.")


def parse_templates(lines):
    """状态栈解析。返回所有模板串帧：
    [{start, end, close_col, tail}]（0-based 行号）"""
    stack = []
    frames = []
    for i, line in enumerate(lines):
        j = 0
        while j < len(line):
            c = line[j]
            top = stack[-1] if stack else None

            if top is None or top["kind"] == "expr":
                if c == '"' or c == "'":
                    q = c
                    j += 1
                    while j < len(line):
                        if line[j] == "\\":
                            j += 2
                            continue
                        if line[j] == q:
                            break
                        j += 1
                    j += 1
                    continue
                if c == "`":
                    stack.append({"kind": "tpl", "braces": 0, "start": i})
                    j += 1
                    continue
                if c == "{":
                    if top is not None:
                        top["braces"] += 1
                    j += 1
                    continue
                if c == "}":
                    if top is not None:
                        if top["braces"] == 0:
                            stack.pop()
                        else:
                            top["braces"] -= 1
                    j += 1
                    continue
                if c == "/" and j + 1 < len(line) and line[j + 1] == "/":
                    break
                j += 1
                continue

            if c == "\\":
                j += 2
                continue
            if c == "$" and j + 1 < len(line) and line[j + 1] == "{":
                stack.append({"kind": "expr", "braces": 0, "start": i})
                j += 2
                continue
            if c == "`":
                fr = stack.pop()
                frames.append({
                    "start": fr["start"],
                    "end": i,
                    "close_col": j,
                    "tail": line[j + 1:],
                })
                j += 1
                continue
            j += 1
    return frames


def scan(path, report_all=False):
    with io.open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    frames = parse_templates(lines)
    longs = [fr for fr in frames if (fr["end"] - fr["start"] + 1) >= MIN_LINES]

    suspects = []
    for fr in longs:
        tail = fr["tail"].strip()
        if tail and any(ch not in ALLOWED_TAIL for ch in tail):
            suspects.append(fr)
    return lines, frames, longs, suspects


def node_check(path):
    probe = path
    tmp = None
    if not path.endswith(".js"):
        tmp = os.path.join(os.path.dirname(path), os.path.basename(path) + ".__lint.js")
        try:
            with io.open(path, "rb") as a, io.open(tmp, "wb") as b:
                b.write(a.read())
            probe = tmp
        except Exception:
            tmp = None
            probe = path
    try:
        try:
            p = subprocess.run([NODE, "--check", probe], capture_output=True, text=True,
                               encoding="utf-8", errors="replace")
        except FileNotFoundError:
            return None, "找不到受管 node：%s" % NODE
        err = (p.stderr or "") + (p.stdout or "")
        if tmp:
            err = err.replace(tmp, path)
        if p.returncode == 0:
            return True, ""
        return False, err
    finally:
        if tmp:
            try:
                os.remove(tmp)
            except Exception:
                pass


def main(argv):
    do_check = "--no-check" not in argv
    report_all = ("--all" in argv) or ("-a" in argv)
    args = [a for a in argv if not a.startswith("-")]
    files = args or [os.path.join(HERE, "plugin", "index.js")]

    rc = 0
    for f in files:
        if not os.path.exists(f):
            print("! 文件不存在：%s" % f)
            rc = 1
            continue
        print("── %s" % f)
        lines, frames, longs, suspects = scan(f, report_all)
        print("   模板串 %d 个（其中长模板串 %d 个）" % (len(frames), len(longs)))

        if suspects:
            rc = 1
            print("   ★ 命中！这几个长模板串的闭合反引号是**野反引号顶掉**的：")
            print("     （就是注释里那个反引号把模板串提前结束了）」")
            for fr in suspects[:10]:
                ln = fr["end"] + 1
                print("     第 %d 行被人眼误认为注释、被 JS 当成模板串结束：" % ln)
                print("       %s" % lines[fr["end"]].strip()[:120])
                print("       ↑ 反引号后面还挂着正文：%r" % fr["tail"].strip()[:60])
        else:
            print("   OK：没有野反引号")

        if do_check:
            ok, err = node_check(f)
            if ok is None:
                print("   (跳过 node --check：%s)" % err)
            elif ok:
                print("   OK：node --check 通过")
            else:
                rc = 1
                head = [l for l in err.split("\n")[:6] if l.strip()]
                print("   ★ node --check 失败：")
                for l in head:
                    print("     " + l)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
