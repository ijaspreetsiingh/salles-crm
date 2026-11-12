import { ForbiddenError } from "../lib/errors";

/**
 * Segregation of duties for money records.
 *
 * The person who creates an invoice must not also be the person who marks it
 * approved/paid, or deletes it after it has been issued. Role permissions say
 * *what* a person may do; this says they cannot be both sides of the same
 * transaction. Legacy rows without `createdById` are left alone.
 */

const APPROVAL_STATUSES = new Set(["Approved", "Paid", "Processed"]);
const UNISSUED_STATUSES = new Set(["Draft", "Cancelled", "Void", ""]);

export type SodInput = {
  moduleId: string;
  action: "approve" | "delete";
  actorId: string;
  createdById: string | null | undefined;
  currentStatus: string;
  nextStatus?: string;
};

export function assertSegregationOfDuties(input: SodInput): void {
  if (input.moduleId !== "finance") return;
  if (!input.actorId || !input.createdById || input.actorId !== input.createdById) return;

  if (input.action === "approve") {
    const next = input.nextStatus ?? "";
    if (next && next !== input.currentStatus && APPROVAL_STATUSES.has(next)) {
      throw new ForbiddenError(
        "The person who created this invoice cannot approve or mark it paid. Ask another finance user.",
        "segregation_of_duties",
      );
    }
    return;
  }

  if (!UNISSUED_STATUSES.has(input.currentStatus)) {
    throw new ForbiddenError(
      "The person who created this invoice cannot delete it after it has been issued. Ask another admin.",
      "segregation_of_duties",
    );
  }
}
