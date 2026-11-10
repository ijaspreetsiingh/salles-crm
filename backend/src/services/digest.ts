import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { parseJson, stringifyJson } from "../lib/utils";
import { permissionsForRole } from "../middlewares/auth";
import { buildAttention, todayIn, type AttentionDto } from "./attention";
import { sendEmail } from "./email";

/* ==========================================================================
   The daily email.

   The home page already answers "what needs doing today". This sends the same
   answer to the inbox before the day starts, because the person who most needs
   "payment is late" is the one who is not looking at the screen yet.

   The list is not a summary or a dashboard — it is the same sentences the home
   page shows, per person, from the same query.
   ========================================================================== */

export type DigestSettings = {
  enabled: boolean;
  /** Local hour (0–23) the digest goes out. */
  hour: number;
  /** "mine" = only their own work; "team" = the whole branch. */
  scope: "mine" | "team";
  /** Extra addresses. Empty = every active member gets their own. */
  recipients: string[];
  /** Local date of the last successful run — stops a second send on the same day. */
  lastSentDate: string;
};

export const DEFAULT_DIGEST: DigestSettings = {
  enabled: false,
  hour: 8,
  scope: "mine",
  recipients: [],
  lastSentDate: "",
};

const EMAIL_LOOKS_VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The settings column is a JSON string; anything else is treated as empty. */
const asJson = (value: unknown) => (typeof value === "string" ? value : "");

/** Reads the digest block out of the organisation's free-form settings JSON. */
export function readDigestSettings(settings: unknown): DigestSettings {
  const raw = parseJson<Record<string, unknown>>(asJson(settings), {})["digest"];
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hour = Number(value["hour"]);
  const scope = value["scope"] === "team" ? "team" : "mine";
  return {
    enabled: value["enabled"] === true,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_DIGEST.hour,
    scope,
    recipients: Array.isArray(value["recipients"])
      ? value["recipients"]
          .map((item) => String(item).trim())
          .filter((e) => EMAIL_LOOKS_VALID.test(e))
      : [],
    lastSentDate: typeof value["lastSentDate"] === "string" ? value["lastSentDate"] : "",
  };
}

/**
 * Folds a partial save into what is already stored.
 *
 * The caller only ever sends the fields it changed, so anything it leaves out
 * has to survive — otherwise changing the time would turn the digest off.
 */
export function mergeDigestSettings(
  current: unknown,
  next: Partial<DigestSettings>,
): DigestSettings {
  return { ...readDigestSettings(current), ...next };
}

/** Writes the digest block back without disturbing any other setting. */
export async function writeDigestSettings(
  organizationId: string,
  current: unknown,
  next: Partial<DigestSettings>,
): Promise<DigestSettings> {
  const merged = mergeDigestSettings(current, next);
  const settings = parseJson<Record<string, unknown>>(asJson(current), {});
  settings["digest"] = merged;
  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: stringifyJson(settings) },
  });
  return merged;
}

/** The local hour in the organisation's own timezone. */
export function localHour(timeZone: string, now = new Date()): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        hour12: false,
      }).format(now),
    );
  } catch {
    return now.getUTCHours();
  }
}

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
};

/** Turns today's list into the exact text of the email. */
export function digestBody(person: string, day: AttentionDto): string {
  const record = (row: {
    reference: string;
    name: string;
    destination: string;
    amount: number;
    currency: string;
  }) =>
    [row.reference, row.name, row.destination, row.amount ? money(row.amount, row.currency) : ""]
      .filter(Boolean)
      .join(" · ");

  const sections: string[] = [];
  if (day.tasks.length)
    sections.push(
      [
        `Tasks due (${day.tasks.length})`,
        ...day.tasks.map((task) => `  • ${task.title} — ${task.type}`),
      ].join("\n"),
    );
  if (day.leads.length)
    sections.push(
      [
        `Enquiries waiting on you (${day.leads.length})`,
        ...day.leads.map((row) => `  • ${record(row)}`),
      ].join("\n"),
    );
  if (day.finance.length)
    sections.push(
      [
        `Money late (${day.finance.length})`,
        ...day.finance.map((row) => `  • ${record(row)}`),
      ].join("\n"),
    );
  if (day.bookings.length)
    sections.push(
      [
        `Bookings waiting on someone (${day.bookings.length})`,
        ...day.bookings.map((row) => `  • ${record(row)}`),
      ].join("\n"),
    );
  if (day.visa.length)
    sections.push(
      [
        `Papers still missing (${day.visa.length})`,
        ...day.visa.map((row) => `  • ${record(row)}`),
      ].join("\n"),
    );
  if (day.groups.length)
    sections.push(
      [
        `Groups leaving soon (${day.groups.length})`,
        ...day.groups.map((row) => `  • ${record(row)}`),
      ].join("\n"),
    );

  const total =
    day.tasks.length +
    day.leads.length +
    day.finance.length +
    day.bookings.length +
    day.visa.length +
    day.groups.length;
  const opening = total
    ? `Good morning, ${person.split(" ")[0] ?? person}.\n\n${total} ${total === 1 ? "thing needs" : "things need"} you today.`
    : `Good morning, ${person.split(" ")[0] ?? person}.\n\nNothing is waiting on you today.`;

  return [opening, "", ...sections.flatMap((section) => [section, ""])]
    .join("\n")
    .concat("Open Traveldesk to work through it: ")
    .concat(env.APP_URL);
}

