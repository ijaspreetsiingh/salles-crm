import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { NotFoundError } from "../lib/errors";
import { computeInvoiceGst, GST_STATE_NAMES, resolveGstTreatment } from "./gst";
import QRCode from "qrcode";

const DEFAULT_FX: Record<string, number> = {
  INR: 1,
  USD: 84,
  EUR: 91,
  GBP: 108,
  AED: 23,
  SGD: 63,
};

/** How this invoice must be taxed, and why. */
export type TaxSplit = {
  /** IGST applies: the supply crosses a state line. */
  interState: boolean;
  /** Foreign currency: an export of services, to be zero-rated where eligible. */
  isExport: boolean;
  /** Two-digit state code used as the place of supply, or "" when unknown. */
  placeOfSupply: string;
};

/**
 * Decides IGST vs CGST + SGST from the place of supply.
 *
 * Rules, in order:
 *   1. A foreign-currency invoice is an export of services.
 *   2. The place of supply is the state code on the invoice, falling back to
 *      the first two digits of the buyer's GSTIN.
 *   3. With both state codes known and different, it is inter-state (IGST).
 *      With either code missing, it stays intra-state, which is what the
 *      invoice footnote tells the user to fix by adding the buyer's GSTIN.
 *
 * Currency is deliberately *not* used to decide this: a rupee invoice to
 * another state is still inter-state.
 */
export function resolveTaxSplit(input: {
  currency: string;
  sellerState: string;
  buyerGstin?: string;
  placeOfSupply?: string;
}): TaxSplit {
  // Kept for callers/tests that predate the shared GST module; the rules live
  // in `services/gst.ts` so they cannot drift apart.
  const treatment = resolveGstTreatment(input);
  return {
    interState: treatment.interState,
    isExport: treatment.isExport,
    placeOfSupply: treatment.placeOfSupply,
  };
}

type Settings = {
  taxRegime?: string;
  taxRate?: number;
  defaultTaxRate?: number;
  invoicePrefix?: string;
  fxRates?: Record<string, number>;
  gstin?: string;
  stateCode?: string;
  /**
   * TCS under section 206C(1G). Zero by default: only a person with a PAN and
   * a turnover that triggers it collects TCS, so it is opt-in per organisation
   * and can be overridden on a single invoice as `extra.tcsRate`.
   */
  tcsPercent?: number;
  /** Printed under the TCS line, e.g. "TCS collected on international packages". */
  tcsNote?: string;
  /**
   * True (the default) when exports are zero-rated under a Letter of
   * Undertaking. Set false when the agency pays IGST on exports and claims a
   * refund instead.
   */
  exportUnderLut?: boolean;
};

/**
 * Generates a GST tax invoice PDF.
 *
 * Layout: header block on left, QR code on right, seller/buyer side by side
 * (with GSTIN and place of supply), itemised table built from the quotation's
 * line items, tax summary that follows the place of supply, then totals.
 *
 * It never invents a registration number. An IRN is printed only when one was
 * actually saved on the invoice after IRP registration.
 */
