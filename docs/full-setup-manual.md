# Codex Recovery 完整搭建操作手册

适用场景：以后在新电脑上，用新的 ChatGPT / GitHub / Supabase 账号，重新搭建同样的 Codex Recovery 项目。

核心原则：用户只记 3 条命令，复杂流程由工具和 Codex 完成。

## 1. 推荐保存格式

建议同时保存 3 种文件：

1. `full-setup-manual.md`
   - 主手册。
   - 适合放 GitHub 仓库。
   - GitHub 网页可以直接阅读。
   - 命令复制方便。

2. `codex_recovery_full_setup_manual.txt`
   - 备用纯文本。
   - 系统重装后不用安装任何软件也能打开。
   - 建议复制到移动硬盘、云盘、备用电脑。

3. `codex_recovery_commands.txt`
   - 极简命令便签。
   - 日常只看这个文件。

不建议只保存 Word 文档。Word 适合打印，但不适合快速复制命令，也不适合 GitHub 维护。

## 2. 最终你只需要记住 3 条命令

平时开始工作：

```powershell
cd D:\Codex\Windows\workspace; codex
```

任务中断后恢复：

```powershell
cd D:\Codex\Windows\workspace; codex-recovery resume
```

系统重装 / 换电脑恢复：

```powershell
iwr https://raw.githubusercontent.com/GITHUB_USERNAME/codex-recovery/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

把 `GITHUB_USERNAME` 换成实际 GitHub 用户名。

## 3. 新账号需要准备什么

需要 3 个账号：

1. ChatGPT / Codex 账号
2. GitHub 账号
3. Supabase 账号

不要把任何 token、key、密码发到聊天里。需要粘贴密钥时，只在自己的 PowerShell 或网站页面里操作。

## 4. 新电脑基础目录

建议固定使用：

```text
D:\Codex\Windows\workspace
D:\Codex\RecoveryNotes
```

其中：

- `D:\Codex\Windows\workspace`：项目工作区。
- `D:\Codex\RecoveryNotes`：保存极简命令和操作手册。

## 5. 安装基础工具

新电脑至少需要：

1. Git
2. Node.js
3. VS Code
4. GitHub CLI，命令是 `gh`
5. Codex CLI

验证命令：

```powershell
git --version
node --version
npm --version
code --version
gh --version
codex --version
```

如果某个命令不存在，先安装对应工具。

## 6. 创建 GitHub Token 并登录 gh

如果 `gh auth login` 浏览器登录失败，可以用 token 登录。

GitHub token 建议使用 classic token，备注：

```text
codex-recovery-windows-cli-2026
```

权限勾选：

```text
repo
workflow
read:org
```

PowerShell 登录：

```powershell
$token = Read-Host "Paste GitHub token"
$token | gh auth login --with-token
Remove-Variable token
gh auth status
```

成功时会看到：

```text
Logged in to github.com account ...
Token scopes: 'read:org', 'repo', 'workflow'
```

## 7. 创建 codex-recovery 项目

在本地创建项目：

```powershell
cd D:\Codex\Windows\workspace
mkdir codex-recovery
cd codex-recovery
git init
```

设置本仓库 Git 身份：

```powershell
git config user.name "YOUR_GIT_NAME"
git config user.email "YOUR_EMAIL"
```

不要必须设置全局 Git 身份。只设置当前仓库更安全。

## 8. 项目目录结构

第一阶段推荐结构：

```text
codex-recovery/
  README.md
  RESTORE.md
  install.ps1
  package.json
  .gitignore
  src/
    cli.js
  scripts/
    register-command.ps1
    configure-supabase.ps1
  docs/
    codex_recovery_commands.txt
    windows-cli-guide.txt
    supabase_schema.sql
    full-setup-manual.md
  templates/
    restore-plan.md
