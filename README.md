# PRISM · 英雄联盟国服客户端增强（纯净版）

> 跑在 **Pengu Loader** 上的大厅插件集 + 一个本机小后端。
> 只做**显示层**增强 —— 不改账号、不碰游戏进程。
>
> **普通用户**：请到 [Releases](../../releases) 下载安装器（`.exe`），双击即用 —— **不需要源码、不需要 Python**。
>
> 本仓库是**源码**，面向想自己构建、修改或阅读实现的人。
>
> ⚠️ **本版（纯净版）不含任何游戏内资源替换 / DLL 注入功能**，
> 因此也不包含任何注入工具链。

---

## 1. 它做什么

| 模块 | 说明 |
|---|---|
| **藏品解锁显示** | 让藏品页把英雄 / 皮肤 / 守卫 / 终结特效按"全部已拥有"呈现（**纯前端显示**，账号里一个字节都不动） |
| **战绩查询** | 输入「名称#尾标」查全区服战绩；对局详情、单局数据、队友/对手速查 |
| **身份标识本地替换** | 头像框 / 头衔 / 勋章档位 / 冠军杯赛旗帜 / 等级 / 荣誉纹章 —— 全部**只改本机渲染** |
| **对局增强** | 对局记录显示替换、赛后数据增强等 |
| **界面精简** | 隐藏第三方插件入口、启动提示框等噪音 |
| **自定义名称** | 炫彩名后缀、召唤师名显示 |

## 2. 它**不**做什么（重要，别误会）

- ❌ **不修改账号数据**。唯一的例外是「生涯背景」—— 那是你**主动点**才会写，
  界面上有明确提示；其余一律只读。
- ❌ **不注入游戏进程、不改游戏内存**。
- ❌ **不驱动客户端 UI**（不做合成点击去"替你选"什么东西）。
- ❌ 不含任何换肤 / 注入 / 反作弊绕过相关代码或工具。

上面的每一条都是**刻意的产品边界**，不是"还没做"。

## 3. 架构

```
┌─────────────────────────── 客户端（CEF 渲染）───────────────────────────┐
│  Pengu Loader 插件宿主                                                  │
│    plugin/  engine/  chromaname/  loadinglogo/  lootsim/  lootrec/     │
│    selfname/                                                            │
│      │  改 DOM / 注入 CSS / 拦截渲染                                    │
└──────┼──────────────────────────────────────────────────────────────────┘
       │ HTTP（127.0.0.1:17888，仅本机）
┌──────▼─────────────────────────────────────────────────────────────────┐
│  本机后端  server.py + prism_inject/                                     │
│    · 代理 LCU（拿真实数据、代取外站图、缩放缓存）                          │
│    · 纯计算（中文名表、皮肤 id 编解码、SGP 战绩协议、对局数据整形）          │
│    · 静态素材出口（/asset/*）                                            │
└──────┬─────────────────────────────────────────────────────────────────┘
       │ LCU（客户端自带的本机 HTTPS API）
┌──────▼─────────────────────────────────────────────────────────────────┐
│  英雄联盟客户端                                                          │
└────────────────────────────────────────────────────────────────────────┘
```

- **后端不可外联**：只监听 `127.0.0.1`，无窗口、无托盘。
- **凭据不信 `lockfile`**：LCU 端口会变（`lockfile` 常常是过时的），
  实际从**最新一份 `*LeagueClientUx.log`** 里提凭据 —— 见 `prism_inject/lcu.py`。

## 4. 前置依赖

