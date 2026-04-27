# Sentinel Forge SIEM

A full-stack defensive SIEM MVP inspired by modern security operations workflows, without Elastic branding, UI, or proprietary code.

## What Is Included

- React, TypeScript, Tailwind frontend
- Express, TypeScript backend
- PostgreSQL with Prisma ORM
- Session-based authentication with HTTP-only cookies
- Role-based access control for Admin, SOC analyst, Read-only auditor, and custom roles
- JSON, CSV, syslog upload ingestion
- API ingestion with API keys
- Common event normalization
- Event search, filters, saved searches, and case attachment
- Detection rules: threshold, keyword match, field comparison, sequence correlation
- Rule test mode and rule health history
- Alert queue, comments, bulk status updates, false positive marking
- Cases with evidence, comments, timeline, affected hosts/users, Markdown export
- Dashboard builder with draggable widget ordering, clone, export, import
- Custom fields, schemas, themes, retention, notification channels
- Admin pages for users, roles, API keys, sources, audit log, and health

## Architecture

```text
client/
  React SPA, Tailwind UI, Recharts dashboards, role-aware navigation

server/src/
  Express API, auth middleware, RBAC, audit logging, ingestion, rule execution

prisma/
  PostgreSQL schema and seed data

examples/
  JSON, CSV, and syslog files for ingestion testing
```

The search layer currently uses PostgreSQL-backed event filtering and a normalized `searchText` column through `server/src/services/search.ts`. That service is the boundary to replace or augment later with OpenSearch/Elasticsearch.

## Database Schema

The Prisma schema in `prisma/schema.prisma` defines:

- Identity/RBAC: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `Session`, `ApiKey`, `AuditLog`
- Ingestion/search: `DataSource`, `ParserMapping`, `IngestionBatch`, `IngestionError`, `Event`, `SavedSearch`
- Detection/alerts: `DetectionRule`, `RuleExecution`, `Alert`, `AlertEvent`, `AlertComment`
- Endpoint agents: `AgentEnrollmentToken`, `Agent`, `AgentHeartbeat`
- Cases: `Case`, `CaseAlert`, `CaseEvent`, `CaseComment`, `CaseTimelineItem`
- Customization/reporting: `Dashboard`, `DashboardWidget`, `CustomField`, `CustomSchema`, `ThemePreference`, `NotificationChannel`, `RetentionPolicy`

## Setup

1. Copy environment variables.

```bash
cp .env.example .env
```

2. Start PostgreSQL.

```bash
docker compose up -d
```

3. Install dependencies.

```bash
npm install
```

4. Create tables and seed the database.

```bash
npm run db:push
npm run db:seed
```

5. Start the app.

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:4000/api/health`

## Seeded Logins

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@sentinelforge.local` | `Password123!` |
| SOC analyst | `analyst@sentinelforge.local` | `Password123!` |
| Read-only auditor | `auditor@sentinelforge.local` | `Password123!` |

Development API key:

```text
sfk_dev_sample_ingest_key_change_me
```

<<<<<<< HEAD
=======
Development agent enrollment token:

```text
enr_dev_sample_agent_enrollment_change_me
```

>>>>>>> af111a9 (added endpoint integration)
## MVP Flow

1. Log in as `admin@sentinelforge.local`.
2. Open Ingestion and upload `examples/sample-events.json`, or send the API request below.
3. Open Search and filter by host, user, IP, severity, or keyword.
4. Open Rules, create or test a rule, then run it.
5. Open Alerts, triage the generated alert, add a comment, and create a case.
6. Open Cases and export the Markdown report.
7. Open Dashboards and clone/export/import a custom dashboard.
<<<<<<< HEAD
=======
8. Open Endpoints, generate an enrollment token, enroll the Windows agent, and watch endpoint events stream into search and rules.
>>>>>>> af111a9 (added endpoint integration)

## Example API Calls

Session login:

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sentinelforge.local","password":"Password123!"}' \
  http://localhost:4000/api/auth/login
```

API key ingestion:

```bash
curl -X POST http://localhost:4000/api/ingest/events \
  -H "Content-Type: application/json" \
  -H "x-api-key: sfk_dev_sample_ingest_key_change_me" \
  -d @examples/api-ingest-payload.json
```

Upload JSON with a session cookie:

```bash
curl -b cookies.txt \
  -F "sourceName=Manual JSON upload" \
  -F "sourceType=json" \
  -F "file=@examples/sample-events.json" \
  http://localhost:4000/api/ingest/upload
```

Search events:

```bash
curl -b cookies.txt "http://localhost:4000/api/events?q=powershell&severity=high"
```

Run a rule:

```bash
curl -X POST -b cookies.txt http://localhost:4000/api/rules/RULE_ID/run
```

Export a case report:

```bash
curl -b cookies.txt http://localhost:4000/api/cases/CASE_ID/report.md
```

<<<<<<< HEAD
=======
## Endpoint Agent MVP

The Windows agent is a visible, authorized defensive telemetry collector. It does not include stealth, persistence bypass, credential theft, keylogging, evasion, or offensive behavior.

### Generate An Enrollment Token

In the UI:

1. Log in as an Admin.
2. Open Endpoints.
3. Use Enrollment Wizard to set default tags and collection policy.
4. Click Generate Token.
5. Download the generated `sentinel-forge-agent.json` config.

With the API:

```bash
curl -X POST -b cookies.txt http://localhost:4000/api/agents/enrollment-tokens \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Windows workstation enrollment",
    "tags": ["windows", "workstation"],
    "usesRemaining": 25,
    "policy": {
      "intervals": {
        "heartbeatSeconds": 60,
        "windowsEventSeconds": 60,
        "processSeconds": 120,
        "networkSeconds": 120,
        "fimSeconds": 300
      },
      "windowsEventLogs": ["Security", "System", "Application"],
      "collectProcesses": true,
      "collectNetwork": true,
      "collectSystemInfo": true,
      "fimPaths": ["C:\\Users\\Public\\Documents"]
    }
  }'
