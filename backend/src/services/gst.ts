import { roundMoney } from "../lib/money";
import { resolveGstRate } from "./tax";

/**
 * GST rules, in one place.
 *
 * The invoice PDF, the Tax & GST working paper, the GSTR-1 export, the GSTR-3B
 * export and the Tally journal all have to agree about the same invoice. They
 * agree because they all ask this module the same two questions:
 *
 *   1. Where is this supply taxed? (place of supply, export, inter-state)
 *   2. How much tax is inside this amount? (rate, taxable value, split)
 */

/** Two-digit GST state codes. 96 = other country, 97 = other territory. */
export const GST_STATE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "96": "Other country",
  "97": "Other territory",
};

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** True for a well-formed 15-character GSTIN. */
export function isValidGstin(value: string): boolean {
  return GSTIN_PATTERN.test(value.trim().toUpperCase());
}

/** The two-digit state code embedded in a GSTIN, or "" when it is not one. */
export function stateCodeFromGstin(gstin: string | undefined): string {
  const clean = (gstin ?? "").trim().toUpperCase();
  if (!isValidGstin(clean)) return "";
  return clean.slice(0, 2);
}

export type SupplyType = "b2b" | "b2c" | "export";

export type GstTreatment = {
  /** Services exported outside India — zero-rated, reported in GSTR-1 table 6A. */
  isExport: boolean;
  /** Zero-rated under an LUT, so no tax is charged. */
  zeroRated: boolean;
  /** IGST applies because the supply crosses a state line. */
  interState: boolean;
  /** Two-digit place-of-supply code, or "" when the invoice does not say. */
  placeOfSupply: string;
  placeOfSupplyName: string;
  supplyType: SupplyType;
};

/**
 * Decides how an invoice is taxed.
 *
 * Order:
 *   1. A foreign-currency invoice (or an explicit `export` flag) is an export.
 *      Exports are zero-rated when the agency has filed an LUT, which is the
 *      default for service exporters; otherwise IGST is charged and refunded.
 *   2. The place of supply is the explicit state code, else the buyer's GSTIN
 *      state code, else (for exports) "96".
 *   3. A domestic supply is inter-state when the buyer's state differs from the
 *      seller's. With either side unknown it stays intra-state and the caller
 *      reports the invoice as incomplete instead of guessing.
 */
export function resolveGstTreatment(input: {
  currency: string;
  sellerState: string;
  buyerGstin?: string;
  placeOfSupply?: string;
  exportFlag?: boolean;
  /** Set false when the agency pays IGST on exports and claims a refund. */
  zeroRatedExports?: boolean;
}): GstTreatment {
  const currency = (input.currency || "INR").toUpperCase();
  const isExport = Boolean(input.exportFlag) || currency !== "INR";
  const explicit = (input.placeOfSupply ?? "").trim();
  const fromGstin = stateCodeFromGstin(input.buyerGstin);
  const seller = (input.sellerState ?? "").trim();
  // An unknown place of supply stays unknown (""): the invoice and the GST
  // return both flag it, instead of assuming the customer is local. An export
  // is always taxed at place of supply 96 (outside India), even if a stray
  // buyer GSTIN is on the invoice.
  const placeOfSupply = explicit
    ? explicit.slice(0, 2)
    : isExport
      ? "96"
      : fromGstin || "";

  const zeroRated = isExport && input.zeroRatedExports !== false;
  const interState = isExport
    ? !zeroRated // only a taxed export sits under IGST
    : Boolean(seller) && Boolean(placeOfSupply) && seller !== placeOfSupply;

  const buyerGstin = (input.buyerGstin ?? "").trim();
  const supplyType: SupplyType = isExport ? "export" : buyerGstin ? "b2b" : "b2c";

  return {
    isExport,
    zeroRated,
    interState,
    placeOfSupply,
    placeOfSupplyName: GST_STATE_NAMES[placeOfSupply] ?? "",
    supplyType,
  };
}

