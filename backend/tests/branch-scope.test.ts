import { describe, expect, it } from "vitest";
import { applyBranchScope } from "../src/services/records";

/**
 * Branch isolation must hold even when the caller has already built a
 * free-text search in `where.OR`. Appending the branch condition to that same
 * `OR` used to let sibling-branch records match the search term.
 */
describe("applyBranchScope", () => {
  const auth = { roleKey: "sales", branchId: "branch-mumbai" };

  it("keeps branch scope in its own AND clause beside an existing OR search", () => {
    const where = applyBranchScope({ organizationId: "org-1", OR: [{ name: { contains: "Priya" } }] }, auth);

    expect(where.OR).toEqual([{ name: { contains: "Priya" } }]);
    expect(where.AND).toEqual([{ OR: [{ branchId: "branch-mumbai" }, { branchId: null }] }]);
  });

  it("preserves an existing AND clause when adding the branch scope", () => {
    const where = applyBranchScope(
      { organizationId: "org-1", AND: [{ status: "New" }] },
      auth,
    );

    expect(where.AND).toEqual([
      { status: "New" },
      { OR: [{ branchId: "branch-mumbai" }, { branchId: null }] },
    ]);
  });

  it("does not scope roles that see the whole company", () => {
    const where = applyBranchScope({ organizationId: "org-1" }, { roleKey: "company_admin", branchId: null });
    expect(where.AND).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  it("narrows an explicit branch request to the caller's own branch", () => {
    const where = applyBranchScope({ organizationId: "org-1" }, auth, "Delhi");
    expect(where.branchName).toBe("Delhi");
    expect(where.branchId).toBe("branch-mumbai");
  });
});
