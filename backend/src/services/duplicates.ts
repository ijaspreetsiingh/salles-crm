import type { Prisma, Record as RecordModel } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { BadRequestError } from "../lib/errors";
import type { ModuleDef } from "../domain/modules";
import { applyBranchScope, toRecordDto, type RecordDto } from "./records";

/* ==========================================================================
   Duplicates.

   A travel business that has been running for years always has the same
   customer twice: once from the website form, once typed in by hand at the
   counter. Both look real, both may have been quoted, and the team only finds
   out when somebody calls a person who says "I already booked that".

   So: find the records a person would call "the same thing", let a human
   choose which one survives, and move the work across rather than deleting it.
   Nothing is guessed — every group says *why* it is a group.
   ========================================================================== */

export type DuplicateMember = {
  id: string;
  reference: string;
  name: string;
  destination: string;
  owner: string;
  branch: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  email: string;
  phone: string;
  createdAt: string;
  /** How many fields carry a value — the fullest record is the better survivor. */
  filled: number;
};

export type DuplicateGroup = {
  /** Stable id for the group (the oldest record's reference). */
  key: string;
  /** Plain sentences, e.g. "Same email address". */
  reasons: string[];
  records: DuplicateMember[];
};

/** How many records one module scan looks at, so a huge table never stalls. */
const SCAN_LIMIT = 4000;

/** Company names carry suffixes that are not part of the name. */
const LEGAL_SUFFIX =
  /\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|gmbh|plc)\b/g;

const normalizeName = (value: string, stripSuffix: boolean) => {
  let text = ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
  if (stripSuffix) text = text.replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ");
  return text.trim();
};

const normalizeEmail = (value: string) => {
  const text = value.toLowerCase().trim();
  return text.includes("@") ? text : "";
};

/** Last ten digits, so "+91 98765 43210" and "9876543210" are the same line. */
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
};

/** How many fields carry a value — the fullest record is the better survivor. */
const countFilled = (row: {
  detail?: string;
  destination?: string;
  owner?: string;
  branch?: string;
  date?: string;
  email?: string;
  phone?: string;
  notes?: string;
  source?: string;
  amount?: number;
}) =>
  [
    row.detail,
    row.destination,
    row.owner,
    row.branch,
    row.date,
    row.email,
    row.phone,
    row.notes,
    row.source,
  ].filter((value) => Boolean(value && value.trim())).length + (row.amount ? 1 : 0);

/**
 * One record, reduced to just the fields duplicate detection cares about.
 * Keeping this apart from the Prisma model is what makes the grouping itself
 * testable without a database.
 */
export type DuplicateCandidate = {
  id: string;
  reference: string;
  name: string;
  destination?: string;
  owner?: string;
  branch?: string;
  date?: string;
  amount?: number;
  currency?: string;
  status?: string;
  email?: string;
  phone?: string;
  /** The oldest is offered as the survivor, so the order matters. */
  createdAt: Date;
  /** How many fields carry a value. Defaults to counting the fields above. */
  filled?: number;
};

/** Turns a stored record into a candidate for the duplicate scan. */
export const toCandidate = (record: RecordModel): DuplicateCandidate => ({
  id: record.id,
  reference: record.reference,
  name: record.name,
  destination: record.destination,
  owner: record.ownerName,
  branch: record.branchName,
  date: record.date,
  amount: record.amount,
  currency: record.currency,
  status: record.status,
  email: record.email,
  phone: record.phone,
  createdAt: record.createdAt,
  filled:
    countFilled({
      destination: record.destination,
      owner: record.ownerName,
      branch: record.branchName,
      date: record.date,
      email: record.email,
      phone: record.phone,
      notes: record.notes,
      source: record.source,
      detail: record.detail,
      amount: record.amount,
    }) || 0,
});

const toMember = (candidate: DuplicateCandidate): DuplicateMember => ({
  id: candidate.id,
  reference: candidate.reference,
  name: candidate.name,
  destination: candidate.destination ?? "",
  owner: candidate.owner ?? "",
  branch: candidate.branch ?? "",
  date: candidate.date ?? "",
  amount: candidate.amount ?? 0,
  currency: candidate.currency ?? "",
  status: candidate.status ?? "",
  email: candidate.email ?? "",
  phone: candidate.phone ?? "",
  createdAt: candidate.createdAt.toISOString(),
  filled: candidate.filled ?? countFilled(candidate),
});

const push = (map: Map<string, number[]>, key: string, index: number) => {
  const list = map.get(key);
  if (list) list.push(index);
  else map.set(key, [index]);
};

