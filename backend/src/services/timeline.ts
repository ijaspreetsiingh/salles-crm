/**
 * Timeline service — writes RecordEvent rows automatically.
 *
 * Every meaningful thing that happens to a record gets a timeline event so
 * the agent can open any record and see the full story without digging through
 * audit logs: who created it, every status change, every payment, every email.
 *
 * Rules:
 *   - Never throws into the caller. A failed timeline write must not roll back
 *     the actual operation (payment saved, email sent).
 *   - Always fire-and-forget in routes: `void recordEvent(...)`.
 *   - actorId null = system action (scheduler, webhook, automation).
 */
import { prisma } from "../lib/prisma";
import { cuid } from "../lib/utils";

export type EventType =
  | "created"
  | "status_change"
  | "field_change"
  | "note"
  | "call"
  | "email"
  | "whatsapp"
  | "payment"
  | "relation_added"
  | "relation_removed"
  | "imported";

type EventInput = {
  organizationId: string;
  recordId: string;
  type: EventType;
  body?: string;
  meta?: Record<string, unknown>;
  actorId?: string | null;
  actorName?: string;
};

/** Writes a single timeline event. Never throws. */
export async function recordEvent(input: EventInput): Promise<void> {
  try {
    await prisma.recordEvent.create({
      data: {
        id: cuid(),
        organizationId: input.organizationId,
        recordId: input.recordId,
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? "System",
        type: input.type,
        body: input.body ?? "",
        meta: JSON.stringify(input.meta ?? {}),
      },
    });
  } catch {
    // Timeline is supplementary — never break the main operation.
  }
}

/** Shorthand for a "record created" event. */
export function eventCreated(
  organizationId: string,
  recordId: string,
  reference: string,
  moduleName: string,
  actorId: string | null,
  actorName: string,
): Promise<void> {
  return recordEvent({
    organizationId,
    recordId,
    type: "created",
    body: `${moduleName} ${reference} created`,
    meta: { reference, moduleName },
    actorId,
    actorName,
  });
}

/** Shorthand for a status change event. */
export function eventStatusChange(
  organizationId: string,
  recordId: string,
  fromStatus: string,
  toStatus: string,
  actorId: string | null,
  actorName: string,
): Promise<void> {
  return recordEvent({
    organizationId,
    recordId,
    type: "status_change",
    body: `Status changed from ${fromStatus} to ${toStatus}`,
    meta: { from: fromStatus, to: toStatus },
    actorId,
    actorName,
  });
}

/** Shorthand for a payment received event. */
export function eventPayment(
  organizationId: string,
  recordId: string,
  amount: number,
  currency: string,
  method: string,
  receiptNo: string | null,
  actorId: string | null,
  actorName: string,
): Promise<void> {
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(amount);
  return recordEvent({
    organizationId,
    recordId,
    type: "payment",
    body: `Payment received: ${formatted} via ${method}${receiptNo ? ` · ${receiptNo}` : ""}`,
    meta: { amount, currency, method, receiptNo },
    actorId,
    actorName,
  });
}

/** Shorthand for an email sent event. */
export function eventEmailSent(
  organizationId: string,
  recordId: string,
  to: string,
  subject: string,
  status: string,
  actorId: string | null,
  actorName: string,
): Promise<void> {
  return recordEvent({
    organizationId,
    recordId,
    type: "email",
    body: status === "sent"
      ? `Email sent to ${to}: "${subject}"`
      : `Email queued to ${to}: "${subject}"`,
    meta: { to, subject, status },
    actorId,
    actorName,
  });
}

/** Shorthand for a WhatsApp sent event. */
export function eventWhatsAppSent(
  organizationId: string,
  recordId: string,
  to: string,
  status: string,
  actorId: string | null,
  actorName: string,
): Promise<void> {
  return recordEvent({
    organizationId,
    recordId,
    type: "whatsapp",
    body: status === "sent" ? `WhatsApp sent to ${to}` : `WhatsApp queued to ${to}`,
    meta: { to, status },
    actorId,
    actorName,
  });
}
