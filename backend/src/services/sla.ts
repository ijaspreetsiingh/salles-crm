import { prisma } from "../lib/prisma";
import { parseJson, stringifyJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { createNotification } from "../services/notifications";
import { logger } from "../lib/logger";

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

const dueForDateOnly = (date: string): string => `${date}T23:59:59.999Z`;

/** Exact UTC deadline for a priority window. */
export function slaDueAt(priority: string, startedAt: string | Date): string {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.Normal!;
  const due = new Date(startedAt);
  due.setTime(due.getTime() + hours * 60 * 60 * 1000);
  return due.toISOString();
}

function normalizedDueAt(value: unknown, legacyDate: string | null): string | null {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (!legacyDate) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(legacyDate)) return dueForDateOnly(legacyDate);
  const parsed = new Date(legacyDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Adds precise SLA metadata while keeping the record's date field calendar-friendly. */
export function applySlaOnCreate(
  extraJson: string,
  createdAt: string,
  suppliedDate?: string,
): { date: string; extraJson: string } {
  const extra = parseJson<Record<string, unknown>>(extraJson || "{}", {});
  const manualDate = Boolean(suppliedDate);
  const dueAt = manualDate
    ? normalizedDueAt(undefined, suppliedDate!)!
    : slaDueAt(String(extra.priority ?? "Normal"), createdAt);
  extra.slaDueAt = dueAt;
  extra.slaManual = manualDate ? "true" : "false";
  return { date: dueAt.slice(0, 10), extraJson: stringifyJson(extra) };
}

/** True when a ticket's SLA clock has run out and it is not yet resolved. */
export function isSlaBreached(ticket: {
  status: string;
  extra: string | Record<string, unknown> | null;
  date: string | null;
}): boolean {
  if (["Resolved", "Closed"].includes(ticket.status)) return false;
  const extra = typeof ticket.extra === "string" ? parseJson<Record<string, unknown>>(ticket.extra, {}) : (ticket.extra ?? {});
  const dueAt = normalizedDueAt(extra.slaDueAt, ticket.date);
  return Boolean(dueAt && Date.parse(dueAt) <= Date.now());
}

/** A ticket's SLA state for the UI: "ok", "due soon" (within 4 hours), "breached". */
export function slaState(ticket: {
  status: string;
  extra: string | Record<string, unknown> | null;
  date: string | null;
}): "ok" | "due soon" | "breached" {
  if (["Resolved", "Closed"].includes(ticket.status)) return "ok";
  const extra = typeof ticket.extra === "string" ? parseJson<Record<string, unknown>>(ticket.extra, {}) : (ticket.extra ?? {});
  const dueAt = normalizedDueAt(extra.slaDueAt, ticket.date);
  if (!dueAt) return "ok";
  const due = new Date(dueAt);
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
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const where = {
    organizationId,
    moduleId: "support",
    deletedAt: null,
    status: { in: ["Open", "In progress"] as string[] },
    date: { lte: today },
  };
  let cursor: string | undefined;
  let escalated = 0;
  for (;;) {
    const tickets = await prisma.record.findMany({
      where,
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (tickets.length === 0) break;
    cursor = tickets[tickets.length - 1]!.id;
    for (const ticket of tickets) {
      if (!isSlaBreached(ticket)) continue;
      // Conditional update makes repeated scheduler runs safe and prevents
      // two workers from sending duplicate breach notifications.
      const claimed = await prisma.record.updateMany({
        where: { id: ticket.id, organizationId, status: { in: ["Open", "In progress"] } },
        data: { status: "Escalated" },
      });
      if (claimed.count !== 1) continue;
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
        body: `Ticket "${ticket.name}" passed its SLA deadline (${normalizedDueAt(parseJson<Record<string, unknown>>(ticket.extra, {}).slaDueAt, ticket.date)}) and has been escalated.`,
        moduleId: "support",
        recordId: ticket.id,
        level: "warning",
      });
      escalated++;
    }
    if (tickets.length < 500) break;
  }
  return escalated;
}

/** Rebuilds auto deadlines when priority changes, preserving manual deadlines. */
export function applySlaOnUpdate(
  extraJson: string,
  existingDate: string,
  createdAt: string,
  changedDate?: string,
  priorityChanged = false,
): { date: string; extraJson: string } {
  const extra = parseJson<Record<string, unknown>>(extraJson || "{}", {});
  const dateChanged = Boolean(changedDate && changedDate !== existingDate);
  let dueAt = normalizedDueAt(extra.slaDueAt, existingDate);
  let manual = extra.slaManual === true || extra.slaManual === "true";

  if (dateChanged) {
    dueAt = normalizedDueAt(undefined, changedDate!);
    manual = true;
  } else if (priorityChanged && !manual) {
    // A changed priority starts a fresh response window from the time the
    // team applies it, rather than pretending the new priority existed earlier.
    dueAt = slaDueAt(String(extra.priority ?? "Normal"), new Date());
  } else if (!dueAt) {
    dueAt = slaDueAt(String(extra.priority ?? "Normal"), createdAt);
  }

  if (!dueAt) return { date: existingDate, extraJson };
  extra.slaDueAt = dueAt;
  extra.slaManual = manual ? "true" : "false";
  return { date: dueAt.slice(0, 10), extraJson: stringifyJson(extra) };
}

let scheduler: ReturnType<typeof setInterval> | undefined;

/** Runs organization-scoped SLA checks on the elected scheduler process. */
export function startSlaScheduler(): void {
  if (scheduler) return;
  const run = async () => {
    try {
      const organizations = await prisma.record.findMany({
        where: { moduleId: "support", deletedAt: null, status: { in: ["Open", "In progress"] } },
        distinct: ["organizationId"],
        select: { organizationId: true },
      });
      for (const { organizationId } of organizations) {
        await escalateBreachedTickets(organizationId);
      }
    } catch (error) {
      // The API process must keep running when a background check has a
      // transient database/notification failure; the next poll retries it.
      logger.warn({ err: error }, "Support SLA scheduler failed; it will retry on the next poll");
    }
  };
  void run();
  scheduler = setInterval(() => void run(), 5 * 60 * 1000);
  scheduler.unref?.();
}

export function stopSlaScheduler(): void {
  if (scheduler) clearInterval(scheduler);
  scheduler = undefined;
}