export type InvoiceGst = {
  reference: string;
  name: string;
  date: string;
  currency: string;
  /** What the customer pays, tax included. */
  total: number;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  tcs: number;
  tcsRate: number;
  buyerGstin: string;
  treatment: GstTreatment;
};

/**
 * Computes the full tax position of one invoice from its stored amount.
 *
 * The amount on the invoice is what the customer pays, tax included, so the
 * tax is carved out rather than added on. A zero-rated export carries no tax
 * at all, whatever rate is configured — charging 18% and calling it an export
 * would make the GSTR-1 wrong and the invoice non-compliant.
 */
export function computeInvoiceGst(input: {
  reference: string;
  name: string;
  date: string;
  currency: string;
  amount: number;
  extra: Record<string, unknown>;
  defaultRate: number;
  sellerState: string;
  zeroRatedExports?: boolean;
  /** Default TCS percent from organisation settings. */
  defaultTcsPercent?: number;
}): InvoiceGst {
  const buyerGstin = String(input.extra["buyerGstin"] ?? "").trim().toUpperCase();
  const treatment = resolveGstTreatment({
    currency: input.currency,
    sellerState: input.sellerState,
    buyerGstin,
    placeOfSupply: String(input.extra["placeOfSupply"] ?? ""),
    exportFlag: input.extra["export"] === true || input.extra["isExport"] === true,
    zeroRatedExports: input.zeroRatedExports,
  });

  const { ratePercent, legacyAbsoluteAmount } = resolveGstRate(input.extra, input.defaultRate);
  const total = roundMoney(input.amount);

  let rate = ratePercent;
  let tax = 0;

  if (treatment.zeroRated) {
    // Export under LUT: no tax, the whole amount is the taxable value.
    rate = 0;
    tax = 0;
  } else if (legacyAbsoluteAmount !== null) {
    tax = Math.min(roundMoney(legacyAbsoluteAmount), total);
    const taxable = total - tax;
    rate = taxable > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0;
  } else if (ratePercent > 0) {
    tax = roundMoney((total * ratePercent) / (100 + ratePercent));
  }

  const taxable = roundMoney(total - tax);
  const cgst = treatment.interState ? 0 : roundMoney(tax / 2);
  const sgst = treatment.interState ? 0 : roundMoney(tax - cgst);
  const igst = treatment.interState ? tax : 0;

  const tcsRate =
    Number(input.extra["tcsRate"] ?? input.defaultTcsPercent ?? 0) || 0;
  const tcs = tcsRate > 0 ? roundMoney((total * tcsRate) / 100) : 0;

  return {
    reference: input.reference,
    name: input.name,
    date: input.date,
    currency: input.currency,
    total,
    rate,
    taxable,
    cgst,
    sgst,
    igst,
    tax,
    tcs,
    tcsRate,
    buyerGstin: isValidGstin(buyerGstin) ? buyerGstin : "",
    treatment,
  };
}

export type CreditNoteGst = {
  reference: string;
  invoiceReference: string;
  amount: number;
  gstRate: number;
  customerGstin: string;
  date: string;
};

export type Gstr1Report = {
  period: { from: string; to: string };
  /** Table 9B: credit notes issued in the period. */
  creditNotes: Array<{
    creditNoteNumber: string;
    invoiceNumber: string;
    date: string;
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    total: number;
  }>;
  /** Table 4A: registered buyers, one row per invoice. */
  b2b: Array<{
    gstin: string;
    receiverName: string;
    placeOfSupply: string;
    invoiceNumber: string;
    invoiceDate: string;
    invoiceValue: number;
    rate: number;
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
  }>;
  /** Table 7: unregistered buyers, aggregated per place of supply and rate. */
  b2cs: Array<{
    placeOfSupply: string;
    rate: number;
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    invoices: number;
  }>;
  /** Table 6A: zero-rated exports. */
  exports: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    invoiceValue: number;
    currency: string;
    taxable: number;
    /** WPAY = with payment of IGST, WOPAY = under LUT. */
    type: "WPAY" | "WOPAY";
  }>;
  totals: {
    invoices: number;
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    tax: number;
  };
  /** Invoices that cannot be filed as-is, with the reason. */
  issues: Array<{ reference: string; problem: string }>;
};

