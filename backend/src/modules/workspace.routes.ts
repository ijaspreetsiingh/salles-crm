import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import { getPagination, paginated } from "../lib/pagination";
import { toCsv } from "../lib/csv";
import { stringifyJson } from "../lib/utils";
import { MODULES, moduleGroups } from "../domain/modules";
import { hasPermission } from "../domain/rbac";
import {
  applyBranchScope,
  buildRecordWhere,
  nextReference,
  normalizeExtra,
  resolveOwnerBranch,
  toRecordDto,
} from "../services/records";
import { recordAudit } from "../services/audit";
import { createNotification } from "../services/notifications";
import { importRecords } from "../services/import";
import { buildAttention } from "../services/attention";
import { findDuplicateGroups, mergeRecords } from "../services/duplicates";

const router = Router();
router.use(requireAuth);

const recordBodySchema = z.object({
  name: z.string().min(1).max(160),
  reference: z.string().max(40).optional(),
  detail: z.string().max(400).optional(),
  destination: z.string().max(160).optional(),
  owner: z.string().max(120).optional(),
  branch: z.string().max(120).optional(),
  date: z
    .string()
    .max(40)
    .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), "Invalid date")
    .optional(),
  amount: z.coerce.number().min(0).max(1_000_000_000).optional(),
  currency: z
    .string()
    .max(6)
    .refine((v) => v === undefined || v === "" || /^[A-Z]{3}$/.test(v), "Invalid currency code")
    .optional(),
  status: z.string().max(60).optional(),
  email: z
    .string()
    .max(160)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email")
    .optional(),
  phone: z.string().max(40).optional(),
  source: z.string().max(60).optional(),
  notes: z.string().max(4000).optional(),
  tab: z.string().max(80).optional(),
  extra: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
});

/**
 * Bulk edit payload.
 *
 * A row on screen is identified by its reference ("LD-2409"), not by the
 * database id, so the toolbar can send back exactly what the person ticked.
 * `ids` stays supported for the API and for scripts.
 */
const bulkSchema = z
  .object({
    action: z.enum(["assign", "status", "delete"]),
    ids: z.array(z.string().min(1)).max(500).optional(),
    references: z.array(z.string().min(1)).max(500).optional(),
    value: z.string().max(120).optional(),
  })
  .refine((body) => (body.ids?.length ?? 0) + (body.references?.length ?? 0) > 0, {
    message: "Select at least one record",
    path: ["references"],
  });

const statusOf = (moduleId: string, value?: string) => {
  const module = MODULES.find((m) => m.id === moduleId)!;
  return value ?? module.statuses[0] ?? "Pending";
};

const assertValidStatus = (module: { statuses: string[] }, value?: string) => {
  if (value !== undefined && !module.statuses.includes(value)) {
    throw new BadRequestError(`"${value}" is not a valid status for this module`);
  }
};

/** Module catalogue for the navigation shell. */
router.get(
  "/modules",
  asyncHandler(async (_req, res) => ok(res, { modules: MODULES, groups: moduleGroups() })),
);

/** How many records of one module the sign-in cache keeps. */
const CONTEXT_PER_MODULE = 300;

/**
 * A recent slice of every module, in a single call.
 *
 * The app needs all 24 modules on sign-in for cross-module context (customer
 * history, related bookings, the record drawer). Fetching them one by one
 * made twenty-four round trips on every load, so one call keeps first paint
 * instant.
 *
 * This is deliberately a *slice*, not the whole company. Module screens load
 * their own records page by page, so a busy module no longer starves the
 * others out of a shared ceiling, and nothing here decides what a list shows.
 */
router.get(
  "/all-records",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const allowedModules =
      req.auth!.permissions.modules === "*" ? null : req.auth!.permissions.modules;
    const records = await prisma.record.findMany({
      where: applyBranchScope({ organizationId, deletedAt: null }, req.auth!),
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const grouped: Record<string, ReturnType<typeof toRecordDto>[]> = {};
    for (const record of records) {
      if (allowedModules && !allowedModules.includes(record.moduleId)) continue;
      const bucket = (grouped[record.moduleId] ??= []);
      if (bucket.length >= CONTEXT_PER_MODULE) continue;
      bucket.push(toRecordDto(record));
    }
    return ok(res, grouped);
  }),
);

