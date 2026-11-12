import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { recordAudit } from "./audit";
import type { Request } from "express";

/**
 * Customer data erasure (DPDP Act 2023 / GDPR Article 17).
 *
 * A customer can ask an agency to erase their personal data. Passing that
 * request to a developer and running SQL is not an answer: it is unaudited,
 * easy to get wrong, and usually misses the passport scan on disk.
 *
 * This service:
 *   - finds every record in the workspace tied to the email/phone/record id,
 *   - anonymises the contact fields in a single transaction,
 *   - deletes conversations, messages, call logs, consent rows, queued email
 *     and attachments (including the file on disk),
 *   - keeps a tax invoice's legal identity but removes the contact details,
 *   - writes one audit entry containing counts only, never the erased values.
 *
 * It is idempotent: running it twice reports zero remaining rows instead of
 * failing.
 */

export type ErasureInput = {
  email?: string;
  phone?: string;
  recordId?: string;
  reason?: string;
};

export type ErasureSummary = {
  requestId: string;
  recordsMatched: number;
  recordsErased: number;
  retainedForTax: number;
  filesDeleted: number;
  conversationsDeleted: number;
  callLogsDeleted: number;
  consentRowsDeleted: number;
  queuedEmailsDeleted: number;
  tasksDeleted: number;
  notificationsDeleted: number;
  errors: string[];
};

const FINANCE_MODULES = new Set(["finance"]);

