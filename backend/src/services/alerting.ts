import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Optional alert webhook.
 *
 * Sentry (when configured) collects the error; this tells a person. A small
 * team does not run a pager, but they do have a Slack or Teams channel, so the
 * alert is a plain `{ text }` POST that every one of them understands. With no
 * `ALERT_WEBHOOK_URL` every function here is a no-op and errors stay in logs.
 *
 * Alerts are throttled per title: an endpoint that fails on every request would
 * otherwise post thousands of identical messages and get the webhook muted,
 * which is the same as having no alerting at all.
 */

const lastSent = new Map<string, number>();
const MAX_TRACKED = 200;

export type AlertInput = {
  /** Stable identity for throttling — usually the route or the failure kind. */
  key: string;
  title: string;
  body?: string;
  level?: "warning" | "error" | "critical";
};

export function alertingEnabled(): boolean {
  return Boolean(env.ALERT_WEBHOOK_URL);
}

/** True when this key may post now; also records the send. */
function claim(key: string, now = Date.now()): boolean {
  const previous = lastSent.get(key) ?? 0;
  if (now - previous < env.ALERT_MIN_INTERVAL_MS) return false;
  if (lastSent.size >= MAX_TRACKED) lastSent.clear();
  lastSent.set(key, now);
  return true;
}

/** Forgets the throttle — used by tests and after a successful recovery. */
export function resetAlertThrottle(): void {
  lastSent.clear();
}

export async function sendAlert(input: AlertInput): Promise<boolean> {
  if (!env.ALERT_WEBHOOK_URL) return false;
  if (!claim(input.key)) return false;

  const prefix =
    input.level === "critical" ? ":rotating_light:" : input.level === "warning" ? ":warning:" : ":x:";
  const text = [prefix, input.title, input.body].filter(Boolean).join(" ");

  try {
    const response = await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "Alert webhook rejected the message");
      return false;
    }
    return true;
  } catch (error) {
    // Alerting must never be the reason a request fails.
    logger.warn({ err: error }, "Alert webhook unreachable");
    return false;
  }
}

/** Fire-and-forget variant for request paths that cannot await. */
export function alertInBackground(input: AlertInput): void {
  void sendAlert(input).catch(() => undefined);
}