/**
 * The work that needs a human today, already narrowed to one person.
 *
 * The old home page built its list from the capped all-records cache, so in a
 * busy workspace it showed whatever happened to fit rather than what this
 * person owns — and it never saw records beyond the cache. This queries the
 * database directly, so the list stays true at any size.
 *
 * The same service feeds the daily email digest, so the inbox and the screen
 * can never disagree about the day's work.
 */
router.get(
  "/attention",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const scope = req.query.scope === "team" ? "team" : "mine";
    const branch = typeof req.query.branch === "string" ? req.query.branch : undefined;
    return ok(
      res,
      await buildAttention(
        req.auth!.organizationId,
        {
          name: req.auth!.name,
          roleKey: req.auth!.roleKey,
          branchId: req.auth!.branchId,
          modules: req.auth!.permissions.modules,
        },
        scope,
        branch,
      ),
    );
  }),
);

/** Paginated, filterable record list for a module. */
router.get(
  "/:module/records",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const organizationId = req.auth!.organizationId;
    const where = buildRecordWhere(
      organizationId,
      module,
      req.query as Record<string, unknown>,
      req.auth!,
    );
    const p = getPagination(req.query as Record<string, unknown>);

    const sortable = new Set([
      "date",
      "amount",
      "name",
      "status",
      "createdAt",
      "updatedAt",
      "reference",
    ]);
    const sortField = sortable.has(String(req.query.sort)) ? String(req.query.sort) : "createdAt";
    const order: Prisma.SortOrder = req.query.order === "asc" ? "asc" : "desc";
    const orderBy = { [sortField]: order } as Prisma.RecordOrderByWithRelationInput;

    const [items, total] = await Promise.all([
      prisma.record.findMany({
        where,
        orderBy,
        skip: p.skip,
        take: p.take,
      }),
      prisma.record.count({ where }),
    ]);

    return ok(res, paginated(items.map(toRecordDto), total, p));
  }),
);

/**
 * Distinct filter values for the toolbar, with the counts behind them.
 *
 * The counts are the reason this endpoint exists: a list that loads one page
 * at a time cannot count its own statuses, and a filter menu that says "12"
 * when 4,000 records match is worse than one that says nothing.
 */
router.get(
  "/:module/facets",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");
    const organizationId = req.auth!.organizationId;
    const base = applyBranchScope(
      { organizationId, moduleId: module.id, deletedAt: null },
      req.auth!,
    );

    const [owners, branches, sources, statusGroups, ownerGroups] = await Promise.all([
      prisma.record.findMany({ where: base, distinct: ["ownerName"], select: { ownerName: true } }),
      prisma.record.findMany({
        where: base,
        distinct: ["branchName"],
        select: { branchName: true },
      }),
      prisma.record.findMany({ where: base, distinct: ["source"], select: { source: true } }),
      prisma.record.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
      prisma.record.groupBy({ by: ["ownerName"], where: base, _count: { _all: true } }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of statusGroups) if (row.status) statusCounts[row.status] = row._count._all;
    const ownerCounts: Record<string, number> = {};
    for (const row of ownerGroups) {
      if (row.ownerName) ownerCounts[row.ownerName] = row._count._all;
      else ownerCounts[""] = row._count._all;
    }

    return ok(res, {
      tabs: module.tabs,
      statuses: Object.keys(statusCounts),
      owners: owners.map((o) => o.ownerName).filter(Boolean),
      branches: branches.map((b) => b.branchName).filter(Boolean),
      sources: sources.map((s) => s.source).filter(Boolean),
      statusCounts,
      ownerCounts,
    });
  }),
);

/**
 * Aggregated numbers for the header of a module.
 *
 * The same filters as the list apply, so "New enquiries: 14" counts the whole
 * filtered set — not the one page the browser happens to hold.
 */
