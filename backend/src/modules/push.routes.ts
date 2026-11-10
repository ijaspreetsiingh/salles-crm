/**
 * Browser Push Notifications — VAPID-based Web Push.
 *
 * GET  /push/vapid-key          Public VAPID key for the frontend SW
 * POST /push/subscribe           Save a push subscription for this user/device
 * DELETE /push/subscribe         Remove subscription (logout / unsubscribe)
 * POST /push/test                Send a test push to the signed-in user
 *
 * Internal helper: sendPushToUser(userId, payload) — used by socket.ts,
 * team-chat, and notifications service to send when the tab is hidden.
 */

import { Router } from "express";
import { z } from "zod";
import webpush from "web-push";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { env } from "../config/env";
import { logger } from "../lib/logger";

const router = Router();

function vapidConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

if (vapidConfigured()) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

// ── Public VAPID key — no auth needed, browser needs it to subscribe ─────────
router.get(
  "/vapid-key",
  asyncHandler(async (_req, res) => {
    return ok(res, {
      configured: vapidConfigured(),
      publicKey: env.VAPID_PUBLIC_KEY || null,
    });
  }),
);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// ── Save subscription ─────────────────────────────────────────────────────────
router.post(
  "/subscribe",
  requireAuth,
  validate(subscribeSchema),
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body as z.infer<typeof subscribeSchema>;
    const { userId, organizationId } = req.auth!;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        organizationId,
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.header("user-agent") ?? "",
      },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    return created(res, { subscribed: true });
  }),
);

// ── Remove subscription ───────────────────────────────────────────────────────
router.delete(
  "/subscribe",
  requireAuth,
  validate(z.object({ endpoint: z.string().url() })),
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body as { endpoint: string };
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.auth!.userId },
    });
    return ok(res, { unsubscribed: true });
  }),
);

// ── Test push ─────────────────────────────────────────────────────────────────
router.post(
  "/test",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!vapidConfigured()) {
      return ok(res, { sent: false, reason: "VAPID keys not configured" });
    }
    const count = await sendPushToUser(req.auth!.userId, {
      title: "Traveldesk",
      body: "Push notifications are working!",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "test",
    });
    return ok(res, { sent: count > 0, devices: count });
  }),
);

// ── Internal helper — send to all devices for one user ───────────────────────
export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    url?: string;
    data?: Record<string, unknown>;
  },
): Promise<number> {
  if (!vapidConfigured()) return 0;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  const json = JSON.stringify(payload);
  let sent = 0;
  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          staleEndpoints.push(sub.endpoint);
        } else {
          logger.warn({ err, endpoint: sub.endpoint }, "Push notification failed");
        }
      }
    }),
  );

  if (staleEndpoints.length) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  return sent;
}

// ── Send to entire org ────────────────────────────────────────────────────────
export async function sendPushToOrg(
  organizationId: string,
  excludeUserId: string | null,
  payload: Parameters<typeof sendPushToUser>[1],
): Promise<number> {
  if (!vapidConfigured()) return 0;

  const subs = await prisma.pushSubscription.findMany({
    where: {
      organizationId,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  let total = 0;
  for (const { userId } of subs) {
    total += await sendPushToUser(userId, payload);
  }
  return total;
}

export default router;
