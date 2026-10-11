# -*- mode: python ; coding: utf-8 -*-
# 打包 PRISM 启动器（`launcher.py`）—— PyInstaller onedir 产物。
#
# ★ 产物去向：打包后**改名成 `PRISM.exe`**，连同依赖目录 `_int_launcher\` 一起进安装载荷
#   （`dist_transfer/_payload_pure/`，与 `lcu-lockfile-watch.exe` / `prism-server.exe` 并列），
#   由 Inno 装到**用户自己选的安装目录**（`.iss` 的 [Icons] / [Run] 都指向 `{app}\PRISM.exe`）。
#   ⇒ 它**没有「必须放在某个固定盘」的要求** —— 用户装哪就在哪。
#
# ★ 2026-10-10：改 **onedir**（理由同另两个 exe：onefile 会往 `%TEMP%\_MEI*` 解包）。
#   关键开关 = EXE 的 `exclude_binaries=True` + `contents_directory='_int_launcher'`。
#
# 构建：
#   python -m PyInstaller build_exe/PRISM-launcher.spec \
#       --distpath build_exe/dist --workpath build_exe/build --noconfirm

import os

_ICO = os.path.join(os.path.abspath(SPECPATH), 'prism.ico')       # noqa: F821

a = Analysis(
    ['../launcher.py'],
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
    name='PRISM-launcher',
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
    contents_directory='_int_launcher',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='PRISM-launcher',
)
