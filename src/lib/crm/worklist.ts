import { formatDay, money, type RecordRow, type Task } from "./catalog";

/* ==========================================================================
   The worklist.

   A person opening a CRM should never have to work out what to do. The
   app already knows: there are invoices unpaid, enquiries waiting, visas
   missing papers. This turns that raw state into a short, ordered list of
   plain sentences — "Reply to Aarav's Bali enquiry" — each one clickable.

   Rules:
     · real data only, never a guess
     · ordered by how much it costs to wait
     · at most seven items, so the list stays readable
   ========================================================================== */

export type WorkTone = "overdue" | "today" | "soon";

export type WorkItem = {
  id: string;
  /** What to do, in one plain sentence. */
  title: string;
  /** The supporting detail — a date, an amount, how long it has waited. */
  detail: string;
  /** Where to go when you click it. */
  moduleId: string;
  /** The record to open, when there is one. */
  recordId?: string;
  tone: WorkTone;
};

export type WorklistInput = {
  tasks: Task[];
  leads: RecordRow[];
  bookings: RecordRow[];
  finance: RecordRow[];
  visa: RecordRow[];
  currency: string;
  /** Today's date as yyyy-mm-dd. */
  today: string;
};

const daysBetween = (from: string, to: string) => {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
};

const waitPhrase = (days: number) =>
  days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;

/**
 * Builds the list of things that need a human, most urgent first.
 */
export function buildWorklist(input: WorklistInput): WorkItem[] {
  const { tasks, leads, bookings, finance, visa, currency, today } = input;
  const items: WorkItem[] = [];

  // 1 — Overdue work. The most expensive kind of waiting.
  for (const task of tasks.filter((t) => !t.done && t.date < today)) {
    const days = daysBetween(task.date, today);
    items.push({
      id: `task-${task.id}`,
      title: task.title,
      detail: `was due ${waitPhrase(days)}`,
      moduleId: task.relatedModule ?? "tasks",
      tone: "overdue",
    });
  }
  // 2 — Due today.
  for (const task of tasks.filter((t) => !t.done && t.date === today)) {
    items.push({
      id: `task-${task.id}`,
      title: task.title,
      detail: "due today",
      moduleId: task.relatedModule ?? "tasks",
      tone: "today",
    });
  }

  // 3 — Money that has not arrived.
  for (const invoice of finance.filter((f) => f.status === "Overdue")) {
    items.push({
      id: `invoice-${invoice.id}`,
      title: `Chase payment for ${invoice.name}`,
      detail: `${money(invoice.amount, currency)} · payment is late`,
      moduleId: "finance",
      recordId: invoice.id,
      tone: "overdue",
    });
  }

  // 4 — Enquiries nobody has answered yet.
  const staleCutoff = 3;
  for (const lead of leads.filter((l) => l.status === "New")) {
    const days = daysBetween(lead.date, today);
    if (days < staleCutoff) continue;
    items.push({
      id: `lead-${lead.id}`,
      title: `Reply to ${lead.name}${lead.destination ? ` about ${lead.destination}` : ""}`,
      detail: `waiting ${waitPhrase(days)}`,
      moduleId: "leads",
      recordId: lead.id,
      tone: "overdue",
    });
  }

  // 5 — Trips waiting on a supplier.
  for (const booking of bookings.filter((b) => b.status === "Pending" || b.status === "On hold")) {
    items.push({
      id: `booking-${booking.id}`,
      title: `Chase the supplier for ${booking.name}`,
      detail: `${booking.destination || "this trip"} · ${money(booking.amount, currency)}`,
      moduleId: "bookings",
      recordId: booking.id,
      tone: "soon",
    });
  }

  // 6 — Travel papers that are missing.
  for (const application of visa.filter((v) => v.status === "Documents pending")) {
    items.push({
      id: `visa-${application.id}`,
      title: `Ask ${application.name} for their missing papers`,
      detail: application.destination ? `visa for ${application.destination}` : "visa papers",
      moduleId: "visa",
      recordId: application.id,
      tone: "soon",
    });
  }

  const order: Record<WorkTone, number> = { overdue: 0, today: 1, soon: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 7);
}

/** A friendly greeting that matches the time of day. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The next thing on the list, in words — used under the greeting. */
export function worklistHeadline(items: WorkItem[]): string {
  if (items.length === 0) return "Nothing is waiting on you right now.";
  const overdue = items.filter((i) => i.tone === "overdue").length;
  if (overdue === items.length) {
    return `All ${items.length} of them are already late — here is the quickest way to catch up.`;
  }
  if (overdue > 0) {
    return `${items.length} things need you, and ${overdue} ${overdue === 1 ? "is" : "are"} already late.`;
  }
  if (items.length === 1) return "One thing needs you today.";
  return `${items.length} things need you today.`;
}

/** A short sentence describing a record, used in list rows. */
export function describeRecord(row: RecordRow, currency: string): string {
  const parts: string[] = [];
  if (row.destination) parts.push(row.destination);
  if (row.amount) parts.push(money(row.amount, currency));
  if (row.date) parts.push(formatDay(row.date));
  return parts.join(" · ");
}
