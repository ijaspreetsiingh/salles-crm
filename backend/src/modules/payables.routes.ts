import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import { dateKey } from "../services/payment-ledger";
import { num } from "../lib/money";

/**
 * Payables — the money the agency owes hotels, airlines, DMCs and guides.
 *
 * Receivables tell you what to collect; without this side the owner can see
 * cash coming in but not the commitments going out, which is half an answer.
 */
const router = Router();
router.use(requireAuth);

const asDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

type PayableRow = {
  id: string;
  supplierName: string;
  supplierRecordId: string | null;
  reference: string;
  description: string;
  amount: number;
  currency: string;
  gstRate: number;
  supplierGstin: string;
  dueDate: Date | null;
  status: string;
  notes: string;
  poNumber: string;
  poAmount: number | null;
  receivedAmount: number | null;
  invoiceNumber: string;
  invoiceAmount: number | null;
  matchStatus: string;
  matchNote: string;
  matchedAt: Date | null;
  createdAt: Date;
};

const statusFor = (amount: number, paid: number) => {
  if (paid <= 0.5) return "due";
  return paid >= amount - 0.5 ? "paid" : "partial";
};

const mapPayable = (row: PayableRow, paid: number, today: string) => {
  const balance = Math.max(0, row.amount - paid);
  const due = row.dueDate ? dateKey(row.dueDate) : null;
  return {
    id: row.id,
    supplierName: row.supplierName,
    supplierRecordId: row.supplierRecordId,
    reference: row.reference,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    gstRate: row.gstRate,
    supplierGstin: row.supplierGstin,
    dueDate: due,
    status: statusFor(row.amount, paid),
    paid,
    balance,
    overdue: Boolean(due && due < today && balance > 0.5),
    notes: row.notes,
    poNumber: row.poNumber,
    poAmount: row.poAmount,
    receivedAmount: row.receivedAmount,
    invoiceNumber: row.invoiceNumber,
    invoiceAmount: row.invoiceAmount,
    matchStatus: row.matchStatus,
    matchNote: row.matchNote,
    matchedAt: row.matchedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
};

const variance = (a: number, b: number): boolean => Math.abs(a - b) > Math.max(1, Math.abs(a) * 0.01);

/** PO ↔ GRN ↔ invoice. A 1% / ₹1 tolerance absorbs rounding, not a real gap. */
function evaluateMatch(
  po: number | null | undefined,
  received: number | null | undefined,
  invoice: number | null | undefined,
): { status: string; note: string } {
  if (po === null || po === undefined || po <= 0) {
    return { status: "missing_po", note: "No purchase order amount recorded" };
  }
  if (received === null || received === undefined) {
    return { status: "missing_grn", note: "No goods-received amount recorded" };
  }
  const billed = invoice ?? po;
  if (variance(po, received) || variance(po, billed)) {
    return {
      status: "variance",
      note: `PO ${po.toFixed(2)} · received ${received.toFixed(2)} · invoice ${billed.toFixed(2)}`,
    };
  }
  return { status: "matched", note: "PO, receipt and invoice agree" };
}

const matchSchema = z.object({
  poNumber: z.string().max(60).optional(),
  poAmount: z.number().min(0).max(1_000_000_000).optional(),
  receivedAmount: z.number().min(0).max(1_000_000_000).optional(),
  invoiceNumber: z.string().max(60).optional(),
  invoiceAmount: z.number().min(0).max(1_000_000_000).optional(),
});

const createSchema = z.object({
  supplierName: z.string().min(1).max(160),
  /** Needed to claim input credit in GSTR-3B. */
  supplierGstin: z
    .string()
    .max(20)
    .transform((value) => value.trim().toUpperCase())
    .optional(),
  supplierRecordId: z.string().max(60).optional(),
  reference: z.string().max(40).optional(),
  description: z.string().max(300).optional(),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().max(8).optional(),
  gstRate: z.number().min(0).max(50).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().max(600).optional(),
  poNumber: z.string().max(60).optional(),
  poAmount: z.number().min(0).max(1_000_000_000).optional(),
  receivedAmount: z.number().min(0).max(1_000_000_000).optional(),
  invoiceNumber: z.string().max(60).optional(),
  invoiceAmount: z.number().min(0).max(1_000_000_000).optional(),
});

const settleSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  /** Finance may override a failed match consciously; it is audited. */
  overrideMatch: z.boolean().optional(),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  method: z.string().max(40).optional(),
  referenceNo: z.string().max(120).optional(),
  note: z.string().max(400).optional(),
});

