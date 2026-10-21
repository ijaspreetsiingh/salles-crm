import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { parseJson, stringifyJson } from "../lib/utils";
import { buildReport } from "../services/analytics";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const REPORT_KEYS = ["sales", "bookings", "operations", "finance", "b2b", "marketing", "team"] as const;
type ReportKey = (typeof REPORT_KEYS)[number];

const savedReportSchema = z.object({
  title: z.string().min(2).max(120),
  report: z.enum(["sales", "bookings", "operations", "finance", "b2b", "marketing", "team"]),
  filters: z.record(z.unknown()).default({}),
});

const filtersFrom = (query: Record<string, unknown>) => ({
  branch: (query.branch as string) || undefined,
  from: (query.from as string) || undefined,
  to: (query.to as string) || undefined,
});

/** Saved reports list (reports → saved reports tab). */
router.get(
  "/saved",
  asyncHandler(async (req, res) => {
    const reports = await prisma.savedReport.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, reports.map((r) => ({ ...r, filters: parseJson<Record<string, unknown>>(r.filters, {}) })));
  }),
);

router.post(
  "/saved",
  validate(savedReportSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof savedReportSchema>;
    const report = await prisma.savedReport.create({
      data: {
        organizationId: req.auth!.organizationId,
        title: body.title,
        moduleId: body.report,
        filters: stringifyJson(body.filters),
        createdById: req.auth!.userId,
      },
    });
    return created(res, { ...report, filters: body.filters });
  }),
);

router.delete(
  "/saved/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.savedReport.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Saved report");
    await prisma.savedReport.delete({ where: { id: existing.id } });
    return ok(res, { deleted: true });
  }),
);

/** Runs any report tab with the supplied filters. */
router.get(
  "/:report",
  validate(z.object({ report: z.enum(["sales", "bookings", "operations", "finance", "b2b", "marketing", "team"]) }), "params"),
  asyncHandler(async (req, res) => {
    const report = req.params.report as ReportKey;
    const data = await buildReport(
      req.auth!.organizationId,
      report,
      filtersFrom(req.query as Record<string, unknown>),
    );

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Export",
      moduleId: "reports",
      label: `Report "${report}" generated`,
      req,
    });

    return ok(res, data);
  }),
);

export default router;
