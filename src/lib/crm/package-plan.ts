/**
 * A travel package is the thing an agency actually sells: a day-by-day plan,
 * a list of what is included, and a price that changes with group size.
 *
 * Everything lives in the record's `extra` bag under one key (`packagePlan`)
 * so a package is still a normal record — searchable, branch-scoped and
 * exportable — while the plan itself stays structured.
 *
 * Nothing here invents a number. If a supplier cost is not on record the
 * margin is `null`, and a child with no child rate is charged at the adult
 * rate *and said so* (`childRateAssumed`), never quietly discounted.
 */

import type { RecordRow } from "./catalog";

export type PackageDay = { title: string; detail: string };

/** Per-person price for a group of `pax` travellers. */
export type PaxSlab = { pax: number; rate: number };

export type PackagePlan = {
  days: PackageDay[];
  inclusions: string[];
  exclusions: string[];
  /** Price ladder: "2 travellers ₹48,000 pp", "4 travellers ₹44,000 pp"… */
  slabs: PaxSlab[];
  /** Per-child price. `null` means "same as an adult" — shown, not hidden. */
  childRate: number | null;
  /** Extra charged when one person travels alone. */
  singleSupplement: number | null;
  /** What the trip costs us per person. `null` = unknown, margin unavailable. */
  costPerPerson: number | null;
  validFrom: string;
  validTo: string;
  terms: string;
};

