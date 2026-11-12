import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission, requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { getPagination, paginated } from "../lib/pagination";
import { csvHeader, csvRow, type CsvValue } from "../lib/csv";
import { assertAgentCredit, chargeAgentCredit, releaseAgentCredit } from "../services/agent-credit";
import {
  applyCapacityChange,
  holdsSeats,
  releaseDepartureCapacity,
  reserveDepartureCapacity,
} from "../services/departure-capacity";
import { assertSegregationOfDuties, readSodRules } from "../services/sod";
import { stringifyJson, parseJson } from "../lib/utils";
import { MODULES, moduleGroups } from "../domain/modules";
import { hasPermission } from "../domain/rbac";
import {
  applyBranchScope,
  buildRecordWhere,
  invoiceNumberPrefix,
  nextInvoiceNumber,
  nextReference,
  normalizeExtra,
  resolveOwnerBranch,
  toRecordDto,
} from "../services/records";
import { recordAudit } from "../services/audit";
import { createNotification } from "../services/notifications";
import { applySlaOnCreate, applySlaOnUpdate } from "../services/sla";
import { purgeExpiredTrash } from "../services/trash-purge";
import { importRecords } from "../services/import";
import { buildAttention } from "../services/attention";
import { findDuplicateGroups, mergeRecords } from "../services/duplicates";
import { fireWorkflows } from "../services/automation";
import { dispatchWebhookEvent } from "../services/webhook-dispatch";
import { eventCreated, eventStatusChange } from "../services/timeline";
import { num } from "../lib/money";

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
    .refine(
      (v) =>
        v === undefined ||
        v === "" ||
        /^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isNaN(Date.parse(v)),
      "Invalid date (use YYYY-MM-DD)",
    )
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
  /**
   * Optimistic locking. The client sends the `updatedAt` it rendered; if the
   * row has moved since, the write is refused instead of silently overwriting
   * a colleague's edit. Optional so API clients and imports stay unaffected.
   */
  expectedUpdatedAt: z.string().max(40).optional(),
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

/**
 * Statuses older versions wrote into every module.
 *
 * They are still accepted so an existing record can be edited (and moved onto
 * the module's real workflow) instead of becoming unsaveable.
 */
const LEGACY_STATUSES = new Set([
  "Active",
  "Pending",
  "Confirmed",
  "In progress",
  "On hold",
  "Cancelled",
  "Closed",
  "Resolved",
  "Draft",
  "Sent",
  "Paid",
]);

const assertValidStatus = (module: { statuses: string[] }, value?: string) => {
  if (value !== undefined && !module.statuses.includes(value) && !LEGACY_STATUSES.has(value)) {
    // Say what is allowed as well as what was wrong, so a client that offers a
    // stale list can be fixed from the error alone.
    throw new BadRequestError(
      `"${value}" is not a valid status for this module. Allowed: ${module.statuses.join(", ")}`,
    );
  }
};

/** Module catalogue for the navigation shell. */
router.get(
  "/modules",
  asyncHandler(async (_req, res) => ok(res, { modules: MODULES, groups: moduleGroups() })),
);

/**
 * How many records of one module the sign-in cache keeps by default.
 *
 * This is a *context* cache: enough recent history for a record drawer to
 * feel complete. It is loaded after first paint (see the store), so its size
 * no longer delays sign-in. A screen that totals numbers calls
 * `ensureModuleRecords`, and a caller may narrow or widen the slice with
 * `?modules=` / `?perModule=`.
 */
