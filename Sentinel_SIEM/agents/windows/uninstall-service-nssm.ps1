param(
  [string]$ServiceName = "SentinelForgeAgent",
  [switch]$RemoveConfig
)

$nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
if ($nssm) {
  nssm stop $ServiceName
  nssm remove $ServiceName confirm
} else {
  sc.exe stop $ServiceName | Out-Null
  sc.exe delete $ServiceName | Out-Null
}

if ($RemoveConfig) {
  Remove-Item -LiteralPath "C:\ProgramData\SentinelForge" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Uninstalled $ServiceName."
