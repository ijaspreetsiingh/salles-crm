import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { getPagination, paginated } from "../lib/pagination";
import { createNotification } from "../services/notifications";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const workflowSchema = z.object({
  name: z.string().min(2).max(120),
  moduleId: z.string().max(40).default("leads"),
  trigger: z.string().min(2).max(120),
  condition: z.string().max(160).default("All records"),
  action: z.string().min(2).max(160),
  status: z.enum(["Active", "Paused"]).default("Active"),
});

const workflowDto = (w: {
  id: string;
  name: string;
  moduleId: string;
  trigger: string;
  condition: string;
  action: string;
  status: string;
  runCount: number;
  lastRunAt: Date | null;
  createdAt: Date;
}) => ({
  id: w.id,
  name: w.name,
  moduleId: w.moduleId,
  trigger: w.trigger,
  condition: w.condition,
  action: w.action,
  status: w.status,
  runCount: w.runCount,
  lastRunAt: w.lastRunAt?.toISOString() ?? null,
  createdAt: w.createdAt.toISOString(),
});

/** Workflow list (automation → workflows tab). */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, moduleId } = req.query as Record<string, string | undefined>;
    const workflows = await prisma.workflow.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        ...(status ? { status } : {}),
        ...(moduleId ? { moduleId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, workflows.map(workflowDto));
  }),
);

/** Execution history across all workflows. */
router.get(
  "/runs",
  asyncHandler(async (req, res) => {
    const p = getPagination(req.query as Record<string, unknown>, 30);
    const where = { workflow: { organizationId: req.auth!.organizationId } };
    const [items, total] = await Promise.all([
      prisma.workflowRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: p.skip,
        take: p.take,
        include: { workflow: { select: { name: true } } },
      }),
      prisma.workflowRun.count({ where }),
    ]);
    return ok(
      res,
      paginated(
        items.map((run) => ({
          id: run.id,
          workflow: run.workflow.name,
          status: run.status,
          trigger: run.trigger,
          log: run.log,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
        })),
        total,
        p,
      ),
    );
  }),
);

router.post(
  "/",
  validate(workflowSchema),
  asyncHandler(async (req, res) => {
    const workflow = await prisma.workflow.create({
      data: {
        organizationId: req.auth!.organizationId,
        ...(req.body as z.infer<typeof workflowSchema>),
        createdById: req.auth!.userId,
      },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "automation",
      recordId: workflow.id,
      label: `Workflow "${workflow.name}" created`,
      req,
    });
    return created(res, workflowDto(workflow));
  }),
);

router.patch(
  "/:id",
  validate(workflowSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Workflow");
    const workflow = await prisma.workflow.update({ where: { id: existing.id }, data: req.body });
    return ok(res, workflowDto(workflow));
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Workflow");
    await prisma.workflow.delete({ where: { id: existing.id } });
    return ok(res, { deleted: true });
  }),
);

/**
 * Executes a workflow once and records the outcome. Actions are deliberately
 * workspace-internal (tasks, notifications, assignments) — nothing is sent to
 * external suppliers or payment providers.
 */
router.post(
  "/:id/run",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!workflow) throw new NotFoundError("Workflow");
    if (workflow.status !== "Active") {
      const run = await prisma.workflowRun.create({
        data: { workflowId: workflow.id, status: "skipped", trigger: workflow.trigger, log: "Workflow is paused", finishedAt: new Date() },
      });
      return ok(res, { status: run.status, log: run.log });
    }

    const log: string[] = [];
    const lowerAction = workflow.action.toLowerCase();

    if (lowerAction.includes("task")) {
      const task = await prisma.task.create({
        data: {
          organizationId,
          title: `Automated: ${workflow.name}`,
          type: "Automation",
          ownerName: req.auth!.name,
          ownerId: req.auth!.userId,
          date: new Date().toISOString().slice(0, 10),
          priority: "Normal",
        },
      });
      log.push(`Created follow-up task ${task.id}`);
    } else if (lowerAction.includes("assign")) {
      const unassigned = await prisma.record.findMany({
        where: { organizationId, moduleId: workflow.moduleId, ownerName: "", deletedAt: null },
        take: 25,
      });
      for (const record of unassigned) {
        await prisma.record.update({
          where: { id: record.id },
          data: { ownerId: req.auth!.userId, ownerName: req.auth!.name },
        });
      }
      log.push(`Assigned ${unassigned.length} unowned ${workflow.moduleId} records`);
    } else if (lowerAction.includes("approval")) {
      await createNotification({
        organizationId,
        title: `Approval required — ${workflow.name}`,
        body: `Workflow condition matched: ${workflow.condition}`,
        level: "warning",
      });
      log.push("Raised approval request");
    } else {
      await createNotification({
        organizationId,
        title: workflow.name,
        body: workflow.action,
        moduleId: workflow.moduleId,
        level: "info",
      });
      log.push("Prepared notification draft");
    }

    const [run] = await Promise.all([
      prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          status: "success",
          trigger: workflow.trigger,
          log: log.join(" · "),
          finishedAt: new Date(),
        },
      }),
      prisma.workflow.update({
        where: { id: workflow.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      }),
    ]);

    await recordAudit({
      organizationId,
      action: "WorkflowRun",
      moduleId: "automation",
      recordId: workflow.id,
      label: `Workflow "${workflow.name}" executed`,
      req,
    });

    return ok(res, { status: run.status, log: run.log, finishedAt: run.finishedAt });
  }),
);

router.get(
  "/:id/runs",
  asyncHandler(async (req, res) => {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!workflow) throw new NotFoundError("Workflow");

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: workflow.id },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return ok(res, runs.map((r) => ({ ...r, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null })));
  }),
);

export default router;
