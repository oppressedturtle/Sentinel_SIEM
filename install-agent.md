# Install And Configure The Windows Agent

This guide installs the Sentinel Forge endpoint agent for authorized defensive monitoring. The agent is visible, easy to stop, and easy to uninstall. It does not include stealth behavior, credential theft, keylogging, evasion, or offensive capabilities.

## 1. Prerequisites

- Sentinel Forge SIEM backend running and reachable, for example `http://localhost:4000`
- Admin access to Sentinel Forge
- Python 3 installed on the Windows endpoint
- PowerShell
- Optional: NSSM if you want to run the agent as a Windows service

Check Python:

```powershell
python --version
```

If that fails, install Python 3 from [python.org](https://www.python.org/downloads/windows/) and enable **Add python.exe to PATH** during installation.

## 2. Generate An Enrollment Token

In the SIEM UI:

1. Log in as an Admin.
2. Open **Endpoints**.
3. In **Enrollment Wizard**, set tags and collection policy.
4. Click **Generate Token**.
5. Copy the token or download the generated config.

The token is shown once. Treat it like a secret.

## 3. Prepare The Agent Files

On the Windows endpoint, create the config directory:

```powershell
New-Item -ItemType Directory -Force C:\ProgramData\SentinelForge
```

Copy these files from the SIEM project to the endpoint:

```text
agents\windows\sentinel_forge_agent.py
agents\windows\agent.example.json
```

Then create the live config:

```powershell
Copy-Item .\agents\windows\agent.example.json C:\ProgramData\SentinelForge\agent.json
notepad C:\ProgramData\SentinelForge\agent.json
```

Update:

```json
{
  "server_url": "http://SIEM_HOST:4000",
  "enrollment_token": "PASTE_ENROLLMENT_TOKEN_HERE",
  "tags": ["windows", "workstation"]
}
```

Set `fimPaths` only to folders you are authorized to monitor.

## 4. Run The Agent Once

Open PowerShell in the SIEM project folder. Example:

```powershell
cd C:\Users\YanisMoussai\Documents\Codex\2026-04-26\build-a-full-stack-defensive-siem
```

```powershell
python .\agents\windows\sentinel_forge_agent.py --config C:\ProgramData\SentinelForge\agent.json --once
```

If you are in `C:\WINDOWS\system32`, use the full script path:

```powershell
python C:\Users\YanisMoussai\Documents\Codex\2026-04-26\build-a-full-stack-defensive-siem\agents\windows\sentinel_forge_agent.py --config C:\ProgramData\SentinelForge\agent.json --once
```

The first successful run enrolls the endpoint and writes `agent_id` and `api_key` back into:

```text
C:\ProgramData\SentinelForge\agent.json
```

## 5. Run Continuously In The Foreground

```powershell
python .\agents\windows\sentinel_forge_agent.py --config C:\ProgramData\SentinelForge\agent.json
```

Stop it with:

```text
Ctrl+C
```

## 6. Run As A Windows Service

Install NSSM and make sure `nssm.exe` is on PATH. Then open an elevated PowerShell prompt:

```powershell
.\agents\windows\install-service-nssm.ps1 `
  -Python "python" `
  -AgentPath ".\agents\windows\sentinel_forge_agent.py" `
  -ConfigPath "C:\ProgramData\SentinelForge\agent.json"
```

The service name is:

```text
SentinelForgeAgent
```

It is visible in Windows Services.

## 7. Uninstall

Stop a foreground agent with `Ctrl+C`.

Remove the Windows service:

```powershell
.\agents\windows\uninstall-service-nssm.ps1
```

Remove the service and local config:

```powershell
.\agents\windows\uninstall-service-nssm.ps1 -RemoveConfig
```

Then revoke the endpoint key in the SIEM:

1. Open **Endpoints**.
2. Select the endpoint.
3. Click **Revoke**.

## Troubleshooting

`python is not recognized`:

Install Python 3 and reopen PowerShell.

`agents\windows\sentinel_forge_agent.py not found`:

You are probably not in the SIEM project folder. Run `cd` into the project folder or use the full script path.

`ECONNREFUSED` or enrollment connection failure:

Confirm the SIEM backend is running at `server_url`, usually `http://localhost:4000` or `http://SIEM_HOST:4000`.

Security log collection fails:

Run PowerShell as Administrator or use an account allowed to read Windows Security logs.

No events appear:

Check **Endpoints > Agent Detail > Ingestion Errors**, confirm the agent is enabled, and verify the `api_key` in `agent.json`.
