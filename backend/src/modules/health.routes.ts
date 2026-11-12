import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { env } from "../config/env";
import { MODULES } from "../domain/modules";
import { renderMetrics } from "../lib/metrics";
import { UnauthorizedError, NotFoundError } from "../lib/errors";

const router = Router();

const startedAt = Date.now();

/** Liveness probe used by Docker / load balancers. */
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    },
  });
});

/** Readiness probe — verifies database connectivity. */
router.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    await prisma.$queryRawUnsafe("SELECT 1");
    return ok(res, {
      status: "ready",
      database: "up",
      // What is actually guarding this deployment, so ops can see a gap here
      // instead of discovering it after an incident.
      malwareScanning: env.CLAMAV_HOST ? "clamav" : "eicar-only",
      errorReporting: env.SENTRY_DSN ? "sentry" : "logs",
      alerting: env.ALERT_WEBHOOK_URL ? "webhook" : "logs",
    });
  }),
);

/** Service metadata and the module catalogue. */
router.get("/meta", (_req, res) => {
  res.json({
    success: true,
    data: {
      name: "Traveldesk API",
      version: "1.0.0",
      environment: env.NODE_ENV,
      modules: MODULES.map((m) => m.id),
      moduleCount: MODULES.length,
    },
  });
});

/**
 * Prometheus-style metrics. Off by default in production until a token is
 * configured, because request paths and memory use are internal details.
 */
router.get("/metrics", (req, res) => {
  if (env.METRICS_TOKEN) {
    const header = req.header("authorization") ?? "";
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const supplied = bearer || (req.header("x-metrics-token") ?? "");
    if (supplied !== env.METRICS_TOKEN) {
      throw new UnauthorizedError("Metrics token is missing or wrong");
    }
  } else if (env.NODE_ENV === "production") {
    throw new NotFoundError("Metrics");
  }
  res.type("text/plain; version=0.0.4").send(renderMetrics());
});

export default router;
