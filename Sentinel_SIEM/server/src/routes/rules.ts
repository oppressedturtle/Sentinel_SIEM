import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { runRule, testRule } from "../services/rules.js";
import { writeAuditLog } from "../services/audit.js";

export const rulesRouter = Router();

const ruleSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  type: z.enum(["threshold", "keyword", "field_comparison", "sequence"]),
  severity: z.string().default("medium"),
  riskScore: z.number().int().min(0).max(100).default(50),
  schedule: z.string().default("manual"),
  enabled: z.boolean().default(true),
  definition: z.record(z.unknown()).default({}),
  mitreTactic: z.string().optional().nullable(),
  mitreTechnique: z.string().optional().nullable(),
  tags: z.array(z.string()).default([])
});

rulesRouter.get(
  "/",
  requireAuth,
  requirePermission("rules:read"),
  asyncHandler(async (_req, res) => {
    const rules = await prisma.detectionRule.findMany({
      orderBy: { updatedAt: "desc" },
      include: { executions: { orderBy: { startedAt: "desc" }, take: 3 }, _count: { select: { alerts: true } } }
    });
    return res.json({ rules });
  })
);

rulesRouter.post(
  "/",
  requireAuth,
  requirePermission("rules:manage"),
  asyncHandler(async (req, res) => {
    const input = ruleSchema.parse(req.body);
    const rule = await prisma.detectionRule.create({ data: { ...input, definition: input.definition as Prisma.InputJsonValue } });
    await writeAuditLog(req, "rule.create", "detection_rule", rule.id);
    return res.status(201).json({ rule });
  })
);

rulesRouter.put(
  "/:id",
  requireAuth,
  requirePermission("rules:manage"),
  asyncHandler(async (req, res) => {
    const input = ruleSchema.partial().parse(req.body);
    const rule = await prisma.detectionRule.update({
      where: { id: req.params.id },
      data: { ...input, definition: input.definition as Prisma.InputJsonValue | undefined }
    });
    await writeAuditLog(req, "rule.update", "detection_rule", rule.id);
    return res.json({ rule });
  })
);

rulesRouter.post(
  "/test",
  requireAuth,
  requirePermission("rules:manage"),
  asyncHandler(async (req, res) => {
    const input = ruleSchema.parse(req.body);
    const pseudoRule = {
      id: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastRunAt: null,
      lastDurationMs: null,
      lastError: null,
      ...input
    };
    const result = await testRule(pseudoRule);
    return res.json({
      ...result,
      matchedEvents: result.matchedEvents.slice(0, 25)
    });
  })
);

rulesRouter.post(
  "/:id/test",
  requireAuth,
  requirePermission("rules:manage"),
  asyncHandler(async (req, res) => {
    const rule = await prisma.detectionRule.findUnique({ where: { id: req.params.id } });
    if (!rule) throw new HttpError(404, "Rule not found");
    const result = await testRule(rule);
    return res.json({
      ...result,
      matchedEvents: result.matchedEvents.slice(0, 25)
    });
  })
);

rulesRouter.post(
  "/:id/run",
  requireAuth,
  requirePermission("rules:manage"),
  asyncHandler(async (req, res) => {
    const result = await runRule(req.params.id);
    await writeAuditLog(req, "rule.run", "detection_rule", req.params.id, {
      matchedEvents: result.matchedEvents.length,
      alertsCreated: result.alertsCreated
    });
    return res.json({
      ...result,
      matchedEvents: result.matchedEvents.slice(0, 25)
    });
  })
);

rulesRouter.get(
  "/:id/export",
  requireAuth,
  requirePermission("rules:read"),
  asyncHandler(async (req, res) => {
    const rule = await prisma.detectionRule.findUnique({ where: { id: req.params.id } });
    if (!rule) throw new HttpError(404, "Rule not found");
    return res.json({ rule });
  })
);

rulesRouter.post(
  "/import",
  requireAuth,
  requirePermission("rules:manage"),
  asyncHandler(async (req, res) => {
    const input = ruleSchema.parse(req.body.rule ?? req.body);
    const rule = await prisma.detectionRule.create({
      data: { ...input, name: `${input.name} (imported)`, definition: input.definition as Prisma.InputJsonValue }
    });
    await writeAuditLog(req, "rule.import", "detection_rule", rule.id);
    return res.status(201).json({ rule });
  })
);
