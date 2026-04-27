import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-seed-secret";
const DEV_API_KEY = "sfk_dev_sample_ingest_key_change_me";
const DEV_AGENT_ENROLLMENT_TOKEN = "enr_dev_sample_agent_enrollment_change_me";
const DEV_AGENT_API_KEY = "ag_dev_sample_agent_key_change_me";

function hashSecret(value: string) {
  return crypto.createHash("sha256").update(`${SESSION_SECRET}:${value}`).digest("hex");
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

async function main() {
  await prisma.caseTimelineItem.deleteMany();
  await prisma.caseComment.deleteMany();
  await prisma.caseEvent.deleteMany();
  await prisma.caseAlert.deleteMany();
  await prisma.case.deleteMany();
  await prisma.alertComment.deleteMany();
  await prisma.alertEvent.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.ruleExecution.deleteMany();
  await prisma.detectionRule.deleteMany();
  await prisma.dashboardWidget.deleteMany();
  await prisma.dashboard.deleteMany();
  await prisma.savedSearch.deleteMany();
  await prisma.ingestionError.deleteMany();
  await prisma.ingestionBatch.deleteMany();
  await prisma.event.deleteMany();
  await prisma.agentHeartbeat.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.agentEnrollmentToken.deleteMany();
  await prisma.parserMapping.deleteMany();
  await prisma.dataSource.deleteMany();
  await prisma.notificationChannel.deleteMany();
  await prisma.retentionPolicy.deleteMany();
  await prisma.themePreference.deleteMany();
  await prisma.customSchema.deleteMany();
  await prisma.customField.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();

  const permissionDefinitions = [
    ["events:read", "Search and inspect normalized events"],
    ["events:write", "Ingest events and manage parsers"],
    ["alerts:read", "View alerts"],
    ["alerts:manage", "Triage and update alerts"],
    ["cases:read", "View cases"],
    ["cases:manage", "Create and update investigations"],
    ["rules:read", "View detection rules"],
    ["rules:manage", "Create, test, import, export, and run rules"],
    ["dashboards:read", "View dashboards"],
    ["dashboards:manage", "Create, edit, clone, import, and export dashboards"],
    ["agents:read", "View enrolled endpoint agents and their telemetry"],
    ["agents:manage", "Manage enrollment tokens, endpoint agent policy, and agent API keys"],
    ["reports:export", "Export case reports"],
    ["settings:manage", "Manage customization settings"],
    ["admin:manage", "Manage users, API keys, data sources, audit logs, and health"]
  ];

  await prisma.permission.createMany({
    data: permissionDefinitions.map(([key, description]) => ({ key, description }))
  });

  const permissions = await prisma.permission.findMany();
  const allPermissionIds = permissions.map((permission) => permission.id);
  const readOnlyPermissionIds = permissions
    .filter((permission) => permission.key.endsWith(":read") || permission.key === "reports:export")
    .map((permission) => permission.id);
  const analystPermissionIds = permissions
    .filter((permission) => !["admin:manage", "settings:manage", "agents:manage"].includes(permission.key))
    .map((permission) => permission.id);

  const adminRole = await prisma.role.create({
    data: {
      name: "Admin",
      description: "Full SIEM administration and investigation privileges",
      isSystem: true,
      permissions: { create: allPermissionIds.map((permissionId) => ({ permissionId })) }
    }
  });

  const analystRole = await prisma.role.create({
    data: {
      name: "SOC analyst",
      description: "Operational detection, triage, and case management privileges",
      isSystem: true,
      permissions: { create: analystPermissionIds.map((permissionId) => ({ permissionId })) }
    }
  });

  const auditorRole = await prisma.role.create({
    data: {
      name: "Read-only auditor",
      description: "Read-only access for compliance and oversight",
      isSystem: true,
      permissions: { create: readOnlyPermissionIds.map((permissionId) => ({ permissionId })) }
    }
  });

  const hunterRole = await prisma.role.create({
    data: {
      name: "Threat hunter",
      description: "Custom role for research-heavy investigations",
      permissions: {
        create: permissions
          .filter((permission) => ["events:read", "alerts:read", "cases:read", "rules:read", "dashboards:read"].includes(permission.key))
          .map((permission) => ({ permissionId: permission.id }))
      }
    }
  });

  const passwordHash = await bcrypt.hash("Password123!", 12);
  const admin = await prisma.user.create({
    data: {
      email: "admin@sentinelforge.local",
      name: "Maya Admin",
      passwordHash,
      roles: { create: [{ roleId: adminRole.id }] }
    }
  });

  const analyst = await prisma.user.create({
    data: {
      email: "analyst@sentinelforge.local",
      name: "Noah Analyst",
      passwordHash,
      roles: { create: [{ roleId: analystRole.id }, { roleId: hunterRole.id }] }
    }
  });

  await prisma.user.create({
    data: {
      email: "auditor@sentinelforge.local",
      name: "Iris Auditor",
      passwordHash,
      roles: { create: [{ roleId: auditorRole.id }] }
    }
  });

  await prisma.apiKey.create({
    data: {
      name: "Development log sender",
      prefix: "sfk_dev",
      keyHash: hashSecret(DEV_API_KEY),
      scopes: ["events:write"],
      userId: admin.id
    }
  });

  const endpointSource = await prisma.dataSource.create({
    data: {
      name: "Endpoint telemetry",
      type: "endpoint",
      parserType: "json",
      status: "healthy",
      lastSeenAt: minutesAgo(4),
      metadata: { vendor: "ExampleEDR", environment: "production" }
    }
  });

  const authSource = await prisma.dataSource.create({
    data: {
      name: "Identity provider",
      type: "identity",
      parserType: "json",
      status: "degraded",
      lastSeenAt: minutesAgo(18),
      metadata: { vendor: "ExampleIdP", region: "us-east-1" }
    }
  });

  const firewallSource = await prisma.dataSource.create({
    data: {
      name: "Perimeter firewall",
      type: "firewall",
      parserType: "syslog",
      status: "healthy",
      lastSeenAt: minutesAgo(2),
      metadata: { zone: "edge", collector: "syslog-01" }
    }
  });

  const defaultAgentPolicy = {
    intervals: {
      heartbeatSeconds: 60,
      windowsEventSeconds: 60,
      processSeconds: 120,
      networkSeconds: 120,
      fimSeconds: 300
    },
    windowsEventLogs: ["Security", "System", "Application"],
    collectProcesses: true,
    collectNetwork: true,
    collectSystemInfo: true,
    fimPaths: ["C:\\Users\\Public\\Documents"]
  };

  const agentEnrollmentToken = await prisma.agentEnrollmentToken.create({
    data: {
      name: "Default Windows endpoint enrollment",
      tokenPrefix: "enr_dev",
      tokenHash: hashSecret(DEV_AGENT_ENROLLMENT_TOKEN),
      tags: ["windows", "workstation"],
      policy: defaultAgentPolicy,
      usesRemaining: 25,
      createdById: admin.id
    }
  });

  const agentSource = await prisma.dataSource.create({
    data: {
      name: "Agent win-finance-12 ag_dev",
      type: "endpoint_agent",
      parserType: "agent",
      status: "healthy",
      lastSeenAt: minutesAgo(1),
      metadata: { hostname: "win-finance-12", version: "0.1.0", osName: "Windows" }
    }
  });

  const demoAgent = await prisma.agent.create({
    data: {
      hostname: "win-finance-12",
      osName: "Windows",
      osVersion: "Windows 11 Pro 23H2",
      architecture: "amd64",
      username: "aparker",
      ipAddress: "10.24.8.41",
      version: "0.1.0",
      status: "enabled",
      tags: ["windows", "finance", "workstation"],
      groupName: "finance-workstations",
      apiKeyPrefix: "ag_dev",
      apiKeyHash: hashSecret(DEV_AGENT_API_KEY),
      policy: defaultAgentPolicy,
      health: {
        status: "healthy",
        systemInfo: { uptimeSeconds: 84200, collectionMode: "visible" },
        metrics: { queuedEvents: 0 }
      },
      lastSeenAt: minutesAgo(1),
      lastHeartbeatAt: minutesAgo(1),
      enrollmentTokenId: agentEnrollmentToken.id,
      dataSourceId: agentSource.id
    }
  });

  await prisma.agentHeartbeat.create({
    data: {
      agentId: demoAgent.id,
      status: "healthy",
      ipAddress: "10.24.8.41",
      systemInfo: { hostname: "win-finance-12", os: "Windows 11 Pro 23H2", uptimeSeconds: 84200 },
      metrics: { processCount: 137, networkConnections: 28, fimPaths: 1 },
      errors: []
    }
  });

  await prisma.parserMapping.createMany({
    data: [
      {
        name: "Generic JSON security event",
        sourceType: "json",
        dataSourceId: endpointSource.id,
        mapping: {
          timestamp: "event_time",
          host: "asset.hostname",
          userName: "principal.user",
          sourceIp: "network.src_ip",
          destinationIp: "network.dst_ip",
          eventType: "event.action",
          category: "event.category",
          severity: "event.severity",
          message: "message"
        },
        sample: { event_time: new Date().toISOString(), event: { action: "process_start" } }
      },
      {
        name: "CSV network flow",
        sourceType: "csv",
        mapping: {
          timestamp: "time",
          host: "device",
          sourceIp: "src_ip",
          destinationIp: "dst_ip",
          eventType: "action",
          category: "category",
          severity: "severity",
          message: "message"
        },
        sample: { time: new Date().toISOString(), action: "connection_allowed" }
      }
    ]
  });

  const sampleEvents = [
    {
      timestamp: minutesAgo(95),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: "10.24.1.10",
      eventType: "login_failure",
      category: "authentication",
      severity: "medium",
      message: "Failed interactive login for aparker from workstation win-finance-12",
      dataSourceId: authSource.id
    },
    {
      timestamp: minutesAgo(91),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: "10.24.1.10",
      eventType: "login_failure",
      category: "authentication",
      severity: "medium",
      message: "Second failed login for aparker after password reset window",
      dataSourceId: authSource.id
    },
    {
      timestamp: minutesAgo(88),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: "10.24.1.10",
      eventType: "login_success",
      category: "authentication",
      severity: "low",
      message: "Successful login for aparker after repeated failures",
      dataSourceId: authSource.id
    },
    {
      timestamp: minutesAgo(75),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: "198.51.100.22",
      eventType: "powershell_encoded_command",
      category: "process",
      severity: "high",
      message: "Encoded PowerShell command launched from user profile temp directory",
      dataSourceId: endpointSource.id
    },
    {
      timestamp: minutesAgo(72),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: "198.51.100.22",
      eventType: "dns_query",
      category: "network",
      severity: "medium",
      message: "DNS query to newly observed domain update-check.example",
      dataSourceId: endpointSource.id
    },
    {
      timestamp: minutesAgo(70),
      host: "fw-edge-01",
      userName: null,
      sourceIp: "10.24.8.41",
      destinationIp: "198.51.100.22",
      eventType: "connection_allowed",
      category: "network",
      severity: "medium",
      message: "Outbound HTTPS connection allowed to low-reputation IP",
      dataSourceId: firewallSource.id
    },
    {
      timestamp: minutesAgo(52),
      host: "linux-build-04",
      userName: "svc-build",
      sourceIp: "10.24.9.18",
      destinationIp: "10.24.9.20",
      eventType: "sudo_command",
      category: "privilege",
      severity: "medium",
      message: "sudo command executed by service account outside deployment window",
      dataSourceId: endpointSource.id
    },
    {
      timestamp: minutesAgo(40),
      host: "idp-prod",
      userName: "mchen",
      sourceIp: "203.0.113.77",
      destinationIp: "10.24.1.10",
      eventType: "mfa_challenge_failed",
      category: "authentication",
      severity: "high",
      message: "Multiple MFA push denials for mchen from unfamiliar ASN",
      dataSourceId: authSource.id
    },
    {
      timestamp: minutesAgo(34),
      host: "mac-legal-03",
      userName: "mchen",
      sourceIp: "10.24.7.14",
      destinationIp: "10.24.2.50",
      eventType: "file_archive_created",
      category: "file",
      severity: "medium",
      message: "Large archive created in legal shared workspace",
      dataSourceId: endpointSource.id
    },
    {
      timestamp: minutesAgo(25),
      host: "fw-edge-01",
      userName: null,
      sourceIp: "10.24.7.14",
      destinationIp: "203.0.113.89",
      eventType: "connection_blocked",
      category: "network",
      severity: "high",
      message: "Blocked outbound connection to sanctioned destination list",
      dataSourceId: firewallSource.id
    },
    {
      timestamp: minutesAgo(22),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: null,
      eventType: "windows_security_4625",
      category: "authentication",
      severity: "medium",
      message: "Windows Security 4625 failed login observed by endpoint agent",
      dataSourceId: agentSource.id,
      agentId: demoAgent.id
    },
    {
      timestamp: minutesAgo(20),
      host: "win-finance-12",
      userName: "SYSTEM",
      sourceIp: "10.24.8.41",
      destinationIp: null,
      eventType: "windows_system_7045",
      category: "service",
      severity: "high",
      message: "Windows System 7045 service installation observed: ExampleUpdater",
      dataSourceId: agentSource.id,
      agentId: demoAgent.id
    },
    {
      timestamp: minutesAgo(18),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: null,
      eventType: "process_start",
      category: "process",
      severity: "medium",
      message: "Process started from Downloads folder: C:\\Users\\aparker\\Downloads\\invoice-viewer.exe",
      dataSourceId: agentSource.id,
      agentId: demoAgent.id
    },
    {
      timestamp: minutesAgo(17),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: "203.0.113.199",
      eventType: "network_connection",
      category: "network",
      severity: "medium",
      message: "External outbound connection from invoice-viewer.exe to 203.0.113.199:443",
      dataSourceId: agentSource.id,
      agentId: demoAgent.id
    },
    {
      timestamp: minutesAgo(15),
      host: "win-finance-12",
      userName: "aparker",
      sourceIp: "10.24.8.41",
      destinationIp: null,
      eventType: "file_modified",
      category: "file_integrity",
      severity: "medium",
      message: "File integrity change in monitored folder C:\\Users\\Public\\Documents\\quarterly-plan.xlsx",
      dataSourceId: agentSource.id,
      agentId: demoAgent.id
    }
  ];

  const createdEvents = [];
  for (const event of sampleEvents) {
    createdEvents.push(
      await prisma.event.create({
        data: {
          ...event,
          raw: { ...event, timestamp: event.timestamp.toISOString() },
          normalized: JSON.parse(JSON.stringify({
            "@timestamp": event.timestamp.toISOString(),
            host: { name: event.host },
            user: { name: event.userName },
            source: { ip: event.sourceIp },
            destination: { ip: event.destinationIp },
            event: { action: event.eventType, category: event.category, severity: event.severity },
            agent: "agentId" in event ? { id: event.agentId, hostname: event.host } : undefined
          })),
          searchText: [
            event.host,
            event.userName,
            event.sourceIp,
            event.destinationIp,
            event.eventType,
            event.category,
            event.severity,
            event.message
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        }
      })
    );
  }

  await prisma.ingestionBatch.create({
    data: {
      sourceName: "seed data",
      sourceType: "json",
      status: "completed",
      receivedCount: sampleEvents.length,
      acceptedCount: sampleEvents.length,
      rejectedCount: 0,
      completedAt: new Date(),
      dataSourceId: endpointSource.id
    }
  });

  await prisma.ingestionBatch.create({
    data: {
      sourceName: "Agent win-finance-12",
      sourceType: "agent",
      status: "completed",
      receivedCount: 5,
      acceptedCount: 5,
      rejectedCount: 0,
      completedAt: new Date(),
      dataSourceId: agentSource.id
    }
  });

  await prisma.savedSearch.createMany({
    data: [
      {
        name: "High severity auth events",
        createdBy: analyst.id,
        query: { severity: "high", eventType: "authentication" }
      },
      {
        name: "Suspicious PowerShell",
        createdBy: analyst.id,
        query: { q: "powershell encoded" }
      }
    ]
  });

  const keywordRule = await prisma.detectionRule.create({
    data: {
      name: "Encoded PowerShell execution",
      description: "Finds encoded PowerShell invocations that often appear in hands-on-keyboard intrusions.",
      type: "keyword",
      severity: "high",
      riskScore: 82,
      schedule: "every 5 minutes",
      definition: { keyword: "encoded powershell", filters: { category: "process" }, lookbackMinutes: 120 },
      mitreTactic: "Execution",
      mitreTechnique: "T1059.001",
      tags: ["endpoint", "powershell", "defensive"]
    }
  });

  const sequenceRule = await prisma.detectionRule.create({
    data: {
      name: "Login failures followed by success and suspicious process",
      description: "Correlates repeated failed logins, a success, and later suspicious process activity on one host.",
      type: "sequence",
      severity: "critical",
      riskScore: 91,
      schedule: "every 10 minutes",
      definition: {
        sequence: [
          { field: "eventType", value: "login_failure" },
          { field: "eventType", value: "login_success" },
          { field: "eventType", value: "powershell_encoded_command" }
        ],
        groupBy: "host",
        lookbackMinutes: 180
      },
      mitreTactic: "Initial Access",
      mitreTechnique: "T1078",
      tags: ["correlation", "identity", "endpoint"]
    }
  });

  await prisma.detectionRule.createMany({
    data: [
      {
        name: "Agent: many failed Windows logins",
        description: "Detects a burst of Windows Security 4625 failures reported by endpoint agents.",
        type: "threshold",
        severity: "high",
        riskScore: 76,
        schedule: "every 5 minutes",
        definition: { filters: { sourceType: "endpoint_agent", eventType: "windows_security_4625" }, threshold: 5, lookbackMinutes: 30 },
        mitreTactic: "Credential Access",
        mitreTechnique: "T1110",
        tags: ["agent", "windows", "authentication"]
      },
      {
        name: "Agent: new local admin user",
        description: "Flags Windows local group membership changes involving Administrators.",
        type: "keyword",
        severity: "high",
        riskScore: 80,
        schedule: "every 10 minutes",
        definition: { keyword: "administrators", filters: { sourceType: "endpoint_agent", eventType: "windows_security_4732" }, lookbackMinutes: 60 },
        mitreTactic: "Persistence",
        mitreTechnique: "T1098",
        tags: ["agent", "windows", "account-management"]
      },
      {
        name: "Agent: suspicious service installation",
        description: "Detects Windows System 7045 service installation events from endpoint agents.",
        type: "keyword",
        severity: "high",
        riskScore: 78,
        schedule: "every 10 minutes",
        definition: { keyword: "service", filters: { sourceType: "endpoint_agent", eventType: "windows_system_7045" }, lookbackMinutes: 60 },
        mitreTactic: "Persistence",
        mitreTechnique: "T1543.003",
        tags: ["agent", "windows", "service"]
      },
      {
        name: "Agent: unusual outbound connection",
        description: "Looks for endpoint-agent network events with external outbound connection wording.",
        type: "keyword",
        severity: "medium",
        riskScore: 61,
        schedule: "every 15 minutes",
        definition: { keyword: "external outbound", filters: { sourceType: "endpoint_agent", category: "network" }, lookbackMinutes: 60 },
        mitreTactic: "Command and Control",
        mitreTechnique: "T1071",
        tags: ["agent", "network"]
      },
      {
        name: "Agent: process from temp or downloads",
        description: "Flags process starts from user temp or downloads folders.",
        type: "keyword",
        severity: "medium",
        riskScore: 65,
        schedule: "every 10 minutes",
        definition: { keyword: "downloads", filters: { sourceType: "endpoint_agent", eventType: "process_start" }, lookbackMinutes: 60 },
        mitreTactic: "Execution",
        mitreTechnique: "T1204",
        tags: ["agent", "process"]
      },
      {
        name: "Agent: security log cleared",
        description: "Detects Windows Security 1102 audit log clear events.",
        type: "keyword",
        severity: "critical",
        riskScore: 95,
        schedule: "every 5 minutes",
        definition: { keyword: "security", filters: { sourceType: "endpoint_agent", eventType: "windows_security_1102" }, lookbackMinutes: 60 },
        mitreTactic: "Defense Evasion",
        mitreTechnique: "T1070.001",
        tags: ["agent", "windows", "audit"]
      }
    ]
  });

  await prisma.ruleExecution.createMany({
    data: [
      {
        ruleId: keywordRule.id,
        status: "success",
        startedAt: minutesAgo(10),
        completedAt: minutesAgo(10),
        durationMs: 146,
        matchedEvents: 1,
        alertsCreated: 1
      },
      {
        ruleId: sequenceRule.id,
        status: "success",
        startedAt: minutesAgo(8),
        completedAt: minutesAgo(8),
        durationMs: 232,
        matchedEvents: 4,
        alertsCreated: 1
      }
    ]
  });

  const alert = await prisma.alert.create({
    data: {
      title: "Encoded PowerShell on win-finance-12",
      status: "investigating",
      severity: "high",
      riskScore: 82,
      tags: ["endpoint", "execution"],
      ownerId: analyst.id,
      ruleId: keywordRule.id,
      events: {
        create: createdEvents
          .filter((event) => event.eventType === "powershell_encoded_command" || event.host === "win-finance-12")
          .slice(0, 4)
          .map((event) => ({ eventId: event.id }))
      },
      comments: {
        create: {
          userId: analyst.id,
          body: "Triaged from seed detection. Host isolation has not been requested; continuing evidence collection."
        }
      }
    }
  });

  await prisma.alert.create({
    data: {
      title: "MFA challenge fatigue against mchen",
      status: "open",
      severity: "high",
      riskScore: 74,
      tags: ["identity", "mfa"],
      ruleId: sequenceRule.id,
      events: {
        create: createdEvents
          .filter((event) => event.userName === "mchen")
          .map((event) => ({ eventId: event.id }))
      }
    }
  });

  const investigation = await prisma.case.create({
    data: {
      title: "Finance workstation suspicious execution",
      description: "Investigation into suspicious PowerShell execution after multiple authentication failures.",
      status: "investigating",
      severity: "high",
      affectedHosts: ["win-finance-12"],
      affectedUsers: ["aparker"],
      evidence: [{ type: "note", value: "Correlated identity and endpoint events in a 25 minute window." }],
      alerts: { create: [{ alertId: alert.id }] },
      events: {
        create: createdEvents
          .filter((event) => event.host === "win-finance-12")
          .map((event) => ({ eventId: event.id }))
      },
      comments: {
        create: {
          userId: analyst.id,
          body: "Created from alert queue. Next step is to validate command line and network destination reputation."
        }
      },
      timeline: {
        create: [
          {
            kind: "created",
            title: "Case opened from alert",
            details: { alertId: alert.id }
          },
          {
            kind: "evidence",
            title: "Attached correlated authentication and endpoint events",
            details: { eventCount: 4 }
          }
        ]
      }
    }
  });

  const dashboard = await prisma.dashboard.create({
    data: {
      name: "SOC Operations",
      description: "Default operational view for alert triage and telemetry health.",
      isDefault: true,
      layout: { columns: 12, density: "comfortable" },
      widgets: {
        create: [
          {
            type: "metric",
            title: "Open alerts",
            query: { metric: "openAlerts" },
            position: { x: 0, y: 0, w: 3, h: 2 }
          },
          {
            type: "line",
            title: "Alerts over time",
            query: { metric: "alertsOverTime" },
            position: { x: 3, y: 0, w: 6, h: 3 }
          },
          {
            type: "bar",
            title: "Top hosts",
            query: { metric: "topHosts" },
            position: { x: 0, y: 3, w: 6, h: 3 }
          },
          {
            type: "pie",
            title: "Severity distribution",
            query: { metric: "severityDistribution" },
            position: { x: 6, y: 3, w: 6, h: 3 }
          }
        ]
      }
    }
  });

  await prisma.customField.createMany({
    data: [
      {
        name: "business_unit",
        fieldType: "string",
        appliesTo: "event",
        description: "Business owner context for assets and users"
      },
      {
        name: "analyst_confidence",
        fieldType: "number",
        appliesTo: "alert",
        description: "Analyst-scored confidence from 0 to 100"
      }
    ]
  });

  await prisma.customSchema.create({
    data: {
      name: "Common security event",
      description: "Default normalized schema inspired by common SIEM field conventions.",
      fields: [
        "timestamp",
        "host",
        "userName",
        "sourceIp",
        "destinationIp",
        "eventType",
        "category",
        "severity",
        "message"
      ]
    }
  });

  await prisma.themePreference.create({
    data: {
      name: "Default operations theme",
      mode: "dark",
      density: "comfortable",
      colors: {
        primary: "#1f9fb4",
        positive: "#2f9e66",
        warning: "#c9831f",
        danger: "#c94d4d"
      }
    }
  });

  await prisma.retentionPolicy.createMany({
    data: [
      { name: "Events 90 days", target: "events", days: 90 },
      { name: "Audit logs 365 days", target: "audit_logs", days: 365 }
    ]
  });

  await prisma.notificationChannel.createMany({
    data: [
      {
        name: "SOC webhook",
        type: "webhook",
        config: { url: "https://hooks.example.invalid/siem", method: "POST" }
      },
      {
        name: "Email notification stub",
        type: "email",
        config: { recipients: ["soc@example.invalid"], stub: true }
      }
    ]
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "seed.completed",
      entity: "system",
      metadata: {
        dashboardId: dashboard.id,
        caseId: investigation.id,
        apiKeyHint: DEV_API_KEY
      }
    }
  });

  console.log("Seed complete");
  console.log("Login: admin@sentinelforge.local / Password123!");
  console.log("Login: analyst@sentinelforge.local / Password123!");
  console.log("Login: auditor@sentinelforge.local / Password123!");
  console.log(`Development API key: ${DEV_API_KEY}`);
  console.log(`Development agent enrollment token: ${DEV_AGENT_ENROLLMENT_TOKEN}`);
  console.log(`Development demo agent API key: ${DEV_AGENT_API_KEY}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
