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

## MVP Flow

1. Log in as `admin@sentinelforge.local`.
2. Open Ingestion and upload `examples/sample-events.json`, or send the API request below.
3. Open Search and filter by host, user, IP, severity, or keyword.
4. Open Rules, create or test a rule, then run it.
5. Open Alerts, triage the generated alert, add a comment, and create a case.
6. Open Cases and export the Markdown report.
7. Open Dashboards and clone/export/import a custom dashboard.
8. Open Endpoints, generate an enrollment token, enroll the Windows agent, and watch endpoint events stream into search and rules.

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
