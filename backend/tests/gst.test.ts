import { describe, expect, it } from "vitest";
import {
  buildGstr1,
  buildGstr3b,
  computeInvoiceGst,
  computePurchaseGst,
  isValidGstin,
  resolveGstTreatment,
  stateCodeFromGstin,
} from "../src/services/gst";

/**
 * GST is the part of the product where a wrong answer becomes a notice from
 * the department, so these cases pin the rules down: what is taxed, at what
 * rate, under which head, and which invoices cannot be filed as they are.
 */

const base = {
  date: "2026-05-10",
  currency: "INR",
  defaultRate: 18,
  sellerState: "27",
  zeroRatedExports: true,
};

describe("GSTIN handling", () => {
  it("accepts a well-formed GSTIN and reads its state", () => {
    expect(isValidGstin("27AABCU9603R1ZM")).toBe(true);
    expect(stateCodeFromGstin("27AABCU9603R1ZM")).toBe("27");
  });

  it("rejects malformed GSTINs instead of trusting the first two digits", () => {
    expect(isValidGstin("27ABC")).toBe(false);
    expect(stateCodeFromGstin("27ABC")).toBe("");
  });
});

describe("place of supply", () => {
  it("is inter-state when the buyer's GSTIN is in another state", () => {
    const treatment = resolveGstTreatment({
      currency: "INR",
      sellerState: "27",
      buyerGstin: "29AABCU9603R1Z5",
    });
    expect(treatment.interState).toBe(true);
    expect(treatment.placeOfSupply).toBe("29");
    expect(treatment.supplyType).toBe("b2b");
  });

  it("keeps an unknown place of supply unknown rather than assuming local", () => {
    const treatment = resolveGstTreatment({ currency: "INR", sellerState: "27" });
    expect(treatment.placeOfSupply).toBe("");
    expect(treatment.interState).toBe(false);
    expect(treatment.supplyType).toBe("b2c");
  });

  it("treats a foreign-currency invoice as a zero-rated export", () => {
    const treatment = resolveGstTreatment({
      currency: "USD",
      sellerState: "27",
      buyerGstin: "29AABCU9603R1Z5",
    });
    expect(treatment.isExport).toBe(true);
    expect(treatment.zeroRated).toBe(true);
    expect(treatment.placeOfSupply).toBe("96");
  });
});

describe("invoice tax", () => {
  it("carves the tax out of the amount the customer pays, without drift", () => {
    const invoice = computeInvoiceGst({
      ...base,
      reference: "INV-1",
      name: "Priya Mehta",
      amount: 100000,
      extra: { gstRate: 18 },
    });
    expect(invoice.taxable).toBe(84745.76);
    expect(invoice.tax).toBe(15254.24);
    // Taxable + tax must equal what was charged, to the paisa.
    expect(Math.round((invoice.taxable + invoice.tax) * 100) / 100).toBe(invoice.total);
  });

  it("splits CGST and SGST so they add back to the total tax", () => {
    const invoice = computeInvoiceGst({
      ...base,
      reference: "INV-2",
      name: "Local customer",
      amount: 999,
      extra: { gstRate: 18 },
    });
    expect(invoice.igst).toBe(0);
    expect(Math.round((invoice.cgst + invoice.sgst) * 100) / 100).toBe(invoice.tax);
  });

  it("charges IGST for an inter-state buyer", () => {
    const invoice = computeInvoiceGst({
      ...base,
      reference: "INV-3",
      name: "Bengaluru customer",
      amount: 11800,
      extra: { gstRate: 18, buyerGstin: "29AABCU9603R1Z5" },
    });
    expect(invoice.igst).toBe(invoice.tax);
    expect(invoice.cgst).toBe(0);
    expect(invoice.sgst).toBe(0);
  });

  it("charges no tax on a zero-rated export, whatever the rate says", () => {
    const invoice = computeInvoiceGst({
      ...base,
      reference: "INV-4",
      name: "Global traveller",
      currency: "USD",
      amount: 5000,
      extra: { gstRate: 18 },
    });
    expect(invoice.treatment.zeroRated).toBe(true);
    expect(invoice.tax).toBe(0);
    expect(invoice.taxable).toBe(invoice.total);
    expect(invoice.rate).toBe(0);
  });

  it("charges IGST on an export when the agency does not use an LUT", () => {
    const invoice = computeInvoiceGst({
      ...base,
      reference: "INV-5",
      name: "Global traveller",
      currency: "USD",
      amount: 5000,
      extra: { gstRate: 18 },
      zeroRatedExports: false,
    });
    expect(invoice.treatment.zeroRated).toBe(false);
    expect(invoice.igst).toBeGreaterThan(0);
  });

  it("adds TCS on top of the invoice value, not into it", () => {
    const invoice = computeInvoiceGst({
      ...base,
      reference: "INV-6",
      name: "Priya Mehta",
      amount: 200000,
      extra: { gstRate: 5 },
      defaultTcsPercent: 5,
    });
    expect(invoice.tcs).toBe(10000);
    expect(invoice.total).toBe(200000);
  });
});

