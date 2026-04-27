import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../db.js";

export async function writeAuditLog(req: Request, action: string, entity: string, entityId?: string, metadata: unknown = {}) {
  await prisma.auditLog.create({
    data: {
      userId: req.auth?.user.id,
      action,
      entity,
      entityId,
      ipAddress: req.ip,
      metadata: metadata as Prisma.InputJsonValue
    }
  });
}
