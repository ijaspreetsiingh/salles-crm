import { describe, expect, it } from "vitest";
import { buildWorklist, greeting, worklistHeadline } from "@/lib/crm/worklist";
import type { RecordRow, Task } from "@/lib/crm/catalog";

/* The home page is only useful if the list is honest: real records, real
   dates, and the most urgent thing first. */

const today = "2026-03-10";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Do the thing",
  type: "Sales follow-up",
  owner: "Sarah Wilson",
  date: today,
  priority: "Normal",
  done: false,
  ...over,
});

const row = (over: Partial<RecordRow> = {}): RecordRow => ({
  id: "R-1",
  name: "Aarav Sharma",
  detail: "",
  destination: "Bali, Indonesia",
  owner: "Sarah Wilson",
  branch: "Mumbai",
  date: today,
  amount: 100000,
  status: "Confirmed",
  email: "a@example.com",
  phone: "",
  source: "Website",
  notes: "",
  ...over,
});

const base = {
  tasks: [] as Task[],
  leads: [] as RecordRow[],
  bookings: [] as RecordRow[],
  finance: [] as RecordRow[],
  visa: [] as RecordRow[],
  currency: "INR",
  today,
};

describe("The worklist", () => {
  it("says nothing is waiting when there is nothing to do", () => {
    const list = buildWorklist(base);
    expect(list).toHaveLength(0);
    expect(worklistHeadline(list)).toContain("Nothing is waiting");
  });

  it("puts late work first", () => {
    const list = buildWorklist({
      ...base,
      tasks: [task({ id: "late", title: "Late one", date: "2026-03-01" })],
      finance: [row({ id: "INV-1", status: "Overdue", amount: 92000 })],
    });
    expect(list[0]?.tone).toBe("overdue");
    expect(list.map((i) => i.title)).toContain("Chase payment for Aarav Sharma");
  });

  it("says how much money is late", () => {
    const list = buildWorklist({
      ...base,
      finance: [row({ id: "INV-1", status: "Overdue", amount: 92000 })],
    });
    const item = list.find((i) => i.id === "invoice-INV-1");
    expect(item?.detail).toContain("₹92,000");
    expect(item?.detail).toContain("late");
  });

  it("only nudges about enquiries that have really been waiting", () => {
    const list = buildWorklist({
      ...base,
      leads: [
        row({ id: "LD-1", status: "New", date: "2026-03-09" }),
        row({ id: "LD-2", status: "New", date: "2026-02-01" }),
      ],
    });
    const ids = list.map((i) => i.id);
    expect(ids).toContain("lead-LD-2");
    expect(ids).not.toContain("lead-LD-1");
  });

  it("never lists the same record twice", () => {
    const list = buildWorklist({
      ...base,
      tasks: [task({ id: "a" }), task({ id: "b", date: "2026-03-09" })],
    });
    expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
  });

  it("keeps the list short enough to read", () => {
    const list = buildWorklist({
      ...base,
      tasks: Array.from({ length: 20 }, (_, i) =>
        task({ id: `t${i}`, title: `Task ${i}`, date: "2026-03-01" }),
      ),
    });
    expect(list.length).toBeLessThanOrEqual(7);
  });

  it("does not list finished tasks", () => {
    const list = buildWorklist({
      ...base,
      tasks: [task({ done: true, date: "2026-01-01" })],
    });
    expect(list).toHaveLength(0);
  });
});

describe("The headline", () => {
  it("counts what is late", () => {
    const list = buildWorklist({
      ...base,
      tasks: [task({ id: "a", date: "2026-03-01" }), task({ id: "b", date: "2026-03-02" })],
    });
    expect(worklistHeadline(list)).toContain("already late");
  });

  it("greets people according to the time of day", () => {
    expect(greeting(new Date("2026-03-10T08:00:00"))).toBe("Good morning");
    expect(greeting(new Date("2026-03-10T14:00:00"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-03-10T20:00:00"))).toBe("Good evening");
  });
});
