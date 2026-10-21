import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { getPagination, paginated } from "../lib/pagination";
import { resolveOwnerBranch } from "../services/records";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const taskSchema = z.object({
  title: z.string().min(2).max(200),
  type: z.string().max(60).default("Sales follow-up"),
  owner: z.string().max(120).optional(),
  date: z.string().min(4).max(40),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]).default("Normal"),
  done: z.boolean().default(false),
  relatedModule: z.string().max(40).optional(),
  relatedRecordId: z.string().max(60).optional(),
});

const dto = (task: {
  id: string;
  title: string;
  type: string;
  ownerName: string;
  ownerId: string | null;
  date: string;
  priority: string;
  done: boolean;
  relatedModule: string | null;
  relatedRecordId: string | null;
  createdAt: Date;
}) => ({
  id: task.id,
  title: task.title,
  type: task.type,
  owner: task.ownerName,
  ownerId: task.ownerId,
  date: task.date,
  priority: task.priority,
  done: task.done,
  relatedModule: task.relatedModule,
  relatedRecordId: task.relatedRecordId,
  createdAt: task.createdAt.toISOString(),
});

/** Task list with owner / completion / date filters. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { owner, done, from, to, relatedModule, search } = req.query as Record<string, string | undefined>;
    const where: Prisma.TaskWhereInput = { organizationId: req.auth!.organizationId };

    if (owner) where.ownerName = { contains: owner };
    if (done === "true") where.done = true;
    if (done === "false") where.done = false;
    if (relatedModule) where.relatedModule = relatedModule;
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (search) where.title = { contains: search };

    const p = getPagination(req.query as Record<string, unknown>, 50);
    const [items, total] = await Promise.all([
      prisma.task.findMany({ where, orderBy: [{ done: "asc" }, { date: "asc" }], skip: p.skip, take: p.take }),
      prisma.task.count({ where }),
    ]);

    return ok(res, paginated(items.map(dto), total, p));
  }),
);

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const today = new Date().toISOString().slice(0, 10);
    const [open, overdue, todayCount, done] = await Promise.all([
      prisma.task.count({ where: { organizationId, done: false } }),
      prisma.task.count({ where: { organizationId, done: false, date: { lt: today } } }),
      prisma.task.count({ where: { organizationId, done: false, date: today } }),
      prisma.task.count({ where: { organizationId, done: true } }),
    ]);
    return ok(res, { open, overdue, today: todayCount, done });
  }),
);

/** Creates a task from the tasks panel or a record's activity timeline. */
router.post(
  "/",
  validate(taskSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof taskSchema>;
    const organizationId = req.auth!.organizationId;
    const resolved = await resolveOwnerBranch(organizationId, body.owner ?? req.auth!.name, undefined);

    const task = await prisma.task.create({
      data: {
        organizationId,
        title: body.title,
        type: body.type,
        date: body.date,
        priority: body.priority,
        done: body.done,
        relatedModule: body.relatedModule,
        relatedRecordId: body.relatedRecordId,
        ownerId: resolved.ownerId,
        ownerName: resolved.ownerName,
        createdById: req.auth!.userId,
      },
    });

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "operations",
      recordId: task.id,
      label: `Task "${task.title}" created`,
      req,
    });

    return created(res, dto(task));
  }),
);

router.patch(
  "/:id",
  validate(taskSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Task");

    const body = req.body as Partial<z.infer<typeof taskSchema>>;
    const resolved =
      body.owner === undefined
        ? null
        : await resolveOwnerBranch(req.auth!.organizationId, body.owner, undefined);

    const task = await prisma.task.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        type: body.type,
        date: body.date,
        priority: body.priority,
        done: body.done,
        relatedModule: body.relatedModule,
        relatedRecordId: body.relatedRecordId,
        ownerId: resolved?.ownerId,
        ownerName: resolved?.ownerName,
      },
    });

    return ok(res, dto(task));
  }),
);

/** Quick completion toggle from the checkbox in the UI. */
router.patch(
  "/:id/toggle",
  asyncHandler(async (req, res) => {
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Task");

    const task = await prisma.task.update({
      where: { id: existing.id },
      data: { done: !existing.done },
    });
    return ok(res, dto(task));
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Task");
    await prisma.task.delete({ where: { id: existing.id } });
    return ok(res, { deleted: true });
  }),
);

export default router;
