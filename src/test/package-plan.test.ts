import { describe, expect, it } from "vitest";

import type { RecordRow } from "@/lib/crm/catalog";
import {
  fromPrice,
  packageMargin,
  planExtra,
  planQuoteExtra,
  plannedNights,
  priceForTravellers,
  quoteItemsFromPlan,
  readPackagePlan,
  slabForAdults,
} from "@/lib/crm/package-plan";

const row = (extra: Record<string, string | number> = {}, overrides: Partial<RecordRow> = {}) =>
  ({
    id: "PKG-1001",
    name: "Bali Honeymoon",
    detail: "",
    destination: "Bali",
    owner: "Priya",
    branch: "Mumbai",
    date: "2026-12-31",
    amount: 0,
    status: "Draft",
    email: "",
    phone: "",
    source: "",
    notes: "",
    extra,
    ...overrides,
  }) satisfies RecordRow;

describe("readPackagePlan", () => {
  it("reads a stored plan with days, lines and slabs", () => {
    const plan = readPackagePlan(
      row({
        packagePlan: JSON.stringify({
          days: [{ title: "Arrive", detail: "Transfer to Nusa Dua" }],
          inclusions: ["Hotel with breakfast"],
          exclusions: ["Flights"],
          slabs: [
            { pax: 4, rate: 44000 },
            { pax: 2, rate: 48000 },
          ],
          childRate: 20000,
          costPerPerson: 38000,
          validTo: "2027-03-31",
          terms: "25% advance",
        }),
      }),
    );
    expect(plan.days).toHaveLength(1);
    expect(plan.inclusions).toEqual(["Hotel with breakfast"]);
    expect(plan.slabs.map((slab) => slab.pax)).toEqual([2, 4]);
    expect(plan.costPerPerson).toBe(38000);
    expect(plan.validTo).toBe("2027-03-31");
  });

  it("reads an older package that only had an itinerary and one inclusions line", () => {
    const plan = readPackagePlan(
      row(
        { itinerary: JSON.stringify([{ title: "Day one", detail: "" }]) },
        { detail: "Stay, transfers, breakfast" },
      ),
    );
    expect(plan.days).toEqual([{ title: "Day one", detail: "" }]);
    expect(plan.inclusions).toEqual(["Stay, transfers, breakfast"]);
    expect(plan.slabs).toEqual([]);
    expect(plan.costPerPerson).toBeNull();
  });
});

describe("priceForTravellers", () => {
  const plan = readPackagePlan(
    row({
      packagePlan: JSON.stringify({
        slabs: [
          { pax: 2, rate: 48000 },
          { pax: 4, rate: 44000 },
        ],
        childRate: 20000,
      }),
      cost: 38000,
    }),
  );

  it("quotes the best published rate for the party size", () => {
    expect(slabForAdults(plan.slabs, 2)?.rate).toBe(48000);
    expect(slabForAdults(plan.slabs, 3)?.rate).toBe(48000);
    expect(slabForAdults(plan.slabs, 5)?.rate).toBe(44000);
    expect(priceForTravellers(plan, 4).total).toBe(176000);
  });

  it("charges a smaller party the smallest published rate", () => {
    expect(priceForTravellers(plan, 1).perPerson).toBe(48000);
  });

  it("uses the child rate and adds the single supplement", () => {
    const withSupplement = readPackagePlan(
      row({
        packagePlan: JSON.stringify({
          slabs: [{ pax: 1, rate: 60000 }],
          childRate: 20000,
          singleSupplement: 5000,
        }),
      }),
    );
    const price = priceForTravellers(withSupplement, 1, 2);
    expect(price.adultsTotal).toBe(60000);
    expect(price.childrenTotal).toBe(40000);
    expect(price.singleSupplement).toBe(5000);
    expect(price.total).toBe(105000);
    expect(price.childRateAssumed).toBe(false);
  });

  it("says so when children are charged the adult rate", () => {
    const price = priceForTravellers(plan, 2, 1);
    expect(price.childRateAssumed).toBe(false); // childRate is set here
    const noChildRate = readPackagePlan(
      row({ packagePlan: JSON.stringify({ slabs: [{ pax: 2, rate: 48000 }] }) }),
    );
    const assumed = priceForTravellers(noChildRate, 2, 1);
    expect(assumed.childRate).toBe(48000);
    expect(assumed.childRateAssumed).toBe(true);
  });
});

describe("margin and honesty", () => {
  it("never invents a margin without a supplier cost", () => {
    const plan = readPackagePlan(
      row({ packagePlan: JSON.stringify({ slabs: [{ pax: 2, rate: 48000 }] }) }),
    );
    expect(packageMargin(plan).amount).toBeNull();
    expect(packageMargin(plan).percent).toBeNull();
  });

  it("computes the margin from the recorded cost", () => {
    const plan = readPackagePlan(
      row({
        packagePlan: JSON.stringify({ slabs: [{ pax: 2, rate: 48000 }], costPerPerson: 38000 }),
      }),
    );
    expect(packageMargin(plan).amount).toBe(10000);
    expect(packageMargin(plan).percent).toBe(20.8);
  });

  it("reports the from-price and plan length", () => {
    const plan = readPackagePlan(
      row({
        packagePlan: JSON.stringify({
          days: [{ title: "a" }, { title: "b" }, { title: "c" }],
          slabs: [
            { pax: 2, rate: 48000 },
            { pax: 4, rate: 44000 },
          ],
        }),
      }),
    );
    expect(fromPrice(plan)).toBe(44000);
    expect(plannedNights(plan)).toBe(2);
    expect(fromPrice(readPackagePlan(row()))).toBeNull();
  });
});

describe("quote from a package", () => {
  const plan = readPackagePlan(
    row({
      packagePlan: JSON.stringify({
        days: [{ title: "Arrive", detail: "Transfer" }],
        inclusions: ["Breakfast"],
        exclusions: ["Flights"],
        slabs: [{ pax: 2, rate: 48000 }],
        childRate: 20000,
        terms: "25% advance",
        validTo: "2027-03-31",
      }),
    }),
  );

  it("turns the price ladder into quote line items", () => {
    const items = quoteItemsFromPlan(plan, "Bali Honeymoon", 2, 1);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ qty: 2, rate: 48000 });
    expect(items[1]).toMatchObject({ qty: 1, rate: 20000 });
  });

  it("carries the plan, inclusions and validity onto the quotation", () => {
    const extra = planQuoteExtra(plan, { travellers: 2, packageRef: "PKG-1001" });
    expect(JSON.parse(extra["itinerary"]!)).toHaveLength(1);
    expect(JSON.parse(extra["inclusions"]!)).toEqual(["Breakfast"]);
    expect(JSON.parse(extra["exclusions"]!)).toEqual(["Flights"]);
    expect(extra["validTo"]).toBe("2027-03-31");
    expect(extra["packageRef"]).toBe("PKG-1001");
    expect(extra["travellers"]).toBe("2");
  });

  it("writes a plan that reads back identically", () => {
    const saved = row(planExtra(plan));
    expect(readPackagePlan(saved)).toEqual(plan);
  });
});
