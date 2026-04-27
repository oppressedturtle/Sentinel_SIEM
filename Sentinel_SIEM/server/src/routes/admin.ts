import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.js";
import { hashSecret, randomToken } from "../utils/security.js";

export const adminRouter = Router();

adminRouter.get(
  "/users",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { roles: { include: { role: true } } }
    });
    return res.json({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        createdAt: user.createdAt,
        roles: user.roles.map((role) => role.role.name)
      }))
    });
  })
);

adminRouter.post(
  "/users",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        email: z.string().email(),
        name: z.string().min(1),
        password: z.string().min(8),
        roleIds: z.array(z.string()).default([])
      })
      .parse(req.body);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 12),
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) }
      }
    });
    await writeAuditLog(req, "admin.user.create", "user", user.id);
    return res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
  })
);

adminRouter.get(
  "/roles",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (_req, res) => {
    const [roles, permissions] = await Promise.all([
      prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { name: "asc" } }),
      prisma.permission.findMany({ orderBy: { key: "asc" } })
    ]);
    return res.json({ roles, permissions });
  })
);

adminRouter.post(
  "/roles",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({ name: z.string().min(1), description: z.string().default(""), permissionIds: z.array(z.string()).default([]) })
      .parse(req.body);
    const role = await prisma.role.create({
      data: {
        name: input.name,
        description: input.description,
        permissions: { create: input.permissionIds.map((permissionId) => ({ permissionId })) }
      }
    });
    await writeAuditLog(req, "admin.role.create", "role", role.id);
    return res.status(201).json({ role });
  })
);

adminRouter.get(
  "/api-keys",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (_req, res) => {
    const apiKeys = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    return res.json({
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        status: key.status,
        user: key.user,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt
      }))
    });
  })
);

adminRouter.post(
  "/api-keys",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().min(1),
        scopes: z.array(z.string()).default(["events:write"]),
        expiresAt: z.string().datetime().optional()
      })
      .parse(req.body);
    const prefix = `sfk_${randomToken(3)}`;
    const secret = randomToken(24);
    const rawKey = `${prefix}_${secret}`;
    const apiKey = await prisma.apiKey.create({
      data: {
        name: input.name,
        prefix,
        keyHash: hashSecret(rawKey),
        scopes: input.scopes,
        userId: req.auth!.user.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined
      }
    });
    await writeAuditLog(req, "admin.api_key.create", "api_key", apiKey.id, { scopes: input.scopes });
    return res.status(201).json({ apiKey: { id: apiKey.id, name: apiKey.name, prefix: apiKey.prefix, scopes: apiKey.scopes }, rawKey });
  })
);

adminRouter.get(
  "/sources",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (_req, res) => {
    const sources = await prisma.dataSource.findMany({ orderBy: { name: "asc" } });
    return res.json({ sources });
  })
);

adminRouter.get(
  "/audit-logs",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (_req, res) => {
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    return res.json({ auditLogs });
  })
);

adminRouter.get(
  "/health",
  requireAuth,
  requirePermission("admin:manage"),
  asyncHandler(async (_req, res) => {
    const [users, events, alerts, cases, ruleErrors, latestBatch] = await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.alert.count(),
      prisma.case.count(),
      prisma.detectionRule.count({ where: { lastError: { not: null } } }),
      prisma.ingestionBatch.findFirst({ orderBy: { startedAt: "desc" } })
    ]);
    return res.json({
      status: ruleErrors > 0 ? "degraded" : "healthy",
      database: "reachable",
      counts: { users, events, alerts, cases, ruleErrors },
      latestBatch
    });
  })
);

