import { parseCsv } from "../lib/csv";
import { prisma } from "../lib/prisma";
import type { ModuleDef } from "../domain/modules";
import { stringifyJson } from "../lib/utils";

/* ==========================================================================
   Bringing an old spreadsheet into a module.

   Every travel business arrives with a sheet: three years of enquiries, a tab
   of invoices, a list of agents. Without an import they retype it, and the
   workspace starts half empty. This turns a CSV into real records — with the
   owner and branch matched to the team that already exists, and a plain
   report of every row it could not use.
   ========================================================================== */

/** Rows accepted in one import. Bigger files are split by the customer. */
export const MAX_IMPORT_ROWS = 1000;

export type ImportIssue = { row: number; message: string };

export type ImportResult = {
  created: number;
  skipped: number;
  issues: ImportIssue[];
  /** First few created records, so the person sees what landed. */
  sample: Array<{ reference: string; name: string }>;
};

type Field =
  | "reference"
  | "name"
  | "detail"
  | "destination"
  | "owner"
  | "branch"
  | "date"
  | "amount"
  | "status"
  | "email"
  | "phone"
  | "source"
  | "notes";

/**
 * Column headings people actually use, mapped to the fields we store. The
 * first heading in this table that a file contains wins, so "Customer name"
 * and "Full name" both arrive as the record's name.
 */
const HEADER_ALIASES: Record<string, Field> = {
  name: "name",
  customer: "name",
  "customer name": "name",
  "full name": "name",
  "client name": "name",
  client: "name",
  title: "name",
  "passenger name": "name",
  reference: "reference",
  ref: "reference",
  "record id": "reference",
  detail: "detail",
  details: "detail",
  description: "detail",
  service: "detail",
  destination: "destination",
  city: "destination",
  country: "destination",
  trip: "destination",
  owner: "owner",
  "assigned to": "owner",
  "account manager": "owner",
  "sales person": "owner",
  "handled by": "owner",
  branch: "branch",
  office: "branch",
  location: "branch",
  date: "date",
  "travel date": "date",
  "booking date": "date",
  "invoice date": "date",
  "start date": "date",
  amount: "amount",
  value: "amount",
  total: "amount",
  price: "amount",
  fare: "amount",
  "total value": "amount",
  status: "status",
  stage: "status",
  email: "email",
  "e-mail": "email",
  "email address": "email",
  phone: "phone",
  mobile: "phone",
  contact: "phone",
  "phone number": "phone",
  source: "source",
  channel: "source",
  notes: "notes",
  note: "notes",
  remarks: "notes",
  comment: "notes",
};

/** Columns a person can start from when they have no sheet yet. */
export const IMPORT_TEMPLATE_HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Destination",
  "Date",
  "Value",
  "Status",
  "Owner",
  "Branch",
  "Source",
  "Notes",
];

const cleanValue = (value: string | undefined) => (value ?? "").trim();

const slugKey = (header: string) => {
  const words = header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ");
  if (words.length === 0) return "field";
  return words
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
};

/**
 * Reads the date formats a spreadsheet really contains: ISO, dd/mm/yyyy (the
 * Indian office default) and anything the browser can parse. Returns null
 * when it cannot be trusted, so the row keeps today's date rather than a
 * wrong one.
 */
