/**
 * Playwright global setup — seeds the E2E test user before any test runs.
 *
 * Runs once before the entire test suite (not per worker). The seed is
 * idempotent so running the suite multiple times never creates duplicates.
 *
 * Requirements:
 *   - Backend must be reachable at E2E_API_URL (default http://localhost:4000)
 *   - DATABASE_URL must point at the same DB the backend uses
 *
 * The seed runs the TypeScript source directly via tsx so it works without
 * a build step. In CI, run `npm run seed:e2e` in a pre-test step instead if
 * tsx is not available.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../backend");

export default async function globalSetup() {
  const apiUrl = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";

  // Quick check — is the API up? If not, skip seed (tests will fail anyway
  // with a helpful network error rather than a confusing seed error).
  try {
    const res = await fetch(`${apiUrl}/health`).catch(() => null);
    if (!res?.ok) {
      console.warn(
        `[e2e setup] API at ${apiUrl} is not responding — skipping seed. Start the backend first.`,
      );
      return;
    }
  } catch {
    console.warn(`[e2e setup] Could not reach ${apiUrl} — skipping seed.`);
    return;
  }

  console.log("[e2e setup] Seeding E2E test user…");
  try {
    execSync("npx tsx src/db/seed-e2e.ts", {
      cwd: backendRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        // Ensure seed does not think it's in production.
        NODE_ENV: "test",
        E2E_EMAIL: process.env["E2E_EMAIL"] ?? "e2e@traveldesk.test",
        E2E_PASSWORD: process.env["E2E_PASSWORD"] ?? "E2eTest@123",
      },
    });
    console.log("[e2e setup] E2E seed done.");
  } catch (err) {
    // Non-fatal: tests can still run if the seed fails (e.g. DB already seeded).
    console.warn("[e2e setup] Seed warning (non-fatal):", err instanceof Error ? err.message : err);
  }
}
