#!/usr/bin/env node
/**
 * Switches the Prisma datasource provider between sqlite and postgres.
 *
 * Prisma requires the provider to be static, so production deployments that
 * run on PostgreSQL run:  node scripts/db-provider.mjs postgres
 * before `prisma generate` / `prisma db push`. Local development stays on
 * sqlite with:  node scripts/db-provider.mjs sqlite  (the default).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, "..", "prisma", "schema.prisma");
const lockPath = path.join(here, "..", "prisma", "migrations", "migration_lock.toml");

const target = process.argv[2];
if (target !== "sqlite" && target !== "postgres") {
  console.error("Usage: node scripts/db-provider.mjs <sqlite|postgres>");
  process.exit(1);
}

/*
 * SQLite is no longer a supported target.
 *
 * The money model is built on native `DECIMAL(14,2)` columns so a receipt, a
 * ledger total and a GST invoice agree to the paisa. Prisma rejects
 * `@db.Decimal` on the SQLite connector, so switching back leaves a schema that
 * cannot even be generated — the flip used to "succeed" and then fail hours
 * later with a confusing validation error.
 *
 * Refusing here is the honest behaviour. Existing SQLite installs move to
 * Postgres once with `scripts/migrate-sqlite-to-postgres.mjs`.
 */
if (target === "sqlite") {
  console.error(
    [
      "SQLite is not supported by this schema.",
      "",
      "Money is stored as DECIMAL(14,2) for exact arithmetic, and Prisma's SQLite",
      "connector cannot represent that native type. Use PostgreSQL:",
      "",
      "  docker compose -f docker-compose.dev.yml up -d",
      "  DATABASE_URL=postgres://traveldesk:traveldesk@localhost:5432/traveldesk npm run db:migrate",
      "",
      "Carrying an old SQLite file across? Run scripts/migrate-sqlite-to-postgres.mjs once.",
    ].join("\n"),
  );
  process.exit(1);
}

const source = await readFile(schemaPath, "utf8");
const next = source.replace(/(provider\s*=\s*")(sqlite|postgres)(")/, `$1${target}$3`);
if (next === source) {
  console.log(`schema.prisma already uses provider "${target}"`);
} else {
  await writeFile(schemaPath, next, "utf8");
  console.log(`schema.prisma provider switched to "${target}"`);
}

/*
 * Prisma also records the provider in the migrations lock file. If the two
 * disagree, `prisma migrate deploy` refuses to run — which is how a production
 * deploy fails at 2am. Keep them in step.
 */
try {
  const lock = await readFile(lockPath, "utf8");
  const nextLock = lock.replace(/(provider\s*=\s*")(sqlite|postgresql?)(")/, (_, a, _b, c) => {
    return `${a}${target === "postgres" ? "postgresql" : "sqlite"}${c}`;
  });
  if (nextLock !== lock) {
    await writeFile(lockPath, nextLock, "utf8");
    console.log("migration_lock.toml provider updated");
  }
} catch {
  console.warn("migration_lock.toml not found — run prisma migrate once to create it");
}
