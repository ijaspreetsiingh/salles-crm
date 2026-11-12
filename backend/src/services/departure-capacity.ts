import { isSqlite, prisma } from "../lib/prisma";
import { BadRequestError } from "../lib/errors";
import { parseJson } from "../lib/utils";

/**
 * Fixed-departure seat inventory.
 *
 * `extra.capacity` and `extra.booked` already existed on package departure
 * records, but nothing enforced them: a booking could be sold past capacity
 * because the counter was advisory. Reservations take a row lock and update
 * `booked` in the same transaction, so two concurrent bookings cannot both see
 * the last seat.
 *
 * The counter is only ever moved by this module. Creating a booking reserves,
 * cancelling or deleting releases, and editing re-checks the difference — a
 * booking that moves from 2 travellers to 6 must take four more seats, and a
 * cancelled booking that is reopened must take its seats back.
 */

const DEPARTURE_KEYS = ["departureRecordId", "packageDepartureId", "departureId"] as const;

export function departureIdFrom(extraJson: string | null | undefined): string {
  const extra = parseJson<Record<string, unknown>>(extraJson ?? "{}", {});
  for (const key of DEPARTURE_KEYS) {
    const value = extra[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Seats this booking consumes. `travellers`, then `pax`, then `seats`. */
export function seatsFromExtra(
  extraJson: string | null | undefined,
  fallback = 1,
): number {
  const extra = parseJson<Record<string, unknown>>(extraJson ?? "{}", {});
  const raw = extra.travellers ?? extra.pax ?? extra.seats ?? fallback;
  if (Array.isArray(raw)) return Math.max(1, Math.min(500, raw.length));
  const seats = Number(raw);
  if (!Number.isFinite(seats) || seats <= 0) return Math.max(1, Math.floor(fallback));
  return Math.max(1, Math.min(500, Math.floor(seats)));
}

export type DepartureReservation = {
  reserved: boolean;
  departureId: string;
  seats: number;
  reference?: string;
  available?: number;
};

/** A cancelled or void booking is not holding a seat. */
export function holdsSeats(status: string): boolean {
  return !["Cancelled", "Void"].includes(status);
}

/**
 * Takes the row lock on a departure.
 *
 * SQLite has no `FOR UPDATE` (its writers serialise anyway); sending the
 * Postgres-only syntax there would fail every fixed-departure booking on a
 * self-hosted SQLite install.
 */
async function lockDeparture(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  organizationId: string,
  departureId: string,
): Promise<boolean> {
  if (isSqlite) {
    const row = await tx.record.findFirst({
      where: { id: departureId, organizationId },
      select: { id: true },
    });
    return Boolean(row);
  }
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Record"
    WHERE id = ${departureId} AND "organizationId" = ${organizationId}
    FOR UPDATE
  `;
  return locked.length > 0;
}

/** Reserves `seats` on one departure inside its own transaction. */
async function reserveSeats(
  organizationId: string,
  departureId: string,
  seats: number,
): Promise<DepartureReservation> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockDeparture(tx, organizationId, departureId))) {
      throw new BadRequestError("The selected departure was not found in this workspace");
    }

    const departure = await tx.record.findFirst({
      where: { id: departureId, organizationId, deletedAt: null },
    });
    if (!departure || departure.moduleId !== "packages" || departure.tab !== "Fixed departures") {
      throw new BadRequestError("The selected record is not a fixed package departure");
    }
    if (["Cancelled", "Departed", "Closed"].includes(departure.status)) {
      throw new BadRequestError(`This departure is ${departure.status.toLowerCase()} and cannot take new bookings`);
    }

    const extra = parseJson<Record<string, unknown>>(departure.extra ?? "{}", {});
    const capacity = Number(extra.capacity ?? 0);
    const booked = Number(extra.booked ?? 0);
    const available = Math.max(0, capacity - booked);
    if (capacity > 0 && booked + seats > capacity) {
      throw new BadRequestError(
        `This departure has ${available} seat${available === 1 ? "" : "s"} left; ${seats} requested`,
      );
    }

    await tx.record.update({
      where: { id: departure.id },
      data: { extra: JSON.stringify({ ...extra, booked: booked + seats }) },
    });
    return {
      reserved: true,
      departureId,
      seats,
      reference: departure.reference,
      available: Math.max(0, capacity - booked - seats),
    };
  });
}

/** Puts seats back inside its own transaction. */
async function releaseSeats(
  organizationId: string,
  departureId: string,
  seats: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (!(await lockDeparture(tx, organizationId, departureId))) return;
    const departure = await tx.record.findFirst({
      where: { id: departureId, organizationId, deletedAt: null },
      select: { id: true, extra: true },
    });
    if (!departure) return;
    const extra = parseJson<Record<string, unknown>>(departure.extra ?? "{}", {});
    const booked = Number(extra.booked ?? 0);
    await tx.record.update({
      where: { id: departure.id },
      data: { extra: JSON.stringify({ ...extra, booked: Math.max(0, booked - seats) }) },
    });
  });
}

/** Reserves seats on a fixed departure. Throws when it is full or closed. */
export async function reserveDepartureCapacity(
  organizationId: string,
  extraJson: string | null | undefined,
  fallbackSeats = 1,
): Promise<DepartureReservation> {
  const departureId = departureIdFrom(extraJson);
  const seats = seatsFromExtra(extraJson, fallbackSeats);
  if (!departureId) return { reserved: false, departureId: "", seats };
  return reserveSeats(organizationId, departureId, seats);
}

/** Puts seats back when a booking is cancelled, deleted or reopened elsewhere. */
export async function releaseDepartureCapacity(
  organizationId: string,
  extraJson: string | null | undefined,
  fallbackSeats = 1,
): Promise<void> {
  const departureId = departureIdFrom(extraJson);
  if (!departureId) return;
  await releaseSeats(organizationId, departureId, seatsFromExtra(extraJson, fallbackSeats));
}

/**
 * Moves a booking from the seats it held to the seats it should hold.
 *
 * The extra seats are reserved *before* the caller writes the change, so a full
 * departure refuses the edit instead of overselling it. `commit` releases what
 * the booking no longer holds and `revert` gives back a reservation made ahead
 * of a write that then failed.
 */
export type CapacityChange = {
  commit: () => Promise<void>;
  revert: () => Promise<void>;
};

const noop = async () => undefined;

export async function applyCapacityChange(
  organizationId: string,
  before: { extra: string | null; status: string },
  after: { extra: string | null; status: string },
): Promise<CapacityChange> {
  const beforeId = holdsSeats(before.status) ? departureIdFrom(before.extra) : "";
  const afterId = holdsSeats(after.status) ? departureIdFrom(after.extra) : "";
  const beforeSeats = beforeId ? seatsFromExtra(before.extra, 1) : 0;
  const afterSeats = afterId ? seatsFromExtra(after.extra, 1) : 0;

  // Same departure: only the difference moves, so an unchanged booking never
  // needs to re-reserve the seats it already holds.
  if (beforeId && beforeId === afterId) {
    const delta = afterSeats - beforeSeats;
    if (delta === 0) return { commit: noop, revert: noop };
    if (delta > 0) {
      await reserveSeats(organizationId, beforeId, delta);
      return { commit: noop, revert: () => releaseSeats(organizationId, beforeId, delta) };
    }
    return { commit: () => releaseSeats(organizationId, beforeId, -delta), revert: noop };
  }

  // Different departure (or one side holds none): take the new seats first.
  if (afterId) await reserveSeats(organizationId, afterId, afterSeats);

  const releaseOld = beforeId ? () => releaseSeats(organizationId, beforeId, beforeSeats) : noop;
  return {
    commit: releaseOld,
    revert: afterId ? () => releaseSeats(organizationId, afterId, afterSeats) : noop,
  };
}
