import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { NotFoundError } from "../lib/errors";

const VALIDITY_DAYS = 15;

type Settings = {
  taxRegime?: string;
  /** The frontend saves taxRate; defaultTaxRate is the older key. */
  taxRate?: number;
  defaultTaxRate?: number;
  fxRates?: Record<string, number>;
};

type QuoteItem = {
  label: string;
  /** How many units (nights, pax, vehicles…). Default 1. */
  qty?: number;
  /** Price per unit. */
  rate: number;
};

/**
 * A real, professional travel quotation PDF. Not a bare number — a document a
 * customer can sign off on:
 *   · company masthead with logo block and GSTIN
 *   · quote number, issue date and a hard validity date
 *   · itemised packages (hotels, flights, transport, sightseeing…)
 *   · tax, total, amount in words
 *   · terms, inclusions/exclusions and a signature block
 */
export async function generateQuotationPdf(input: {
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
  if (!record) throw new NotFoundError("Quotation record");

  const settings = parseJson<Settings>(organization.settings, {});
  const taxRate =
    typeof settings.taxRate === "number"
      ? settings.taxRate
      : typeof settings.defaultTaxRate === "number"
        ? settings.defaultTaxRate
        : 5;
  const currency = record.currency || organization.currency || "INR";

  const extra = parseJson<Record<string, unknown>>(record.extra, {});
  // Line items are stored as a JSON array (or JSON string) under quoteItems.
  const rawItems: unknown[] = Array.isArray(extra.quoteItems)
    ? (extra.quoteItems as unknown[])
    : typeof extra.quoteItems === "string" && extra.quoteItems
      ? (() => {
          try {
            const parsed = JSON.parse(extra.quoteItems as string);
            return Array.isArray(parsed) ? (parsed as unknown[]) : [];
          } catch {
            return [];
          }
        })()
      : [];
  const items: QuoteItem[] = rawItems
    .filter(
      (item): item is QuoteItem =>
        Boolean(item) && typeof (item as { rate?: unknown }).rate === "number",
    )
    .map((item) => ({
      label: String(item.label || "Package component").slice(0, 90),
      qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
      rate: Number(item.rate),
    }));
  // No line items maintained? The quoted amount stands as one package line.
  if (items.length === 0 && record.amount > 0) {
    items.push({
      label: record.detail?.slice(0, 120) || `Complete trip package — ${record.destination || "as discussed"}`,
      qty: 1,
      rate: record.amount,
    });
  }
  const subtotal = items.reduce((sum, item) => sum + item.qty! * item.rate, 0);
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const grandTotal = subtotal + taxAmount;

  const issueDate = record.date ? new Date(record.date) : new Date();
  const validUntil = new Date(issueDate);
  validUntil.setDate(validUntil.getDate() + VALIDITY_DAYS);
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // A proposal is a soft, no-commitment pitch; a quotation is a priced offer.
  const isProposal = extra.docKind === "proposal";
  const docTitle = isProposal ? "TRAVEL PROPOSAL" : "TRAVEL QUOTATION";

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const filename = `quotation-${record.reference}.pdf`;

  /* ---------------- Masthead: logo block + company ---------------- */
  const initials = organization.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  doc.rect(50, 44, 54, 54).fill("#2f5c50");
  doc.fillColor("#fbf8f2").font("Helvetica-Bold").fontSize(22).text(initials || "T", 50, 61, {
    width: 54,
    align: "center",
  });
  doc.fillColor("#17191a").font("Helvetica-Bold").fontSize(19).text(organization.name, 118, 52);
  doc.fontSize(9).font("Helvetica").fillColor("#555555");
  let headY = 74;
  if (organization.legalName) {
    doc.text(organization.legalName, 118, headY);
    headY += 12;
  }
  if (organization.address) {
    doc.text(organization.address, 118, headY, { width: 300 });
    headY += 12;
  }
  const contact: string[] = [];
  if (organization.gstin) contact.push(`GSTIN: ${organization.gstin}`);
  if (organization.supportEmail) contact.push(organization.supportEmail);
  if (organization.phone) contact.push(organization.phone);
  if (contact.length) doc.text(contact.join("   ·   "), 118, headY, { width: 340 });
  doc.fillColor("#17191a");

  /* ---------------- Title band ---------------- */
  doc
    .rect(50, 112, 495, 30)
    .fill("#f3efe6");
  doc
    .fillColor("#2f5c50")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(docTitle, 66, 121);
  doc
    .fillColor("#555555")
    .font("Helvetica")
    .fontSize(9)
    .text(`Quote no: ${record.reference}`, 350, 118);
  doc.text(`Issued: ${fmt(issueDate)}`, 350, 130);
  doc
    .fillColor("#17191a")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`Valid until: ${fmt(validUntil)}`, 460, 118, { width: 90, align: "right" });
  doc.moveDown(0);

  /* ---------------- Customer ---------------- */
  let y = 160;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#17191a").text("Prepared for", 50, y);
  doc.fontSize(10).font("Helvetica");
  y += 16;
  doc.text(record.name, 50, y);
  y += 14;
  if (record.email) {
    doc.text(record.email, 50, y);
    y += 13;
  }
  if (record.phone) {
    doc.text(record.phone, 50, y);
    y += 13;
  }
  if (record.destination) {
    doc.text(`Destination: ${record.destination}`, 50, y);
    y += 13;
  }

  // Trip facts on the right
  const facts: string[] = [];
  if (record.destination) facts.push(`Destination      ${record.destination}`);
  const travellers = Number(extra.travellers);
  if (Number.isFinite(travellers) && travellers > 0) {
    facts.push(`Travellers       ${travellers}`);
  }
  const nights = Number(extra.nights);
  if (Number.isFinite(nights) && nights > 0) facts.push(`Nights           ${nights}`);
  facts.push(`Currency         ${currency}`);
  doc.fontSize(10).font("Helvetica").fillColor("#17191a");
  doc.text("Trip summary", 330, 160, { width: 215, align: "left" });
  doc.fontSize(9.5);
  doc.text(facts.join("\n"), 330, 176, { width: 215 });

  /* ---------------- Line items ---------------- */
  y = Math.max(y + 22, 236);
  const colRate = 360;
  const colAmount = 445;
  doc.rect(50, y, 495, 26).fill("#2f5c50");
  doc.fillColor("#fbf8f2").font("Helvetica-Bold").fontSize(10);
  doc.text("Package details", 62, y + 8);
  doc.text("Rate", colRate, y + 8, { width: 60, align: "right" });
  doc.text("Amount", colAmount, y + 8, { width: 90, align: "right" });
  doc.fillColor("#17191a").font("Helvetica").fontSize(10);

  y += 34;
  for (const item of items) {
    const label =
      item.qty! > 1
        ? `${item.label}  ×${item.qty}`
        : item.label;
    for (const line of wrapText(label, 64)) {
      doc.text(line, 62, y);
      y += 15;
    }
    doc.text(formatMoney(item.rate, currency), colRate, y - 15, { width: 60, align: "right" });
    doc.text(formatMoney(item.qty! * item.rate, currency), colAmount, y - 15, {
      width: 90,
      align: "right",
    });
    y += 4;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e4e0d5").stroke();
    y += 10;
  }

  /* ---------------- Totals ---------------- */
  y += 6;
  doc.font("Helvetica").fontSize(10).fillColor("#17191a");
  doc.text("Subtotal", 300, y);
  doc.text(formatMoney(subtotal, currency), colAmount, y, { width: 90, align: "right" });
  doc.text(`${settings.taxRegime || "GST"} (${taxRate}%)`, 300, y + 18);
  doc.text(formatMoney(taxAmount, currency), colAmount, y + 18, { width: 90, align: "right" });
  doc.rect(296, y + 36, 253, 24).fill("#f3efe6");
  doc.font("Helvetica-Bold").fillColor("#17191a");
  doc.text("Total estimate", 302, y + 42);
  doc.text(formatMoney(grandTotal, currency), colAmount, y + 42, { width: 90, align: "right" });
  doc.font("Helvetica");

  if (currency === "INR") {
    doc
      .fontSize(8.5)
      .fillColor("#555555")
      .text(`Amount in words: ${amountInWords(grandTotal)} only`, 50, y + 74, { width: 495 });
  }
  doc.fillColor("#17191a").fontSize(10);

  /* ---------------- Terms ---------------- */
  const termsY = Math.max(y + 100, doc.page.height - 210);
  doc.moveTo(50, termsY - 14).lineTo(545, termsY - 14).strokeColor("#dddddd").stroke();
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#17191a").text("Terms & conditions", 50, termsY);
  doc.fontSize(8.5).font("Helvetica").fillColor("#444444");
  const terms = [
    isProposal
      ? `This proposal is indicative and valid till ${fmt(validUntil)} — final pricing is confirmed at booking.`
      : `This quotation is valid till ${fmt(validUntil)}. Prices may change after that.`,
    "25% advance confirms the booking; balance due 15 days before departure.",
    record.notes
      ? `Inclusions / notes: ${record.notes}`
      : "Inclusions and exclusions as per the package details above.",
    "Cancellations are subject to supplier and hotel policies.",
  ];
  let termY = termsY + 14;
  for (const term of terms) {
    for (const line of wrapText(`•  ${term}`, 108)) {
      doc.text(line, 50, termY, { width: 495 });
      termY += 12;
    }
    termY += 2;
  }

  /* ---------------- Signature ---------------- */
  const signY = doc.page.height - 92;
  doc.fontSize(9).fillColor("#17191a").font("Helvetica-Bold");
  doc.text(`For ${organization.name}`, 380, signY);
  doc.moveTo(380, signY + 40).lineTo(520, signY + 40).strokeColor("#999999").stroke();
  doc.fontSize(8).font("Helvetica").fillColor("#777777");
  doc.text("Authorised signatory", 380, signY + 44);

  doc.fontSize(8).fillColor("#888888");
  doc.text(`Generated by Traveldesk on ${new Date().toLocaleString("en-IN")}`, 50, doc.page.height - 46, {
    width: 495,
  });

  return { filename, stream: doc };
}

function wrapText(text: string, maxChars: number): string[] {
  return text.split(" ").reduce<string[]>((lines, word) => {
    const last = lines[lines.length - 1] ?? "";
    if (last && (last + " " + word).length <= maxChars) {
      lines[lines.length - 1] = last + " " + word;
    } else {
      lines.push(word);
    }
    return lines;
  }, []);
}

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Indian numbering: crores, lakhs, thousands, hundreds. */
export function amountInWords(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  if (n === 0) return "zero rupees";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (crore) parts.push(`${chunkWords(crore)} crore`);
  if (lakh) parts.push(`${chunkWords(lakh)} lakh`);
  if (thousand) parts.push(`${chunkWords(thousand)} thousand`);
  if (hundred) parts.push(`${ONES[hundred]} hundred`);
  if (rest) parts.push(chunkWords(rest));
  return `${parts.join(" ")} rupees`;
}

function chunkWords(n: number): string {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return one ? `${TENS[ten]} ${ONES[one]}` : TENS[ten];
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