/** Builds the GSTR-1 view (outward supplies) from already-computed invoices. */
export function buildGstr1(
  invoices: InvoiceGst[],
  period: { from: string; to: string },
  creditNotes: CreditNoteGst[] = [],
  sellerState = "",
): Gstr1Report {
  const b2b: Gstr1Report["b2b"] = [];
  const b2cMap = new Map<string, Gstr1Report["b2cs"][number]>();
  const exports: Gstr1Report["exports"] = [];
  const issues: Gstr1Report["issues"] = [];
  const totals = { invoices: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0 };

  for (const invoice of invoices) {
    totals.invoices += 1;
    totals.taxable = roundMoney(totals.taxable + invoice.taxable);
    totals.igst = roundMoney(totals.igst + invoice.igst);
    totals.cgst = roundMoney(totals.cgst + invoice.cgst);
    totals.sgst = roundMoney(totals.sgst + invoice.sgst);
    totals.tax = roundMoney(totals.tax + invoice.tax);

    if (!invoice.treatment.placeOfSupply) {
      issues.push({
        reference: invoice.reference,
        problem: "No place of supply — add the buyer's GSTIN or state code",
      });
    }

    if (invoice.treatment.isExport) {
      exports.push({
        invoiceNumber: invoice.reference,
        invoiceDate: invoice.date,
        invoiceValue: invoice.total,
        currency: invoice.currency,
        taxable: invoice.taxable,
        type: invoice.treatment.zeroRated ? "WOPAY" : "WPAY",
      });
      continue;
    }

    if (invoice.buyerGstin) {
      b2b.push({
        gstin: invoice.buyerGstin,
        receiverName: invoice.name,
        placeOfSupply: invoice.treatment.placeOfSupply,
        invoiceNumber: invoice.reference,
        invoiceDate: invoice.date,
        invoiceValue: invoice.total,
        rate: invoice.rate,
        taxable: invoice.taxable,
        igst: invoice.igst,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
      });
      continue;
    }

    // B2C: aggregate so a thousand small invoices stay one line per state+rate.
    const key = `${invoice.treatment.placeOfSupply}|${invoice.rate}`;
    const row = b2cMap.get(key) ?? {
      placeOfSupply: invoice.treatment.placeOfSupply,
      rate: invoice.rate,
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      invoices: 0,
    };
    row.taxable = roundMoney(row.taxable + invoice.taxable);
    row.igst = roundMoney(row.igst + invoice.igst);
    row.cgst = roundMoney(row.cgst + invoice.cgst);
    row.sgst = roundMoney(row.sgst + invoice.sgst);
    row.invoices += 1;
    b2cMap.set(key, row);
  }

  /*
   * Credit notes reduce the tax already reported on their original invoice.
   * They get their own 9B rows and are netted out of the totals; leaving them
   * out overstates both turnover and GST payable.
   */
  const creditNoteRows: Gstr1Report["creditNotes"] = creditNotes.map((note) => {
    const rate = Number(note.gstRate) || 0;
    const total = roundMoney(note.amount);
    const taxable = rate > 0 ? roundMoney(total / (1 + rate / 100)) : total;
    const tax = roundMoney(total - taxable);
    const buyerState = stateCodeFromGstin(note.customerGstin);
    const interState = Boolean(buyerState) && Boolean(sellerState) && buyerState !== sellerState;
    return {
      creditNoteNumber: note.reference,
      invoiceNumber: note.invoiceReference,
      date: note.date,
      taxable,
      igst: interState ? tax : 0,
      cgst: interState ? 0 : roundMoney(tax / 2),
      sgst: interState ? 0 : roundMoney(tax - roundMoney(tax / 2)),
      total,
    };
  });
  for (const note of creditNoteRows) {
    totals.taxable = roundMoney(totals.taxable - note.taxable);
    totals.igst = roundMoney(totals.igst - note.igst);
    totals.cgst = roundMoney(totals.cgst - note.cgst);
    totals.sgst = roundMoney(totals.sgst - note.sgst);
    totals.tax = roundMoney(totals.tax - note.igst - note.cgst - note.sgst);
  }

  return {
    period,
    creditNotes: creditNoteRows,
    b2b,
    b2cs: [...b2cMap.values()].sort(
      (a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rate - b.rate,
    ),
    exports,
    totals,
    issues,
  };
}

export type PurchaseGst = { amount: number; gstRate: number; gstin: string };

export function computePurchaseGst(input: {
  amount: number;
  gstRate: number;
  supplierGstin: string;
  sellerState: string;
}) {
  const rate = Number(input.gstRate) || 0;
  const total = roundMoney(input.amount);
  const taxable = rate > 0 ? roundMoney(total / (1 + rate / 100)) : total;
  const tax = roundMoney(total - taxable);
  const supplierState = stateCodeFromGstin(input.supplierGstin);
  const interState = Boolean(supplierState) && Boolean(input.sellerState)
    ? supplierState !== input.sellerState
    : false;
  return {
    taxable,
    tax,
    igst: interState ? tax : 0,
    cgst: interState ? 0 : roundMoney(tax / 2),
    sgst: interState ? 0 : roundMoney(tax - roundMoney(tax / 2)),
    /** Without a GSTIN the inter-state split is unknown; flagged for the CA. */
    gstinMissing: !input.supplierGstin,
  };
}

export type Gstr3bReport = {
  period: { from: string; to: string };
  outward: { taxable: number; igst: number; cgst: number; sgst: number; tax: number };
  creditNotes: { taxable: number; igst: number; cgst: number; sgst: number; tax: number; count: number };
  zeroRated: { taxable: number; exports: number };
  itc: { taxable: number; igst: number; cgst: number; sgst: number; tax: number; bills: number };
  /** Negative means credit carried forward. */
  net: { igst: number; cgst: number; sgst: number; tax: number };
  issues: Array<{ reference: string; problem: string }>;
};

/**
 * Builds the GSTR-3B summary: outward tax minus input credit.
 *
 * Input credit is only the tax on bills that carry a supplier GSTIN. A bill
 * without one is still counted in `itc.taxable` (so the numbers reconcile with
 * the profit report) but the return flags it, because claiming credit without
 * a GSTIN is exactly how a business gets a notice.
 */
export function buildGstr3b(
  invoices: InvoiceGst[],
  purchases: Array<PurchaseGst & { reference: string }>,
  period: { from: string; to: string },
  sellerState: string,
  creditNotes: CreditNoteGst[] = [],
): Gstr3bReport {
  const issues: Gstr3bReport["issues"] = [];
  const outward = { taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0 };
  const zeroRated = { taxable: 0, exports: 0 };

  for (const invoice of invoices) {
    if (invoice.treatment.zeroRated) {
      zeroRated.taxable = roundMoney(zeroRated.taxable + invoice.taxable);
      zeroRated.exports += 1;
      continue;
    }
    outward.taxable = roundMoney(outward.taxable + invoice.taxable);
    outward.igst = roundMoney(outward.igst + invoice.igst);
    outward.cgst = roundMoney(outward.cgst + invoice.cgst);
    outward.sgst = roundMoney(outward.sgst + invoice.sgst);
    outward.tax = roundMoney(outward.tax + invoice.tax);
  }

  const creditNoteTotals = { taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0, count: 0 };
  for (const note of creditNotes) {
    const rate = Number(note.gstRate) || 0;
    const total = roundMoney(note.amount);
    const taxable = rate > 0 ? roundMoney(total / (1 + rate / 100)) : total;
    const tax = roundMoney(total - taxable);
    const buyerState = stateCodeFromGstin(note.customerGstin);
    const interState =
      Boolean(buyerState) && Boolean(sellerState) && buyerState !== sellerState;
    const igst = interState ? tax : 0;
    const cgst = interState ? 0 : roundMoney(tax / 2);
    const sgst = interState ? 0 : roundMoney(tax - cgst);
    creditNoteTotals.taxable = roundMoney(creditNoteTotals.taxable + taxable);
    creditNoteTotals.igst = roundMoney(creditNoteTotals.igst + igst);
    creditNoteTotals.cgst = roundMoney(creditNoteTotals.cgst + cgst);
    creditNoteTotals.sgst = roundMoney(creditNoteTotals.sgst + sgst);
    creditNoteTotals.tax = roundMoney(creditNoteTotals.tax + tax);
    creditNoteTotals.count += 1;
    outward.taxable = roundMoney(outward.taxable - taxable);
    outward.igst = roundMoney(outward.igst - igst);
    outward.cgst = roundMoney(outward.cgst - cgst);
    outward.sgst = roundMoney(outward.sgst - sgst);
    outward.tax = roundMoney(outward.tax - tax);
  }

  const itc = { taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0, bills: 0 };
  for (const purchase of purchases) {
    const computed = computePurchaseGst({
      amount: purchase.amount,
      gstRate: purchase.gstRate,
      supplierGstin: purchase.gstin,
      sellerState,
    });
    itc.taxable = roundMoney(itc.taxable + computed.taxable);
    itc.tax = roundMoney(itc.tax + computed.tax);
    itc.bills += 1;
    if (computed.gstinMissing) {
      issues.push({
        reference: purchase.reference,
        problem: "Supplier GSTIN missing — add it to claim input credit",
      });
      continue; // no credit without a GSTIN
    }
    itc.igst = roundMoney(itc.igst + computed.igst);
    itc.cgst = roundMoney(itc.cgst + computed.cgst);
    itc.sgst = roundMoney(itc.sgst + computed.sgst);
  }

  const net = {
    igst: roundMoney(outward.igst - itc.igst),
    cgst: roundMoney(outward.cgst - itc.cgst),
    sgst: roundMoney(outward.sgst - itc.sgst),
  };

  return {
    period,
    outward,
    creditNotes: creditNoteTotals,
    zeroRated,
    itc,
    net: { ...net, tax: roundMoney(net.igst + net.cgst + net.sgst) },
    issues,
  };
}

/** Escapes a CSV cell, including the spreadsheet formula-injection guard. */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** GSTR-1 as a spreadsheet a CA can open directly. */
export function gstr1Csv(report: Gstr1Report): string {
  const lines: string[] = [];
  lines.push("Section,GSTIN,Receiver,Place of supply,Invoice no,Invoice date,Rate,Taxable,IGST,CGST,SGST,Invoice value");
  for (const row of report.b2b) {
    lines.push(
      [
        "4A B2B",
        row.gstin,
        row.receiverName,
        `${row.placeOfSupply} ${GST_STATE_NAMES[row.placeOfSupply] ?? ""}`.trim(),
        row.invoiceNumber,
        row.invoiceDate,
        row.rate,
        row.taxable,
        row.igst,
        row.cgst,
        row.sgst,
        row.invoiceValue,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  for (const row of report.b2cs) {
    lines.push(
      [
        "7 B2C",
        "",
        "",
        `${row.placeOfSupply} ${GST_STATE_NAMES[row.placeOfSupply] ?? ""}`.trim(),
        `${row.invoices} invoice(s)`,
        "",
        row.rate,
        row.taxable,
        row.igst,
        row.cgst,
        row.sgst,
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  for (const row of report.creditNotes) {
    lines.push(
      [
        "9B Credit note",
        "",
        "",
        "",
        row.creditNoteNumber,
        row.date,
        "",
        row.taxable,
        row.igst,
        row.cgst,
        row.sgst,
        row.total,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  for (const row of report.exports) {
    lines.push(
      [
        "6A Export",
        "",
        "",
        "96 Other country",
        row.invoiceNumber,
        row.invoiceDate,
        "",
        row.taxable,
        "",
        "",
        "",
        row.invoiceValue,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
