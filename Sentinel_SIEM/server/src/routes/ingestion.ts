import { Router } from "express";
import type { Prisma } from "@prisma/client";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { ingestEvents, parseUpload } from "../services/ingestion.js";
import { writeAuditLog } from "../services/audit.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

export const ingestionRouter = Router();

const ingestSchema = z.object({
  events: z.union([z.record(z.unknown()), z.array(z.record(z.unknown()))]),
  sourceName: z.string().min(1).default("API sender"),
  dataSourceId: z.string().optional(),
  mapping: z.record(z.string()).optional()
});

ingestionRouter.post(
  "/events",
  requireAuth,
  requirePermission("events:write"),
  asyncHandler(async (req, res) => {
    const input = ingestSchema.parse(req.body);
    const events = Array.isArray(input.events) ? input.events : [input.events];
    const result = await ingestEvents(events, {
      sourceName: input.sourceName,
      sourceType: "api",
      dataSourceId: input.dataSourceId,
      mapping: input.mapping
    });
    await writeAuditLog(req, "ingest.api", "ingestion_batch", result.batchId, result);
    return res.status(202).json(result);
  })
);

ingestionRouter.post(
  "/upload",
  requireAuth,
  requirePermission("events:write"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Upload a JSON, CSV, or syslog file using field name 'file'");
    }

    const parsed = parseUpload(req.file.buffer, req.file.originalname, req.body.sourceType);
    const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : undefined;
    const result = await ingestEvents(parsed.rows, {
      sourceName: req.body.sourceName || req.file.originalname,
      sourceType: parsed.sourceType,
      dataSourceId: req.body.dataSourceId,
      mapping
    });
    await writeAuditLog(req, "ingest.upload", "ingestion_batch", result.batchId, {
      filename: req.file.originalname,
      ...result
    });
    return res.status(202).json(result);
  })
);

ingestionRouter.get(
  "/status",
  requireAuth,
  requirePermission("events:read"),
  asyncHandler(async (_req, res) => {
    const [sources, batches, errors] = await Promise.all([
      prisma.dataSource.findMany({ orderBy: { lastSeenAt: "desc" }, take: 50 }),
      prisma.ingestionBatch.findMany({ orderBy: { startedAt: "desc" }, take: 20, include: { dataSource: true } }),
      prisma.ingestionError.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { batch: true } })
    ]);

    return res.json({ sources, batches, errors });
  })
);

ingestionRouter.get(
  "/parsers",
  requireAuth,
  requirePermission("events:read"),
  asyncHandler(async (_req, res) => {
    const parsers = await prisma.parserMapping.findMany({ orderBy: { createdAt: "desc" }, include: { dataSource: true } });
    return res.json({ parsers });
  })
);

ingestionRouter.post(
  "/parsers",
  requireAuth,
  requirePermission("events:write"),
  asyncHandler(async (req, res) => {
    const parser = await prisma.parserMapping.create({
      data: {
        name: String(req.body.name),
        sourceType: String(req.body.sourceType ?? "json"),
        mapping: (req.body.mapping ?? {}) as Prisma.InputJsonValue,
        sample: (req.body.sample ?? {}) as Prisma.InputJsonValue,
        dataSourceId: req.body.dataSourceId || undefined
      }
    });
    await writeAuditLog(req, "parser.create", "parser_mapping", parser.id);
    return res.status(201).json({ parser });
  })
);
