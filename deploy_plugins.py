"""把插件**源码**部署到「家」的两个 plugins 目录 —— 改完插件后、打包前跑一次。

    python deploy_plugins.py            # 比对并补齐（只拷不一致的）
    python deploy_plugins.py --check    # 只比对，不动手（有不一致时退出码 = 1）

★★ 为什么需要它
   `make_transfer_pack.py` 打出的 payload 里，`plugins/` 是**从「家」拷的**
   （见 `prism_inject/transfer_pack.py` 的 `PAYLOAD_ITEMS`）——
   也就是说 **「家」才是打包的"源"**，源码改了不部署，包里就是旧插件，而且**一声不响**。
   （2026-10-10 真踩过：差点把没有「游戏内皮肤替换」开关的包发出去。
     现在 `make_transfer_pack.py::verify_plugins_fresh()` 会**中止**，本脚本负责**修**。）

两个落点（都要写，别只写一个）：
   · `<家>\\plugins\\<名>\\index.js`        ← "主拷贝/源"
   · `<家>\\pengu\\plugins\\<名>\\index.js`  ← Pengu 实际加载的那份
"""

from __future__ import annotations

import hashlib
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from prism_inject import paths, transfer_pack

_SUBS = ("plugins", "pengu/plugins")


def _sha16(p: Path) -> str:
    try:
        return hashlib.sha256(p.read_bytes()).hexdigest()[:16]
    except Exception:
        return ""


def main(argv: list) -> int:
    check_only = "--check" in argv
    home = Path(paths.prism_home())
    print("家 = %s%s" % (home, "   （--check：只看不动）" if check_only else ""))
    print()

    copied, same, missing_dir, missing_src = [], [], [], []
    for rel, name in transfer_pack.PLUGIN_SRC_MAP:
        src = ROOT / rel
        if not src.is_file():
            missing_src.append(rel)
            continue
        want = _sha16(src)
        for sub in _SUBS:
            dst = home / sub / name / "index.js"
            if not dst.parent.is_dir():
                missing_dir.append("%s/%s" % (sub, name))
                continue
            if _sha16(dst) == want:
                same.append("%s/%s" % (sub, name))
                continue
            if check_only:
                copied.append("%s/%s（不一致）" % (sub, name))
                continue
            try:
                shutil.copy2(src, dst)
                copied.append("%s/%s" % (sub, name))
            except Exception as e:
                print("  [X] 拷 %s 失败：%s" % (dst, str(e)[:90]))

    for x in copied:
        print("  %s %s" % ("[!]" if check_only else "[+]", x))
    for x in missing_dir:
        print("  [!] 目录不存在，跳过：%s" % x)
    for x in missing_src:
        print("  [!] 源码不存在：%s" % x)

    print()
    print("一致 %d · %s %d · 目录缺 %d · 源码缺 %d"
          % (len(same), "不一致" if check_only else "已拷", len(copied),
             len(missing_dir), len(missing_src)))
    if check_only and copied:
        print("\n⇒ 有插件不是最新的。跑一次不带 --check 的本脚本即可补齐。")
        return 1
    if missing_dir or missing_src:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
