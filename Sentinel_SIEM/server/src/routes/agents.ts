import type { Prisma } from "@prisma/client";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { requireAgentAuth } from "../middleware/agentAuth.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { storeAgentEvents } from "../services/agents.js";
import { writeAuditLog } from "../services/audit.js";
import { hashSecret, randomToken } from "../utils/security.js";

export const agentsRouter = Router();

const agentRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false
});

const defaultPolicy = {
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
  fimPaths: []
};

const enrollmentTokenSchema = z.object({
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  policy: z.record(z.unknown()).default(defaultPolicy),
  expiresAt: z.string().datetime().optional(),
  usesRemaining: z.number().int().min(1).optional()
});

const enrollSchema = z.object({
  enrollmentToken: z.string().min(16),
  hostname: z.string().min(1),
  osName: z.string().min(1),
  osVersion: z.string().optional(),
  architecture: z.string().optional(),
  username: z.string().optional(),
  version: z.string().default("0.1.0"),
  ipAddress: z.string().optional(),
  tags: z.array(z.string()).default([]),
  systemInfo: z.record(z.unknown()).default({})
});

const heartbeatSchema = z.object({
  status: z.string().default("healthy"),
  ipAddress: z.string().optional(),
  version: z.string().optional(),
  systemInfo: z.record(z.unknown()).default({}),
  metrics: z.record(z.unknown()).default({}),
  errors: z.array(z.unknown()).default([])
});

const eventsSchema = z.object({
  events: z.array(z.record(z.unknown())).min(1).max(500)
});

function agentStatus(agent: { status: string; lastSeenAt?: Date | null }) {
  if (agent.status !== "enabled") return agent.status;
  if (!agent.lastSeenAt) return "enrolled";
  const ageMs = Date.now() - agent.lastSeenAt.getTime();
  return ageMs > 5 * 60_000 ? "stale" : "online";
}

agentsRouter.post(
  "/enrollment-tokens",
  requireAuth,
  requirePermission("agents:manage"),
  asyncHandler(async (req, res) => {
    const input = enrollmentTokenSchema.parse(req.body);
    const prefix = `enr_${randomToken(3)}`;
    const secret = randomToken(24);
    const rawToken = `${prefix}_${secret}`;
    const token = await prisma.agentEnrollmentToken.create({
      data: {
        name: input.name,
        tokenPrefix: prefix,
        tokenHash: hashSecret(rawToken),
        tags: input.tags,
        policy: input.policy as Prisma.InputJsonValue,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        usesRemaining: input.usesRemaining,
        createdById: req.auth?.user.id
      }
    });

    await writeAuditLog(req, "agent.enrollment_token.create", "agent_enrollment_token", token.id, {
      tags: input.tags,
      expiresAt: input.expiresAt
    });
    return res.status(201).json({ token, rawToken });
  })
);

agentsRouter.get(
  "/enrollment-tokens",
  requireAuth,
  requirePermission("agents:manage"),
  asyncHandler(async (_req, res) => {
    const tokens = await prisma.agentEnrollmentToken.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { agents: true } } }
    });
    return res.json({ tokens });
  })
);

agentsRouter.post(
  "/enroll",
  agentRateLimit,
  asyncHandler(async (req, res) => {
    const input = enrollSchema.parse(req.body);
    const token = await prisma.agentEnrollmentToken.findFirst({
      where: {
        tokenHash: hashSecret(input.enrollmentToken),
        status: "active",
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          { OR: [{ usesRemaining: null }, { usesRemaining: { gt: 0 } }] }
        ]
      }
    });

    if (!token) {
      throw new HttpError(401, "Invalid or expired enrollment token");
    }

    const apiKeyPrefix = `ag_${randomToken(3)}`;
    const apiKeySecret = randomToken(24);
    const rawApiKey = `${apiKeyPrefix}_${apiKeySecret}`;
    const mergedTags = Array.from(new Set([...token.tags, ...input.tags]));

    const source = await prisma.dataSource.create({
      data: {
        name: `Agent ${input.hostname} ${apiKeyPrefix}`,
        type: "endpoint_agent",
        parserType: "agent",
        status: "healthy",
        lastSeenAt: new Date(),
        metadata: {
          hostname: input.hostname,
          osName: input.osName,
          version: input.version
        }
      }
    });

    const agent = await prisma.agent.create({
      data: {
        hostname: input.hostname,
        osName: input.osName,
        osVersion: input.osVersion,
        architecture: input.architecture,
        username: input.username,
        ipAddress: input.ipAddress ?? req.ip,
        version: input.version,
        tags: mergedTags,
        apiKeyPrefix,
        apiKeyHash: hashSecret(rawApiKey),
        policy: token.policy as Prisma.InputJsonValue,
        health: { systemInfo: input.systemInfo },
        lastSeenAt: new Date(),
        enrollmentTokenId: token.id,
        dataSourceId: source.id
      }
    });

    await prisma.agentEnrollmentToken.update({
      where: { id: token.id },
      data: {
        lastUsedAt: new Date(),
        usesRemaining: token.usesRemaining === null ? undefined : Math.max(token.usesRemaining - 1, 0)
      }
    });

    return res.status(201).json({
      agentId: agent.id,
      apiKey: rawApiKey,
      status: agent.status,
      policy: agent.policy
    });
  })
);

