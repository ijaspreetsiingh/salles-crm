import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import { CRMProvider, useCRM } from "@/lib/crm/store";

const wrapper = ({ children }: { children: ReactNode }) => <CRMProvider>{children}</CRMProvider>;

describe("CRM store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("seeds records, tasks and settings", () => {
    const { result } = renderHook(() => useCRM(), { wrapper });
    expect(result.current.getRows("leads")).toHaveLength(8);
    expect(result.current.tasks.length).toBeGreaterThanOrEqual(6);
    expect(result.current.settings.employees.length).toBeGreaterThan(0);
    expect(result.current.settings.branches.length).toBeGreaterThan(0);
  });

  it("creates, updates and deletes records with audit entries", () => {
    const { result } = renderHook(() => useCRM(), { wrapper });
    const row = {
      id: "LD-TEST1",
      name: "Test lead",
      detail: "2 travellers",
      destination: "Bali, Indonesia",
      owner: "Sarah Wilson",
      branch: "Mumbai",
      date: "2026-10-20",
      amount: 1000,
      status: "New",
      email: "t@example.com",
      phone: "+91 1",
      source: "Website",
      notes: "",
    };

    act(() => result.current.save("leads", row));
    expect(result.current.getRows("leads")[0]!.id).toBe("LD-TEST1");
    expect(result.current.audit[0]).toMatchObject({
      action: "Created",
      recordId: "LD-TEST1",
      module: "leads",
    });

    act(() => result.current.update("leads", { ...row, status: "Qualified" }));
    expect(result.current.getRows("leads").find((r) => r.id === "LD-TEST1")?.status).toBe(
      "Qualified",
    );
    expect(result.current.audit[0]!.action).toBe("Updated");

    act(() => result.current.remove("leads", "LD-TEST1"));
    expect(result.current.getRows("leads").find((r) => r.id === "LD-TEST1")).toBeUndefined();
    expect(result.current.audit[0]!.action).toBe("Deleted");
  });

  it("adds and toggles tasks", () => {
    const { result } = renderHook(() => useCRM(), { wrapper });
    const before = result.current.tasks.length;

    act(() =>
      result.current.addTask({
        title: "New task",
        type: "Sales follow-up",
        owner: "Sarah Wilson",
        date: "2026-10-20",
        priority: "High",
        done: false,
      }),
    );
    expect(result.current.tasks).toHaveLength(before + 1);

    const created = result.current.tasks.at(-1);
    expect(created).toBeDefined();
    act(() => result.current.toggleTask(created!.id, true));
    expect(result.current.tasks.at(-1)?.done).toBe(true);
  });

  it("adds and removes custom fields per module", () => {
    const { result } = renderHook(() => useCRM(), { wrapper });

    act(() =>
      result.current.addField("customers", { id: "cf-1", label: "Passport number", type: "text" }),
    );
    expect(result.current.fields["customers"]).toHaveLength(1);

    act(() => result.current.removeField("customers", "cf-1"));
    expect(result.current.fields["customers"]).toHaveLength(0);
  });

  it("updates organisation settings", () => {
    const { result } = renderHook(() => useCRM(), { wrapper });

    act(() => result.current.updateSettings({ currency: "USD", branches: ["Mumbai", "Goa"] }));
    expect(result.current.settings.currency).toBe("USD");
    expect(result.current.settings.branches).toContain("Goa");
  });

  it("starts unauthenticated and falls back to catalogue data without a session", () => {
    const { result } = renderHook(() => useCRM(), { wrapper });

    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
    // Catalogue rows keep the workspace renderable before sign-in.
    expect(result.current.getRows("leads").length).toBeGreaterThan(0);
    expect(result.current.tasks.length).toBeGreaterThan(0);
  });
});
