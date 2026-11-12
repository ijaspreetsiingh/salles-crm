import { prisma } from "../lib/prisma";
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

/**
 * Reserves seats on a fixed departure. Throws when the departure is full,
 * closed, or the id does not name a departure in this workspace.
 */
export async function reserveDepartureCapacity(
  organizationId: string,
  extraJson: string | null | undefined,
  fallbackSeats = 1,
): Promise<DepartureReservation> {
  const departureId = departureIdFrom(extraJson);
  const seats = seatsFromExtra(extraJson, fallbackSeats);
  if (!departureId) return { reserved: false, departureId: "", seats };

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Record"
      WHERE id = ${departureId} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (locked.length === 0) {
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

/** Puts seats back when a credit booking is cancelled. */
export async function releaseDepartureCapacity(
  organizationId: string,
  extraJson: string | null | undefined,
  fallbackSeats = 1,
): Promise<void> {
  const departureId = departureIdFrom(extraJson);
  if (!departureId) return;
  const seats = seatsFromExtra(extraJson, fallbackSeats);

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Record"
      WHERE id = ${departureId} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (locked.length === 0) return;
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
