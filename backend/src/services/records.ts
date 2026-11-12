import type { Prisma } from "@prisma/client";
import type { RecordRow } from "../lib/money";
import { containsText, prisma } from "../lib/prisma";
import { env } from "../config/env";
import { parseJson, stringifyJson } from "../lib/utils";
import type { ModuleDef } from "../domain/modules";
import { isBranchScoped } from "../domain/rbac";

export type RecordDto = {
  id: string;
  moduleId: string;
  tab: string | null;
  reference: string;
  name: string;
  detail: string;
  destination: string;
  owner: string;
  ownerId: string | null;
  branch: string;
  branchId: string | null;
  date: string;
  amount: number;
  currency: string;
  status: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  extra: Record<string, unknown>;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function toRecordDto(record: RecordRow): RecordDto {
  return {
    id: record.id,
    moduleId: record.moduleId,
    tab: record.tab,
    reference: record.reference,
    name: record.name,
    detail: record.detail,
    destination: record.destination,
    owner: record.ownerName,
    ownerId: record.ownerId,
    branch: record.branchName,
    branchId: record.branchId,
    date: record.date,
    amount: record.amount,
    currency: record.currency || "",
    status: record.status,
    email: record.email,
    phone: record.phone,
    source: record.source,
    notes: record.notes,
    extra: parseJson<Record<string, unknown>>(record.extra, {}),
    meta: parseJson<Record<string, unknown>>(record.meta, {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Resolves free-text owner/branch names into tenant-scoped foreign keys. */
export async function resolveOwnerBranch(
  organizationId: string,
  ownerName?: string | null,
  branchName?: string | null,
): Promise<{
  ownerId: string | null;
  ownerName: string;
  branchId: string | null;
  branchName: string;
}> {
  let ownerId: string | null = null;
  let branchId: string | null = null;

  if (ownerName) {
    const user = await prisma.user.findFirst({
      where: {
        name: ownerName,
        memberships: { some: { organizationId, active: true } },
      },
      select: { id: true },
    });
    ownerId = user?.id ?? null;
  }

  if (branchName) {
    const branch = await prisma.branch.findFirst({
      where: { organizationId, name: branchName },
      select: { id: true },
    });
    branchId = branch?.id ?? null;
  }

  return {
    ownerId,
    ownerName: ownerName ?? "",
    branchId,
    branchName: branchName ?? "",
  };
}

/**
 * Generates the next human-friendly reference, e.g. LD-2409.
 *
 * Uses a dedicated `Sequence` counter incremented inside a transaction that
 * locks the organisation row, so two concurrent creates never hand out the
 * same reference. The counter starts at 2401 to match the legacy starting
 * point; existing references above that number are migrated in on first use.
 */
export async function nextReference(organizationId: string, module: ModuleDef): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Pessimistic lock: serialises reference generation for this org.
    // PostgreSQL uses SELECT FOR UPDATE; SQLite serialises via WAL.
    const isPg = !env.DATABASE_URL.startsWith("file:");
    if (isPg) {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    }

    // Migrate the highest existing reference into the counter on first use
    // so the numbering continues seamlessly from where the old scan left off.
    const existing = await tx.record.findMany({
      where: { organizationId, moduleId: module.id },
      select: { reference: true },
    });
    let highestExisting = 2400;
    for (const row of existing) {
      const match = row.reference?.match(/(\d+)$/);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > highestExisting) highestExisting = value;
    }

    const seq = await tx.sequence.upsert({
      where: {
        organizationId_moduleId_stem: { organizationId, moduleId: module.id, stem: "" },
      },
      create: {
        organizationId,
        moduleId: module.id,
        stem: "",
        lastNumber: Math.max(2401, highestExisting + 1),
      },
      update: { lastNumber: { increment: 1 } },
    });
    return `${module.prefix}-${seq.lastNumber}`;
  });
}

/**
 * The Indian financial year a date belongs to, as "26-27".
 * A financial year runs April → March, so January still belongs to the year
 * that started the previous April.
 */
export function financialYearLabel(date: string): string {
  const parsed = new Date(`${(date || "").slice(0, 10)}T00:00:00`);
  const when = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const year = when.getFullYear();
  const month = when.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  const short = (value: number) => String(value % 100).padStart(2, "0");
  return `${short(start)}-${short(start + 1)}`;
}

/** The invoice prefix the organisation configured, e.g. "HT-INV-". */
export async function invoiceNumberPrefix(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = parseJson<{ invoicePrefix?: string }>(organization?.settings ?? "{}", {});
  return settings.invoicePrefix?.trim() || "INV-";
}

/**
 * Sequential, financial-year invoice numbers: HT-INV-26-27-0001.
 *
 * GST expects an unbroken serial series per financial year. The number is
 * derived from a `Sequence` counter keyed by organisation + "finance" +
 * the invoice stem (prefix + financial year), atomically incremented inside
 * a transaction. Deleting a record never re-uses a number and a gap is
 * visible rather than silently filled.
 */
export async function nextInvoiceNumber(
  organizationId: string,
  date: string,
  prefix: string,
): Promise<string> {
  const stem = `${prefix}${financialYearLabel(date)}-`;
  return prisma.$transaction(async (tx) => {
    const isPg = !env.DATABASE_URL.startsWith("file:");
    if (isPg) {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    }

    // Migrate the highest existing invoice number on first use so the
    // sequence continues seamlessly from the old scan-based approach.
    const existing = await tx.record.findMany({
      where: { organizationId, moduleId: "finance", reference: { startsWith: stem } },
      select: { reference: true },
    });
    let highestExisting = 0;
    for (const row of existing) {
      const match = row.reference.slice(stem.length).match(/^(\d+)$/);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > highestExisting) highestExisting = value;
    }

    const seq = await tx.sequence.upsert({
      where: {
        organizationId_moduleId_stem: { organizationId, moduleId: "finance", stem },
      },
      create: {
        organizationId,
        moduleId: "finance",
        stem,
        lastNumber: Math.max(1, highestExisting + 1),
      },
      update: { lastNumber: { increment: 1 } },
    });
    return `${stem}${String(seq.lastNumber).padStart(4, "0")}`;
  });
}

