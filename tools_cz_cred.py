r"""tools_cz_cred.py — 管理 chazhanji（峡谷查个分）凭据，**加密落盘**。

背景：「不要明文写入账号密码」
⇒ 凭据文件从明文 json 换成 **Windows DPAPI 密文**（见 `prism_inject/cz_cred.py`）。

用法：
    python tools_cz_cred.py                  看状态（**不显示任何凭据内容**）
    python tools_cz_cred.py --set            交互式输入账号密码（密码不回显）并加密写入
    python tools_cz_cred.py --set 账号 密码    直接给定（★ 会留在命令历史里，不推荐）
    python tools_cz_cred.py --migrate        把存量**明文**文件原地转成密文
    python tools_cz_cred.py --clear          删掉凭据文件

★ 默认落在 `%LOCALAPPDATA%\PRISM\cz_cred.json`；`--path` 可指定别处（开发用）。
★ 本工具**永远不打印密码**，也不提供"查看明文"的开关 —— 要改就重写一份。
"""

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from prism_inject import cz_cred


def default_path():
    la = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(la, "PRISM", "cz_cred.json")


def cmd_status(path):
    st = cz_cred.status(path)
    print("凭据文件 : %s" % st["path"])
    print("在不在   : %s" % ("有" if st["exists"] else "没有"))
    print("存储形态 : %s" % {"none": "（无）",
                             "enc": "DPAPI 密文 ✓",
                             "enc-broken": "密文，但**解不开**（换过机器/用户，或文件被改过）",
                             "plain": "★ 仍是明文 —— 跑一次 --migrate 就会转成密文"}[st["mode"]])
    print("DPAPI    : %s" % ("可用" if st["dpapi"] else "不可用（非 Windows？）"))
    return 0


def cmd_set(path, account, password):
    if not account or not password:
        print("[X] 账号或密码为空")
        return 2
    try:
        cz_cred.write_file(path, account, password)
    except Exception as e:
        print("[X] 写失败：%s: %s" % (type(e).__name__, e))
        return 3
    st = cz_cred.status(path)
    print("[+] 已加密写入 -> %s（形态：%s）" % (path, st["mode"]))
    print("    验证：%s" % ("读回 OK" if _verify(path, account, password) else "★ 读回不一致，请检查"))
    return 0


def _verify(path, account, password):
    mode, a, p = cz_cred.read_file(path)
    return mode == "enc" and a == account and p == password


def cmd_migrate(path):
    mode, a, p = cz_cred.read_file(path)
    if mode == "none":
        print("[=] 没有可迁移的文件：%s" % path)
        return 0
    if mode == "enc":
        print("[=] 已经是密文，不用动：%s" % path)
        return 0
    if mode == "enc-broken":
        print("[X] 密文解不开（换了机器/用户？）—— 用 --set 重写一份")
        return 4
    if not cz_cred.available():
        print("[X] 这台机器没有 DPAPI，无法加密")
        return 5
    cz_cred.write_file(path, a, p)
    st = cz_cred.status(path)
    print("[+] 明文已就地转成密文 -> %s（形态：%s）" % (path, st["mode"]))
    return 0


def cmd_clear(path):
    if os.path.isfile(path):
        os.remove(path)
        print("[+] 已删除 %s" % path)
    else:
        print("[=] 本来就不存在：%s" % path)
    return 0


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--path", default=None, help="凭据文件路径（默认 %%LOCALAPPDATA%%\\PRISM\\cz_cred.json）")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--set", nargs="*", metavar=("账号", "密码"),
                   help="写入（不带参数则交互式输入；密码不回显）")
    g.add_argument("--migrate", action="store_true", help="把存量明文就地转成密文")
    g.add_argument("--clear", action="store_true", help="删除凭据文件")
    args = ap.parse_args()
    path = args.path or default_path()

    if args.set is not None:
        vals = list(args.set)
        acc = vals[0] if len(vals) > 0 else input("账号：").strip()
        pwd = vals[1] if len(vals) > 1 else getpass.getpass("密码（不回显）：")
        return cmd_set(path, acc, pwd)
    if args.migrate:
        return cmd_migrate(path)
    if args.clear:
        return cmd_clear(path)
    return cmd_status(path)


if __name__ == "__main__":
    sys.exit(main())
