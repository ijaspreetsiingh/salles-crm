import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Seats on a fixed departure are inventory, not a display counter.
 *
 * These tests drive the real capacity service against a small in-memory record
 * store. They pin the cases that used to leak seats: a party that grows, a
 * booking that is cancelled, a booking deleted in bulk, and a re-opened booking
 * whose seats were already sold to somebody else.
 */

type StoredRecord = {
  id: string;
  organizationId: string;
  moduleId: string;
  tab: string | null;
  reference: string;
  status: string;
  extra: string;
  deletedAt: Date | null;
};

const db = vi.hoisted(() => ({ records: new Map<string, StoredRecord>() }));

type FindArgs = {
  where?: {
    id?: string | { in?: string[] };
    organizationId?: string;
    deletedAt?: null;
    moduleId?: string;
    tab?: string;
  };
  select?: unknown;
};

const matches = (row: StoredRecord, where: FindArgs["where"]): boolean => {
  if (!where) return true;
  if (typeof where.id === "string" && row.id !== where.id) return false;
  if (where.organizationId && row.organizationId !== where.organizationId) return false;
  if (where.moduleId && row.moduleId !== where.moduleId) return false;
  if (where.tab && row.tab !== where.tab) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  return true;
};

const client = {
  record: {
    findFirst: async (args: FindArgs) => {
      for (const row of db.records.values()) {
        if (matches(row, args.where)) return { ...row };
      }
      return null;
    },
    update: async (args: { where: { id: string }; data: Partial<StoredRecord> }) => {
      const row = db.records.get(args.where.id);
      if (!row) throw new Error("record not found");
      Object.assign(row, args.data);
      return { ...row };
    },
  },
  // Only reached on Postgres; the fake runs with isSqlite = true.
  $queryRaw: async () => [],
};

vi.mock("../src/lib/prisma", () => ({
  isSqlite: true,
  prisma: {
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
    ...client,
  },
}));

const { applyCapacityChange, seatsFromExtra, departureIdFrom, holdsSeats } = await import(
  "../src/services/departure-capacity"
);

const departure = (id: string, capacity: number, booked: number): StoredRecord => ({
  id,
  organizationId: "org-1",
  moduleId: "packages",
  tab: "Fixed departures",
  reference: `DEP-${id}`,
  status: "Open for sale",
  extra: JSON.stringify({ capacity, booked }),
  deletedAt: null,
});

const bookedOn = (id: string): number =>
  Number(JSON.parse(db.records.get(id)!.extra).booked as number);

const extra = (over: Record<string, unknown>) => JSON.stringify(over);

describe("departure seat inventory", () => {
  beforeEach(() => {
    db.records.clear();
    db.records.set("dep-a", departure("dep-a", 10, 2));
    db.records.set("dep-b", departure("dep-b", 10, 0));
  });

  it("reads the departure and seat count off the booking", () => {
    expect(departureIdFrom(extra({ departureId: "dep-a", pax: 3 }))).toBe("dep-a");
    expect(departureIdFrom(extra({ packageDepartureId: "dep-b" }))).toBe("dep-b");
    expect(departureIdFrom(extra({}))).toBe("");
    expect(seatsFromExtra(extra({ travellers: 4 }), 1)).toBe(4);
    expect(seatsFromExtra(extra({ pax: 0 }), 1)).toBe(1);
    expect(seatsFromExtra(extra({ travellers: ["a", "b"] }), 1)).toBe(2);
  });

  it("treats cancelled and void bookings as holding no seat", () => {
    expect(holdsSeats("Confirmed")).toBe(true);
    expect(holdsSeats("Cancelled")).toBe(false);
    expect(holdsSeats("Void")).toBe(false);
  });

  it("takes four more seats when a party grows from two to six", async () => {
    const before = { extra: extra({ departureId: "dep-a", pax: 2 }), status: "Confirmed" };
    const after = { extra: extra({ departureId: "dep-a", pax: 6 }), status: "Confirmed" };

    const change = await applyCapacityChange("org-1", before, after);
    await change.commit();

    expect(bookedOn("dep-a")).toBe(6);
  });

  it("gives seats back when a booking is cancelled", async () => {
    const before = { extra: extra({ departureId: "dep-a", pax: 2 }), status: "Confirmed" };
    const after = { extra: before.extra, status: "Cancelled" };

    const change = await applyCapacityChange("org-1", before, after);
    await change.commit();

    expect(bookedOn("dep-a")).toBe(0);
  });

  it("does not re-reserve a booking that already holds a full departure", async () => {
    db.records.set("dep-a", departure("dep-a", 2, 2));
    const booking = { extra: extra({ departureId: "dep-a", pax: 2 }), status: "Confirmed" };

    // A name or note changed, nothing about the seats: this must not throw on a
    // departure that is already full, because it is holding exactly its share.
    const change = await applyCapacityChange("org-1", booking, { ...booking });
    await change.commit();

    expect(bookedOn("dep-a")).toBe(2);
  });

  it("refuses an edit that would oversell the departure", async () => {
    db.records.set("dep-a", departure("dep-a", 4, 4));
    const before = { extra: extra({ departureId: "dep-a", pax: 2 }), status: "Confirmed" };
    const after = { extra: extra({ departureId: "dep-a", pax: 3 }), status: "Confirmed" };

    await expect(applyCapacityChange("org-1", before, after)).rejects.toThrow(/seat/);
    expect(bookedOn("dep-a")).toBe(4);
  });

  it("moves the seats when the booking switches departure", async () => {
    const before = { extra: extra({ departureId: "dep-a", pax: 2 }), status: "Confirmed" };
    const after = { extra: extra({ departureId: "dep-b", pax: 3 }), status: "Confirmed" };

    const change = await applyCapacityChange("org-1", before, after);
    // The new seats are held before the write, the old ones only after it.
    expect(bookedOn("dep-b")).toBe(3);
    expect(bookedOn("dep-a")).toBe(2);

    await change.commit();
    expect(bookedOn("dep-a")).toBe(0);
    expect(bookedOn("dep-b")).toBe(3);
  });

  it("hands the new seats back when the write fails", async () => {
    const before = { extra: extra({ departureId: "dep-a", pax: 2 }), status: "Confirmed" };
    const after = { extra: extra({ departureId: "dep-b", pax: 3 }), status: "Confirmed" };

    const change = await applyCapacityChange("org-1", before, after);
    await change.revert();

    expect(bookedOn("dep-b")).toBe(0);
    expect(bookedOn("dep-a")).toBe(2);
  });

  it("re-opens a cancelled booking only when a seat is still free", async () => {
    db.records.set("dep-a", departure("dep-a", 2, 2));
    const cancelled = { extra: extra({ departureId: "dep-a", pax: 2 }), status: "Cancelled" };

    await expect(
      applyCapacityChange("org-1", cancelled, { ...cancelled, status: "Confirmed" }),
    ).rejects.toThrow(/seats? left/);
    expect(bookedOn("dep-a")).toBe(2);
  });

  it("ignores a booking that is not tied to a departure", async () => {
    const before = { extra: extra({ pax: 4 }), status: "Confirmed" };
    const change = await applyCapacityChange("org-1", before, { ...before, status: "Cancelled" });
    await change.commit();

    expect(bookedOn("dep-a")).toBe(2);
    expect(bookedOn("dep-b")).toBe(0);
  });
});
