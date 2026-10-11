"""chazhanji 凭据的**加密落盘**（Windows DPAPI，零第三方依赖）。

为什么有这个文件
----------------
「不要明文写入账号密码」——
`cz_cred.json` 原来是 `{"account": "...", "password": "..."}`，**明文**，
记事本一开就拿到站点账号。这个模块把它换成**操作系统托管的加密**。

为什么用 DPAPI（而不是自己 AES）
--------------------------------
· `CryptProtectData` / `CryptUnprotectData`（`crypt32.dll`）是 Windows 自带的
  **按「当前用户」**加密。密钥由系统托管，**我们不落任何密钥** ——
  自己写 AES 就得把 key 放在同一台机器上，那只是把明文换成了另一种明文。
· 走 `ctypes` 直接调系统 DLL ⇒ **无第三方依赖**（不要 cryptography / pywin32），
  PyInstaller onefile 打出来照样能用（`ctypes` 是标准库）。
· ★ 顺带解决一个真问题：密文**换电脑 / 换 Windows 用户就解不开**
  ⇒ 把 `cz_cred.json` 拷到别的机器也**不会把账号带过去**
  （上一轮盘点部署清单时，这正是我提的那个顾虑）。

落盘格式（外层仍是 JSON，一眼能看出是什么）
------------------------------------------
    {"fmt": "dpapi-v1", "blob": "<base64(CryptProtectData(内层 json))>"}
    内层 json = {"account": "...", "password": "..."} —— **只在内存里出现**

兼容与自动迁移
--------------
读的时候**两种都认**：
  · `fmt == "dpapi-v1"`           ⇒ 解密；
  · 老格式（顶层直接有 account/password）⇒ 照常返回，并**顺手改成加密的**
    （best-effort：失败只记一行日志，**绝不因此让取数失败**）。
⇒ 存量那份明文文件**不用手动处理**，第一次取数时就自动转成密文。

★ 纪律：**任何日志/异常信息里都不许出现 account / password**。
  本模块的报错只提路径与原因；`status()` 也只回"有没有 / 是不是密文"。
"""

import base64
import json
import os
import sys
import time

FMT = "dpapi-v1"
_ENTROPY = b"PRISM/cz-cred/dpapi-v1"
_UI_FORBIDDEN = 0x1

_PROTECT = None
_UNPROTECT = None
_LOADED = [False]



def _load_dpapi():
    """-> (protect, unprotect)；拿不到就 (None, None)。**永不抛**。"""
    if not sys.platform.startswith("win"):
        return None, None
    try:
        import ctypes
        from ctypes import wintypes
    except Exception:
        return None, None
    try:
        crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    except Exception:
        return None, None

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_char))]

    P = ctypes.POINTER(DATA_BLOB)
    crypt32.CryptProtectData.argtypes = [P, wintypes.LPCWSTR, P, ctypes.c_void_p,
                                         ctypes.c_void_p, wintypes.DWORD, P]
    crypt32.CryptProtectData.restype = wintypes.BOOL
    crypt32.CryptUnprotectData.argtypes = [P, ctypes.POINTER(wintypes.LPWSTR), P,
                                           ctypes.c_void_p, ctypes.c_void_p,
                                           wintypes.DWORD, P]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p

    def _blob_in(data):
        """bytes -> (DATA_BLOB, 持有缓冲的引用)。**第二个返回值必须活着**，不然悬垂。"""
        buf = ctypes.create_string_buffer(data, max(1, len(data)))
        return DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf

    def _blob_out(blob):
        try:
            return ctypes.string_at(blob.pbData, blob.cbData)
        finally:
            try:
                kernel32.LocalFree(blob.pbData)
            except Exception:
                pass

    def protect(data):
        bi, _k1 = _blob_in(data)
        ent, _k2 = _blob_in(_ENTROPY)
        out = DATA_BLOB()
        ok = crypt32.CryptProtectData(ctypes.byref(bi), None, ctypes.byref(ent),
                                      None, None, _UI_FORBIDDEN, ctypes.byref(out))
        if not ok:
            raise OSError("CryptProtectData 失败（err=%s）" % ctypes.get_last_error())
        return _blob_out(out)

    def unprotect(blob):
        bi, _k1 = _blob_in(blob)
        ent, _k2 = _blob_in(_ENTROPY)
        out = DATA_BLOB()
        desc = wintypes.LPWSTR()
        ok = crypt32.CryptUnprotectData(ctypes.byref(bi), ctypes.byref(desc),
                                        ctypes.byref(ent), None, None,
                                        _UI_FORBIDDEN, ctypes.byref(out))
        if not ok:
            raise OSError("CryptUnprotectData 失败（err=%s）—— 凭据不是这台机器/这个"
                          "用户加密的，或文件被改动过" % ctypes.get_last_error())
        try:
            if desc:
                kernel32.LocalFree(desc)
        except Exception:
            pass
        return _blob_out(out)

    return protect, unprotect


