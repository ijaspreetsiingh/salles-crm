import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";
import { parseJson } from "../lib/utils";

type Filters = { branch?: string; from?: string; to?: string };

const recordFilter = (organizationId: string, moduleId: string, filters: Filters): Prisma.RecordWhereInput => ({
  organizationId,
  moduleId,
  deletedAt: null,
  ...(filters.branch ? { branchName: filters.branch } : {}),
  ...(filters.from || filters.to
    ? { date: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
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
export function marginOf(
  rows: Array<{ amount: number; extra?: string | null }>,
): { revenue: number; cost: number | null; margin: number | null; marginPercent: number | null } {
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

/** Aggregated metrics for the dashboard home. */
export async function dashboardOverview(organizationId: string, filters: Filters) {
  const today = new Date().toISOString().slice(0, 10);

  const [bookings, leads, quotations, finance, visa, tasks] = await Promise.all([
    prisma.record.findMany({ where: recordFilter(organizationId, "bookings", filters) }),
    prisma.record.findMany({ where: recordFilter(organizationId, "leads", filters) }),
    prisma.record.findMany({ where: recordFilter(organizationId, "quotations", filters) }),
    prisma.record.findMany({ where: recordFilter(organizationId, "finance", filters) }),
    prisma.record.findMany({ where: recordFilter(organizationId, "visa", filters) }),
    prisma.task.findMany({ where: { organizationId, done: false } }),
  ]);

  const confirmedBookings = bookings.filter((b) => ["Confirmed", "paid", "Paid"].includes(b.status));
  const revenue = sum(confirmedBookings.length ? confirmedBookings : bookings);
  const outstanding = sum(finance.filter((f) => f.status !== "Paid"));
  const collected = sum(finance.filter((f) => f.status === "Paid"));
  const newLeads = leads.filter((l) => l.status === "New").length;
  const wonLeads = leads.filter((l) => l.status === "Won").length;
  const upcoming = bookings.filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  // Revenue series — last 6 months by record date.
  const buckets = lastMonths(6);
  const seriesMap = new Map(buckets.map((key) => [key, { revenue: 0, bookings: 0 }]));
  for (const booking of bookings) {
    const key = monthKey(booking.date);
    const bucket = seriesMap.get(key);
    if (bucket) {
      bucket.revenue += booking.amount;
      bucket.bookings += 1;
    }
  }

  const pipeline = ["New", "Contacted", "Qualified", "Quoted", "Won"].map((stage) => ({
    stage,
    count: leads.filter((l) => l.status === stage).length,
    value: sum(leads.filter((l) => l.status === stage)),
  }));

  const attention = [
    ...finance
      .filter((f) => f.status === "Overdue")
      .slice(0, 3)
      .map((f) => ({ label: `Overdue payment · ${f.reference}`, detail: f.name, moduleId: "finance", recordId: f.id, level: "danger" as const })),
    ...bookings
      .filter((b) => ["Pending", "On hold"].includes(b.status))
      .slice(0, 3)
      .map((b) => ({ label: `Booking awaiting confirmation · ${b.reference}`, detail: b.destination, moduleId: "bookings", recordId: b.id, level: "warning" as const })),
    ...visa
      .filter((v) => v.status === "Documents pending")
      .slice(0, 2)
      .map((v) => ({ label: `Visa documents pending · ${v.reference}`, detail: v.name, moduleId: "visa", recordId: v.id, level: "warning" as const })),
  ];

  // Real margin from the recorded supplier cost — null when unknown.
  const margin = marginOf(confirmedBookings.length ? confirmedBookings : bookings);

  return {
    metrics: {
      revenue,
      collected,
      outstanding,
      bookings: bookings.length,
      confirmedBookings: confirmedBookings.length,
      newLeads,
      quotationsSent: quotations.filter((q) => q.status === "Sent").length,
      upcomingDepartures: upcoming.length,
      openTasks: tasks.length,
      conversionRate: leads.length ? Math.round((wonLeads / leads.length) * 1000) / 10 : 0,
      averageBookingValue: bookings.length ? Math.round(revenue / bookings.length) : 0,
      grossMargin: margin.margin,
      grossMarginPercent: margin.marginPercent,
      cost: margin.cost,
    },
    revenueSeries: buckets.map((key) => ({ month: monthLabel(key), ...(seriesMap.get(key) ?? { revenue: 0, bookings: 0 }) })),
    pipeline,
    upcomingDepartures: upcoming.slice(0, 5).map((b) => ({
      id: b.id,
      reference: b.reference,
      name: b.name,
      destination: b.destination,
      date: b.date,
      status: b.status,
      amount: b.amount,
    })),
    attention: attention.slice(0, 6),
    byDestination: topBy(bookings, (r) => r.destination, 6),
    byOwner: topBy(bookings, (r) => r.ownerName, 6),
  };
}

function topBy<T extends { amount: number }>(rows: T[], keyFn: (row: T) => string, limit: number) {
  const map = new Map<string, { label: string; count: number; value: number }>();
  for (const row of rows) {
    const label = keyFn(row) || "Unassigned";
    const entry = map.get(label) ?? { label, count: 0, value: 0 };
    entry.count += 1;
    entry.value += row.amount;
    map.set(label, entry);
  }
  return Array.from(map.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Report builder used by every tab under Reports & analytics. */
export async function buildReport(
  organizationId: string,
  report: string,
  filters: Filters,
) {
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
  const rows = await prisma.record.findMany({ where: recordFilter(organizationId, moduleId, filters) });

  const wonRows = rows.filter((r) =>
    ["Won", "Confirmed", "Paid", "Accepted", "Active", "Published", "Resolved", "Approved"].includes(
      r.status,
    ),
  );
  const revenue = sum(wonRows);
  // Real margin from the recorded supplier cost — never a guess.
  const margin = marginOf(wonRows);
  const grossMargin = margin.margin;
  const won = wonRows.length;
  const conversionRate = rows.length ? Math.round((won / rows.length) * 1000) / 10 : 0;

  const buckets = lastMonths(6);
  const seriesMap = new Map(buckets.map((key) => [key, { value: 0, count: 0 }]));
  for (const row of rows) {
    const bucket = seriesMap.get(monthKey(row.date));
    if (bucket) {
      bucket.value += row.amount;
      bucket.count += 1;
    }
  }

  return {
    report,
    moduleId,
    generatedAt: new Date().toISOString(),
    filters: {
      branch: filters.branch ?? "All branches",
      range: filters.from || filters.to ? `${filters.from ?? "…"} → ${filters.to ?? "…"}` : "Last 90 days",
    },
    summary: {
      records: rows.length,
      revenue,
      grossMargin,
      grossMarginPercent: margin.marginPercent,
      cost: margin.cost,
      conversionRate,
      averageValue: rows.length ? Math.round(revenue / rows.length) : 0,
      won: won,
    },
    series: buckets.map((key) => ({ month: monthLabel(key), ...(seriesMap.get(key) ?? { value: 0, count: 0 }) })),
    byDestination: topBy(rows, (r) => r.destination, 8),
    byOwner: topBy(rows, (r) => r.ownerName, 8),
    byStatus: topBy(rows, (r) => r.status, 8),
    bySource: topBy(rows, (r) => r.source, 8),
  };
}