/** Serialises a record for export / create / update payloads. */
export function normalizeExtra(input: unknown): string {
  return stringifyJson(input && typeof input === "object" ? input : {});
}

/**
 * Narrows a record query to the branch the caller is allowed to see.
 *
 * A branch-scoped role sees only records that belong to its own branch, plus
 * records that are not tied to a branch at all (shared, head-office items).
 * An explicit `branch` filter always wins, so a manager can still look at a
 * sibling branch if the permission layer above allows it.
 */
export function applyBranchScope(
  where: Prisma.RecordWhereInput,
  auth: { roleKey: string; branchId: string | null },
  requestedBranch?: string,
): Prisma.RecordWhereInput {
  if (requestedBranch) {
    // An explicit branch filter selects that branch exactly, so a name like
    // "Mumbai" never accidentally matches "Mumbai East".
    where.branchName = requestedBranch;
    // A query string must never widen a role's scope: asking for another
    // branch narrows to the caller's own branch, which matches nothing rather
    // than showing a sibling branch's records.
    if (isBranchScoped(auth.roleKey) && auth.branchId) where.branchId = auth.branchId;
    return where;
  }
  if (!isBranchScoped(auth.roleKey)) return where;
  if (!auth.branchId) return where;
  // Keep branch scope in its own AND clause. If a caller has already filled
  // `where.OR` with a free-text search, appending the branch disjuncts to that
  // same `OR` would let any matching sibling-branch record through.
  where.AND = [
    ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
    { OR: [{ branchId: auth.branchId }, { branchId: null }] },
  ];
  return where;
}

/**
 * Builds the where clause for a record list.
 *
 * `q` is the free-text search used by the workspace search box. It covers
 * name, reference, destination, email, phone, owner and notes so a user can
 * find a customer by any detail they remember.
 */
export function buildRecordWhere(
  organizationId: string,
  module: ModuleDef,
  query: Record<string, unknown>,
  auth?: { roleKey: string; branchId: string | null },
): Prisma.RecordWhereInput {
  const where: Prisma.RecordWhereInput = {
    organizationId,
    moduleId: module.id,
    deletedAt: null,
  };

  const { status, destination, owner, branch, source, search, tab, from, to, q, ownerId } =
    query as Record<string, string | undefined>;

  if (status && status !== "all") where.status = { in: status.split(",") };
  if (destination) where.destination = containsText(destination);
  if (owner) where.ownerName = containsText(owner);
  if (source) where.source = { in: source.split(",") };
  if (tab && tab !== "all" && module.tabs.includes(tab)) where.tab = tab;
  if (from || to) {
    where.date = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  if (ownerId) where.ownerId = ownerId;

  const freeText = search || q;
  if (freeText) {
    const match = containsText(freeText);
    where.OR = [
      { name: match },
      { reference: match },
      { destination: match },
      { email: match },
      { phone: match },
      { notes: match },
      { ownerName: match },
      { detail: match },
      // Custom field values live in the `extra` JSON column, and so does the
      // list of references a merged-away duplicate used to answer to. Searching
      // the raw column means typing an old reference ("LD-2401") still finds
      // the record that absorbed it, and a custom field is searchable at all.
      { extra: containsText(freeText) },
    ];
  }

  return applyBranchScope(where, auth ?? { roleKey: "company_admin", branchId: null }, branch);
}
