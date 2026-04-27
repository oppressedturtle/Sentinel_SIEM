import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { errorHandler } from "./http.js";
import { attachAuth } from "./middleware/auth.js";
import { apiRouter } from "./routes/index.js";

const app = express();

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: config.isProduction ? undefined : false
  })
);
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true
  })
);
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(attachAuth);
app.use("/api", apiRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../client");
app.use(express.static(clientDist));
app.get("*", (_req, res, next) => {
  if (config.isProduction) {
    return res.sendFile(path.join(clientDist, "index.html"));
  }
  return next();
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Sentinel Forge API listening on http://localhost:${config.port}`);
});

