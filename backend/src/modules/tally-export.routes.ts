import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { prisma } from "../lib/prisma";
import { num } from "../lib/money";
import { parseJson } from "../lib/utils";
import { applyBranchScope } from "../services/records";
import { computeInvoiceGst } from "../services/gst";

const router = Router();
router.use(requireAuth);

/**
 * Tally XML export — Indian travel agencies live in Tally.
 *
 * Generates a TallyPrime-importable voucher file (Gateway → Import → Vouchers)
 * with sales invoices and receipt vouchers for a date range, so the books stay
 * in step with the CRM without anyone retyping them.
 *
 * Two things matter for the accountant:
 *   1. The tax must be posted to CGST / SGST / IGST ledgers, not lumped into
 *      "Sales" — otherwise the Tally ledger does not match the GSTR-3B.
 *   2. A receipt belongs to the customer, not to an invoice reference.
 */

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function tallyDate(isoDate: string): string {
  // Tally accepts YYYYMMDD; it is unambiguous and never depends on locale.
  const clean = (isoDate || "").slice(0, 10).replace(/-/g, "");
  return clean || new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

const exportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includePayments: z.coerce.boolean().default(true),
  branch: z.string().max(120).optional(),
});

type LedgerEntry = { ledger: string; positive: boolean; amount: number };

