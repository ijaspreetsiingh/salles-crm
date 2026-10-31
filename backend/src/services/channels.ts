import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { parseJson } from "../lib/utils";

/**
 * Per-organisation delivery channels.
 *
 * A travel company sets up their OWN email (Gmail app password, Zoho, Outlook…)
 * and their own WhatsApp Cloud credentials — the same env fallback the platform
 * ships with stays as a last resort. Org settings win; env is the default.
 */
export type ChannelEmail = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export type ChannelWhatsApp = {
  token: string;
  phoneNumberId: string;
};

export type ChannelRazorpay = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

type ChannelSettings = {
  email: Partial<ChannelEmail>;
  whatsapp: Partial<ChannelWhatsApp>;
  razorpay: Partial<ChannelRazorpay>;
};

export type LoadedChannels = Partial<ChannelSettings>;

export async function loadChannelSettings(organizationId?: string): Promise<LoadedChannels> {
  if (!organizationId) return {};
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!organization) return {};
  const parsed = parseJson<{ channels?: LoadedChannels }>(organization.settings, {});
  return parsed.channels ?? {};
}

/** The SMTP account to send with: organisation settings override env. */
export async function resolveEmailAccount(
  organizationId?: string,
): Promise<ChannelEmail | null> {
  const channels = await loadChannelSettings(organizationId);
  const orgEmail = channels.email;
  if (orgEmail?.host && orgEmail?.user && orgEmail?.pass) {
    return {
      host: orgEmail.host,
      port: Number(orgEmail.port) || 587,
      secure: Boolean(orgEmail.secure),
      user: orgEmail.user,
      pass: orgEmail.pass,
      from: orgEmail.from || orgEmail.user,
    };
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    return {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
      from: env.SMTP_FROM || env.SMTP_USER,
    };
  }
  return null;
}

/** The WhatsApp Cloud account to send with: organisation settings override env. */
export async function resolveWhatsAppAccount(
  organizationId?: string,
): Promise<ChannelWhatsApp | null> {
  const channels = await loadChannelSettings(organizationId);
  const orgWa = channels.whatsapp;
  if (orgWa?.token && orgWa?.phoneNumberId) {
    return { token: orgWa.token, phoneNumberId: orgWa.phoneNumberId };
  }
  if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    return { token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID };
  }
  return null;
}

export type ChannelStatus = {
  configured: boolean;
  /** Where the credentials come from: the org's own settings, or server env. */
  source: "settings" | "env" | "none";
  /** Masked description for the UI (host/user or phone number id). */
  detail: string;
};

export function describeEmailAccount(account: ChannelEmail | null): ChannelStatus {
  if (!account) return { configured: false, source: "none", detail: "" };
  const fromEnv = !env.SMTP_HOST || account.user !== env.SMTP_USER;
  return {
    configured: true,
    source: fromEnv ? "settings" : "env",
    detail: `${account.host}:${account.port} · ${account.user}`,
  };
}

/** The Razorpay account to collect payments with: organisation settings override env. */
export async function resolveRazorpayAccount(
  organizationId?: string,
): Promise<ChannelRazorpay | null> {
  const channels = await loadChannelSettings(organizationId);
  const orgRz = channels.razorpay;
  if (orgRz?.keyId && orgRz?.keySecret) {
    return {
      keyId: orgRz.keyId,
      keySecret: orgRz.keySecret,
      webhookSecret: orgRz.webhookSecret ?? "",
    };
  }
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    return {
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? "",
    };
  }
  return null;
}

export function describeRazorpayAccount(
  account: ChannelRazorpay | null,
): { configured: boolean; source: "settings" | "env" | "none"; detail: string } {
  if (!account) return { configured: false, source: "none", detail: "" };
  const fromEnv = account.keyId === env.RAZORPAY_KEY_ID;
  return {
    configured: true,
    source: fromEnv ? "env" : "settings",
    detail: `Key ID: ${account.keyId}`,
  };
}

export function describeWhatsAppAccount(
  account: ChannelWhatsApp | null,
  organizationId?: string,
): ChannelStatus {
  if (!account) return { configured: false, source: "none", detail: "" };
  const fromEnv = account.phoneNumberId === env.WHATSAPP_PHONE_NUMBER_ID;
  void organizationId;
  return {
    configured: true,
    source: fromEnv ? "env" : "settings",
    detail: `WhatsApp number ${account.phoneNumberId}`,
  };
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}
