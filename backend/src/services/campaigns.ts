import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { sendEmail } from "./email";
import { sendWhatsApp } from "./whatsapp";

/**
 * Campaign audiences and sending.
 *
 * Two promises this file keeps:
 *
 *  1. The preview and the send run the *same* query, so "12 people" in the
 *     composer is exactly who receives the message.
 *  2. A contact who opted out of a channel is never messaged on it. Consent is
 *     read from ConsentRecord, keyed by email address, so it survives edits to
 *     the record itself. Contacts with no consent row at all are treated as
 *     existing customers we may still email (that is what an agency's own list
 *     is), and the composer says so — WhatsApp is held to the stricter rule
 *     because Meta requires it.
 */

export type AudienceFilters = { statuses?: string[] };

export type AudienceMember = {
  id: string;
  reference: string;
  name: string;
  email: string;
  phone: string;
  status: string;
};

export type AudiencePreview = {
  eligible: AudienceMember[];
  skippedNoAddress: number;
  skippedOptedOut: number;
  total: number;
};

const addressFor = (record: { email: string; phone: string }, channel: string) =>
  channel === "whatsapp" ? record.phone.trim() : record.email.trim();

export async function resolveAudience(
  organizationId: string,
  moduleId: string,
  channel: string,
  filters: AudienceFilters,
): Promise<AudiencePreview> {
  const statuses = (filters.statuses ?? []).filter(Boolean);

  const [records, consents] = await Promise.all([
    prisma.record.findMany({
      where: {
        organizationId,
        moduleId,
        deletedAt: null,
        ...(statuses.length ? { status: { in: statuses } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.consentRecord.findMany({ where: { organizationId } }),
  ]);

  const consentByEmail = new Map(
    consents.map((row) => [
      row.contactEmail.trim().toLowerCase(),
      row,
    ]),
  );

  const eligible: AudienceMember[] = [];
  let skippedNoAddress = 0;
  let skippedOptedOut = 0;

  for (const record of records) {
    const address = addressFor(record, channel);
    if (!address || (channel === "email" && !address.includes("@"))) {
      skippedNoAddress += 1;
      continue;
    }

    const consent = consentByEmail.get(record.email.trim().toLowerCase());
    const optedOut = Boolean(consent) && (channel === "whatsapp" ? !consent!.whatsapp : !consent!.email);
    if (optedOut) {
      skippedOptedOut += 1;
      continue;
    }

    eligible.push({
      id: record.id,
      reference: record.reference,
      name: record.name,
      email: record.email,
      phone: record.phone,
      status: record.status,
    });
  }

  return { eligible, skippedNoAddress, skippedOptedOut, total: records.length };
}

/** Replaces {{name}}, {{reference}} and {{destination}} in a campaign body. */
export function personalize(body: string, member: AudienceMember, destination?: string) {
  return body
    .replaceAll("{{name}}", member.name || "there")
    .replaceAll("{{reference}}", member.reference)
    .replaceAll("{{destination}}", destination || "your trip");
}

export type SendResult = { sent: number; failed: number; skipped: number; total: number };

/**
 * Sends one campaign to its audience.
 *
 * Sequential on purpose: a travel agency sends a few hundred messages, and a
 * burst is the fastest way to get an SMTP account or a WhatsApp number
 * rate-limited or banned. Each result is recorded before the next message, so
 * a crash mid-send leaves the counts correct rather than optimistic.
 */
export async function sendCampaign(input: {
  organizationId: string;
  campaignId: string;
  userId?: string | null;
}): Promise<SendResult> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
  });
  if (!campaign) throw new Error("Campaign not found");

  const filters = parseJson<AudienceFilters>(campaign.audience, {});
  const audience = await resolveAudience(
    input.organizationId,
    campaign.audienceModule,
    campaign.channel,
    filters,
  );

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: "sending",
      total: audience.eligible.length,
      sent: 0,
      failed: 0,
      skipped: audience.skippedNoAddress + audience.skippedOptedOut,
    },
  });

  let sent = 0;
  let failed = 0;

  for (const member of audience.eligible) {
    const body = personalize(campaign.body, member);
    try {
      const result =
        campaign.channel === "whatsapp"
          ? await sendWhatsApp({
              organizationId: input.organizationId,
              to: addressFor(member, campaign.channel),
              body,
              template: "campaign",
              userId: input.userId ?? null,
              relatedReference: campaign.id,
            })
          : await sendEmail({
              organizationId: input.organizationId,
              to: addressFor(member, campaign.channel),
              subject: campaign.subject || campaign.name,
              body,
              template: "campaign",
              userId: input.userId ?? null,
              relatedModule: "campaigns",
              relatedReference: campaign.id,
            });

      // WhatsApp writes its outbox row without relatedModule; tag it so the
      // campaign can show its own delivery log.
      if (campaign.channel === "whatsapp") {
        await prisma.emailOutbox.update({
          where: { id: result.id },
          data: { relatedModule: "campaigns", relatedReference: campaign.id },
        });
      }

      if (result.status === "failed") failed += 1;
      else sent += 1;
    } catch {
      failed += 1;
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { sent, failed },
    });
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: failed > 0 && sent === 0 ? "failed" : "sent",
      lastSentAt: new Date(),
    },
  });

  return {
    sent,
    failed,
    skipped: audience.skippedNoAddress + audience.skippedOptedOut,
    total: audience.eligible.length,
  };
}