def _codec():
    global _PROTECT, _UNPROTECT
    if not _LOADED[0]:
        _PROTECT, _UNPROTECT = _load_dpapi()
        _LOADED[0] = True
    return _PROTECT, _UNPROTECT


def available():
    """这台机器能不能用 DPAPI（Windows 上恒为 True；别的系统 False）。"""
    return _codec()[0] is not None



def encrypt(account, password):
    """-> 可直接写盘的 dict（外层 JSON）。DPAPI 不可用时抛 RuntimeError。"""
    p, _ = _codec()
    if p is None:
        raise RuntimeError("这台机器上没有可用的 DPAPI（非 Windows？）")
    raw = json.dumps({"account": account, "password": password},
                     ensure_ascii=False).encode("utf-8")
    return {"fmt": FMT, "blob": base64.b64encode(p(raw)).decode("ascii"),
            "at": time.strftime("%Y-%m-%d %H:%M:%S")}


def decrypt(d):
    """吃 encrypt() 出来的 dict。不是本格式 -> None；格式对但解不开 -> 抛 OSError。"""
    if not isinstance(d, dict) or d.get("fmt") != FMT or not d.get("blob"):
        return None
    _, u = _codec()
    if u is None:
        raise RuntimeError("没有 DPAPI，读不了加密凭据")
    o = json.loads(u(base64.b64decode(d["blob"])).decode("utf-8"))
    if not isinstance(o, dict):
        raise OSError("密文内容不是预期结构")
    return o.get("account") or "", o.get("password") or ""



def read_file(path):
    """-> (mode, account, password)。

    mode：
      "none"        文件不在 / 读不了 / 内容不完整
      "enc"         密文，已解开
      "enc-broken"  密文在，但解不开（换了机器/用户、或文件坏了）
      "plain"       ★ 老格式明文（调用方决定要不要顺手迁移）
    """
    try:
        if not os.path.isfile(path):
            return "none", None, None
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        return "none", None, None
    if isinstance(d, dict) and d.get("fmt") == FMT:
        try:
            a, p = decrypt(d)
        except Exception:
            return "enc-broken", None, None
        if a and p:
            return "enc", a, p
        return "none", None, None
    if isinstance(d, dict) and d.get("account") and d.get("password"):
        return "plain", d["account"], d["password"]
    return "none", None, None


def write_file(path, account, password):
    """加密写入（先写 .tmp 再 replace ⇒ 不会留半个文件）。返回落盘路径。"""
    d = encrypt(account, password)
    d_dir = os.path.dirname(os.path.abspath(path))
    if d_dir:
        os.makedirs(d_dir, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass
    return path


def load_file(path, migrate=True, log=None):
    """读凭据。**明文老格式会自动转成密文**（best-effort，失败不影响返回）。

    -> (account, password) 或 None。
    ★ 任何日志都不打印 account / password，只提路径。
    """
    mode, a, p = read_file(path)
    if mode == "none":
        return None
    if mode == "enc-broken":
        if log:
            log("凭据是密文但解不开（换过机器/用户，或文件被改过）：%s" % path)
        return None
    if mode == "plain" and migrate:
        try:
            write_file(path, a, p)
            if log:
                log("凭据已自动改为加密存储（DPAPI）：%s" % path)
        except Exception as e:
            if log:
                log("凭据自动加密失败（本次仍按明文使用）：%s: %s" % (type(e).__name__, e))
    return a, p


def status(path):
    """给 CLI / 排障用：**只回"有没有 / 是不是密文"**，绝不回内容。"""
    mode, _a, _p = read_file(path)
    return {"path": path,
            "exists": mode != "none",
            "mode": mode,
            "encrypted": mode == "enc",
            "dpapi": available()}


__all__ = ["FMT", "available", "encrypt", "decrypt",
           "read_file", "write_file", "load_file", "status"]
