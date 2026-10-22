import { prisma } from "../lib/prisma";
import { env } from "../config/env";

/**
 * WhatsApp Business Cloud API (Meta Graph) with the same honesty model as
 * email: when credentials exist the message is delivered for real, otherwise
 * it is recorded as "queued" so the UI never lies about a send.
 */
export function whatsappConfigured(): boolean {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsApp(input: {
  organizationId: string;
  to: string;
  body: string;
  template?: string;
  userId?: string | null;
  relatedReference?: string;
}): Promise<{ status: string; id: string }> {
  const row = await prisma.emailOutbox.create({
    data: {
      organizationId: input.organizationId,
      channel: "whatsapp",
      to: input.to,
      subject: "",
      body: input.body,
      template: input.template ?? null,
      userId: input.userId ?? null,
      relatedReference: input.relatedReference ?? "",
      status: "queued",
    },
  });

  if (!whatsappConfigured()) return { status: "queued", id: row.id };

  try {
    // Meta stores numbers without "+".
    const msisdn = input.to.replace(/[^\d]/g, "");
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msisdn,
          type: "text",
          text: { body: input.body },
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { messages?: Array<{ id: string }>; error?: { message?: string } }
      | null;

    if (!response.ok) {
      const detail = payload?.error?.message ?? `WhatsApp API returned ${response.status}`;
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: "failed", error: detail },
      });
      return { status: "failed", id: row.id };
    }

    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: "sent", sentAt: new Date(), providerRef: payload?.messages?.[0]?.id },
    });
    return { status: "sent", id: row.id };
  } catch (error) {
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: "failed", error: error instanceof Error ? error.message : String(error) },
    });
    return { status: "failed", id: row.id };
  }
}
