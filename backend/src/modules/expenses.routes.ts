import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import { dateKey } from "../services/payment-ledger";

/**
 * Expenses and the profit & loss view.
 *
 * Supplier bills (Payable) cover what a trip cost. This covers everything else
 * the agency pays to stay open — and together they turn "we invoiced X" into
 * "we actually made Y".
 */
const router = Router();
router.use(requireAuth);

export const EXPENSE_CATEGORIES = [
  "Rent & office",
  "Salaries",
  "Marketing & ads",
  "Software & tools",
  "Travel & meals",
  "Bank & fees",
  "Utilities",
  "Professional fees",
  "Other",
];

const asDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const createSchema = z.object({
  category: z.string().min(1).max(60),
  vendor: z.string().max(160).optional(),
  /** Needed to claim input credit in GSTR-3B. */
  vendorGstin: z
    .string()
    .max(20)
    .transform((value) => value.trim().toUpperCase())
    .optional(),
  description: z.string().max(300).optional(),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().max(8).optional(),
  gstRate: z.number().min(0).max(50).optional(),
  spentOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  method: z.string().max(40).optional(),
  referenceNo: z.string().max(120).optional(),
  notes: z.string().max(600).optional(),
});

const mapExpense = (row: {
  id: string;
  category: string;
  vendor: string;
  description: string;
  amount: number;
  currency: string;
  gstRate: number;
  vendorGstin?: string;
  spentOn: Date | null;
  method: string;
  referenceNo: string;
  notes: string;
  createdAt: Date;
}) => ({
  id: row.id,
  category: row.category,
  vendor: row.vendor,
  vendorGstin: row.vendorGstin ?? "",
  description: row.description,
  amount: row.amount,
  currency: row.currency,
  gstRate: row.gstRate,
  spentOn: dateKey(row.spentOn ?? row.createdAt),
  method: row.method,
  referenceNo: row.referenceNo,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
});

router.get(
  "/",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");

    const rows = await prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(from || to
          ? {
              spentOn: {
                ...(from ? { gte: asDate(from) ?? undefined } : {}),
                ...(to ? { lte: asDate(to) ?? undefined } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
    });

    const items = rows.map(mapExpense);
    const spent = items.reduce((sum, item) => sum + item.amount, 0);
    const byCategory = new Map<string, { category: string; amount: number; count: number }>();
    for (const item of items) {
      const entry = byCategory.get(item.category) ?? {
        category: item.category,
        amount: 0,
        count: 0,
      };
      entry.amount += item.amount;
      entry.count += 1;
      byCategory.set(item.category, entry);
    }

    return ok(res, {
      items,
      categories: EXPENSE_CATEGORIES,
      totals: {
        spent,
        count: items.length,
        average: items.length > 0 ? spent / items.length : 0,
        byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
      },
    });
  }),
);

router.post(
  "/",
  requirePermission("edit"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const expense = await prisma.expense.create({
      data: {
        organizationId: req.auth!.organizationId,
        category: body.category,
        vendor: body.vendor?.trim() ?? "",
        ...(body.vendorGstin ? { vendorGstin: body.vendorGstin } : {}),
        description: body.description?.trim() ?? "",
        amount: body.amount,
        ...(body.currency ? { currency: body.currency } : {}),
        gstRate: body.gstRate ?? 0,
        spentOn: asDate(body.spentOn) ?? new Date(),
        ...(body.method ? { method: body.method } : {}),
        referenceNo: body.referenceNo?.trim() ?? "",
        notes: body.notes?.trim() ?? "",
        createdById: req.auth!.userId,
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "finance",
      label: `Expense ${body.currency ?? "INR"} ${body.amount.toLocaleString("en-IN")} · ${body.category}`,
      meta: { expenseId: expense.id },
      req,
    });

    return created(res, { expense: mapExpense(expense) });
  }),
);

router.patch(
  "/:id",
  requirePermission("edit"),
  validate(createSchema.partial()),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<z.infer<typeof createSchema>>;
    const existing = await prisma.expense.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Expense");

    const updated = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.vendor !== undefined ? { vendor: body.vendor.trim() } : {}),
        ...(body.vendorGstin !== undefined ? { vendorGstin: body.vendorGstin } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.gstRate !== undefined ? { gstRate: body.gstRate } : {}),
        ...(body.spentOn !== undefined ? { spentOn: asDate(body.spentOn) } : {}),
        ...(body.method !== undefined ? { method: body.method } : {}),
        ...(body.referenceNo !== undefined ? { referenceNo: body.referenceNo.trim() } : {}),
        ...(body.notes !== undefined ? { notes: body.notes.trim() } : {}),
      },
    });

    return ok(res, { expense: mapExpense(updated) });
  }),
);

