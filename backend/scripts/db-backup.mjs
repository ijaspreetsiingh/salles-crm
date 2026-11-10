#!/usr/bin/env node
/**
 * Traveldesk Backup Script
 *
 * Creates encrypted, timestamped backups of the database (SQLite file or a
 * PostgreSQL `pg_dump`) and the uploads directory. Keeps the N most recent
 * backups locally.
 *
 * Usage:
 *   npm run db:backup              # one-off backup
 *   # Add to crontab for daily backups:
 *   # 0 2 * * * /usr/bin/node /app/scripts/db-backup.mjs
 */

import { execSync } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { createCipheriv, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, "data");
const BACKUP_DIR = join(DATA_DIR, "backups");
const DB_FILE = join(DATA_DIR, "traveldesk.db");
const WAL_FILE = join(DATA_DIR, "traveldesk.db-wal");
const SHM_FILE = join(DATA_DIR, "traveldesk.db-shm");
const UPLOADS_DIR = join(DATA_DIR, "uploads");

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const IS_POSTGRES = /^postgres(ql)?:\/\//.test(DATABASE_URL);

// Keep the 14 most recent backups by default
const KEEP = parseInt(process.env.BACKUPS_TO_KEEP ?? "14", 10);

// Encryption key for backup files (set BACKUP_ENCRYPTION_KEY in production)
// If not set, backups are stored unencrypted (still useful for disaster recovery)
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY;

function log(message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

async function encryptFile(inputPath, outputPath) {
  if (!ENCRYPTION_KEY) {
    // No encryption key — a straight binary copy.
    execSync(`cp "${inputPath}" "${outputPath}"`);
    return;
  }

  const key = await scryptAsync(ENCRYPTION_KEY, "traveldesk-backup", 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);

  // Write IV + version byte prefix
  output.write(iv);
  output.write(Buffer.from([1]));

  for await (const chunk of input) {
    output.write(cipher.update(chunk));
  }
  output.write(cipher.final());
  output.write(cipher.getAuthTag());

  await new Promise((resolve, reject) => {
    output.end(() => resolve());
    output.on("error", reject);
  });
}

function rotateBackups() {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("traveldesk-") && f.endsWith(".bak"))
    .map((f) => join(BACKUP_DIR, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  for (let i = KEEP; i < files.length; i++) {
    unlinkSync(files[i]);
    log(`Removed old backup: ${files[i]}`);
  }
}

/** Dump PostgreSQL to a .sql file, then encrypt it into a `.bak`. */
async function backupPostgres(timestamp) {
  const dumpFile = join(BACKUP_DIR, `traveldesk-pg-${timestamp}.sql`);
  const backupFile = join(BACKUP_DIR, `traveldesk-${timestamp}.bak`);

  try {
    execSync(
      `pg_dump --no-owner --no-privileges --clean --if-exists "${DATABASE_URL}" > "${dumpFile}"`,
      { stdio: "pipe", shell: true },
    );
  } catch (error) {
    throw new Error(
      `pg_dump failed. Is the PostgreSQL client installed and DATABASE_URL reachable?\n${
        error.stderr?.toString?.() ?? error.message
      }`,
    );
  }

  await encryptFile(dumpFile, backupFile);
  rmSync(dumpFile, { force: true });
  log(`Backup created: ${backupFile}`);
}

async function backupSqlite(timestamp) {
  if (!existsSync(DB_FILE)) {
    throw new Error(`Database file not found: ${DB_FILE}`);
  }

  const backupFile = join(BACKUP_DIR, `traveldesk-${timestamp}.bak`);

  // If WAL exists, checkpoint it first so the .db file is consistent
  if (existsSync(WAL_FILE)) {
    try {
      execSync(`sqlite3 "${DB_FILE}" "PRAGMA wal_checkpoint(TRUNCATE);"`, {
        stdio: "pipe",
      });
    } catch {
      // Non-fatal — SQLite will reconcile on next open
    }
  }

  await encryptFile(DB_FILE, backupFile);
  log(`Backup created: ${backupFile}`);
}

async function main() {
  log("Starting backup...");

  if (!IS_POSTGRES && !existsSync(DB_FILE)) {
    console.error("Database file not found:", DB_FILE);
    process.exit(1);
  }

  mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (IS_POSTGRES) {
    await backupPostgres(timestamp);
  } else {
    await backupSqlite(timestamp);
  }

  rotateBackups();

  // Also back up uploads if present
  if (existsSync(UPLOADS_DIR)) {
    const uploadsBackup = join(BACKUP_DIR, `traveldesk-uploads-${timestamp}.tar.gz`);
    execSync(`tar -czf "${uploadsBackup}" -C "${DATA_DIR}" uploads`, {
      stdio: "pipe",
    });
    log(`Uploads backup created: ${uploadsBackup}`);
  }

  log("Backup complete.");
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
