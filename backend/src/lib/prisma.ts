import { PrismaClient, type Prisma } from "@prisma/client";
import { env, isProd } from "../config/env";

/** SQLite URLs look like `file:./data/traveldesk.db`; everything else is Postgres. */
const isSqlite = env.DATABASE_URL.startsWith("file:");

/**
 * Money is stored as exact `DECIMAL(14,2)` in Postgres, but application code
 * (and every JSON response) speaks plain numbers. Prisma hands back `Decimal`
 * objects, which break arithmetic and serialise as strings, so every money
 * field is normalised at the read boundary, right here, once.
 *
 * Writing a JavaScript number into a Decimal column is safe: Prisma converts it
 * to an exact decimal before it reaches Postgres.
 */
const moneyField = <K extends string>(field: K) => ({
  needs: { [field]: true } as Record<K, true>,
  compute: (row: Record<K, unknown>) => {
    const value = row[field];
    return value === null || value === undefined ? 0 : Number(value);
  },
});

const optionalMoneyField = <K extends string>(field: K) => ({
  needs: { [field]: true } as Record<K, true>,
  compute: (row: Record<K, unknown>) => {
    const value = row[field];
    return value === null || value === undefined ? null : Number(value);
  },
});

function createClient() {
  const base = new PrismaClient({
    log: isProd ? ["error"] : ["error", "warn"],
  });

  return base.$extends({
    result: {
      record: { amount: moneyField("amount") },
      payment: { amount: moneyField("amount") },
      payable: {
        amount: moneyField("amount"),
        gstRate: moneyField("gstRate"),
        poAmount: optionalMoneyField("poAmount"),
        receivedAmount: optionalMoneyField("receivedAmount"),
        invoiceAmount: optionalMoneyField("invoiceAmount"),
      },
      creditNote: {
        amount: moneyField("amount"),
        gstRate: moneyField("gstRate"),
      },
      payablePayment: { amount: moneyField("amount") },
      expense: {
        amount: moneyField("amount"),
        gstRate: moneyField("gstRate"),
      },
      plan: {
        priceMonthly: moneyField("priceMonthly"),
        priceYearly: moneyField("priceYearly"),
      },
      hotelRate: {
        costPrice: moneyField("costPrice"),
        sellingPrice: moneyField("sellingPrice"),
      },
      hotelAllotment: {
        costPrice: moneyField("costPrice"),
        sellingPrice: moneyField("sellingPrice"),
      },
      agentAccount: {
        creditLimit: moneyField("creditLimit"),
        creditUsed: moneyField("creditUsed"),
        commissionRate: moneyField("commissionRate"),
      },
      agentCommission: {
        saleAmount: moneyField("saleAmount"),
        rate: moneyField("rate"),
        amount: moneyField("amount"),
      },
    },
  });
}

export type Db = ReturnType<typeof createClient>;

/** The client handed to `prisma.$transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

// A single Prisma client for the whole process. In dev we keep it on globalThis
// so tsx watch reloads don't exhaust database connections.
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const prisma: Db = globalForPrisma.prisma ?? createClient();

if (!isProd) globalForPrisma.prisma = prisma;

/**
 * Takes the organisation-level write lock for the rest of the transaction.
 *
 * Postgres has no gap-free counter primitive that Prisma exposes, so every
 * money write (a receipt, a ledger resync) serialises on the organisation row.
 * Without it two concurrent payments can both read "₹0 received" and write
 * back a total that has forgotten the other one.
 */
export async function lockOrganization(tx: Tx, organizationId: string): Promise<void> {
  if (isSqlite) return; // SQLite serialises writers itself.
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
}

/**
 * Case-insensitive `contains` for a text column.
 *
 * SQLite's LIKE is already case-insensitive for ASCII, so `contains` finds
 * "priya" in "Priya Mehta". Postgres's LIKE is not, and Postgres is the
 * database we recommend for production: without this, every search box in the
 * CRM silently stops matching unless the typist gets the capitalisation right.
 *
 * `mode: "insensitive"` is rejected by the SQLite connector, so the filter is
 * built per provider rather than passed everywhere.
 */
export function containsText(value: string): Prisma.StringFilter {
  return isSqlite ? { contains: value } : { contains: value, mode: "insensitive" };
}

/** Kept for callers that still want the raw (un-extended) client type. */
export { PrismaClient };

/** Enables SQLite foreign-key enforcement + WAL for concurrent reads. */
export async function initDatabase(): Promise<void> {
  // PRAGMA is SQLite-only syntax — Postgres rejects it and would abort boot.
  if (!isSqlite) return;
  // PRAGMA statements return rows on SQLite, so they must run as queries.
  await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
}
