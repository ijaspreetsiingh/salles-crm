/**
 * Support SLA state — frontend mirror of backend services/sla.ts.
 *
 * Priorities and their response windows:
 *   Urgent  → 4 hours
 *   High    → 1 day
 *   Normal  → 3 days
 *   Low     → 7 days
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

/** A ticket's SLA state: "ok", "due soon" (within 4 hours), "breached". */
export function slaState(ticket: {
  status: string;
  extra: Record<string, unknown>;
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

/** Label for the SLA state badge. */
export function slaStateLabel(state: "ok" | "due soon" | "breached"): string {
  switch (state) {
    case "breached":
      return "SLA breached";
    case "due soon":
      return "SLA due soon";
    default:
      return "SLA on track";
  }
}
