import { prisma } from "./prisma";
import { parseJson } from "./utils";

/**
 * Foreign-exchange rates used for consolidated reporting.
 *
 * The organisation's base currency is the one number the owner reads: revenue,
 * outstanding and pipeline cannot be added across currencies, because ₹84 and
 * $1 are not the same rupee. Rates are a fallback only — a workspace can
 * override them in Settings → Tax settings, and the invoice PDF and the
 * dashboard then use the same table.
 */
export const DEFAULT_FX_RATES: Record<string, number> = {
  INR: 1,
  USD: 84,
  EUR: 91,
  GBP: 108,
  AED: 23,
  SGD: 63,
};

export type FxContext = {
  baseCurrency: string;
  rates: Record<string, number>;
};

/** Reads the workspace base currency and its rate table. */
export async function fxContext(organizationId: string): Promise<FxContext> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { currency: true, settings: true },
  });
  const settings = parseJson<{ fxRates?: Record<string, number> }>(
    organization?.settings ?? "{}",
    {},
  );
  const overrides = settings.fxRates ?? {};
  const rates: Record<string, number> = { ...DEFAULT_FX_RATES };
  for (const [code, value] of Object.entries(overrides)) {
    const rate = Number(value);
    if (Number.isFinite(rate) && rate > 0) rates[code.toUpperCase()] = rate;
  }
  const baseCurrency = (organization?.currency || "INR").toUpperCase();
  rates[baseCurrency] = 1;
  return { baseCurrency, rates };
}

/**
 * Converts a record amount into the base currency.
 *
 * Returns `null` when the currency has no configured rate. Callers must treat
 * that as "not consolidated" and surface it, never silently add the raw number
 * as if it were rupees — a made-up rate is worse than a missing total.
 */
export function convertToBase(
  amount: number,
  currency: string | null | undefined,
  ctx: FxContext,
): number | null {
  const code = (currency || ctx.baseCurrency).toUpperCase();
  if (code === ctx.baseCurrency) return round2(amount);
  const rate = ctx.rates[code];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return round2(amount * rate);
}

/** Rate for one currency, or null when unknown. */
export function rateFor(currency: string | null | undefined, ctx: FxContext): number | null {
  const code = (currency || ctx.baseCurrency).toUpperCase();
  if (code === ctx.baseCurrency) return 1;
  const rate = ctx.rates[code];
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
