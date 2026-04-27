import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../http.js";
import { createSession, destroySession, requireAuth, verifyPassword } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await verifyPassword(input.email, input.password);
    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }

    await createSession(res, req, user.id);
    req.auth = { user, authMethod: "session" };
    await writeAuditLog(req, "auth.login", "user", user.id);
    return res.json({ user });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await writeAuditLog(req, "auth.logout", "user", req.auth?.user.id);
    await destroySession(req, res);
    return res.json({ ok: true });
  })
);

authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.auth?.user });
});

