import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.js";

export const casesRouter = Router();

const caseSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  status: z.string().default("open"),
  severity: z.string().default("medium"),
  affectedHosts: z.array(z.string()).default([]),
  affectedUsers: z.array(z.string()).default([]),
  alertIds: z.array(z.string()).default([]),
  eventIds: z.array(z.string()).default([])
});

casesRouter.get(
  "/",
  requireAuth,
  requirePermission("cases:read"),
  asyncHandler(async (_req, res) => {
    const cases = await prisma.case.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { alerts: true, events: true, comments: true } } },
      take: 100
    });
    return res.json({ cases });
  })
);

casesRouter.post(
  "/",
  requireAuth,
  requirePermission("cases:manage"),
  asyncHandler(async (req, res) => {
    const input = caseSchema.parse(req.body);
    const createdCase = await prisma.case.create({
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        severity: input.severity,
        affectedHosts: input.affectedHosts,
        affectedUsers: input.affectedUsers,
        alerts: { create: input.alertIds.map((alertId) => ({ alertId })) },
        events: { create: input.eventIds.map((eventId) => ({ eventId })) },
        timeline: { create: { kind: "created", title: "Case created", details: { alertIds: input.alertIds, eventIds: input.eventIds } } }
      }
    });
    await writeAuditLog(req, "case.create", "case", createdCase.id);
    return res.status(201).json({ case: createdCase });
  })
);

casesRouter.get(
  "/:id",
  requireAuth,
  requirePermission("cases:read"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: {
        alerts: { include: { alert: true } },
        events: { include: { event: true } },
        comments: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
        timeline: { orderBy: { createdAt: "asc" } }
      }
    });
    if (!caseRecord) throw new HttpError(404, "Case not found");
    return res.json({ case: caseRecord });
  })
);

casesRouter.patch(
  "/:id",
  requireAuth,
  requirePermission("cases:manage"),
  asyncHandler(async (req, res) => {
    const input = caseSchema.partial().omit({ alertIds: true, eventIds: true }).parse(req.body);
    const caseRecord = await prisma.case.update({ where: { id: req.params.id }, data: input });
    await writeAuditLog(req, "case.update", "case", caseRecord.id, input);
    return res.json({ case: caseRecord });
  })
);

casesRouter.post(
  "/:id/comments",
  requireAuth,
  requirePermission("cases:manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ body: z.string().min(1) }).parse(req.body);
    const comment = await prisma.caseComment.create({
      data: { caseId: req.params.id, userId: req.auth?.user.id, body: input.body }
    });
    await prisma.caseTimelineItem.create({
      data: { caseId: req.params.id, kind: "comment", title: "Comment added", details: { commentId: comment.id } }
    });
    await writeAuditLog(req, "case.comment", "case", req.params.id);
    return res.status(201).json({ comment });
  })
);

casesRouter.post(
  "/:id/attach-alerts",
  requireAuth,
  requirePermission("cases:manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ alertIds: z.array(z.string()).min(1) }).parse(req.body);
    await prisma.caseAlert.createMany({
      data: input.alertIds.map((alertId) => ({ caseId: req.params.id, alertId })),
      skipDuplicates: true
    });
    await prisma.caseTimelineItem.create({
      data: { caseId: req.params.id, kind: "alert", title: "Alerts attached", details: { alertIds: input.alertIds } }
    });
    await writeAuditLog(req, "case.attach_alerts", "case", req.params.id, input);
    return res.json({ ok: true });
  })
);

casesRouter.get(
  "/:id/report.md",
  requireAuth,
  requirePermission("reports:export"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: {
        alerts: { include: { alert: true } },
        events: { include: { event: true } },
        comments: { include: { user: true } },
        timeline: true
      }
    });
    if (!caseRecord) throw new HttpError(404, "Case not found");

    const markdown = [
      `# ${caseRecord.title}`,
      "",
      `Status: ${caseRecord.status}`,
      `Severity: ${caseRecord.severity}`,
      `Affected hosts: ${caseRecord.affectedHosts.join(", ") || "None recorded"}`,
      `Affected users: ${caseRecord.affectedUsers.join(", ") || "None recorded"}`,
      "",
      "## Description",
      caseRecord.description || "No description provided.",
      "",
      "## Alerts",
      ...caseRecord.alerts.map((item) => `- ${item.alert.severity.toUpperCase()} ${item.alert.title} (${item.alert.status})`),
      "",
      "## Evidence Events",
      ...caseRecord.events.map(
        (item) => `- ${item.event.timestamp.toISOString()} ${item.event.host ?? "-"} ${item.event.eventType}: ${item.event.message}`
      ),
      "",
      "## Timeline",
      ...caseRecord.timeline.map((item) => `- ${item.createdAt.toISOString()} ${item.kind}: ${item.title}`),
      "",
      "## Comments",
      ...caseRecord.comments.map((item) => `- ${item.createdAt.toISOString()} ${item.user?.name ?? "Unknown"}: ${item.body}`)
    ].join("\n");

    await writeAuditLog(req, "case.export_markdown", "case", caseRecord.id);
    res.setHeader("content-type", "text/markdown; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${caseRecord.id}.md"`);
    return res.send(markdown);
  })
);

