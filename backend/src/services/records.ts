import type { Prisma, Record as RecordModel } from "@prisma/client";
import { prisma } from "../lib/prisma";
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

export function toRecordDto(record: RecordModel): RecordDto {
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
): Promise<{ ownerId: string | null; ownerName: string; branchId: string | null; branchName: string }> {
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

/** Generates the next human-friendly reference, e.g. LD-2409. */
export async function nextReference(organizationId: string, module: ModuleDef): Promise<string> {
  const latest = await prisma.record.findFirst({
    where: { organizationId, moduleId: module.id },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  const match = latest?.reference?.match(/(\d+)$/);
  const next = match ? Number(match[1]) + 1 : 2401;
  return `${module.prefix}-${next}`;
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
    where.branchName = { contains: requestedBranch };
    return where;
  }
  if (!isBranchScoped(auth.roleKey)) return where;
  if (!auth.branchId) return where;
  where.OR = [
    ...(where.OR ?? []),
    { branchId: auth.branchId },
    { branchId: null },
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

  const { status, destination, owner, branch, source, search, tab, from, to, q, ownerId, mine } =
    query as Record<string, string | undefined>;

  if (status && status !== "all") where.status = { in: status.split(",") };
  if (destination) where.destination = { contains: destination };
  if (owner) where.ownerName = { contains: owner };
  if (source) where.source = { in: source.split(",") };
  if (tab && tab !== "all" && module.tabs.includes(tab)) where.tab = tab;
  if (from || to) {
    where.date = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  if (ownerId) where.ownerId = ownerId;
  if (mine === "true") where.ownerId = auth?.branchId ? undefined : where.ownerId;

  const freeText = search || q;
  if (freeText) {
    where.OR = [
      { name: { contains: freeText } },
      { reference: { contains: freeText } },
      { destination: { contains: freeText } },
      { email: { contains: freeText } },
      { phone: { contains: freeText } },
      { notes: { contains: freeText } },
      { ownerName: { contains: freeText } },
      { detail: { contains: freeText } },
    ];
  }

  return applyBranchScope(where, auth ?? { roleKey: "company_admin", branchId: null }, branch);
}