router.get(
  "/:module/stats",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");
    const organizationId = req.auth!.organizationId;
    const base = buildRecordWhere(
      organizationId,
      module,
      req.query as Record<string, unknown>,
      req.auth!,
    );

    const [total, active, awaiting, value] = await Promise.all([
      prisma.record.count({ where: base }),
      prisma.record.count({
        where: {
          ...base,
          status: {
            in: module.statuses.filter((s) =>
              ["Confirmed", "Won", "Paid", "Accepted", "Active", "Approved", "Published"].includes(
                s,
              ),
            ),
          },
        },
      }),
      prisma.record.count({
        where: {
          ...base,
          status: {
            in: [
              "Pending",
              "On hold",
              "In review",
              "Draft",
              "Contacted",
              "Open",
              "Documents pending",
              "Overdue",
              "Sent",
            ],
          },
        },
      }),
      prisma.record.aggregate({ where: base, _sum: { amount: true } }),
    ]);

    const byStatus = await prisma.record.groupBy({
      by: ["status"],
      where: base,
      _count: { _all: true },
      _sum: { amount: true },
    });

    const isFinance = module.id === "finance";
    const collected = isFinance
      ? await prisma.record.aggregate({
          where: { ...base, status: "Paid" },
          _sum: { amount: true },
        })
      : null;

    return ok(res, {
      moduleId: module.id,
      total,
      active,
      awaiting,
      contractValue: value._sum.amount ?? 0,
      collected: collected?._sum.amount ?? 0,
      variant: isFinance ? "finance" : "default",
      breakdown: byStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
        amount: row._sum.amount ?? 0,
      })),
    });
  }),
);

/** Single record. */
router.get(
  "/:module/records/:id",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const record = await prisma.record.findFirst({
      where: applyBranchScope(
        { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
        req.auth!,
      ),
    });
    if (!record) throw new NotFoundError("Record");
    return ok(res, toRecordDto(record));
  }),
);

/** Creates a record in a module. */
router.post(
  "/:module/records",
  requirePermission("create"),
  validate(recordBodySchema),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const body = req.body as z.infer<typeof recordBodySchema>;
    assertValidStatus(module, body.status);
    const organizationId = req.auth!.organizationId;
    const { ownerId, ownerName, branchId, branchName } = await resolveOwnerBranch(
      organizationId,
      body.owner,
      body.branch,
    );

    // Two records created in the same second can race for the same reference —
    // retry with the next free one instead of failing the save.
    let record = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference =
        body.reference ??
        (await nextReference(organizationId, module)) + (attempt ? `-${attempt + 1}` : "");
      try {
        record = await prisma.record.create({
          data: {
            organizationId,
            moduleId: module.id,
            tab: body.tab ?? module.tabs[0] ?? null,
            reference,
            name: body.name,
            detail: body.detail ?? "",
            destination: body.destination ?? "",
            ownerId,
            ownerName,
            branchId,
            branchName,
            date: body.date ?? new Date().toISOString().slice(0, 10),
            amount: body.amount ?? 0,
            currency: body.currency ?? "",
            status: statusOf(module.id, body.status),
            email: body.email ?? "",
            phone: body.phone ?? "",
            source: body.source ?? "Website",
            notes: body.notes ?? "",
            extra: normalizeExtra(body.extra),
            meta: stringifyJson(body.meta ?? {}),
            createdById: req.auth!.userId,
          },
        });
        break;
      } catch (error) {
        const isConflict =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "P2002";
        if (!isConflict) throw error;
      }
    }
    if (!record) throw new BadRequestError("Could not allocate a reference for this record");

    await Promise.all([
      recordAudit({
        organizationId,
        action: "Created",
        moduleId: module.id,
        recordId: record.id,
        label: `${record.reference} · ${record.name}`,
        req,
      }),
      createNotification({
        organizationId,
        title: `${module.name}: new record created`,
        body: `${record.reference} · ${record.name}`,
        moduleId: module.id,
        recordId: record.id,
        level: "success",
      }),
    ]);

    return created(res, toRecordDto(record));
  }),
);

