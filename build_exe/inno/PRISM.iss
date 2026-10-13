; PRISM 安装程序（Inno Setup 6.7+）
; ---------------------------------------------------------------------------
; 编译：
;   ISCC.exe build_exe\inno\PRISM.iss
; 产物：
;   dist_transfer\PRISM-换机包\PRISM 完整版.exe
;
; 设计要点（对应换机 8 问题）：
;   ① 目录页用 Inno **内置**的那张（默认值 = 非系统盘第一个盘根下的 PRISM）⇒ 用户可改任意位置
;   ② 语言：简体中文（语言包在 Inno 安装目录 + 本工程 build_exe\inno\ 各一份）
;   ③ 铺文件全部交给 Inno 的 [Files]（payload 里就是"家"的全部内容）
;   ④ 检测机器上**已有的 Pengu** → 问用户"搬插件 / 直接关停"（Pascal 里问，搬运交给 Python）
;   ⑤ 卸载：先跑 --uninstall-hooks（★ 还原 IFEO，不然客户端起不来），再删文件
;   ⑥ 图标：SetupIconFile + UninstallDisplayIcon 都用 prism.ico
;   ⑦ 高级：x64 / Win10+；不写开机自启（后端随启动器启停，刻意不留自启项）
; ---------------------------------------------------------------------------

#define MyAppName "PRISM"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "罔生"
#define SrcPayload "..\..\dist_transfer\_payload_staging"

