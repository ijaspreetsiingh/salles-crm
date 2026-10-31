import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterContextProvider } from "@tanstack/react-router";

import { Team } from "@/components/crm/team";
import { CRMProvider } from "@/lib/crm/store";
import { routeTree } from "@/routeTree.gen";

const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

const wrapper = ({ children }: { children: ReactNode }) => (
  <RouterContextProvider router={router}>
    <CRMProvider>{children}</CRMProvider>
  </RouterContextProvider>
);

afterEach(cleanup);

describe("Your team", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the demo team without inventing workload numbers", () => {
    const { container } = render(<Team />, { wrapper });
    const text = container.textContent ?? "";

    expect(text).toContain("Your team");
    expect(text).toContain("Sarah Wilson");
    expect(text).toContain("Carrying work");
    // Signed out, a workload is unknown — it must never be rendered as 0.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("[object Object]");
  });

  it("narrows the list when searching for a person", () => {
    const { container } = render(<Team />, { wrapper });

    fireEvent.change(screen.getByLabelText("Search the team"), {
      target: { value: "Rahul" },
    });

    expect(container.textContent).toContain("Rahul Verma");
    expect(container.textContent).not.toContain("Sarah Wilson");
  });
});
