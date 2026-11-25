param(
  # Chay dev server (hot reload) thay vi build + chay ban production.
  [switch]$Dev,
  # Cac tham so con lai duoc chuyen tiep cho server (hoac cho "vp run dev" khi dung -Dev).
  [Parameter(ValueFromRemainingArguments)]
  [string[]]$PassThru
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Nap .env (KEY=VALUE). .env ghi de bien co san: bien nap lan truoc con lai trong cua so
# PowerShell (va terminal trong T3 Code ke thua T3CODE_*) se che mat gia tri moi.
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $key = $Matches[1]
      $value = $Matches[2].Trim('"', "'")
      [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
  }
}

# Data dir riêng (~/.t4/userdata), tránh đụng ~/.t3/userdata. Có thể override bằng biến môi trường.
if (-not $env:T3CODE_HOME) { $env:T3CODE_HOME = Join-Path $env:USERPROFILE '.t4' }

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

function Invoke-Step {
  param([scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

try {
  if (-not (Get-Command vp -ErrorAction SilentlyContinue)) {
    Write-Host '[start] Khong tim thay "vp". Dang cai Vite+...'
    Invoke-RestMethod https://vite.plus/ps1 | Invoke-Expression
    Update-SessionPath
    $vpBin = Join-Path $env:USERPROFILE '.vite-plus\bin'
    if (-not (Get-Command vp -ErrorAction SilentlyContinue) -and (Test-Path $vpBin)) {
      $env:Path = "$vpBin;$env:Path"
    }
    if (-not (Get-Command vp -ErrorAction SilentlyContinue)) {
      throw 'Da cai Vite+ nhung van khong tim thay "vp". Mo lai terminal roi chay lai.'
    }
  }

  if (-not (Test-Path node_modules)) {
    Write-Host '[start] Cai dependencies...'
    Invoke-Step { vp i }
  }

  if ($Dev) {
    Write-Host '[start] Starting dev server (vp run dev)...'
    & vp run dev @PassThru
    exit $LASTEXITCODE
  }

  Write-Host '[start] Building web (apps/web)...'
  Invoke-Step { vp run --filter '@t3tools/web' build }

  Write-Host '[start] Building server and bundling web client (apps/server)...'
  Push-Location apps\server
  try {
    Invoke-Step { node scripts\cli.ts build }

    Write-Host '[start] Starting server on localhost...'
    & node dist\bin.mjs @PassThru
    exit $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}
catch {
  Write-Host "[start] $($_.Exception.Message)"
  Write-Host '[start] Build failed.'
  exit 1
}
