import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterContextProvider } from "@tanstack/react-router";

import { Work } from "@/components/crm/archetypes/work";
import { Workspace } from "@/components/crm/workspace";
import { CRMProvider } from "@/lib/crm/store";
import { statusBucket } from "@/lib/crm/language";
import { modules, type RecordRow } from "@/lib/crm/catalog";
import { routeTree } from "@/routeTree.gen";

const row = (over: Partial<RecordRow>): RecordRow => ({
  id: "IN-1",
  name: "Priya Mehta",
  detail: "",
  destination: "",
  owner: "Rahul Verma",
  branch: "Delhi",
  date: "2026-10-20",
  amount: 92_000,
  status: "Sent",
  email: "",
  phone: "",
  source: "",
  notes: "",
  ...over,
});

afterEach(cleanup);

describe("status buckets", () => {
  it("puts late and unpicked work with you", () => {
    expect(statusBucket("Overdue")).toBe("yours");
    expect(statusBucket("New")).toBe("yours");
    expect(statusBucket("Documents pending")).toBe("yours");
  });

  it("puts work that is with somebody else aside", () => {
    expect(statusBucket("Sent")).toBe("waiting");
    expect(statusBucket("Pending")).toBe("waiting");
    expect(statusBucket("In review")).toBe("waiting");
  });

  it("counts settled records as nothing to do", () => {
    expect(statusBucket("Paid")).toBe("done");
    expect(statusBucket("Completed")).toBe("done");
    expect(statusBucket("Cancelled")).toBe("done");
  });

  it("never treats a status it does not know as finished", () => {
    expect(statusBucket("Escalated")).toBe("yours");
    expect(statusBucket("Something brand new")).toBe("yours");
  });
});

describe("Work layout", () => {
  it("opens on the work, in the words the status carries", () => {
    render(
      <Work
        rows={[
          row({ id: "IN-1", status: "Overdue", name: "Priya Mehta" }),
          row({ id: "QT-2", status: "Sent", name: "Aarav Shah" }),
          row({ id: "IN-3", status: "Paid", name: "Meera Nair" }),
        ]}
        currency="INR"
        onOpen={() => {}}
      />,
    );

    const headings = screen.getAllByRole("heading").map((h) => (h.textContent ?? "").trim());
    expect(headings).toEqual(["Needs you", "Waiting on someone else", "Nothing to do"]);

    // The overdue row says what to do about it, not just its status.
    // (The status chip carries the same words as its tooltip, hence all.)
    expect(screen.getAllByText("Chase the payment.").length).toBeGreaterThan(0);
    // A sent quote says what is being waited on.
    expect(
      screen.getAllByText("The customer has the price and is deciding.").length,
    ).toBeGreaterThan(0);
  });

  it("shows the person, the office and the amount on the same row", () => {
    render(
      <Work
        rows={[row({ status: "Overdue", destination: "Bali", branch: "Delhi" })]}
        currency="INR"
        onOpen={() => {}}
      />,
    );

    const text = document.body.textContent ?? "";
    expect(text).toContain("Priya Mehta");
    expect(text).toContain("Bali · 20 Oct 2026 · Delhi");
    expect(text).toContain("Rahul Verma");
    expect(text).toContain("92,000");
  });

  it("opens on a guided empty state, never a wall of columns", () => {
    window.localStorage.clear();
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RouterContextProvider router={router}>
        <CRMProvider>{children}</CRMProvider>
      </RouterContextProvider>
    );
    const leads = modules.find((m) => m.id === "leads")!;

    const { container } = render(
      <CRMProvider>
        <Workspace module={leads} />
      </CRMProvider>,
      { wrapper },
    );

    /*
     * The workspace is API-backed now, so a module with no records opens on
     * the guided empty state that tells you what the record is and how to
     * make the first one — not on an empty table with column headers.
     */
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toContain("Enquiries");
    expect(screen.getByText(/No .* yet/)).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });

  it("keeps the empty state when the module has no records", () => {
    render(
      <Work
        rows={[]}
        currency="INR"
        onOpen={() => {}}
        onCreate={() => {}}
        createLabel="Add an invoice"
        emptyTitle="No invoices yet"
      />,
    );

    expect(screen.getByText("No invoices yet")).toBeTruthy();
    expect(screen.getByText("Add an invoice")).toBeTruthy();
  });
});