/** Updates a record. */
router.patch(
  "/:module/records/:id",
  requirePermission("edit"),
  validate(recordBodySchema.partial()),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const existing = await prisma.record.findFirst({
      where: applyBranchScope(
        { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
        req.auth!,
      ),
    });
    if (!existing) throw new NotFoundError("Record");

    const body = req.body as Partial<z.infer<typeof recordBodySchema>>;
    assertValidStatus(module, body.status);
    const resolved =
      body.owner !== undefined || body.branch !== undefined
        ? await resolveOwnerBranch(
            req.auth!.organizationId,
            body.owner ?? existing.ownerName,
            body.branch ?? existing.branchName,
          )
        : null;

    const record = await prisma.record.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        detail: body.detail,
        destination: body.destination,
        date: body.date,
        amount: body.amount,
        currency: body.currency === "" ? "" : body.currency,
        status: body.status,
        email: body.email,
        phone: body.phone,
        source: body.source,
        notes: body.notes,
        tab: body.tab,
        reference: body.reference,
        extra: body.extra ? normalizeExtra(body.extra) : undefined,
        meta: body.meta ? stringifyJson(body.meta) : undefined,
        ownerId: resolved?.ownerId,
        ownerName: resolved?.ownerName,
        branchId: resolved?.branchId,
        branchName: resolved?.branchName,
        updatedById: req.auth!.userId,
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: module.id,
      recordId: record.id,
      label: `${record.reference} updated`,
      meta: { fields: Object.keys(body) },
      req,
    });

    return ok(res, toRecordDto(record));
  }),
);

/** Soft-deletes a record (kept for audit and reporting history). */
router.delete(
  "/:module/records/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const existing = await prisma.record.findFirst({
      where: applyBranchScope(
        { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
        req.auth!,
      ),
    });
    if (!existing) throw new NotFoundError("Record");

    await prisma.record.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedById: req.auth!.userId },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: module.id,
      recordId: existing.id,
      label: `${existing.reference} deleted`,
      req,
    });

    return ok(res, { deleted: true });
  }),
);

/** Restores a soft-deleted record (admin recovery). */
router.post(
  "/:module/records/:id/restore",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const existing = await prisma.record.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.auth!.organizationId,
        deletedAt: { not: null },
      },
    });
    if (!existing) throw new NotFoundError("Deleted record");

    const record = await prisma.record.update({
      where: { id: existing.id },
      data: { deletedAt: null, updatedById: req.auth!.userId },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Restored",
      moduleId: module.id,
      recordId: record.id,
      label: `${record.reference} restored`,
      req,
    });

    return ok(res, toRecordDto(record));
  }),
);

/** Bulk assign / status change / delete from the table toolbar. */
router.post(
  "/:module/records/bulk",
  requirePermission("edit"),
  validate(bulkSchema),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const { action, ids, references, value } = req.body as z.infer<typeof bulkSchema>;
    const organizationId = req.auth!.organizationId;
    const selector: Prisma.RecordWhereInput = ids?.length
      ? { id: { in: ids } }
      : { reference: { in: references! } };
    const where = applyBranchScope(
      { ...selector, organizationId, moduleId: module.id, deletedAt: null },
      req.auth!,
    );

    if (action === "delete") {
      const result = await prisma.record.updateMany({ where, data: { deletedAt: new Date() } });
      await recordAudit({
        organizationId,
        action: "Deleted",
        moduleId: module.id,
        label: `${result.count} records deleted`,
        req,
      });
      return ok(res, { affected: result.count });
    }

    if (action === "status") {
      if (!value) throw new BadRequestError("value (status) is required");
      // A bulk change must obey the same status list a single edit does, or a
      // typo in the toolbar could park 400 records in a status the module has
      // never heard of.
      assertValidStatus(module, value);
      const result = await prisma.record.updateMany({
        where,
        data: { status: value, updatedById: req.auth!.userId },
      });
      await recordAudit({
        organizationId,
        action: "Updated",
        moduleId: module.id,
        label: `${result.count} records set to ${value}`,
        req,
      });
      return ok(res, { affected: result.count });
    }

    // assign — an empty value hands the records back to the unclaimed queue.
    if (value === undefined) throw new BadRequestError("value (owner) is required");
    const resolved = await resolveOwnerBranch(organizationId, value, undefined);
    const result = await prisma.record.updateMany({
      where,
      data: {
        ownerId: resolved.ownerId,
        ownerName: resolved.ownerName,
        updatedById: req.auth!.userId,
      },
    });
    await recordAudit({
      organizationId,
      action: "Assigned",
      moduleId: module.id,
      label: `${result.count} records assigned to ${value || "the unclaimed queue"}`,
      req,
    });
    return ok(res, { affected: result.count });
  }),
);

const importSchema = z.object({
  // ~2 MB of CSV. Bigger files are split by the customer, and saying so is
  // kinder than a silent timeout.
  csv: z.string().min(1).max(2_000_000),
});

