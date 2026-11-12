import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { parseJson, stringifyJson, cuid } from "../lib/utils";
import { buildReport } from "../services/analytics";
import { buildReportPdf, buildReportWorkbook } from "../services/report-export";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);
// Reading a report is the "reports" module's own permission — without this
// the router only required being signed in.
router.use(requireModulePermission("reports", "view"));

const REPORT_KEYS = [
  "sales",
  "bookings",
  "operations",
  "finance",
  "b2b",
  "marketing",
  "team",
] as const;
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
    return ok(
      res,
      reports.map((r) => ({ ...r, filters: parseJson<Record<string, unknown>>(r.filters, {}) })),
    );
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

/**
 * Excel / PDF export of any report tab.
 *
 * Declared before `/:report` so the extension is never mistaken for a report
 * name, and using the same filters the screen sent so the file matches it.
 */
const exportParams = z.object({
  report: z.enum(["sales", "bookings", "operations", "finance", "b2b", "marketing", "team"]),
});

router.get(
  "/:report/export.xlsx",
  requireModulePermission("reports", "export"),
  validate(exportParams, "params"),
  asyncHandler(async (req, res) => {
    const { filename, buffer } = await buildReportWorkbook({
      organizationId: req.auth!.organizationId,
      report: req.params.report,
      filters: filtersFrom(req.query as Record<string, unknown>),
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Export",
      moduleId: "reports",
      label: `Report "${req.params.report}" exported to Excel`,
      req,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  }),
);

router.get(
  "/:report/export.pdf",
  requireModulePermission("reports", "export"),
  validate(exportParams, "params"),
  asyncHandler(async (req, res) => {
    const { filename, buffer } = await buildReportPdf({
      organizationId: req.auth!.organizationId,
      report: req.params.report,
      filters: filtersFrom(req.query as Record<string, unknown>),
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Export",
      moduleId: "reports",
      label: `Report "${req.params.report}" exported to PDF`,
      req,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  }),
);

/** Runs any report tab with the supplied filters. */
router.get(
  "/:report",
  validate(
    z.object({
      report: z.enum(["sales", "bookings", "operations", "finance", "b2b", "marketing", "team"]),
    }),
    "params",
  ),
  asyncHandler(async (req, res) => {
    const report = req.params.report as ReportKey;
    const data = await buildReport(
      req.auth!.organizationId,
      report,
      filtersFrom(req.query as Record<string, unknown>),
    );

    // For the team report, attach target vs actual data
    if (report === "team") {
      const targets = await prisma.record.findMany({
        where: {
          organizationId: req.auth!.organizationId,
          moduleId: "settings",
          tab: "Targets",
          deletedAt: null,
        },
      });
      const targetMap = new Map(targets.map((t) => [t.name, Number(t.amount)]));
      // Attach targets to each team member row in the report
      if (data && typeof data === "object" && "breakdown" in data) {
        const breakdown = (data as { breakdown: Array<Record<string, unknown>> }).breakdown;
        for (const row of breakdown) {
          const name = String(row["label"] ?? row["name"] ?? "");
          row["target"] = targetMap.get(name) ?? 0;
          const actual = Number(row["amount"] ?? row["value"] ?? 0);
          const target = Number(row["target"] ?? 0);
          row["variance"] = target > 0 ? Math.round(((actual - target) / target) * 100) : 0;
        }
      }
    }

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

// ── Team performance targets ────────────────────────────────────────────────────

const targetSchema = z.object({
  memberName: z.string().min(1).max(120),
  targetAmount: z.number().min(0),
  period: z.string().max(20).default("monthly"), // monthly | quarterly | yearly
});

/** List all team targets. */
router.get(
  "/targets/list",
  asyncHandler(async (req, res) => {
    const targets = await prisma.record.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        moduleId: "settings",
        tab: "Targets",
        deletedAt: null,
      },
      orderBy: { name: "asc" },
    });
    return ok(res, targets.map((t) => {
      const extra = parseJson<Record<string, unknown>>(t.extra as string, {});
      return {
        id: t.id,
        memberName: t.name,
        targetAmount: Number(t.amount),
        period: extra["period"] ?? "monthly",
        currency: t.currency || "INR",
      };
    }));
  }),
);

/** Set or update a team member's sales target. */
router.post(
  "/targets",
  requireModulePermission("reports", "edit"),
  validate(targetSchema),
  asyncHandler(async (req, res) => {
    const { memberName, targetAmount, period } = req.body as z.infer<typeof targetSchema>;

    // Upsert: find existing target for this member, update or create
    const existing = await prisma.record.findFirst({
      where: {
        organizationId: req.auth!.organizationId,
        moduleId: "settings",
        tab: "Targets",
        name: memberName,
        deletedAt: null,
      },
    });

    if (existing) {
      await prisma.record.update({
        where: { id: existing.id },
        data: { amount: targetAmount, extra: JSON.stringify({ period }) },
      });
    } else {
      await prisma.record.create({
        data: {
          id: cuid(),
          organizationId: req.auth!.organizationId,
          moduleId: "settings",
          tab: "Targets",
          reference: `TGT-${Date.now().toString(36).toUpperCase()}`,
          name: memberName,
          amount: targetAmount,
          currency: "INR",
          status: "Active",
          extra: JSON.stringify({ period }),
          meta: "{}",
          createdById: req.auth!.userId,
        },
      });
    }

    return created(res, { memberName, targetAmount, period, saved: true });
  }),
);

export default router;
