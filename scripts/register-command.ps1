$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$CliPath = Join-Path $ProjectRoot "src\cli.js"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Please install Node.js first."
}

$profileDir = Split-Path -Parent $PROFILE
if (-not (Test-Path $profileDir)) {
  New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
}
if (-not (Test-Path $PROFILE)) {
  New-Item -ItemType File -Force -Path $PROFILE | Out-Null
}

$functionBlock = @"

# Codex Recovery command
function codex-recovery {
  node "$CliPath" @args
}
"@

$rawProfileContent = Get-Content -LiteralPath $PROFILE -Raw
if ($null -eq $rawProfileContent) {
  $profileContent = ""
} else {
  $profileContent = [string]$rawProfileContent
}
if (-not $profileContent.Contains("function codex-recovery")) {
  Add-Content -LiteralPath $PROFILE -Value $functionBlock
  Write-Host "Updated PowerShell Profile: $PROFILE"
} else {
  Write-Host "PowerShell Profile already contains codex-recovery."
}

Write-Host "Restart PowerShell, or run: . `$PROFILE"
