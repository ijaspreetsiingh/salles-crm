import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { getPagination, paginated } from "../lib/pagination";
import { toCsv } from "../lib/csv";
import { stringifyJson } from "../lib/utils";
import { MODULES, moduleGroups } from "../domain/modules";
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

const router = Router();
router.use(requireAuth);

const recordBodySchema = z.object({
  name: z.string().min(1).max(160),
  reference: z.string().max(40).optional(),
  detail: z.string().max(400).optional(),
  destination: z.string().max(160).optional(),
  owner: z.string().max(120).optional(),
  branch: z.string().max(120).optional(),
  date: z.string().max(40).optional(),
  amount: z.coerce.number().min(0).max(1_000_000_000).optional(),
  status: z.string().max(60).optional(),
  email: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  source: z.string().max(60).optional(),
  notes: z.string().max(4000).optional(),
  tab: z.string().max(80).optional(),
  extra: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
});

const bulkSchema = z.object({
  action: z.enum(["assign", "status", "delete"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
  value: z.string().max(120).optional(),
});

const statusOf = (moduleId: string, value?: string) => {
  const module = MODULES.find((m) => m.id === moduleId)!;
  return value ?? module.statuses[0] ?? "Pending";
};

/** Module catalogue for the navigation shell. */
router.get(
  "/modules",
  asyncHandler(async (_req, res) => ok(res, { modules: MODULES, groups: moduleGroups() })),
);

/**
 * Every record in the workspace, grouped by module, in a single call.
 *
 * The app needs all 24 modules on sign-in. Fetching them one by one made
 * twenty-four round trips on every load, which was slow and could trip the
 * rate limiter. One call keeps the first paint instant.
 */
router.get(
  "/all-records",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const records = await prisma.record.findMany({
      where: applyBranchScope({ organizationId, deletedAt: null }, req.auth!),
      orderBy: { createdAt: "desc" },
    });

    const grouped: Record<string, ReturnType<typeof toRecordDto>[]> = {};
    for (const record of records) {
      const bucket = (grouped[record.moduleId] ??= []);
      bucket.push(toRecordDto(record));
    }
    return ok(res, grouped);
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

    const sortable = new Set(["date", "amount", "name", "status", "createdAt", "updatedAt", "reference"]);
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

/** Distinct filter values (statuses, owners, branches, sources) for the toolbar. */
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

    const [owners, branches, sources, statuses] = await Promise.all([
      prisma.record.findMany({ where: base, distinct: ["ownerName"], select: { ownerName: true } }),
      prisma.record.findMany({ where: base, distinct: ["branchName"], select: { branchName: true } }),
      prisma.record.findMany({ where: base, distinct: ["source"], select: { source: true } }),
      prisma.record.findMany({ where: base, distinct: ["status"], select: { status: true } }),
    ]);

    return ok(res, {
      tabs: module.tabs,
      statuses: statuses.map((s) => s.status).filter(Boolean),
      owners: owners.map((o) => o.ownerName).filter(Boolean),
      branches: branches.map((b) => b.branchName).filter(Boolean),
      sources: sources.map((s) => s.source).filter(Boolean),
    });
  }),
);

/** Aggregate stats shown in the module header. */
router.get(
  "/:module/stats",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");
    const organizationId = req.auth!.organizationId;
    const base = applyBranchScope(
      { organizationId, moduleId: module.id, deletedAt: null },
      req.auth!,
    );

    const [total, active, awaiting, value] = await Promise.all([
      prisma.record.count({ where: base }),
      prisma.record.count({
        where: { ...base, status: { in: module.statuses.filter((s) => ["Confirmed", "Won", "Paid", "Accepted", "Active", "Approved", "Published"].includes(s)) } },
      }),
      prisma.record.count({
        where: { ...base, status: { in: ["Pending", "On hold", "In review", "Draft", "Contacted", "Open", "Documents pending", "Overdue", "Sent"] } },
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
      ? await prisma.record.aggregate({ where: { ...base, status: "Paid" }, _sum: { amount: true } })
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
    const organizationId = req.auth!.organizationId;
    const { ownerId, ownerName, branchId, branchName } = await resolveOwnerBranch(
      organizationId,
      body.owner,
      body.branch,
    );

    const record = await prisma.record.create({
      data: {
        organizationId,
        moduleId: module.id,
        tab: body.tab ?? module.tabs[0] ?? null,
        reference: body.reference ?? (await nextReference(organizationId, module)),
        name: body.name,
        detail: body.detail ?? "",
        destination: body.destination ?? "",
        ownerId,
        ownerName,
        branchId,
        branchName,
        date: body.date ?? new Date().toISOString().slice(0, 10),
        amount: body.amount ?? 0,
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

/** Bulk assign / status change / delete from the table toolbar. */
router.post(
  "/:module/records/bulk",
  requirePermission("edit"),
  validate(bulkSchema),
  asyncHandler(async (req, res) => {
    const module = MODULES.find((m) => m.id === req.params.module);
    if (!module) throw new NotFoundError("Module");

    const { action, ids, value } = req.body as z.infer<typeof bulkSchema>;
    const organizationId = req.auth!.organizationId;
    const where = applyBranchScope(
      { id: { in: ids }, organizationId, moduleId: module.id, deletedAt: null },
      req.auth!,
    );

    if (action === "delete") {
      const result = await prisma.record.updateMany({ where, data: { deletedAt: new Date() } });
      await recordAudit({ organizationId, action: "Deleted", moduleId: module.id, label: `${result.count} records deleted`, req });
      return ok(res, { affected: result.count });
    }

    if (action === "status") {
      if (!value) throw new BadRequestError("value (status) is required");
      const result = await prisma.record.updateMany({ where, data: { status: value, updatedById: req.auth!.userId } });
      await recordAudit({ organizationId, action: "Updated", moduleId: module.id, label: `${result.count} records set to ${value}`, req });
      return ok(res, { affected: result.count });
    }

    // assign
    const resolved = await resolveOwnerBranch(organizationId, value, undefined);
    const result = await prisma.record.updateMany({
      where,
      data: { ownerId: resolved.ownerId, ownerName: resolved.ownerName, updatedById: req.auth!.userId },
    });
    await recordAudit({ organizationId, action: "Assigned", moduleId: module.id, label: `${result.count} records assigned to ${value}`, req });
    return ok(res, { affected: result.count });
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
    const items = await prisma.record.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000 });

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
        { key: "name", label: module.noun ? module.noun[0]!.toUpperCase() + module.noun.slice(1) : "Name" },
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

    await recordAudit({ organizationId, action: "Export", moduleId: module.id, label: `Exported ${items.length} records`, req });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${module.id}-export.csv"`);
    return res.send(csv);
  }),
);

// Exports for consumers that only import this router module.
export default router;