/** Every bill, its settlements and the totals the finance screen shows. */
router.get(
  "/",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const status = String(req.query.status ?? "").toLowerCase();
    const search = String(req.query.q ?? "")
      .trim()
      .toLowerCase();

    const [rows, grouped] = await Promise.all([
      prisma.payable.findMany({
        where: { organizationId },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      }),
      prisma.payablePayment.groupBy({
        by: ["payableId"],
        where: { organizationId },
        _sum: { amount: true },
      }),
    ]);

    const paidBy = new Map(grouped.map((g) => [g.payableId, num(g._sum.amount)]));
    const today = dateKey(new Date());

    let items = rows.map((row) =>
      mapPayable(row as unknown as PayableRow, paidBy.get(row.id) ?? 0, today),
    );
    if (status && status !== "all") items = items.filter((item) => item.status === status);
    if (search) {
      items = items.filter((item) =>
        [item.supplierName, item.reference, item.description]
          .join(" ")
          .toLowerCase()
          .includes(search),
      );
    }

    const totals = items.reduce(
      (acc, item) => {
        acc.billed += item.amount;
        acc.paid += item.paid;
        acc.outstanding += item.balance;
        if (item.overdue) acc.overdue += item.balance;
        if (item.balance > 0.5 && !item.overdue) acc.upcoming += item.balance;
        return acc;
      },
      { billed: 0, paid: 0, outstanding: 0, overdue: 0, upcoming: 0 },
    );

    const supplierMap = new Map<string, { name: string; outstanding: number; count: number }>();
    for (const item of items) {
      if (item.balance <= 0.5) continue;
      const key = item.supplierName || "Unassigned";
      const entry = supplierMap.get(key) ?? { name: key, outstanding: 0, count: 0 };
      entry.outstanding += item.balance;
      entry.count += 1;
      supplierMap.set(key, entry);
    }

    return ok(res, {
      items,
      totals: { ...totals, count: items.length },
      suppliers: [...supplierMap.values()].sort((a, b) => b.outstanding - a.outstanding),
    });
  }),
);

/** One bill and who it is owed to. */
router.post(
  "/",
  requirePermission("edit"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const payable = await prisma.payable.create({
      data: {
        organizationId: req.auth!.organizationId,
        supplierName: body.supplierName.trim(),
        ...(body.supplierGstin ? { supplierGstin: body.supplierGstin } : {}),
        ...(body.supplierRecordId ? { supplierRecordId: body.supplierRecordId } : {}),
        reference: body.reference?.trim() ?? "",
        description: body.description?.trim() ?? "",
        amount: body.amount,
        ...(body.currency ? { currency: body.currency } : {}),
        gstRate: body.gstRate ?? 0,
        dueDate: asDate(body.dueDate),
        notes: body.notes?.trim() ?? "",
        poNumber: body.poNumber?.trim() ?? "",
        ...(body.poAmount !== undefined ? { poAmount: body.poAmount } : {}),
        ...(body.receivedAmount !== undefined ? { receivedAmount: body.receivedAmount } : {}),
        invoiceNumber: body.invoiceNumber?.trim() ?? "",
        ...(body.invoiceAmount !== undefined ? { invoiceAmount: body.invoiceAmount } : {}),
        createdById: req.auth!.userId,
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "suppliers",
      label: `Payable ${body.currency ?? "INR"} ${body.amount.toLocaleString("en-IN")} to ${body.supplierName}`,
      meta: { payableId: payable.id, reference: payable.reference },
      req,
    });

    return created(res, {
      payable: mapPayable(payable as unknown as PayableRow, 0, dateKey(new Date())),
    });
  }),
);

/** Settle (part of) a bill. Status and balance are derived, never typed. */
router.post(
  "/:id/payments",
  requirePermission("edit"),
  validate(settleSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof settleSchema>;
    const organizationId = req.auth!.organizationId;
    const payable = await prisma.payable.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!payable) throw new NotFoundError("Payable");

    const settled = await prisma.payablePayment.aggregate({
      where: { organizationId, payableId: payable.id },
      _sum: { amount: true },
    });
    const alreadyPaid = num(settled._sum.amount);
    const balance = Math.max(0, payable.amount - alreadyPaid);
    if (balance <= 0.5) throw new BadRequestError("This bill is already settled");
    /*
     * Three-way match gate: when a purchase order is recorded, the PO, the
     * goods-received note and the supplier invoice must agree before money
     * leaves. Paying a mismatched bill is how duplicate and inflated supplier
     * invoices get through.
     */
    if (payable.poAmount !== null && payable.matchStatus !== "matched" && !body.overrideMatch) {
      throw new BadRequestError(
        `This bill has not passed the three-way match (${payable.matchStatus}). Run the match or use an explicit override.`,
      );
    }
    if (body.amount > balance + 0.5) {
      throw new BadRequestError(
        `Only ${balance.toLocaleString("en-IN")} is left on this bill — settle that or less`,
      );
    }

    const payment = await prisma.payablePayment.create({
      data: {
        organizationId,
        payableId: payable.id,
        amount: body.amount,
        paidOn: asDate(body.paidOn) ?? new Date(),
        ...(body.method ? { method: body.method } : {}),
        referenceNo: body.referenceNo?.trim() ?? "",
        note: body.note?.trim() ?? "",
        createdById: req.auth!.userId,
      },
    });

    const paid = alreadyPaid + body.amount;
    await prisma.payable.update({
      where: { id: payable.id },
      data: { status: statusFor(payable.amount, paid) },
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "suppliers",
      label: `Paid ${payable.currency} ${body.amount.toLocaleString("en-IN")} to ${payable.supplierName}`,
      meta: { payableId: payable.id, paymentId: payment.id },
      req,
    });

    return created(res, {
      payment: {
        id: payment.id,
        amount: payment.amount,
        paidOn: dateKey(payment.paidOn ?? payment.createdAt),
      },
      payable: mapPayable(
        { ...(payable as unknown as PayableRow), status: statusFor(payable.amount, paid) },
        paid,
        dateKey(new Date()),
      ),
    });
  }),
);