export async function generateInvoicePdf(input: {
  organizationId: string;
  reference: string;
}): Promise<{ filename: string; stream: PDFKit.PDFDocument }> {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
  });
  if (!organization) throw new NotFoundError("Organization");

  const record = await prisma.record.findFirst({
    where: {
      organizationId: input.organizationId,
      reference: input.reference,
      deletedAt: null,
    },
  });
  if (!record) throw new NotFoundError("Invoice record");

  const settings = parseJson<Settings>(organization.settings, {});
  const taxRate =
    typeof settings.taxRate === "number"
      ? settings.taxRate
      : typeof settings.defaultTaxRate === "number"
        ? settings.defaultTaxRate
        : 18;
  const currency = record.currency || organization.currency || "INR";
  const fxRates = { ...DEFAULT_FX, ...(settings.fxRates ?? {}) };
  const fxRate = currency === "INR" ? 1 : (fxRates[currency] ?? 0);
  const amountInr = currency === "INR" ? record.amount : Math.round(record.amount * (fxRate || 1));

  /**
   * One rule for the whole product: the amount stored on an invoice is what
   * the customer pays, tax included. The form adds GST to the line items and
   * saves that total, so the PDF must carve the tax back out — never add it a
   * second time. The Tax & GST working paper does the same sum, which is why
   * the two now agree to the rupee.
   *
   * Very old invoices stored `gst` as rupees of tax instead of a rate; a real
   * rate never crosses 50%, so anything above that is read as an amount.
   * New invoices use `gstRate` (percentage) or `gstAmount` (rupees) explicitly.
   */
  const recordExtra = parseJson<Record<string, unknown>>(record.extra, {});

  /*
   * One shared GST calculation, used by the PDF, the tax working paper, the
   * GSTR-1/3B exports and the Tally journal — so none of them can disagree.
   *
   * Place of supply decides the tax: IGST for another state, CGST + SGST
   * inside one state, nothing at all for a zero-rated export. It is taken from
   * the seller's and buyer's GSTIN state codes, never from the currency alone.
   *
   * Nothing here invents an IRN: an IRN only exists once the invoice has been
   * registered on the GST IRP, and printing a made-up number on a tax invoice
   * is worse than printing none.
   */
  const gstinValue = settings.gstin || organization.gstin || "";
  const sellerState = (settings.stateCode || gstinValue.slice(0, 2) || "").trim();
  const buyerGstin = String(recordExtra["buyerGstin"] ?? "").trim();
  const gst = computeInvoiceGst({
    reference: record.reference,
    name: record.name,
    date: record.date,
    currency,
    amount: amountInr,
    extra: recordExtra,
    defaultRate: taxRate,
    sellerState,
    // Zero-rated exports are the norm for service exporters; an organisation
    // that pays IGST and claims a refund sets `exportUnderLut: false`.
    zeroRatedExports: settings.exportUnderLut !== false,
    defaultTcsPercent: settings.tcsPercent,
  });

  const grossInr = amountInr;
  const totalTax = gst.tax;
  const taxableValue = gst.taxable;
  const cgst = gst.cgst;
  const sgst = gst.sgst;
  const igst = gst.igst;
  const tcsRatePercent = gst.tcsRate;
  const tcsAmount = gst.tcs;
  const grandTotal = Math.round((grossInr + tcsAmount) * 100) / 100;
  const isExport = gst.treatment.isExport;
  const interState = gst.treatment.interState;
  const placeOfSupply = gst.treatment.placeOfSupply;

  /*
   * Line items come from the quotation this invoice was raised from
   * (`extra.quoteItems`). Their rates are tax-exclusive, while the amount
   * stored on the invoice is what the customer actually pays, tax included.
   * So the lines are scaled to the taxable value of the stored amount: the
   * invoice total can never disagree with the ledger, and a package with
   * several services still shows each service on its own row.
   */
  type InvoiceLine = { label: string; hsn: string; qty: number; amount: number };
  const rawItems: unknown[] = Array.isArray(recordExtra["quoteItems"])
    ? (recordExtra["quoteItems"] as unknown[])
    : typeof recordExtra["quoteItems"] === "string" && recordExtra["quoteItems"]
      ? (() => {
          try {
            const parsed = JSON.parse(recordExtra["quoteItems"] as string);
            return Array.isArray(parsed) ? (parsed as unknown[]) : [];
          } catch {
            return [];
          }
        })()
      : [];
  const parsedLines = rawItems
    .filter((item) => Boolean(item) && typeof (item as { rate?: unknown }).rate === "number")
    .map((item) => {
      const line = item as { label?: string; qty?: number; rate: number; hsn?: string };
      const qty = Number(line.qty) > 0 ? Number(line.qty) : 1;
      return {
        label: String(line.label || "Travel service").slice(0, 70),
        hsn: String(line.hsn || "9985").slice(0, 12),
        qty,
        amount: Math.round(qty * Number(line.rate) * 100) / 100,
      };
    });
  const exclusiveTotal = parsedLines.reduce((sum, line) => sum + line.amount, 0);
  const invoiceLines: InvoiceLine[] =
    parsedLines.length > 0 && taxableValue > 0 && exclusiveTotal > 0
      ? parsedLines.map((line) => ({
          ...line,
          amount: Math.round((line.amount / exclusiveTotal) * taxableValue * 100) / 100,
        }))
      : [
          {
            label: record.detail || "Travel services",
            hsn: "9985",
            qty: 1,
            amount: taxableValue,
          },
        ];
  // Keep the printed rows adding up to the taxable value to the rupee.
  const lineDrift =
    Math.round((taxableValue - invoiceLines.reduce((sum, line) => sum + line.amount, 0)) * 100) /
    100;
  if (invoiceLines.length > 0 && lineDrift !== 0) {
    invoiceLines[invoiceLines.length - 1]!.amount =
      Math.round((invoiceLines[invoiceLines.length - 1]!.amount + lineDrift) * 100) / 100;
  }

  // Generate QR code data (invoice facts only — no invented registration id)
  const qrData = {
    gstin: gstinValue,
    inv: record.reference,
    dat: record.date
      ? new Date(record.date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    val: grandTotal.toString(),
    chtax: totalTax.toString(),
  };
  const qrString = JSON.stringify(qrData);

  let qrCodeBuffer: Buffer | null = null;
  try {
    qrCodeBuffer = await QRCode.toBuffer(qrString, {
      type: "png",
      width: 200,
      margin: 2,
      errorCorrectionLevel: "M",
    });
  } catch {
    // QR code generation failed — continue without QR
  }

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const filename = `invoice-${record.reference}.pdf`;

  // ── Header: Company Name (left) + QR Code (right) - SEPARATE ROW ─────
  doc.fontSize(18).font("Helvetica-Bold").fillColor("#17191a").text(organization.name, 50, 50);
  doc.fontSize(8).fillColor("#555555");
  if (organization.legalName) doc.text(organization.legalName, 50, doc.y + 2);
  if (organization.address) doc.text(organization.address, 50, doc.y + 2);
  const orgContact: string[] = [];
  if (gstinValue) orgContact.push(`GSTIN: ${gstinValue}`);
  if (organization.supportEmail) orgContact.push(`Email: ${organization.supportEmail}`);
  if (organization.phone) orgContact.push(`Phone: ${organization.phone}`);
  if (orgContact.length) doc.text(orgContact.join("  |  "), 50, doc.y + 2);

  // QR Code on right side (separate from company name - no overlap)
  if (qrCodeBuffer) {
    const qrX = doc.page.width - 120;
    const qrY = 50;
    doc.image(qrCodeBuffer, qrX, qrY, { width: 60, height: 60 });
    doc
      .fontSize(6)
      .fillColor("#555555")
      .text("Scan for invoice details", qrX - 5, qrY + 65, { width: 70, align: "center" });
  }

  doc.moveDown(2.5);

  /*
   * The IRN is printed only when it was really issued by the IRP and saved on
   * the invoice (`extra.irn`). Otherwise the invoice says so plainly, because
   * a blank line is honest and a fabricated registration number is not.
   */
  const registeredIrn = String(recordExtra["irn"] ?? "").trim();
  const ackNumber = String(recordExtra["ackNo"] ?? "").trim();
  const ackDate = String(recordExtra["ackDate"] ?? "").trim();
  doc.fontSize(7).font("Helvetica-Bold").fillColor("#2f5c50");
  if (registeredIrn) {
    doc.text(`IRN: ${registeredIrn}`, 50, doc.y + 2);
    if (ackNumber) doc.text(`Ack No: ${ackNumber}`, 50, doc.y + 2);
    if (ackDate) doc.text(`Ack Date: ${ackDate}`, 50, doc.y + 2);
  } else {
    doc.font("Helvetica").fillColor("#777777");
    doc.text(
      "e-Invoice: not registered on the GST IRP — no IRN has been issued for this invoice.",
      50,
      doc.y + 2,
    );
  }
  doc.moveDown(1);

  // ── Title ────────────────────────────────────────────────────────────
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .fillColor("#17191a")
    .text("TAX INVOICE", { align: "center" });
  doc.fontSize(9).fillColor("#555555");
  doc.text(`Invoice No: ${record.reference}`, { align: "center" });
  doc.text(
    `Date: ${record.date ? new Date(record.date).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}`,
    { align: "center" },
  );
  doc.text(`Status: ${record.status}`, { align: "center" });
  doc.moveDown(1.5);

  // ── Seller & Buyer Side by Side ─────────────────────────────────────
  const leftX = 50;
  const rightX = doc.page.width / 2 + 20;

  // From (Seller)
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#17191a").text("From (Seller)", leftX, doc.y);
  doc
    .fontSize(8.5)
    .fillColor("#555555")
    .text(organization.name, leftX, doc.y + 10);
  if (organization.address) doc.text(organization.address, leftX, doc.y + 18);
  if (gstinValue) doc.text(`GSTIN: ${gstinValue}`, leftX, doc.y + 26);
  if (settings.stateCode) doc.text(`State Code: ${settings.stateCode}`, leftX, doc.y + 34);

  // To (Customer)
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#17191a")
    .text("Bill To (Customer)", rightX, doc.y - 40);
  doc
    .fontSize(8.5)
    .fillColor("#555555")
    .text(record.name || "Customer", rightX, doc.y - 30);
  if (record.email) doc.text(record.email, rightX, doc.y - 22);
  if (record.phone) doc.text(record.phone, rightX, doc.y + 2);
  if (record.destination) doc.text(`Destination: ${record.destination}`, rightX, doc.y + 10);

  // Place of supply: the fact that decides IGST vs CGST + SGST.
  let buyerY = doc.y + 10;
  if (buyerGstin) {
    doc.text(`GSTIN: ${buyerGstin}`, rightX, buyerY);
    buyerY += 8;
  }
  if (placeOfSupply) {
    const label = GST_STATE_NAMES[placeOfSupply];
    doc.text(`Place of supply: ${placeOfSupply}${label ? ` · ${label}` : ""}`, rightX, buyerY);
    buyerY += 8;
  } else {
    doc.fillColor("#a33a2b");
    doc.text("Place of supply missing — add the buyer's GSTIN or state", rightX, buyerY);
    doc.fillColor("#555555");
    buyerY += 8;
  }
  if (isExport) {
    doc.text(
      gst.treatment.zeroRated
        ? "Export of services — zero-rated under LUT"
        : "Export of services — IGST charged, refund claimable",
      rightX,
      buyerY,
    );
  }

  doc.moveDown(2.5);

  // ── Line Items Table ────────────────────────────────────────────────
  const tableTop = doc.y + 6;
  const colDesc = 50;
  const colHsn = 200;
  const colQty = 320;
  const colRate = 390;
  const colAmt = 495;

  // Table header
  doc.rect(50, tableTop, colAmt - 50, 26).fill("#2f5c50");
  doc.fillColor("#fbf8f2").font("Helvetica-Bold").fontSize(9);
  doc.text("Description", colDesc, tableTop + 7);
  doc.text("HSN/SAC", colHsn, tableTop + 7);
  doc.text("Qty", colQty, tableTop + 7);
  doc.text("Rate", colRate, tableTop + 7, { width: 60, align: "right" });
  doc.text("Amount", colAmt, tableTop + 7, { width: 60, align: "right" });
  doc.fillColor("#17191a").font("Helvetica").fontSize(9);

  let y = tableTop + 30;
  const MAX_ROWS = 12;
  const shownLines = invoiceLines.slice(0, MAX_ROWS);
  for (const line of shownLines) {
    const unitRate = line.qty > 0 ? line.amount / line.qty : line.amount;
    doc.text(line.label, colDesc, y, { width: colHsn - colDesc - 8 });
    doc.text(line.hsn, colHsn, y);
    doc.text(String(line.qty), colQty, y);
    doc.text(formatMoney(unitRate, currency), colRate, y, { width: 60, align: "right" });
    doc.text(formatMoney(line.amount, currency), colAmt, y, { width: 60, align: "right" });
    y += 18;
  }
  if (invoiceLines.length > MAX_ROWS) {
    const remaining = invoiceLines.length - MAX_ROWS;
    const rest = invoiceLines.slice(MAX_ROWS).reduce((sum, line) => sum + line.amount, 0);
    doc.text(`${remaining} more service${remaining === 1 ? "" : "s"}`, colDesc, y);
    doc.text("9985", colHsn, y);
    doc.text("—", colQty, y);
    doc.text("—", colRate, y, { width: 60, align: "right" });
    doc.text(formatMoney(rest, currency), colAmt, y, { width: 60, align: "right" });
    y += 18;
  }
  y += 4;

  doc.moveTo(50, y).lineTo(colAmt, y).strokeColor("#dddddd").stroke();
  y += 16;

  // ── Tax Summary ─────────────────────────────────────────────────────
  // `gst.rate` is already the *effective* rate, so a legacy invoice that
  // stored rupees of tax still shows an honest percentage.
  const displayRate = gst.rate;
  const taxRows: Array<{ label: string; rate: string; amt: string; tax: string }> = [];
  if (gst.treatment.zeroRated) {
    taxRows.push({
      label: "Zero-rated export (LUT)",
      rate: "0%",
      amt: formatMoney(taxableValue, currency),
      tax: formatMoney(0, "INR"),
    });
  } else if (isExport || interState) {
    taxRows.push({
      label: "IGST",
      rate: `${displayRate}%`,
      amt: formatMoney(taxableValue, currency),
      tax: formatMoney(igst, "INR"),
    });
  } else {
    taxRows.push(
      {
        label: "CGST",
        rate: `${Math.round((displayRate / 2) * 100) / 100}%`,
        amt: formatMoney(taxableValue / 2, "INR"),
        tax: formatMoney(cgst, "INR"),
      },
      {
        label: "SGST",
        rate: `${Math.round((displayRate / 2) * 100) / 100}%`,
        amt: formatMoney(taxableValue / 2, "INR"),
        tax: formatMoney(sgst, "INR"),
      },
    );
  }

  for (const row of taxRows) {
    doc.text(row.label, colDesc, y);
    doc.text(row.rate, colRate, y, { width: 60, align: "right" });
    doc.text(row.amt, colAmt - 60, y, { width: 60, align: "right" });
    doc.text(row.tax, colAmt, y, { width: 60, align: "right" });
    y += 16;
  }

  doc.moveTo(50, y).lineTo(colAmt, y).strokeColor("#dddddd").stroke();
  y += 16;

  // ── Totals ──────────────────────────────────────────────────────────
  const totalRows = [
    { label: "Taxable Value", value: formatMoney(taxableValue, currency) },
    { label: `Total Tax (${displayRate}%)`, value: formatMoney(totalTax, "INR") },
    ...(tcsAmount > 0
      ? [
          { label: "Invoice value (tax included)", value: formatMoney(grossInr, "INR") },
          {
            label: `TCS u/s 206C(1G) @ ${tcsRatePercent}%`,
            value: formatMoney(tcsAmount, "INR"),
          },
        ]
      : []),
    { label: "Grand Total", value: formatMoney(grandTotal, "INR"), bold: true },
  ];

  for (const row of totalRows) {
    doc.fontSize(row.bold ? 10 : 9).font(row.bold ? "Helvetica-Bold" : "Helvetica");
    doc.text(row.label, colAmt - 120, y, { width: 60, align: "right" });
    doc.text(row.value, colAmt, y, { width: 60, align: "right" });
    y += 16;
  }

  // Amount in words
  doc.fontSize(8).font("Helvetica").fillColor("#555555");
  doc.text(`Amount in words: ${amountToWords(grandTotal)} only`, 50, y + 6);
  y += 20;

  // ── Footer ──────────────────────────────────────────────────────────
  const footerY = doc.page.height - 100;
  doc.fontSize(8).fillColor("#777777");
  doc.text(`Generated by Traveldesk on ${new Date().toLocaleString("en-IN")}`, 50, footerY, {
    width: 495,
  });
  doc.text(
    `This is a computer-generated GST invoice and does not require physical signature.`,
    50,
    footerY + 12,
    { width: 495 },
  );
  if (settings.gstin) {
    doc.text(`GSTIN: ${settings.gstin}`, 50, footerY + 24, { width: 495 });
  }
  if (record.notes) {
    doc.text(`Remarks: ${record.notes}`, 50, footerY + 36, { width: 495 });
  }
  if (tcsAmount > 0) {
    doc.text(
      settings.tcsNote ||
        "TCS is collected under section 206C(1G) and deposited against the buyer's PAN. It is not a charge for the travel service.",
      50,
      footerY + 48,
      { width: 495 },
    );
  }
  if (!buyerGstin && !isExport) {
    doc.text(
      "Buyer GSTIN is not on this invoice, so it is treated as an intra-state supply (CGST + SGST). Add the buyer's GSTIN to bill another state with IGST.",
      50,
      footerY + 60,
      { width: 495 },
    );
  }

  return { filename, stream: doc };
}

function amountToWords(num: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function convertHundreds(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 !== 0 ? " " + ones[n % 10] : ""}`;
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 !== 0 ? " and " + convertHundreds(n % 100) : ""}`;
  }

  if (num === 0) return "Zero";
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;

  let result = "";
  if (crore > 0) result += `${convertHundreds(crore)} Crore`;
  if (lakh > 0) result += `${result ? " " : ""}${convertHundreds(lakh)} Lakh`;
  if (thousand > 0) result += `${result ? " " : ""}${convertHundreds(thousand)} Thousand`;
  if (rest > 0) result += `${result ? " " : ""}${convertHundreds(rest)}`;

  return result.trim();
}

function formatMoney(amount: number, currency: string): string {
  const symbolByCurrency: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "AED ",
    SGD: "S$",
  };
  const symbol = symbolByCurrency[currency] ?? `${currency} `;
  return `${symbol}${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
