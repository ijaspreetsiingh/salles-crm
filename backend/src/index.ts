import http from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { initDatabase, prisma } from "./lib/prisma";
import { seed } from "./db/seed";
import { startDigestScheduler, stopDigestScheduler } from "./services/digest";
import { startFollowUpScheduler, stopFollowUpScheduler } from "./services/followups";
import { startWebhookScheduler, stopWebhookScheduler } from "./services/webhook-dispatch";
import { startCampaignScheduler, stopCampaignScheduler } from "./services/campaign-scheduler";
import {
  startWorkflowRetryScheduler,
  stopWorkflowRetryScheduler,
} from "./services/workflow-runs";
import { captureException, sentryEnabled } from "./services/sentry";
import { alertInBackground, alertingEnabled } from "./services/alerting";
import { initSocket } from "./lib/socket";

async function bootstrap() {
  await initDatabase();

  if (env.SEED_ON_START) {
    try {
      await seed();
    } catch (error) {
      logger.warn(
        { err: error },
        "Auto-seed skipped — run `npm run prisma:push` first if the database is empty.",
      );
    }
  }

  /*
   * A campaign is sent by this process. If the process died mid-send there is
   * no worker left to finish it, so the row must not keep claiming "sending"
   * forever. Mark them failed; the composer can resend, and resend skips
   * anyone who already received the message.
   *
   * Only the scheduler leader does this: on a second node this would fail a
   * campaign that is actively sending right now.
   */
  if (env.RUN_SCHEDULERS) {
    try {
      const stuck = await prisma.campaign.updateMany({
        where: { status: "sending" },
        data: { status: "failed" },
      });
      if (stuck.count > 0) {
        logger.warn({ count: stuck.count }, "Marked interrupted campaigns as failed");
      }
    } catch (error) {
      logger.warn({ err: error }, "Could not reset interrupted campaigns");
    }
  }

  const app = createApp();
  const server = http.createServer(app);

  // Says out loud what is and is not watching this deployment. A self-hosted
  // install with no Sentry DSN and no alert webhook should know that before an
  // incident, not during one.
  logger.info(
    {
      errorReporting: sentryEnabled() ? "sentry" : "logs only",
      alerting: alertingEnabled() ? "webhook" : "logs only",
      malwareScanning: env.CLAMAV_HOST ? "clamav" : "eicar signature only",
    },
    "Monitoring status",
  );

  // Real-time layer — socket.io attaches to the same HTTP server so no extra
  // port or proxy rule is needed.
  initSocket(server);

  // The daily email digest runs in this process: there is no queue or cron to
  // install, which is the point — a small agency should not need Redis to get
  // a morning email. On several nodes only the leader runs schedulers
  // (RUN_SCHEDULERS=false on the rest) so nothing is sent twice.
  if (env.RUN_SCHEDULERS) {
    startDigestScheduler();
    startFollowUpScheduler();
    startWebhookScheduler();
    // Picks up campaigns scheduled for a future time and fires them when due.
    startCampaignScheduler();
    // Retries automations that failed, and dead-letters the ones that ran out
    // of attempts. Claiming is atomic, but the leader still owns the loop.
    startWorkflowRetryScheduler();
  } else {
    logger.info("In-process schedulers disabled (RUN_SCHEDULERS=false)");
  }

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `Traveldesk API listening on http://localhost:${env.PORT}/api/v1`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    stopDigestScheduler();
    stopFollowUpScheduler();
    stopWebhookScheduler();
    stopCampaignScheduler();
    stopWorkflowRetryScheduler();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled rejection");
    void captureException(reason, { kind: "unhandledRejection" }).catch(() => undefined);
    alertInBackground({
      key: "process:unhandledRejection",
      title: "A background task failed without a handler",
      body: reason instanceof Error ? reason.message : String(reason),
      level: "warning",
    });
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    // Report first, then die: a crash with no trace is the worst kind.
    void captureException(error, { kind: "uncaughtException" }).catch(() => undefined);
    alertInBackground({
      key: "process:uncaughtException",
      title: "The API crashed and is restarting",
      body: error.message,
      level: "critical",
    });
    setTimeout(() => process.exit(1), 500);
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});
