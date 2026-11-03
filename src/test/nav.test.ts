import { describe, expect, it } from "vitest";

import {
  buildNavEntries,
  buildSidebarGroups,
  CORE_LINKS,
  DEFAULT_ENABLED_MODULES,
  EXTRA_MODULE_IDS,
} from "@/lib/crm/nav";

const ids = (groups: ReturnType<typeof buildSidebarGroups>) =>
  groups.flatMap((group) => group.entries.map((entry) => entry.id));

describe("sidebar", () => {
  it("keeps the things a CRM is used for every day in the fixed core", () => {
    const core = CORE_LINKS.flatMap((group) => group.entries.map((entry) => entry.id));
    for (const id of [
      "today",
      "leads",
      "customers",
      "packages",
      "quotations",
      "bookings",
      "finance",
      "tasks",
      "inbox",
      "reports",
      "team",
    ]) {
      expect(core).toContain(id);
    }
  });

  it("never offers a core screen under Add more", () => {
    for (const id of ["packages", "leads", "quotations", "bookings", "finance"]) {
      expect(EXTRA_MODULE_IDS).not.toContain(id);
    }
    expect(DEFAULT_ENABLED_MODULES).toContain("packages");
  });

  it("hides the screens a role cannot open, without hiding Today or Tasks", () => {
    const visible = ids(buildSidebarGroups([], ["leads", "customers", "packages", "quotations"]));
    expect(visible).toContain("packages");
    expect(visible).toContain("today");
    expect(visible).not.toContain("bookings");
    expect(visible).not.toContain("finance");
    // Standalone screens are not role-gated.
    expect(buildNavEntries([], ["leads"]).map((entry) => entry.id)).toContain("tasks");
  });

  it("shows everything for full access", () => {
    expect(ids(buildSidebarGroups([], "*"))).toEqual(
      CORE_LINKS.flatMap((group) => group.entries.map((entry) => entry.id)),
    );
  });
});