const mergeSchema = z.object({
  /** The reference that survives — usually the oldest, and the one on paperwork. */
  keep: z.string().min(1).max(40),
  /** The references folded into it. */
  merge: z.array(z.string().min(1).max(40)).min(1).max(5),
});

/**
 * Records that look like the same thing, grouped, each group saying why.
 *
 * Detection is deliberately conservative — an exact email, phone number or
 * name — because a merge tool that cries wolf gets clicked through, and a
 * wrong merge destroys two customers' history at once.
 */
router.get(
  "/:module/duplicates",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");
    return ok(res, await findDuplicateGroups(req.auth!.organizationId, module, req.auth!));
  }),
);

/**
 * Folds duplicates into one record.
 *
 * The duplicates are soft-deleted and re-pointed at the survivor, so this is
 * both an edit and a delete — a role that may not delete records may not
 * quietly remove them by merging either.
 */
router.post(
  "/:module/merge",
  requirePermission("edit"),
  validate(mergeSchema),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");
    if (!hasPermission(req.auth!.permissions, module.id, "delete")) {
      throw new ForbiddenError(`Your role cannot delete records in "${module.id}"`);
    }

    const { keep, merge } = req.body as z.infer<typeof mergeSchema>;
    if (merge.includes(keep)) {
      throw new BadRequestError("A record cannot be merged into itself");
    }

    const result = await mergeRecords({
      organizationId: req.auth!.organizationId,
      module,
      keepReference: keep,
      mergeReferences: merge,
      auth: req.auth!,
      actorId: req.auth!.userId,
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: module.id,
      recordId: result.record.id,
      label: `${merge.length} record${merge.length === 1 ? "" : "s"} merged into ${
        result.record.reference
      } (${merge.join(", ")})`,
      meta: { keep, merged: merge, moved: result.moved },
      req,
    });

    return ok(res, result);
  }),
);

/**
 * Imports a spreadsheet into a module.
 *
 * A business moving in from another system has three years of enquiries in a
 * CSV. Retyping them is the reason people give up on a new CRM in week one, so
 * this creates real records — owner and branch matched to the team that is
 * already here — and reports every row it could not use.
 */
router.post(
  "/:module/import",
  requirePermission("create"),
  validate(importSchema),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const result = await importRecords({
      organizationId: req.auth!.organizationId,
      module,
      csv: (req.body as z.infer<typeof importSchema>).csv,
      createdById: req.auth!.userId,
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: module.id,
      label: `${result.created} records imported from CSV${
        result.skipped ? `, ${result.skipped} skipped` : ""
      }`,
      req,
    });

    return ok(res, result);
  }),
);

/** CSV export honouring the same filters as the list endpoint. */
router.get(
  "/:module/export.csv",
  requirePermission("export"),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const organizationId = req.auth!.organizationId;
    const where = buildRecordWhere(
      organizationId,
      module,
      req.query as Record<string, unknown>,
      req.auth!,
    );
    const items = await prisma.record.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const csv = toCsv(
      items.map((r) => {
        const dto = toRecordDto(r);
        const extra = dto.extra as Record<string, string | number>;
        return {
          reference: dto.reference,
          name: dto.name,
          detail: dto.detail,
          destination: dto.destination,
          owner: dto.owner,
          branch: dto.branch,
          date: dto.date,
          amount: dto.amount,
          status: dto.status,
          email: dto.email,
          phone: dto.phone,
          source: dto.source,
          ...extra,
        };
      }),
      [
        { key: "reference", label: "Reference" },
        {
          key: "name",
          label: module.noun ? module.noun[0]!.toUpperCase() + module.noun.slice(1) : "Name",
        },
        { key: "detail", label: "Details" },
        { key: "destination", label: "Destination" },
        { key: "owner", label: "Owner" },
        { key: "branch", label: "Branch" },
        { key: "date", label: "Date" },
        { key: "amount", label: "Value" },
        { key: "status", label: "Status" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "source", label: "Source" },
      ],
    );

    await recordAudit({
      organizationId,
      action: "Export",
      moduleId: module.id,
      label: `Exported ${items.length} records`,
      req,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${module.id}-export.csv"`);
    return res.send(csv);
  }),
);

// Exports for consumers that only import this router module.
export default router;
