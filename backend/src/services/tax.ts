/**
 * Tax calculation utilities shared between the tax-summary report and the
 * invoice PDF generator.
 *
 * The old code guessed whether a stored `gst` value was a rate percentage or
 * an absolute rupee amount by checking `> 50`. That heuristic breaks for
 * services taxed above 50% and is fragile. The new convention uses explicit
 * field names in the record's `extra` JSON:
 *
 *   - `gstRate`   — the GST rate as a percentage (e.g. 18 for 18%)
 *   - `gstAmount` — the absolute tax amount in rupees (for overrides/legacy)
 *   - `gst`       — legacy field, interpreted as a rate. Values above 50
 *                  are still treated as absolute rupees for very old records.
 */

import { roundMoney } from "../lib/money";

export type TaxBreakdown = {
  /** Effective GST rate as a percentage (e.g. 18 for 18%). */
  rate: number;
  /** Taxable value (the amount before tax). */
  taxable: number;
  /** Tax amount in the same currency as the invoice. */
  tax: number;
};

/** Carves tax out of a tax-inclusive amount using a percentage rate. */
function splitByRate(amount: number, rate: number): { taxable: number; tax: number } {
  if (rate <= 0) return { taxable: amount, tax: 0 };
  const taxable = amount / (1 + rate / 100);
  return { taxable, tax: amount - taxable };
}

/**
 * Resolves the GST breakdown for an invoice from its `extra` fields.
 *
 * Priority:
 *   1. `gstAmount` (explicit absolute tax in rupees)
 *   2. `gstRate`  (explicit percentage rate — the preferred new path)
 *   3. `gst`      (legacy field; treated as a rate, or as absolute rupees
 *                  when the value exceeds 50 for very old records)
 *   4. `defaultRate` (organisation-level default)
 *
 * Returns rounded-to-2dp values so downstream reports and PDFs never show
 * floating-point noise.
 */
export function resolveInvoiceTax(
  amount: number,
  extra: Record<string, unknown>,
  defaultRate = 0,
): TaxBreakdown {
  // 1. Explicit absolute tax amount (rupees).
  const explicitAmount = Number(extra["gstAmount"] ?? 0);
  if (explicitAmount > 0) {
    const tax = Math.min(explicitAmount, amount);
    const taxable = amount - tax;
    const rate = taxable > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0;
    return { rate, taxable: roundMoney(taxable), tax: roundMoney(tax) };
  }

  // 2. Explicit rate percentage — the preferred new path.
  const explicitRate = Number(extra["gstRate"] ?? -1);
  if (explicitRate >= 0) {
    const { taxable, tax } = splitByRate(amount, explicitRate);
    return { rate: explicitRate, taxable: roundMoney(taxable), tax: roundMoney(tax) };
  }

  // 3. Legacy `gst` field: interpret as a rate. Values above 50 are treated
  //    as absolute rupees for backward compatibility with very old records.
  const legacy = Number(extra["gst"] ?? 0);
  if (legacy > 50) {
    const tax = Math.min(legacy, amount);
    const taxable = amount - tax;
    const rate = taxable > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0;
    return { rate, taxable: roundMoney(taxable), tax: roundMoney(tax) };
  }

  // 4. Fall back to the organisation-level default rate.
  const rate = legacy > 0 ? legacy : defaultRate;
  const { taxable, tax } = splitByRate(amount, rate);
  return { rate, taxable: roundMoney(taxable), tax: roundMoney(tax) };
}

/**
 * Resolves the GST rate percentage for an invoice, without computing the
 * full breakdown. Used by the PDF generator which needs the rate for the
 * IGST/CGST+SGST split.
 */
export function resolveGstRate(
  extra: Record<string, unknown>,
  defaultRate = 0,
): { ratePercent: number; legacyAbsoluteAmount: number | null } {
  const explicitRate = Number(extra["gstRate"] ?? -1);
  if (explicitRate >= 0) return { ratePercent: explicitRate, legacyAbsoluteAmount: null };

  const explicitAmount = Number(extra["gstAmount"] ?? 0);
  if (explicitAmount > 0) return { ratePercent: 0, legacyAbsoluteAmount: explicitAmount };

  const legacy = Number(extra["gst"] ?? 0);
  if (legacy > 50) return { ratePercent: 0, legacyAbsoluteAmount: legacy };

  return { ratePercent: legacy > 0 ? legacy : defaultRate, legacyAbsoluteAmount: null };
}
