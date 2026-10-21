import { differenceInCalendarDays, parseISO } from "date-fns";
import type { RecordRow, Task } from "./catalog";

/* ==========================================================================
   Customer truth.

   Everything on a customer card is derived from real records: what they
   have spent, how recently you spoke to them, whether they owe you money
   and whether they are travelling. Nothing is guessed.

   The old build derived a "health score" from a hash of the customer's
   name, which produced the same number forever and taught nobody anything.
   ========================================================================== */

export type CustomerSignals = {
  /** Total paid across their invoices. */
  lifetimeValue: number;
  /** Total still owed to you. */
  outstanding: number;
  /** Trips they are taking or have taken. */
  trips: number;
  /** Days since anything happened with this customer. */
  daysSinceContact: number | null;
  /** Open (not done) tasks that mention them. */
  openTasks: number;
  /** Overdue invoices they owe. */
  overdueInvoices: number;
};

export type CustomerHealth = {
  /** 0–100. */
  score: number;
  /** A word, so nobody has to guess what the number means. */
  label: "Thriving" | "Steady" | "Needs attention" | "At risk";
  /** The three things behind the score, in plain words. */
  reasons: string[];
};

/** Matches a record to a customer by name, case-insensitively. */
export const belongsTo = (row: RecordRow, customerName: string) =>
  row.name.trim().toLowerCase() === customerName.trim().toLowerCase();

/**
 * Gathers the real signals for a customer from the workspace.
 */
export function customerSignals(
  customer: RecordRow,
  all: { bookings: RecordRow[]; invoices: RecordRow[]; enquiries: RecordRow[]; tasks: Task[] },
): CustomerSignals {
  const name = customer.name.trim().toLowerCase();

  const invoices = all.invoices.filter((r) => belongsTo(r, customer.name));
  const bookings = all.bookings.filter((r) => belongsTo(r, customer.name));
  const enquiries = all.enquiries.filter((r) => belongsTo(r, customer.name));

  const lifetimeValue = invoices
    .filter((r) => r.status === "Paid")
    .reduce((sum, r) => sum + r.amount, 0);
  const outstanding = invoices
    .filter((r) => r.status !== "Paid")
    .reduce((sum, r) => sum + r.amount, 0);
  const overdueInvoices = invoices.filter((r) => r.status === "Overdue").length;

  const mentions = (r: { title: string }) =>
    r.title.toLowerCase().includes(name.split(" ")[0] ?? name);
  const openTasks = all.tasks.filter((t) => !t.done && mentions(t)).length;

  // The most recent thing that happened with this customer.
  const dates = [...bookings, ...invoices, ...enquiries]
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  const last = dates.at(-1);
  const daysSinceContact = last
    ? Math.abs(differenceInCalendarDays(new Date(), parseISO(last)))
    : null;

  return {
    lifetimeValue,
    outstanding,
    trips: bookings.length,
    daysSinceContact,
    openTasks,
    overdueInvoices,
  };
}

/**
 * A score built from four things that actually matter:
 *   · do they owe you money
 *   · how long since you last heard from them
 *   · are they travelling with you
 *   · are they worth money
 */
export function customerHealth(signals: CustomerSignals): CustomerHealth {
  const reasons: string[] = [];
  let score = 50;

  // Money owed is the biggest red flag.
  if (signals.overdueInvoices > 0) {
    score -= Math.min(35, signals.overdueInvoices * 18);
    reasons.push(
      `${signals.overdueInvoices} payment${signals.overdueInvoices === 1 ? " is" : "s are"} late`,
    );
  } else if (signals.outstanding > 0) {
    score -= 6;
    reasons.push("An invoice is still open");
  } else if (signals.lifetimeValue > 0) {
    score += 12;
    reasons.push("Everything is paid");
  } else {
    reasons.push("Nothing paid yet");
  }

  // Recency.
  if (signals.daysSinceContact === null) {
    score -= 8;
    reasons.push("Never heard from them");
  } else if (signals.daysSinceContact <= 14) {
    score += 18;
    reasons.push("Spoke to them recently");
  } else if (signals.daysSinceContact <= 45) {
    score += 6;
    reasons.push("Heard from them a while ago");
  } else {
    score -= 16;
    reasons.push(`Nothing for ${signals.daysSinceContact} days`);
  }

  // Are they travelling with you.
  if (signals.trips > 0) {
    score += Math.min(16, signals.trips * 6);
    reasons.push(`${signals.trips} trip${signals.trips === 1 ? "" : "s"} with you`);
  } else {
    reasons.push("No trips yet");
  }

  // Open promises.
  if (signals.openTasks > 0) {
    score -= Math.min(12, signals.openTasks * 4);
    reasons.push(`${signals.openTasks} open task${signals.openTasks === 1 ? "" : "s"}`);
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const label =
    clamped >= 75
      ? "Thriving"
      : clamped >= 55
        ? "Steady"
        : clamped >= 35
          ? "Needs attention"
          : "At risk";
  return { score: clamped, label, reasons: reasons.slice(0, 3) };
}

/**
 * One rule for segments, used everywhere.
 *
 * Segment is a business fact about how big the customer is, so it comes
 * from money and trip size — not from a status label.
 */
export function customerSegment(signals: CustomerSignals): "Enterprise" | "Mid-market" | "SMB" {
  const value = signals.lifetimeValue + signals.outstanding;
  if (value >= 400_000 || signals.trips >= 3) return "Enterprise";
  if (value >= 100_000 || signals.trips >= 1) return "Mid-market";
  return "SMB";
}

/** The colour of the health ring. */
export const healthColour = (score: number) =>
  score >= 75 ? "var(--pine)" : score >= 55 ? "var(--butter)" : "var(--tomato)";
