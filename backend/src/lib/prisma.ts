import { PrismaClient } from "@prisma/client";
import { isProd } from "../config/env";

// A single Prisma client for the whole process. In dev we keep it on globalThis
// so tsx watch reloads don't exhaust SQLite connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["error"] : ["error", "warn"],
  });

if (!isProd) globalForPrisma.prisma = prisma;

/** Enables SQLite foreign-key enforcement + WAL for concurrent reads. */
export async function initDatabase(): Promise<void> {
  // PRAGMA statements return rows on SQLite, so they must run as queries.
  await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
}
