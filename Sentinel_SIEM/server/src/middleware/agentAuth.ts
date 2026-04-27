import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { HttpError } from "../http.js";
import { hashSecret } from "../utils/security.js";

function getAgentKey(req: Request) {
  const headerKey = req.header("x-agent-key");
  if (headerKey) return headerKey.trim();

  const authorization = req.header("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return undefined;
}

export async function requireAgentAuth(req: Request, _res: Response, next: NextFunction) {
  const rawKey = getAgentKey(req);
  if (!rawKey) {
    return next(new HttpError(401, "Agent API key required"));
  }

  const agent = await prisma.agent.findFirst({
    where: {
      apiKeyHash: hashSecret(rawKey),
      status: { in: ["enabled", "disabled"] }
    }
  });

  if (!agent) {
    return next(new HttpError(401, "Invalid agent API key"));
  }

  if (agent.status !== "enabled") {
    return next(new HttpError(403, "Agent is disabled"));
  }

  req.agent = {
    id: agent.id,
    hostname: agent.hostname,
    status: agent.status,
    apiKeyPrefix: agent.apiKeyPrefix,
    dataSourceId: agent.dataSourceId,
    policy: (agent.policy ?? {}) as Record<string, unknown>,
    tags: agent.tags
  };

  return next();
}

