export type CsvValue = string | number | boolean | null | undefined;

const escapeCell = (value: CsvValue): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Serialises rows into an RFC-4180 CSV string. */
export function toCsv(
  rows: Array<Record<string, CsvValue>>,
  columns?: Array<{ key: string; label: string }>,
): string {
  const cols =
    columns ??
    (rows[0]
      ? Object.keys(rows[0]).map((key) => ({ key, label: key }))
      : []);
  const header = cols.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) => cols.map((c) => escapeCell(row[c.key])).join(","));
  return [header, ...body].join("\n");
}
