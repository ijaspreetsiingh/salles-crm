import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { NotFoundError } from "../lib/errors";

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
  defaultTaxRate?: number;
  invoicePrefix?: string;
  fxRates?: Record<string, number>;
};

/**
 * Generates a real, printable tax invoice PDF for a finance record.
 * Currency: a foreign-currency invoice shows the FX rate used (settings →
 * fxRates, with sane defaults) so the INR tax value is never a mystery.
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
  const taxRate = typeof settings.defaultTaxRate === "number" ? settings.defaultTaxRate : 18;
  const currency = record.currency || organization.currency || "INR";
  const fxRates = { ...DEFAULT_FX, ...(settings.fxRates ?? {}) };
  const fxRate = currency === "INR" ? 1 : fxRates[currency] ?? 0;
  const amountInr = currency === "INR" ? record.amount : Math.round(record.amount * (fxRate || 1));
  const taxAmount = Math.round((amountInr * taxRate) / 100);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const filename = `invoice-${record.reference}.pdf`;

  const orgEmail = record.email;

  // Header
  doc.fontSize(20).font("Helvetica-Bold").text(organization.name);
  doc.fontSize(9).font("Helvetica").fillColor("#555555");
  if (organization.legalName) doc.text(organization.legalName);
  if (organization.address) doc.text(organization.address);
  const contact: string[] = [];
  if (organization.gstin) contact.push(`GSTIN: ${organization.gstin}`);
  if (organization.supportEmail) contact.push(organization.supportEmail);
  if (organization.phone) contact.push(organization.phone);
  if (contact.length) doc.text(contact.join("  ·  "));
  doc.moveDown(1.4);
  doc.fillColor("#17191a");

  // Title row
  doc.fontSize(16).font("Helvetica-Bold").text("TAX INVOICE");
  doc.fontSize(9).font("Helvetica").fillColor("#555555");
  doc.text(`Invoice no: ${record.reference}`, { continued: false });
  doc.text(`Date: ${record.date ? new Date(record.date).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}`);
  doc.text(`Status: ${record.status}`);
  doc.moveDown(1.2);
  doc.fillColor("#17191a");

  // Bill-to
  doc.fontSize(11).font("Helvetica-Bold").text("Bill to", { continued: false });
  doc.fontSize(10).font("Helvetica");
  doc.text(record.name);
  if (orgEmail) doc.text(orgEmail);
  if (record.phone) doc.text(record.phone);
  if (record.destination) doc.text(`Destination: ${record.destination}`);
  doc.moveDown(1.2);

  // Line items table
  const tableTop = doc.y + 6;
  const colAmount = 430;
  doc.rect(50, tableTop, 495, 26).fill("#2f5c50");
  doc.fillColor("#fbf8f2").font("Helvetica-Bold").fontSize(10);
  doc.text("Description", 62, tableTop + 8);
  doc.text("Amount", colAmount, tableTop + 8, { width: 100, align: "right" });
  doc.fillColor("#17191a").font("Helvetica").fontSize(10);

  let y = tableTop + 34;
  const detailLines = (record.detail || "Travel services").split(" ").reduce<string[]>((lines, word) => {
    const last = lines[lines.length - 1];
    if (last && (last + " " + word).length <= 70) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
    return lines;
  }, []);
  for (const line of detailLines) {
    doc.text(line, 62, y);
    doc.text(formatMoney(record.amount, currency), colAmount, y, { width: 100, align: "right" });
    y += 18;
  }
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#dddddd").stroke();
  y += 14;

  // Totals
  const totalsY = y + 8;
  doc.font("Helvetica");
  doc.text(`Subtotal (${currency})`, 300, totalsY);
  doc.text(formatMoney(record.amount, currency), colAmount, totalsY, { width: 100, align: "right" });
  doc.text(`Tax (${settings.taxRegime || "GST"} ${taxRate}%)`, 300, totalsY + 18);
  doc.text(formatMoney(taxAmount, "INR"), colAmount, totalsY + 18, { width: 100, align: "right" });
  doc.font("Helvetica-Bold");
  doc.text("TOTAL (INR)", 300, totalsY + 42);
  doc.text(formatMoney(amountInr + taxAmount, "INR"), colAmount, totalsY + 42, { width: 100, align: "right" });
  doc.font("Helvetica");

  if (currency !== "INR") {
    doc
      .fontSize(8.5)
      .fillColor("#555555")
      .text(
        `FX rate applied: 1 ${currency} = ${fxRate || rateMissing(currency)} INR${
          fxRate ? "" : " (rate not configured — add it in Settings → Tax settings)"
        }`,
        50,
        totalsY + 66,
      );
    doc.fillColor("#17191a").fontSize(10);
  }

  // Footer
  const footerY = doc.page.height - 120;
  doc.fontSize(8.5).fillColor("#777777");
  doc.text(
    `Generated by Traveldesk on ${new Date().toLocaleString("en-IN")}. Payment of this invoice confirms the travel services described above.`,
    50,
    footerY,
    { width: 495 },
  );
  if (record.notes) {
    doc.text(`Notes: ${record.notes}`, 50, footerY + 26, { width: 495 });
  }

  return { filename, stream: doc };
}

function rateMissing(currency: string) {
  return `${currency} rate missing`;
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
