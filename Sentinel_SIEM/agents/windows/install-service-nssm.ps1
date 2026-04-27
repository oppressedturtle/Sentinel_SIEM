param(
  [string]$Python = "py",
  [string]$AgentPath = "$PSScriptRoot\sentinel_forge_agent.py",
  [string]$ConfigPath = "C:\ProgramData\SentinelForge\agent.json",
  [string]$ServiceName = "SentinelForgeAgent"
)

$nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
if (-not $nssm) {
  Write-Error "nssm.exe is required. Install NSSM, then rerun this script from an elevated PowerShell session."
  exit 1
}

New-Item -ItemType Directory -Force (Split-Path $ConfigPath) | Out-Null
nssm install $ServiceName $Python "-3 `"$AgentPath`" --config `"$ConfigPath`""
nssm set $ServiceName DisplayName "Sentinel Forge Endpoint Agent"
nssm set $ServiceName Description "Visible defensive endpoint telemetry agent for Sentinel Forge SIEM."
nssm set $ServiceName Start SERVICE_AUTO_START
nssm start $ServiceName
Write-Host "Installed and started $ServiceName. Remove it with uninstall-service-nssm.ps1."
