import { prisma } from "../src/lib/prisma";

async function main() {
  const reg = await prisma.$queryRawUnsafe(
    "SELECT to_regclass('public._prisma_migrations')::text AS t",
  );
  console.log(reg);
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at`,
    );
    console.log(rows);
  } catch (e) {
    console.log("no migrations table", (e as Error).message);
  }
}

main().finally(() => prisma.$disconnect());