const CONTEXT_PER_MODULE = 300;
const CONTEXT_PER_MODULE_MAX = 500;

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
  // This is the cross-module sign-in cache: every role reads it, so the check
  // is "can you read the workspace at all", not one module's list.
  requireModulePermission("reports", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const permitted = req.auth!.permissions.modules;
    let allowedModules =
      permitted === "*"
        ? MODULES.map((module) => module.id)
        : MODULES.map((module) => module.id).filter((id) => permitted.includes(id));

    // A caller that knows which modules it needs can ask for just those. The
    // filter is applied *after* the permission check, so naming a module the
    // role cannot read returns nothing rather than leaking it.
    const requestedModules =
      typeof req.query.modules === "string" && req.query.modules.trim()
        ? req.query.modules
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : null;
    if (requestedModules) {
      allowedModules = allowedModules.filter((id) => requestedModules.includes(id));
    }

    const requestedPerModule = Number.parseInt(String(req.query.perModule ?? ""), 10);
    const perModule =
      Number.isFinite(requestedPerModule) && requestedPerModule > 0
        ? Math.min(requestedPerModule, CONTEXT_PER_MODULE_MAX)
        : CONTEXT_PER_MODULE;

    /*
     * Every module is asked for its own most recent slice, in parallel.
     *
     * The earlier version ran one capped query (`take: 5000`) across all
     * modules and grouped the result. In a busy workspace a single module could
     * fill that ceiling, so a customer's drawer would show 300 leads and zero
     * bookings simply because the bookings were older than the cutoff — the
     * screen looked complete while it was quietly missing context. One indexed
     * query per module costs the same single HTTP round trip and guarantees
     * each module contributes its own latest records.
     */
    const slices = await Promise.all(
      allowedModules.map(async (moduleId) => {
        const where = applyBranchScope(
          { organizationId, deletedAt: null, moduleId } as Prisma.RecordWhereInput,
          req.auth!,
        );
        const rows = await prisma.record.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: perModule,
        });
        return [moduleId, rows.map(toRecordDto)] as const;
      }),
    );

    const grouped: Record<string, ReturnType<typeof toRecordDto>[]> = {};
    for (const [moduleId, rows] of slices) {
      if (rows.length > 0) grouped[moduleId] = rows;
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
  requireModulePermission("reports", "view"),
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
      contractValue: num(value._sum.amount),
      collected: num(collected?._sum.amount),
      variant: isFinance ? "finance" : "default",
      breakdown: byStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
        amount: num(row._sum.amount),
      })),
    });
  }),
);

