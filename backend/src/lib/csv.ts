export type CsvValue = string | number | boolean | null | undefined;

const escapeCell = (value: CsvValue): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * Parses RFC-4180 style CSV into rows of cells.
 *
 * Handles quoted cells (commas, doubled quotes and line breaks inside them),
 * CRLF from Excel, and a UTF-8 BOM — the three things that break a naive
 * `split(",")` when a real customer sends their old spreadsheet.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");

  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Blank lines are not data.
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

/** Serialises rows into an RFC-4180 CSV string. */
export function toCsv(
  rows: Array<Record<string, CsvValue>>,
  columns?: Array<{ key: string; label: string }>,
): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]).map((key) => ({ key, label: key })) : []);
  const header = cols.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) => cols.map((c) => escapeCell(row[c.key])).join(","));
  return [header, ...body].join("\n");
}