```

The raw enrollment token is shown once. Store it in the agent config.

### Windows Install

On the monitored Windows host, install Python 3 and copy:

- `agents/windows/sentinel_forge_agent.py`
- `agents/windows/agent.example.json`

Create the config directory and config:

```powershell
New-Item -ItemType Directory -Force C:\ProgramData\SentinelForge
Copy-Item .\agents\windows\agent.example.json C:\ProgramData\SentinelForge\agent.json
notepad C:\ProgramData\SentinelForge\agent.json
```

Set:

- `server_url` to the SIEM URL, for example `http://SIEM_HOST:4000`
- `enrollment_token` to the token from the Endpoints page
- `fimPaths` only to folders you are authorized to monitor

Run once in the foreground:

```powershell
py -3 .\agents\windows\sentinel_forge_agent.py --config C:\ProgramData\SentinelForge\agent.json --once
```

Run continuously in the foreground:

```powershell
py -3 .\agents\windows\sentinel_forge_agent.py --config C:\ProgramData\SentinelForge\agent.json
```

The first run enrolls the agent, receives an agent API key, and writes `agent_id` and `api_key` back into the config file.

### Run As A Visible Windows Service

The helper uses NSSM because Python scripts are not native Windows service binaries.

1. Install NSSM and ensure `nssm.exe` is on PATH.
2. Open an elevated PowerShell prompt.
3. Run:

```powershell
.\agents\windows\install-service-nssm.ps1 `
  -AgentPath .\agents\windows\sentinel_forge_agent.py `
  -ConfigPath C:\ProgramData\SentinelForge\agent.json
```

The service name is `SentinelForgeAgent` and it is visible in Windows Services.

### Uninstall

Stop a foreground agent with `Ctrl+C`.

Remove the NSSM service:

```powershell
.\agents\windows\uninstall-service-nssm.ps1
```

Remove service and local config:

```powershell
.\agents\windows\uninstall-service-nssm.ps1 -RemoveConfig
```

In the SIEM Endpoints page, revoke the agent key to prevent future heartbeats or events.

### Agent API Flow

Enroll:

```bash
curl -X POST http://localhost:4000/api/agents/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "enrollmentToken": "enr_dev_sample_agent_enrollment_change_me",
    "hostname": "win-demo-01",
    "osName": "Windows",
    "osVersion": "Windows 11",
    "version": "0.1.0",
    "tags": ["windows", "lab"]
  }'
```

Heartbeat:

```bash
curl -X POST http://localhost:4000/api/agents/heartbeat \
  -H "Content-Type: application/json" \
  -H "x-agent-key: AGENT_API_KEY" \
  -d '{"status":"healthy","systemInfo":{"hostname":"win-demo-01"},"metrics":{"queuedEvents":0},"errors":[]}'
```

Send events:

```bash
curl -X POST http://localhost:4000/api/agents/events \
  -H "Content-Type: application/json" \
  -H "x-agent-key: AGENT_API_KEY" \
  -d '{
    "events": [
      {
        "type": "windows_event",
        "timestamp": "2026-04-27T10:00:00.000Z",
        "channel": "Security",
        "event_id": 4625,
        "level": "warning",
        "message": "Failed login observed by endpoint agent"
      }
    ]
  }'
```

### Troubleshooting

- Security log collection may require running the agent with permissions allowed to read Windows Security events.
- If enrollment fails, confirm the SIEM URL is reachable and the enrollment token has remaining uses.
- If heartbeat returns `Agent is disabled`, re-enable the endpoint in the Endpoints page.
- If event upload is rejected, check Endpoints > Agent Detail > Ingestion Errors.
- If FIM produces too many events, reduce `fimPaths` or set `maxFimFiles`.
- If NSSM install fails, run the agent in foreground first to validate config and connectivity.

>>>>>>> af111a9 (added endpoint integration)
## Security Notes

- This application is defensive-only and intentionally contains no exploitation tooling.
- Authentication uses HTTP-only session cookies and bcrypt password hashing.
- API keys are stored hashed, and raw key material is only shown once.
- Sensitive actions create audit log entries.
- Rate limiting and Helmet are enabled in the Express API.
- RBAC permissions are enforced server-side.

## Next Production Steps

- Add Prisma migrations instead of `db push` for controlled releases.
- Add PostgreSQL `tsvector` indexes or OpenSearch for high-volume search.
- Add background scheduling for detection rules.
- Add WebSocket updates for alert queues and ingestion health.
- Replace the email stub with a real provider integration.
- Add PDF generation for case reports.
<<<<<<< HEAD

=======
>>>>>>> af111a9 (added endpoint integration)