export function normalizeImportDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const rawYear = Number(dmy[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Strips currency symbols and thousands separators from a money cell. */
export function normalizeImportAmount(value: string): number {
  const text = value.replace(/[^0-9.-]/g, "");
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

type Lookup = { id: string; name: string };

const byLowerName = (rows: Array<{ id: string; name: string }>) => {
  const map = new Map<string, Lookup>();
  for (const row of rows) map.set(row.name.toLowerCase(), row);
  return map;
};

export async function importRecords(args: {
  organizationId: string;
  module: ModuleDef;
  csv: string;
  createdById: string;
}): Promise<ImportResult> {
  const { organizationId, module, csv, createdById } = args;
  const rows = parseCsv(csv);
  const issues: ImportIssue[] = [];
  const sample: Array<{ reference: string; name: string }> = [];

  if (rows.length < 2) {
    return {
      created: 0,
      skipped: 0,
      issues: [{ row: 1, message: "This file has no rows under the headings." }],
      sample,
    };
  }

  // Headings → field, plus the extra columns that should be kept as details.
  const headers = rows[0]!.map((header) => header.trim());
  const mapping = new Map<number, Field>();
  const extras = new Map<number, string>();
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[header.toLowerCase()];
    if (field && !Array.from(mapping.values()).includes(field)) mapping.set(index, field);
    else if (header && !field) extras.set(index, slugKey(header));
  });

  if (!Array.from(mapping.values()).includes("name")) {
    return {
      created: 0,
      skipped: 0,
      issues: [
        {
          row: 1,
          message:
            "No name column found. Rename one heading to “Name” (or “Customer name”) and try again.",
        },
      ],
      sample,
    };
  }

  const dataRows = rows.slice(1);
  const accepted = dataRows.slice(0, MAX_IMPORT_ROWS);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    issues.push({
      row: MAX_IMPORT_ROWS + 2,
      message: `Only the first ${MAX_IMPORT_ROWS} rows were imported. Split the file and import the rest.`,
    });
  }

  const [users, branches, existing] = await Promise.all([
    prisma.user.findMany({
      where: { memberships: { some: { organizationId, active: true } } },
      select: { id: true, name: true },
    }),
    prisma.branch.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.record.findMany({
      where: { organizationId, moduleId: module.id },
      select: { reference: true },
      take: 20000,
    }),
  ]);
  const peopleByName = byLowerName(users);
  const branchByName = byLowerName(branches);
  const usedReferences = new Set(existing.map((row) => row.reference));

  // Continue the module's numbering rather than restarting it.
  let nextNumber = 2400;
  for (const reference of usedReferences) {
    const match = reference.match(/(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > nextNumber) nextNumber = value;
  }

  const statusByLower = new Map(module.statuses.map((status) => [status.toLowerCase(), status]));
  const defaultStatus = module.statuses[0] ?? "Pending";
  const today = new Date().toISOString().slice(0, 10);

  let created = 0;
  let skipped = 0;

  for (const [index, cells] of accepted.entries()) {
    const rowNumber = index + 2;
    const value = (field: Field) => {
      for (const [column, mapped] of mapping) {
        if (mapped === field) return cleanValue(cells[column]);
      }
      return "";
    };

    const name = value("name");
    if (!name) {
      skipped += 1;
      issues.push({ row: rowNumber, message: "No name — row skipped." });
      continue;
    }

    let reference = value("reference");
    if (reference) {
      if (usedReferences.has(reference)) {
        skipped += 1;
        issues.push({
          row: rowNumber,
          message: `Reference ${reference} already exists — row skipped.`,
        });
        continue;
      }
    } else {
      reference = `${module.prefix}-${nextNumber + 1}`;
      while (usedReferences.has(reference)) {
        nextNumber += 1;
        reference = `${module.prefix}-${nextNumber + 1}`;
      }
    }
    nextNumber = Math.max(nextNumber, Number(reference.match(/(\d+)$/)?.[1] ?? nextNumber));

    const statusCell = value("status");
    let status = defaultStatus;
    if (statusCell) {
      const matched = statusByLower.get(statusCell.toLowerCase());
      if (matched) status = matched;
      else
        issues.push({
          row: rowNumber,
          message: `Status “${statusCell}” is not used by this module — saved as ${defaultStatus}.`,
        });
    }

    const ownerCell = value("owner");
    const owner = ownerCell ? peopleByName.get(ownerCell.toLowerCase()) : undefined;
    if (ownerCell && !owner) {
      issues.push({
        row: rowNumber,
        message: `“${ownerCell}” is not on the team — the record is unclaimed.`,
      });
    }

    const branchCell = value("branch");
    const branch = branchCell ? branchByName.get(branchCell.toLowerCase()) : undefined;
    if (branchCell && !branch) {
      issues.push({
        row: rowNumber,
        message: `Branch “${branchCell}” does not exist here — left blank.`,
      });
    }

    const extra: Record<string, string> = {};
    for (const [column, key] of extras) {
      const cell = cleanValue(cells[column]);
      if (cell) extra[key] = cell;
    }

    await prisma.record.create({
      data: {
        organizationId,
        moduleId: module.id,
        tab: module.tabs[0] ?? null,
        reference,
        name,
        detail: value("detail"),
        destination: value("destination"),
        ownerId: owner?.id ?? null,
        ownerName: owner?.name ?? "",
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? "",
        date: normalizeImportDate(value("date")) ?? today,
        amount: normalizeImportAmount(value("amount")),
        currency: "",
        status,
        email: value("email"),
        phone: value("phone"),
        source: value("source") || "Import",
        notes: value("notes"),
        extra: stringifyJson(extra),
        meta: stringifyJson({ importedAt: new Date().toISOString(), source: "csv" }),
        createdById,
      },
    });

    usedReferences.add(reference);
    created += 1;
    if (sample.length < 5) sample.push({ reference, name });
  }

  return { created, skipped, issues: issues.slice(0, 40), sample };
}
