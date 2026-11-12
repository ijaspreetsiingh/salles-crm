import { prisma } from "../lib/prisma";
import { ConflictError } from "../lib/errors";
import { parseJson } from "../lib/utils";

/**
 * Vehicle/driver double-booking guard.
 *
 * A transfer assignment lives in the record's `extra` JSON. Without a check,
 * the same Innova or the same driver could be sent on two airport pickups on
 * the same day. We treat one assignment per vehicle/driver per calendar day as
 * the safe rule: there is no reliable drop time in the data model, so allowing
 * two "morning" trips would be guessing.
 */

export type TransportCandidate = {
  id: string;
  reference?: string;
  date: string;
  status: string;
  extra: string | null;
};

export type TransportConflict = {
  kind: "vehicle" | "driver";
  transferId: string;
  reference: string;
};

/** Pure conflict check, used by the route and pinned by tests. */
export function findTransportConflict(
  input: { transferId: string; date: string; vehicleId?: string; driverId?: string },
  candidates: TransportCandidate[],
): TransportConflict | null {
  const date = input.date.slice(0, 10);
  for (const candidate of candidates) {
    if (candidate.id === input.transferId) continue;
    if (["Cancelled", "Completed", "Void"].includes(candidate.status)) continue;
    if ((candidate.date || "").slice(0, 10) !== date) continue;

    const extra = parseJson<Record<string, unknown>>(candidate.extra ?? "{}", {});
    if (input.vehicleId && extra.vehicleId === input.vehicleId) {
      return { kind: "vehicle", transferId: candidate.id, reference: candidate.reference ?? "" };
    }
    if (input.driverId && extra.driverId === input.driverId) {
      return { kind: "driver", transferId: candidate.id, reference: candidate.reference ?? "" };
    }
  }
  return null;
}

/**
 * Refuses an assignment when the vehicle or driver is already on another
 * transfer that day. A 409 is deliberate: this is a scheduling conflict, not a
 * validation error, and the screen can link to the other transfer.
 */
export async function assertTransportAvailable(
  organizationId: string,
  input: { transferId: string; date: string; vehicleId?: string; driverId?: string },
): Promise<void> {
  if (!input.vehicleId && !input.driverId) return;

  const sameDay = await prisma.record.findMany({
    where: {
      organizationId,
      moduleId: "transfers",
      date: input.date.slice(0, 10),
      deletedAt: null,
    },
    select: { id: true, reference: true, date: true, status: true, extra: true },
    take: 500,
  });

  const conflict = findTransportConflict(input, sameDay);
  if (!conflict) return;

  throw new ConflictError(
    conflict.kind === "vehicle"
      ? `That vehicle is already assigned to transfer ${conflict.reference || conflict.transferId} on this date`
      : `That driver is already assigned to transfer ${conflict.reference || conflict.transferId} on this date`,
    { kind: conflict.kind, transferId: conflict.transferId, reference: conflict.reference },
  );
}
