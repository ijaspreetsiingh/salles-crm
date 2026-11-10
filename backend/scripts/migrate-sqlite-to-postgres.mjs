#!/usr/bin/env node
/**
 * One-shot helper: copy a SQLite Traveldesk database into a PostgreSQL one.
 *
 * Usage:
 *   SQLITE_URL="file:./data/traveldesk.db" \
 *   POSTGRES_URL="postgres://user:pass@host:5432/traveldesk" \
 *   node scripts/migrate-sqlite-to-postgres.mjs
 *
 * It dumps the SQLite file with the `sqlite3` CLI (must be installed) and
 * replays it against Postgres using `psql`. For a fully managed migration use
 * `prisma migrate deploy` after switching DATABASE_PROVIDER=postgres.
 */
import { execSync } from "node:child_process";

const sqliteUrl = process.env.SQLITE_URL || "file:./data/traveldesk.db";
const pgUrl = process.env.POSTGRES_URL;
if (!pgUrl) {
  console.error("POSTGRES_URL is required");
  process.exit(1);
}

const sqliteFile = sqliteUrl.replace(/^file:/, "");
console.log(`[migrate] source: ${sqliteFile}`);
console.log(`[migrate] target: ${pgUrl}`);

try {
  execSync(`sqlite3 "${sqliteFile}" ".dump" > /tmp/traveldesk.dump.sql`, { stdio: "inherit" });
  execSync(`psql "${pgUrl}" -f /tmp/traveldesk.dump.sql`, { stdio: "inherit" });
  console.log("[migrate] done");
} catch (err) {
  console.error("[migrate] failed:", err.message);
  process.exit(1);
}