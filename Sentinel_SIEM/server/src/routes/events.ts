import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { searchEvents } from "../services/search.js";
import { writeAuditLog } from "../services/audit.js";

export const eventsRouter = Router();

eventsRouter.get(
  "/",
  requireAuth,
  requirePermission("events:read"),
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 50);
    const filters = {
      q: req.query.q?.toString(),
      from: req.query.from?.toString(),
      to: req.query.to?.toString(),
      host: req.query.host?.toString(),
      userName: req.query.userName?.toString(),
      sourceIp: req.query.sourceIp?.toString(),
      destinationIp: req.query.destinationIp?.toString(),
      eventType: req.query.eventType?.toString(),
      severity: req.query.severity?.toString(),
      category: req.query.category?.toString()
    };

    const result = await searchEvents(filters, page, pageSize);
    return res.json(result);
  })
);

eventsRouter.get(
  "/saved-searches",
  requireAuth,
  requirePermission("events:read"),
  asyncHandler(async (_req, res) => {
    const savedSearches = await prisma.savedSearch.findMany({ orderBy: { updatedAt: "desc" } });
    return res.json({ savedSearches });
  })
);

eventsRouter.post(
  "/saved-searches",
  requireAuth,
  requirePermission("events:read"),
  asyncHandler(async (req, res) => {
    const input = z.object({ name: z.string().min(1), query: z.record(z.unknown()) }).parse(req.body);
    const savedSearch = await prisma.savedSearch.create({
      data: { name: input.name, query: input.query, createdBy: req.auth?.user.id }
    });
    await writeAuditLog(req, "saved_search.create", "saved_search", savedSearch.id);
    return res.status(201).json({ savedSearch });
  })
);

eventsRouter.post(
  "/attach-to-case",
  requireAuth,
  requirePermission("cases:manage"),
  asyncHandler(async (req, res) => {
    const input = z.object({ caseId: z.string(), eventIds: z.array(z.string()).min(1) }).parse(req.body);
    await prisma.caseEvent.createMany({
      data: input.eventIds.map((eventId) => ({ caseId: input.caseId, eventId })),
      skipDuplicates: true
    });
    await prisma.caseTimelineItem.create({
      data: {
        caseId: input.caseId,
        kind: "evidence",
        title: "Events attached from search",
        details: { eventIds: input.eventIds }
      }
    });
    await writeAuditLog(req, "case.attach_events", "case", input.caseId, { eventIds: input.eventIds });
    return res.json({ ok: true });
  })
);

