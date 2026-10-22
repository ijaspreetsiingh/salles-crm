import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { stringifyJson } from "../lib/utils";

/**
 * Real email delivery with a safe fallback.
 *
 * When SMTP is configured, mail goes out through nodemailer. When it is not,
 * every message is still written to the outbox table as "queued", so the UI
 * always tells the truth about what happened to an email.
 */
export function smtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
  }
  return transporter;
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

  const transport = getTransporter();
  if (!transport) {
    return { status: "queued", id: row.id };
  }

  try {
    const info = await transport.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
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
