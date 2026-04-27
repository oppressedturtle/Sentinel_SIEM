import crypto from "node:crypto";
import { config } from "../config.js";

export const SESSION_COOKIE = "sentinel_session";

export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(`${config.sessionSecret}:${value}`).digest("hex");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function constantTimeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

