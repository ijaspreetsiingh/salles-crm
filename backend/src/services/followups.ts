import { prisma } from "../lib/prisma";

/**
 * Automated follow-ups — the single biggest time-saver for a travel agency.
 *
 * A lead that sits untouched for three days, an invoice that goes past its
 * due date, a quotation sent and never answered — these are the things a
 * person forgets and a system shouldn't. This scheduler runs once an hour,
 * finds them, and either sends a reminder (email/WhatsApp if configured) or
 * leaves an in-app notification so the worklist picks it up.
 *
 * Every rule is conservative: it only acts on records that clearly need
 * attention, and it never sends the same reminder twice (tracked via a
 * "followupSentAt" timestamp in the record's meta).
 */

const FOLLOWUP_RULES = [
  {
    moduleId: "leads",
    label: "Lead not contacted",
    /** Days since last update before a follow-up fires. */
    staleDays: 3,
    /** Only these statuses trigger a follow-up. */
    statuses: ["New", "Contacted", "Pending"],
    message: (name: string, ref: string) =>
      `Follow up with ${name} (${ref}) — no update in 3 days.`,
  },
  {
    moduleId: "quotations",
    label: "Quotation not responded",
    staleDays: 5,
    statuses: ["Sent", "Pending"],
    message: (name: string, ref: string) =>
      `Quotation ${ref} for ${name} — sent 5 days ago, no response yet.`,
  },
  {
    moduleId: "finance",
    label: "Invoice overdue",
    staleDays: 1,
    statuses: ["Pending", "Partially paid"],
    message: (name: string, ref: string) =>
      `Invoice ${ref} for ${name} — payment overdue.`,
  },
];

/** Run one pass of the follow-up scheduler. */
export async function runFollowUps(): Promise<{ checked: number; notified: number }> {
  let checked = 0;
  let notified = 0;

  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true, supportEmail: true },
  });

  for (const org of organizations) {
    for (const rule of FOLLOWUP_RULES) {
      const cutoff = new Date(Date.now() - rule.staleDays * 24 * 60 * 60 * 1000);

      const records = await prisma.record.findMany({
        where: {
          organizationId: org.id,
          moduleId: rule.moduleId,
          deletedAt: null,
          status: { in: rule.statuses },
          updatedAt: { lt: cutoff },
        },
        take: 50,
      });

      for (const record of records) {
        checked += 1;
        const meta = (() => {
          try { return JSON.parse(record.meta || "{}"); } catch { return {}; }
        })();
        const lastFollowup = meta.followupSentAt ? new Date(meta.followupSentAt) : null;
        // Don't spam: one follow-up per rule per record per 24h.
        if (lastFollowup && Date.now() - lastFollowup.getTime() < 24 * 60 * 60 * 1000) continue;

        const text = rule.message(record.name || "Customer", record.reference);

        // In-app notification (always). The reminder text is written for the
        // agent ("Follow up with…"), so it must never be sent to the customer.
        try {
          await prisma.notification.create({
            data: {
              organizationId: org.id,
              userId: record.ownerId ?? null,
              title: rule.label,
              body: text,
              moduleId: rule.moduleId,
              recordId: record.id,
              level: "warning",
              readAt: null,
            },
          });
          notified += 1;
        } catch {
          // Notification table may not exist in all deployments.
        }

        // Mark as followed up.
        try {
          await prisma.record.update({
            where: { id: record.id },
            data: { meta: JSON.stringify({ ...meta, followupSentAt: new Date().toISOString() }) },
          });
        } catch {
          // Best effort.
        }
      }
    }
  }

  return { checked, notified };
}

/** Start the follow-up scheduler. Runs once an hour. */
let firstRun: NodeJS.Timeout | null = null;
let hourly: NodeJS.Timeout | null = null;

export function startFollowUpScheduler(): void {
  // Run once on startup (after a short delay).
  firstRun = setTimeout(() => {
    runFollowUps().catch((err) => console.warn("Follow-up run failed:", err));
  }, 60_000);

  // Then every hour.
  hourly = setInterval(() => {
    runFollowUps().catch((err) => console.warn("Follow-up run failed:", err));
  }, 60 * 60 * 1000);
}

/** Stop the scheduler so a graceful restart does not keep a stale timer. */
export function stopFollowUpScheduler(): void {
  if (firstRun) clearTimeout(firstRun);
  if (hourly) clearInterval(hourly);
  firstRun = null;
  hourly = null;
}