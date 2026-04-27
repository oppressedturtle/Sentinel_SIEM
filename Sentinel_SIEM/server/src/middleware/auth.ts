import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../http.js";
import type { AuthContext, AuthUser } from "../types.js";
import { hashSecret, randomToken, SESSION_COOKIE } from "../utils/security.js";

const SESSION_DAYS = 7;

// Auth is session-first for humans and scoped API-key based for external log senders.
type LoadedUser = NonNullable<Awaited<ReturnType<typeof loadUserRecord>>>;

async function loadUserRecord(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, status: "active" },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } }
            }
          }
        }
      }
    }
  });
}

function buildUser(user: LoadedUser): AuthUser {
  const roles = user.roles.map((userRole) => userRole.role.name);
  const permissions = new Set<string>();

  for (const userRole of user.roles) {
    for (const rolePermission of userRole.role.permissions) {
      permissions.add(rolePermission.permission.key);
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    roles,
    permissions: Array.from(permissions).sort()
  };
}

async function loadUser(userId: string) {
  const user = await loadUserRecord(userId);

  return user ? buildUser(user) : null;
}

function getBearerToken(req: Request) {
  const authorization = req.header("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }

  return authorization.slice("bearer ".length).trim();
}

async function getSessionAuth(req: Request): Promise<AuthContext | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const session = await prisma.session.findFirst({
    where: {
      tokenHash: hashSecret(token),
      expiresAt: { gt: new Date() }
    }
  });

  if (!session) {
    return null;
  }

  const user = await loadUser(session.userId);
  return user ? { user, authMethod: "session", sessionId: session.id } : null;
}

async function getApiKeyAuth(req: Request): Promise<AuthContext | null> {
  const rawKey = req.header("x-api-key") ?? getBearerToken(req);
  if (!rawKey) {
    return null;
  }

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash: hashSecret(rawKey),
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    }
  });

  if (!apiKey) {
    return null;
  }

  const user = await loadUser(apiKey.userId);
  if (!user) {
    return null;
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });

  return { user, authMethod: "apiKey", apiKeyId: apiKey.id, apiKeyScopes: apiKey.scopes };
}

export async function attachAuth(req: Request, _res: Response, next: NextFunction) {
  req.auth = (await getSessionAuth(req)) ?? (await getApiKeyAuth(req)) ?? undefined;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    return next(new HttpError(401, "Authentication required"));
  }

  return next();
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new HttpError(401, "Authentication required"));
    }

    const userAllowed =
      req.auth.authMethod === "session" &&
      (req.auth.user.permissions.includes(permission) || req.auth.user.permissions.includes("admin:manage"));
    const apiKeyAllowed = req.auth.authMethod === "apiKey" && req.auth.apiKeyScopes?.includes(permission);

    if (!userAllowed && !apiKeyAllowed) {
      return next(new HttpError(403, `Missing permission: ${permission}`));
    }

    return next();
  };
}

export async function verifyPassword(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), status: "active" },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } }
            }
          }
        }
      }
    }
  });

  if (!user) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? buildUser(user) : null;
}

export async function createSession(res: Response, req: Request, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      tokenHash: hashSecret(token),
      userId,
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
      expiresAt
    }
  });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    expires: expiresAt
  });

  return session;
}

export async function destroySession(req: Request, res: Response) {
  if (req.auth?.sessionId) {
    await prisma.session.deleteMany({ where: { id: req.auth.sessionId } });
  }

  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax"
  });
}
