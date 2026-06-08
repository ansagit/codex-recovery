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
iwr https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/codex-recovery/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

把 `YOUR_GITHUB_USERNAME` 换成你的 GitHub 用户名。