/** Single record. */
router.get(
  "/:module/records/:id",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    // The record must actually belong to the module in the URL: otherwise a
    // role that can edit "leads" could read any other module's record by
    // swapping the id into a leads URL.
    const record = await prisma.record.findFirst({
      where: applyBranchScope(
        {
          id: req.params.id,
          moduleId: req.params.module,
          organizationId: req.auth!.organizationId,
          deletedAt: null,
        },
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
    const extraJson = normalizeExtra(body.extra);
    // A credit sale is refused before a row exists, so the agent's line is a
    // control rather than a number someone remembers to update.
    if (module.id === "bookings") {
      await assertAgentCredit(organizationId, extraJson, body.amount ?? 0);
    }

    // Two records created in the same second can race for the same reference —
    // retry with the next free one instead of failing the save.
    // Invoices are numbered per financial year instead of from a running
    // module counter, so the series stays audit-ready.
    const invoicePrefix = module.id === "finance" ? await invoiceNumberPrefix(organizationId) : "";
    const createdAt = new Date();
    const supportSla =
      module.id === "support"
        ? applySlaOnCreate(extraJson, createdAt.toISOString(), body.date || undefined)
        : null;
    const recordDate = supportSla?.date ?? body.date ?? createdAt.toISOString().slice(0, 10);
    const persistedExtra = supportSla?.extraJson ?? extraJson;
    let record = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference =
        body.reference ??
        (module.id === "finance"
          ? await nextInvoiceNumber(organizationId, recordDate, invoicePrefix)
          : (await nextReference(organizationId, module)) + (attempt ? `-${attempt + 1}` : ""));
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
            date: recordDate,
            amount: body.amount ?? 0,
            currency: body.currency ?? "",
            status: statusOf(module.id, body.status),
            email: body.email ?? "",
            phone: body.phone ?? "",
            source: body.source ?? "Website",
            notes: body.notes ?? "",
            extra: persistedExtra,
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

    if (module.id === "bookings") {
      // Seats and credit are both controls, not counters someone updates by
      // hand. Reserve seats first; if credit then refuses the sale, put the
      // seats back before deleting the row.
      let reservation: Awaited<ReturnType<typeof reserveDepartureCapacity>> | null = null;
      try {
        reservation = await reserveDepartureCapacity(organizationId, record.extra, 1);
        if (record.amount > 0) {
          const charged = await chargeAgentCredit(organizationId, record.extra, record.amount);
          if (charged.accountId && !charged.charged) {
            if (reservation.reserved) {
              await releaseDepartureCapacity(organizationId, record.extra, 1).catch(
                () => undefined,
              );
            }
            // The pre-check passed but a concurrent booking took the line first;
            // remove the row so a refused sale never appears as booked.
            await prisma.record.delete({ where: { id: record.id } }).catch(() => undefined);
            throw new BadRequestError(
              "The agent's credit limit was reached by another booking — this one was not created",
            );
          }
        }
      } catch (error) {
        if (reservation?.reserved) {
          await releaseDepartureCapacity(organizationId, record.extra, 1).catch(() => undefined);
        }
        await prisma.record.delete({ where: { id: record.id } }).catch(() => undefined);
        throw error;
      }
    }

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

    // Timeline: "created" event so the agent can see when this record came in.
    void eventCreated(
      organizationId,
      record.id,
      record.reference,
      module.name,
      req.auth!.userId,
      req.auth!.name,
    );

    // Live automation: "when a new enquiry arrives, WhatsApp the desk".
    void fireWorkflows({
      organizationId,
      moduleId: module.id,
      recordId: record.id,
      event: "record.created",
      status: record.status,
      userId: req.auth!.userId,
      userName: req.auth!.name,
    });

    // And the same event to the workspace's own webhook subscribers.
    void dispatchWebhookEvent({
      organizationId,
      event: "record.created",
      dedupeKey: `record.created:${record.id}`,
      data: toRecordDto(record) as unknown as Record<string, unknown>,
    });

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
        {
          id: req.params.id,
          // Same rule as the read above: URL module and record module match.
          moduleId: module.id,
          organizationId: req.auth!.organizationId,
          deletedAt: null,
        },
        req.auth!,
      ),
    });
    if (!existing) throw new NotFoundError("Record");

    const body = req.body as Partial<z.infer<typeof recordBodySchema>>;
    assertValidStatus(module, body.status);
    // The creator cannot approve/close their own invoice. Role permissions
    // decide what a person may do; this decides they cannot be both sides.
    const organization = await prisma.organization.findUnique({
      where: { id: req.auth!.organizationId },
      select: { settings: true },
    });
    const sodRules = readSodRules(organization?.settings ?? null);
    assertSegregationOfDuties({
      moduleId: module.id,
      action: "approve",
      actorId: req.auth!.userId,
      actorRoleKey: req.auth!.roleKey,
      createdById: existing.createdById,
      currentStatus: existing.status,
      nextStatus: body.status,
      rules: sodRules,
    });

    /*
     * Two people editing the same booking is normal in a busy agency. Without
     * this check the second save wins and the first one disappears without a
     * word — including money fields. A conflict is a 409 with a sentence the
     * screen can show; the person reloads and redoes the one field they meant.
     */
    if (body.expectedUpdatedAt) {
      const seen = existing.updatedAt.toISOString();
      if (seen !== body.expectedUpdatedAt) {
        throw new ConflictError(
          "Someone else changed this record while you were editing. Reload to see their version, then make your change again.",
        );
      }
    }

    const resolved =
      body.owner !== undefined || body.branch !== undefined
        ? await resolveOwnerBranch(
            req.auth!.organizationId,
            body.owner ?? existing.ownerName,
            body.branch ?? existing.branchName,
          )
        : null;

    /*
     * Seats move with the booking, not just with its creation.
     *
     * Editing a party of two into six, switching to another departure, or
     * reopening a cancelled booking all change what the departure is holding.
     * Extra seats are taken before the write so a full departure refuses the
     * edit; if the write then fails the reservation is handed back.
     */
    const nextExtra = body.extra ? normalizeExtra(body.extra) : existing.extra;
    const capacityChange =
      module.id === "bookings"
        ? await applyCapacityChange(
            req.auth!.organizationId,
            { extra: existing.extra, status: existing.status },
            { extra: nextExtra, status: body.status ?? existing.status },
          )
        : null;

    // Keep a precise deadline in extra.slaDueAt while the shared record date
    // stays calendar-friendly for tables, exports and date filters.
    const supportSla =
      module.id === "support"
        ? applySlaOnUpdate(
            nextExtra,
            existing.date,
            existing.createdAt.toISOString(),
            body.date && body.date !== existing.date ? body.date : undefined,
            body.extra !== undefined &&
              String(
                parseJson<Record<string, unknown>>(existing.extra, {}).priority ?? "Normal",
              ) !== String(parseJson<Record<string, unknown>>(nextExtra, {}).priority ?? "Normal"),
          )
        : null;

    let record;
    try {
      record = await prisma.record.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          detail: body.detail,
          destination: body.destination,
          date: supportSla?.date ?? body.date,
          amount: body.amount,
          currency: body.currency === "" ? "" : body.currency,
          status: body.status,
          email: body.email,
          phone: body.phone,
          source: body.source,
          notes: body.notes,
          tab: body.tab,
          reference: body.reference,
          extra: supportSla?.extraJson ?? (body.extra ? nextExtra : undefined),
          meta: body.meta ? stringifyJson(body.meta) : undefined,
          ownerId: resolved?.ownerId,
          ownerName: resolved?.ownerName,
          branchId: resolved?.branchId,
          branchName: resolved?.branchName,
          updatedById: req.auth!.userId,
        },
      });
    } catch (error) {
      await capacityChange?.revert().catch(() => undefined);
      throw error;
    }

    // The write went through, so the old seats are genuinely free now.
    await capacityChange?.commit().catch(() => undefined);

    // A cancellation that did not release its agent credit would leave the
    // sub-agent permanently short of limit for a booking nobody is paying for.
    if (
      module.id === "bookings" &&
      record.status === "Cancelled" &&
      existing.status !== "Cancelled"
    ) {
      await releaseAgentCredit(req.auth!.organizationId, existing.extra, existing.amount).catch(
        () => undefined,
      );
    }

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: module.id,
      recordId: record.id,
      label: `${record.reference} updated`,
      meta: { fields: Object.keys(body) },
      req,
    });

    // A status move is what most automations listen for (booking confirmed,
    // invoice overdue). Fired only when the status really changed, so saving
    // the same form twice does not send the customer two messages.
    if (body.status !== undefined && body.status !== existing.status) {
      void fireWorkflows({
        organizationId: req.auth!.organizationId,
        moduleId: module.id,
        recordId: record.id,
        event: "record.status_changed",
        status: record.status,
        previousStatus: existing.status,
        userId: req.auth!.userId,
        userName: req.auth!.name,
      });
      // Timeline: show the status move so anyone reading the record history
      // can see the progression (New → Quoted → Booked → Confirmed).
      void eventStatusChange(
        req.auth!.organizationId,
        record.id,
        existing.status,
        record.status,
        req.auth!.userId,
        req.auth!.name,
      );
    }

    const payload = toRecordDto(record) as unknown as Record<string, unknown>;
    // The updated row's own timestamp is the idempotency key: saving the same
    // form twice within one write produces one event, not two.
    void dispatchWebhookEvent({
      organizationId: req.auth!.organizationId,
      event: "record.updated",
      dedupeKey: `record.updated:${record.id}:${record.updatedAt.toISOString()}`,
      data: { ...payload, previousStatus: existing.status },
    });

    if (
      module.id === "bookings" &&
      record.status === "Confirmed" &&
      existing.status !== "Confirmed"
    ) {
      void dispatchWebhookEvent({
        organizationId: req.auth!.organizationId,
        event: "booking.confirmed",
        dedupeKey: `booking.confirmed:${record.id}:${record.updatedAt.toISOString()}`,
        data: { ...payload, previousStatus: existing.status },
      });
    }

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
        {
          id: req.params.id,
          moduleId: module.id,
          organizationId: req.auth!.organizationId,
          deletedAt: null,
        },
        req.auth!,
      ),
    });
    if (!existing) throw new NotFoundError("Record");

    const organization = await prisma.organization.findUnique({
      where: { id: req.auth!.organizationId },
      select: { settings: true },
    });
    const sodRules = readSodRules(organization?.settings ?? null);

    assertSegregationOfDuties({
      moduleId: module.id,
      action: "delete",
      actorId: req.auth!.userId,
      actorRoleKey: req.auth!.roleKey,
      createdById: existing.createdById,
      currentStatus: existing.status,
      rules: sodRules,
    });

    await prisma.record.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedById: req.auth!.userId },
    });

    /*
     * A deleted booking is not travelling. Leaving its seats held would make the
     * departure look full to the next customer, and leaving its credit held
     * would keep a sub-agent under their limit for a sale that no longer exists.
     */
    if (module.id === "bookings" && holdsSeats(existing.status)) {
      await Promise.all([
        releaseDepartureCapacity(req.auth!.organizationId, existing.extra, 1).catch(
          () => undefined,
        ),
        releaseAgentCredit(req.auth!.organizationId, existing.extra, existing.amount).catch(
          () => undefined,
        ),
      ]);
    }

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: module.id,
      recordId: existing.id,
      label: `${existing.reference} deleted`,
      req,
    });

    void dispatchWebhookEvent({
      organizationId: req.auth!.organizationId,
      event: "record.deleted",
      dedupeKey: `record.deleted:${existing.id}:${Date.now()}`,
      data: {
        id: existing.id,
        moduleId: module.id,
        reference: existing.reference,
        name: existing.name,
      },
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
      where: applyBranchScope(
        {
          id: req.params.id,
          moduleId: module.id,
          organizationId: req.auth!.organizationId,
          deletedAt: { not: null },
        },
        req.auth!,
      ),
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

/**
 * The recycle bin: everything deleted in the workspace, newest first.
 *
 * A delete in this product is a soft delete, but until the bin existed that
 * only helped the database — a person who deleted the wrong customer had no
 * way back. The module is sent back with each row so the client can restore it
 * without guessing which list it came from.
 */
router.get(
  "/trash",
  // The bin lives in Settings, so that is the permission that opens it.
  requireModulePermission("settings", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const take = Math.min(Math.max(Number(req.query.take ?? 100) || 100, 1), 500);
    const q = String(req.query.q ?? "").trim();
    const moduleFilter = String(req.query.module ?? "").trim();

    // The bin must never become a back door around the module permissions:
    // the caller only sees modules their role is allowed to view, and an
    // explicit filter for a hidden module is refused outright.
    const visibleModules: string[] = MODULES.filter((m) =>
      hasPermission(req.auth!.permissions, m.id, "view"),
    ).map((m) => m.id);
    if (moduleFilter && !visibleModules.includes(moduleFilter)) {
      throw new ForbiddenError(`Your role cannot view records in "${moduleFilter}"`);
    }

    const where: Prisma.RecordWhereInput = {
      organizationId,
      deletedAt: { not: null },
      moduleId: moduleFilter ? moduleFilter : { in: visibleModules },
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { reference: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.record.findMany({
        where: applyBranchScope(where, req.auth!),
        orderBy: { deletedAt: "desc" },
        take,
      }),
      prisma.record.count({ where: applyBranchScope(where, req.auth!) }),
    ]);

    return ok(res, {
      total,
      items: rows.map((row) => ({
        ...toRecordDto(row),
        moduleName: MODULES.find((m) => m.id === row.moduleId)?.name ?? row.moduleId,
        deletedAt: row.deletedAt?.toISOString() ?? null,
      })),
    });
  }),
);

/** Restores one deleted record by id — the bin does not need to know its module. */
router.post(
  "/trash/:id/restore",
  requireModulePermission("settings", "view"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.record.findFirst({
      where: applyBranchScope(
        {
          id: req.params.id,
          organizationId: req.auth!.organizationId,
          deletedAt: { not: null },
        },
        req.auth!,
      ),
    });
    if (!existing) throw new NotFoundError("Deleted record");
    // Restoring is an edit in the record's own module — the bin has no
    // :module param, so the permission is checked against the record itself.
    if (!hasPermission(req.auth!.permissions, existing.moduleId, "edit")) {
      throw new ForbiddenError(`Your role cannot edit records in "${existing.moduleId}"`);
    }

    /*
     * Restoring a booking puts it back on the departure and back on the agent's
     * credit line — deleting it took both away. If the departure has since
     * filled up, the restore is refused rather than quietly overselling it.
     */
    let capacityChange: Awaited<ReturnType<typeof applyCapacityChange>> | null = null;
    if (existing.moduleId === "bookings" && holdsSeats(existing.status)) {
      capacityChange = await applyCapacityChange(
        req.auth!.organizationId,
        { extra: existing.extra, status: "Cancelled" },
        { extra: existing.extra, status: existing.status },
      );
    }

    let record;
    try {
      record = await prisma.record.update({
        where: { id: existing.id },
        data: { deletedAt: null, updatedById: req.auth!.userId },
      });
    } catch (error) {
      await capacityChange?.revert().catch(() => undefined);
      throw error;
    }
    await capacityChange?.commit().catch(() => undefined);

    if (existing.moduleId === "bookings" && holdsSeats(existing.status) && existing.amount > 0) {
      const charged = await chargeAgentCredit(
        req.auth!.organizationId,
        existing.extra,
        existing.amount,
      );
      if (charged.accountId && !charged.charged) {
        // The credit line moved while this booking sat in the bin; undo the
        // restore so the two cannot disagree.
        await prisma.record
          .update({ where: { id: existing.id }, data: { deletedAt: new Date() } })
          .catch(() => undefined);
        await capacityChange?.revert().catch(() => undefined);
        throw new BadRequestError(
          "This agent's credit limit no longer covers the restored booking — it was left in the bin.",
        );
      }
    }

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Restored",
      moduleId: record.moduleId,
      recordId: record.id,
      label: `${record.reference} restored from the recycle bin`,
      req,
    });

    return ok(res, toRecordDto(record));
  }),
);

