param (
  [switch]$TestMode
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host ""
  Write-Host "ERROR: $message" -ForegroundColor Red
  exit 1
}

function Info($message) {
  Write-Host $message -ForegroundColor Cyan
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Info "Antigravity RTL Toolkit"
Write-Host ""

$port = if ($env:ANTIGRAVITY_RTL_PORT) { $env:ANTIGRAVITY_RTL_PORT } else { "9230" }
$userDataDir = $null

if ($TestMode) {
  $port = "9224"
  $userDataDir = "C:\Users\Amr\AppData\Roaming\AntigravityRTLTest"
  Info "Running in TEST MODE on port $port with custom user data directory..."
} else {
  $running = Get-Process -Name Antigravity -ErrorAction SilentlyContinue
  $runningLS = Get-Process -Name language_server -ErrorAction SilentlyContinue
  if ($running -or $runningLS) {
    Write-Host "Antigravity is running. Closing it before enabling the RTL fix..." -ForegroundColor Yellow
    Stop-Process -Name Antigravity -Force -ErrorAction SilentlyContinue
    Stop-Process -Name language_server -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    if (Get-Process -Name Antigravity -ErrorAction SilentlyContinue) {
      # Fallback to forceful taskkill with tree kill
      taskkill.exe /F /IM Antigravity.exe /T > $null 2>&1
      taskkill.exe /F /IM language_server.exe /T > $null 2>&1
      Start-Sleep -Seconds 2
    }

    if (Get-Process -Name Antigravity -ErrorAction SilentlyContinue) {
      Fail "Antigravity could not be closed. End its processes in Task Manager, then try again."
    }
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Fail "Node.js was not found. Install Node.js 20+ from https://nodejs.org/ and try again."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  Fail "npm was not found. Reinstall Node.js with npm enabled."
}

if (-not (Test-Path (Join-Path $root "node_modules\ws"))) {
  Info "Installing dependencies. This only runs the first time..."
  npm.cmd ci --ignore-scripts
}

Info "Starting Antigravity Desktop with localhost-only DevTools..."
$launchArgs = @{ Port = $port }
if ($userDataDir) {
  $launchArgs["UserDataDir"] = $userDataDir
}
& (Join-Path $PSScriptRoot "Launch-AntigravityRTL.ps1") @launchArgs

Info "Waiting for Antigravity to open..."
Start-Sleep -Seconds 6

Info "Injecting RTL fix..."
$env:ANTIGRAVITY_RTL_PORT = $port
node desktop/inject.mjs

Write-Host ""
Write-Host "Done. Keep this Antigravity window open and use it normally." -ForegroundColor Green
Write-Host "If Antigravity reloads or restarts, run Run-AntigravityRTL.cmd again."
