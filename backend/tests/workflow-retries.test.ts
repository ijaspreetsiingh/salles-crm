import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A failed automation must be retried, and must stop being retried.
 *
 * The rule this pins: every failure gets a next attempt until the budget runs
 * out, the failure that exhausts the budget parks the run for a person, and the
 * team is told once. Before this, all three failures looked like one quiet row.
 */

const notifications = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      create: async (args: { data: Record<string, unknown> }) => ({
        id: "run-1",
        ...args.data,
      }),
      update: async (args: { data: Record<string, unknown> }) => ({
        id: "run-1",
        ...args.data,
      }),
    },
    workflow: { update: async () => ({}) },
  },
}));

vi.mock("../src/services/notifications", () => ({
  createNotification: async (input: Record<string, unknown>) => {
    notifications.push(input);
    return { id: `n-${notifications.length}` };
  },
}));

vi.mock("../src/services/workflow-graph", () => ({
  parseGraph: () => null,
  runWorkflowGraph: async () => ({ status: "success", log: "", nodes: [], dryRun: false }),
}));

const { MAX_ATTEMPTS, nextAttemptAtFor, recordOutcome, retryDelayMs } = await import(
  "../src/services/workflow-runs"
);

const workflow = {
  id: "workflow-1",
  name: "Booking confirmed → task",
  moduleId: "bookings",
  trigger: "booking_confirmed",
  condition: "All records",
  action: "Create a follow-up task",
  graph: "",
};

const fail = (attempts: number) =>
  recordOutcome({
    organizationId: "org-1",
    workflow,
    trigger: "booking_confirmed · status Pending → Confirmed",
    outcome: { status: "failed", log: "task table unavailable" },
    context: { recordId: "record-1", userName: "Priya" },
    attempts,
  });

describe("workflow retry budget", () => {
  beforeEach(() => {
    notifications.length = 0;
  });

  it("waits a minute, then five, between attempts", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(300_000);
    expect(retryDelayMs(3)).toBe(900_000);
    // Past the budget the delay only exists to feed a manual retry.
    expect(retryDelayMs(9)).toBe(900_000);
  });

  it("schedules another attempt for every failure before the budget runs out", async () => {
    const first = await fail(1);

    expect(first.status).toBe("failed");
    expect(first.nextAttemptAt).not.toBeNull();
    const wait = new Date(first.nextAttemptAt!).getTime() - Date.now();
    expect(wait).toBeGreaterThan(50_000);
    expect(wait).toBeLessThan(70_000);
    expect(notifications).toHaveLength(0);
  });

  it("dead-letters the failure that exhausts the budget and tells the team once", async () => {
    const last = await fail(MAX_ATTEMPTS);

    expect(last.status).toBe("dead");
    expect(last.nextAttemptAt).toBeNull();
    expect(notifications).toHaveLength(1);
    expect(String(notifications[0]?.title)).toContain("gave up");
    expect(String(notifications[0]?.body)).toContain("task table unavailable");
  });

  it("clears the retry when an attempt finally succeeds", async () => {
    const done = await recordOutcome({
      organizationId: "org-1",
      workflow,
      trigger: "booking_confirmed",
      outcome: { status: "success", log: "Created follow-up task task-9" },
      context: { recordId: "record-1" },
      attempts: 2,
    });

    expect(done.status).toBe("success");
    expect(done.nextAttemptAt).toBeNull();
    expect(notifications).toHaveLength(0);
  });

  it("returns no next attempt once the budget is spent", () => {
    expect(nextAttemptAtFor(1)).toBeInstanceOf(Date);
    expect(nextAttemptAtFor(2)).toBeInstanceOf(Date);
    expect(nextAttemptAtFor(MAX_ATTEMPTS)).toBeNull();
  });
});
