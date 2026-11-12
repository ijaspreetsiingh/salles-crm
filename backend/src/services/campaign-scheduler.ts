/**
 * Scheduled Campaigns Scheduler
 *
 * Polls every 2 minutes for campaigns whose `scheduledFor` has passed and
 * status is still "scheduled". Claims each one atomically (status → sending)
 * before firing, so multiple nodes cannot double-send the same campaign.
 *
 * Why 2 minutes:
 *   - Travel agencies send campaigns at human-scale times ("9 AM Thursday").
 *   - A 2-minute drift is invisible to users.
 *   - Polling the DB every 30 s for campaigns is wasteful; every 5 min feels
 *     too coarse when someone schedules for "right now +3 min".
 */
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { sendCampaign } from "./campaigns";

const POLL_MS = 2 * 60 * 1000; // 2 minutes

export async function runScheduledCampaigns(): Promise<void> {
  const now = new Date();

  // Find all campaigns that are due and have not started yet.
  const due = await prisma.campaign.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lte: now },
    },
    select: { id: true, organizationId: true, name: true },
  });

  if (due.length === 0) return;

  logger.info({ count: due.length }, "Scheduled campaigns due — starting sends");

  for (const campaign of due) {
    // Atomic claim: only the node that changes status from "scheduled" to
    // "sending" actually sends. The second node sees 0 rows updated and skips.
    const claimed = await prisma.campaign.updateMany({
      where: { id: campaign.id, status: "scheduled" },
      data: { status: "sending" },
    });

    if (claimed.count === 0) {
      // Another process already picked this one up.
      continue;
    }

    logger.info({ campaignId: campaign.id, name: campaign.name }, "Sending scheduled campaign");

    // Fire-and-forget: the send is long-running. If it throws, mark failed.
    sendCampaign({
      organizationId: campaign.organizationId,
      campaignId: campaign.id,
    }).catch(async (err: unknown) => {
      logger.error({ err, campaignId: campaign.id }, "Scheduled campaign failed");
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "failed" },
      }).catch(() => { /* best effort */ });
    });
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startCampaignScheduler(): void {
  // Run once shortly after boot to catch campaigns that were due while the
  // server was down (e.g. a 3 AM restart during a 3:05 AM send).
  setTimeout(() => {
    runScheduledCampaigns().catch((err) =>
      logger.warn({ err }, "Campaign scheduler initial run failed"),
    );
  }, 30_000);

  timer = setInterval(() => {
    runScheduledCampaigns().catch((err) =>
      logger.warn({ err }, "Campaign scheduler poll failed"),
    );
  }, POLL_MS);

  logger.info({ pollMs: POLL_MS }, "Campaign scheduler started");
}

export function stopCampaignScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
