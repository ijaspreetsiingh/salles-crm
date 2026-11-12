import { describe, expect, it } from "vitest";
import { pickArrivals, tripIsRunning, tripReturnDate } from "../src/services/trip-dates";
import { buildModuleRecords } from "../src/db/seed-data";
import { MODULES } from "../src/domain/modules";

/**
 * "Which trips come back today?" is the question an ops desk answers every
 * morning, and a wrong answer sends nobody to the airport.
 *
 * The old implementation searched the record's `extra` JSON for today's date as
 * a substring, so it matched dates in unrelated fields and skipped any trip
 * that wrote its date another way. These tests pin the reading rules and the
 * two lists the screen now shows: trips that arrive today, and trips on the
 * road whose return day nobody recorded.
 */

const trip = (over: { id?: string; status?: string; extra?: string | null }) => ({
  id: over.id ?? "trip-1",
  status: over.status ?? "In progress",
  extra: over.extra === undefined ? JSON.stringify({ returnDate: "2026-11-12" }) : over.extra,
});

describe("reading a trip's return date", () => {
  it("reads the field the form writes", () => {
    expect(tripReturnDate(JSON.stringify({ returnDate: "2026-11-12" }))).toBe("2026-11-12");
  });

  it("takes the day from an ISO timestamp", () => {
    expect(tripReturnDate(JSON.stringify({ returnDate: "2026-11-12T18:30:00.000Z" }))).toBe(
      "2026-11-12",
    );
  });

  it("understands a date written by hand, day first", () => {
    expect(tripReturnDate(JSON.stringify({ returnDate: "12/11/2026" }))).toBe("2026-11-12");
    expect(tripReturnDate(JSON.stringify({ returnDate: "1-2-2026" }))).toBe("2026-02-01");
  });

  it("falls back to the keys older records used", () => {
    expect(tripReturnDate(JSON.stringify({ return: "2026-11-12" }))).toBe("2026-11-12");
    expect(tripReturnDate(JSON.stringify({ endDate: "2026-11-12" }))).toBe("2026-11-12");
    expect(tripReturnDate(JSON.stringify({ arrivalDate: "2026-11-12" }))).toBe("2026-11-12");
  });

  it("prefers the field the form writes when both exist", () => {
    expect(
      tripReturnDate(JSON.stringify({ return: "2020-01-01", returnDate: "2026-11-12" })),
    ).toBe("2026-11-12");
  });

  it("returns nothing rather than a guess", () => {
    expect(tripReturnDate(JSON.stringify({}))).toBe("");
    expect(tripReturnDate(null)).toBe("");
    expect(tripReturnDate("not json")).toBe("");
    expect(tripReturnDate(JSON.stringify({ returnDate: "" }))).toBe("");
    expect(tripReturnDate(JSON.stringify({ returnDate: "next week" }))).toBe("");
    expect(tripReturnDate(JSON.stringify({ returnDate: "2026-13-45" }))).toBe("");
    expect(tripReturnDate(JSON.stringify({ returnDate: "2026-02-30" }))).toBe("");
  });

  it("does not read a date out of some other field", () => {
    // The old query matched the text "2026-11-12" anywhere in the blob — a
    // payment date, a note, the departure day. None of those is an arrival.
    expect(
      tripReturnDate(JSON.stringify({ bookedOn: "2026-11-12", notes: "paid 2026-11-12" })),
    ).toBe("");
  });
});

describe("arrivals today", () => {
  it("lists the trip whose return date is today", () => {
    const result = pickArrivals([trip({ id: "a" })], "2026-11-12");
    expect(result.arriving.map((t) => t.id)).toEqual(["a"]);
    expect(result.undated).toEqual([]);
  });

  it("leaves out a trip that returns another day", () => {
    const result = pickArrivals([trip({ id: "a", extra: '{"returnDate":"2026-11-13"}' })], "2026-11-12");
    expect(result.arriving).toEqual([]);
  });

  it("leaves out a trip whose only mention of today is unrelated", () => {
    const result = pickArrivals(
      [trip({ id: "a", extra: '{"bookedOn":"2026-11-12","notes":"paid today"}' })],
      "2026-11-12",
    );
    expect(result.arriving).toEqual([]);
    // It is on the road with no return day, so it is reported as unknown
    // rather than silently dropped.
    expect(result.undated.map((t) => t.id)).toEqual(["a"]);
  });

  it("says so when a running trip has no return date", () => {
    const result = pickArrivals(
      [
        trip({ id: "a", status: "In progress", extra: "{}" }),
        trip({ id: "b", status: "Delayed", extra: "" }),
        trip({ id: "c", status: "Completed", extra: "{}" }),
      ],
      "2026-11-12",
    );
    expect(result.arriving).toEqual([]);
    // A finished trip is not "unknown"; only one still running is a gap.
    expect(result.undated.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("counts a completed trip that ended today", () => {
    const result = pickArrivals([trip({ id: "a", status: "Completed" })], "2026-11-12");
    expect(result.arriving.map((t) => t.id)).toEqual(["a"]);
  });

  it("keeps a one-day trip that departs and returns today", () => {
    const result = pickArrivals([trip({ id: "a", status: "Upcoming" })], "2026-11-12");
    expect(result.arriving.map((t) => t.id)).toEqual(["a"]);
  });

  it("treats in-progress and delayed as on the road", () => {
    expect(tripIsRunning("In progress")).toBe(true);
    expect(tripIsRunning("Delayed")).toBe(true);
    expect(tripIsRunning("Completed")).toBe(false);
    expect(tripIsRunning("Cancelled")).toBe(false);
  });
});

describe("seeded trips", () => {
  const operations = MODULES.find((module) => module.id === "operations")!;
  const today = new Date().toISOString().slice(0, 10);

  it("give every trip a return date, so the Returns column is not blank", () => {
    for (const record of buildModuleRecords(operations)) {
      expect(tripReturnDate(JSON.stringify(record.extra)), record.reference).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  });

  it("land one trip today, so the arrivals board is never empty on a fresh demo", () => {
    const records = buildModuleRecords(operations).map((record) => ({
      id: record.reference,
      status: record.status,
      extra: JSON.stringify(record.extra),
    }));

    const { arriving } = pickArrivals(records, today);
    expect(arriving.length).toBeGreaterThanOrEqual(1);
  });

  it("describe the trip's own length, matching the dates", () => {
    for (const record of buildModuleRecords(operations)) {
      const days = Number(/· (\d+) days/.exec(record.detail)?.[1]);
      const span =
        (Date.parse(String(record.extra?.returnDate)) - Date.parse(record.date)) / 86400000;
      expect(span, record.reference).toBe(days);
    }
  });
});
