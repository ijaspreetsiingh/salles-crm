import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { createNotification } from "./notifications";
import {
  executeWorkflow,
  type WorkflowActor,
  type WorkflowOutcome,
  type WorkflowShape,
} from "./workflow-exec";

/**
 * Retries and a dead-letter queue for automations.
 *
 * A workflow that fails used to write one "failed" row and stop — no retry, no
 * alert, and the failure sat in a list nobody opens. A booking confirmation
 * that failed at 3am looked the same as a rule that had never been set up.
 *
 * Now: a failed run is retried on a short backoff, and when the attempts are
 * used up it is parked as `dead` and the team is told in the notification tray.
 * A person can retry it by hand (which restores the full attempt budget) or
 * discard it, and either way the run history says who did what.
 */

export const MAX_ATTEMPTS = 3;

/** Backoff before attempt 2, 3 … — minutes, capped by MAX_ATTEMPTS. */
export function retryDelayMs(attempts: number): number {
  const minutes = [1, 5, 15][Math.min(Math.max(attempts, 1) - 1, 2)]!;
  return minutes * 60_000;
}

/** When the next attempt is due, or null when the attempts are used up. */
export function nextAttemptAtFor(attempts: number, now = new Date()): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + retryDelayMs(attempts));
}

export type StoredContext = {
  userId?: string;
  userName?: string;
  moduleId?: string;
  recordId?: string | null;
  event?: string;
  status?: string;
  previousStatus?: string;
};

export function parseStoredContext(raw: string): StoredContext {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as StoredContext) : {};
  } catch {
    return {};
  }
}

type RunRecord = {
  runId: string;
  status: string;
  log: string;
  attempts: number;
  nextAttemptAt: string | null;
};

/**
 * Writes the outcome of an attempt, and decides whether it gets another one.
 *
 * `attempts` is the number of attempts *including* this one. Only a failure
 * below MAX_ATTEMPTS keeps a next attempt; the failure that reaches the limit
 * dead-letters the run and notifies the workspace.
 */
export async function recordOutcome(input: {
  organizationId: string;
  workflow: WorkflowShape;
  trigger: string;
  outcome: WorkflowOutcome;
  context: StoredContext;
  /** Row to update when this is a retry of an existing run. */
  runId?: string;
  attempts: number;
}): Promise<RunRecord> {
  const now = new Date();
  const failed = input.outcome.status === "failed";
  const exhausted = failed && input.attempts >= MAX_ATTEMPTS;
  const nextAttemptAt = failed ? nextAttemptAtFor(input.attempts, now) : null;
  const status = failed ? (exhausted ? "dead" : "failed") : input.outcome.status;

  const data = {
    status,
    trigger: input.trigger,
    log: input.outcome.log,
    attempts: input.attempts,
    nextAttemptAt,
    deadLetteredAt: exhausted ? now : null,
    context: JSON.stringify(input.context),
    finishedAt: now,
  };

  const run = input.runId
    ? await prisma.workflowRun.update({ where: { id: input.runId }, data })
    : await prisma.workflowRun.create({
        data: { workflowId: input.workflow.id, ...data },
      });

  // A new attempt is a new execution of the rule; a retry is the same one.
  if (!input.runId) {
    await prisma.workflow
      .update({
        where: { id: input.workflow.id },
        data: { runCount: { increment: 1 }, lastRunAt: now },
      })
      .catch(() => undefined);
  }

  if (exhausted) {
    await createNotification({
      organizationId: input.organizationId,
      title: `Automation gave up: ${input.workflow.name}`,
      body: `${input.attempts} attempts failed. Last error: ${input.outcome.log}`,
      moduleId: "automation",
      level: "danger",
    }).catch(() => undefined);
    logger.warn(
      { workflowId: input.workflow.id, runId: run.id },
      "Workflow run dead-lettered after retries",
    );
  }

  return {
    runId: run.id,
    status,
    log: run.log,
    attempts: run.attempts,
    nextAttemptAt: run.nextAttemptAt?.toISOString() ?? null,
  };
}

/** Runs a workflow once and records what happened. */
export async function runWorkflowNow(input: {
  workflow: WorkflowShape;
  actor: WorkflowActor;
  trigger: string;
  context?: StoredContext;
}): Promise<RunRecord> {
  const outcome = await executeWorkflow(input.workflow, input.actor);
  return recordOutcome({
    organizationId: input.actor.organizationId,
    workflow: input.workflow,
    trigger: input.trigger,
    outcome,
    context: {
      userId: input.actor.userId,
      userName: input.actor.userName,
      moduleId: input.workflow.moduleId,
      recordId: input.actor.recordId ?? null,
      ...input.context,
    },
    attempts: 1,
  });
}

