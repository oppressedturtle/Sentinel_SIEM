import type { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { prisma } from "../db.js";
import { HttpError } from "../http.js";
import { normalizeEvent, parseSyslogLine } from "./normalizer.js";

type IngestOptions = {
  sourceName: string;
  sourceType: "json" | "csv" | "syslog" | "api";
  dataSourceId?: string;
  mapping?: Record<string, string>;
};

// File and API ingestion share one normalization path so parsers stay consistent.
export function parseUpload(buffer: Buffer, filename: string, explicitType?: string) {
  const text = buffer.toString("utf8");
  const lowerName = filename.toLowerCase();
  const sourceType = explicitType || (lowerName.endsWith(".csv") ? "csv" : lowerName.endsWith(".log") ? "syslog" : "json");

  if (sourceType === "csv") {
    return {
      sourceType: "csv" as const,
      rows: parse(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, unknown>[]
    };
  }

  if (sourceType === "syslog") {
    return {
      sourceType: "syslog" as const,
      rows: text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(parseSyslogLine)
    };
  }

  try {
    const parsed = JSON.parse(text);
    return { sourceType: "json" as const, rows: Array.isArray(parsed) ? parsed : [parsed] };
  } catch {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { sourceType: "json" as const, rows };
  }
}

export async function ingestEvents(rawEvents: Record<string, unknown>[], options: IngestOptions) {
  const source = options.dataSourceId
    ? await prisma.dataSource.findUnique({ where: { id: options.dataSourceId } })
    : await prisma.dataSource.upsert({
        where: { name: options.sourceName },
        update: { status: "healthy", lastSeenAt: new Date(), parserType: options.sourceType },
        create: {
          name: options.sourceName,
          type: options.sourceType === "api" ? "api" : "upload",
          parserType: options.sourceType,
          status: "healthy",
          lastSeenAt: new Date()
        }
      });

  if (!source) {
    throw new HttpError(404, "Data source not found");
  }

  const batch = await prisma.ingestionBatch.create({
    data: {
      sourceName: options.sourceName,
      sourceType: options.sourceType,
      status: "running",
      receivedCount: rawEvents.length,
      dataSourceId: source.id
    }
  });

  let acceptedCount = 0;
  let rejectedCount = 0;

  for (const [index, raw] of rawEvents.entries()) {
    try {
      const normalized = normalizeEvent(raw, options.mapping);
      await prisma.event.create({
        data: {
          timestamp: normalized.timestamp,
          host: normalized.host,
          userName: normalized.userName,
          sourceIp: normalized.sourceIp,
          destinationIp: normalized.destinationIp,
          eventType: normalized.eventType,
          category: normalized.category,
          severity: normalized.severity,
          message: normalized.message,
          raw: normalized.raw as Prisma.InputJsonValue,
          normalized: normalized.normalized as Prisma.InputJsonValue,
          searchText: normalized.searchText,
          dataSourceId: source.id
        }
      });
      acceptedCount += 1;
    } catch (error) {
      rejectedCount += 1;
      await prisma.ingestionError.create({
        data: {
          batchId: batch.id,
          line: index + 1,
          message: error instanceof Error ? error.message : "Unknown ingestion error",
          raw: JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue
        }
      });
    }
  }

  await prisma.ingestionBatch.update({
    where: { id: batch.id },
    data: {
      status: rejectedCount > 0 && acceptedCount === 0 ? "failed" : rejectedCount > 0 ? "partial" : "completed",
      acceptedCount,
      rejectedCount,
      completedAt: new Date()
    }
  });

  await prisma.dataSource.update({
    where: { id: source.id },
    data: { status: rejectedCount > acceptedCount ? "degraded" : "healthy", lastSeenAt: new Date() }
  });

  return { batchId: batch.id, receivedCount: rawEvents.length, acceptedCount, rejectedCount, dataSourceId: source.id };
}
