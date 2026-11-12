import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildGstr1, buildGstr3b, computeInvoiceGst } from "../src/services/gst";
import { decryptSek, encryptWithSek } from "../src/services/einvoice";

/**
 * Regression tests for the production-gap work that can be pinned without a
 * database: GST credit-note netting and the IRP session-key crypto.
 *
 * The API/database half lives in `production-api.test.ts` and only runs when
 * TEST_DATABASE_URL points at a disposable Postgres.
 */

const period = { from: "2026-05-01", to: "2026-05-31" };

const invoice = computeInvoiceGst({
  date: "2026-05-10",
  currency: "INR",
  defaultRate: 18,
  sellerState: "27",
  zeroRatedExports: true,
  reference: "INV-CN-1",
  name: "Credit note customer",
  amount: 11800,
  extra: { gstRate: 18, placeOfSupply: "27" },
});

const creditNote = {
  reference: "CN-2401",
  invoiceReference: "INV-CN-1",
  amount: 1180,
  gstRate: 18,
  customerGstin: "",
  date: "2026-05-10",
};

describe("GSTR-1 credit notes (table 9B)", () => {
  it("reports the note as a 9B row and nets it out of the totals", () => {
    const report = buildGstr1([invoice], period, [creditNote], "27");
    expect(report.creditNotes).toEqual([
      {
        creditNoteNumber: "CN-2401",
        invoiceNumber: "INV-CN-1",
        date: "2026-05-10",
        taxable: 1000,
        igst: 0,
        cgst: 90,
        sgst: 90,
        total: 1180,
      },
    ]);
    // Invoice: 10,000 taxable + 1,800 tax. Credit note removes 1,000 + 180.
    expect(report.totals.taxable).toBe(9000);
    expect(report.totals.tax).toBe(1620);
  });

  it("uses IGST when the credit note's buyer is in another state", () => {
    const report = buildGstr1(
      [invoice],
      period,
      [{ ...creditNote, customerGstin: "29AABCU9603R1Z5" }],
      "27",
    );
    expect(report.creditNotes[0]!.igst).toBe(180);
    expect(report.creditNotes[0]!.cgst).toBe(0);
    expect(report.creditNotes[0]!.sgst).toBe(0);
  });

  it("does not subtract a note twice when there are no invoices", () => {
    const report = buildGstr1([], period, [creditNote], "27");
    expect(report.totals.tax).toBe(-180);
    expect(report.creditNotes).toHaveLength(1);
  });
});

describe("GSTR-3B credit notes", () => {
  it("reduces outward tax and reports the note separately", () => {
    const report = buildGstr3b([invoice], [], period, "27", [creditNote]);
    expect(report.outward.taxable).toBe(9000);
    expect(report.outward.tax).toBe(1620);
    expect(report.creditNotes).toEqual({
      taxable: 1000,
      igst: 0,
      cgst: 90,
      sgst: 90,
      tax: 180,
      count: 1,
    });
    expect(report.net.tax).toBe(1620);
  });
});

describe("IRP session-key crypto", () => {
  const appKey = "12345678901234567890123456789012";
  const sek = "abcdefghijklmnopqrstuvwxyz123456";

  function encryptSekForTest(plain: string, key: string): string {
    const cipher = crypto.createCipheriv("aes-256-ecb", Buffer.from(key, "utf8"), null);
    return Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("base64");
  }

  it("decrypts the 32-character Sek returned by the IRP", () => {
    expect(decryptSek(encryptSekForTest(sek, appKey), appKey)).toBe(sek);
  });

  it("encrypts a payload with the session key that the IRP can decrypt", () => {
    const payload = '{"Version":"1.1","Irn":"test"}';
    const encrypted = encryptWithSek(payload, sek);
    const decipher = crypto.createDecipheriv("aes-256-ecb", Buffer.from(sek, "utf8"), null);
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
    expect(plain).toBe(payload);
  });

  it("refuses a malformed AppKey instead of silently sending bad ciphertext", () => {
    expect(() => decryptSek("anything", "too-short")).toThrow(/AppKey must be exactly 32/);
  });

  it("refuses a Sek that is not 32 characters", () => {
    expect(() => encryptWithSek("payload", "short")).toThrow(/Sek must be exactly 32/);
  });

  it("refuses a Sek encrypted with a different AppKey", () => {
    const otherKey = "abcdefghijklmnopqrstuvwxyz123456";
    expect(() => decryptSek(encryptSekForTest(sek, otherKey), appKey)).toThrow();
  });
});
