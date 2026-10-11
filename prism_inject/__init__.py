"""prism_inject —— 本地后端用到的工具包。

本版**不含任何"游戏内替换"能力**（不注入、不 hook、不改 WAD）——
也就是说没有 `injector` / `toolchain` / `auto` / `prep` / `skins` / `wadx` / `hashes`
这些模块。这里只有"大厅里看得见的东西"要用的工具：

    · paths        路径 / 「家」解析（PRISM_HOME → exe 自定位 → 注册表 → 兜底）
    · lcu          LCU 连接层（凭据**读最新 Ux 日志**，不信 lockfile）
    · names        官方中文名索引（皮肤名 / 英雄名等）
    · query        全区服战绩查询（SGP 直连）
    · cz_source / cz_cred   国服战绩站点通道（兜底）
    · mh_forge     对局记录复刻
    · pengu        Pengu Loader 相关（装/卸/查询）
    · installer / uninstall / transfer_pack / winprog   安装与交付

设计原则：
  · 后端只服务大厅显示层 —— 一个字节都不写游戏进程。
  · ★ `paths` 必须**懒解析**：本包是在 `server.py` 下半部分才被加载进来的
    （见那边的 `prism_mod()`），放模块顶层会让后端一启动就受路径解析牵连。
"""

__all__ = ["paths", "lcu", "names", "query",
           "cz_source", "cz_cred", "mh_forge",
           "pengu", "installer", "uninstall", "transfer_pack", "winprog"]
