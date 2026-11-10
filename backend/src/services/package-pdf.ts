import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { NotFoundError } from "../lib/errors";

/**
 * A package as a document a customer can read and keep: the day-by-day plan,
 * what is included and what is not, the price for each group size, the
 * validity window and the terms — on the company's masthead.
 *
 * It never invents a price: a package with no published per-person rate says
 * so instead of printing a zero.
 */

type Settings = { fxRates?: Record<string, number> };

type Slab = { pax: number; rate: number };

type PlanDay = { title: string; detail: string };

export async function generatePackagePdf(input: {
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
      moduleId: "packages",
      deletedAt: null,
    },
  });
  if (!record) throw new NotFoundError("Package");

  const settings = parseJson<Settings>(organization.settings, {});
  const currency = record.currency || organization.currency || "INR";
  const extra = parseJson<Record<string, unknown>>(record.extra, {});
  const plan = parsePlan(extra);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const filename = `package-${record.reference}.pdf`;

  /* ---------------- Masthead ---------------- */
  const initials = organization.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  doc.rect(50, 44, 54, 54).fill("#2f5c50");
  doc
    .fillColor("#fbf8f2")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(initials || "T", 50, 61, { width: 54, align: "center" });
  doc.fillColor("#17191a").font("Helvetica-Bold").fontSize(19).text(organization.name, 118, 52);
  const contact = [organization.address, organization.phone, organization.supportEmail]
    .filter((line): line is string => Boolean(line && String(line).trim()))
    .join("  ·  ");
  if (contact) {
    doc.font("Helvetica").fontSize(8.5).fillColor("#555555").text(contact, 118, 78, { width: 420 });
  }
  doc.fillColor("#17191a");

  /* ---------------- Title block ---------------- */
  let y = 122;
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(record.name || "Travel package", 50, y, {
      width: 495,
    });
  y += 26;
  const facts: string[] = [];
  if (record.destination) facts.push(record.destination);
  const nights = plan.days.length > 1 ? plan.days.length - 1 : null;
  if (nights !== null) facts.push(`${plan.days.length} days / ${nights} nights`);
  if (plan.validTo) facts.push(`valid till ${formatDate(plan.validTo)}`);
  doc.font("Helvetica").fontSize(10).fillColor("#444444");
  if (facts.length > 0) doc.text(facts.join("   ·   "), 50, y, { width: 495 });
  y += 20;
  doc
    .fontSize(9)
    .fillColor("#777777")
    .text(
      `Package ${record.reference}  ·  ${currency}  ·  prepared ${formatDate(new Date().toISOString())}`,
      50,
      y,
      { width: 495 },
    );
  doc.fillColor("#17191a");

  /* ---------------- Price by group size ---------------- */
  y += 26;
  y = sectionBar(doc, "Price per person", y);
  doc.font("Helvetica").fontSize(9.5).fillColor("#17191a");
  if (plan.slabs.length === 0) {
    doc
      .fontSize(9)
      .fillColor("#555555")
      .text("Price on request — no per-person rate is published for this package yet.", 62, y, {
        width: 470,
      });
    y += 16;
  } else {
    for (const slab of plan.slabs) {
      doc.font("Helvetica").fontSize(9.5).fillColor("#17191a");
      doc.text(`${slab.pax} traveller${slab.pax === 1 ? "" : "s"}`, 62, y, { width: 200 });
      doc.text(`${formatMoney(slab.rate, currency)} per person`, 262, y, {
        width: 150,
        align: "right",
      });
      doc.text(`${formatMoney(slab.rate * slab.pax, currency)} total`, 430, y, {
        width: 110,
        align: "right",
      });
      y += 15;
    }
    y += 4;
    if (plan.childRate !== null) {
      doc
        .fontSize(8.5)
        .fillColor("#555555")
        .text(`Child rate ${formatMoney(plan.childRate, currency)} per child.`, 62, y, {
          width: 470,
        });
      y += 13;
    }
    if (plan.singleSupplement !== null) {
      doc
        .fontSize(8.5)
        .fillColor("#555555")
        .text(
          `Single-traveller supplement ${formatMoney(plan.singleSupplement, currency)}.`,
          62,
          y,
          { width: 470 },
        );
      y += 13;
    }
  }
  doc.fillColor("#17191a");

  /* ---------------- Day-by-day ---------------- */
  if (plan.days.length > 0) {
    y += 12;
    y = ensure(doc, y, 60);
    y = sectionBar(doc, `Day-by-day plan (${plan.days.length} days)`, y);
    plan.days.slice(0, 60).forEach((day, index) => {
      y = ensure(doc, y, 40);
      doc
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .fillColor("#17191a")
        .text(`Day ${index + 1}${day.title ? `  ${day.title}` : ""}`, 62, y, { width: 470 });
      y += 14;
      if (day.detail) {
        doc.font("Helvetica").fontSize(8.5).fillColor("#444444");
        for (const line of wrapText(day.detail, 96)) {
          y = ensure(doc, y, 14);
          doc.text(line, 62, y, { width: 470 });
          y += 12;
        }
      }
      y += 8;
      doc.fillColor("#17191a");
    });
  }

  /* ---------------- Inclusions / exclusions ---------------- */
  if (plan.inclusions.length > 0) {
    y += 8;
    y = ensure(doc, y, 50);
    y = sectionBar(doc, "What is included", y);
    doc.font("Helvetica").fontSize(8.5).fillColor("#444444");
    for (const entry of plan.inclusions.slice(0, 30)) {
      for (const line of wrapText(`•  ${entry}`, 104)) {
        y = ensure(doc, y, 14);
        doc.text(line, 62, y, { width: 470 });
        y += 12;
      }
      y += 2;
    }
    doc.fillColor("#17191a");
  }

  if (plan.exclusions.length > 0) {
    y += 8;
    y = ensure(doc, y, 50);
    y = sectionBar(doc, "Not included", y);
    doc.font("Helvetica").fontSize(8.5).fillColor("#444444");
    for (const entry of plan.exclusions.slice(0, 30)) {
      for (const line of wrapText(`•  ${entry}`, 104)) {
        y = ensure(doc, y, 14);
        doc.text(line, 62, y, { width: 470 });
        y += 12;
      }
      y += 2;
    }
    doc.fillColor("#17191a");
  }

  /* ---------------- Terms ---------------- */
  const terms = [
    plan.validTo
      ? `Prices are valid till ${formatDate(plan.validTo)} and subject to availability at the time of booking.`
      : "Prices are subject to availability at the time of booking.",
    ...(plan.terms ? [plan.terms] : []),
    "Anything not listed under “what is included” is not part of this package.",
  ];
  y += 10;
  y = ensure(doc, y, 90);
  doc
    .moveTo(50, y - 8)
    .lineTo(545, y - 8)
    .strokeColor("#dddddd")
    .stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#17191a").text("Terms & conditions", 50, y);
  y += 14;
  doc.font("Helvetica").fontSize(8.5).fillColor("#444444");
  for (const term of terms) {
    for (const line of wrapText(`•  ${term}`, 108)) {
      y = ensure(doc, y, 14);
      doc.text(line, 50, y, { width: 495 });
      y += 12;
    }
    y += 2;
  }
  doc.fillColor("#17191a");

  /* ---------------- Footer ---------------- */
  doc
    .fontSize(8)
    .fillColor("#888888")
    .text(
      `Prepared by ${organization.name} using Traveldesk on ${new Date().toLocaleString("en-IN")}`,
      50,
      doc.page.height - 46,
      { width: 495 },
    );

  return { filename, stream: doc };
}