function ledgerXml(entries: LedgerEntry[], indent = "            "): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    if (Math.abs(entry.amount) < 0.005) continue;
    lines.push(`${indent}<ALLLEDGERENTRIES.LIST>`);
    lines.push(`${indent}  <LEDGERNAME>${escapeXml(entry.ledger)}</LEDGERNAME>`);
    lines.push(
      `${indent}  <ISDEEMEDPOSITIVE>${entry.positive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    );
    // Tally signs by debit/credit: a debit is positive, a credit negative.
    lines.push(`${indent}  <AMOUNT>${(entry.positive ? entry.amount : -entry.amount).toFixed(2)}</AMOUNT>`);
    lines.push(`${indent}</ALLLEDGERENTRIES.LIST>`);
  }
  return lines;
}

router.get(
  "/tally",
  requirePermission("export"),
  validate(exportSchema, "query"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { from, to, includePayments, branch } = req.query as unknown as z.infer<
      typeof exportSchema
    >;

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const settings = parseJson<{
      gstin?: string;
      stateCode?: string;
      taxRate?: number;
      exportUnderLut?: boolean;
    }>(organization.settings, {});

    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);
    const sellerState = (
      settings.stateCode ||
      (settings.gstin || organization.gstin || "").slice(0, 2) ||
      ""
    ).trim();
    const defaultRate = Number(settings.taxRate ?? 0) || 0;

    // Exports are branch-scoped: a Mumbai branch manager must not download
    // another branch's sales into Tally.
    const invoices = await prisma.record.findMany({
      where: applyBranchScope(
        {
          organizationId,
          moduleId: "finance",
          deletedAt: null,
          date: { gte: fromDate, lte: toDate },
        },
        req.auth!,
        branch,
      ),
      orderBy: { date: "asc" },
    });

    const payments = includePayments
      ? await prisma.payment.findMany({
          where: {
            organizationId,
            paidOn: { gte: new Date(`${fromDate}T00:00:00`), lte: new Date(`${toDate}T23:59:59`) },
            status: { in: ["paid", "recorded"] },
          },
          orderBy: { paidOn: "asc" },
        })
      : [];

    // Party names come from the invoice the money is against, not the reference.
    const partyByReference = new Map(invoices.map((invoice) => [invoice.reference, invoice.name]));

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<ENVELOPE>");
    lines.push("  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>");
    lines.push("  <BODY>");
    lines.push("    <IMPORTDATA>");
    lines.push("      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>");
    lines.push("      <REQUESTDATA>");

    for (const invoice of invoices) {
      // A draft was never issued; a cancelled invoice is not a sale.
      if (["Draft", "Cancelled", "Void"].includes(invoice.status)) continue;

      const gst = computeInvoiceGst({
        reference: invoice.reference,
        name: invoice.name,
        date: invoice.date,
        currency: invoice.currency || organization.currency || "INR",
        amount: invoice.amount,
        extra: parseJson<Record<string, unknown>>(invoice.extra, {}),
        defaultRate,
        sellerState,
        zeroRatedExports: settings.exportUnderLut !== false,
      });

      const partyName = invoice.name || "Customer";
      const entries: LedgerEntry[] = [
        { ledger: "Sales", positive: false, amount: gst.taxable },
        { ledger: partyName, positive: true, amount: gst.total },
      ];
      // Tax ledgers: the accountant's books must agree with GSTR-3B.
      if (gst.cgst > 0) entries.push({ ledger: "Output CGST", positive: false, amount: gst.cgst });
      if (gst.sgst > 0) entries.push({ ledger: "Output SGST", positive: false, amount: gst.sgst });
      if (gst.igst > 0) entries.push({ ledger: "Output IGST", positive: false, amount: gst.igst });
      if (gst.treatment.zeroRated) {
        entries.push({ ledger: "Zero-rated exports", positive: false, amount: 0 });
      }

      lines.push('        <TALLYMESSAGE xmlns:UDF="TallyUDF">');
      lines.push('          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">');
      lines.push(`            <DATE>${tallyDate(invoice.date)}</DATE>`);
      lines.push("            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>");
      lines.push(`            <VOUCHERNUMBER>${escapeXml(invoice.reference)}</VOUCHERNUMBER>`);
      lines.push(`            <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>`);
      lines.push(
        `            <NARRATION>${escapeXml(
          invoice.notes || `Invoice ${invoice.reference}${gst.treatment.isExport ? " (export of services)" : ""}`,
        )}</NARRATION>`,
      );
      // Place of supply is what Tally uses to fill the GST return form.
      if (gst.treatment.placeOfSupply) {
        lines.push(`            <PLACEOFSUPPLY>${escapeXml(gst.treatment.placeOfSupply)}</PLACEOFSUPPLY>`);
      }
      if (gst.buyerGstin) {
        lines.push(`            <PARTYGSTIN>${escapeXml(gst.buyerGstin)}</PARTYGSTIN>`);
      }
      lines.push(...ledgerXml(entries, "            "));
      lines.push("          </VOUCHER>");
      lines.push("        </TALLYMESSAGE>");
    }

    if (includePayments) {
      for (const pay of payments) {
        if (pay.kind !== "receipt" && pay.kind !== "payment") continue;
        const partyName =
          partyByReference.get(pay.recordReference) || pay.recordReference || "Customer";
        const amount = num(pay.amount);
        if (amount <= 0) continue;
        const payDate = pay.paidOn ? pay.paidOn.toISOString().slice(0, 10) : fromDate;

        lines.push('        <TALLYMESSAGE xmlns:UDF="TallyUDF">');
        lines.push('          <VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">');
        lines.push(`            <DATE>${tallyDate(payDate)}</DATE>`);
        lines.push("            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>");
        lines.push(
          `            <VOUCHERNUMBER>${escapeXml(pay.receiptNo || pay.id)}</VOUCHERNUMBER>`,
        );
        lines.push(`            <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>`);
        lines.push(
          `            <NARRATION>${escapeXml(pay.note || `Receipt ${pay.receiptNo ?? pay.id} against ${pay.recordReference}`)}</NARRATION>`,
        );
        // Money in: bank is debited, the customer is credited.
        lines.push(
          ...ledgerXml(
            [
              { ledger: "Bank", positive: true, amount },
              { ledger: partyName, positive: false, amount },
            ],
            "            ",
          ),
        );
        lines.push("          </VOUCHER>");
        lines.push("        </TALLYMESSAGE>");
      }
    }

    lines.push("      </REQUESTDATA>");
    lines.push("    </IMPORTDATA>");
    lines.push("  </BODY>");
    lines.push("</ENVELOPE>");

    res.setHeader("Content-Type", "application/xml");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tally-export-${fromDate}-to-${toDate}.xml"`,
    );
    return res.send(lines.join("\n"));
  }),
);

export default router;