```

运行数据目录：

```text
codex-recovery/.codex-recovery/
```

这个目录必须加入 `.gitignore`，不要提交到 GitHub。

Supabase 密钥配置文件：

```text
C:\Users\USERNAME\.codex-recovery\supabase.json
```

这个文件只保存在本机，不要提交。

## 9. 注册 codex-recovery 命令

项目里应有脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-command.ps1
```

作用：把 `codex-recovery` 函数写入 PowerShell Profile。

注册后重新打开 PowerShell，验证：

```powershell
codex-recovery help
```

应显示 3 条核心命令。

## 10. 创建 GitHub 仓库并推送

创建公开仓库：

```powershell
gh repo create GITHUB_USERNAME/codex-recovery --public --source . --remote origin --push
```

如果自动推送失败，可以分步：

```powershell
git branch -M main
git remote add origin https://github.com/GITHUB_USERNAME/codex-recovery.git
git push -u origin main
```

公开仓库的原因：新电脑可以直接下载 `install.ps1`。

不要把 Supabase key、备份 JSON、`.codex-recovery/` 提交到 GitHub。

## 11. 修改恢复命令里的 GitHub 用户名

需要把以下文件里的 `GITHUB_USERNAME` 替换成真实用户名：

```text
README.md
RESTORE.md
src/cli.js
docs/codex_recovery_commands.txt
docs/windows-cli-guide.txt
```

最终系统重装命令应该类似：

```powershell
iwr https://raw.githubusercontent.com/ansagit/codex-recovery/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

## 12. 创建 Supabase 项目

打开 Supabase，点击：

```text
New project
```

建议：

```text
Project name: codex-recovery
Region: Southeast Asia (Singapore)
```

中国大陆使用，Singapore 通常比欧美节点更合适。

Database password 用强密码，自己保存，不要发给任何人。

创建完成后，项目主页会显示 Project URL，例如：

```text
https://xxxx.supabase.co
```

配置时不要带 `/rest/v1/`。

## 13. 创建 Supabase 数据表

打开 Supabase 项目：

```text
SQL Editor
```

新建 query，把下面文件的全部内容复制进去：

```text
docs/supabase_schema.sql
```

点击：

```text
Run
```

成功后结果区域显示：

```text
Success. No rows returned
```

然后到：

```text
Table Editor
```

确认出现 3 张表：

```text
devices
backups
checkpoints
```

如果没有出现，说明 SQL 没有执行成功。

## 14. 查找 Supabase URL 和 Secret Key

Supabase 左侧点击：

```text
Settings -> API Keys
```

复制：

```text
Project URL
Secret keys -> default
```

注意：

- 新版 Supabase 里可能叫 `Secret keys`。
- 旧版可能叫 `service_role key`。
- 不要复制 `Publishable key`。
- 不要复制 `anon public`。
- 不要把 secret key 发到聊天里。

配置脚本需要：

```text
Project URL: https://xxxx.supabase.co
Secret key: sb_secret_...
```

## 15. 保存 Supabase 配置到本机

在 PowerShell 运行：

```powershell
cd D:\Codex\Windows\workspace\codex-recovery
powershell -ExecutionPolicy Bypass -File .\scripts\configure-supabase.ps1
```

它会提示：

```text
Paste Supabase project URL
Paste Supabase service_role key
```

第一项粘贴 Project URL：

```text
https://xxxx.supabase.co
```

第二项粘贴 Secret key。

成功后会显示：

```text
Supabase config saved: C:\Users\USERNAME\.codex-recovery\supabase.json
```

验证：

```powershell
codex-recovery supabase-status
```

成功时显示：

```text
Supabase 已配置。
密钥：已隐藏
```

## 16. 第一次备份

运行：

```powershell
cd D:\Codex\Windows\workspace\codex-recovery
codex-recovery backup
```

成功时显示：

```text
本地环境清单已保存：...
本地备份包已保存：...
备份已上传到 Supabase。
```

Supabase 里应出现：

```text
devices: 1
backups: 1
```

## 17. 保存第一次任务断点

运行：

```powershell
codex-recovery checkpoint "Codex Recovery 初始搭建完成"
```

成功时显示：

```text
任务断点已保存：...
恢复说明已生成：...
任务断点已上传到 Supabase。
```

Supabase 里应出现：

```text
checkpoints: 1
```

## 18. 测试恢复计划

运行：

```powershell
codex-recovery restore-plan
```

成功时生成：

```text
.codex-recovery\restore-plan.md
```

这个文件会列出：

- 当前机器
- Supabase 云端旧设备
- 最近备份
- 最近任务断点
- 本地任务断点

## 19. 日常使用

平时只用：

```powershell
cd D:\Codex\Windows\workspace; codex
```

断网、中断、PowerShell 关闭后：

```powershell
cd D:\Codex\Windows\workspace; codex-recovery resume
```

做完重要阶段、安装新工具、改配置后，可以让 Codex 帮你运行：

```powershell
codex-recovery backup
```

这条命令你不需要日常记住，由 Codex 代劳即可。

## 20. 换新电脑恢复流程

新电脑联网后，PowerShell 运行：

```powershell
iwr https://raw.githubusercontent.com/GITHUB_USERNAME/codex-recovery/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

