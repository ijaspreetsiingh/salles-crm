import { randomUUID } from "node:crypto";
import { env } from "../config/env";

/**
 * Optional Sentry error reporting.
 *
 * A DSN is the only switch: with no `SENTRY_DSN` this module is a no-op, so a
 * self-hosted agency needs no SaaS account. When configured, events are sent
 * through Sentry's Envelope HTTP API — no SDK dependency, no background queue,
 * and only the error plus non-PII request metadata leave the process.
 *
 * This is error reporting, not performance tracing or session replay.
 */

export type SentryConfig = {
  dsn: string;
  environment: string;
  release?: string;
};

export type SentryTarget = {
  url: string;
  publicKey: string;
};

export function parseSentryDsn(dsn: string): SentryTarget | null {
  try {
    const url = new URL(dsn);
    const publicKey = decodeURIComponent(url.username);
    const projectId = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (!publicKey || !projectId) return null;
    const protocol = url.protocol === "http:" ? "http:" : "https:";
    return {
      url: `${protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

export function buildSentryEnvelope(
  error: unknown,
  context: Record<string, unknown>,
  config: SentryConfig,
  eventId = randomUUID().replaceAll("-", ""),
): { body: string; eventId: string } {
  const err = error instanceof Error ? error : new Error(String(error));
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: Math.floor(Date.now() / 1000),
    platform: "node",
    level: "error",
    environment: config.environment,
    ...(config.release ? { release: config.release } : {}),
    exception: {
      values: [{ type: err.name || "Error", value: err.message }],
    },
    tags: {
      service: "traveldesk-api",
      ...(typeof context.requestId === "string" ? { request_id: context.requestId } : {}),
    },
    extra: context,
  };

  const body = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt }),
    JSON.stringify({ type: "event", content_type: "application/json" }),
    JSON.stringify(event),
    "",
  ].join("\n");
  return { body, eventId };
}

export type CaptureOptions = {
  dsn?: string;
  environment?: string;
  release?: string;
  fetchImpl?: typeof fetch;
};

/** Sends one exception. Never throws and never blocks a request on failure. */
export async function captureException(
  error: unknown,
  context: Record<string, unknown> = {},
  options: CaptureOptions = {},
): Promise<boolean> {
  const dsn = options.dsn ?? env.SENTRY_DSN;
  if (!dsn) return false;
  const target = parseSentryDsn(dsn);
  if (!target) return false;

  const { body } = buildSentryEnvelope(error, context, {
    dsn,
    environment: options.environment ?? (env.SENTRY_ENVIRONMENT || env.NODE_ENV),
    release: options.release ?? (env.SENTRY_RELEASE || undefined),
  });

  try {
    const response = await (options.fetchImpl ?? fetch)(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.publicKey}, sentry_client=traveldesk/1.0`,
      },
      body,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** True when error reporting is configured; useful for startup logs/health. */
export function sentryEnabled(): boolean {
  return Boolean(env.SENTRY_DSN && parseSentryDsn(env.SENTRY_DSN));
}
