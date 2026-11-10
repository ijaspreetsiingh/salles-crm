import type { Prisma } from "@prisma/client";

/**
 * Money utilities — all financial calculations go through here so floating-
 * point noise never reaches a receipt, a ledger or a tax report.
 *
 * The database stores every money column as exact `DECIMAL(14,2)`; the Prisma
 * client in `lib/prisma.ts` converts those columns back to plain numbers on
 * read. These helpers cover what is still arithmetic in application memory:
 * rounding at the 2-decimal boundary, and integer-paise maths for sums,
 * comparisons and ledger reconciliation.
 */

/**
 * A database row as it comes back from the money-aware Prisma client: the
 * named money columns are already normalised to numbers.
 */
export type MoneyRow<T, K extends keyof T> = Omit<T, K> & { [P in K]: number };

/** Same as `MoneyRow` for columns that may be unset. */
export type NullableMoneyRow<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: number | null;
};

/** The `Record` model with `amount` already converted from Decimal. */
export type RecordRow = MoneyRow<Prisma.RecordGetPayload<object>, "amount">;

/**
 * Coerces anything the database can hand back for a money column — a number,
 * a `Decimal`, a numeric string or null — into a plain number.
 *
 * Aggregations (`_sum`, `groupBy`) bypass the client-side normalisation in
 * `lib/prisma.ts` and still return `Decimal`, so every aggregate read must go
 * through this.
 */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Rounds to 2 decimal places (the precision of most fiat currencies). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Converts rupees to integer paise (exact for integer arithmetic). */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Converts integer paise back to rupees. */
export function fromPaise(paise: number): number {
  return roundMoney(paise / 100);
}

/**
 * Sums an array of money values without floating-point accumulation.
 *
 * Each value is converted to paise, summed as integers, then converted back.
 * `0.1 + 0.2 + 0.3` becomes `10 + 20 + 30 = 60 paise = ₹0.60`, never
 * `0.6000000000000001`.
 */
export function sumMoney(values: number[]): number {
  const totalPaise = values.reduce((sum, v) => sum + toPaise(v), 0);
  return fromPaise(totalPaise);
}

/**
 * Subtracts `b` from `a` with exact paise arithmetic.
 */
export function subtractMoney(a: number, b: number): number {
  return fromPaise(toPaise(a) - toPaise(b));
}

/**
 * True when two money values are equal within half a paisa.
 * Used to check whether an invoice is fully paid without being tripped up
 * by rounding: `amount === received` can be false even when they match
 * to the rupee.
 */
export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(toPaise(a) - toPaise(b)) <= 1;
}

/**
 * True when `a >= b` in paise terms (avoids `0.9999999 >= 1` false negatives).
 */
export function moneyGte(a: number, b: number): boolean {
  return toPaise(a) >= toPaise(b);
}
