import { prisma } from "../lib/prisma";
import { parseGraph } from "./workflow-graph";
import { runWorkflowNow } from "./workflow-runs";

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

export type FireResult = { fired: number; skipped: number; failed: number };

/**
 * Runs every matching automation. Never throws: a broken workflow must not
 * fail the save the person just made, so failures are written into the run
 * history where they can be seen and fixed.
 */
export async function fireWorkflows(input: FireInput): Promise<FireResult> {
  const result: FireResult = { fired: 0, skipped: 0, failed: 0 };
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
      // when the graph has a `status_is` condition it filters for real inside
      // the executor.
      const reason =
        input.event === "record.status_changed" && input.previousStatus !== undefined
          ? `status ${input.previousStatus || "(none)"} → ${input.status ?? "(none)"}`
          : input.event;
      const detailTrigger = `${workflow.trigger || kind} · ${reason}`;

      const context = {
        userId: actorId ?? "",
        userName,
        moduleId: input.moduleId,
        recordId: input.recordId,
        event: input.event,
        status: input.status,
        previousStatus: input.previousStatus,
      };

      try {
        // Failed runs are recorded with their trigger context and picked up by
        // the retry loop; a rule that fails at 3am is not silently forgotten.
        const run = await runWorkflowNow({
          workflow,
          actor: {
            organizationId: input.organizationId,
            userId: actorId ?? "",
            userName,
            recordId: input.recordId,
          },
          trigger: detailTrigger,
          context,
        });
        if (run.status === "skipped") result.skipped += 1;
        else if (run.status === "success") result.fired += 1;
        else result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
  } catch {
    // Never break the caller: automation is a side effect, not the save.
  }
  return result;
}
