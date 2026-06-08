$ErrorActionPreference = "Stop"

$configDir = Join-Path $env:USERPROFILE ".codex-recovery"
$configFile = Join-Path $configDir "supabase.json"

if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
}

$url = Read-Host "Paste Supabase project URL"
$secureKey = Read-Host "Paste Supabase service_role key" -AsSecureString
$plainKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
)

try {
  $config = @{
    url = $url.TrimEnd("/")
    key = $plainKey
    created_at = (Get-Date).ToUniversalTime().ToString("o")
  }

  $config | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
  Write-Host "Supabase config saved: $configFile"
  Write-Host "The key is stored locally only. Do not commit this file."
} finally {
  Remove-Variable plainKey -ErrorAction SilentlyContinue
  Remove-Variable secureKey -ErrorAction SilentlyContinue
}