/**
 * Groups records that a person would treat as one.
 *
 * Three signals — the same email, the same phone number, the same name — are
 * folded together with a union-find, so one customer who matches on email
 * *and* phone appears once, saying both, instead of in two separate lists.
 */
export async function findDuplicateGroups(
  organizationId: string,
  module: ModuleDef,
  auth: { roleKey: string; branchId: string | null },
  limit = 20,
): Promise<{ groups: DuplicateGroup[]; scanned: number }> {
  const records = await prisma.record.findMany({
    where: applyBranchScope({ organizationId, moduleId: module.id, deletedAt: null }, auth),
    orderBy: { createdAt: "asc" },
    take: SCAN_LIMIT,
  });

  return {
    groups: groupDuplicates(records.map(toCandidate), {
      stripSuffix: module.id === "companies" || module.id === "agents",
      limit,
    }),
    scanned: records.length,
  };
}

/**
 * The grouping itself, with no database in sight.
 *
 * Two records belong together when they share an email, a phone number or a
 * name. Those three signals are folded with a union-find, so a customer who
 * matches on email *and* phone appears once, saying both, instead of twice in
 * two separate lists.
 */
export function groupDuplicates(
  candidates: DuplicateCandidate[],
  options: { stripSuffix?: boolean; limit?: number } = {},
): DuplicateGroup[] {
  const records = candidates;
  const stripSuffix = options.stripSuffix === true;
  const limit = options.limit ?? 20;
  const parent = records.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    // Path compression, so a long chain never slows the next lookup.
    let walk = index;
    while (parent[walk] !== walk) {
      const next = parent[walk]!;
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };

  const nameReason = stripSuffix ? "Same company name" : "Same name";
  const signals: Array<{ reason: string; buckets: Map<string, number[]> }> = [
    { reason: "Same email address", buckets: new Map() },
    { reason: "Same phone number", buckets: new Map() },
    { reason: nameReason, buckets: new Map() },
  ];

  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    const name = normalizeName(record.name, stripSuffix);
    const email = normalizeEmail(record.email ?? "");
    const phone = normalizePhone(record.phone ?? "");
    if (name.length > 2) push(signals[2]!.buckets, name, index);
    if (email) push(signals[0]!.buckets, email, index);
    if (phone) push(signals[1]!.buckets, phone, index);
  }

  // Union every bucket that holds more than one record.
  for (const signal of signals) {
    for (const indices of signal.buckets.values()) {
      for (const index of indices) union(indices[0]!, index);
    }
  }

  // The union is done, so a bucket's reason can now be attributed to whichever
  // component its records landed in.
  const reasonsByRoot = new Map<number, Set<string>>();
  for (const signal of signals) {
    for (const indices of signal.buckets.values()) {
      if (indices.length < 2) continue;
      const root = find(indices[0]!);
      const set = reasonsByRoot.get(root) ?? new Set<string>();
      set.add(signal.reason);
      reasonsByRoot.set(root, set);
    }
  }

  const components = new Map<number, number[]>();
  for (let index = 0; index < records.length; index++) {
    const root = find(index);
    const list = components.get(root);
    if (list) list.push(index);
    else components.set(root, [index]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, indices] of components) {
    if (indices.length < 2 || indices.length > 6) continue;
    const members = indices
      .map((index) => records[index]!)
      // Oldest first: that is usually the record the team has been quoting,
      // and the reference printed on old paperwork.
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toMember);
    groups.push({
      key: members[0]!.reference,
      reasons: [...(reasonsByRoot.get(find(root)) ?? new Set<string>())].sort(),
      records: members,
    });
  }

  groups.sort(
    (a, b) =>
      b.records.length - a.records.length ||
      a.key.localeCompare(b.key, undefined, { numeric: true }),
  );

  // A group of seven is not a duplicate pair any more, it is a data-modelling
  // problem. Those are counted in `scanned` but never offered for merging.
  return groups.slice(0, limit);
}

/** Text fields a merge may fill from a duplicate. Never overwrites a value. */
const FILL_FIELDS = [
  "detail",
  "destination",
  "date",
  "email",
  "phone",
  "source",
  "notes",
  "tab",
] as const;

export type MergeResult = {
  record: RecordDto;
  mergedReferences: string[];
  /** Child rows re-pointed at the surviving record, by kind. */
  moved: Record<string, number>;
};

/**
 * Folds duplicates into one record.
 *
 * The survivor keeps its reference (so old paperwork still resolves), gains
 * any field that was empty and the duplicates had, and inherits their tasks,
 * conversations, call logs, attachments and notifications. The duplicates are
 * soft-deleted, not erased, and remember where their history went.
 */
