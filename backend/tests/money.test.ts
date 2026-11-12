import { describe, expect, it } from "vitest";
import {
  fromPaise,
  moneyEquals,
  moneyGte,
  num,
  roundMoney,
  subtractMoney,
  sumMoney,
  toPaise,
} from "../src/lib/money";
import { computeLedgerTotals } from "../src/services/payment-ledger";

/**
 * Money must be exact.
 *
 * A receipt of ₹33,333.33 three times is ₹99,999.99, not ₹99,999.99000000001.
 * These tests pin the arithmetic every invoice, ledger and GST report relies
 * on, so a future refactor cannot quietly reintroduce float drift.
 */
describe("money arithmetic", () => {
  it("rounds the classic float noise away", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the reason this module exists
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it("adds a month of odd receipts without drift", () => {
    expect(sumMoney([33_333.33, 33_333.33, 33_333.33])).toBe(99_999.99);
    expect(sumMoney([1250.5, 999.99, 0.01])).toBe(2250.5);
  });

  it("rounds half a paisa up, never to a fraction of a paisa", () => {
    expect(toPaise(0.005)).toBe(1);
    expect(fromPaise(1)).toBe(0.01);
    expect(toPaise(1234.567)).toBe(123_457);
    expect(Number.isInteger(toPaise(19.99))).toBe(true);
  });

  it("subtracts in paise so a refund lands exactly on zero", () => {
    expect(subtractMoney(100, 0.1)).toBe(99.9);
    expect(subtractMoney(99_999.99, 99_999.99)).toBe(0);
    expect(subtractMoney(1, 0.99)).toBe(0.01);
  });

  it("compares amounts to the paisa, not to the bit", () => {
    // Both are the same rupee amount once the float error is gone.
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    expect(moneyEquals(1000, 1000.004)).toBe(true);
    expect(moneyEquals(1000, 1000.02)).toBe(false);
    expect(moneyGte(0.1 + 0.2, 0.3)).toBe(true);
    expect(moneyGte(999.99, 1000)).toBe(false);
  });

  it("turns every shape a database can return into a number", () => {
    // Prisma Decimal stringifies; aggregates bypass the read extension.
    expect(num({ toString: () => "1234.56" })).toBe(1234.56);
    expect(num("789.01")).toBe(789.01);
    expect(num(42)).toBe(42);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("not-a-number")).toBe(0);
    expect(num(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

/**
 * The ledger is what makes an invoice say "paid". These cases mirror the
 * awkward ones a real agency hits: part payments, a refund, an overpayment.
 */
describe("ledger totals", () => {
  it("sums part payments and reports the exact balance", () => {
    const totals = computeLedgerTotals(
      [
        { amount: 40_000, kind: "payment" },
        { amount: 30_000, kind: "payment" },
      ],
      100_000,
    );
    expect(totals.received).toBe(70_000);
    expect(totals.refunded).toBe(0);
    expect(totals.net).toBe(70_000);
    expect(totals.balance).toBe(30_000);
    expect(totals.count).toBe(2);
  });

  it("clears the balance on a three-way split of a non-round invoice", () => {
    const totals = computeLedgerTotals(
      [
        { amount: 33_333.33, kind: "payment" },
        { amount: 33_333.33, kind: "payment" },
        { amount: 33_333.34, kind: "payment" },
      ],
      100_000,
    );
    expect(totals.received).toBe(100_000);
    expect(totals.balance).toBe(0);
  });

  it("takes a refund out of the net without touching what was received", () => {
    const totals = computeLedgerTotals(
      [
        { amount: 50_000, kind: "payment" },
        { amount: 10_000, kind: "refund" },
      ],
      50_000,
    );
    expect(totals.received).toBe(50_000);
    expect(totals.refunded).toBe(10_000);
    expect(totals.net).toBe(40_000);
    expect(totals.balance).toBe(10_000);
  });

  it("never shows a negative balance when a customer overpays", () => {
    const totals = computeLedgerTotals([{ amount: 105_000, kind: "payment" }], 100_000);
    expect(totals.balance).toBe(0);
    expect(totals.net).toBe(105_000);
  });

  it("treats an empty ledger as nothing paid", () => {
    const totals = computeLedgerTotals([], 18_000.5);
    expect(totals).toEqual({
      received: 0,
      refunded: 0,
      net: 0,
      balance: 18_000.5,
      count: 0,
    });
  });
});
