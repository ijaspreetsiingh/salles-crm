import { expect, test } from "@playwright/test";

test("sign-in page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get(
    (process.env.E2E_API_URL || "http://localhost:4000") + "/api/v1/health",
  );
  expect(res.ok()).toBeTruthy();
});
