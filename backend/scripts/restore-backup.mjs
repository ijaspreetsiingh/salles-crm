#!/usr/bin/env node
/**
 * Restore helper.
 *
 * A backup is only real if it can be opened. This script decrypts the database
 * dump and the uploads archive into a directory and prints the exact restore
 * commands — it never pipes anything into a live database by itself, because a
 * mistaken production URL is unrecoverable.
 *
 * Usage:
 *   BACKUP_ENCRYPTION_KEY=… node scripts/restore-backup.mjs \
 *     --db data/backups/traveldesk-<ts>.bak \
 *     --uploads data/backups/traveldesk-uploads-<ts>.tar.gz.bak \
 *     --out restore-<ts>
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createDecipheriv, scryptSync } from "node:crypto";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const dbFile = arg("db");
const uploadsFile = arg("uploads");
const outDir = arg("out", `restore-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const key = process.env.BACKUP_ENCRYPTION_KEY;

if (!dbFile && !uploadsFile) {
  console.error("Provide --db <backup.bak> and/or --uploads <archive.tar.gz.bak>");
  process.exit(2);
}

function decrypt(input, output) {
  if (!key) {
    copyFileSync(input, output);
    return;
  }
  const payload = readFileSync(input);
  if (payload.length < 33 || payload[16] !== 1) {
    throw new Error(`${basename(input)} is not a Traveldesk encrypted backup (bad header)`);
  }
  const iv = payload.subarray(0, 16);
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(17, payload.length - 16);
  const derived = scryptSync(key, "traveldesk-backup", 32);
  const decipher = createDecipheriv("aes-256-gcm", derived, iv);
  decipher.setAuthTag(tag);
  writeFileSync(output, Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}

try {
  mkdirSync(outDir, { recursive: true });
  let sqlPath = "";
  let uploadsPath = "";
  if (dbFile) {
    sqlPath = join(outDir, "database.sql");
    decrypt(dbFile, sqlPath);
    console.log(`Database dump decrypted → ${sqlPath}`);
  }
  if (uploadsFile) {
    uploadsPath = join(outDir, "uploads.tar.gz");
    decrypt(uploadsFile, uploadsPath);
    console.log(`Uploads archive decrypted → ${uploadsPath}`);
  }
  console.log("\nNothing has been applied. Review the dump, then run the commands you need:\n");
  if (sqlPath) {
    console.log(`  psql "$DATABASE_URL" < "${sqlPath}"`);
  }
  if (uploadsPath) {
    console.log(`  tar -xzf "${uploadsPath}" -C "<project root that contains data/uploads>"`);
  }
  console.log("\nStop the API during the restore so no request sees a half-loaded database.");
  if (!existsSync(join(outDir, "database.sql")) && !existsSync(join(outDir, "uploads.tar.gz"))) {
    console.error("Nothing was decrypted — check the input paths.");
    process.exit(1);
  }
} catch (error) {
  console.error("Restore preparation failed:", error.message);
  process.exit(1);
}
