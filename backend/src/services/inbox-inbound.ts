import { prisma } from "../lib/prisma";
import { createNotification } from "./notifications";

/**
 * Inbound messages reach the shared inbox.
 *
 * Until now the inbox only recorded what the team sent — a customer's reply
 * went to whatever mailbox the SMTP account used and never came back. This
 * service takes an inbound email or WhatsApp message, finds the thread it
 * belongs to (by address, else by phone), and writes it as a real `in` message
 * so the next person who opens the customer sees the whole conversation.
 */

export type InboundChannel = "Email" | "WhatsApp";

export type InboundMessage = {
  organizationId: string;
  channel: InboundChannel;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  subject?: string;
  body: string;
  /** Provider-side id, used to ignore a webhook retry. */
  externalId?: string;
};

export type InboundResult = {
  conversationId: string;
  created: boolean;
  duplicate: boolean;
};

const clean = (value: unknown, max: number) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);

/** Strips HTML so a rich email body reads like a message, not tags. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const normalisePhone = (value: string) => value.replace(/[^0-9]/g, "");

export async function recordInboundMessage(input: InboundMessage): Promise<InboundResult> {
  const body = clean(input.body, 8000);
  const email = clean(input.contactEmail, 160).toLowerCase();
  const phone = normalisePhone(clean(input.contactPhone, 40));
  const name = clean(input.contactName, 120) || email || phone || "Unknown contact";

  if (!body) throw new Error("Message body is empty");

  // A webhook retry must not create a second copy of the same message.
  if (input.externalId) {
    const existing = await prisma.message.findFirst({
      where: {
        conversation: { organizationId: input.organizationId },
        meta: { contains: input.externalId },
      },
      select: { conversationId: true },
    });
    if (existing) {
      return { conversationId: existing.conversationId, created: false, duplicate: true };
    }
  }

  // Find the thread this message belongs to: same channel, same person.
  let conversation = phone || email
    ? await prisma.conversation.findFirst({
        where: {
          organizationId: input.organizationId,
          channel: input.channel,
          OR: [
            ...(email ? [{ contactEmail: email }] : []),
            ...(phone ? [{ contactPhone: { contains: phone.slice(-10) } }] : []),
          ],
        },
        orderBy: { lastMessageAt: "desc" },
      })
    : null;

  // Also link the thread to the record it is about, if the customer is on file.
  const linkedRecord =
    email || phone
      ? await prisma.record.findFirst({
          where: {
            organizationId: input.organizationId,
            deletedAt: null,
            ...(email ? { email } : { phone: { contains: phone.slice(-10) } }),
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true },
        })
      : null;

  let created = false;
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        organizationId: input.organizationId,
        channel: input.channel,
        contactName: name,
        contactEmail: email,
        contactPhone: clean(input.contactPhone, 40),
        subject: clean(input.subject, 200) || (linkedRecord ? `Enquiry — ${linkedRecord.name}` : ""),
        status: "Open",
        recordId: linkedRecord?.id ?? null,
      },
    });
    created = true;
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "in",
        channel: input.channel,
        body,
        sentByName: name,
        meta: JSON.stringify({
          externalId: input.externalId ?? null,
          subject: clean(input.subject, 200),
        }),
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        // A customer replying reopens a thread somebody had marked resolved.
        status: "Open",
        contactName: conversation.contactName === "Unknown contact" ? name : conversation.contactName,
        ...(conversation.recordId ? {} : linkedRecord ? { recordId: linkedRecord.id } : {}),
      },
    }),
  ]);

  await createNotification({
    organizationId: input.organizationId,
    title: `New ${input.channel.toLowerCase()} message from ${name}`,
    body: body.slice(0, 160),
    moduleId: "inbox",
    recordId: conversation.id,
    level: "info",
  }).catch(() => undefined);

  return { conversationId: conversation.id, created, duplicate: false };
}
