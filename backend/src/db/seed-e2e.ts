/**
 * E2E test seed — creates a minimal, deterministic workspace for Playwright.
 *
 * Always uses the same credentials so the test suite never needs to know
 * real company data. Safe to run repeatedly — idempotent via upsert.
 *
 * Credentials (also written to e2e/.env.local for Playwright global setup):
 *   Email    : e2e@traveldesk.test
 *   Password : E2eTest@123
 *
 * Usage:
 *   npx tsx src/db/seed-e2e.ts
 *   # or via package.json: npm run seed:e2e
 */
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";
import { ROLE_DEFS } from "../domain/rbac";
import { stringifyJson } from "../lib/utils";

const E2E_EMAIL = process.env["E2E_EMAIL"] ?? "e2e@traveldesk.test";
const E2E_PASSWORD = process.env["E2E_PASSWORD"] ?? "E2eTest@123";
const E2E_ORG_SLUG = "e2e-test-org";

export async function seedE2E(): Promise<void> {
  console.log("→ E2E seed: creating test workspace…");

  // Idempotent: upsert the org so running twice is harmless.
  const org = await prisma.organization.upsert({
    where: { slug: E2E_ORG_SLUG },
    update: {},
    create: {
      name: "E2E Test Travel Agency",
      slug: E2E_ORG_SLUG,
      legalName: "E2E Test Ltd",
      gstin: "29AABCT1332L1Z5",
      supportEmail: E2E_EMAIL,
      currency: "INR",
      financialYear: "April – March",
      plan: "enterprise",
      planStatus: "active",
      settings: stringifyJson({
        taxRegime: "GST",
        defaultTaxRate: 18,
        invoicePrefix: "E2E-INV-",
      }),
    },
  });

  // Roles — required for membership to resolve permissions.
  for (const role of ROLE_DEFS) {
    await prisma.role.upsert({
      where: { organizationId_key: { organizationId: org.id, key: role.key } },
      update: {},
      create: {
        organizationId: org.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: stringifyJson(role.permissions),
        isSystem: role.isSystem,
      },
    });
  }

  // Branch — every record needs one.
  const branch = await prisma.branch.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Head Office" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Head Office",
      code: "HQ",
      active: true,
    },
  });

  // Test user — company_admin so all E2E tests can access everything.
  const user = await prisma.user.upsert({
    where: { email: E2E_EMAIL },
    update: { active: true, emailVerified: true },
    create: {
      email: E2E_EMAIL,
      name: "E2E Test User",
      passwordHash: await hashPassword(E2E_PASSWORD),
      active: true,
      emailVerified: true,
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: { active: true, roleKey: "company_admin" },
    create: {
      userId: user.id,
      organizationId: org.id,
      roleKey: "company_admin",
      branchId: branch.id,
      active: true,
    },
  });

  // Subscription — required to pass the ENFORCE_SUBSCRIPTION middleware.
  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      planKey: "enterprise",
      status: "active",
      billingCycle: "Yearly",
      seats: 5,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  // Seed a few records so the workspace is not empty (first-run wizard would
  // block tests that just want to open a module).
  const existingLeads = await prisma.record.count({
    where: { organizationId: org.id, moduleId: "leads" },
  });

  if (existingLeads === 0) {
    await prisma.record.createMany({
      data: [
        {
          organizationId: org.id,
          moduleId: "leads",
          reference: "LD-E2E-001",
          name: "Priya Mehta",
          detail: "Dubai family trip",
          destination: "Dubai",
          ownerName: "E2E Test User",
          ownerId: user.id,
          branchId: branch.id,
          branchName: "Head Office",
          date: new Date().toISOString().slice(0, 10),
          amount: 185000,
          currency: "INR",
          status: "New",
          email: "priya.mehta@example.com",
          phone: "+91 98765 43210",
          source: "Website",
          notes: "E2E test lead",
          extra: "{}",
          meta: "{}",
        },
        {
          organizationId: org.id,
          moduleId: "bookings",
          reference: "BK-E2E-001",
          name: "Rahul Sharma",
          detail: "Bali honeymoon package",
          destination: "Bali",
          ownerName: "E2E Test User",
          ownerId: user.id,
          branchId: branch.id,
          branchName: "Head Office",
          date: new Date().toISOString().slice(0, 10),
          amount: 245000,
          currency: "INR",
          status: "Confirmed",
          email: "rahul.sharma@example.com",
          phone: "+91 87654 32109",
          source: "Direct",
          notes: "E2E test booking",
          extra: "{}",
          meta: "{}",
        },
        {
          organizationId: org.id,
          moduleId: "finance",
          reference: "E2E-INV-24-25-0001",
          name: "Rahul Sharma",
          detail: "Bali honeymoon invoice",
          destination: "Bali",
          ownerName: "E2E Test User",
          ownerId: user.id,
          branchId: branch.id,
          branchName: "Head Office",
          date: new Date().toISOString().slice(0, 10),
          amount: 245000,
          currency: "INR",
          status: "Sent",
          email: "rahul.sharma@example.com",
          phone: "+91 87654 32109",
          source: "Direct",
          notes: "E2E test invoice",
          extra: JSON.stringify({ gstRate: 5 }),
          meta: "{}",
        },
      ],
    });
  }

  console.log(`✓ E2E seed complete`);
  console.log(`  Email    : ${E2E_EMAIL}`);
  console.log(`  Password : ${E2E_PASSWORD}`);
  console.log(`  Org      : ${org.name} (${org.id})`);
}

if (require.main === module) {
  seedE2E()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("✖ E2E seed failed:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
