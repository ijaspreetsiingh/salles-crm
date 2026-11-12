#!/usr/bin/env node
/**
 * Daily backup scheduler.
 *
 * A backup script nobody runs is not a backup policy. This small process wakes
 * once a day, runs `db-backup.mjs`, logs the result, and sleeps until the next
 * run. It uses no cron daemon and no dependency, so it works in the same
 * container image as the API (see docker-compose `backup` service).
 *
 * Environment:
 *   BACKUP_HOUR     local hour 0–23 (default 2)
 *   BACKUP_MINUTE   minute 0–59 (default 0)
 *   TZ              container timezone (set to Asia/Kolkata in compose)
 *   RUN_NOW         "true" to take one backup immediately on boot
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "db-backup.mjs");
const hour = clamp(Number(process.env.BACKUP_HOUR ?? 2), 0, 23);
const minute = clamp(Number(process.env.BACKUP_MINUTE ?? 0), 0, 59);

function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : min;
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function runBackup() {
  return new Promise((resolve) => {
    log("Starting scheduled backup");
    const child = spawn(process.execPath, [script], { stdio: "inherit", env: process.env });
    child.on("exit", (code, signal) => {
      if (code === 0) log("Scheduled backup finished");
      else log(`Scheduled backup FAILED (code=${code ?? "null"}, signal=${signal ?? "none"})`);
      resolve(code === 0);
    });
    child.on("error", (error) => {
      log(`Could not spawn backup: ${error.message}`);
      resolve(false);
    });
  });
}

function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(1_000, next.getTime() - now.getTime());
}

async function main() {
  if (String(process.env.RUN_NOW ?? "").toLowerCase() === "true") {
    await runBackup();
  }
  for (;;) {
    const wait = msUntilNextRun();
    log(`Next backup in ${Math.round(wait / 60_000)} minute(s) at ${hour}:${String(minute).padStart(2, "0")}`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    await runBackup();
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`Received ${signal}, stopping scheduler`);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Backup scheduler crashed:", error);
  process.exit(1);
});
