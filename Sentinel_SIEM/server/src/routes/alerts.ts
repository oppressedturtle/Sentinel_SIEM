import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.js";

export const alertsRouter = Router();

alertsRouter.get(
  "/",
  requireAuth,
  requirePermission("alerts:read"),
  asyncHandler(async (req, res) => {
    const where = {
      status: req.query.status?.toString() || undefined,
      severity: req.query.severity?.toString() || undefined
    };
    const alerts = await prisma.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        rule: { select: { id: true, name: true, mitreTactic: true, mitreTechnique: true } },
        _count: { select: { events: true, comments: true, cases: true } }
      },
      take: 200
    });
    return res.json({ alerts });
  })
);

alertsRouter.get(
  "/:id",
  requireAuth,
  requirePermission("alerts:read"),
  asyncHandler(async (req, res) => {
    const alert = await prisma.alert.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        rule: true,
        events: { include: { event: { include: { dataSource: true } } } },
        comments: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
        cases: { include: { case: true } }
      }
    });
    if (!alert) throw new HttpError(404, "Alert not found");
    return res.json({ alert });
  })
);

alertsRouter.patch(
  "/:id",
  requireAuth,
  requirePermission("alerts:manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        status: z.string().optional(),
        severity: z.string().optional(),
        riskScore: z.number().int().min(0).max(100).optional(),
        ownerId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        falsePositive: z.boolean().optional(),
        falsePositiveNote: z.string().nullable().optional()
      })
      .parse(req.body);
    const alert = await prisma.alert.update({ where: { id: req.params.id }, data: input });
    await writeAuditLog(req, "alert.update", "alert", alert.id, input);
    return res.json({ alert });
  })
);

alertsRouter.post(
  "/:id/comments",
  requireAuth,
  requirePermission("alerts:manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ body: z.string().min(1) }).parse(req.body);
    const comment = await prisma.alertComment.create({
      data: { alertId: req.params.id, userId: req.auth?.user.id, body: input.body }
    });
    await writeAuditLog(req, "alert.comment", "alert", req.params.id);
    return res.status(201).json({ comment });
  })
);

alertsRouter.post(
  "/bulk",
  requireAuth,
  requirePermission("alerts:manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({ alertIds: z.array(z.string()).min(1), action: z.enum(["acknowledge", "investigate", "close", "reopen"]) })
      .parse(req.body);
    const statusMap = { acknowledge: "acknowledged", investigate: "investigating", close: "closed", reopen: "open" };
    const result = await prisma.alert.updateMany({
      where: { id: { in: input.alertIds } },
      data: { status: statusMap[input.action] }
    });
    await writeAuditLog(req, "alert.bulk", "alert", undefined, input);
    return res.json({ updated: result.count });
  })
);

