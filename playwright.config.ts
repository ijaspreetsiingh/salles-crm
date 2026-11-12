import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test credentials — match what seed-e2e.ts creates.
 * Override via env vars in CI or local .env:
 *   E2E_EMAIL=your@email.com E2E_PASSWORD=YourPass1!
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  // Runs seed-e2e.ts once before ALL tests (idempotent — safe to repeat).
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: process.env["E2E_BASE_URL"] || "http://localhost:5173",
    trace: "on-first-retry",
    // Pass seeded credentials so tests don't need to hardcode them.
    // Tests read these via process.env["E2E_EMAIL"] etc.
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
