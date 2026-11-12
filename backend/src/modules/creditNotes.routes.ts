import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import { num } from "../lib/money";

/**
 * Credit notes.
 *
 * A cancelled trip, a downgraded hotel or a rate revision is not a deleted
 * invoice: GST already reported on the original invoice has to be reduced by a
 * credit note with its own serial number. Without this the GSTR-1 keeps
 * charging tax on money the agency returned.
 */
const router = Router();
router.use(requireAuth);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  invoiceReference: z.string().max(60).optional(),
  customerName: z.string().max(160).optional(),
  customerGstin: z.string().max(20).optional(),
  reason: z.string().min(3).max(300),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().max(8).optional(),
  gstRate: z.number().min(0).max(50).optional(),
  issuedOn: z.string().regex(DATE).optional(),
});

function dto(row: {
  id: string;
  reference: string;
  invoiceReference: string;
  customerName: string;
  customerGstin: string;
  reason: string;
  amount: number;
  currency: string;
  gstRate: number;
  status: string;
  issuedOn: Date;
  appliedAt: Date | null;
  appliesToReference: string;
  createdAt: Date;
}) {
  const taxable = row.gstRate > 0 ? row.amount / (1 + row.gstRate / 100) : row.amount;
  return {
    id: row.id,
    reference: row.reference,
    invoiceReference: row.invoiceReference,
    customerName: row.customerName,
    customerGstin: row.customerGstin,
    reason: row.reason,
    amount: row.amount,
    currency: row.currency,
    gstRate: row.gstRate,
    taxableValue: Math.round(taxable * 100) / 100,
    taxAmount: Math.round((row.amount - taxable) * 100) / 100,
    status: row.status,
    issuedOn: row.issuedOn.toISOString().slice(0, 10),
    appliedAt: row.appliedAt?.toISOString() ?? null,
    appliesToReference: row.appliesToReference,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Serial series: CN-2401, CN-2402 … independent of invoice numbers. */
async function nextCreditNoteNumber(organizationId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    const existing = await tx.creditNote.findMany({
      where: { organizationId },
      select: { reference: true },
    });
    let highest = 2400;
    for (const row of existing) {
      const match = row.reference.match(/(\d+)$/);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > highest) highest = value;
    }
    const seq = await tx.sequence.upsert({
      where: {
        organizationId_moduleId_stem: { organizationId, moduleId: "credit_notes", stem: "" },
      },
      create: {
        organizationId,
        moduleId: "credit_notes",
        stem: "",
        lastNumber: Math.max(2401, highest + 1),
      },
      update: { lastNumber: { increment: 1 } },
    });
    return `CN-${seq.lastNumber}`;
  });
}

router.get(
  "/",
  requireModulePermission("finance", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const status = String(req.query.status ?? "").trim().toLowerCase();
    const invoiceReference = String(req.query.invoiceReference ?? "").trim();
    const search = String(req.query.q ?? "").trim().toLowerCase();

    let items = await prisma.creditNote.findMany({
      where: {
        organizationId,
        ...(status && status !== "all" ? { status } : {}),
        ...(invoiceReference ? { invoiceReference } : {}),
      },
      orderBy: { issuedOn: "desc" },
    });
    if (search) {
      items = items.filter((row) =>
        [row.reference, row.invoiceReference, row.customerName, row.reason]
          .join(" ")
          .toLowerCase()
          .includes(search),
      );
    }

    const totals = items.reduce(
      (sum, row) => {
        if (row.status !== "cancelled") {
          sum.credited += row.amount;
          sum.tax += row.amount - (row.gstRate > 0 ? row.amount / (1 + row.gstRate / 100) : row.amount);
        }
        return sum;
      },
      { credited: 0, tax: 0 },
    );

    return ok(res, {
      items: items.map(dto),
      totals: {
        credited: Math.round(totals.credited * 100) / 100,
        tax: Math.round(totals.tax * 100) / 100,
        count: items.length,
      },
    });
  }),
);

router.post(
  "/",
  requireModulePermission("finance", "create"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof createSchema>;
    const invoiceReference = (body.invoiceReference ?? "").trim();

    const [invoice, organization] = await Promise.all([
      invoiceReference
        ? prisma.record.findFirst({
            where: { organizationId, moduleId: "finance", reference: invoiceReference, deletedAt: null },
          })
        : Promise.resolve(null),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { currency: true } }),
    ]);
    if (invoiceReference && !invoice) {
      throw new BadRequestError(`Invoice ${invoiceReference} was not found in this workspace`);
    }

    if (invoice) {
      const credited = await prisma.creditNote.aggregate({
        where: { organizationId, invoiceReference, status: { not: "cancelled" } },
        _sum: { amount: true },
      });
      const remaining = invoice.amount - num(credited._sum.amount);
      if (body.amount > remaining + 0.5) {
        throw new BadRequestError(
          `Only ${remaining.toFixed(2)} is left on ${invoiceReference} to credit`,
        );
      }
    }

    const row = await prisma.creditNote.create({
      data: {
        organizationId,
        reference: await nextCreditNoteNumber(organizationId),
        invoiceReference,
        customerName: (body.customerName ?? invoice?.name ?? "").trim(),
        customerGstin: (body.customerGstin ?? "").trim().toUpperCase(),
        reason: body.reason.trim(),
        amount: body.amount,
        currency: (
          [body.currency, invoice?.currency, organization?.currency, "INR"].find(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
          ) ?? "INR"
        ).toUpperCase(),
        gstRate: body.gstRate ?? 0,
        issuedOn: body.issuedOn ? new Date(`${body.issuedOn}T00:00:00`) : new Date(),
        createdById: req.auth!.userId,
      },
    });

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "finance",
      label: `Credit note ${row.reference} for ${row.currency} ${row.amount.toFixed(2)}${
        invoiceReference ? ` against ${invoiceReference}` : ""
      }`,
      meta: { creditNoteId: row.id, invoiceReference },
      req,
    });

    return created(res, dto(row));
  }),
);

/** Marks the note as applied to its invoice (money returned / adjusted). */
router.post(
  "/:id/apply",
  requireModulePermission("finance", "edit"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const existing = await prisma.creditNote.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!existing) throw new NotFoundError("Credit note");
    if (existing.status === "cancelled") throw new BadRequestError("A cancelled credit note cannot be applied");
    if (existing.status === "applied") return ok(res, dto(existing));

    const row = await prisma.creditNote.update({
      where: { id: existing.id },
      data: {
        status: "applied",
        appliedAt: new Date(),
        appliesToReference: existing.invoiceReference,
      },
    });
    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "finance",
      label: `Credit note ${row.reference} applied`,
      req,
    });
    return ok(res, dto(row));
  }),
);

router.post(
  "/:id/cancel",
  requireModulePermission("finance", "delete"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const existing = await prisma.creditNote.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!existing) throw new NotFoundError("Credit note");
    if (existing.status === "applied") {
      throw new BadRequestError("An applied credit note cannot be cancelled — issue a fresh note instead");
    }
    const row = await prisma.creditNote.update({
      where: { id: existing.id },
      data: { status: "cancelled" },
    });
    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "finance",
      label: `Credit note ${row.reference} cancelled`,
      req,
    });
    return ok(res, dto(row));
  }),
);

export default router;
