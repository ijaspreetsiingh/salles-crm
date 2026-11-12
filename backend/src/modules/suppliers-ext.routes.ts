/**
 * Suppliers — contracts, purchase orders, settlements.
 *
 * The workspace already has a generic `suppliers` module with CRUD. This file
 * adds the dedicated sub-resources that the generic routes can't cover:
 *   - Supplier contracts (rate agreements with start/end dates)
 *   - Purchase orders (money committed to a supplier for a booking)
 *   - Settlements (paying a PO off)
 *
 * Routes:
 *   GET    /suppliers-ext/contracts                     — contracts for the org
 *   POST   /suppliers-ext/contracts                     — create contract
 *   PATCH  /suppliers-ext/contracts/:id                 — update (rate, dates)
 *   DELETE /suppliers-ext/contracts/:id                 — archive contract
 *   GET    /suppliers-ext/purchase-orders               — PO list (filterable by supplier/status)
 *   POST   /suppliers-ext/purchase-orders               — raise a PO
 *   PATCH  /suppliers-ext/purchase-orders/:id           — update PO
 *   POST   /suppliers-ext/purchase-orders/:id/settle    — record full or partial settlement
 *   GET    /suppliers-ext/settlements                   — settlement ledger
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
import { eventCreated, eventStatusChange } from "../services/timeline";

const router = Router();
router.use(requireAuth);

// ─── Contracts ────────────────────────────────────────────────────────────────

const contractSchema = z.object({
  supplierId: z.string().min(1),
  supplierName: z.string().min(1).max(120),
  contractType: z.enum(["Hotel", "DMC", "Airline", "Transport", "Activity", "Insurance", "Other"]).default("Other"),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  terms: z.string().max(5000).default(""),
  status: z.enum(["Draft", "Active", "Expired", "Cancelled"]).default("Draft"),
});

router.get(
  "/contracts",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const supplierId = req.query.supplierId as string | undefined;
    const status = req.query.status as string | undefined;

    const rows = await prisma.record.findMany({
      where: {
        organizationId,
        moduleId: "suppliers",
        tab: "Contracts",
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(supplierId ? { extra: { contains: supplierId } } : {}),
      },
      orderBy: { date: "desc" },
      take: 200,
    });

    return ok(res, rows.map((r) => {
      const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
      return {
        id: r.id,
        reference: r.reference,
        supplierId: extra["supplierId"] ?? "",
        supplierName: r.name,
        contractType: extra["contractType"] ?? "Other",
        validFrom: extra["validFrom"] ?? "",
        validTo: extra["validTo"] ?? "",
        value: r.amount,
        currency: r.currency || "INR",
        status: r.status,
        terms: r.notes,
        createdAt: r.createdAt.toISOString(),
      };
    }));
  }),
);

router.post(
  "/contracts",
  requirePermission("create"),
  validate(contractSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof contractSchema>;

    const reference = `CON-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "suppliers",
        tab: "Contracts",
        reference,
        name: body.supplierName,
        date: body.validFrom,
        amount: body.value,
        currency: body.currency,
        status: body.status,
        notes: body.terms,
        extra: JSON.stringify({
          supplierId: body.supplierId,
          contractType: body.contractType,
          validFrom: body.validFrom,
          validTo: body.validTo,
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    void eventCreated(organizationId, record.id, reference, "Contract", userId, actorName);
    await recordAudit({ organizationId, action: "Created", moduleId: "suppliers", recordId: record.id, label: `Contract ${reference} with ${body.supplierName}`, req });
    return created(res, { id: record.id, reference });
  }),
);

router.patch(
  "/contracts/:id",
  requirePermission("edit"),
  validate(contractSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as Partial<z.infer<typeof contractSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "suppliers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Contract");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    const prevStatus = existing.status;

    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.value !== undefined ? { amount: body.value } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.terms !== undefined ? { notes: body.terms } : {}),
        ...(body.validFrom !== undefined ? { date: body.validFrom } : {}),
        extra: JSON.stringify({ ...extra, ...(body.validFrom !== undefined ? { validFrom: body.validFrom } : {}), ...(body.validTo !== undefined ? { validTo: body.validTo } : {}), ...(body.contractType !== undefined ? { contractType: body.contractType } : {}) }),
        updatedById: userId,
      },
    });

    if (body.status && body.status !== prevStatus) {
      void eventStatusChange(organizationId, existing.id, prevStatus, body.status, userId, actorName);
    }

    return ok(res, { updated: true });
  }),
);

router.delete(
  "/contracts/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "suppliers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Contract");
    await prisma.record.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: "Cancelled" } });
    return ok(res, { deleted: true });
  }),
);

// ─── Purchase Orders ──────────────────────────────────────────────────────────

const poSchema = z.object({
  supplierId: z.string().min(1),
  supplierName: z.string().min(1).max(120),
  supplierGstin: z.string().max(15).default(""),
  bookingReference: z.string().max(40).optional(),
  description: z.string().min(1).max(400),
  amount: z.number().min(0.01),
  currency: z.string().max(6).default("INR"),
  gstRate: z.number().min(0).max(28).default(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(1000).default(""),
});

router.get(
  "/purchase-orders",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const supplierId = req.query.supplierId as string | undefined;
    const status = req.query.status as string | undefined;
    const take = Math.min(Number(req.query.take ?? 50), 200);

    const rows = await prisma.record.findMany({
      where: {
        organizationId,
        moduleId: "suppliers",
        tab: "Purchase orders",
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(supplierId ? { extra: { contains: supplierId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return ok(res, rows.map((r) => {
      const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
      return {
        id: r.id,
        reference: r.reference,
        supplierId: extra["supplierId"] ?? "",
        supplierName: r.name,
        supplierGstin: extra["supplierGstin"] ?? "",
        bookingReference: extra["bookingReference"] ?? null,
        description: r.detail,
        amount: r.amount,
        currency: r.currency || "INR",
        gstRate: extra["gstRate"] ?? 0,
        settled: extra["settled"] ?? 0,
        balance: Number(r.amount) - Number(extra["settled"] ?? 0),
        dueDate: r.date ?? null,
        status: r.status,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      };
    }));
  }),
);

router.post(
  "/purchase-orders",
  requirePermission("create"),
  validate(poSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof poSchema>;

    const reference = `PO-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "suppliers",
        tab: "Purchase orders",
        reference,
        name: body.supplierName,
        detail: body.description,
        amount: body.amount,
        currency: body.currency,
        date: body.dueDate ?? "",
        status: "Pending",
        notes: body.notes,
        extra: JSON.stringify({
          supplierId: body.supplierId,
          supplierGstin: body.supplierGstin,
          bookingReference: body.bookingReference ?? null,
          gstRate: body.gstRate,
          settled: 0,
          settlements: [],
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    void eventCreated(organizationId, record.id, reference, "Purchase Order", userId, actorName);
    await recordAudit({ organizationId, action: "Created", moduleId: "suppliers", recordId: record.id, label: `PO ${reference} raised for ${body.supplierName} — ₹${body.amount.toLocaleString("en-IN")}`, req });
    return created(res, { id: record.id, reference });
  }),
);

router.patch(
  "/purchase-orders/:id",
  requirePermission("edit"),
  validate(poSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof poSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "suppliers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Purchase order");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.dueDate !== undefined ? { date: body.dueDate } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.description !== undefined ? { detail: body.description } : {}),
        extra: JSON.stringify({ ...extra, ...(body.gstRate !== undefined ? { gstRate: body.gstRate } : {}), ...(body.supplierGstin !== undefined ? { supplierGstin: body.supplierGstin } : {}), ...(body.bookingReference !== undefined ? { bookingReference: body.bookingReference } : {}) }),
        updatedById: userId,
      },
    });

    return ok(res, { updated: true });
  }),
);

const settleSchema = z.object({
  amount: z.number().min(0.01),
  method: z.string().max(60).default("Bank transfer"),
  referenceNo: z.string().max(80).optional(),
  note: z.string().max(400).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Record a full or partial settlement payment against a PO. */
