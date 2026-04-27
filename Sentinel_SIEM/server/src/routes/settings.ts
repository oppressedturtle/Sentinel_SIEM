import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.js";

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  requireAuth,
  requirePermission("dashboards:read"),
  asyncHandler(async (_req, res) => {
    const [customFields, customSchemas, themes, retentionPolicies, notificationChannels] = await Promise.all([
      prisma.customField.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.customSchema.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.themePreference.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.retentionPolicy.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.notificationChannel.findMany({ orderBy: { createdAt: "desc" } })
    ]);

    return res.json({
      customFields,
      customSchemas,
      themes,
      retentionPolicies,
      notificationChannels,
      alertStatuses: ["open", "acknowledged", "investigating", "closed"],
      severityLevels: ["low", "medium", "high", "critical"],
      ruleTemplates: [
        { name: "Keyword match", type: "keyword", definition: { keyword: "powershell", lookbackMinutes: 60 } },
        { name: "Authentication threshold", type: "threshold", definition: { filters: { category: "authentication" }, threshold: 5 } },
        { name: "Host sequence", type: "sequence", definition: { groupBy: "host", sequence: [] } }
      ],
      futureConnectors: ["cloud", "firewall", "endpoint", "identity"]
    });
  })
);

settingsRouter.post(
  "/custom-fields",
  requireAuth,
  requirePermission("settings:manage"),
  asyncHandler(async (req, res) => {
    const customField = await prisma.customField.create({
      data: {
        name: String(req.body.name),
        fieldType: String(req.body.fieldType ?? "string"),
        appliesTo: String(req.body.appliesTo ?? "event"),
        description: String(req.body.description ?? "")
      }
    });
    await writeAuditLog(req, "settings.custom_field.create", "custom_field", customField.id);
    return res.status(201).json({ customField });
  })
);

settingsRouter.post(
  "/notification-channels",
  requireAuth,
  requirePermission("settings:manage"),
  asyncHandler(async (req, res) => {
    const notificationChannel = await prisma.notificationChannel.create({
      data: {
        name: String(req.body.name),
        type: String(req.body.type ?? "webhook"),
        config: (req.body.config ?? {}) as Prisma.InputJsonValue,
        enabled: Boolean(req.body.enabled ?? true)
      }
    });
    await writeAuditLog(req, "settings.notification_channel.create", "notification_channel", notificationChannel.id);
    return res.status(201).json({ notificationChannel });
  })
);

settingsRouter.post(
  "/retention-policies",
  requireAuth,
  requirePermission("settings:manage"),
  asyncHandler(async (req, res) => {
    const retentionPolicy = await prisma.retentionPolicy.create({
      data: {
        name: String(req.body.name),
        target: String(req.body.target ?? "events"),
        days: Number(req.body.days ?? 90),
        enabled: Boolean(req.body.enabled ?? true)
      }
    });
    await writeAuditLog(req, "settings.retention_policy.create", "retention_policy", retentionPolicy.id);
    return res.status(201).json({ retentionPolicy });
  })
);
