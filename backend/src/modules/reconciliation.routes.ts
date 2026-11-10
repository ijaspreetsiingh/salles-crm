/**
 * Payment Reconciliation API.
 *
 * GET  /reconciliation/summary   Dashboard summary of matched/unmatched payments
 * POST /reconciliation/run       Trigger a manual batch reconciliation run
 */

import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { runBatchReconciliation, getReconciliationSummary } from "../services/reconciliation";

const router = Router();
router.use(requireAuth);
router.use(requirePermission("view"));

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const summary = await getReconciliationSummary(
      req.auth!.organizationId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
    return ok(res, summary);
  }),
);

router.post(
  "/run",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const result = await runBatchReconciliation(req.auth!.organizationId);
    return ok(res, result);
  }),
);

export default router;