export async function mergeRecords(input: {
  organizationId: string;
  module: ModuleDef;
  keepReference: string;
  mergeReferences: string[];
  auth: { roleKey: string; branchId: string | null };
  actorId: string;
}): Promise<MergeResult> {
  const rows = await prisma.record.findMany({
    where: applyBranchScope(
      { organizationId: input.organizationId, moduleId: input.module.id, deletedAt: null },
      input.auth,
    ),
  });
  const found = new Map(rows.map((row) => [row.reference, row]));

  const keep = found.get(input.keepReference);
  if (!keep) throw new BadRequestError(`No record with reference ${input.keepReference} is open`);
  const donors = input.mergeReferences.map((reference) => {
    const donor = found.get(reference);
    if (!donor) throw new BadRequestError(`No record with reference ${reference} is open`);
    return donor;
  });

  /* ---- fields: fill the gaps, never overwrite ---- */

  // `Unchecked` so the patch can carry the scalar ownerId / branchId it copies
  // off a duplicate, rather than a nested relation write.
  const patch: Prisma.RecordUncheckedUpdateInput = {};
  for (const field of FILL_FIELDS) {
    if (keep[field]) continue;
    const donor = donors.find((row) => row[field]);
    if (donor) patch[field] = donor[field] as string;
  }
  if (!keep.amount) {
    const donor = donors.find((row) => row.amount > 0);
    if (donor) patch.amount = donor.amount;
  }
  if (!keep.currency) {
    const donor = donors.find((row) => row.currency);
    if (donor) patch.currency = donor.currency;
  }
  if (!keep.ownerName) {
    const donor = donors.find((row) => row.ownerName);
    if (donor) {
      patch.ownerId = donor.ownerId;
      patch.ownerName = donor.ownerName;
    }
  }
  if (!keep.branchName) {
    const donor = donors.find((row) => row.branchName);
    if (donor) {
      patch.branchId = donor.branchId;
      patch.branchName = donor.branchName;
    }
  }

  const keepExtra = parseJson<Record<string, unknown>>(keep.extra, {});
  for (const donor of donors) {
    for (const [key, value] of Object.entries(
      parseJson<Record<string, unknown>>(donor.extra, {}),
    )) {
      if (keepExtra[key] === undefined || keepExtra[key] === "" || keepExtra[key] === null) {
        keepExtra[key] = value;
      }
    }
  }
  // The references the duplicates used to answer to, so searching the old code
  // still lands on the surviving record.
  const mergedReferences = donors.map((donor) => donor.reference);
  keepExtra.mergedReferences = [
    ...new Set([
      ...((keepExtra.mergedReferences as string[] | undefined) ?? []),
      ...mergedReferences,
    ]),
  ];
  patch.extra = JSON.stringify(keepExtra);
  patch.updatedById = input.actorId;

  /* ---- the work moves across; nothing is orphaned ---- */

  const donorIds = donors.map((donor) => donor.id);
  const [tasks, notifications, conversations, callLogs, attachments] = await Promise.all([
    prisma.task.updateMany({
      where: { organizationId: input.organizationId, relatedRecordId: { in: donorIds } },
      data: { relatedRecordId: keep.id },
    }),
    prisma.notification.updateMany({
      where: { organizationId: input.organizationId, recordId: { in: donorIds } },
      data: { recordId: keep.id },
    }),
    prisma.conversation.updateMany({
      where: { organizationId: input.organizationId, recordId: { in: donorIds } },
      data: { recordId: keep.id },
    }),
    prisma.callLog.updateMany({
      where: { organizationId: input.organizationId, recordId: { in: donorIds } },
      data: { recordId: keep.id },
    }),
    prisma.attachment.updateMany({
      where: { organizationId: input.organizationId, recordId: { in: donorIds } },
      data: { recordId: keep.id },
    }),
  ]);

  const survivor = await prisma.record.update({ where: { id: keep.id }, data: patch });

  const mergedAt = new Date().toISOString();
  // Each merged record remembers where its history went, so the trail stays
  // readable months later instead of looking like a plain deletion.
  for (const donor of donors) {
    const meta = parseJson<Record<string, unknown>>(donor.meta, {});
    meta.mergedInto = survivor.reference;
    meta.mergedAt = mergedAt;
    await prisma.record.update({
      where: { id: donor.id },
      data: { deletedAt: new Date(), meta: JSON.stringify(meta), updatedById: input.actorId },
    });
  }

  return {
    record: toRecordDto(survivor),
    mergedReferences,
    moved: {
      tasks: tasks.count,
      conversations: conversations.count,
      notifications: notifications.count,
      callLogs: callLogs.count,
      attachments: attachments.count,
    },
  };
}