export type DigestRecipient = {
  name: string;
  email: string;
  /** Decides what this address is allowed to see. */
  roleKey: string;
  branchId: string | null;
  /** Overrides the organisation's scope — used for shared mailboxes. */
  scope?: "mine" | "team";
};

/**
 * Who gets mail: the extra addresses if the company listed any, otherwise
 * every active member, each with their own list.
 */
export async function digestRecipients(
  organizationId: string,
  settings: DigestSettings,
): Promise<DigestRecipient[]> {
  if (settings.recipients.length) {
    // A mailbox the company typed in by hand has no person behind it, so it
    // cannot be scoped to "their own work" — it gets the company's day.
    return settings.recipients.map((email) => ({
      name: email.split("@")[0] ?? email,
      email,
      roleKey: "company_admin",
      branchId: null,
      scope: "team" as const,
    }));
  }
  const members = await prisma.membership.findMany({
    where: { organizationId, active: true, user: { active: true } },
    include: { user: { select: { name: true, email: true } } },
  });
  return members
    .map((member) => ({
      name: member.user.name,
      email: member.user.email,
      roleKey: member.roleKey,
      branchId: member.branchId ?? null,
    }))
    .filter((member) => EMAIL_LOOKS_VALID.test(member.email));
}

/**
 * Builds and sends one person's digest.
 *
 * Returns the delivery status so the caller can tell the truth about it: with
 * no SMTP account configured the message is still recorded in the outbox as
 * "queued" rather than pretending it was delivered.
 */
export async function sendDigestTo(input: {
  organizationId: string;
  organizationName: string;
  recipient: DigestRecipient;
  scope: "mine" | "team";
}): Promise<{ status: string; subjects: number; total: number }> {
  const permissions = await permissionsForRole(input.organizationId, input.recipient.roleKey);

  const day = await buildAttention(
    input.organizationId,
    {
      name: input.recipient.name,
      roleKey: input.recipient.roleKey,
      branchId: input.recipient.branchId,
      modules: permissions.modules,
    },
    input.recipient.scope ?? input.scope,
  );

  const total =
    day.tasks.length +
    day.leads.length +
    day.finance.length +
    day.bookings.length +
    day.visa.length +
    day.groups.length;
  const subject = total
    ? `Your day at ${input.organizationName}: ${total} ${total === 1 ? "thing" : "things"}`
    : `Your day at ${input.organizationName}: nothing waiting`;
  const { status } = await sendEmail({
    organizationId: input.organizationId,
    to: input.recipient.email,
    subject,
    body: digestBody(input.recipient.name, day),
    template: "daily-digest",
  });
  return { status, subjects: total > 0 ? 1 : 0, total };
}

/**
 * Sends the digest for every organisation whose local clock has passed its
 * hour and which has not been sent today.
 *
 * `lastSentDate` is what stops a repeat: the check runs every few minutes so a
 * restart, a different boot time or a daylight-saving jump cannot miss the
 * hour. Two server instances starting at once could each send one message —
 * worth saying out loud rather than pretending the lock is atomic.
 */
export async function runDueDigests(
  now = new Date(),
): Promise<{ organizations: number; emails: number }> {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true, settings: true, timezone: true },
  });

  let organizationsSent = 0;
  let emailsSent = 0;

  for (const organization of organizations) {
    const timeZone = organization.timezone || "Asia/Kolkata";
    const settings = readDigestSettings(organization.settings);
    if (!settings.enabled) continue;

    const today = todayIn(timeZone);
    if (settings.lastSentDate === today) continue;
    if (localHour(timeZone, now) < settings.hour) continue;

    const recipients = await digestRecipients(organization.id, settings);
    for (const recipient of recipients) {
      try {
        await sendDigestTo({
          organizationId: organization.id,
          organizationName: organization.name,
          recipient,
          scope: settings.scope,
        });
        emailsSent++;
      } catch (error) {
        logger.warn({ err: error, organizationId: organization.id }, "Digest delivery failed");
      }
    }

    // Marked even when there was nothing to say, so an empty day is not
    // re-checked every fifteen minutes.
    await writeDigestSettings(organization.id, organization.settings, { lastSentDate: today });
    organizationsSent++;
  }

  return { organizations: organizationsSent, emails: emailsSent };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the background check. Safe to call once, on boot. */
export function startDigestScheduler() {
  if (!env.DIGEST_ENABLED) {
    logger.info("Daily digest scheduler is off (DIGEST_ENABLED=false)");
    return;
  }
  const intervalMs = env.DIGEST_CHECK_MINUTES * 60_000;
  const check = () => {
    void runDueDigests().catch((error) =>
      logger.error({ err: error }, "Daily digest check failed"),
    );
  };
  timer = setInterval(check, intervalMs);
  timer.unref?.();
  // Give the database a moment to be ready before the first check.
  setTimeout(check, 20_000).unref?.();
  logger.info({ everyMinutes: env.DIGEST_CHECK_MINUTES }, "Daily digest scheduler started");
}

export function stopDigestScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
