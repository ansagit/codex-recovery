# 恢复入口

## 任务中断后

```powershell
cd D:\Codex\Windows\workspace; codex-recovery resume
```

## 平时开始工作

```powershell
cd D:\Codex\Windows\workspace; codex
```

## 系统重装 / 换电脑后

```powershell
iwr https://raw.githubusercontent.com/ansagit/codex-recovery/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

这个地址已经使用 GitHub 用户名 `ansagit`。
