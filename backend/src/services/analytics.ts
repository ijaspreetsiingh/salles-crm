import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";
import { parseJson } from "../lib/utils";
import { convertToBase, fxContext, type FxContext } from "../lib/fx";

type Filters = { branch?: string; from?: string; to?: string };

const recordFilter = (
  organizationId: string,
  moduleId: string,
  filters: Filters,
): Prisma.RecordWhereInput => ({
  organizationId,
  moduleId,
  deletedAt: null,
  ...(filters.branch ? { branchName: filters.branch } : {}),
  ...(filters.from || filters.to
    ? {
        date: {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {}),
        },
      }
    : {}),
});

/**
 * Reads the supplier cost off a record when the module tracks one.
 *
 * Bookings and quotations both store their cost in `extra.cost`. When no
 * cost is recorded the margin is genuinely unknown — it is reported as
 * `null` rather than guessed at, so the UI can say "—" instead of showing a
 * made-up percentage.
 */
export function costOf(row: { amount: number; extra?: string | null }): number | null {
  const extra = parseJson<Record<string, unknown>>(row.extra ?? "{}", {});
  const raw = extra.cost;
  const cost = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return cost;
}

/** Revenue, cost and the margin between them — only when cost is known. */
export function marginOf(rows: Array<{ amount: number; extra?: string | null }>): {
  revenue: number;
  cost: number | null;
  margin: number | null;
  marginPercent: number | null;
} {
  const revenue = sum(rows);
  const costs = rows.map(costOf).filter((c): c is number => c !== null);
  if (costs.length === 0) {
    return { revenue, cost: null, margin: null, marginPercent: null };
  }
  const cost = costs.reduce((a, b) => a + b, 0);
  const margin = revenue - cost;
  return {
    revenue,
    cost,
    margin,
    marginPercent: revenue ? Math.round((margin / revenue) * 1000) / 10 : 0,
  };
}

const monthKey = (iso: string) => (iso ? iso.slice(0, 7) : new Date().toISOString().slice(0, 7));

const monthLabel = (key: string) => {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-IN", { month: "short" });
};