/** Permanently removes one deleted record. Irreversible, so it needs delete rights. */
router.delete(
  "/trash/:id",
  requireModulePermission("settings", "delete"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.record.findFirst({
      where: applyBranchScope(
        {
          id: req.params.id,
          organizationId: req.auth!.organizationId,
          deletedAt: { not: null },
        },
        req.auth!,
      ),
      select: { id: true, moduleId: true, reference: true },
    });
    if (!existing) throw new NotFoundError("Deleted record");
    // Permanent deletion is a delete in the record's own module.
    if (!hasPermission(req.auth!.permissions, existing.moduleId, "delete")) {
      throw new ForbiddenError(`Your role cannot delete records in "${existing.moduleId}"`);
    }

    await prisma.record.delete({ where: { id: existing.id } });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: existing.moduleId,
      recordId: existing.id,
      label: `${existing.reference} permanently deleted`,
      req,
    });
    return ok(res, { purged: true });
  }),
);

/** Empties the bin for the whole workspace. */
router.post(
  "/trash/empty",
  requireModulePermission("settings", "delete"),
  asyncHandler(async (req, res) => {
    // Emptying the bin purges across modules, so it may only touch modules
    // this role is allowed to delete in — never a silent wipe of someone
    // else's records.
    const deletableModules = MODULES.filter((m) =>
      hasPermission(req.auth!.permissions, m.id, "delete"),
    ).map((m) => m.id);
    const result = await prisma.record.deleteMany({
      where: applyBranchScope(
        {
          organizationId: req.auth!.organizationId,
          deletedAt: { not: null },
          moduleId: { in: deletableModules },
        },
        req.auth!,
      ),
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "settings",
      label: `Recycle bin emptied (${result.count} records)`,
      req,
    });
    return ok(res, { purged: result.count });
  }),
);