agentsRouter.post(
  "/heartbeat",
  agentRateLimit,
  requireAgentAuth,
  asyncHandler(async (req, res) => {
    const input = heartbeatSchema.parse(req.body);
    const agent = await prisma.agent.update({
      where: { id: req.agent!.id },
      data: {
        ipAddress: input.ipAddress ?? req.ip,
        version: input.version,
        health: {
          status: input.status,
          systemInfo: input.systemInfo,
          metrics: input.metrics,
          errors: input.errors
        } as Prisma.InputJsonValue,
        lastSeenAt: new Date(),
        lastHeartbeatAt: new Date(),
        lastError: input.errors.length ? `${input.errors.length} health error(s) reported` : null
      }
    });

    await prisma.agentHeartbeat.create({
      data: {
        agentId: agent.id,
        status: input.status,
        ipAddress: input.ipAddress ?? req.ip,
        systemInfo: input.systemInfo as Prisma.InputJsonValue,
        metrics: input.metrics as Prisma.InputJsonValue,
        errors: input.errors as Prisma.InputJsonValue
      }
    });

    if (agent.dataSourceId) {
      await prisma.dataSource.update({
        where: { id: agent.dataSourceId },
        data: { lastSeenAt: new Date(), status: input.errors.length ? "degraded" : "healthy" }
      });
    }

    return res.json({ ok: true, status: agent.status, policy: agent.policy });
  })
);

agentsRouter.post(
  "/events",
  agentRateLimit,
  requireAgentAuth,
  asyncHandler(async (req, res) => {
    const input = eventsSchema.parse(req.body);
    const result = await storeAgentEvents(input.events, req.agent!);
    return res.status(202).json(result);
  })
);

agentsRouter.get(
  "/",
  requireAuth,
  requirePermission("agents:read"),
  asyncHandler(async (_req, res) => {
    const agents = await prisma.agent.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        dataSource: true,
        enrollmentToken: { select: { id: true, name: true, tokenPrefix: true } },
        _count: { select: { events: true, heartbeats: true } }
      }
    });

    return res.json({
      agents: agents.map((agent) => ({
        ...agent,
        displayStatus: agentStatus(agent)
      }))
    });
  })
);

agentsRouter.get(
  "/:id",
  requireAuth,
  requirePermission("agents:read"),
  asyncHandler(async (req, res) => {
    const agent = await prisma.agent.findUnique({
      where: { id: req.params.id },
      include: {
        dataSource: true,
        enrollmentToken: { select: { id: true, name: true, tokenPrefix: true } },
        heartbeats: { orderBy: { createdAt: "desc" }, take: 20 },
        events: { orderBy: { timestamp: "desc" }, take: 100 }
      }
    });
    if (!agent) throw new HttpError(404, "Agent not found");

    const errors = await prisma.ingestionError.findMany({
      where: agent.dataSourceId ? { batch: { dataSourceId: agent.dataSourceId } } : { id: "__none__" },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { batch: true }
    });

    return res.json({ agent: { ...agent, displayStatus: agentStatus(agent), errors } });
  })
);

agentsRouter.get(
  "/:id/events",
  requireAuth,
  requirePermission("agents:read"),
  asyncHandler(async (req, res) => {
    const events = await prisma.event.findMany({
      where: { agentId: req.params.id },
      orderBy: { timestamp: "desc" },
      take: Math.min(Number(req.query.limit ?? 100), 500),
      include: { dataSource: true, agent: true }
    });
    return res.json({ events });
  })
);

agentsRouter.get(
  "/:id/config",
  requireAuth,
  requirePermission("agents:manage"),
  asyncHandler(async (req, res) => {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) throw new HttpError(404, "Agent not found");

    return res.json({
      config: {
        server_url: `${req.protocol}://${req.get("host")}`,
        api_key: "ROTATE_AGENT_KEY_TO_FILL_THIS_VALUE",
        agent_id: agent.id,
        hostname: agent.hostname,
        tags: agent.tags,
        collection: agent.policy
      }
    });
  })
);

agentsRouter.patch(
  "/:id",
  requireAuth,
  requirePermission("agents:manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        status: z.enum(["enabled", "disabled", "revoked"]).optional(),
        tags: z.array(z.string()).optional(),
        groupName: z.string().nullable().optional(),
        policy: z.record(z.unknown()).optional(),
        rotateApiKey: z.boolean().optional(),
        revokeApiKey: z.boolean().optional()
      })
      .parse(req.body);

    const data: Prisma.AgentUpdateInput = {
      status: input.revokeApiKey ? "revoked" : input.status,
      tags: input.tags,
      groupName: input.groupName,
      policy: input.policy as Prisma.InputJsonValue | undefined
    };

    let rawApiKey: string | undefined;
    if (input.rotateApiKey) {
      const apiKeyPrefix = `ag_${randomToken(3)}`;
      const apiKeySecret = randomToken(24);
      rawApiKey = `${apiKeyPrefix}_${apiKeySecret}`;
      data.apiKeyPrefix = apiKeyPrefix;
      data.apiKeyHash = hashSecret(rawApiKey);
      data.status = "enabled";
    }

    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data
    });
    await writeAuditLog(req, "agent.update", "agent", agent.id, {
      status: data.status,
      tags: input.tags,
      groupName: input.groupName,
      rotateApiKey: input.rotateApiKey,
      revokeApiKey: input.revokeApiKey
    });

    return res.json({ agent: { ...agent, displayStatus: agentStatus(agent) }, rawApiKey });
  })
);