/** Normalises a phone for comparison: digits only, last 10 digits. */
function phoneKey(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function conversationIdsByPhone(organizationId: string, phone: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Conversation"
    WHERE "organizationId" = ${organizationId}
      AND regexp_replace("contactPhone", '[^0-9]', '', 'g') LIKE ${`%${phone}`}
  `;
  return rows.map((row) => row.id);
}

async function callLogIdsByPhone(organizationId: string, phone: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "CallLog"
    WHERE "organizationId" = ${organizationId}
      AND regexp_replace("contactPhone", '[^0-9]', '', 'g') LIKE ${`%${phone}`}
  `;
  return rows.map((row) => row.id);
}

async function consentIdsByPhone(organizationId: string, phone: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ConsentRecord"
    WHERE "organizationId" = ${organizationId}
      AND regexp_replace("contactPhone", '[^0-9]', '', 'g') LIKE ${`%${phone}`}
  `;
  return rows.map((row) => row.id);
}

export async function eraseCustomerData(
  organizationId: string,
  input: ErasureInput,
  req?: Request,
): Promise<ErasureSummary> {
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = phoneKey(input.phone);
  const recordId = (input.recordId ?? "").trim();

  /*
   * Phone numbers are stored as people type them: "+91 98190 01219". A plain
   * `contains` on the normalised digits misses every formatted number, which
   * would leave the very data the customer asked us to erase. Match on the
   * digits-in-database instead.
   */
  const phoneIds = phone
    ? (
        await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Record"
          WHERE "organizationId" = ${organizationId}
            AND regexp_replace("phone", '[^0-9]', '', 'g') LIKE ${`%${phone}`}
        `
      ).map((row) => row.id)
    : [];

  const where = recordId
    ? { organizationId, id: recordId }
    : {
        organizationId,
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(phoneIds.length ? [{ id: { in: phoneIds } }] : []),
        ],
      };

  const records = await prisma.record.findMany({
    where,
    take: 500,
    select: {
      id: true,
      moduleId: true,
      email: true,
      phone: true,
      reference: true,
    },
  });

  const recordIds = records.map((record) => record.id);
  const matchedPhones = new Set<string>(
    records.map((record) => phoneKey(record.phone)).filter(Boolean),
  );
  if (phone) matchedPhones.add(phone);
  const phoneNumbers = [...matchedPhones].filter(Boolean);

  // Formatted numbers need a digits-only match on every linked table, not just
  // the record row.
  const [phoneConversationIds, callIds, consentIds] = await Promise.all([
    phoneNumbers.length
      ? Promise.all(phoneNumbers.map((value) => conversationIdsByPhone(organizationId, value))).then(
          (groups) => groups.flat(),
        )
      : Promise.resolve([] as string[]),
    phoneNumbers.length
      ? Promise.all(phoneNumbers.map((value) => callLogIdsByPhone(organizationId, value))).then(
          (groups) => groups.flat(),
        )
      : Promise.resolve([] as string[]),
    phoneNumbers.length
      ? Promise.all(phoneNumbers.map((value) => consentIdsByPhone(organizationId, value))).then(
          (groups) => groups.flat(),
        )
      : Promise.resolve([] as string[]),
  ]);

  const attachments = recordIds.length
    ? await prisma.attachment.findMany({
        where: { organizationId, recordId: { in: recordIds } },
        select: { id: true, storedName: true },
      })
    : [];

  const conversations = recordIds.length || email || phone
    ? await prisma.conversation.findMany({
        where: {
          organizationId,
          OR: [
            ...(recordIds.length ? [{ recordId: { in: recordIds } }] : []),
            ...(email ? [{ contactEmail: { equals: email, mode: "insensitive" as const } }] : []),
            ...(phoneConversationIds.length
              ? [{ id: { in: phoneConversationIds } }]
              : []),
          ],
        },
        select: { id: true },
      })
    : [];

  const conversationIds = conversations.map((conversation) => conversation.id);
  const taxRecords = records.filter((record) => FINANCE_MODULES.has(record.moduleId));
  const personalRecords = records.filter((record) => !FINANCE_MODULES.has(record.moduleId));
  const now = new Date();
  const errors: string[] = [];

  const summary = await prisma.$transaction(async (tx) => {
    const deletedConversations = conversationIds.length
      ? await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } })
      : { count: 0 };

        const deletedCalls = callIds.length
      ? await tx.callLog.deleteMany({ where: { organizationId, id: { in: callIds } } })
      : { count: 0 };

    const deletedConsents = email || consentIds.length
      ? await tx.consentRecord.deleteMany({
          where: {
            organizationId,
            OR: [
              ...(email ? [{ contactEmail: { equals: email, mode: "insensitive" as const } }] : []),
              ...(consentIds.length ? [{ id: { in: consentIds } }] : []),
            ],
          },
        })
      : { count: 0 };

    const deletedOutbox = email
      ? await tx.emailOutbox.deleteMany({
          where: { organizationId, to: { equals: email, mode: "insensitive" } },
        })
      : { count: 0 };

    const deletedTasks = recordIds.length
      ? await tx.task.deleteMany({ where: { organizationId, relatedRecordId: { in: recordIds } } })
      : { count: 0 };

    const deletedNotifications = recordIds.length
      ? await tx.notification.deleteMany({
          where: { organizationId, recordId: { in: recordIds } },
        })
      : { count: 0 };

    if (attachments.length) {
      await tx.attachment.deleteMany({ where: { id: { in: attachments.map((a) => a.id) } } });
    }

    /*
     * The contact fields go for every record. The display name survives only
     * on a tax invoice, where the buyer's legal identity is part of the
     * statutory document the agency must retain; the contact details still go.
     */
    if (personalRecords.length) {
      await tx.record.updateMany({
        where: { id: { in: personalRecords.map((record) => record.id) } },
        data: {
          name: "Erased contact",
          detail: "",
          destination: "",
          email: "",
          phone: "",
          notes: "",
          extra: "{}",
          meta: JSON.stringify({ erased: true, erasedAt: now.toISOString() }),
          // Leads/customers disappear from the workspace; the row stays so the
          // audit trail and any invoice that referenced it still resolve.
          deletedAt: now,
        },
      });
    }
    if (taxRecords.length) {
      await tx.record.updateMany({
        where: { id: { in: taxRecords.map((record) => record.id) } },
        data: {
          email: "",
          phone: "",
          notes: "",
          extra: "{}",
          meta: JSON.stringify({
            erased: true,
            erasedAt: now.toISOString(),
            retainedForTax: true,
          }),
        },
      });
    }

    return {
      recordsErased: records.length,
      retainedForTax: taxRecords.length,
      conversationsDeleted: deletedConversations.count,
      callLogsDeleted: deletedCalls.count,
      consentRowsDeleted: deletedConsents.count,
      queuedEmailsDeleted: deletedOutbox.count,
      tasksDeleted: deletedTasks.count,
      notificationsDeleted: deletedNotifications.count,
    };
  });

  // Files are removed after the database commit: a failed transaction must not
  // leave attachment rows pointing at missing files.
  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  let filesDeleted = 0;
  for (const attachment of attachments) {
    const target = path.resolve(uploadDir, attachment.storedName);
    if (!target.startsWith(uploadDir + path.sep)) {
      errors.push(`Skipped unsafe attachment path for ${attachment.id}`);
      continue;
    }
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
      filesDeleted += 1;
    } catch (error) {
      errors.push(`Could not delete file ${attachment.id}: ${(error as Error).message}`);
    }
  }

  const requestId = `erasure_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await recordAudit({
    organizationId,
    action: "Erased",
    moduleId: "customers",
    label: `Customer erasure request ${requestId}: ${summary.recordsErased} record(s)`,
    meta: {
      requestId,
      reason: input.reason ?? "",
      matchedBy: input.recordId ? "recordId" : input.email ? "email" : "phone",
      ...summary,
      filesDeleted,
      errors: errors.length,
    },
    req,
  });

  return {
    requestId,
    recordsMatched: records.length,
    ...summary,
    filesDeleted,
    errors,
  };
}