export const PLAN_KEY = "packagePlan";

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function parseJsonArray(raw: unknown): unknown[] {
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

function parseObject(raw: unknown): Record<string, unknown> {
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

export function emptyPlan(): PackagePlan {
  return {
    days: [],
    inclusions: [],
    exclusions: [],
    slabs: [],
    childRate: null,
    singleSupplement: null,
    costPerPerson: null,
    validFrom: "",
    validTo: "",
    terms: "",
  };
}

function readDays(raw: unknown): PackageDay[] {
  return parseJsonArray(raw)
    .map((entry) => {
      const day = parseObject(entry);
      return { title: text(day["title"]).slice(0, 140), detail: text(day["detail"]).slice(0, 800) };
    })
    .filter((day) => day.title.length > 0 || day.detail.length > 0);
}

function readLines(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : [];
  return list.map((line) => text(line).slice(0, 160)).filter(Boolean);
}

function readSlabs(raw: unknown): PaxSlab[] {
  return parseJsonArray(raw)
    .map((entry) => {
      const slab = parseObject(entry);
      const pax = num(slab["pax"]);
      const rate = num(slab["rate"]);
      return pax && rate ? { pax: Math.round(pax), rate } : null;
    })
    .filter((slab): slab is PaxSlab => Boolean(slab))
    .sort((a, b) => a.pax - b.pax);
}

/**
 * The plan on a package record, with older records (which only had an
 * `itinerary` list and one selling price) read correctly.
 */
export function readPackagePlan(row: RecordRow | null | undefined): PackagePlan {
  const extra = row?.extra ?? {};
  const stored = parseObject(extra[PLAN_KEY]);
  const days = readDays(stored["days"] ?? extra["itinerary"]);
  const inclusions = readLines(stored["inclusions"]);
  const exclusions = readLines(stored["exclusions"]);
  const detail = text(row?.detail);
  return {
    days,
    // Old packages kept inclusions in the one-line "Inclusions" field; once a
    // plan is stored, an empty list means the person removed them on purpose.
    inclusions:
      inclusions.length > 0 || Object.keys(stored).length > 0
        ? inclusions
        : detail
          ? [detail]
          : [],
    exclusions,
    slabs: readSlabs(stored["slabs"]),
    childRate: num(stored["childRate"]),
    singleSupplement: num(stored["singleSupplement"]),
    costPerPerson: num(stored["costPerPerson"]) ?? num(extra["cost"]),
    validFrom: text(stored["validFrom"]),
    validTo: text(stored["validTo"]) || text(row?.date),
    terms: text(stored["terms"]),
  };
}

/** The `extra` keys to write back — mirrors `itinerary` so old screens still read it. */
export function planExtra(plan: PackagePlan): Record<string, string> {
  return {
    [PLAN_KEY]: JSON.stringify(plan),
    itinerary: JSON.stringify(plan.days),
  };
}

/** Nights implied by the day-by-day plan (a 6-day trip is 5 nights). */
export function plannedNights(plan: PackagePlan): number | null {
  return plan.days.length > 1 ? plan.days.length - 1 : null;
}

/**
 * The slab that applies to `adults` travellers: the best (largest) group size
 * that is no bigger than the party. A party smaller than every slab pays the
 * smallest slab's rate — that is the published "from" price.
 */
export function slabForAdults(slabs: PaxSlab[], adults: number): PaxSlab | null {
  if (slabs.length === 0) return null;
  const sorted = [...slabs].sort((a, b) => a.pax - b.pax);
  const fitting = sorted.filter((slab) => slab.pax <= adults);
  return fitting.length > 0 ? fitting[fitting.length - 1]! : sorted[0]!;
}

export type PackagePrice = {
  slab: PaxSlab | null;
  perPerson: number;
  adultsTotal: number;
  children: number;
  childRate: number | null;
  /** True when a child is charged the adult rate because no child rate is set. */
  childRateAssumed: boolean;
  childrenTotal: number;
  /** Single-traveller supplement actually applied, if any. */
  singleSupplement: number;
  total: number;
};

export function priceForTravellers(
  plan: PackagePlan,
  adults: number,
  children = 0,
): PackagePrice {
  const party = Math.max(1, Math.round(adults || 1));
  const kids = Math.max(0, Math.round(children || 0));
  const slab = slabForAdults(plan.slabs, party);
  const perPerson = slab?.rate ?? 0;
  const adultsTotal = perPerson * party;
  const childRateAssumed = kids > 0 && plan.childRate === null;
  const childRate = kids > 0 ? (plan.childRate ?? perPerson) : null;
  const childrenTotal = kids > 0 ? (childRate ?? 0) * kids : 0;
  const singleSupplement = party === 1 ? (plan.singleSupplement ?? 0) : 0;
  return {
    slab,
    perPerson,
    adultsTotal,
    children: kids,
    childRate,
    childRateAssumed,
    childrenTotal,
    singleSupplement,
    total: adultsTotal + childrenTotal + singleSupplement,
  };
}

/** Margin per person, or `null` when no supplier cost is on record. */
export function packageMargin(
  plan: PackagePlan,
  adults = 2,
): { perPerson: number; amount: number | null; percent: number | null } {
  const price = priceForTravellers(plan, adults);
  if (plan.costPerPerson === null || price.perPerson <= 0) {
    return { perPerson: price.perPerson, amount: null, percent: null };
  }
  const amount = price.perPerson - plan.costPerPerson;
  return {
    perPerson: price.perPerson,
    amount,
    percent: Math.round((amount / price.perPerson) * 1000) / 10,
  };
}

/** The lowest published per-person rate — the "from" price on a card. */
export function fromPrice(plan: PackagePlan): number | null {
  if (plan.slabs.length === 0) return null;
  return plan.slabs.reduce((min, slab) => Math.min(min, slab.rate), Number.POSITIVE_INFINITY);
}

export type PackageQuoteItem = { label: string; qty: number; rate: number };

/**
 * Line items for a quotation built from this package. Rates are tax-exclusive,
 * exactly like every other quote line, so the PDF adds GST on top once.
 */
export function quoteItemsFromPlan(
  plan: PackagePlan,
  packageName: string,
  adults: number,
  children = 0,
): PackageQuoteItem[] {
  const price = priceForTravellers(plan, adults, children);
  const heading = packageName.trim() || "Travel package";
  const items: PackageQuoteItem[] = [];
  if (price.perPerson > 0) {
    items.push({
      label: `${heading} — ${adults} traveller${adults === 1 ? "" : "s"} (per person)`,
      qty: Math.max(1, Math.round(adults)),
      rate: price.perPerson,
    });
  }
  if (price.children > 0 && (price.childRate ?? 0) > 0) {
    items.push({
      label: `Children — ${price.children} (${price.childRateAssumed ? "charged at the adult rate" : "child rate"})`,
      qty: price.children,
      rate: price.childRate ?? 0,
    });
  }
  if (price.singleSupplement > 0) {
    items.push({ label: "Single-traveller supplement", qty: 1, rate: price.singleSupplement });
  }
  return items;
}

/**
 * Everything a quotation needs so the PDF can print the plan the customer
 * actually agreed to — itinerary, what is included, what is not.
 */
export function planQuoteExtra(
  plan: PackagePlan,
  options: { travellers: number; packageRef?: string },
): Record<string, string> {
  const extra: Record<string, string> = {
    docKind: "quotation",
    travellers: String(options.travellers),
    itinerary: JSON.stringify(plan.days),
    inclusions: JSON.stringify(plan.inclusions),
    exclusions: JSON.stringify(plan.exclusions),
  };
  if (options.packageRef) extra["packageRef"] = options.packageRef;
  if (plan.validTo) extra["validTo"] = plan.validTo;
  if (plan.terms) extra["terms"] = plan.terms;
  return extra;
}
