# -*- mode: python ; coding: utf-8 -*-
# 纯净版后端打包 spec —— **由 _build_opensource.py 自动生成，别手改**。
#
# hiddenimports 里的 prism_inject.* 必须有：server.py 是用 importlib **动态**
# import 各子模块的，PyInstaller 静态分析看不见 ⇒ 漏一个就是"跑起来才
# ModuleNotFoundError"（本项目踩过多次）。
import os

_SRC = os.path.dirname(os.path.abspath(SPECPATH))   # noqa: F821 (spec 注入)

_PRISM = [
    'prism_inject',
    'prism_inject.cz_cred',
    'prism_inject.cz_source',
    'prism_inject.installer',
    'prism_inject.lcu',
    'prism_inject.mh_forge',
    'prism_inject.names',
    'prism_inject.paths',
    'prism_inject.pengu',
    'prism_inject.query',
    'prism_inject.skins',
    'prism_inject.transfer_pack',
    'prism_inject.uninstall',
    'configparser',
]

a = Analysis(
    [os.path.join(_SRC, 'server.py')],
    pathex=[_SRC],
    binaries=[],
    datas=[],
    hiddenimports=_PRISM,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

# onedir（不是 onefile）：解包到 `<家>\\_int_server\\`，产物不出"家"。
_ICO = os.path.join(_SRC, 'build_exe', 'prism.ico')

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='prism-server',
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
    contents_directory='_int_server',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='prism-server',
)