describe("GSTR-1", () => {
  const period = { from: "2026-05-01", to: "2026-05-31" };

  function invoice(overrides: Partial<Parameters<typeof computeInvoiceGst>[0]>) {
    return computeInvoiceGst({
      ...base,
      reference: "INV-1",
      name: "Customer",
      amount: 11800,
      extra: { gstRate: 18 },
      ...overrides,
    });
  }

  it("puts a registered buyer in 4A and an unregistered one in 7", () => {
    const report = buildGstr1(
      [
        invoice({ reference: "INV-B2B", extra: { gstRate: 18, buyerGstin: "27AABCU9603R1ZM" } }),
        invoice({ reference: "INV-B2C" }),
      ],
      period,
    );
    expect(report.b2b).toHaveLength(1);
    expect(report.b2b[0]!.gstin).toBe("27AABCU9603R1ZM");
    expect(report.b2cs).toHaveLength(1);
    expect(report.totals.invoices).toBe(2);
  });

  it("aggregates B2C invoices by place of supply and rate", () => {
    const report = buildGstr1(
      [
        invoice({ reference: "INV-A", extra: { gstRate: 18, placeOfSupply: "27" } }),
        invoice({ reference: "INV-B", extra: { gstRate: 18, placeOfSupply: "27" } }),
        invoice({ reference: "INV-C", extra: { gstRate: 5, placeOfSupply: "27" } }),
      ],
      period,
    );
    expect(report.b2cs).toHaveLength(2);
    expect(report.b2cs.find((row) => row.rate === 18)?.invoices).toBe(2);
  });

  it("reports exports in 6A as zero-rated", () => {
    const report = buildGstr1(
      [invoice({ reference: "INV-EXP", currency: "USD", extra: { gstRate: 18 } })],
      period,
    );
    expect(report.exports).toHaveLength(1);
    expect(report.exports[0]!.type).toBe("WOPAY");
    expect(report.b2b).toHaveLength(0);
    expect(report.b2cs).toHaveLength(0);
  });

  it("flags an invoice with no place of supply instead of filing it silently", () => {
    const report = buildGstr1([invoice({ reference: "INV-NOPOS" })], period);
    expect(report.issues).toEqual([
      { reference: "INV-NOPOS", problem: "No place of supply — add the buyer's GSTIN or state code" },
    ]);
  });
});

describe("GSTR-3B", () => {
  const period = { from: "2026-05-01", to: "2026-05-31" };

  it("nets input credit against output tax head by head", () => {
    const output = computeInvoiceGst({
      ...base,
      reference: "INV-1",
      name: "Customer",
      amount: 11800,
      extra: { gstRate: 18, buyerGstin: "27AABCU9603R1ZM" },
    });
    const report = buildGstr3b(
      [output],
      [
        {
          reference: "PAY-1",
          amount: 5900,
          gstRate: 18,
          gstin: "27AABCU9603R1ZM",
        },
      ],
      period,
      "27",
    );
    expect(report.outward.cgst).toBe(900);
    expect(report.itc.cgst).toBe(450);
    expect(report.net.cgst).toBe(450);
    expect(report.issues).toHaveLength(0);
  });

  it("claims no credit for a bill without a supplier GSTIN, and says why", () => {
    const report = buildGstr3b(
      [],
      [{ reference: "PAY-2", amount: 11800, gstRate: 18, gstin: "" }],
      period,
      "27",
    );
    expect(report.itc.tax).toBe(1800);
    expect(report.itc.cgst).toBe(0);
    expect(report.net.tax).toBe(0);
    expect(report.issues[0]!.problem).toContain("Supplier GSTIN missing");
  });

  it("keeps zero-rated supplies out of the taxable outward figure", () => {
    const exportInvoice = computeInvoiceGst({
      ...base,
      reference: "INV-EXP",
      name: "Global traveller",
      currency: "USD",
      amount: 5000,
      extra: { gstRate: 18 },
    });
    const report = buildGstr3b([exportInvoice], [], period, "27");
    expect(report.outward.taxable).toBe(0);
    expect(report.zeroRated.taxable).toBe(5000);
    expect(report.net.tax).toBe(0);
  });
});

describe("purchase tax", () => {
  it("splits IGST for an out-of-state supplier", () => {
    const purchase = computePurchaseGst({
      amount: 11800,
      gstRate: 18,
      supplierGstin: "29AABCU9603R1Z5",
      sellerState: "27",
    });
    expect(purchase.taxable).toBe(10000);
    expect(purchase.igst).toBe(1800);
    expect(purchase.cgst).toBe(0);
  });
});
