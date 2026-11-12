import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * End-to-end backup/restore drill.
 *
 * Skips unless TEST_DATABASE_URL points at a disposable Postgres *and*
 * `pg_dump` is on PATH. It writes only inside `data/__backup_test-*` and removes
 * that directory afterwards.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
const localDatabase = /@(localhost|127\.0\.0\.1)[:/]/.test(testDatabaseUrl);
const pgDumpAvailable = spawnSync("pg_dump", ["--version"], { encoding: "utf8" }).status === 0;

describe.skipIf(!localDatabase || !pgDumpAvailable)("encrypted backup and restore drill", () => {
  it("backs up the database and uploads, then decrypts both", () => {
    const root = process.cwd();
    const workDir = join(root, "data", `__backup_test-${Date.now()}`);
    const uploadsDir = join(workDir, "uploads");
    const backupsDir = join(workDir, "backups");
    mkdirSync(uploadsDir, { recursive: true });
    mkdirSync(backupsDir, { recursive: true });
    writeFileSync(join(uploadsDir, "passport-scan.txt"), "regression passport scan\n");

    const env = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      BACKUP_ENCRYPTION_KEY: "regression-backup-key",
      UPLOAD_DIR: uploadsDir,
      BACKUP_DIR: backupsDir,
    };

    try {
      const backup = spawnSync(process.execPath, ["scripts/db-backup.mjs"], {
        cwd: root,
        env,
        encoding: "utf8",
      });
      expect(backup.status, backup.stderr).toBe(0);

      const manifestName = readdirSync(backupsDir).find((file) =>
        file.startsWith("traveldesk-manifest-"),
      );
      expect(manifestName).toBeTruthy();
      const manifestFile = readFileSync(join(backupsDir, manifestName!), "utf8");
      const manifest = JSON.parse(manifestFile);
      expect(manifest.encrypted).toBe(true);
      expect(manifest.database.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.uploads.sha256).toMatch(/^[a-f0-9]{64}$/);

      const dbBackup = readFileSync(join(backupsDir, manifest.database.file));
      // An encrypted dump must not look like plain SQL or pg_dump's PGDMP.
      expect(dbBackup.subarray(0, 2).toString("utf8")).not.toBe("--");
      expect(dbBackup.subarray(0, 5).toString("utf8")).not.toBe("PGDMP");

      const restoreDir = join(workDir, "restore");
      const restore = spawnSync(
        process.execPath,
        [
          "scripts/restore-backup.mjs",
          "--db",
          join(backupsDir, manifest.database.file),
          "--uploads",
          join(backupsDir, manifest.uploads.file),
          "--out",
          restoreDir,
        ],
        { cwd: root, env, encoding: "utf8" },
      );
      expect(restore.status, restore.stderr).toBe(0);

      const sql = readFileSync(join(restoreDir, "database.sql"));
      expect(sql.subarray(0, 2).toString("utf8")).toBe("--");
      const archive = readFileSync(join(restoreDir, "uploads.tar.gz"));
      expect(archive.subarray(0, 2).toString("hex")).toBe("1f8b");
      expect(existsSync(join(restoreDir, "uploads.tar.gz"))).toBe(true);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
