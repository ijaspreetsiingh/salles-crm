/**
 * Companies & Corporate — travel requests, cost centres, approval workflow.
 *
 * Corporate travel differs from leisure: a company buys travel for employees,
 * has a travel policy (class of travel, hotel star rating, per-diem caps),
 * and routes spend through cost centres (departments / projects). Every trip
 * request must pass through an approval chain before the consultant books.
 *
 * Routes:
 *   GET    /corporate/companies                  — list companies (uses workspace records)
 *   POST   /corporate/travel-requests            — employee raises a trip request
 *   GET    /corporate/travel-requests            — list all requests (filtered by company/status)
 *   PATCH  /corporate/travel-requests/:id        — update request (edit budget, travel dates)
 *   POST   /corporate/travel-requests/:id/approve — approve; next level or final
 *   POST   /corporate/travel-requests/:id/reject  — reject with reason
 *   GET    /corporate/cost-centres               — list cost centres for a company
 *   POST   /corporate/cost-centres               — create a cost centre
 *   PATCH  /corporate/cost-centres/:id           — rename / change budget
 *   DELETE /corporate/cost-centres/:id           — remove (only if no pending requests)
 *   GET    /corporate/policies                   — travel policy for a company
 *   PUT    /corporate/policies/:companyId        — save / replace a company's travel policy
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { cuid, parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { createNotification } from "../services/notifications";
import { eventCreated, eventStatusChange } from "../services/timeline";
import { applyBranchScope, toRecordDto } from "../services/records";
import { MODULES } from "../domain/modules";

const router = Router();
router.use(requireAuth);

// ─── Companies ───────────────────────────────────────────────────────────────

/**
 * The corporate accounts themselves. Travel requests, cost centres and travel
 * policies all hang off one of these, so the corporate screens need the real
 * ids — not a placeholder.
 */
router.get(
  "/companies",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const rows = await prisma.record.findMany({
      where: applyBranchScope(
        {
          organizationId,
          moduleId: "companies",
          tab: "Companies",
          deletedAt: null,
        },
        req.auth!,
      ),
      orderBy: { name: "asc" },
    });
    return ok(
      res,
      rows.map((r) => ({ id: r.id, name: r.name, reference: r.reference })),
    );
  }),
);

// ─── Cost centres ────────────────────────────────────────────────────────────

const costCentreSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional(),
  budget: z.number().min(0).optional(),
  currency: z.string().max(6).default("INR"),
  managerId: z.string().optional(),
  active: z.boolean().default(true),
});

router.get(
  "/cost-centres",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const companyId = req.query.companyId as string | undefined;

    // Cost centres are stored as records in the "companies" module with a
    // special tab = "Cost centres" so they appear in the right list without
    // a new table, and the workspace's branch scoping still works.
    const rows = await prisma.record.findMany({
      where: applyBranchScope(
        {
          organizationId,
          moduleId: "companies",
          tab: "Cost centres",
          deletedAt: null,
          ...(companyId ? { extra: { contains: companyId } } : {}),
        },
        req.auth!,
      ),
      orderBy: { name: "asc" },
    });

    return ok(
      res,
      rows.map((r) => {
        const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
        return {
          id: r.id,
          name: r.name,
          code: extra["code"] ?? "",
          companyId: extra["companyId"] ?? "",
          budget: extra["budget"] ?? 0,
          currency: r.currency || "INR",
          managerId: extra["managerId"] ?? null,
          active: r.status === "Active",
          createdAt: r.createdAt.toISOString(),
        };
      }),
    );
  }),
);

router.post(
  "/cost-centres",
  requirePermission("create"),
  validate(costCentreSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof costCentreSchema>;

    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "companies",
        tab: "Cost centres",
        reference: `CC-${Date.now().toString(36).toUpperCase()}`,
        name: body.name,
        detail: `Cost centre for company ${body.companyId}`,
        status: body.active ? "Active" : "Inactive",
        currency: body.currency,
        amount: body.budget ?? 0,
        extra: JSON.stringify({
          companyId: body.companyId,
          code: body.code ?? "",
          budget: body.budget ?? 0,
          managerId: body.managerId ?? null,
          type: "cost_centre",
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    void eventCreated(organizationId, record.id, record.reference, "Cost Centre", userId, actorName);
    return created(res, { id: record.id, name: record.name });
  }),
);

router.patch(
  "/cost-centres/:id",
  requirePermission("edit"),
  validate(costCentreSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof costCentreSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "companies", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Cost centre");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.budget !== undefined ? { amount: body.budget } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.active !== undefined ? { status: body.active ? "Active" : "Inactive" } : {}),
        extra: JSON.stringify({
          ...extra,
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.budget !== undefined ? { budget: body.budget } : {}),
          ...(body.managerId !== undefined ? { managerId: body.managerId } : {}),
        }),
        updatedById: req.auth!.userId,
      },
    });

    return ok(res, { updated: true });
  }),
);

