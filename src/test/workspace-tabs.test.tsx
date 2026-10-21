import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterContextProvider } from "@tanstack/react-router";

import { modules } from "@/lib/crm/catalog";
import { Workspace } from "@/components/crm/workspace";
import { CRMProvider } from "@/lib/crm/store";
import { guideFor } from "@/lib/crm/guide";
import { routeTree } from "@/routeTree.gen";

// Views that intentionally render an empty state because nothing exists yet
// (no live connections / no saved reports).
const expectedEmptyViews = new Set(["integrations:Connection logs", "reports:Saved reports"]);

const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

const wrapper = ({ children }: { children: ReactNode }) => (
  <RouterContextProvider router={router}>
    <CRMProvider>{children}</CRMProvider>
  </RouterContextProvider>
);

/** Every view a module exposes, following the new trimmed guide model. */
const viewsFor = (moduleId: string) => {
  const module = modules.find((m) => m.id === moduleId)!;
  const special = new Set([
    "assistant",
    "inbox",
    "integrations",
    "settings",
    "reports",
    "quotations",
    "automation",
    "flights",
  ]);
  return special.has(moduleId) ? module.tabs : guideFor(module).views.map((v) => v.label);
};

const openView = (view: string) => {
  const button = screen
    .getAllByRole("button")
    .find((b) => (b.textContent ?? "").trim().startsWith(view));
  expect(button, `View "${view}" is missing from the module switchboard`).toBeTruthy();
  if (button) fireEvent.click(button);
};

afterEach(cleanup);

describe("Every workspace module view renders real content", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it.each(modules.flatMap((m) => viewsFor(m.id).map((view) => ({ module: m, view }))))(
    "$module.name · $view",
    ({ module, view }) => {
      const { container } = render(
        <CRMProvider>
          <Workspace module={module} />
        </CRMProvider>,
        { wrapper },
      );

      openView(view);
      const text = container.textContent ?? "";

      // No raw JS values leaking into the UI.
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("[object Object]");

      const key = `${module.id}:${view}`;
      if (expectedEmptyViews.has(key)) {
        expect(text.length).toBeGreaterThan(50);
        return;
      }

      // Every view must show real content, never the empty state.
      expect(
        text.includes("No records found") || text.includes("No tasks here"),
        `Module "${module.name}" view "${view}" rendered an unexpected empty state`,
      ).toBe(false);
      expect(
        text.length,
        `Module "${module.name}" view "${view}" rendered no content`,
      ).toBeGreaterThan(120);
    },
    20000,
  );
});
