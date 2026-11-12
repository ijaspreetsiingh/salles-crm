import { plain } from "./language";

type SlaTicket = {
  status: string;
  extra: Record<string, unknown> | null;
  date: string | null;
};

const dueAtFor = (ticket: SlaTicket): Date | null => {
  const exact = ticket.extra?.["slaDueAt"];
  if (typeof exact === "string" && !Number.isNaN(Date.parse(exact))) {
    return new Date(exact);
  }
  if (!ticket.date) return null;
  // Old tickets only have a calendar date. Treat that date as due at the end
  // of the day instead of incorrectly marking it late at midnight.
  const legacy = /^\d{4}-\d{2}-\d{2}$/.test(ticket.date)
    ? `${ticket.date}T23:59:59.999Z`
    : ticket.date;
  const parsed = new Date(legacy);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** A ticket's SLA state: "ok", "due soon" (within 4 hours), or "breached". */
export function slaState(ticket: SlaTicket): "ok" | "due soon" | "breached" {
  if (["Resolved", "Closed"].includes(ticket.status)) return "ok";
  const due = dueAtFor(ticket);
  if (!due) return "ok";
  const now = Date.now();
  const dueTime = due.getTime();
  if (dueTime <= now) return "breached";
  if (dueTime <= now + 4 * 60 * 60 * 1000) return "due soon";
  return "ok";
}

/** Date and time shown beside the state so the team can act on the deadline. */
export function formatSlaDue(ticket: SlaTicket): string {
  const due = dueAtFor(ticket);
  if (!due) return "No deadline";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(due);
}

/** Label for the SLA state badge. */
export function slaStateLabel(state: "ok" | "due soon" | "breached"): string {
  switch (state) {
    case "breached":
      return plain("SLA breached");
    case "due soon":
      return plain("SLA due soon");
    default:
      return plain("SLA on track");
  }
}
