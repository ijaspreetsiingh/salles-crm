import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "../config/env";
import { BadRequestError } from "../lib/errors";

/**
 * Outbound webhook delivery.
 *
 * A webhook URL is attacker-controlled (any workspace admin can type it), so
 * it must never be allowed to reach loopback, link-local metadata or a private
 * network. The signature is an HMAC of the body, not a reusable static secret,
 * so a receiver can verify authenticity and reject replays.
 */

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/** True for loopback, link-local, private and metadata addresses. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h === "metadata.google.internal" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) {
    return true;
  }
  const version = isIP(h);
  if (version === 4) return PRIVATE_V4.some((rule) => rule.test(h));
  if (version === 6) {
    return (
      h === "::1" ||
      h === "::" ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("fe80") ||
      h.startsWith("::ffff:127.") ||
      h.startsWith("::ffff:10.") ||
      h.startsWith("::ffff:192.168.")
    );
  }
  return false;
}

/** Rejects a URL that is not a public HTTPS endpoint. */
export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestError("Enter a valid webhook URL");
  }
  const localHttp =
    env.NODE_ENV !== "production" && url.protocol === "http:" && isBlockedHost(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new BadRequestError("Webhook URLs must use HTTPS");
  }
  if (url.username || url.password) {
    throw new BadRequestError("Webhook URLs cannot contain credentials");
  }
  if (isBlockedHost(url.hostname)) {
    throw new BadRequestError("That address is not reachable from the public internet");
  }
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.some((entry) => isBlockedHost(entry.address))) {
    throw new BadRequestError("That address is not reachable from the public internet");
  }
  return url;
}

/** `t=<unix>,v1=<hmac-sha256(secret, t + "." + body)>` */
export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export type WebhookResult = { ok: boolean; status: number | null };

/** Delivers one signed payload with a hard timeout. Never throws. */
export async function deliverWebhook(
  url: string,
  secret: string,
  body: string,
  extraHeaders: Record<string, string> = {},
): Promise<WebhookResult> {
  try {
    await assertSafeWebhookUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        "X-Traveldesk-Signature": signWebhook(secret, body),
        ...extraHeaders,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: null };
  }
}