/** Last N month buckets (oldest → newest) for chart series. */
function lastMonths(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

const sum = (rows: Array<{ amount: number }>) => rows.reduce((total, r) => total + r.amount, 0);

/**
 * Converts rows into the workspace base currency before anything is added.
 *
 * A dashboard that adds $1,000 and ₹1,000 as "2,000" is not a rounding issue —
 * it is a wrong number the owner will act on. Currencies with no configured
 * rate are excluded and named in `missing`, so the screen can say which ones
 * were not consolidated instead of inventing a rate.
 */
function toBaseRows<T extends { amount: number; currency: string; extra: string | null }>(
  rows: T[],
  ctx: FxContext,
): { rows: T[]; missing: string[] } {
  const converted: T[] = [];
  const missing = new Set<string>();
  for (const row of rows) {
    const value = convertToBase(row.amount, row.currency, ctx);
    if (value === null) {
      missing.add((row.currency || "unknown").toUpperCase());
      continue;
    }
    // Supplier cost lives inside `extra`; it must move with the sale, otherwise
    // a foreign-currency booking shows a margin that mixes two currencies.
    const extra = parseJson<Record<string, unknown>>(row.extra ?? "{}", {});
    const rawCost = Number(extra.cost);
    if (Number.isFinite(rawCost) && rawCost > 0) {
      const convertedCost = convertToBase(rawCost, row.currency, ctx);
      if (convertedCost !== null) extra.cost = convertedCost;
    }
    converted.push({ ...row, amount: value, extra: JSON.stringify(extra) } as T);
  }
  return { rows: converted, missing: [...missing] };
}

/** Aggregated metrics for the dashboard home. */
export async function dashboardOverview(organizationId: string, filters: Filters) {
  const today = new Date().toISOString().slice(0, 10);
  const fx = await fxContext(organizationId);

  const buckets = lastMonths(6);
  const seriesMap = new Map(buckets.map((key) => [key, { revenue: 0, bookings: 0 }]));
  const byDestination = new Map<string, GroupTotals>();
  const byOwner = new Map<string, GroupTotals>();
  const missing = new Set<string>();

  /* ── Bookings: revenue, margin, series, upcoming departures ─────────────── */
  let bookingCount = 0;
  let confirmedCount = 0;
  let totalRevenue = 0;
  let confirmedRevenue = 0;
  let totalCost = 0;
  let confirmedCost = 0;
  let totalCosted = 0;
  let confirmedCosted = 0;
  const upcoming: Array<{
    id: string;
    reference: string;
    name: string;
    destination: string;
    date: string;
    status: string;
    amount: number;
  }> = [];
  let upcomingCount = 0;
  const awaitingConfirmation: Array<{
    label: string;
    detail: string;
    moduleId: string;
    recordId: string;
    level: "warning";
  }> = [];

  await scanRecordPages(recordFilter(organizationId, "bookings", filters), (pageRaw) => {
    const base = toBaseRows(pageRaw, fx);
    for (const currency of base.missing) missing.add(currency);
    for (const booking of base.rows) {
      bookingCount += 1;
      totalRevenue += booking.amount;
      addToGroup(byDestination, booking.destination || "Unassigned", booking.amount);
      addToGroup(byOwner, booking.ownerName || "Unassigned", booking.amount);

      const bucket = seriesMap.get(monthKey(booking.date));
      if (bucket) {
        bucket.revenue += booking.amount;
        bucket.bookings += 1;
      }

      const cost = costOf(booking);
      if (cost !== null) {
        totalCost += cost;
        totalCosted += 1;
      }
      if (["Confirmed", "paid", "Paid"].includes(booking.status)) {
        confirmedCount += 1;
        confirmedRevenue += booking.amount;
        if (cost !== null) {
          confirmedCost += cost;
          confirmedCosted += 1;
        }
      }

      if (booking.date >= today) {
        upcomingCount += 1;
        upcoming.push({
          id: booking.id,
          reference: booking.reference,
          name: booking.name,
          destination: booking.destination,
          date: booking.date,
          status: booking.status,
          amount: booking.amount,
        });
        // Keep only the five soonest departures — the full list can be huge.
        upcoming.sort((a, b) => a.date.localeCompare(b.date));
        if (upcoming.length > 5) upcoming.length = 5;
      }

      if (
        awaitingConfirmation.length < 3 &&
        ["Pending", "On hold"].includes(booking.status)
      ) {
        awaitingConfirmation.push({
          label: `Booking awaiting confirmation · ${booking.reference}`,
          detail: booking.destination,
          moduleId: "bookings",
          recordId: booking.id,
          level: "warning",
        });
      }
    }
  });

  /* ── Leads: pipeline stages and conversion ──────────────────────────────── */
  const stageCounts = new Map<string, number>();
  const stageValues = new Map<string, number>();
  let leadCount = 0;
  let newLeads = 0;
  let wonLeads = 0;

  await scanRecordPages(recordFilter(organizationId, "leads", filters), (pageRaw) => {
    const base = toBaseRows(pageRaw, fx);
    for (const currency of base.missing) missing.add(currency);
    for (const lead of base.rows) {
      leadCount += 1;
      if (lead.status === "New") newLeads += 1;
      if (lead.status === "Won") wonLeads += 1;
      stageCounts.set(lead.status, (stageCounts.get(lead.status) ?? 0) + 1);
      stageValues.set(lead.status, (stageValues.get(lead.status) ?? 0) + lead.amount);
    }
  });

  /* ── Money owed to you ──────────────────────────────────────────────────── */
  let outstanding = 0;
  let collected = 0;
  const overdue: Array<{
    label: string;
    detail: string;
    moduleId: string;
    recordId: string;
    level: "danger";
  }> = [];

  await scanRecordPages(recordFilter(organizationId, "finance", filters), (pageRaw) => {
    const base = toBaseRows(pageRaw, fx);
    for (const currency of base.missing) missing.add(currency);
    for (const invoice of base.rows) {
      if (invoice.status === "Paid") collected += invoice.amount;
      else outstanding += invoice.amount;

      if (invoice.status === "Overdue" && overdue.length < 3) {
        overdue.push({
          label: `Overdue payment · ${invoice.reference}`,
          detail: invoice.name,
          moduleId: "finance",
          recordId: invoice.id,
          level: "danger",
        });
      }
    }
  });

  /* ── Small reads that already have their own ceiling ────────────────────── */
  const [quotationsSent, tasks, visaPending] = await Promise.all([
    prisma.record.count({
      where: { ...recordFilter(organizationId, "quotations", filters), status: "Sent" },
    }),
    prisma.task.count({ where: { organizationId, done: false } }),
    prisma.record.findMany({
      where: {
        ...recordFilter(organizationId, "visa", filters),
        status: "Documents pending",
      },
      orderBy: { date: "asc" },
      take: 2,
    }),
  ]);

  const useConfirmed = confirmedCount > 0;
  const revenue = useConfirmed ? confirmedRevenue : totalRevenue;
  const knownCosts = useConfirmed ? confirmedCost : totalCost;
  const costedRows = useConfirmed ? confirmedCosted : totalCosted;
  const margin = costedRows > 0 ? revenue - knownCosts : null;

  const pipeline = ["New", "Contacted", "Qualified", "Quoted", "Won"].map((stage) => ({
    stage,
    count: stageCounts.get(stage) ?? 0,
    value: stageValues.get(stage) ?? 0,
  }));

  const attention = [
    ...overdue,
    ...awaitingConfirmation,
    ...visaPending.map((v) => ({
      label: `Visa documents pending · ${v.reference}`,
      detail: v.name,
      moduleId: "visa",
      recordId: v.id,
      level: "warning" as const,
    })),
  ];

  return {
    metrics: {
      revenue,
      collected,
      outstanding,
      bookings: bookingCount,
      confirmedBookings: confirmedCount,
      newLeads,
      quotationsSent,
      upcomingDepartures: upcomingCount,
      openTasks: tasks,
      conversionRate: leadCount ? Math.round((wonLeads / leadCount) * 1000) / 10 : 0,
      averageBookingValue: bookingCount ? Math.round(revenue / bookingCount) : 0,
      grossMargin: margin,
      grossMarginPercent: margin === null ? null : revenue ? Math.round((margin / revenue) * 1000) / 10 : 0,
      cost: costedRows > 0 ? knownCosts : null,
    },
    revenueSeries: buckets.map((key) => ({
      month: monthLabel(key),
      ...(seriesMap.get(key) ?? { revenue: 0, bookings: 0 }),
    })),
    pipeline,
    upcomingDepartures: upcoming,
    attention: attention.slice(0, 6),
    byDestination: ranked(byDestination, 6),
    byOwner: ranked(byOwner, 6),
    fx: { baseCurrency: fx.baseCurrency, rates: fx.rates, missingCurrencies: [...missing] },
  };
}

/** Rows read per page. A report's memory stays flat however big the table is. */
const SCAN_PAGE = 1_000;

type RecordRow = Awaited<ReturnType<typeof prisma.record.findMany>>[number];

/**
 * Walks every record matching `where`, one id-ordered page at a time.
 *
 * A report used to load its whole matching set into memory and then sum it.
 * That is exact right up to the row count that takes the process down, and any
 * cap put in its place would make the totals quietly short — the one thing a
 * report must never do. Paging gives both: exact totals, flat memory.
 */
async function scanRecordPages(
  where: Prisma.RecordWhereInput,
  visit: (rows: RecordRow[]) => void,
): Promise<number> {
  let cursor: string | undefined;
  let seen = 0;
  for (;;) {
    const page = await prisma.record.findMany({
      where,
      orderBy: { id: "asc" },
      take: SCAN_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    seen += page.length;
    visit(page);
    cursor = page[page.length - 1]!.id;
    if (page.length < SCAN_PAGE) break;
  }
  return seen;
}

type GroupTotals = { label: string; count: number; value: number };

function addToGroup(map: Map<string, GroupTotals>, label: string, value: number): void {
  const entry = map.get(label) ?? { label, count: 0, value: 0 };
  entry.count += 1;
  entry.value += value;
  map.set(label, entry);
}

const ranked = (map: Map<string, GroupTotals>, limit: number): GroupTotals[] =>
  [...map.values()].sort((a, b) => b.value - a.value).slice(0, limit);

/** Report builder used by every tab under Reports & analytics. */
export async function buildReport(organizationId: string, report: string, filters: Filters) {
  const moduleByReport: Record<string, string> = {
    sales: "leads",
    bookings: "bookings",
    operations: "operations",
    finance: "finance",
    b2b: "agents",
    marketing: "campaigns",
    team: "bookings",
  };

  const moduleId = moduleByReport[report] ?? "bookings";
  const fx = await fxContext(organizationId);

  const closedStatuses = new Set([
    "Won",
    "Confirmed",
    "Paid",
    "Accepted",
    "Active",
    "Published",
    "Resolved",
    "Approved",
  ]);

  const buckets = lastMonths(6);
  const seriesMap = new Map(buckets.map((key) => [key, { value: 0, count: 0 }]));
  const byDestination = new Map<string, GroupTotals>();
  const byOwner = new Map<string, GroupTotals>();
  const byStatus = new Map<string, GroupTotals>();
  const bySource = new Map<string, GroupTotals>();
  const missing = new Set<string>();

  let records = 0;
  let won = 0;
  let revenue = 0;
  let knownCost = 0;
  let costedRows = 0;

  // Every matching record is counted, however many there are: the loop reads a
  // page at a time, so the totals are exact without holding the table in memory.
  await scanRecordPages(recordFilter(organizationId, moduleId, filters), (pageRaw) => {
    const base = toBaseRows(pageRaw, fx);
    for (const currency of base.missing) missing.add(currency);
    for (const row of base.rows) {
      records += 1;
      addToGroup(byOwner, row.ownerName || "Unassigned", row.amount);
      addToGroup(byDestination, row.destination || "Unassigned", row.amount);
      addToGroup(byStatus, row.status || "Unknown", row.amount);
      addToGroup(bySource, row.source || "Unknown", row.amount);

      const bucket = seriesMap.get(monthKey(row.date));
      if (bucket) {
        bucket.value += row.amount;
        bucket.count += 1;
      }

      if (closedStatuses.has(row.status)) {
        won += 1;
        revenue += row.amount;
        const cost = costOf(row);
        if (cost !== null) {
          knownCost += cost;
          costedRows += 1;
        }
      }
    }
  });

  const grossMargin = costedRows > 0 ? revenue - knownCost : null;
  const conversionRate = records ? Math.round((won / records) * 1000) / 10 : 0;

  return {
    report,
    moduleId,
    generatedAt: new Date().toISOString(),
    filters: {
      branch: filters.branch ?? "All branches",
      range:
        filters.from || filters.to
          ? `${filters.from ?? "…"} → ${filters.to ?? "…"}`
          : "Last 90 days",
    },
    summary: {
      records,
      revenue,
      grossMargin,
      grossMarginPercent:
        grossMargin === null ? null : revenue ? Math.round((grossMargin / revenue) * 1000) / 10 : 0,
      cost: costedRows > 0 ? knownCost : null,
      conversionRate,
      averageValue: records ? Math.round(revenue / records) : 0,
      won,
    },
    series: buckets.map((key) => ({
      month: monthLabel(key),
      ...(seriesMap.get(key) ?? { value: 0, count: 0 }),
    })),
    byDestination: ranked(byDestination, 8),
    byOwner: ranked(byOwner, 8),
    byStatus: ranked(byStatus, 8),
    bySource: ranked(bySource, 8),
    fx: { baseCurrency: fx.baseCurrency, rates: fx.rates, missingCurrencies: [...missing] },
  };
}
