# Codex Recovery

个人 Codex 工作恢复工具。第一阶段只做 Windows CLI 最小版本。

它只解决两个问题：

1. Codex 任务中断后，快速回到上一个任务断点。
2. 系统重装或换新电脑后，快速恢复 Codex 工作环境。

它不是 Dashboard，不是实时监控系统，也不做跨 CLI 同步。

## 你只需要记住 3 条命令

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
iwr https://raw.githubusercontent.com/ansagit/codex-recovery/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

## 内部命令

这些命令主要给工具和 Codex 使用，你不需要记：

```powershell
codex-recovery snapshot
codex-recovery backup
codex-recovery checkpoint
codex-recovery last
codex-recovery restore-plan
codex-recovery restore
codex-recovery clean
```

运行时数据会保存在 `.codex-recovery/`，这个目录只用于本地恢复，默认不会提交到 Git。

Supabase 凭据保存在用户目录：

```text
%USERPROFILE%\.codex-recovery\supabase.json
```

这个文件只保存在本机，不提交到 Git。

## 第一版边界

- 默认不上传完整聊天记录
- 默认不上传完整终端输出
- 不做远程控制
- 不做 Codex App
- 不静默安装或覆盖配置
- 恢复前必须显示计划

## Supabase

第一版使用 Supabase 保存设备、备份和任务断点。先在 Supabase SQL Editor 运行：

```text
docs/supabase_schema.sql
```

然后在本机运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-supabase.ps1
```

后续 `codex-recovery backup` 会自动上传；没有配置 Supabase 时只保存到本地。
