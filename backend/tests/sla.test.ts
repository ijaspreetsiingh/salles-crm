import { describe, expect, it } from "vitest";
import {
  isSlaBreached,
  slaDueDate,
  slaState,
} from "../src/services/sla";

/**
 * Support SLA timers — breached tickets escalate instead of sitting unseen.
 *
 * Priorities and their response windows:
 *   Urgent  → 4 hours
 *   High    → 1 day
 *   Normal  → 3 days
 *   Low     → 7 days
 */

const ticket = (over: {
  status?: string;
  extra?: string | null;
  date?: string | null;
}) => ({
  id: "tkt-1",
  reference: "TKT-2401",
  name: "Refund not received",
  status: over.status ?? "Open",
  extra: over.extra ?? null,
  date: over.date ?? null,
});

const now = () => new Date().toISOString().slice(0, 10);
const tomorrow = () =>
  new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const yesterday = () =>
  new Date(Date.now() - 86400000).toISOString().slice(0, 10);

describe("SLA due date by priority", () => {
  it("Urgent expires in 4 hours", () => {
    expect(slaDueDate("Urgent", "2026-11-12T08:00:00.000Z")).toBe("2026-11-12");
  });

  it("High expires in 1 day", () => {
    expect(slaDueDate("High", "2026-11-12T08:00:00.000Z")).toBe("2026-11-13");
  });

  it("Normal expires in 3 days", () => {
    expect(slaDueDate("Normal", "2026-11-12T08:00:00.000Z")).toBe("2026-11-15");
  });

  it("Low expires in 7 days", () => {
    expect(slaDueDate("Low", "2026-11-12T08:00:00.000Z")).toBe("2026-11-19");
  });

  it("Unknown priority defaults to Normal (3 days)", () => {
    expect(slaDueDate("Whatever", "2026-11-12T08:00:00.000Z")).toBe(
      "2026-11-15",
    );
  });
});

describe("breach detection", () => {
  it("a ticket due today is breached", () => {
    expect(isSlaBreached(ticket({ date: yesterday() }))).toBe(true);
  });

  it("a ticket due tomorrow is not breached", () => {
    expect(isSlaBreached(ticket({ date: tomorrow() }))).toBe(false);
  });

  it("a resolved ticket is not breached even when past due", () => {
    expect(isSlaBreached(ticket({ status: "Resolved", date: yesterday() }))).toBe(
      false,
    );
  });

  it("a closed ticket is not breached even when past due", () => {
    expect(isSlaBreached(ticket({ status: "Closed", date: yesterday() }))).toBe(
      false,
    );
  });

  it("a ticket with no due date is not breached", () => {
    expect(isSlaBreached(ticket({ date: null }))).toBe(false);
  });
});

describe("SLA state for the UI", () => {
  it("breached tickets show 'breached'", () => {
    expect(slaState(ticket({ date: yesterday() }))).toBe("breached");
  });

  it("tickets due within 4 hours show 'due soon'", () => {
    const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    expect(slaState(ticket({ date: inTwoHours }))).toBe("due soon");
  });

  it("tickets due later show 'ok'", () => {
    expect(slaState(ticket({ date: tomorrow() }))).toBe("ok");
  });

  it("resolved tickets show 'ok' even when past due", () => {
    expect(
      slaState(ticket({ status: "Resolved", date: yesterday() })),
    ).toBe("ok");
  });

  it("tickets without a due date show 'ok'", () => {
    expect(slaState(ticket({ date: null }))).toBe("ok");
  });
});
