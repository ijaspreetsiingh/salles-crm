import { describe, expect, it } from "vitest";
import { groupDuplicates, type DuplicateCandidate } from "../src/services/duplicates";

/* ==========================================================================
   Duplicate detection.

   These are the decisions that decide whether two customers are treated as
   one, so they are the decisions worth pinning down. A test that only checked
   "a group came back" would happily pass a tool that merged two different
   people with the same first name.
   ========================================================================== */

const at = (day: number) => new Date(Date.UTC(2026, 0, day));

const row = (
  reference: string,
  overrides: Partial<DuplicateCandidate> = {},
): DuplicateCandidate => ({
  id: `id-${reference}`,
  reference,
  name: `Person ${reference}`,
  createdAt: at(1),
  ...overrides,
});

const refsOf = (groups: ReturnType<typeof groupDuplicates>) =>
  groups.map((group) => group.records.map((record) => record.reference));

describe("groupDuplicates", () => {
  it("finds nothing when nothing is the same", () => {
    expect(
      groupDuplicates([
        row("A", { name: "Priya Mehta", email: "priya@example.com" }),
        row("B", { name: "Rahul Verma", email: "rahul@example.com" }),
      ]),
    ).toEqual([]);
  });

  it("matches on the same email regardless of case", () => {
    const groups = groupDuplicates([
      row("A", { name: "Priya", email: "Priya@Example.com" }),
      row("B", { name: "P Mehta", email: "priya@example.com" }),
    ]);
    expect(refsOf(groups)).toEqual([["A", "B"]]);
    expect(groups[0]!.reasons).toEqual(["Same email address"]);
  });

  it("treats a full number and its last ten digits as the same line", () => {
    const groups = groupDuplicates([
      row("A", { name: "One", phone: "+91 98200 70001" }),
      row("B", { name: "Two", phone: "9820070001" }),
    ]);
    expect(refsOf(groups)).toEqual([["A", "B"]]);
    expect(groups[0]!.reasons).toEqual(["Same phone number"]);
  });

  it("ignores anything too short to be a real phone number", () => {
    // A shared office extension is not a shared customer.
    expect(
      groupDuplicates([
        row("A", { name: "One", phone: "12345" }),
        row("B", { name: "Two", phone: "12345" }),
      ]),
    ).toEqual([]);
  });

  it("ignores a value that is not an email address", () => {
    expect(
      groupDuplicates([
        row("A", { name: "One", email: "not-an-email" }),
        row("B", { name: "Two", email: "not-an-email" }),
      ]),
    ).toEqual([]);
  });

  it("folds the three signals so a pair matching twice appears once", () => {
    // A and B share an email, B and C share a phone number, and no two share
    // a name — so the only reason this is one group is the folding.
    const groups = groupDuplicates([
      row("A", { name: "Priya Mehta", email: "priya@example.com" }),
      row("B", { name: "P Mehta", email: "priya@example.com", phone: "9820070001" }),
      row("C", { name: "Someone Else", phone: "+91 98200 70001" }),
    ]);
    expect(refsOf(groups)).toEqual([["A", "B", "C"]]);
    expect(groups[0]!.reasons).toEqual(["Same email address", "Same phone number"]);
  });

  it("keeps two genuinely different pairs apart", () => {
    const groups = groupDuplicates([
      row("A", { name: "Priya", email: "priya@example.com" }),
      row("B", { name: "Priya again", email: "priya@example.com" }),
      row("C", { name: "Rahul", phone: "9811100022" }),
      row("D", { name: "Rahul V", phone: "9811100022" }),
    ]);
    expect(refsOf(groups)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });

  it("offers the oldest record first, because that is the one on the paperwork", () => {
    const groups = groupDuplicates([
      row("NEW", { name: "Priya", email: "priya@example.com", createdAt: at(9) }),
      row("OLD", { name: "Priya", email: "priya@example.com", createdAt: at(2) }),
    ]);
    expect(groups[0]!.key).toBe("OLD");
    expect(groups[0]!.records.map((r) => r.reference)).toEqual(["OLD", "NEW"]);
  });

  it("sees through company name suffixes only where asked", () => {
    const pair = [
      row("A", { name: "Sunrise Travels Pvt Ltd" }),
      row("B", { name: "Sunrise Travels" }),
    ];
    expect(groupDuplicates(pair, { stripSuffix: true })).toHaveLength(1);
    expect(groupDuplicates(pair)).toHaveLength(0);
    expect(groupDuplicates(pair, { stripSuffix: true })[0]!.reasons).toEqual(["Same company name"]);
  });

  it("never offers a group bigger than six, because that is not a duplicate pair", () => {
    const crowd = Array.from({ length: 7 }, (_, index) =>
      row(`R${index}`, { name: "Shared Name", createdAt: at(index + 1) }),
    );
    expect(groupDuplicates(crowd)).toEqual([]);
    // Six still counts — a family sharing one phone line is real.
    expect(groupDuplicates(crowd.slice(0, 6))).toHaveLength(1);
  });

  it("ranks the biggest group first", () => {
    const groups = groupDuplicates([
      row("A", { name: "One", email: "one@example.com" }),
      row("B", { name: "One", email: "one@example.com" }),
      row("C", { name: "Two", email: "two@example.com" }),
      row("D", { name: "Two", email: "two@example.com" }),
      row("E", { name: "Two", email: "two@example.com" }),
    ]);
    expect(groups.map((g) => g.records.length)).toEqual([3, 2]);
  });

  it("reports how full each record is, so the survivor suggestion is informed", () => {
    const groups = groupDuplicates([
      row("THIN", { name: "Priya", email: "priya@example.com", createdAt: at(1) }),
      row("FULL", {
        name: "Priya",
        email: "priya@example.com",
        phone: "9820070001",
        destination: "Bali",
        owner: "Rahul",
        createdAt: at(2),
      }),
    ]);
    const [thin, full] = groups[0]!.records;
    expect(full!.filled).toBeGreaterThan(thin!.filled);
  });
});
