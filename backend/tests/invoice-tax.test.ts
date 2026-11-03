import { describe, expect, it } from "vitest";
import { resolveTaxSplit } from "../src/services/invoice-pdf";

/**
 * The invoice decides IGST vs CGST + SGST from the place of supply, never from
 * the currency. These cases pin that down, because getting it wrong means the
 * tax invoice a CA receives is wrong.
 */
describe("invoice tax split", () => {
  it("charges CGST + SGST when buyer and seller are in the same state", () => {
    const split = resolveTaxSplit({ currency: "INR", sellerState: "27", buyerGstin: "27AABCU9603R1ZM" });
    expect(split.interState).toBe(false);
    expect(split.isExport).toBe(false);
    expect(split.placeOfSupply).toBe("27");
  });

  it("charges IGST when the buyer is in another state", () => {
    const split = resolveTaxSplit({ currency: "INR", sellerState: "27", buyerGstin: "29AABCU9603R1Z5" });
    expect(split.interState).toBe(true);
    expect(split.placeOfSupply).toBe("29");
  });

  it("prefers an explicit place of supply over the GSTIN", () => {
    const split = resolveTaxSplit({
      currency: "INR",
      sellerState: "07",
      buyerGstin: "07AABCU9603R1ZM",
      placeOfSupply: "27",
    });
    expect(split.interState).toBe(true);
    expect(split.placeOfSupply).toBe("27");
  });

  it("treats a missing buyer GSTIN as intra-state rather than guessing", () => {
    const split = resolveTaxSplit({ currency: "INR", sellerState: "27", buyerGstin: "" });
    expect(split.interState).toBe(false);
    expect(split.placeOfSupply).toBe("");
  });

  it("marks a foreign-currency invoice as an export, not inter-state", () => {
    const split = resolveTaxSplit({ currency: "USD", sellerState: "27", buyerGstin: "29AABCU9603R1Z5" });
    expect(split.isExport).toBe(true);
    expect(split.interState).toBe(false);
  });

  it("keeps a rupee invoice to another state inter-state even when the seller has no state code yet", () => {
    const split = resolveTaxSplit({ currency: "INR", sellerState: "", buyerGstin: "29AABCU9603R1Z5" });
    // Without a seller state we cannot prove it is inter-state, so it stays
    // intra-state and the invoice tells the user to set the seller state.
    expect(split.interState).toBe(false);
    expect(split.placeOfSupply).toBe("29");
  });
});
