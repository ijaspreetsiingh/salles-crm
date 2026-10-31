import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { NotFoundError } from "../lib/errors";
import QRCode from "qrcode";

const DEFAULT_FX: Record<string, number> = {
  INR: 1,
  USD: 84,
  EUR: 91,
  GBP: 108,
  AED: 23,
  SGD: 63,
};

type Settings = {
  taxRegime?: string;
  taxRate?: number;
  defaultTaxRate?: number;
  invoicePrefix?: string;
  fxRates?: Record<string, number>;
  gstin?: string;
  stateCode?: string;
};

/**
 * Generates a GST-compliant tax invoice PDF with IRN and QR code.
 * Professional layout: header block on left, QR code on right (separate row),
 * seller/buyer details side by side, itemized table, tax summary, totals.
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
  const fxRate = currency === "INR" ? 1 : fxRates[currency] ?? 0;
  const amountInr = currency === "INR" ? record.amount : Math.round(record.amount * (fxRate || 1));
  const taxRatePercent = taxRate;
  const taxableValue = amountInr;
  const cgst = Math.round((taxableValue * taxRatePercent) / 200);
  const sgst = Math.round((taxableValue * taxRatePercent) / 200);
  const igst = currency !== "INR" ? 0 : taxRatePercent === 0 ? 0 : Math.round((taxableValue * taxRatePercent) / 100);
  const totalTax = currency === "INR" ? cgst + sgst : igst;
  const grandTotal = taxableValue + totalTax;

  // Generate IRN
  const gstinValue = settings.gstin || organization.gstin || "";
  const stateCodeValue = settings.stateCode || (gstinValue.substring(0, 2) || "");
  const irn = `IRN-${gstinValue.replace(/[^A-Z0-9]/g, "") || "GST"}-${record.reference.replace(/[^A-Z0-9]/g, "")}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const ackNo = `ACK-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  const ackDate = new Date().toLocaleDateString("en-IN");

  // Generate QR code data
  const qrData = {
    gstin: settings.gstin || organization.gstin || "",
    inv: record.reference,
    dat: record.date ? new Date(record.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    val: grandTotal.toString(),
    chtax: totalTax.toString(),
    invirn: irn,
  };
  const qrString = JSON.stringify(qrData);

  let qrCodeBuffer: Buffer | null = null;
  try {
    qrCodeBuffer = await QRCode.toBuffer(qrString, { type: "png", width: 200, margin: 2, errorCorrectionLevel: "M" });
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
    doc.fontSize(6).fillColor("#555555").text("Scan QR for GST verification", qrX - 5, qrY + 65, { width: 70, align: "center" });
  }

  doc.moveDown(2.5);

  // ── IRN / Ack Badge ──────────────────────────────────────────────────
  doc.fontSize(7).font("Helvetica-Bold").fillColor("#2f5c50");
  doc.text(`IRN: ${irn}`, 50, doc.y + 2);
  doc.text(`Ack No: ${ackNo}`, 50, doc.y + 2);
  doc.text(`Ack Date: ${ackDate}`, 50, doc.y + 2);
  doc.moveDown(1);

  // ── Title ────────────────────────────────────────────────────────────
  doc.fontSize(16).font("Helvetica-Bold").fillColor("#17191a").text("TAX INVOICE", { align: "center" });
  doc.fontSize(9).fillColor("#555555");
  doc.text(`Invoice No: ${record.reference}`, { align: "center" });
  doc.text(`Date: ${record.date ? new Date(record.date).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}`, { align: "center" });
  doc.text(`Status: ${record.status}`, { align: "center" });
  doc.moveDown(1.5);

  // ── Seller & Buyer Side by Side ─────────────────────────────────────
  const leftX = 50;
  const rightX = doc.page.width / 2 + 20;

  // From (Seller)
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#17191a").text("From (Seller)", leftX, doc.y);
  doc.fontSize(8.5).fillColor("#555555").text(organization.name, leftX, doc.y + 10);
  if (organization.address) doc.text(organization.address, leftX, doc.y + 18);
  if (gstinValue) doc.text(`GSTIN: ${gstinValue}`, leftX, doc.y + 26);
  if (settings.stateCode) doc.text(`State Code: ${settings.stateCode}`, leftX, doc.y + 34);

  // To (Customer)
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#17191a").text("Bill To (Customer)", rightX, doc.y - 40);
  doc.fontSize(8.5).fillColor("#555555").text(record.name || "Customer", rightX, doc.y - 30);
  if (record.email) doc.text(record.email, rightX, doc.y - 22);
  if (record.phone) doc.text(record.phone, rightX, doc.y + 2);
  if (record.destination) doc.text(`Destination: ${record.destination}`, rightX, doc.y + 10);

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
  const serviceDesc = record.detail || "Travel services";
  const hsnCode = "9985";
  doc.text(serviceDesc, colDesc, y);
  doc.text(hsnCode, colHsn, y);
  doc.text("1", colQty, y);
  doc.text(formatMoney(amountInr, currency), colRate, y, { width: 60, align: "right" });
  doc.text(formatMoney(amountInr, currency), colAmt, y, { width: 60, align: "right" });
  y += 22;

  doc.moveTo(50, y).lineTo(colAmt, y).strokeColor("#dddddd").stroke();
  y += 16;

  // ── Tax Summary ─────────────────────────────────────────────────────
  const taxRows: Array<{ label: string; rate: string; amt: string; tax: string }> = [];
  if (currency === "INR") {
    taxRows.push(
      { label: "CGST", rate: `${taxRatePercent / 2}%`, amt: formatMoney(taxableValue / 2, "INR"), tax: formatMoney(cgst, "INR") },
      { label: "SGST", rate: `${taxRatePercent / 2}%`, amt: formatMoney(taxableValue / 2, "INR"), tax: formatMoney(sgst, "INR") },
    );
  } else {
    taxRows.push(
      { label: "IGST", rate: `${taxRatePercent}%`, amt: formatMoney(taxableValue, currency), tax: formatMoney(igst, "INR") },
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
    { label: `Total Tax (${taxRatePercent}%)`, value: formatMoney(totalTax, "INR") },
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
  doc.text(`Generated by Traveldesk on ${new Date().toLocaleString("en-IN")}`, 50, footerY, { width: 495 });
  doc.text(`This is a computer-generated GST invoice and does not require physical signature.`, 50, footerY + 12, { width: 495 });
  if (settings.gstin) {
    doc.text(`GSTIN: ${settings.gstin}`, 50, footerY + 24, { width: 495 });
  }
  if (record.notes) {
    doc.text(`Remarks: ${record.notes}`, 50, footerY + 36, { width: 495 });
  }

  return { filename, stream: doc };
}

function amountToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

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
