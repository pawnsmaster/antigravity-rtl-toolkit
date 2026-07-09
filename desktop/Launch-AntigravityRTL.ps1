param (
  [string]$Port = "9230",
  [string]$UserDataDir = $null
)

$ErrorActionPreference = "Stop"

if (-not ($Port -match '^\d+$') -or [int]$Port -lt 1024 -or [int]$Port -gt 65535) {
  Write-Error "Port must be an integer between 1024 and 65535."
}

$exe = Join-Path $env:LOCALAPPDATA "Programs\antigravity\Antigravity.exe"

if (-not (Test-Path $exe)) {
  Write-Error "Could not find Antigravity.exe at $exe"
}

# If not in test mode (no custom UserDataDir), make sure main Antigravity isn't running
if (-not $UserDataDir) {
  $running = Get-Process -Name Antigravity -ErrorAction SilentlyContinue
  if ($running) {
    Write-Error "Antigravity is already running. Close it first, then run this launcher again so the debugging port is enabled."
  }
}

$argsString = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$Port"
if ($UserDataDir) {
  $argsString += " --user-data-dir=`"$UserDataDir`""
}
$fullCommandLine = "`"$exe`" $argsString"

Write-Host "Starting Antigravity with local DevTools port $Port..."
try {
  $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $fullCommandLine }
  if ($result.ReturnValue -ne 0) {
    throw "WMI process creation returned code $($result.ReturnValue)"
  }
} catch {
  # Fallback to Start-Process if WMI is restricted
  $argList = @("--remote-debugging-address=127.0.0.1", "--remote-debugging-port=$Port")
  if ($UserDataDir) {
    $argList += "--user-data-dir=$UserDataDir"
  }
  Start-Process -FilePath $exe -ArgumentList $argList
}
Write-Host "Antigravity started."