router.post(
  "/purchase-orders/:id/settle",
  requirePermission("approve"),
  validate(settleSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof settleSchema>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "suppliers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Purchase order");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    const previousSettled = Number(extra["settled"] ?? 0);
    const newSettled = previousSettled + body.amount;
    const balance = Number(existing.amount) - newSettled;

    if (body.amount > balance + 0.01) {
      throw new BadRequestError(
        `Settlement amount ₹${body.amount.toLocaleString("en-IN")} exceeds remaining balance ₹${balance.toLocaleString("en-IN")}`,
      );
    }

    const settlements = Array.isArray(extra["settlements"]) ? extra["settlements"] as Array<unknown> : [];
    settlements.push({
      amount: body.amount,
      method: body.method,
      referenceNo: body.referenceNo ?? null,
      note: body.note ?? null,
      paidOn: body.paidOn ?? new Date().toISOString().slice(0, 10),
      by: actorName,
      at: new Date().toISOString(),
    });

    const newStatus = balance <= 0.01 ? "Settled" : "Partial";
    const prevStatus = existing.status;

    await prisma.record.update({
      where: { id: existing.id },
      data: {
        status: newStatus,
        extra: JSON.stringify({ ...extra, settled: newSettled, settlements }),
        updatedById: userId,
      },
    });

    if (newStatus !== prevStatus) {
      void eventStatusChange(organizationId, existing.id, prevStatus, newStatus, userId, actorName);
    }

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "suppliers",
      recordId: existing.id,
      label: `Settlement of ₹${body.amount.toLocaleString("en-IN")} on PO ${existing.reference}`,
      req,
    });

    return ok(res, {
      settled: newSettled,
      balance: Math.max(0, balance),
      status: newStatus,
    });
  }),
);

/** Full settlement ledger across all POs. */
router.get(
  "/settlements",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const supplierId = req.query.supplierId as string | undefined;

    const rows = await prisma.record.findMany({
      where: {
        organizationId,
        moduleId: "suppliers",
        tab: "Purchase orders",
        status: { in: ["Settled", "Partial"] },
        deletedAt: null,
        ...(supplierId ? { extra: { contains: supplierId } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const ledger = rows.flatMap((r) => {
      const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
      const settlements = Array.isArray(extra["settlements"]) ? extra["settlements"] as Array<Record<string, unknown>> : [];
      return settlements.map((s) => ({
        poId: r.id,
        poReference: r.reference,
        supplierName: r.name,
        amount: s["amount"],
        method: s["method"],
        referenceNo: s["referenceNo"] ?? null,
        paidOn: s["paidOn"],
        by: s["by"],
      }));
    });

    return ok(res, { total: ledger.length, items: ledger });
  }),
);

export default router;
