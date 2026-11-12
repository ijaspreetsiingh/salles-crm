import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { getPagination, paginated } from "../lib/pagination";
import { recordAudit } from "../services/audit";
import { parseGraph, runWorkflowGraph } from "../services/workflow-graph";
import {
  discardWorkflowRunById,
  retryWorkflowRunById,
  runWorkflowNow,
} from "../services/workflow-runs";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("automation", "view"));

const workflowSchema = z.object({
  name: z.string().min(2).max(120),
  moduleId: z.string().max(40).default("leads"),
  trigger: z.string().min(2).max(120),
  condition: z.string().max(160).default("All records"),
  action: z.string().min(2).max(160),
  /** Canvas graph as JSON: { nodes: [...], edges: [...] }. */
  graph: z.string().max(200_000).optional(),
  status: z.enum(["Active", "Paused"]).default("Active"),
});

const workflowDto = (w: {
  id: string;
  name: string;
  moduleId: string;
  trigger: string;
  condition: string;
  action: string;
  graph?: string;
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
  graph: w.graph ?? "",
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
          workflowId: run.workflowId,
          status: run.status,
          trigger: run.trigger,
          log: run.log,
          attempts: run.attempts,
          nextAttemptAt: run.nextAttemptAt?.toISOString() ?? null,
          deadLetteredAt: run.deadLetteredAt?.toISOString() ?? null,
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
 *
 * A failure is recorded with the attempt count and the record it was about, so
 * the retry loop can try it again and a person can replay it later.
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
        data: {
          workflowId: workflow.id,
          status: "skipped",
          trigger: workflow.trigger,
          log: "Workflow is paused",
          finishedAt: new Date(),
        },
      });
      return ok(res, { status: run.status, log: run.log });
    }

    const dryRun = String(req.query.dryRun ?? "") === "1";
    if (dryRun) {
      const graph = parseGraph(workflow.graph);
      const result = graph
        ? await runWorkflowGraph({
            organizationId,
            moduleId: workflow.moduleId,
            userId: req.auth!.userId,
            userName: req.auth!.name,
            graph,
            dryRun: true,
          })
        : {
            status: "skipped" as const,
            log: "Nothing to test: this rule has no canvas graph, so a test would create a real task.",
          };
      await recordAudit({
        organizationId,
        action: "WorkflowRun",
        moduleId: "automation",
        recordId: workflow.id,
        label: `Tested "${workflow.name}" without saving changes`,
        req,
      });
      return ok(res, result);
    }

    const run = await runWorkflowNow({
      workflow,
      actor: { organizationId, userId: req.auth!.userId, userName: req.auth!.name },
      trigger: workflow.trigger || "manual",
      context: { event: "manual" },
    });

    await recordAudit({
      organizationId,
      action: "WorkflowRun",
      moduleId: "automation",
      recordId: workflow.id,
      label: `Ran "${workflow.name}" — ${run.status}`,
      req,
    });

    return ok(res, {
      status: run.status,
      log: run.log,
      runId: run.runId,
      attempts: run.attempts,
      nextAttemptAt: run.nextAttemptAt,
    });
  }),
);

/** Try a failed or dead-lettered run again, right now. */
router.post(
  "/runs/:runId/retry",
  requireModulePermission("automation", "edit"),
  asyncHandler(async (req, res) => {
    const run = await retryWorkflowRunById(req.params.runId, req.auth!.organizationId);
    if (!run) throw new NotFoundError("Workflow run");

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "WorkflowRun",
      moduleId: "automation",
      recordId: req.params.runId,
      label: `Retried a failed automation by hand — ${run.status}`,
      req,
    });

    return ok(res, run);
  }),
);

/** Accept that a run will not be retried, and stop it coming back. */
router.post(
  "/runs/:runId/discard",
  requireModulePermission("automation", "edit"),
  asyncHandler(async (req, res) => {
    const discarded = await discardWorkflowRunById(req.params.runId, req.auth!.organizationId);
    if (!discarded) throw new NotFoundError("Workflow run");
    return ok(res, { discarded: true });
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
    return ok(
      res,
      runs.map((r) => ({
        ...r,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
        deadLetteredAt: r.deadLetteredAt?.toISOString() ?? null,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
    );
  }),
);

export default router;
