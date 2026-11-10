import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import { CRMProvider, useCRM } from "@/lib/crm/store";

const wrapper = ({ children }: { children: ReactNode }) => <CRMProvider>{children}</CRMProvider>;

/**
 * The store is API-backed: it never keeps a local pretend list of records.
 * These tests hold it to that promise — a disconnected workspace shows no
 * invented records, and a save while disconnected is refused instead of
 * silently disappearing on the next reload.
 */
describe("CRM store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts disconnected with no invented records", async () => {
    const { result } = renderHook(() => useCRM(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"), { timeout: 3000 });
    expect(result.current.user).toBeNull();
    expect(result.current.getRows("leads")).toHaveLength(0);

    act(() =>
      result.current.save("leads", {
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
      }),
    );

    // Nothing was written, and nothing pretends it was.
    expect(result.current.getRows("leads")).toHaveLength(0);
  });

  it("keeps the organisation defaults available before sign-in", async () => {
    const { result } = renderHook(() => useCRM(), { wrapper });

    await waitFor(() => expect(result.current.status).not.toBe("loading"), { timeout: 3000 });
    expect(result.current.settings.currency).toBe("INR");
    expect(result.current.settings.branches.length).toBeGreaterThan(0);
    expect(result.current.settings.employees.length).toBeGreaterThan(0);
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
});