/** Executes one existing run again, against the record that triggered it. */
async function replayRun(input: {
  run: { id: string; attempts: number; context: string; trigger: string };
  workflow: WorkflowShape & { status: string };
  organizationId: string;
  attempts: number;
  runId?: string;
}): Promise<RunRecord> {
  const stored = parseStoredContext(input.run.context);

  if (input.workflow.status !== "Active") {
    return recordOutcome({
      organizationId: input.organizationId,
      workflow: input.workflow,
      trigger: input.run.trigger,
      outcome: { status: "skipped", log: "Workflow is paused — nothing ran" },
      context: stored,
      runId: input.runId,
      attempts: input.attempts,
    });
  }

  const outcome = await executeWorkflow(input.workflow, {
    organizationId: input.organizationId,
    userId: stored.userId ?? "",
    userName: stored.userName ?? "Automation",
    recordId: stored.recordId ?? null,
  });

  return recordOutcome({
    organizationId: input.organizationId,
    workflow: input.workflow,
    trigger: input.run.trigger,
    outcome,
    context: stored,
    runId: input.runId,
    attempts: input.attempts,
  });
}

/**
 * Picks up failed runs whose backoff has elapsed and tries them again.
 *
 * The claim moves `nextAttemptAt` forward before the attempt runs, so two API
 * nodes cannot both execute the same retry, and a crash mid-attempt leaves the
 * run failed-and-due rather than stuck in an "in progress" state nobody clears.
 */
export async function retryDueWorkflowRuns(now = new Date()): Promise<{ retried: number }> {
  const due = await prisma.workflowRun.findMany({
    where: { status: "failed", nextAttemptAt: { lte: now } },
    include: { workflow: true },
    orderBy: { nextAttemptAt: "asc" },
    take: 25,
  });

  let retried = 0;
  for (const run of due) {
    const claimed = await prisma.workflowRun.updateMany({
      where: { id: run.id, status: "failed", nextAttemptAt: { lte: now } },
      // Hold the slot while this attempt runs.
      data: { nextAttemptAt: new Date(now.getTime() + retryDelayMs(run.attempts + 1)) },
    });
    if (claimed.count === 0) continue;

    try {
      await replayRun({
        run,
        workflow: run.workflow,
        organizationId: run.workflow.organizationId,
        attempts: run.attempts + 1,
        runId: run.id,
      });
      retried += 1;
    } catch (error) {
      logger.error({ err: error, runId: run.id }, "Workflow retry threw");
      await recordOutcome({
        organizationId: run.workflow.organizationId,
        workflow: run.workflow,
        trigger: run.trigger,
        outcome: {
          status: "failed",
          log: error instanceof Error ? error.message : "Retry failed",
        },
        context: parseStoredContext(run.context),
        runId: run.id,
        attempts: run.attempts + 1,
      }).catch(() => undefined);
    }
  }

  return { retried };
}

/** A person pressed "Try again" on a failed or dead run. */
export async function retryWorkflowRunById(
  runId: string,
  organizationId: string,
): Promise<RunRecord | null> {
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, workflow: { organizationId } },
    include: { workflow: true },
  });
  if (!run) return null;

  // A human retry restores the full budget: the point of pressing the button is
  // that this run should get a fair chance, not inherit the exhausted count.
  return replayRun({
    run,
    workflow: run.workflow,
    organizationId,
    attempts: 1,
    runId: run.id,
  });
}

/** A person decided a dead run should not be tried again. */
export async function discardWorkflowRunById(
  runId: string,
  organizationId: string,
): Promise<boolean> {
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, workflow: { organizationId } },
  });
  if (!run) return false;

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: "discarded",
      nextAttemptAt: null,
      log: `${run.log}${run.log ? " · " : ""}Discarded by a person — it will not run again`,
      finishedAt: new Date(),
    },
  });
  return true;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the in-process retry loop (only on the node that owns schedulers). */
export function startWorkflowRetryScheduler(intervalMs = 60_000): void {
  if (timer) return;
  const tick = () => {
    void retryDueWorkflowRuns().catch((error: unknown) => {
      logger.error({ err: error }, "Workflow retry loop failed");
    });
  };
  // Catch anything that came due while the server was restarting.
  setTimeout(tick, 10_000);
  timer = setInterval(tick, intervalMs);
}

export function stopWorkflowRetryScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
