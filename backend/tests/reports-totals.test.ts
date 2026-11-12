import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reports must total every matching record, not the first page of them.
 *
 * These tests drive the real `buildReport` and `dashboardOverview` against a
 * fake Prisma client whose `findMany` honours cursor paging exactly the way
 * Postgres would, with more rows than one page holds. Two failures are caught:
 * a page being counted twice (inflated totals) and the scan stopping early
 * (short totals) — both of which look like a plausible number on screen.
 */

type FakeRow = {
  id: string;
  organizationId: string;
  moduleId: string;
  reference: string;
  name: string;
  detail: string;
  destination: string;
  ownerName: string;
  branchName: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  extra: string;
  meta: string;
  deletedAt: null;
};

const state = vi.hoisted(() => ({
  rows: [] as FakeRow[],
  findManyCalls: 0,
}));

type FindArgs = {
  where?: { moduleId?: string; status?: string };
  orderBy?: unknown;
  take?: number;
  cursor?: { id: string };
  skip?: number;
};

/** Serves rows the way Prisma does: filter, id order, cursor + skip, take. */
const pageRows = (args: FindArgs): FakeRow[] => {
  state.findManyCalls += 1;
  let list = state.rows.filter((row) => {
    if (args.where?.moduleId && row.moduleId !== args.where.moduleId) return false;
    if (args.where?.status && row.status !== args.where.status) return false;
    return true;
  });
  list = [...list].sort((a, b) => a.id.localeCompare(b.id));
  if (args.cursor) {
    const index = list.findIndex((row) => row.id === args.cursor?.id);
    if (index >= 0) list = list.slice(index + (args.skip ?? 0));
  }
  return list.slice(0, args.take ?? list.length);
};

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: async () => ({ currency: "INR", settings: "{}" }),
      findUniqueOrThrow: async () => ({
        id: "org1",
        name: "Horizon Travel",
        currency: "INR",
        address: "",
        gstin: "",
      }),
    },
    record: {
      findMany: async (args: FindArgs) => pageRows(args),
      count: async (args: FindArgs) =>
        pageRows({ ...args, take: undefined, cursor: undefined }).length,
    },
    task: { count: async () => 4 },
  },
}));

const { buildReport, dashboardOverview } = await import("../src/services/analytics");

const makeRow = (index: number): FakeRow => ({
  id: `rec${String(index).padStart(6, "0")}`,
  organizationId: "org1",
  moduleId: index < 2500 ? "bookings" : "leads",
  reference: `REF-${index}`,
  name: `Record ${index}`,
  detail: "",
  destination: index % 2 === 0 ? "Goa" : "Jaipur",
  ownerName: index % 3 === 0 ? "Priya" : index % 3 === 1 ? "Ravi" : "Neha",
  branchName: "Mumbai",
  date: `2026-0${(index % 6) + 1}-15`,
  amount: 100,
  currency: "INR",
  status: index % 4 === 0 ? "Confirmed" : "New",
  email: "",
  phone: "",
  source: "Website",
  notes: "",
  // Every fifth booking records a supplier cost; the rest are unknown.
  extra: index % 5 === 0 ? JSON.stringify({ cost: 40 }) : "{}",
  meta: "{}",
  deletedAt: null,
});

describe("report totals", () => {
  beforeEach(() => {
    state.findManyCalls = 0;
    state.rows = Array.from({ length: 2500 }, (_, index) => makeRow(index));
  });

  it("totals all 2,500 bookings across three pages, not just the first", async () => {
    const report = await buildReport("org1", "bookings", {});
    const bookings = state.rows;

    const closed = bookings.filter((row) => row.status === "Confirmed");
    const expectedRevenue = closed.reduce((total, row) => total + row.amount, 0);

    expect(report.summary.records).toBe(2500);
    expect(report.summary.won).toBe(closed.length);
    expect(report.summary.revenue).toBe(expectedRevenue);
    // Same average the screen has always shown: revenue over all records.
    expect(report.summary.averageValue).toBe(Math.round(expectedRevenue / 2500));
    expect(report.summary.grossMargin).toBe(
      expectedRevenue - closed.filter((row) => row.extra !== "{}").length * 40,
    );
    expect(state.findManyCalls).toBeGreaterThan(1);
  });

  it("counts each record exactly once across page boundaries", async () => {
    const report = await buildReport("org1", "bookings", {});

    const owner = (label: string) =>
      report.byOwner.find((group) => group.label === label)?.count ?? 0;
    const destination = (label: string) =>
      report.byDestination.find((group) => group.label === label)?.count ?? 0;

    // 2,500 rows split three ways by owner and two ways by destination. If a
    // page were re-read or skipped, these stop adding up to 2,500.
    expect(owner("Priya") + owner("Ravi") + owner("Neha")).toBe(2500);
    expect(owner("Priya")).toBe(834);
    expect(destination("Goa") + destination("Jaipur")).toBe(2500);
    expect(destination("Goa")).toBe(1250);
  });

  it("counts upcoming departures beyond the five shown on the home page", async () => {
    state.rows = Array.from({ length: 40 }, (_, index) => ({
      ...makeRow(index),
      date: `2099-01-${String((index % 28) + 1).padStart(2, "0")}`,
      status: "Confirmed",
    }));

    const overview = await dashboardOverview("org1", {});

    expect(overview.metrics.upcomingDepartures).toBe(40);
    expect(overview.upcomingDepartures).toHaveLength(5);
  });
});
