export type Pagination = { page: number; pageSize: number; skip: number; take: number };

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/** Normalises page / pageSize query params into a safe Prisma skip/take pair. */
export function getPagination(query: Record<string, unknown>, defaultSize = 25): Pagination {
  const page = clamp(Number(query.page) || 1, 1, 100_000);
  const pageSize = clamp(Number(query.pageSize) || defaultSize, 1, 200);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(items: T[], total: number, p: Pagination) {
  return {
    items,
    meta: {
      page: p.page,
      pageSize: p.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
    },
  };
}