router.delete(
  "/cost-centres/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "companies", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Cost centre");

    // Safety: refuse if open travel requests reference this cost centre.
    const openRequests = await prisma.record.count({
      where: {
        organizationId,
        moduleId: "companies",
        tab: "Travel requests",
        status: { notIn: ["Approved", "Rejected", "Cancelled"] },
        extra: { contains: existing.id },
        deletedAt: null,
      },
    });
    if (openRequests > 0) {
      throw new BadRequestError(
        `This cost centre has ${openRequests} open travel request${openRequests === 1 ? "" : "s"}. Close them before deleting.`,
      );
    }

    await prisma.record.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return ok(res, { deleted: true });
  }),
);

// ─── Travel policies ─────────────────────────────────────────────────────────

const policySchema = z.object({
  flightClass: z.enum(["Economy", "Premium Economy", "Business", "First"]).default("Economy"),
  hotelStarMax: z.number().int().min(1).max(5).default(4),
  perDiemCap: z.number().min(0).default(5000),
  currency: z.string().max(6).default("INR"),
  advanceBookingDays: z.number().int().min(0).default(14),
  requireApprovalAbove: z.number().min(0).default(50000),
  approverIds: z.array(z.string()).max(5).default([]),
  notes: z.string().max(1000).default(""),
});

router.get(
  "/policies/:companyId",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const policyRecord = await prisma.record.findFirst({
      where: {
        organizationId,
        moduleId: "companies",
        tab: "Policies",
        extra: { contains: req.params.companyId },
        deletedAt: null,
      },
    });
    if (!policyRecord) {
      return ok(res, { configured: false, policy: null });
    }
    const extra = parseJson<Record<string, unknown>>(policyRecord.extra as string, {});
    return ok(res, { configured: true, policy: extra });
  }),
);

router.put(
  "/policies/:companyId",
  requirePermission("edit"),
  validate(policySchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as z.infer<typeof policySchema>;

    const existing = await prisma.record.findFirst({
      where: {
        organizationId,
        moduleId: "companies",
        tab: "Policies",
        extra: { contains: req.params.companyId },
        deletedAt: null,
      },
    });

    const policyData = { ...body, companyId: req.params.companyId, type: "policy" };

    if (existing) {
      await prisma.record.update({
        where: { id: existing.id },
        data: { extra: JSON.stringify(policyData), updatedById: userId },
      });
    } else {
      await prisma.record.create({
        data: {
          id: cuid(),
          organizationId,
          moduleId: "companies",
          tab: "Policies",
          reference: `POL-${req.params.companyId.slice(-6)}`,
          name: `Travel policy`,
          status: "Active",
          extra: JSON.stringify(policyData),
          meta: "{}",
          createdById: userId,
        },
      });
    }

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "companies",
      label: `Travel policy updated for company ${req.params.companyId}`,
      req,
    });

    return ok(res, { saved: true });
  }),
);

// ─── Travel requests ─────────────────────────────────────────────────────────

const travelRequestSchema = z.object({
  companyId: z.string().min(1),
  costCentreId: z.string().optional(),
  employeeName: z.string().min(1).max(120),
  employeeEmail: z.string().email(),
  destination: z.string().min(1).max(200),
  purpose: z.string().min(1).max(400),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estimatedBudget: z.number().min(0),
  currency: z.string().max(6).default("INR"),
  flightRequired: z.boolean().default(true),
  hotelRequired: z.boolean().default(true),
  transferRequired: z.boolean().default(false),
  notes: z.string().max(2000).default(""),
});