/**
 * Runs the trash purge on demand — deletes every trashed record older than the
 * organization's purgeAfterDays window. A company admin can use this to test
 * the policy or force a purge without waiting for the scheduler.
 */
router.post(
  "/trash/purge-now",
  requireModulePermission("settings", "delete"),
  asyncHandler(async (req, res) => {
    const purged = await purgeExpiredTrash(req.auth!.organizationId);
    return ok(res, { purged });
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

    /*
     * A bulk action moves records that a single edit would also move, so it
     * must move their seats and credit with them. A toolbar "Cancel" on twenty
     * bookings used to leave twenty seat blocks on the departure and twenty
     * credit lines on the sub-agent — the seats then looked sold forever.
     */
    const changed = await prisma.record.findMany({
      where,
      select: { id: true, reference: true, status: true, extra: true, amount: true },
    });

    if (action === "delete") {
      const result = await prisma.record.updateMany({ where, data: { deletedAt: new Date() } });
      if (module.id === "bookings") {
        for (const row of changed) {
          if (!holdsSeats(row.status)) continue;
          await Promise.all([
            releaseDepartureCapacity(organizationId, row.extra, 1).catch(() => undefined),
            releaseAgentCredit(organizationId, row.extra, row.amount).catch(() => undefined),
          ]);
        }
      }
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

      const moving = changed.filter((row) => row.status !== value);
      const skipped: Array<{ reference: string; reason: string }> = [];

      if (module.id !== "bookings") {
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

      const targetHoldsSeats = holdsSeats(value);
      const ready: Array<{ row: (typeof moving)[number]; commit: () => Promise<void> }> = [];

      for (const row of moving) {
        try {
          // Reopening a cancelled booking may legitimately fail: the seats were
          // given away. Say so for that row instead of failing the whole batch.
          const change = await applyCapacityChange(
            organizationId,
            { extra: row.extra, status: row.status },
            { extra: row.extra, status: value },
          );
          ready.push({ row, commit: change.commit });
        } catch (error) {
          if (targetHoldsSeats) {
            skipped.push({
              reference: row.reference,
              reason: error instanceof Error ? error.message : "Could not reserve a seat",
            });
          }
        }
      }

      const result =
        ready.length > 0
          ? await prisma.record.updateMany({
              where: { ...where, id: { in: ready.map((entry) => entry.row.id) } },
              data: { status: value, updatedById: req.auth!.userId },
            })
          : { count: 0 };

      // The status write landed, so the seats it no longer holds are free.
      for (const entry of ready) await entry.commit().catch(() => undefined);

      if (!targetHoldsSeats) {
        // Cancelling: put the agent's credit back for every booking that moved.
        for (const entry of ready) {
          await releaseAgentCredit(organizationId, entry.row.extra, entry.row.amount).catch(
            () => undefined,
          );
        }
      }

      await recordAudit({
        organizationId,
        action: "Updated",
        moduleId: module.id,
        label: `${result.count} records set to ${value}`,
        req,
      });
      return ok(res, {
        affected: result.count,
        ...(skipped.length ? { skipped } : {}),
      });
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
    /*
     * An export is how an agency gets its own data back — for a CA, a
     * migration or a backup. Silently stopping at 5,000 rows turned that into
     * a truncated file nobody noticed, so the ceiling is explicit, callers can
     * raise it, and the response says how many rows matched versus how many
     * were written.
     */
    const requestedLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 25_000, 1),
      100_000,
    );
    const matched = await prisma.record.count({ where });
    const columns = [
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
    ];
    const exportRow = (record: Parameters<typeof toRecordDto>[0]): Record<string, CsvValue> => {
      const dto = toRecordDto(record);
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
        ...(dto.extra as Record<string, CsvValue>),
      };
    };

    /*
     * Streaming, not buffering.
     *
     * The previous version built one string for up to 100,000 rows before
     * sending a byte. A single large export could push the API process into an
     * out-of-memory restart and take every other tenant down with it. Rows are
     * now read in keyset batches of 1,000 and written straight to the socket,
     * waiting for `drain` when the client is slower than the database.
     *
     * Headers have to be final before the first byte goes out, so the counts
     * are computed once up front. If the client disconnects, the loop stops
     * querying instead of finishing work nobody will receive.
     */
    res.status(200);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${module.id}-export.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Total-Count", String(matched));
    res.setHeader("X-Export-Limit", String(limit));
    res.setHeader("X-Exported-Rows", String(Math.min(matched, limit)));
    res.setHeader("X-Export-Truncated", matched > limit ? "true" : "false");
    // Tell a browser fetch which headers it may read when it inspects the file.
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Total-Count, X-Export-Limit, X-Exported-Rows, X-Export-Truncated",
    );
    res.flushHeaders();

    const write = (chunk: string): Promise<boolean> =>
      new Promise((resolve) => {
        if (res.writableEnded || res.destroyed) return resolve(false);
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          res.off("drain", onDrain);
          res.off("close", onClose);
          resolve(ok);
        };
        const onDrain = () => finish(true);
        const onClose = () => finish(false);
        try {
          if (res.write(chunk)) return finish(true);
          res.once("drain", onDrain);
          res.once("close", onClose);
        } catch {
          finish(false);
        }
      });

    let written = 0;
    try {
      if (!(await write(`${csvHeader(columns)}\n`))) return;
      const BATCH = 1_000;
      let cursorId: string | undefined;
      while (written < limit) {
        const batch = await prisma.record.findMany({
          where,
          orderBy: { id: "asc" },
          take: Math.min(BATCH, limit - written),
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        });
        if (batch.length === 0) break;
        const chunk = batch.map((record) => `${csvRow(exportRow(record), columns)}\n`).join("");
        if (!(await write(chunk))) break; // client went away; stop querying
        written += batch.length;
        cursorId = batch[batch.length - 1]!.id;
      }
    } finally {
      if (!res.writableEnded && !res.destroyed) res.end();
      await recordAudit({
        organizationId,
        action: "Export",
        moduleId: module.id,
        label: `Exported ${written} of ${matched} records${
          matched > written ? " (truncated or cancelled)" : ""
        }`,
        req,
      }).catch(() => undefined);
    }
  }),
);

// Exports for consumers that only import this router module.
export default router;