/* ------------------------------------------------------------------ */

function parsePlan(extra: Record<string, unknown>): {
  days: PlanDay[];
  inclusions: string[];
  exclusions: string[];
  slabs: Slab[];
  childRate: number | null;
  singleSupplement: number | null;
  validTo: string;
  terms: string;
} {
  const stored = readObject(extra["packagePlan"]);
  const days = readArray(stored["days"] ?? extra["itinerary"])
    .map((entry) => {
      const day = readObject(entry);
      return {
        title: String(day["title"] ?? "")
          .trim()
          .slice(0, 140),
        detail: String(day["detail"] ?? "")
          .trim()
          .slice(0, 800),
      };
    })
    .filter((day) => day.title || day.detail);
  const slabs = readArray(stored["slabs"])
    .map((entry) => {
      const slab = readObject(entry);
      const pax = Number(slab["pax"]);
      const rate = Number(slab["rate"]);
      return Number.isFinite(pax) && pax > 0 && Number.isFinite(rate) && rate > 0
        ? { pax: Math.round(pax), rate }
        : null;
    })
    .filter((slab): slab is Slab => Boolean(slab))
    .sort((a, b) => a.pax - b.pax);
  const number = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    days,
    inclusions: readList(stored["inclusions"]),
    exclusions: readList(stored["exclusions"]),
    slabs,
    childRate: number(stored["childRate"]),
    singleSupplement: number(stored["singleSupplement"]),
    validTo: String(stored["validTo"] ?? "").trim(),
    terms: String(stored["terms"] ?? "").trim(),
  };
}

function readObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function readArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function readList(raw: unknown): string[] {
  const isList = Array.isArray(raw) || (typeof raw === "string" && raw.trim().startsWith("["));
  if (isList) {
    return readArray(raw)
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean)
      .map((entry) => entry.slice(0, 180));
  }
  return typeof raw === "string"
    ? raw
        .split(new RegExp(String.fromCharCode(13, 10) + "|" + String.fromCharCode(10)))
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function sectionBar(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.rect(50, y, 495, 22).fill("#f3efe6");
  doc
    .fillColor("#2f5c50")
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(title, 62, y + 7);
  doc.fillColor("#17191a");
  return y + 32;
}

/** Start a new page when there is not enough room left. */
function ensure(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed <= doc.page.height - 90) return y;
  doc.addPage();
  return 60;
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
