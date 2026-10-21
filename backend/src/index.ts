import http from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { initDatabase, prisma } from "./lib/prisma";
import { seed } from "./db/seed";

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

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `Traveldesk API listening on http://localhost:${env.PORT}/api/v1`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled rejection"));
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});
