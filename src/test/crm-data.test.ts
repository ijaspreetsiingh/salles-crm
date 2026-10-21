import { describe, expect, it } from "vitest";
import { parseISO } from "date-fns";

import {
  findModule,
  formatDay,
  money,
  modules,
  seedRows,
  seedTasks,
  toCSV,
} from "@/lib/crm/catalog";

describe("CRM catalogue", () => {
  it("defines every sidebar module with tabs and a noun", () => {
    expect(modules.length).toBeGreaterThanOrEqual(20);
    for (const m of modules) {
      expect(m.tabs.length).toBeGreaterThan(0);
      expect(m.noun).toBeTruthy();
      expect(findModule(m.id)).toEqual(m);
    }
  });

  it("returns not-found for unknown modules", () => {
    expect(findModule("does-not-exist")).toBeUndefined();
  });
});

describe("seedRows", () => {
  it("seeds realistic ISO-dated, branched records", () => {
    const rows = seedRows("leads");
    expect(rows).toHaveLength(8);
    for (const r of rows) {
      expect(r.id).toMatch(/^LD-/);
      expect(r.branch.length).toBeGreaterThan(0);
      expect(r.owner.length).toBeGreaterThan(0);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(parseISO(r.date).getTime())).toBe(false);
    }
  });

  it("spreads dates around today so date filters have data", () => {
    const rows = seedRows("bookings");
    const dates = rows.map((r) => r.date);
    expect(new Set(dates).size).toBeGreaterThan(3);
  });
});

describe("money", () => {
  it("formats INR with Indian grouping", () => {
    expect(money(185000)).toContain("1,85,000");
  });

  it("supports other currencies", () => {
    expect(money(100, "USD")).toContain("$");
    expect(money(100, "EUR")).toContain("€");
  });
});

describe("formatDay", () => {
  it("renders ISO dates for display", () => {
    expect(formatDay("2026-10-14")).toBe("14 Oct 2026");
  });

  it("falls back to the raw value for unparsable input", () => {
    expect(formatDay("not-a-date")).toBe("not-a-date");
  });
});

describe("toCSV", () => {
  it("escapes commas, quotes and newlines", () => {
    const csv = toCSV([
      {
        id: "LD-1",
        name: 'Patel, "Rohan"',
        detail: "line1\nline2",
        destination: "Bali, Indonesia",
        branch: "Mumbai",
        status: "New",
        amount: 100,
        owner: "Sarah Wilson",
        email: "r@example.com",
        phone: "+91 1",
        source: "Website",
        notes: "ok",
        date: "2026-10-20",
      },
    ]);
    const [header] = csv.split("\n");
    expect(header).toContain("Reference");
    expect(csv).toContain('"Patel, ""Rohan"""');
    expect(csv).toContain('"Bali, Indonesia"');
    expect(csv).toContain('"line1\nline2"');
  });
});

describe("seedTasks", () => {
  it("includes tasks due today for the dashboard", () => {
    const tasks = seedTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(6);
    expect(tasks.some((t) => !t.done)).toBe(true);
    expect(tasks.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date))).toBe(true);
  });
});
