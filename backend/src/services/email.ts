import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "../lib/prisma";
import { stringifyJson } from "../lib/utils";
import { resolveEmailAccount } from "./channels";
import { eventEmailSent } from "./timeline";

/**
 * Real email delivery with a safe fallback.
 *
 * When SMTP is configured (the organisation's own app-password account, or the
 * server env), mail goes out through nodemailer. When it is not, every message
 * is still written to the outbox table as "queued", so the UI always tells the
 * truth about what happened to an email.
 */
export async function smtpConfigured(organizationId?: string): Promise<boolean> {
  return Boolean(await resolveEmailAccount(organizationId));
}

/** Cache transporters per SMTP account so Gmail etc. stay alive between sends. */
const transporters = new Map<string, Transporter>();

function getTransporter(account: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}): Transporter {
  const key = `${account.host}:${account.port}:${account.user}`;
  let transport = transporters.get(key);
  if (!transport) {
    transport = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure,
      auth: { user: account.user, pass: account.pass },
    });
    transporters.set(key, transport);
  }
  return transport;
}

export type OutboxEmail = {
  organizationId: string;
  to: string;
  subject: string;
  body: string;
  template?: string;
  userId?: string | null;
  relatedModule?: string | null;
  relatedReference?: string;
};

/** Sends (or queues) an email and always records the outcome in the outbox. */
export async function sendEmail(input: OutboxEmail): Promise<{ status: string; id: string }> {
  const row = await prisma.emailOutbox.create({
    data: {
      organizationId: input.organizationId,
      channel: "email",
      to: input.to,
      subject: input.subject,
      body: input.body,
      template: input.template ?? null,
      userId: input.userId ?? null,
      relatedModule: input.relatedModule ?? null,
      relatedReference: input.relatedReference ?? "",
      status: "queued",
    },
  });

  const account = await resolveEmailAccount(input.organizationId);
  if (!account) {
    return { status: "queued", id: row.id };
  }

  try {
    const info = await getTransporter(account).sendMail({
      from: account.from || account.user,
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#17191a">\n${input.body
        .split("\n")
        .map((line) => `<p style="margin:0 0 8px">${escapeHtml(line) || "&nbsp;"}</p>`)
        .join("\n")}\n</div>`,
    });
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: "sent", sentAt: new Date(), providerRef: info.messageId },
    });
    // Timeline: write an email event on the linked record when a module-linked
    // email is sent (invoice emails, quotation emails, campaign emails).
    if (input.relatedModule && input.relatedReference) {
      const record = await prisma.record.findFirst({
        where: {
          organizationId: input.organizationId,
          moduleId: input.relatedModule,
          reference: input.relatedReference,
          deletedAt: null,
        },
        select: { id: true },
      }).catch(() => null);
      if (record) {
        void eventEmailSent(
          input.organizationId,
          record.id,
          input.to,
          input.subject,
          "sent",
          input.userId ?? null,
          "System",
        );
      }
    }
    return { status: "sent", id: row.id };
  } catch (error) {
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : stringifyJson(error),
      },
    });
    return { status: "failed", id: row.id };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
