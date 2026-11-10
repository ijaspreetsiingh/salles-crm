import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { parseJson } from "../lib/utils";
import { num } from "../lib/money";
import { applyBranchScope } from "../services/records";
import {
  buildGstr1,
  buildGstr3b,
  computeInvoiceGst,
  gstr1Csv,
  type PurchaseGst,
} from "../services/gst";

const router = Router();
router.use(requireAuth);

/** The two facts `applyBranchScope` needs to narrow a query. */
type BranchAuth = { organizationId: string; roleKey: string; branchId: string | null };

/**
 * GST returns for the accountant.
 *
 * GSTR-1 is the outward-supply return (what we sold and the tax on it);
 * GSTR-3B is the monthly summary that actually gets paid (outward tax minus
 * input credit). Both are built from the same GST module the invoice PDF uses,
 * so a number on the return can always be traced back to an invoice.
 *
 * Nothing here files a return with the GST portal: it produces the working
 * paper and the CSV a CA uploads to the offline utility.
 */

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Defaults to the current Indian financial year (April → March). */
function resolveRange(query: { from?: string; to?: string }): { from: string; to: string } {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    from: query.from ?? `${startYear}-04-01`,
    to: query.to ?? `${startYear + 1}-03-31`,
  };
}

type Settings = {
  taxRate?: number;
  defaultTaxRate?: number;
  gstin?: string;
  stateCode?: string;
  tcsPercent?: number;
  exportUnderLut?: boolean;
};

async function loadInvoices(
  auth: BranchAuth,
  from: string,
  to: string,
) {
  const organizationId = auth.organizationId;
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });
  const settings = parseJson<Settings>(organization.settings, {});
  const defaultRate =
    typeof settings.taxRate === "number"
      ? settings.taxRate
      : typeof settings.defaultTaxRate === "number"
        ? settings.defaultTaxRate
        : 18;
  const gstin = settings.gstin || organization.gstin || "";
  const sellerState = (settings.stateCode || gstin.slice(0, 2) || "").trim();
  const zeroRatedExports = settings.exportUnderLut !== false;

  const records = await prisma.record.findMany({
    where: applyBranchScope(
      {
        organizationId,
        moduleId: "finance",
        deletedAt: null,
        date: { gte: from, lte: to },
      },
      auth,
    ),
    orderBy: { date: "asc" },
  });

  const invoices = records
    // A draft has not been issued and a cancelled invoice is not a supply.
    .filter((record) => !["Draft", "Cancelled", "Void"].includes(record.status))
    .map((record) =>
      computeInvoiceGst({
        reference: record.reference,
        name: record.name,
        date: record.date,
        currency: record.currency || organization.currency || "INR",
        amount: record.amount,
        extra: parseJson<Record<string, unknown>>(record.extra, {}),
        defaultRate,
        sellerState,
        zeroRatedExports,
        defaultTcsPercent: settings.tcsPercent ?? 0,
      }),
    );

  return { organization, settings, invoices, sellerState };
}

/** Purchase bills in the period, for input credit. */
async function loadPurchases(
  auth: BranchAuth,
  from: string,
  to: string,
): Promise<Array<PurchaseGst & { reference: string; vendor: string; date: string }>> {
  const organizationId = auth.organizationId;
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);

  const [payables, expenses] = await Promise.all([
    prisma.payable.findMany({
      where: { organizationId, amount: { gt: 0 }, gstRate: { gt: 0 } },
    }),
    prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        amount: { gt: 0 },
        gstRate: { gt: 0 },
        spentOn: { gte: fromDate, lte: toDate },
      },
    }),
  ]);

  const bills: Array<PurchaseGst & { reference: string; vendor: string; date: string }> = [];

  for (const bill of payables) {
    const when = bill.dueDate ?? bill.createdAt;
    if (when < fromDate || when > toDate) continue;
    bills.push({
      reference: bill.reference || `PAY-${bill.id.slice(-6)}`,
      vendor: bill.supplierName,
      date: when.toISOString().slice(0, 10),
      amount: num(bill.amount),
      gstRate: num(bill.gstRate),
      gstin: bill.supplierGstin ?? "",
    });
  }

  for (const expense of expenses) {
    bills.push({
      reference: expense.referenceNo || `EXP-${expense.id.slice(-6)}`,
      vendor: expense.vendor,
      date: (expense.spentOn ?? expense.createdAt).toISOString().slice(0, 10),
      amount: num(expense.amount),
      gstRate: num(expense.gstRate),
      gstin: expense.vendorGstin ?? "",
    });
  }

  return bills;
}

/** GSTR-1: outward supplies. `?format=csv` downloads the CA-ready sheet. */
router.get(
  "/gstr1",
  requirePermission("export"),
  validate(rangeSchema, "query"),
  asyncHandler(async (req, res) => {
    const range = resolveRange(req.query as { from?: string; to?: string });
    const { invoices } = await loadInvoices(req.auth!, range.from, range.to);
    const report = buildGstr1(invoices, range);

    if ((req.query.format as string | undefined) === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="gstr1-${range.from}-to-${range.to}.csv"`,
      );
      return res.send(gstr1Csv(report));
    }
    return ok(res, report);
  }),
);

/** GSTR-3B: outward tax, input credit and the net payable. */
router.get(
  "/gstr3b",
  requirePermission("export"),
  validate(rangeSchema, "query"),
  asyncHandler(async (req, res) => {
    const range = resolveRange(req.query as { from?: string; to?: string });
    const { invoices, sellerState } = await loadInvoices(req.auth!, range.from, range.to);
    const purchases = await loadPurchases(req.auth!, range.from, range.to);
    const report = buildGstr3b(invoices, purchases, range, sellerState);
    return ok(res, report);
  }),
);

export default router;
