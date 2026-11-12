export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const escapeCell = (value: CsvValue): string => {
  let text = value === null || value === undefined ? "" : String(value);
  // Spreadsheet apps execute cells that start with these characters. A name
  // captured from the public lead form must never be able to run a formula in
  // the accountant's Excel — neutralise it with a leading apostrophe.
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) text = `'${text}`;
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

/** One RFC-4180 header line, without a trailing newline. */
export function csvHeader(columns: Array<{ key: string; label: string }>): string {
  return columns.map((column) => escapeCell(column.label)).join(",");
}

/**
 * One RFC-4180 data line, without a trailing newline.
 *
 * Exported separately from `toCsv` so a large export can be written batch by
 * batch. Building a 100,000-row string in memory is exactly the kind of thing
 * that takes the whole API process down with it.
 */
export function csvRow(
  row: Record<string, CsvValue>,
  columns: Array<{ key: string; label: string }>,
): string {
  return columns.map((column) => escapeCell(row[column.key])).join(",");
}

/** Serialises rows into an RFC-4180 CSV string. */
export function toCsv(
  rows: Array<Record<string, CsvValue>>,
  columns?: Array<{ key: string; label: string }>,
): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]).map((key) => ({ key, label: key })) : []);
  return [csvHeader(cols), ...rows.map((row) => csvRow(row, cols))].join("\n");
}
