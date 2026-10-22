#!/usr/bin/env node
/**
 * SQLite backup: copies the live dev database file into data/backups/ with a
 * timestamp, keeping only the newest BACKUPS_TO_KEEP (default 14).
 *
 * Usage:  npm run db:backup
 * When running on PostgreSQL use pg_dump instead — see DEPLOY.md.
 */
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const backendDir = path.dirname(fileURLToPath(import.meta.url));
// Prisma resolves a relative `file:` URL against the schema directory, so the
// live dev database lives in prisma/data by default (data/ as a fallback).
const candidates = [
  path.join(backendDir, "..", "prisma", "data", "traveldesk.db"),
  path.join(backendDir, "..", "data", "traveldesk.db"),
];
const dbPath = (await Promise.all(
  candidates.map(async (candidate) => {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      return null;
    }
  }),
)).find(Boolean);
const backupDir = dbPath
  ? path.join(path.dirname(dbPath), "backups")
  : path.join(backendDir, "..", "data", "backups");
const keep = Number(process.env.BACKUPS_TO_KEEP ?? 14);

if (!dbPath) {
  console.error("No database file found — nothing to back up.");
  process.exit(1);
}

await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `traveldesk-${stamp}.db`);
await copyFile(dbPath, target);
// -wal / -shm sidecars come along when they exist so a backup is complete.
for (const suffix of ["-wal", "-shm"]) {
  try {
    await copyFile(dbPath + suffix, target + suffix);
  } catch {
    /* no sidecar — fine */
  }
}

const existing = (await readdir(backupDir))
  .filter((f) => f.startsWith("traveldesk-") && f.endsWith(".db"))
  .sort();
for (const stale of existing.slice(0, Math.max(0, existing.length - keep))) {
  await unlink(path.join(backupDir, stale)).catch(() => undefined);
}

console.log(`Backup written: ${target} (keeping ${keep} newest)`);