恢复脚本应该：

1. 检查 Git、Node.js、VS Code、Codex CLI 是否安装。
2. 安装或下载 codex-recovery。
3. 让用户输入 Supabase URL 和 Secret key。
4. 读取旧设备备份。
5. 生成恢复计划。
6. 用户确认后再恢复配置。

不要让脚本静默安装所有东西。必须先显示计划，再确认。

## 21. 垃圾文件控制

不应提交：

```text
node_modules/
.codex-recovery/
supabase.json
*.log
```

清理旧快照和备份：

```powershell
codex-recovery clean
```

默认只保留最近 5 个快照和备份。

## 22. 常见问题

### GitHub gh auth login 失败

使用 token 登录：

```powershell
$token = Read-Host "Paste GitHub token"
$token | gh auth login --with-token
Remove-Variable token
gh auth status
```

Token 权限必须包括：

```text
repo
workflow
read:org
```

### Supabase 找不到 service_role

新版 Supabase 可能显示为：

```text
Secret keys -> default
```

复制 `sb_secret_...`。

不要复制：

```text
Publishable key
anon public
```

### SQL Editor 粘贴混乱

不用保存 query。

只要 SQL 成功执行，Table Editor 出现：

```text
devices
backups
checkpoints
```

就完成了。

### codex-recovery 显示 Supabase 未配置

检查：

```text
C:\Users\USERNAME\.codex-recovery\supabase.json
```

再运行：

```powershell
codex-recovery supabase-status
```

### Git 出现 lock 文件

如果是当前操作刚产生的 `.git\index.lock` 或 `.git\config.lock`，确认没有 Git 命令正在运行后可以删除。

不要删除不确定来源的文件。

## 23. 安全规则

永远不要上传或公开：

```text
Supabase secret key
GitHub token
OpenAI API key
.env
SSH key
cookie
credentials
```

默认只上传环境清单、配置摘要、任务断点和备份 JSON。

如果以后要上传完整终端输出或完整聊天记录，必须单独确认。

## 24. 最终验收标准

完整搭建成功后，应满足：

1. GitHub 仓库存在并公开。
2. `install.ps1` 可以通过 raw.githubusercontent.com 下载。
3. PowerShell 能运行 `codex-recovery help`。
4. Supabase 有 `devices`、`backups`、`checkpoints` 三张表。
5. `codex-recovery backup` 能上传成功。
6. `codex-recovery checkpoint` 能上传成功。
7. `codex-recovery resume` 能显示本地断点。
8. `codex-recovery restore-plan` 能读取云端记录。
9. 用户日常只需要记 3 条命令。