| 需要 | 说明 |
|---|---|
| **Pengu Loader 1.1.6+** | 插件宿主 |
| Windows 10 / 11 | |
| **构建用**：Python 3.13+ · Node 22+ · [Inno Setup 6](https://jrsoftware.org/isinfo.php) | 只在你自己打包时需要 |

> 插件必须躺在 Pengu Loader 的 `plugins\` 目录下（Pengu 按**自己 exe 所在目录**算 `plugins_dir`，不可配置）。

## 5. 目录结构

### 后端

| 路径 | 用途 |
|---|---|
| `server.py` | 本机后端主程序：HTTP 路由 + CORS + 静态素材出口 |
| `prism_inject/` | 后端核心模块（纯标准库，零第三方依赖） |
| ├ `paths.py` | 「家」与游戏路径解析（`PRISM_HOME` → exe 自定位 → 注册表 → 兜底） |
| ├ `lcu.py` | LCU 连接层（凭据读**最新一份** `*LeagueClientUx.log`，不信 `lockfile`） |
| ├ `names.py` | 官方中文名索引（英雄 / 皮肤 / 炫彩） |
| ├ `query.py` | 全区服战绩查询（SGP 直连） |
| ├ `cz_source.py` | 国服战绩站点通道（`chazhanji` 取数层） |
| ├ `cz_cred.py` | 站点凭据的加密落盘（Windows DPAPI） |
| ├ `mh_forge.py` | 对局记录：单局数据 → 客户端 `/lol-match-history` 的响应形状 |
| ├ `pengu.py` | Pengu Loader 的激活 / 检测（写 IFEO，官方 1.1.6 的做法） |
| ├ `installer.py` | 安装器后置动作（`prism-server.exe --post-install` / `--detect-game`） |
| ├ `uninstall.py` | 卸载钩子 |
| └ `transfer_pack.py` | 换机包清单（打包脚本与安装器共用，避免两边漂移） |

### Pengu 插件（一个目录 = 一个插件，分别部署到 `plugins\`）

| 目录 | 部署名 | 用途 |
|---|---|---|
| `plugin/` | PRISM-Store | **主插件**：大厅设置面板（仓库里最大的一块） |
| `engine/` | PRISM-Engine | 界面增强引擎：显示层改写与数据复刻 |
| `chromaname/` | PRISM-ChromaName | 选人界面炫彩色名补全 |
| `loadinglogo/` | PRISM-Loading | 客户端 loading 页标识替换 |
| `selfname/` | SELFNAME | 本机召唤师名 / 标签显示替换 |
| `lootsim/` | LOOTSIM | 战利品「模拟开箱」 |
| `lootrec/` | LOOTREC | 开箱「旁听录制器」 |
| `fe/lol-shared-components/` | —（共享素材） | 成就纹章 / 旗幡等图片素材 |

### 安装与部署

| 文件 | 用途 |
|---|---|
| `transfer_install.py` | 换机一键安装器（打包成 exe 随包分发） |
| `launcher.py` | 启动器：整套运行环境随客户端会话起落（打包成安装目录里的 `PRISM.exe`） |
| `deploy_plugins.py` | 把插件源码铺到「家」的两个 `plugins` 目录 |
| `pause_prism.py` | 本机环境的暂停 / 恢复（测新安装器时用） |
| `refresh_lcu_lockfile.py` | 合成 LCU `lockfile`（腾讯客户端自己不写它）—— `lcu-lockfile-watch.exe` 的源码 |

### 开发工具（`tools_*.py`，都不是运行必需品）

| 文件 | 用途 |
|---|---|
| `tools_wait_reload.py` | 重启客户端 UX 并等新插件真的跑起来（改完前端用） |
| `tools_lint_css_ticks.py` | **CSS 反引号闸门** —— 改完主插件必跑 |
| `tools_diag.py` | 读后端诊断日志并按事件关键字过滤 |
| `tools_lcu.py` | 直接打 LCU（只读） |
| `tools_plugin_toggle.py` | 可逆地停用 / 启用某个 Pengu 插件 |
| `tools_cz_cred.py` | 管理国服战绩站点凭据（加密落盘） |


| 文件 | 用途 |
|---|---|

### 打包与仓库文件

| 路径 | 用途 |
|---|---|
| `build/prism-server.spec` | 后端 PyInstaller spec（**由构建脚本生成，别手改**） |
| `build_exe/prism.ico` | 后端 exe 图标 |
| `build_exe/PRISM-launcher.spec` | 启动器 exe 的 PyInstaller spec |
| `build_exe/lcu-lockfile-watch.spec` | lockfile 合成 exe 的 PyInstaller spec |
| `build_exe/inno/PRISM.iss` | Inno 安装脚本（换机包） |
| `build_exe/inno/PRISM-Pure.iss` | Inno 安装脚本（纯净版） |
| `build_exe/inno/ChineseSimplified.isl` | Inno Setup 官方简体中文语言包 |
| `.gitattributes` / `.gitignore` | 行尾规则 / 忽略规则 |
| `LICENSE` | MIT |

## 6. 构建

### 6.1 后端 exe（PyInstaller，onedir）

```bash
python -m PyInstaller build/prism-server.spec \
    --distpath build/dist --workpath build/work --noconfirm
```

> ⚠️ `hiddenimports` 里那串 `prism_inject.*` 是**必须的**：`server.py` 用 `importlib`
> **动态**导入子模块，PyInstaller 的静态分析看不见 ⇒ 漏一个就是"跑起来才
> `ModuleNotFoundError`"。`paths.py` 依赖的 `configparser` 也得显式登记。

产物是 **onedir**（不是 onefile）：解包到 `<家>\_int_server\`，启动更快，且所有产物都落在"家"目录里。

### 6.2 另外两个 exe

`build_exe/PRISM-launcher.spec`、`build_exe/lcu-lockfile-watch.spec` 同理。

### 6.3 安装包（Inno Setup）

```bash
ISCC.exe build_exe/inno/PRISM.iss
```

## 7. 开发

### 7.1 插件热重载

改完插件源码，重启客户端即可让 Pengu 重新加载：

```bash
python tools_wait_reload.py --restart
```

> 它会调 LCU 的 `POST /riotclient/kill-and-restart-ux`。**注意**：该请求要带 LCU 凭据，
> 而 `lockfile` 里的端口可能已经过时 —— 用 `prism_inject/lcu.py` 的 `credentials()`
> 拿最新的 `(port, password)`。

### 7.2 CSS 闸门（改完必跑）

主插件的 CSS 写在 JS 模板串里，反引号一旦没闭合就会把后面整段代码"吃掉"，
而 `node --check` **不一定报错**。所以改完必须跑：

```bash
python tools_lint_css_ticks.py
```

> 退出码非 0 就是没过。**别接管道、别用 `;`** —— 那样退出码会丢。

### 7.3 其它常用工具

| 脚本 | 用途 |
|---|---|
| `tools_diag.py` | 读插件回传的诊断日志 |
| `tools_lcu.py` | 直接打 LCU（只读） |
| `tools_plugin_toggle.py` | 开/关某个插件 |
| `pause_prism.py` | 暂停 / 恢复后端 |
| `deploy_plugins.py` | 把插件铺到 Pengu 目录 |

## 8. 免责声明

- 本项目仅供**学习与研究**使用。
- 请自行确认你的使用方式符合游戏的用户协议与当地法律法规。
- 作者不对使用本项目产生的任何后果负责。

## 9. License

[MIT](LICENSE)
