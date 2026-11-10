import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { parseJson, stringifyJson } from "../lib/utils";
import { deliverWebhook } from "./webhooks";

/**
 * Outbound webhook fan-out.
 *
 * A webhook is a contract with somebody else's system: "tell me when a booking
 * is confirmed". So a delivery must be durable (it is a row before it is a
 * request), idempotent (one event, one delivery per endpoint, even if the job
 * runs twice) and retried with backoff, because the receiver being down for a
 * minute must not silently lose a booking.
 */

/** Backoff schedule in minutes; the last entry repeats. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240, 720];
const MAX_ATTEMPTS = 8;

const backoffFor = (attempts: number) =>
  new Date(
    Date.now() + (BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)] ?? 720) * 60_000,
  );

export type WebhookEvent = {
  organizationId: string;
  /** e.g. "record.created", "booking.confirmed", "payment.received". */
  event: string;
  /** The JSON body the receiver gets, under `data`. */
  data: Record<string, unknown>;
  /**
   * Stable id for this occurrence of the event. Two deliveries for the same
   * endpoint + key are the same event, so a retried job cannot double-send.
   */
  dedupeKey: string;
};

/**
 * Queues (and immediately attempts) one event for every subscribed endpoint.
 * Never throws: callers are record writes that must not fail because a
 * customer's endpoint is down.
 */
export async function dispatchWebhookEvent(input: WebhookEvent): Promise<number> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { organizationId: input.organizationId, active: true },
      select: { id: true, url: true, secret: true, events: true },
    });

    const subscribed = webhooks.filter((webhook) =>
      parseJson<string[]>(webhook.events, []).includes(input.event),
    );
    if (subscribed.length === 0) return 0;

    const body = stringifyJson({
      event: input.event,
      organizationId: input.organizationId,
      sentAt: new Date().toISOString(),
      data: input.data,
    });

    let queued = 0;
    for (const webhook of subscribed) {
      // `createMany({ skipDuplicates })` makes the idempotency key cheap: a
      // duplicate event simply does not create a second row.
      const created = await prisma.webhookDelivery.createMany({
        data: [
          {
            webhookId: webhook.id,
            event: input.event,
            status: "pending",
            payload: body,
            dedupeKey: input.dedupeKey,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count === 0) continue; // already queued for this endpoint
      queued += 1;

      const delivery = await prisma.webhookDelivery.findFirst({
        where: { webhookId: webhook.id, dedupeKey: input.dedupeKey },
        select: { id: true },
      });
      if (delivery) void attemptDelivery(delivery.id);
    }
    return queued;
  } catch (error) {
    logger.warn({ err: error, event: input.event }, "Could not queue webhook event");
    return 0;
  }
}

/** Sends one queued delivery and records the outcome, or schedules a retry. */
export async function attemptDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: { select: { url: true, secret: true, active: true } } },
  });
  if (!delivery || delivery.status === "success") return;
  if (!delivery.webhook.active) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", nextAttemptAt: null },
    });
    return;
  }

  const attempts = delivery.attempts + 1;
  const result = await deliverWebhook(
    delivery.webhook.url,
    delivery.webhook.secret,
    delivery.payload || "{}",
    { "X-Traveldesk-Event": delivery.event, "X-Traveldesk-Attempt": String(attempts) },
  );

  if (result.ok) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "success",
        responseCode: result.status,
        attempts,
        nextAttemptAt: null,
      },
    });
    return;
  }

  const exhausted = attempts >= MAX_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: exhausted ? "failed" : "pending",
      responseCode: result.status,
      attempts,
      nextAttemptAt: exhausted ? null : backoffFor(attempts),
    },
  });
  if (!exhausted) {
    logger.info(
      { deliveryId: delivery.id, attempts, event: delivery.event },
      "Webhook delivery failed; retry scheduled",
    );
  }
}

let retryTimer: ReturnType<typeof setInterval> | null = null;

/** Starts the retry loop. Safe to call once, on boot. */
export function startWebhookScheduler(intervalMs = 60_000): void {
  if (retryTimer) return;
  const tick = () => {
    void drainWebhookRetries().catch((error) =>
      logger.error({ err: error }, "Webhook retry drain failed"),
    );
  };
  retryTimer = setInterval(tick, intervalMs);
  retryTimer.unref?.();
  setTimeout(tick, 15_000).unref?.();
  logger.info({ everyMs: intervalMs }, "Webhook retry scheduler started");
}

export function stopWebhookScheduler(): void {
  if (retryTimer) clearInterval(retryTimer);
  retryTimer = null;
}

/**
 * Retries everything that is due. The scheduler calls this on a timer, and it
 * is safe to call from several workers at once because each delivery is
 * claimed with a conditional update before it is sent.
 */
export async function drainWebhookRetries(limit = 25): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true, attempts: true },
  });

  let sent = 0;
  for (const delivery of due) {
    // Claim: only the worker that moves `nextAttemptAt` forward sends it.
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, attempts: delivery.attempts, status: "pending" },
      data: { nextAttemptAt: new Date(Date.now() + 60_000) },
    });
    if (claimed.count === 0) continue;
    await attemptDelivery(delivery.id);
    sent += 1;
  }
  return sent;
}
