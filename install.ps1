$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Codex Recovery 安装 / 恢复入口" -ForegroundColor Cyan
Write-Host ""

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq "Core") {
  Write-Host "当前不是 Windows 环境。第一版只支持 Windows。" -ForegroundColor Yellow
  exit 1
}

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

$checks = @(
  @{ Name = "Git"; Command = "git" },
  @{ Name = "Node.js"; Command = "node" },
  @{ Name = "npm"; Command = "npm" },
  @{ Name = "VS Code"; Command = "code" },
  @{ Name = "Codex CLI"; Command = "codex" }
)

$missing = @()
foreach ($check in $checks) {
  if (Test-CommandExists $check.Command) {
    Write-Host "[OK] $($check.Name)"
  } else {
    Write-Host "[缺失] $($check.Name)" -ForegroundColor Yellow
    $missing += $check.Name
  }
}

Write-Host ""
Write-Host "恢复计划：" -ForegroundColor Cyan
Write-Host "1. 检查基础工具是否安装。"
Write-Host "2. 准备安装或更新 codex-recovery。"
Write-Host "3. 之后读取 Supabase 备份并生成正式恢复计划。"
Write-Host "4. 第一版不会静默安装或覆盖配置。"

if ($missing.Count -gt 0) {
  Write-Host ""
  Write-Host "缺失工具：" -ForegroundColor Yellow
  $missing | ForEach-Object { Write-Host "- $_" }
}

Write-Host ""
$confirm = Read-Host "是否继续准备本机恢复环境？输入 y 继续"
if ($confirm -ne "y") {
  Write-Host "已取消。"
  exit 0
}

Write-Host ""
Write-Host "下一步：请在 codex-recovery 仓库目录运行 npm link，或按 README 说明安装。" -ForegroundColor Cyan
Write-Host "Supabase 云端恢复将在配置项目 URL 和 token 后启用。"

