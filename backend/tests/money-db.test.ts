import { describe, expect, it } from "vitest";

/**
 * Money columns are `DECIMAL(14,2)` in Postgres.
 *
 * The pure tests in `money.test.ts` prove the arithmetic. This one proves the
 * *storage* half of the promise: a number written to a Decimal column comes
 * back as the same exact number, Prisma aggregates still return a Decimal that
 * `num()` understands, and three odd part-payments total a whole rupee.
 *
 * It only runs when `TEST_DATABASE_URL` points at a disposable local database,
 * because it opens a real connection. Everything it writes happens inside a
 * transaction that is rolled back, so it still leaves no rows behind — but the
 * database it is pointed at should be one nobody minds being touched.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
const canRun = Boolean(testDatabaseUrl) && /@(localhost|127\.0\.0\.1)[:/]/.test(testDatabaseUrl);

class Rollback extends Error {}

describe.skipIf(!canRun)("money round-trips through the database", () => {
  it("stores exact paise and reads them back as plain numbers", async () => {
    // The app's Prisma client reads DATABASE_URL at import, so point it at the
    // test database *before* importing the module the application uses. This
    // keeps the money read extension under test rather than a lookalike.
    process.env.DATABASE_URL = testDatabaseUrl;
    const { prisma } = await import("../src/lib/prisma");
    const { num } = await import("../src/lib/money");
    const { ledgerTotalsInTx } = await import("../src/services/payment-ledger");

    const organization = await prisma.organization.findFirst({ select: { id: true } });
    expect(organization, "seed the database before running database tests").toBeTruthy();
    const organizationId = organization!.id;
    const reference = `__money_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      await prisma.$transaction(async (tx) => {
        for (const amount of [33_333.33, 33_333.33, 33_333.34]) {
          await tx.payment.create({
            data: {
              organizationId,
              moduleId: "finance",
              recordReference: reference,
              kind: "payment",
              receiptNo: `TEST-${Math.random().toString(36).slice(2, 10)}`,
              amount,
              currency: "INR",
              method: "Bank transfer",
              status: "recorded",
              provider: "manual",
            },
          });
        }

        // The read extension turns the column back into a number...
        const row = await tx.payment.findFirst({ where: { recordReference: reference } });
        expect(row).toBeTruthy();
        expect(typeof row!.amount).toBe("number");
        expect(row!.amount).toBe(33_333.33);

        // ...while aggregates still hand back a Decimal, which `num()` handles.
        const aggregate = await tx.payment.aggregate({
          where: { organizationId, recordReference: reference },
          _sum: { amount: true },
        });
        expect(typeof aggregate._sum.amount).not.toBe("number");
        // 33,333.33 + 33,333.33 + 33,333.34 is exactly one lakh, to the paisa.
        expect(num(aggregate._sum.amount)).toBe(100_000);

        // The ledger maths agrees to the paisa.
        const totals = await ledgerTotalsInTx(tx, {
          organizationId,
          moduleId: "finance",
          reference,
          total: 100_000,
        });
        expect(totals.received).toBe(100_000);
        expect(totals.balance).toBe(0);
        expect(totals.net).toBe(100_000);

        throw new Rollback("rollback on purpose");
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    // Nothing was left behind.
    const leftovers = await prisma.payment.count({ where: { recordReference: reference } });
    expect(leftovers).toBe(0);
    await prisma.$disconnect();
  });
});