router.get(
  "/travel-requests",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const companyId = req.query.companyId as string | undefined;
    const status = req.query.status as string | undefined;
    const take = Math.min(Number(req.query.take ?? 50), 200);

    const rows = await prisma.record.findMany({
      where: applyBranchScope(
        {
          organizationId,
          moduleId: "companies",
          tab: "Travel requests",
          deletedAt: null,
          ...(status ? { status } : {}),
          ...(companyId ? { extra: { contains: companyId } } : {}),
        },
        req.auth!,
      ),
      orderBy: { createdAt: "desc" },
      take,
    });

    return ok(
      res,
      rows.map((r) => {
        const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
        return {
          id: r.id,
          reference: r.reference,
          employeeName: r.name,
          employeeEmail: r.email,
          destination: r.destination,
          purpose: extra["purpose"] ?? "",
          companyId: extra["companyId"] ?? "",
          costCentreId: extra["costCentreId"] ?? null,
          departureDate: extra["departureDate"] ?? "",
          returnDate: extra["returnDate"] ?? "",
          estimatedBudget: r.amount,
          currency: r.currency || "INR",
          flightRequired: extra["flightRequired"] ?? true,
          hotelRequired: extra["hotelRequired"] ?? true,
          transferRequired: extra["transferRequired"] ?? false,
          status: r.status,
          approvalLevel: extra["approvalLevel"] ?? 0,
          approvalHistory: extra["approvalHistory"] ?? [],
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    );
  }),
);

router.post(
  "/travel-requests",
  requirePermission("create"),
  validate(travelRequestSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof travelRequestSchema>;

    // Check if the company has a policy and whether approval is required.
    const policyRecord = await prisma.record.findFirst({
      where: {
        organizationId,
        moduleId: "companies",
        tab: "Policies",
        extra: { contains: body.companyId },
        deletedAt: null,
      },
    });
    const policy = policyRecord
      ? parseJson<Record<string, unknown>>(policyRecord.extra as string, {})
      : null;
    const requiresApproval =
      !policy || body.estimatedBudget >= Number(policy["requireApprovalAbove"] ?? 50000);

    const reference = `TR-${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "companies",
        tab: "Travel requests",
        reference,
        name: body.employeeName,
        detail: body.purpose,
        destination: body.destination,
        email: body.employeeEmail,
        amount: body.estimatedBudget,
        currency: body.currency,
        date: body.departureDate,
        status: requiresApproval ? "Pending approval" : "Approved",
        notes: body.notes,
        extra: JSON.stringify({
          companyId: body.companyId,
          costCentreId: body.costCentreId ?? null,
          purpose: body.purpose,
          departureDate: body.departureDate,
          returnDate: body.returnDate,
          flightRequired: body.flightRequired,
          hotelRequired: body.hotelRequired,
          transferRequired: body.transferRequired,
          type: "travel_request",
          approvalLevel: 0,
          approvalHistory: [],
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    void eventCreated(organizationId, record.id, reference, "Travel Request", userId, actorName);

    // Notify approvers if approval is required.
    if (requiresApproval && policy?.["approverIds"]) {
      const approverIds = (policy["approverIds"] as string[]) ?? [];
      for (const approverId of approverIds.slice(0, 3)) {
        void createNotification({
          organizationId,
          userId: approverId,
          title: "Travel request awaiting approval",
          body: `${body.employeeName} → ${body.destination} · ₹${body.estimatedBudget.toLocaleString("en-IN")}`,
          moduleId: "companies",
          recordId: record.id,
          level: "warning",
        });
      }
    }

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "companies",
      recordId: record.id,
      label: `Travel request ${reference} by ${body.employeeName} to ${body.destination}`,
      req,
    });

    return created(res, toRecordDto(record));
  }),
);

router.patch(
  "/travel-requests/:id",
  requirePermission("edit"),
  validate(travelRequestSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof travelRequestSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "companies", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Travel request");
    if (["Approved", "Rejected"].includes(existing.status)) {
      throw new BadRequestError(`Cannot edit a request that is already ${existing.status.toLowerCase()}`);
    }

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.destination !== undefined ? { destination: body.destination } : {}),
        ...(body.estimatedBudget !== undefined ? { amount: body.estimatedBudget } : {}),
        ...(body.departureDate !== undefined ? { date: body.departureDate } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        extra: JSON.stringify({
          ...extra,
          ...(body.purpose !== undefined ? { purpose: body.purpose } : {}),
          ...(body.departureDate !== undefined ? { departureDate: body.departureDate } : {}),
          ...(body.returnDate !== undefined ? { returnDate: body.returnDate } : {}),
          ...(body.costCentreId !== undefined ? { costCentreId: body.costCentreId } : {}),
        }),
        updatedById: userId,
      },
    });

    return ok(res, { updated: true });
  }),
);

const approvalActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).default(""),
});

/** Approve or reject a travel request. */
router.post(
  "/travel-requests/:id/decision",
  requirePermission("approve"),
  validate(approvalActionSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const { action, note } = req.body as z.infer<typeof approvalActionSchema>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "companies", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Travel request");
    if (!["Pending approval", "In review"].includes(existing.status)) {
      throw new BadRequestError(`This request is already ${existing.status.toLowerCase()}`);
    }

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    const history = Array.isArray(extra["approvalHistory"]) ? extra["approvalHistory"] as Array<unknown> : [];
    history.push({
      actorId: userId,
      actorName,
      action,
      note,
      at: new Date().toISOString(),
    });

    const newStatus = action === "approve" ? "Approved" : "Rejected";

    await prisma.record.update({
      where: { id: existing.id },
      data: {
        status: newStatus,
        extra: JSON.stringify({ ...extra, approvalHistory: history }),
        updatedById: userId,
      },
    });

    void eventStatusChange(organizationId, existing.id, existing.status, newStatus, userId, actorName);

    // Notify the requester.
    void createNotification({
      organizationId,
      title: `Travel request ${action === "approve" ? "approved" : "rejected"}`,
      body: `${existing.reference} to ${existing.destination}${note ? ` — ${note}` : ""}`,
      moduleId: "companies",
      recordId: existing.id,
      level: action === "approve" ? "success" : "warning",
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "companies",
      recordId: existing.id,
      label: `Travel request ${existing.reference} ${newStatus.toLowerCase()} by ${actorName}`,
      req,
    });

    return ok(res, { status: newStatus, decision: action });
  }),
);

export default router;
