import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../src/lib/csv";
import {
  IMPORT_TEMPLATE_HEADERS,
  normalizeImportAmount,
  normalizeImportDate,
} from "../src/services/import";

describe("parseCsv", () => {
  it("reads plain rows", () => {
    expect(parseCsv("Name,City\nPriya,Bali\nRahul,Delhi")).toEqual([
      ["Name", "City"],
      ["Priya", "Bali"],
      ["Rahul", "Delhi"],
    ]);
  });

  it("keeps commas, quotes and newlines inside quoted cells", () => {
    const csv = 'Name,Notes\n"Mehta, Priya","She said ""maybe"", then yes"\n"Two\nlines",x';
    expect(parseCsv(csv)).toEqual([
      ["Name", "Notes"],
      ["Mehta, Priya", 'She said "maybe", then yes'],
      ["Two\nlines", "x"],
    ]);
  });

  it("handles CRLF, a BOM and blank lines", () => {
    const csv = "\uFEFFName,City\r\nPriya,Bali\r\n\r\nRahul,Delhi\r\n";
    expect(parseCsv(csv)).toEqual([
      ["Name", "City"],
      ["Priya", "Bali"],
      ["Rahul", "Delhi"],
    ]);
  });

  it("round-trips what toCsv writes", () => {
    const rows = [{ name: 'Mehta, "Priya"', city: "Bali" }];
    const csv = toCsv(rows, [
      { key: "name", label: "Name" },
      { key: "city", label: "City" },
    ]);
    expect(parseCsv(csv)).toEqual([
      ["Name", "City"],
      ['Mehta, "Priya"', "Bali"],
    ]);
  });

  it("neutralises spreadsheet formulas so a lead cannot run code in Excel", () => {
    const rows = [
      {
        name: '=HYPERLINK("http://evil.example","click")',
        city: "+1 (555) 0100",
        notes: "@SUM(1+1)",
        amount: -500,
      },
    ];
    const csv = toCsv(rows, [
      { key: "name", label: "Name" },
      { key: "city", label: "City" },
      { key: "notes", label: "Notes" },
      { key: "amount", label: "Amount" },
    ]);
    const cells = parseCsv(csv)[1]!;
    expect(cells[0]!.startsWith("'=")).toBe(true);
    expect(cells[1]!.startsWith("'+")).toBe(true);
    expect(cells[2]!.startsWith("'@")).toBe(true);
    // A real number is untouched.
    expect(cells[3]).toBe("-500");
  });
});

describe("import value normalisation", () => {
  it("accepts the date formats a spreadsheet really contains", () => {
    expect(normalizeImportDate("2026-11-14")).toBe("2026-11-14");
    expect(normalizeImportDate("14/11/2026")).toBe("2026-11-14");
    expect(normalizeImportDate("5-11-26")).toBe("2026-11-05");
    expect(normalizeImportDate("")).toBeNull();
    expect(normalizeImportDate("not a date")).toBeNull();
  });

  it("strips currency symbols and thousands separators", () => {
    expect(normalizeImportAmount("₹ 92,000")).toBe(92000);
    expect(normalizeImportAmount("1,20,000.50")).toBe(120000.5);
    expect(normalizeImportAmount("—")).toBe(0);
    expect(normalizeImportAmount("-500")).toBe(0);
  });

  it("offers the headings the importer recognises", () => {
    expect(IMPORT_TEMPLATE_HEADERS).toContain("Name");
    expect(IMPORT_TEMPLATE_HEADERS).toContain("Owner");
  });
});