router.delete(
  "/:id",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.expense.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Expense");
    await prisma.expense.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "finance",
      label: `Expense ${existing.category} removed`,
      req,
    });
    return ok(res, { deleted: true });
  }),
);

/**
 * Profit & loss for a period.
 *
 * Revenue and supplier cost are compared tax-exclusive (GST is collected on
 * behalf of the government, not earned), expenses are already net of tax.
 */
router.get(
  "/p-and-l",
  requirePermission("view"),
  validate(z.object({ from: z.string().optional(), to: z.string().optional() }), "query"),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const fyStart = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const from = (req.query.from as string | undefined) ?? `${fyStart}-04-01`;
    const to = (req.query.to as string | undefined) ?? `${fyStart + 1}-03-31`;
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59`);
    const organizationId = req.auth!.organizationId;

    const netOfTax = (amount: number, rawRate: number) => {
      // Legacy rows stored the tax amount instead of the rate.
      if (rawRate > 50) return Math.max(0, amount - Math.min(rawRate, amount));
      return rawRate > 0 ? amount / (1 + rawRate / 100) : amount;
    };

    const [invoices, payables, expenses] = await Promise.all([
      prisma.record.findMany({
        where: {
          organizationId,
          moduleId: "finance",
          deletedAt: null,
          date: { gte: from, lte: to },
        },
        select: {
          reference: true,
          name: true,
          amount: true,
          status: true,
          date: true,
          extra: true,
        },
      }),
      prisma.payable.findMany({ where: { organizationId } }),
      prisma.expense.findMany({
        where: { organizationId, deletedAt: null, spentOn: { gte: fromDate, lte: toDate } },
      }),
    ]);

    const monthKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const months = new Map<string, { revenue: number; supplierCost: number; expenses: number }>();
    const bucket = (key: string) => {
      const entry = months.get(key) ?? { revenue: 0, supplierCost: 0, expenses: 0 };
      months.set(key, entry);
      return entry;
    };

    let revenue = 0;
    let invoiced = 0;
    let invoiceCount = 0;
    const revenueByMonth = new Map<string, number>();
    for (const invoice of invoices) {
      const status = (invoice.status || "").toLowerCase();
      if (status === "draft" || status === "cancelled") continue;
      const extra = JSON.parse(invoice.extra || "{}") as Record<string, unknown>;
      const net = netOfTax(invoice.amount, Number(extra["gst"] ?? 0));
      revenue += net;
      invoiced += invoice.amount;
      invoiceCount += 1;
      const key = invoice.date.slice(0, 7);
      bucket(key).revenue += net;
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + net);
    }

    let supplierCost = 0;
    const supplierByMonth = new Map<string, number>();
    for (const bill of payables) {
      const when = bill.dueDate ?? bill.createdAt;
      if (when < fromDate || when > toDate) continue;
      const net = netOfTax(bill.amount, bill.gstRate);
      supplierCost += net;
      const key = monthKey(when);
      bucket(key).supplierCost += net;
      supplierByMonth.set(key, (supplierByMonth.get(key) ?? 0) + net);
    }

    let expenseTotal = 0;
    const byCategory = new Map<string, number>();
    for (const expense of expenses) {
      const net = netOfTax(expense.amount, expense.gstRate);
      expenseTotal += net;
      byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + net);
      bucket(monthKey(expense.spentOn ?? expense.createdAt)).expenses += net;
    }

    const round = (value: number) => Math.round(value * 100) / 100;
    const grossProfit = revenue - supplierCost;
    const netProfit = grossProfit - expenseTotal;

    return ok(res, {
      period: { from, to },
      revenue: { net: round(revenue), invoiced: round(invoiced), invoices: invoiceCount },
      supplierCost: round(supplierCost),
      expenses: round(expenseTotal),
      grossProfit: round(grossProfit),
      grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : null,
      netProfit: round(netProfit),
      netMargin: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : null,
      months: [...months.entries()]
        .filter(
          ([, value]) => value.revenue > 0.5 || value.supplierCost > 0.5 || value.expenses > 0.5,
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({
          month,
          revenue: round(value.revenue),
          supplierCost: round(value.supplierCost),
          expenses: round(value.expenses),
          netProfit: round(value.revenue - value.supplierCost - value.expenses),
        })),
      expenseCategories: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount: round(amount) }))
        .sort((a, b) => b.amount - a.amount),
    });
  }),
);

export default router;
