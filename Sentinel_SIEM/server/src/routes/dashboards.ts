import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { subDays, formatISO } from "date-fns";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.js";

export const dashboardsRouter = Router();

const dashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  layout: z.record(z.unknown()).default({}),
  widgets: z
    .array(
      z.object({
        type: z.string(),
        title: z.string(),
        query: z.record(z.unknown()).default({}),
        position: z.record(z.unknown()).default({}),
        options: z.record(z.unknown()).default({})
      })
    )
    .default([])
});

dashboardsRouter.get(
  "/stats",
  requireAuth,
  requirePermission("dashboards:read"),
  asyncHandler(async (_req, res) => {
    const since = subDays(new Date(), 7);
    const [openAlerts, eventsCount, casesCount, sources, severityDistribution, topHosts, topUsers, topIps, categories, alerts] =
      await Promise.all([
        prisma.alert.count({ where: { status: { not: "closed" } } }),
        prisma.event.count({ where: { timestamp: { gte: since } } }),
        prisma.case.count({ where: { status: { not: "closed" } } }),
        prisma.dataSource.findMany({ orderBy: { lastSeenAt: "desc" }, take: 6 }),
        prisma.event.groupBy({ by: ["severity"], _count: { severity: true }, where: { timestamp: { gte: since } } }),
        prisma.event.groupBy({ by: ["host"], _count: { host: true }, where: { timestamp: { gte: since }, host: { not: null } }, orderBy: { _count: { host: "desc" } }, take: 8 }),
        prisma.event.groupBy({ by: ["userName"], _count: { userName: true }, where: { timestamp: { gte: since }, userName: { not: null } }, orderBy: { _count: { userName: "desc" } }, take: 8 }),
        prisma.event.groupBy({ by: ["sourceIp"], _count: { sourceIp: true }, where: { timestamp: { gte: since }, sourceIp: { not: null } }, orderBy: { _count: { sourceIp: "desc" } }, take: 8 }),
        prisma.event.groupBy({ by: ["category"], _count: { category: true }, where: { timestamp: { gte: since }, category: { not: null } }, orderBy: { _count: { category: "desc" } }, take: 8 }),
        prisma.alert.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })
      ]);

    const alertBuckets = new Map<string, number>();
    for (let i = 6; i >= 0; i -= 1) {
      alertBuckets.set(formatISO(subDays(new Date(), i), { representation: "date" }), 0);
    }
    for (const alert of alerts) {
      const key = formatISO(alert.createdAt, { representation: "date" });
      alertBuckets.set(key, (alertBuckets.get(key) ?? 0) + 1);
    }

    return res.json({
      metrics: { openAlerts, eventsCount, casesCount, sourceCount: sources.length },
      sources,
      severityDistribution: severityDistribution.map((item) => ({ name: item.severity, value: item._count.severity })),
      topHosts: topHosts.map((item) => ({ name: item.host, value: item._count.host })),
      topUsers: topUsers.map((item) => ({ name: item.userName, value: item._count.userName })),
      topIps: topIps.map((item) => ({ name: item.sourceIp, value: item._count.sourceIp })),
      categories: categories.map((item) => ({ name: item.category, value: item._count.category })),
      alertsOverTime: Array.from(alertBuckets.entries()).map(([date, count]) => ({ date, count }))
    });
  })
);

dashboardsRouter.get(
  "/",
  requireAuth,
  requirePermission("dashboards:read"),
  asyncHandler(async (_req, res) => {
    const dashboards = await prisma.dashboard.findMany({ include: { widgets: true }, orderBy: { updatedAt: "desc" } });
    return res.json({ dashboards });
  })
);

dashboardsRouter.post(
  "/",
  requireAuth,
  requirePermission("dashboards:manage"),
  asyncHandler(async (req, res) => {
    const input = dashboardSchema.parse(req.body);
    const dashboard = await prisma.dashboard.create({
      data: {
        name: input.name,
        description: input.description,
        layout: input.layout as Prisma.InputJsonValue,
        widgets: { create: input.widgets as Prisma.DashboardWidgetCreateWithoutDashboardInput[] }
      },
      include: { widgets: true }
    });
    await writeAuditLog(req, "dashboard.create", "dashboard", dashboard.id);
    return res.status(201).json({ dashboard });
  })
);

dashboardsRouter.put(
  "/:id",
  requireAuth,
  requirePermission("dashboards:manage"),
  asyncHandler(async (req, res) => {
    const input = dashboardSchema.parse(req.body);
    const dashboard = await prisma.dashboard.update({
      where: { id: req.params.id },
      data: {
        name: input.name,
        description: input.description,
        layout: input.layout as Prisma.InputJsonValue,
        widgets: {
          deleteMany: {},
          create: input.widgets as Prisma.DashboardWidgetCreateWithoutDashboardInput[]
        }
      },
      include: { widgets: true }
    });
    await writeAuditLog(req, "dashboard.update", "dashboard", dashboard.id);
    return res.json({ dashboard });
  })
);

dashboardsRouter.post(
  "/:id/clone",
  requireAuth,
  requirePermission("dashboards:manage"),
  asyncHandler(async (req, res) => {
    const source = await prisma.dashboard.findUnique({ where: { id: req.params.id }, include: { widgets: true } });
    if (!source) throw new HttpError(404, "Dashboard not found");
    const dashboard = await prisma.dashboard.create({
      data: {
        name: `${source.name} copy`,
        description: source.description,
        layout: (source.layout ?? {}) as Prisma.InputJsonValue,
        widgets: {
          create: source.widgets.map((widget) => ({
            type: widget.type,
            title: widget.title,
            query: (widget.query ?? {}) as Prisma.InputJsonValue,
            position: (widget.position ?? {}) as Prisma.InputJsonValue,
            options: (widget.options ?? {}) as Prisma.InputJsonValue
          }))
        }
      },
      include: { widgets: true }
    });
    await writeAuditLog(req, "dashboard.clone", "dashboard", dashboard.id, { sourceId: source.id });
    return res.status(201).json({ dashboard });
  })
);

dashboardsRouter.get(
  "/:id/export",
  requireAuth,
  requirePermission("dashboards:read"),
  asyncHandler(async (req, res) => {
    const dashboard = await prisma.dashboard.findUnique({ where: { id: req.params.id }, include: { widgets: true } });
    if (!dashboard) throw new HttpError(404, "Dashboard not found");
    return res.json({ dashboard });
  })
);

dashboardsRouter.post(
  "/import",
  requireAuth,
  requirePermission("dashboards:manage"),
  asyncHandler(async (req, res) => {
    const input = dashboardSchema.parse(req.body.dashboard ?? req.body);
    const dashboard = await prisma.dashboard.create({
      data: {
        name: `${input.name} (imported)`,
        description: input.description,
        layout: input.layout as Prisma.InputJsonValue,
        widgets: { create: input.widgets as Prisma.DashboardWidgetCreateWithoutDashboardInput[] }
      },
      include: { widgets: true }
    });
    await writeAuditLog(req, "dashboard.import", "dashboard", dashboard.id);
    return res.status(201).json({ dashboard });
  })
);
