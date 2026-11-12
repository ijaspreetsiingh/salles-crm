/**
 * Finance Extensions — Double-entry ledger view + receivables aging drill-down.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { parseJson } from "../lib/utils";

const router = Router();
router.use(requireAuth);

/**
 * Double-entry ledger view: every payment and expense as debit/credit pairs.
 *
 * Revenue (payments received) = credit to Sales; expenses = debit to Cost.
 * Each row has a date, account, debit, credit, narration and reference.
 */
router.get("/ledger", requirePermission("view"), asyncHandler(async (req, res) => {
  const { organizationId } = req.auth!;
  const take = Math.min(Number(req.query.take ?? 100), 500);
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const [payments, expenses, payables] = await Promise.all([
    prisma.payment.findMany({
      where: { organizationId, status: "recorded", ...(from || to ? { paidOn: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } } : {}) },
      orderBy: { paidOn: "desc" }, take,
      select: { id: true, receiptNo: true, amount: true, currency: true, method: true, moduleId: true, recordReference: true, paidOn: true, kind: true },
    }),
    prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(from || to
          ? {
              spentOn: {
                gte: from ? new Date(`${from}T00:00:00`) : undefined,
                lte: to ? new Date(`${to}T23:59:59`) : undefined,
              },
            }
          : {}),
      },
      orderBy: { spentOn: "desc" }, take,
      select: { id: true, category: true, description: true, amount: true, currency: true, spentOn: true, vendor: true },
    }),
    prisma.payable.findMany({
      where: { organizationId, status: { in: ["due", "partial"] } },
      orderBy: { dueDate: "asc" }, take: 50,
      select: { id: true, supplierName: true, description: true, amount: true, currency: true, dueDate: true, status: true },
    }),
  ]);

  // Build double-entry rows
  type LedgerRow = { date: string; account: string; debit: number; credit: number; narration: string; reference: string };
  const rows: LedgerRow[] = [];

  for (const p of payments) {
    const date = p.paidOn?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    if (p.kind === "refund") {
      rows.push({ date, account: "Refunds", debit: Number(p.amount), credit: 0, narration: `Refund ${p.receiptNo}`, reference: p.recordReference ?? "" });
      rows.push({ date, account: "Bank/Cash", debit: 0, credit: Number(p.amount), narration: `Refund paid ${p.method}`, reference: p.receiptNo ?? "" });
    } else {
      rows.push({ date, account: "Bank/Cash", debit: Number(p.amount), credit: 0, narration: `Payment received ${p.method}`, reference: p.receiptNo ?? "" });
      rows.push({ date, account: p.moduleId === "bookings" ? "Booking Revenue" : "Invoice Revenue", debit: 0, credit: Number(p.amount), narration: `${p.moduleId} ${p.recordReference}`, reference: p.recordReference ?? "" });
    }
  }
  for (const e of expenses) {
    const date = e.spentOn?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    rows.push({ date, account: e.category || "Expense", debit: Number(e.amount), credit: 0, narration: e.description || `Payment to ${e.vendor}`, reference: e.id });
    rows.push({ date, account: "Bank/Cash", debit: 0, credit: Number(e.amount), narration: `Expense paid ${e.vendor}`, reference: e.id });
  }
  for (const p of payables) {
    rows.push({ date: p.dueDate?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10), account: "Accounts Payable", debit: Number(p.amount), credit: 0, narration: `Payable to ${p.supplierName}`, reference: p.description });
    rows.push({ date: p.dueDate?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10), account: p.supplierName, debit: 0, credit: Number(p.amount), narration: `Bill pending`, reference: p.description });
  }

  // Sort by date descending
  rows.sort((a, b) => b.date.localeCompare(a.date));

  const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);

  return ok(res, {
    rows: rows.slice(0, take),
    summary: { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1, entries: rows.length },
  });
}));

/**
 * Receivables aging — invoices grouped by how overdue they are.
 * Buckets: Current (not due), 1-30 days, 31-60 days, 61-90 days, 90+ days.
 */
router.get("/receivables-aging", requirePermission("view"), asyncHandler(async (req, res) => {
  const { organizationId } = req.auth!;
  const invoices = await prisma.record.findMany({
    where: { organizationId, moduleId: "finance", status: { in: ["Sent", "Overdue", "Partially paid"] }, deletedAt: null },
    orderBy: { date: "asc" }, take: 500,
    select: { id: true, reference: true, name: true, amount: true, currency: true, date: true, status: true, extra: true },
  });

  const now = new Date();
  const buckets = { current: [] as typeof invoices, d1_30: [] as typeof invoices, d31_60: [] as typeof invoices, d61_90: [] as typeof invoices, d90_plus: [] as typeof invoices };

  for (const inv of invoices) {
    const extra = parseJson<Record<string, unknown>>(inv.extra as string, {});
    const received = Number(extra["received"] ?? 0);
    const balance = Number(inv.amount) - received;
    if (balance <= 0) continue;

    const dueDateStr = extra["dueDate"] as string | undefined;
    const invDate = inv.date ? new Date(inv.date) : now;
    const dueDate = dueDateStr ? new Date(dueDateStr) : new Date(invDate.getTime() + 30 * 86400000); // default 30-day terms
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);

    if (daysOverdue <= 0) buckets.current.push(inv);
    else if (daysOverdue <= 30) buckets.d1_30.push(inv);
    else if (daysOverdue <= 60) buckets.d31_60.push(inv);
    else if (daysOverdue <= 90) buckets.d61_90.push(inv);
    else buckets.d90_plus.push(inv);
  }

  const sumBucket = (items: typeof invoices) => items.reduce((sum, i) => {
    const extra = parseJson<Record<string, unknown>>(i.extra as string, {});
    return sum + (Number(i.amount) - Number(extra["received"] ?? 0));
  }, 0);

  return ok(res, {
    buckets: [
      { label: "Current (not due)", count: buckets.current.length, amount: sumBucket(buckets.current), items: buckets.current },
      { label: "1-30 days overdue", count: buckets.d1_30.length, amount: sumBucket(buckets.d1_30), items: buckets.d1_30 },
      { label: "31-60 days overdue", count: buckets.d31_60.length, amount: sumBucket(buckets.d31_60), items: buckets.d31_60 },
      { label: "61-90 days overdue", count: buckets.d61_90.length, amount: sumBucket(buckets.d61_90), items: buckets.d61_90 },
      { label: "90+ days overdue", count: buckets.d90_plus.length, amount: sumBucket(buckets.d90_plus), items: buckets.d90_plus },
    ],
    totalOutstanding: sumBucket([...buckets.current, ...buckets.d1_30, ...buckets.d31_60, ...buckets.d61_90, ...buckets.d90_plus]),
  });
}));

export default router;
