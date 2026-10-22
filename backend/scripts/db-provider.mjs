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

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "prisma", "schema.prisma");

const target = process.argv[2];
if (target !== "sqlite" && target !== "postgres") {
  console.error("Usage: node scripts/db-provider.mjs <sqlite|postgres>");
  process.exit(1);
}

const source = await readFile(schemaPath, "utf8");
const next = source.replace(/(provider\s*=\s*")(sqlite|postgres)(")/, `$1${target}$3`);
if (next === source) {
  console.log(`schema.prisma already uses provider "${target}"`);
  process.exit(0);
}
await writeFile(schemaPath, next, "utf8");
console.log(`schema.prisma provider switched to "${target}"`);
