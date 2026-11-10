import { describe, expect, it } from "vitest";
import {
  digestBody,
  localHour,
  mergeDigestSettings,
  readDigestSettings,
} from "../src/services/digest";
import type { AttentionDto } from "../src/services/attention";

/* ==========================================================================
   The daily email.

   The settings live inside the organisation's free-form JSON, which means
   every value in there might be missing, the wrong type, or left over from an
   older version. A digest that fires at 3am, or that emails a list of money to
   the wrong scope, is worse than no digest — so the reading is tested.
   ========================================================================== */

describe("readDigestSettings", () => {
  it("is off, at 8am, scoped to the person, by default", () => {
    expect(readDigestSettings("{}")).toEqual({
      enabled: false,
      hour: 8,
      scope: "mine",
      recipients: [],
      lastSentDate: "",
    });
  });

  it("survives a settings column that is not JSON at all", () => {
    expect(readDigestSettings("not json").enabled).toBe(false);
    expect(readDigestSettings(null).hour).toBe(8);
    expect(readDigestSettings(undefined).scope).toBe("mine");
  });

  it("reads a saved digest block", () => {
    const settings = JSON.stringify({
      taxRate: 18,
      digest: {
        enabled: true,
        hour: 7,
        scope: "team",
        recipients: ["ops@example.com"],
        lastSentDate: "2026-10-26",
      },
    });
    expect(readDigestSettings(settings)).toEqual({
      enabled: true,
      hour: 7,
      scope: "team",
      recipients: ["ops@example.com"],
      lastSentDate: "2026-10-26",
    });
  });

  it("refuses an hour outside the day rather than sending at a random time", () => {
    expect(readDigestSettings(JSON.stringify({ digest: { hour: 25, enabled: true } })).hour).toBe(
      8,
    );
    expect(readDigestSettings(JSON.stringify({ digest: { hour: -1 } })).hour).toBe(8);
    expect(readDigestSettings(JSON.stringify({ digest: { hour: "morning" } })).hour).toBe(8);
    expect(readDigestSettings(JSON.stringify({ digest: { hour: 0 } })).hour).toBe(0);
  });

  it("keeps only addresses that could actually receive mail", () => {
    const settings = JSON.stringify({
      digest: { recipients: ["ops@example.com", "  ", "nope", "a@b"] },
    });
    expect(readDigestSettings(settings).recipients).toEqual(["ops@example.com"]);
  });

  it("treats an unknown scope as the safer private one", () => {
    expect(readDigestSettings(JSON.stringify({ digest: { scope: "everyone" } })).scope).toBe(
      "mine",
    );
  });
});

describe("mergeDigestSettings", () => {
  it("keeps the fields a partial save did not mention", () => {
    const stored = JSON.stringify({
      digest: { enabled: true, hour: 7, scope: "team", recipients: ["ops@example.com"] },
    });
    // Changing only the time must not switch the digest off — the warning is
    // the whole reason this function exists.
    expect(mergeDigestSettings(stored, { hour: 9 })).toEqual({
      enabled: true,
      hour: 9,
      scope: "team",
      recipients: ["ops@example.com"],
      lastSentDate: "",
    });
  });

  it("still allows switching it off", () => {
    const stored = JSON.stringify({ digest: { enabled: true, hour: 7 } });
    expect(mergeDigestSettings(stored, { enabled: false }).enabled).toBe(false);
  });

  it("clears the last-run date so a re-enabled digest can fire today", () => {
    const stored = JSON.stringify({ digest: { enabled: true, lastSentDate: "2026-10-27" } });
    expect(mergeDigestSettings(stored, { lastSentDate: "" }).lastSentDate).toBe("");
  });
});

describe("localHour", () => {
  it("reads the hour of the organisation's own clock, not the server's", () => {
    const noonUtc = new Date("2026-10-27T12:00:00Z");
    expect(localHour("UTC", noonUtc)).toBe(12);
    // India is five and a half hours ahead — an 8am digest there is 2:30am UTC.
    expect(localHour("Asia/Kolkata", noonUtc)).toBe(17);
    expect(localHour("America/New_York", noonUtc)).toBe(8);
  });

  it("falls back to UTC rather than throwing on a bad timezone name", () => {
    expect(localHour("Mars/Olympus", new Date("2026-10-27T12:00:00Z"))).toBe(12);
  });
});

const emptyDay = (overrides: Partial<AttentionDto> = {}): AttentionDto => ({
  scope: "mine",
  person: "Priya Mehta",
  today: "2026-10-27",
  tasks: [],
  leads: [],
  bookings: [],
  finance: [],
  visa: [],
  groups: [],
  ...overrides,
});

describe("digestBody", () => {
  it("says a quiet day is quiet instead of inventing work", () => {
    const body = digestBody("Priya Mehta", emptyDay());
    expect(body).toContain("Good morning, Priya.");
    expect(body).toContain("Nothing is waiting on you today.");
  });

  it("counts what needs doing and names each thing in a sentence", () => {
    const body = digestBody(
      "Priya Mehta",
      emptyDay({
        tasks: [
          {
            id: "t1",
            title: "Collect balance payment",
            type: "Payment collection",
            owner: "Priya Mehta",
            date: "2026-10-27",
            priority: "High",
            done: false,
            relatedModule: "bookings",
            relatedRecordId: "b1",
          },
        ],
        finance: [
          {
            id: "f1",
            reference: "INV-1088",
            name: "Meera Iyer",
            destination: "Dubai",
            amount: 92000,
            currency: "INR",
            branch: "Mumbai",
          } as unknown as AttentionDto["finance"][number],
        ],
      }),
    );
    expect(body).toContain("2 things need you today.");
    expect(body).toContain("Tasks due (1)");
    expect(body).toContain("Collect balance payment — Payment collection");
    expect(body).toContain("Money late (1)");
    expect(body).toContain("INV-1088 · Meera Iyer · Dubai");
  });

  it("omits sections that have nothing in them", () => {
    const body = digestBody("Priya", emptyDay());
    expect(body).not.toContain("Tasks due");
    expect(body).not.toContain("Money late");
    expect(body).not.toContain("Papers still missing");
  });

  it("says 'thing', not 'things', when there is exactly one", () => {
    const body = digestBody(
      "Priya",
      emptyDay({
        leads: [
          {
            id: "l1",
            reference: "LD-2401",
            name: "Aarav Sharma",
            destination: "Bali",
            amount: 0,
            currency: "",
          } as unknown as AttentionDto["leads"][number],
        ],
      }),
    );
    expect(body).toContain("1 thing needs you today.");
  });
});