[Setup]
AppId={{7C4E9A31-5B2D-4F18-9E77-3A6D0C1B8F42}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={code:GetDefaultDir}
DisableDirPage=no
DisableProgramGroupPage=yes
AllowNoIcons=yes
OutputDir=..\..\dist_transfer\PRISM-换机包
OutputBaseFilename=PRISM 完整版
SetupIconFile=..\prism.ico
UninstallDisplayIcon={app}\assets\prism.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
ShowLanguageDialog=no
UsePreviousLanguage=no
Uninstallable=yes
CreateUninstallRegKey=yes

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务："

[Files]
Source: "{#SrcPayload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\PRISM"; Filename: "{app}\PRISM.exe"; IconFilename: "{app}\assets\prism.ico"; Comment: "PRISM（先启动它，再开客户端）"; Tasks: desktopicon

[Registry]
; ★ 用 HKA（HKEY_AUTO）：管理员安装模式 ⇒ 落到 HKLM；标准用户 ⇒ 落到 HKCU。
;   只写一个 hive 就够主体能跑了；另一边的兜底由 `prism-server.exe --post-install`
;   补写 HKCU（保证"管理员凭据 + 日常标准账户"这种组合下也找得到家）。
Root: HKA; Subkey: "Software\PRISM"; ValueType: string; ValueName: "Home"; ValueData: "{app}"; Flags: uninsdeletekeyifempty

[Run]
; ★ 安装后置动作：写 paths.json、备份并激活 Pengu、（按用户选择）搬运原插件
Filename: "{app}\prism-server.exe"; Parameters: "--post-install --root ""{code:GetGameDir}""{code:GetAdoptArg}"; StatusMsg: "正在配置 PRISM（注入器 / 路径）…"; Flags: runhidden waituntilterminated
Filename: "{app}\PRISM.exe"; Description: "立即启动 PRISM"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; ★ 必须在删文件**之前**跑：还原 IFEO + 清注册表 + 停进程（不还原 ⇒ 客户端起不来）
Filename: "{app}\prism-server.exe"; Parameters: "--uninstall-hooks{code:GetCleanArg}"; RunOnceId: "PrismUninstallHooks"; Flags: runhidden waituntilterminated skipifdoesntexist

[UninstallDelete]
Type: filesandordirs; Name: "{app}\uninstall"
Type: filesandordirs; Name: "{app}\wadextract"
Type: filesandordirs; Name: "{app}\build"
Type: filesandordirs; Name: "{app}\tmp"
Type: filesandordirs; Name: "{app}\inject"
Type: filesandordirs; Name: "{app}\augicons"
Type: filesandordirs; Name: "{app}\_repair"
; ★ 这两个是**运行期才生成**的：Inno 不认识它们 ⇒ 不列就会残留
;   · pengu\datastore —— Pengu/Pengu 插件首次运行创建的配置容器
Type: filesandordirs; Name: "{app}\pengu\datastore"
Type: files; Name: "{app}\assets\*.log"
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\paths.json"

[Code]
var
  GamePage: TInputDirWizardPage;
  AdoptPlugins: Boolean;
  OtherPenguPlugins: String;
  CleanSkins: Boolean;

{ ── 默认安装目录：非系统盘第一个存在的盘根下的 PRISM ───────────────────── }
function GetDefaultDir(Param: String): String;
var
  d: String;
begin
  d := 'D:\';
  if DirExists(d) then begin Result := d + 'PRISM'; exit; end;
  d := 'E:\';
  if DirExists(d) then begin Result := d + 'PRISM'; exit; end;
  d := 'F:\';
  if DirExists(d) then begin Result := d + 'PRISM'; exit; end;
  Result := ExpandConstant('{userdocs}\PRISM');
end;

{ ── 游戏目录默认值：扫几个常见位置 ─────────────────────────────────────── }
function GetDefaultGameDir(Param: String): String;
var
  c: String;
begin
  c := 'E:\LoL';
  if DirExists(c + '\Game') then begin Result := c; exit; end;
  c := 'E:\WeGameApps\英雄联盟（含经典模式）';
  if DirExists(c + '\Game') then begin Result := c; exit; end;
  c := 'D:\WeGameApps\英雄联盟（含经典模式）';
  if DirExists(c + '\Game') then begin Result := c; exit; end;
  c := 'D:\LoL';
  if DirExists(c + '\Game') then begin Result := c; exit; end;
  c := ExpandConstant('{pf}\WeGameApps\英雄联盟（含经典模式）');
  if DirExists(c + '\Game') then begin Result := c; exit; end;
  Result := '';
end;

{ ── 检测机器上"别人家的 Pengu" ─────────────────────────────────────────── }
function DetectOtherPengu(out PluginsDir: String): Boolean;
var
  s: String;
begin
  Result := False;
  PluginsDir := '';
  { ① 机器上已经装过的 Pengu（官方安装器 / 便携版）—— 问用户要不要搬插件过来 }
  if FileExists(ExpandConstant('{localappdata}\Programs\Pengu Loader\core.dll')) then begin
    PluginsDir := ExpandConstant('{localappdata}\Programs\Pengu Loader\plugins');
    Result := True; exit;
  end;
  if FileExists(ExpandConstant('{localappdata}\Pengu Loader\core.dll')) then begin
    PluginsDir := ExpandConstant('{localappdata}\Pengu Loader\plugins');
    Result := True; exit;
  end;
  { ② IFEO 已被别人劫持（说明有 Pengu 在生效，只是不在常见位置） }
  if RegQueryStringValue(HKLM,
       'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\LeagueClientUx.exe',
       'Debugger', s) then begin
    if Pos('prism', LowerCase(s)) = 0 then begin
      Result := True;                       { 有劫持但不是我们 ⇒ 是别人的 }
    end;
  end;
end;

procedure InitializeWizard();
var
  desc: String;
begin
  desc := '选择「英雄联盟」安装根目录（里面能看到 Game 和 LeagueClient 两个文件夹）。';
  desc := desc + #13#10 + '如果选的是对局目录或客户端目录本身，PRISM 也能自动识别。';
  GamePage := CreateInputDirPage(wpSelectDir, '选择英雄联盟目录',
    'PRISM 需要知道游戏装在哪。', desc, False, '');
  GamePage.Add('');
  GamePage.Values[0] := GetDefaultGameDir('');
end;

function GetGameDir(Param: String): String;
begin
  Result := GamePage.Values[0];
end;

function GetAdoptArg(Param: String): String;
begin
  if AdoptPlugins and (OtherPenguPlugins <> '') then
    Result := ' --adopt-from "' + OtherPenguPlugins + '"'
  else
    Result := '';
end;

function GetCleanArg(Param: String): String;
begin
  if CleanSkins then Result := ' --clean-skins' else Result := '';
end;

{ ── 装之前：告知 + 让用户选（问题 4）──────────────────────────────────── }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  plugins: String;
  r: Integer;
begin
  Result := '';
  if not DetectOtherPengu(plugins) then exit;

  if plugins = '' then
    plugins := '(未找到它的插件目录)';
  OtherPenguPlugins := plugins;

  { 静默安装（/VERYSILENT，给自动化测试用）：不弹窗，默认**不搬**插件 }
  if WizardSilent then begin
    AdoptPlugins := False;
    exit;
  end;

  r := MsgBox('检测到本机已安装 Pengu Loader（第三方装的）。' + #13#10 +
              '它的插件目录：' + plugins + #13#10 + #13#10 +
              'PRISM 需要改用自带的 Pengu 注入器 —— 继续安装会停用它' + #13#10 +
              '（它的文件一个都不会删，只是不再生效）。' + #13#10 + #13#10 +
              '要不要把它原来的插件搬进 PRISM 一起用？' + #13#10 +
              '（说明：只搬第三方插件，我们自己的会被跳过；' + #13#10 +
              ' 插件配置不会跟着走，搬过去的插件需要重新设置一次；' + #13#10 +
              ' 如果两边功能重叠，可能出现界面冲突。）',
              mbConfirmation, MB_YESNOCANCEL);
  if r = IDCANCEL then begin
    Result := '已被用户取消';
    exit;
  end;
  AdoptPlugins := (r = IDYES);
end;

{ ── 卸之前：问要不要一起删皮肤库 / 哈希字典（问题 7）──────────────────── }
function InitializeUninstall(): Boolean;
var
  r: Integer;
begin
  Result := True;
  { 静默卸载：默认**保留**皮肤库（安全默认；自动测试也不弹窗） }
  if UninstallSilent then begin
    CleanSkins := False;
    exit;
  end;
  r := MsgBox('是否一并删除皮肤库与哈希字典？' + #13#10 + #13#10 +
              '· 选「是」：全部删掉（省空间；下次重装需要重新现造 / 重新下载，各几百 MB）' + #13#10 +
              '· 选「否」：保留这两样（下次重装立刻可用）',
              mbConfirmation, MB_YESNO);
  CleanSkins := (r = IDYES);
end;