/** Bills are editable while money still has to move. */
router.patch(
  "/:id",
  requirePermission("edit"),
  validate(createSchema.partial()),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<z.infer<typeof createSchema>>;
    const organizationId = req.auth!.organizationId;
    const existing = await prisma.payable.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!existing) throw new NotFoundError("Payable");

    const updated = await prisma.payable.update({
      where: { id: existing.id },
      data: {
        ...(body.supplierName !== undefined ? { supplierName: body.supplierName.trim() } : {}),
        ...(body.reference !== undefined ? { reference: body.reference.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.gstRate !== undefined ? { gstRate: body.gstRate } : {}),
        ...(body.supplierGstin !== undefined ? { supplierGstin: body.supplierGstin } : {}),
        ...(body.dueDate !== undefined ? { dueDate: asDate(body.dueDate) } : {}),
        ...(body.notes !== undefined ? { notes: body.notes.trim() } : {}),
        ...(body.poNumber !== undefined ? { poNumber: body.poNumber.trim() } : {}),
        ...(body.poAmount !== undefined ? { poAmount: body.poAmount } : {}),
        ...(body.receivedAmount !== undefined ? { receivedAmount: body.receivedAmount } : {}),
        ...(body.invoiceNumber !== undefined ? { invoiceNumber: body.invoiceNumber.trim() } : {}),
        ...(body.invoiceAmount !== undefined ? { invoiceAmount: body.invoiceAmount } : {}),
      },
    });

    const settled = await prisma.payablePayment.aggregate({
      where: { organizationId, payableId: updated.id },
      _sum: { amount: true },
    });
    return ok(res, {
      payable: mapPayable(
        updated as unknown as PayableRow,
        num(settled._sum.amount),
        dateKey(new Date()),
      ),
    });
  }),
);

/** Runs the three-way match and stores the verdict. */
router.post(
  "/:id/match",
  requirePermission("edit"),
  validate(matchSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof matchSchema>;
    const payable = await prisma.payable.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!payable) throw new NotFoundError("Payable");

    const po = body.poAmount ?? payable.poAmount;
    const received = body.receivedAmount ?? payable.receivedAmount;
    const invoice = body.invoiceAmount ?? payable.invoiceAmount ?? payable.amount;
    const verdict = evaluateMatch(po, received, invoice);

    const updated = await prisma.payable.update({
      where: { id: payable.id },
      data: {
        ...(body.poNumber !== undefined ? { poNumber: body.poNumber.trim() } : {}),
        ...(body.poAmount !== undefined ? { poAmount: body.poAmount } : {}),
        ...(body.receivedAmount !== undefined ? { receivedAmount: body.receivedAmount } : {}),
        ...(body.invoiceNumber !== undefined ? { invoiceNumber: body.invoiceNumber.trim() } : {}),
        ...(body.invoiceAmount !== undefined ? { invoiceAmount: body.invoiceAmount } : {}),
        matchStatus: verdict.status,
        matchNote: verdict.note,
        matchedAt: verdict.status === "matched" ? new Date() : null,
      },
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "suppliers",
      label: `Three-way match ${verdict.status} for ${payable.supplierName}`,
      meta: { payableId: payable.id, status: verdict.status },
      req,
    });

    const settled = await prisma.payablePayment.aggregate({
      where: { organizationId, payableId: payable.id },
      _sum: { amount: true },
    });
    return ok(res, {
      payable: mapPayable(
        updated as unknown as PayableRow,
        num(settled._sum.amount),
        dateKey(new Date()),
      ),
      match: verdict,
    });
  }),
);

router.delete(
  "/:id",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const existing = await prisma.payable.findFirst({
      where: { id: req.params.id, organizationId },
      include: { payments: true },
    });
    if (!existing) throw new NotFoundError("Payable");
    if (existing.payments.length > 0) {
      throw new BadRequestError(
        "Money has already moved against this bill — delete the payments first",
      );
    }
    await prisma.payable.delete({ where: { id: existing.id } });
    await recordAudit({
      organizationId,
      action: "Deleted",
      moduleId: "suppliers",
      label: `Payable to ${existing.supplierName} removed`,
      req,
    });
    return ok(res, { deleted: true });
  }),
);

export default router;
