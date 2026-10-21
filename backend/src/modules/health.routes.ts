import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { env } from "../config/env";
import { MODULES } from "../domain/modules";

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
    return ok(res, { status: "ready", database: "up" });
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

export default router;
