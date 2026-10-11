# -*- mode: python ; coding: utf-8 -*-
# 打包 lcu-lockfile-watch.exe（LCU 锁文件看守）
#
# ★ 2026-10-10：从 onefile 改成 **onedir** —— onefile 每次运行都要把内容解包到
#   `%TEMP%\_MEI*`，违反"所有产物必须在 PRISM 文件夹内"；onedir 解包到
#   `<家>\_int_watch\`（就在家里），启动也更快。
#   依赖目录特意叫 `_int_watch`（不是默认的 `_internal`）：家里有 3 个 PyInstaller
#   产物（server / watch / launcher），用默认名会互相覆盖。
#
# 构建：
#   python -m PyInstaller build_exe/lcu-lockfile-watch.spec \
#       --distpath build_exe/dist --workpath build_exe/build --noconfirm

import os

_ICO = os.path.join(os.path.abspath(SPECPATH), 'prism.ico')       # noqa: F821

a = Analysis(
    ['../refresh_lcu_lockfile.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,              # ★ onedir 的关键开关
    name='lcu-lockfile-watch',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    icon=_ICO if os.path.isfile(_ICO) else None,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    contents_directory='_int_watch',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='lcu-lockfile-watch',
)
