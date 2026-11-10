import { prisma } from "../lib/prisma";
import { parseGraph, runWorkflowGraph } from "./workflow-graph";

/**
 * Live automation triggers.
 *
 * Until now a workflow only ran when someone pressed "Run" — the canvas was a
 * demo. This module is the missing half: the API calls `fireWorkflows` after a
 * record is created, its status moves, or a payment is recorded, and every
 * active workflow whose trigger matches runs right then, against that record.
 *
 * Matching is done on the trigger *node* of the saved canvas graph when there
 * is one, so what the person drew is what actually fires. Workflows saved
 * through the plain API (text trigger only) fall back to reading the words.
 */

export type AutomationEvent = "record.created" | "record.status_changed" | "payment.received";

export const TRIGGER_KINDS = [
  "lead_created",
  "record_created",
  "status_changed",
  "booking_confirmed",
  "invoice_overdue",
  "payment_received",
  "manual",
] as const;

export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** The trigger a saved workflow listens for. */
export function triggerKindOf(workflow: { trigger: string; graph?: string | null }): TriggerKind {
  const graph = parseGraph(workflow.graph ?? "");
  const node = graph?.nodes.find((entry) => entry.type === "trigger");
  if (node && (TRIGGER_KINDS as readonly string[]).includes(node.kind)) {
    return node.kind as TriggerKind;
  }
  // No graph yet — read the sentence the person typed.
  const text = workflow.trigger.toLowerCase();
  if (text.includes("lead")) return "lead_created";
  if (text.includes("booking") || text.includes("confirm")) return "booking_confirmed";
  if (text.includes("overdue")) return "invoice_overdue";
  if (text.includes("payment")) return "payment_received";
  if (text.includes("status")) return "status_changed";
  if (text.includes("manual")) return "manual";
  if (text.includes("created") || text.includes("new")) return "record_created";
  return "manual";
}

/** Which trigger kinds should run for an event on a given module/status. */
function kindsFor(event: AutomationEvent, moduleId: string, status?: string): Set<TriggerKind> {
  const kinds = new Set<TriggerKind>();
  if (event === "record.created") {
    kinds.add("record_created");
    if (moduleId === "leads") kinds.add("lead_created");
  }
  if (event === "record.status_changed") {
    kinds.add("status_changed");
    if (moduleId === "bookings" && (status === "Confirmed" || status === "Completed")) {
      kinds.add("booking_confirmed");
    }
    if (moduleId === "finance" && status === "Overdue") kinds.add("invoice_overdue");
  }
  if (event === "payment.received") kinds.add("payment_received");
  return kinds;
}

export type FireInput = {
  organizationId: string;
  moduleId: string;
  recordId: string;
  event: AutomationEvent;
  /** New status, for status changes. */
  status?: string;
  previousStatus?: string;
  /** Who caused the change — used as the run's actor. */
  userId?: string | null;
  userName?: string;
};

export type FireResult = { fired: number; skipped: number };

/**
 * Runs every matching automation. Never throws: a broken workflow must not
 * fail the save the person just made, so failures are written into the run
 * history where they can be seen and fixed.
 */
export async function fireWorkflows(input: FireInput): Promise<FireResult> {
  const result: FireResult = { fired: 0, skipped: 0 };
  try {
    const workflows = await prisma.workflow.findMany({
      where: {
        organizationId: input.organizationId,
        status: "Active",
        moduleId: input.moduleId,
      },
    });
    if (workflows.length === 0) return result;

    const kinds = kindsFor(input.event, input.moduleId, input.status);
    const actorId =
      input.userId ??
      (
        await prisma.record.findUnique({
          where: { id: input.recordId },
          select: { updatedById: true, createdById: true },
        })
      )?.updatedById ??
      null;
    const actor = actorId
      ? await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
      : null;
    const userName = input.userName ?? actor?.name ?? "Automation";

    for (const workflow of workflows) {
      const kind = triggerKindOf(workflow);
      if (!kinds.has(kind)) continue;

      // A status-change trigger that names no filter still fires on any move;
      // when the graph has a `status_is` condition it filters for real below.
      const graph = parseGraph(workflow.graph ?? "");
      const reason =
        input.event === "record.status_changed" && input.previousStatus !== undefined
          ? `status ${input.previousStatus || "(none)"} → ${input.status ?? "(none)"}`
          : input.event;
      const detailTrigger = `${workflow.trigger || kind} · ${reason}`;

      try {
        if (graph) {
          const run = await runWorkflowGraph({
            organizationId: input.organizationId,
            moduleId: input.moduleId,
            userId: actorId ?? "",
            userName,
            graph,
            dryRun: false,
            recordId: input.recordId,
          });
          await prisma.$transaction([
            prisma.workflowRun.create({
              data: {
                workflowId: workflow.id,
                status: run.status,
                trigger: detailTrigger,
                log: run.log,
                finishedAt: new Date(),
              },
            }),
            prisma.workflow.update({
              where: { id: workflow.id },
              data: { runCount: { increment: 1 }, lastRunAt: new Date() },
            }),
          ]);
          if (run.status === "skipped") result.skipped += 1;
          else result.fired += 1;
        } else {
          // A workflow from the plain API has no canvas: honour its action text.
          const lower = workflow.action.toLowerCase();
          const log: string[] = [];
          if (lower.includes("task")) {
            const task = await prisma.task.create({
              data: {
                organizationId: input.organizationId,
                title: `Automated: ${workflow.name}`,
                type: "Automation",
                ownerName: userName,
                ownerId: actorId ?? undefined,
                date: new Date().toISOString().slice(0, 10),
                priority: "Normal",
                relatedModule: input.moduleId,
                relatedRecordId: input.recordId,
              },
            });
            log.push(`Created follow-up task ${task.id}`);
          } else {
            await prisma.notification.create({
              data: {
                organizationId: input.organizationId,
                title: workflow.name,
                body: workflow.action,
                moduleId: input.moduleId,
                recordId: input.recordId,
                level: "info",
              },
            });
            log.push("Notified the team");
          }
          await prisma.$transaction([
            prisma.workflowRun.create({
              data: {
                workflowId: workflow.id,
                status: "success",
                trigger: detailTrigger,
                log: log.join(" · "),
                finishedAt: new Date(),
              },
            }),
            prisma.workflow.update({
              where: { id: workflow.id },
              data: { runCount: { increment: 1 }, lastRunAt: new Date() },
            }),
          ]);
          result.fired += 1;
        }
      } catch (error) {
        result.skipped += 1;
        await prisma.workflowRun
          .create({
            data: {
              workflowId: workflow.id,
              status: "failed",
              trigger: detailTrigger,
              log: error instanceof Error ? error.message : "Automation failed",
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined);
      }
    }
  } catch {
    // Never break the caller: automation is a side effect, not the save.
  }
  return result;
}
