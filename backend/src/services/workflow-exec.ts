import { prisma } from "../lib/prisma";
import { createNotification } from "./notifications";
import { parseGraph, runWorkflowGraph } from "./workflow-graph";

/**
 * One place that knows how to run a workflow.
 *
 * The manual "Run now" button, a live trigger and a retry all have to do the
 * same thing — otherwise a retried run behaves differently from the run it is
 * retrying, which is how you end up with a task created twice. Callers record
 * the outcome; this function only executes and reports.
 */

export type WorkflowShape = {
  id: string;
  name: string;
  moduleId: string;
  trigger: string;
  condition: string;
  action: string;
  graph: string;
};

export type WorkflowActor = {
  organizationId: string;
  userId: string;
  userName: string;
  /** The record the trigger was about, when there is one. */
  recordId?: string | null;
};

export type WorkflowOutcome = {
  status: "success" | "failed" | "skipped";
  log: string;
};

export async function executeWorkflow(
  workflow: WorkflowShape,
  actor: WorkflowActor,
): Promise<WorkflowOutcome> {
  const graph = parseGraph(workflow.graph);

  try {
    if (graph) {
      const result = await runWorkflowGraph({
        organizationId: actor.organizationId,
        moduleId: workflow.moduleId,
        userId: actor.userId,
        userName: actor.userName,
        graph,
        dryRun: false,
        recordId: actor.recordId ?? null,
      });
      return { status: result.status, log: result.log };
    }

    // A workflow written through the plain API has no canvas: honour the
    // action sentence the person typed.
    const log: string[] = [];
    const lowerAction = workflow.action.toLowerCase();

    if (lowerAction.includes("task")) {
      const task = await prisma.task.create({
        data: {
          organizationId: actor.organizationId,
          title: `Automated: ${workflow.name}`,
          type: "Automation",
          ownerName: actor.userName,
          ownerId: actor.userId || undefined,
          date: new Date().toISOString().slice(0, 10),
          priority: "Normal",
          relatedModule: workflow.moduleId,
          relatedRecordId: actor.recordId ?? undefined,
        },
      });
      log.push(`Created follow-up task ${task.id}`);
    } else if (lowerAction.includes("assign")) {
      const unassigned = await prisma.record.findMany({
        where: {
          organizationId: actor.organizationId,
          moduleId: workflow.moduleId,
          ownerName: "",
          deletedAt: null,
        },
        take: 25,
      });
      for (const record of unassigned) {
        await prisma.record.update({
          where: { id: record.id },
          data: { ownerId: actor.userId || null, ownerName: actor.userName },
        });
      }
      log.push(`Assigned ${unassigned.length} unowned ${workflow.moduleId} records`);
    } else if (lowerAction.includes("approval")) {
      await createNotification({
        organizationId: actor.organizationId,
        title: `Approval required — ${workflow.name}`,
        body: `Workflow condition matched: ${workflow.condition}`,
        level: "warning",
      });
      log.push("Raised approval request");
    } else {
      await createNotification({
        organizationId: actor.organizationId,
        title: workflow.name,
        body: workflow.action,
        moduleId: workflow.moduleId,
        level: "info",
      });
      log.push("Prepared notification draft");
    }

    return { status: "success", log: log.join(" · ") };
  } catch (error) {
    return {
      status: "failed",
      log: error instanceof Error ? error.message : "Automation failed",
    };
  }
}
