import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { createNotification } from "../services/notifications";

/**
 * Support SLA timers.
 *
 * Every support ticket carries a "SLA due" date. When a ticket is created,
 * that date is set from its priority — Urgent tickets need a response in
 * hours, Low tickets in days. When the due date passes and the ticket is
 * still open, it breaches: it is escalated and the team is told.
 *
 * Priorities and their response windows:
 *   Urgent  → 4 hours
 *   High    → 1 day
 *   Normal  → 3 days
 *   Low     → 7 days
 *
 * These are business rules, not user preferences: a ticket marked Urgent that
 * sits for two days is a breach no matter who opened it.
 */

const SLA_HOURS: Record<string, number> = {
  Urgent: 4,
  High: 24,
  Normal: 72,
  Low: 168,
};

/** The date an SLA clock expires, given a ticket's priority and created date. */
export function slaDueDate(priority: string, createdAt: string): string {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS["Normal"] ?? 72;
  const due = new Date(createdAt);
  due.setHours(due.getHours() + hours);
  return due.toISOString().slice(0, 10);
}

/** True when a ticket's SLA clock has run out and it is not yet resolved. */
export function isSlaBreached(ticket: {
  status: string;
  extra: string | null;
  date: string | null;
}): boolean {
  if (["Resolved", "Closed"].includes(ticket.status)) return false;
  if (!ticket.date) return false;
  return new Date(ticket.date) < new Date();
}

/** A ticket's SLA state for the UI: "ok", "due soon" (within 4 hours), "breached". */
export function slaState(ticket: {
  status: string;
  extra: string | null;
  date: string | null;
}): "ok" | "due soon" | "breached" {
  if (["Resolved", "Closed"].includes(ticket.status)) return "ok";
  if (!ticket.date) return "ok";
  const due = new Date(ticket.date);
  const now = new Date();
  const inFourHours = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  if (due < now) return "breached";
  if (due < inFourHours) return "due soon";
  return "ok";
}

/**
 * Finds every open support ticket whose SLA has breached and escalates it.
 *
 * Escalation moves Open → Escalated and writes a notification so a manager
 * sees it. A ticket already Escalated is left alone — it is already someone's
 * problem.
 */
export async function escalateBreachedTickets(organizationId: string): Promise<number> {
  const now = new Date().toISOString().slice(0, 10);
  const breached = await prisma.record.findMany({
    where: {
      organizationId,
      moduleId: "support",
      deletedAt: null,
      status: { in: ["Open", "In progress"] },
      date: { lt: now },
    },
    orderBy: { date: "asc" },
  });

  let escalated = 0;
  for (const ticket of breached) {
    await prisma.record.update({
      where: { id: ticket.id },
      data: { status: "Escalated" },
    });
    await recordAudit({
      organizationId,
      action: "Escalated",
      moduleId: "support",
      recordId: ticket.id,
      label: `SLA breach: ${ticket.reference} escalated`,
    });
    await createNotification({
      organizationId,
      title: `SLA breached — ${ticket.reference}`,
      body: `Ticket "${ticket.name}" passed its SLA due date (${ticket.date}) and has been escalated.`,
      moduleId: "support",
      recordId: ticket.id,
      level: "warning",
    });
    escalated++;
  }

  return escalated;
}

/**
 * Recalculates the SLA due date for a support ticket when its priority changes.
 * Returns the new due date, or null when the module is not support.
 */
export function applySlaOnCreate(
  moduleId: string,
  extraJson: string | null,
  createdAt: string,
): string | null {
  if (moduleId !== "support") return null;
  const extra = parseJson<Record<string, unknown>>(extraJson ?? "{}", {});
  const priority = String(extra.priority ?? "Normal");
  return slaDueDate(priority, createdAt);
}
