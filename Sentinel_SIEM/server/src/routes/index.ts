import { Router } from "express";
import { adminRouter } from "./admin.js";
import { agentsRouter } from "./agents.js";
import { alertsRouter } from "./alerts.js";
import { authRouter } from "./auth.js";
import { casesRouter } from "./cases.js";
import { dashboardsRouter } from "./dashboards.js";
import { eventsRouter } from "./events.js";
import { ingestionRouter } from "./ingestion.js";
import { rulesRouter } from "./rules.js";
import { settingsRouter } from "./settings.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/agents", agentsRouter);
apiRouter.use("/ingest", ingestionRouter);
apiRouter.use("/events", eventsRouter);
apiRouter.use("/rules", rulesRouter);
apiRouter.use("/alerts", alertsRouter);
apiRouter.use("/cases", casesRouter);
apiRouter.use("/dashboards", dashboardsRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/admin", adminRouter);

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sentinel-forge-api" });
});
