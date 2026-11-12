#!/usr/bin/env node
/**
 * Traveldesk backup script.
 *
 * A database dump alone is not a backup of this product: passport scans, visa
 * letters and ticket PDFs live on disk, and restoring only Postgres brings back
 * rows that point at files which no longer exist. This script therefore backs
 * up both, encrypts both with the same key, rotates both, and writes a manifest
 * with SHA-256 checksums so a restore can prove it used intact files.
 *
 * Usage:
 *   npm run db:backup                 # one-off backup
 *   node scripts/backup-scheduler.mjs # daily at 02:00 (see scheduler)
 *
 * Environment:
 *   DATABASE_URL            postgres://… (required for the database dump)
 *   UPLOAD_DIR              defaults to ./data/uploads
 *   BACKUP_DIR              defaults to ./data/backups
 *   BACKUPS_TO_KEEP         default 14
 *   BACKUP_ENCRYPTION_KEY   required in production; without it files are stored
 *                           in plain text and the script says so loudly
 */

import { execFileSync, execSync } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createCipheriv, randomBytes, scrypt } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const ROOT = process.cwd();
const DATA_DIR = resolve(ROOT, "data");
const BACKUP_DIR = resolve(ROOT, process.env.BACKUP_DIR ?? "data/backups");
const UPLOADS_DIR = resolve(ROOT, process.env.UPLOAD_DIR ?? "data/uploads");
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const IS_POSTGRES = /^postgres(ql)?:\/\//.test(DATABASE_URL);
const KEEP = Math.max(1, parseInt(process.env.BACKUPS_TO_KEEP ?? "14", 10));
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function encryptFile(inputPath, outputPath) {
  if (!ENCRYPTION_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "BACKUP_ENCRYPTION_KEY is required in production — refusing to write passport scans in plain text",
      );
    }
    copyFileSync(inputPath, outputPath);
    return;
  }

  const key = await scryptAsync(ENCRYPTION_KEY, "traveldesk-backup", 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);
  output.write(iv);
  output.write(Buffer.from([1]));

  for await (const chunk of input) {
    output.write(cipher.update(chunk));
  }
  output.write(cipher.final());
  output.write(cipher.getAuthTag());

  await new Promise((resolveDone, reject) => {
    output.end(() => resolveDone());
    output.on("error", reject);
  });
}

function sha256File(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function rotate() {
  const candidates = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("traveldesk-"))
    .map((f) => join(BACKUP_DIR, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  // Keep the newest N database backups and the newest N upload archives
  // separately: a busy upload day must not push out every database dump.
  const groups = { db: [], uploads: [] };
  for (const file of candidates) {
    if (file.includes("-uploads-")) groups.uploads.push(file);
    else if (file.includes("-manifest-")) continue; // manifests follow their files
    else groups.db.push(file);
  }
  for (const [kind, files] of Object.entries(groups)) {
    for (let i = KEEP; i < files.length; i++) {
      unlinkSync(files[i]);
      log(`Removed old ${kind} backup: ${files[i]}`);
    }
  }

  const manifests = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("traveldesk-manifest-"))
    .map((f) => join(BACKUP_DIR, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (let i = KEEP; i < manifests.length; i++) {
    unlinkSync(manifests[i]);
  }
}

/**
 * Prisma appends `?schema=public`, which libpq (and therefore pg_dump) rejects
 * as an invalid URI parameter. Strip Prisma-only knobs before handing the URL
 * to pg_dump.
 */
function libpqUrl(raw) {
  try {
    const url = new URL(raw);
    for (const key of ["schema", "connection_limit", "pool_timeout", "pgbouncer", "statement_cache_size"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function dumpPostgres(timestamp) {
  const dumpFile = join(BACKUP_DIR, `traveldesk-pg-${timestamp}.sql`);
  try {
    // execFileSync cannot redirect to a file, so use the shell once. The URL is
    // quoted and never echoed; stderr is captured for the failure message.
    execSync(
      `pg_dump --no-owner --no-privileges --clean --if-exists "${libpqUrl(DATABASE_URL)}" > "${dumpFile}"`,
      { stdio: "pipe", shell: true },
    );
    return dumpFile;
  } catch (error) {
    rmSync(dumpFile, { force: true });
    throw new Error(
      `pg_dump failed. Is the PostgreSQL client installed and DATABASE_URL reachable?\n${
        error.stderr?.toString?.() ?? error.message
      }`,
    );
  }
}

async function backupUploads(timestamp) {
  if (!existsSync(UPLOADS_DIR)) {
    log(`No uploads directory at ${UPLOADS_DIR} — nothing to archive for files.`);
    return null;
  }
  const files = readdirSync(UPLOADS_DIR);
  if (files.length === 0) {
    log(`Uploads directory is empty — skipping the file archive.`);
    return null;
  }

  const tarFile = join(BACKUP_DIR, `traveldesk-uploads-${timestamp}.tar.gz`);
  // GNU tar treats "C:" as a remote host. Run from the project root with
  // relative, forward-slash paths so the same command works on Windows and in
  // the Alpine container.
  const relUploads = relative(ROOT, UPLOADS_DIR).replaceAll("\\", "/");
  const relTar = relative(ROOT, tarFile).replaceAll("\\", "/");
  execFileSync("tar", ["-czf", relTar, relUploads], { cwd: ROOT, stdio: "pipe" });

  const finalFile = ENCRYPTION_KEY ? `${tarFile}.bak` : tarFile;
  if (ENCRYPTION_KEY) {
    await encryptFile(tarFile, finalFile);
    rmSync(tarFile, { force: true });
  } else {
    log("WARNING: BACKUP_ENCRYPTION_KEY is not set — passport scans are stored unencrypted.");
  }
  log(`Uploads backup created: ${finalFile} (${files.length} file(s))`);
  return finalFile;
}

async function main() {
  log("Starting backup...");
  if (!IS_POSTGRES) {
    console.error(
      "DATABASE_URL must be a postgres:// URL. SQLite is not a supported backup source for this schema.",
    );
    process.exit(1);
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const dumpFile = dumpPostgres(timestamp);
  const dbBackup = join(BACKUP_DIR, `traveldesk-${timestamp}.bak`);
  await encryptFile(dumpFile, dbBackup);
  rmSync(dumpFile, { force: true });
  log(`Database backup created: ${dbBackup}`);

  const uploadsBackup = await backupUploads(timestamp);

  const manifest = {
    createdAt: new Date().toISOString(),
    encrypted: Boolean(ENCRYPTION_KEY),
    database: {
      file: dbBackup.split(/[\\/]/).pop(),
      sha256: await sha256File(dbBackup),
      bytes: statSync(dbBackup).size,
    },
    uploads: uploadsBackup
      ? {
          file: uploadsBackup.split(/[\\/]/).pop(),
          sha256: await sha256File(uploadsBackup),
          bytes: statSync(uploadsBackup).size,
        }
      : null,
    restore: {
      database:
        "openssl enc -d -aes-256-gcm (or use scripts/restore-backup.mjs) then psql \"$DATABASE_URL\" < dump.sql",
      uploads: "decrypt the archive and extract it at the project root (it contains data/uploads/…)",
    },
  };
  const manifestFile = join(BACKUP_DIR, `traveldesk-manifest-${timestamp}.json`);
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  rotate();
  log(`Backup complete. Manifest: ${manifestFile}`);
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
