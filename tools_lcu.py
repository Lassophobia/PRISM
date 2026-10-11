"""小工具：直接打 LCU。用法  python tools_lcu.py GET /lol-clash/v1/player"""
import json, ssl, base64, urllib.request, urllib.error, sys
from pathlib import Path

def creds():
    for lf in (Path(r"E:\LoL\LeagueClient\lockfile"),
               Path(r"E:\WeGameApps\英雄联盟（含经典模式）\LeagueClient\lockfile")):
        if lf.exists():
            p = lf.read_text(encoding="utf-8", errors="replace").strip().split(":")
            if len(p) >= 5:
                return int(p[2]), p[3]
    raise SystemExit("no lockfile")

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE

def req(method, path, body=None):
    port, token = creds()
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request("https://127.0.0.1:%d%s" % (port, path), data=data, method=method)
    r.add_header("Authorization", "Basic " + base64.b64encode(("riot:" + token).encode()).decode())
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=20, context=CTX) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, str(e)

if __name__ == "__main__":
    a = sys.argv[1:]
    method = "GET"
    if a and a[0] in ("GET", "POST", "PUT", "DELETE"):
        method = a.pop(0)
    body = None
    if method != "GET" and a and not a[-1].startswith("/"):
        body = json.loads(a.pop())
    for p in a:
        st, b = req(method, p, body)
        print("=== %s %s -> %s" % (method, p, st))
        print(b[:3000])
        print()
