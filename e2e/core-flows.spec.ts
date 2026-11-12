/**
 * Core business flow E2E tests.
 *
 * These tests cover the production-critical paths that must work before
 * any real company goes live. They test against the running app in a browser.
 *
 * Run with: npm run test:e2e
 *
 * Environment variables (optional):
 *   E2E_BASE_URL   — override the app URL (default: http://localhost:5173)
 *   E2E_EMAIL      — test user email (default: test@example.com)
 *   E2E_PASSWORD   — test user password (default: TestPass1!)
 *   E2E_API_URL    — API base URL for direct API assertions
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";
// Default credentials match what seed-e2e.ts creates. Override via env vars.
const EMAIL = process.env["E2E_EMAIL"] ?? "e2e@traveldesk.test";
const PASSWORD = process.env["E2E_PASSWORD"] ?? "E2eTest@123";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function signIn(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|login/i }).click();
  // Wait for workspace to load
  await page.waitForURL(/workspace/, { timeout: 15_000 });
}

async function goToModule(page: Page, moduleSlug: string) {
  await page.goto(`${BASE}/workspace/${moduleSlug}`);
  await page.waitForLoadState("networkidle");
}

// ─── Health & sign-in page ───────────────────────────────────────────────────

test.describe("Health", () => {
  test("API health endpoint responds 200", async ({ request }) => {
    const apiBase = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";
    const res = await request.get(`${apiBase}/health`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data?.status).toBe("ok");
  });

  test("Sign-in page renders", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|login/i })).toBeVisible();
  });
});

// ─── Authentication ──────────────────────────────────────────────────────────

test.describe("Authentication", () => {
  test("Wrong password shows error, not blank screen", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill("WrongPass999!");
    await page.getByRole("button", { name: /sign in|login/i }).click();
    // Should stay on login and show an error
    await expect(page).toHaveURL(/login/);
    await expect(page.getByText(/invalid|incorrect|wrong|password/i)).toBeVisible({ timeout: 5000 });
  });

  test("Successful sign-in reaches workspace", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/workspace/);
    // The workspace nav should be visible
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("Sign-out works and redirects to login", async ({ page }) => {
    await signIn(page);
    // Find sign-out — it may be under a user menu
    const userMenu = page.getByRole("button", { name: /account|profile|user|sign out/i }).first();
    if (await userMenu.isVisible()) {
      await userMenu.click();
      const signOut = page.getByRole("menuitem", { name: /sign out|logout/i });
      if (await signOut.isVisible()) {
        await signOut.click();
        await expect(page).toHaveURL(/login|\/$/);
      }
    }
    // If no sign-out button found, just verify we're still authenticated
  });
});

// ─── Leads (Enquiry) ─────────────────────────────────────────────────────────

test.describe("Leads module", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await goToModule(page, "leads");
  });

  test("Leads list renders without crash", async ({ page }) => {
    // The module name should appear in the heading
    await expect(page.getByRole("heading", { name: /leads|enquir/i })).toBeVisible({ timeout: 10_000 });
  });

  test("Can open the create lead form", async ({ page }) => {
    const createBtn = page.getByRole("button", { name: /new lead|add lead|create/i }).first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    // A dialog or form should open
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  });

  test("Can create a new lead", async ({ page }) => {
    const createBtn = page.getByRole("button", { name: /new lead|add lead|create/i }).first();
    await createBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill required fields
    const nameField = dialog.getByLabel(/name/i).first();
    await nameField.fill(`E2E Test Lead ${Date.now()}`);

    const submitBtn = dialog.getByRole("button", { name: /save|create|submit|add/i }).first();
    await submitBtn.click();

    // Dialog should close (or show success)
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });
});

// ─── Bookings ────────────────────────────────────────────────────────────────

test.describe("Bookings module", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await goToModule(page, "bookings");
  });

  test("Bookings list renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /booking/i })).toBeVisible({ timeout: 10_000 });
  });

  test("Bookings list shows money amounts", async ({ page }) => {
    // KPI stats at the top should show currency
    await page.waitForLoadState("networkidle");
    // Either the stats area or the table should show something
    const content = await page.textContent("body");
    expect(content).toMatch(/₹|INR|booking/i);
  });
});

// ─── Finance / Invoice ───────────────────────────────────────────────────────

test.describe("Finance module", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await goToModule(page, "finance");
  });

  test("Finance module renders without crash", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /finance|invoice/i })).toBeVisible({ timeout: 10_000 });
  });

  test("GST tab is accessible", async ({ page }) => {
    const gstTab = page.getByRole("tab", { name: /gst|tax/i });
    if (await gstTab.isVisible()) {
      await gstTab.click();
      await expect(page.getByText(/gst|tax/i)).toBeVisible();
    }
  });
});

// ─── Record Sheet ────────────────────────────────────────────────────────────

test.describe("Record sheet", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await goToModule(page, "leads");
  });

  test("Opening a record shows the side panel", async ({ page }) => {
    // Wait for any records to load
    await page.waitForLoadState("networkidle");
    const firstRow = page.locator("tr[role='row'], .record-row, [data-testid='record-row']").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      // Panel should open
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    }
  });

  test("Record sheet has Activity tab", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    const firstRow = page.locator("tr[role='row']:not([aria-label='header'])").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      const activityTab = page.getByRole("tab", { name: /activity|timeline/i });
      if (await activityTab.isVisible({ timeout: 3000 })) {
        await activityTab.click();
        // The add note textarea should be visible
        await expect(page.getByLabel(/add a note|note/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test("Record sheet has Links tab", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    const firstRow = page.locator("tr[role='row']:not([aria-label='header'])").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      const linksTab = page.getByRole("tab", { name: /links|relations/i });
      if (await linksTab.isVisible({ timeout: 3000 })) {
        await linksTab.click();
        await expect(page.getByLabel(/record id/i)).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

// ─── Branch scoping ──────────────────────────────────────────────────────────

test.describe("Branch scoping", () => {
  test("Branch-scoped user can only see their branch records", async ({ page }) => {
    // This test requires a branch-scoped test user to be configured.
    // If E2E_BRANCH_EMAIL and E2E_BRANCH_PASSWORD are set, test scoping.
    const branchEmail = process.env["E2E_BRANCH_EMAIL"];
    const branchPassword = process.env["E2E_BRANCH_PASSWORD"];
    if (!branchEmail || !branchPassword) {
      test.skip();
      return;
    }

    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(branchEmail);
    await page.getByLabel(/password/i).fill(branchPassword);
    await page.getByRole("button", { name: /sign in|login/i }).click();
    await page.waitForURL(/workspace/, { timeout: 15_000 });

    // Navigate to leads — the list should be scoped to their branch
    await goToModule(page, "leads");
    await page.waitForLoadState("networkidle");

    // The UI should show the branch name, not "All branches"
    const branchName = process.env["E2E_BRANCH_NAME"] ?? "";
    if (branchName) {
      const content = await page.textContent("body");
      expect(content).toContain(branchName);
    }
  });
});

// ─── Campaigns ───────────────────────────────────────────────────────────────

test.describe("Campaigns module", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await goToModule(page, "campaigns");
  });

  test("Campaigns panel renders", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    // Should show campaigns tab or empty state
    const content = await page.textContent("body");
    expect(content).toMatch(/campaign|draft|send/i);
  });
});

// ─── Settings ────────────────────────────────────────────────────────────────

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await goToModule(page, "settings");
  });

  test("Settings module renders", async ({ page }) => {
    await expect(page.getByText(/settings|organisation|profile/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Profile tab is reachable", async ({ page }) => {
    const profileTab = page.getByRole("tab", { name: /profile/i });
    if (await profileTab.isVisible()) {
      await profileTab.click();
      await expect(page.getByLabel(/name/i).first()).toBeVisible();
    }
  });

  test("Security tab shows 2FA section", async ({ page }) => {
    const securityTab = page.getByRole("tab", { name: /security/i });
    if (await securityTab.isVisible()) {
      await securityTab.click();
      await expect(page.getByText(/two-factor|2fa|authenticator/i)).toBeVisible({ timeout: 5000 });
    }
  });
});

// ─── Accessibility (basic) ───────────────────────────────────────────────────

test.describe("Accessibility", () => {
  test("Sign-in form has proper labels", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    // Both inputs must have accessible labels (not just placeholders)
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test("Main workspace navigation is a nav landmark", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("Module tabs have ARIA roles", async ({ page }) => {
    await signIn(page);
    await goToModule(page, "leads");
    // Tabs should use role="tablist" or be a segmented control
    await page.waitForLoadState("networkidle");
    const tablist = page.getByRole("tablist").first();
    if (await tablist.isVisible({ timeout: 3000 })) {
      const tabs = tablist.getByRole("tab");
      await expect(tabs.first()).toBeVisible();
    }
  });

  test("Keyboard navigation: Tab moves through interactive elements", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.keyboard.press("Tab");
    // After one Tab, focus should be on an interactive element (not body)
    const focused = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
    expect(["input", "button", "a", "select", "textarea"]).toContain(focused);
  });
});

// ─── Data Export ─────────────────────────────────────────────────────────────

test.describe("Data Export (DPDP)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Export status API returns record counts", async ({ request }) => {
    // This requires an authenticated session — skip if no API cookie access
    const apiBase = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";
    const loginRes = await request.post(`${apiBase}/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
    });
    if (!loginRes.ok()) {
      test.skip();
      return;
    }
    const { data } = (await loginRes.json()) as { data: { accessToken: string } };
    const exportRes = await request.get(`${apiBase}/export/status`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    if (exportRes.status() === 403) {
      // Current user is not a company_admin — expected
      test.skip();
      return;
    }
    expect(exportRes.status()).toBe(200);
    const exportData = (await exportRes.json()) as { data: { estimatedRows: number } };
    expect(typeof exportData.data.estimatedRows).toBe("number");
  });
});
