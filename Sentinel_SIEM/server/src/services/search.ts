import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { EventFilters } from "../types.js";

// Keep search behind this service so PostgreSQL filtering can later be swapped for OpenSearch.
export function buildEventWhere(filters: EventFilters): Prisma.EventWhereInput {
  const where: Prisma.EventWhereInput = {};

  if (filters.from || filters.to) {
    where.timestamp = {
      gte: filters.from ? new Date(filters.from) : undefined,
      lte: filters.to ? new Date(filters.to) : undefined
    };
  }

  if (filters.host) where.host = { contains: filters.host, mode: "insensitive" };
  if (filters.userName) where.userName = { contains: filters.userName, mode: "insensitive" };
  if (filters.sourceIp) where.sourceIp = { contains: filters.sourceIp, mode: "insensitive" };
  if (filters.destinationIp) where.destinationIp = { contains: filters.destinationIp, mode: "insensitive" };
  if (filters.eventType) where.eventType = { contains: filters.eventType, mode: "insensitive" };
  if (filters.severity) where.severity = filters.severity;
  if (filters.category) where.category = { contains: filters.category, mode: "insensitive" };

  if (filters.q) {
    where.searchText = { contains: filters.q.toLowerCase(), mode: "insensitive" };
  }

  return where;
}

export async function searchEvents(filters: EventFilters, page = 1, pageSize = 50) {
  const take = Math.min(Math.max(pageSize, 1), 200);
  const skip = (Math.max(page, 1) - 1) * take;
  const where = buildEventWhere(filters);

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip,
      take,
      include: { dataSource: true }
    }),
    prisma.event.count({ where })
  ]);

  return { events, total, page, pageSize: take };
}
