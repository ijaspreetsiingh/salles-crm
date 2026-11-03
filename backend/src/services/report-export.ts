import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { buildReport } from "./analytics";
import { MODULES } from "../domain/modules";

/**
 * Report exports.
 *
 * An agency owner does not read a dashboard — they send a spreadsheet to their
 * CA and a PDF to their partner. Both come out of the same report the screen
 * shows, so nobody has to reconcile two sets of numbers.
 */
export type ReportExportFilters = { branch?: string; from?: string; to?: string };

export type ReportExportInput = {
  organizationId: string;
  report: string;
  filters: ReportExportFilters;
};

const money = (value: number | null | undefined, currency: string) =>
  value === null || value === undefined ? "—" : `${currency} ${Math.round(value).toLocaleString("en-IN")}`;

async function loadReport(input: ReportExportInput) {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
  });
  const data = await buildReport(input.organizationId, input.report, input.filters);
  const currency = organization.currency || "INR";

  const records = await prisma.record.findMany({
    where: {
      organizationId: input.organizationId,
      moduleId: data.moduleId,
      deletedAt: null,
      ...(input.filters.branch ? { branchName: input.filters.branch } : {}),
      ...(input.filters.from || input.filters.to
        ? {
            date: {
              ...(input.filters.from ? { gte: input.filters.from } : {}),
              ...(input.filters.to ? { lte: input.filters.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
    take: 5000,
  });

  const moduleName = MODULES.find((m) => m.id === data.moduleId)?.name ?? data.moduleId;
  const title = `${moduleName} report`;

  const kpis: Array<[string, string]> = [
    ["Records", String(data.summary.records)],
    ["Closed / won", String(data.summary.won)],
    ["Revenue", money(data.summary.revenue, currency)],
    ["Supplier cost", money(data.summary.cost, currency)],
    ["Gross margin", money(data.summary.grossMargin, currency)],
    [
      "Gross margin %",
      data.summary.grossMarginPercent === null ? "—" : `${data.summary.grossMarginPercent}%`,
    ],
    ["Conversion rate", `${data.summary.conversionRate}%`],
    ["Average value", money(data.summary.averageValue, currency)],
  ];

  return { organization, data, records, currency, title, kpis, moduleName };
}

const recordColumns = [
  "Reference",
  "Name",
  "Detail",
  "Destination",
  "Owner",
  "Branch",
  "Date",
  "Amount",
  "Currency",
  "Status",
  "Email",
  "Phone",
  "Source",
  "Notes",
] as const;

type RecordRow = {
  reference: string;
  name: string;
  detail: string;
  destination: string;
  ownerName: string;
  branchName: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
};

const toCells = (row: RecordRow): Array<string | number> => [
  row.reference,
  row.name,
  row.detail,
  row.destination,
  row.ownerName,
  row.branchName,
  row.date,
  row.amount,
  row.currency,
  row.status,
  row.email,
  row.phone,
  row.source,
  row.notes,
];

/** A real .xlsx workbook: summary, records and every breakdown on its own sheet. */
export async function buildReportWorkbook(input: ReportExportInput): Promise<{
  filename: string;
  buffer: Buffer;
}> {
  const { organization, data, records, currency, title, kpis, moduleName } = await loadReport(input);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = organization.name;
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Measure", key: "label", width: 28 },
    { header: "Value", key: "value", width: 32 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRow({ label: "Report", value: title });
  summary.addRow({ label: "Organisation", value: organization.name });
  summary.addRow({ label: "Branch", value: data.filters.branch });
  summary.addRow({ label: "Period", value: data.filters.range });
  summary.addRow({ label: "Currency", value: currency });
  summary.addRow({ label: "Generated", value: new Date().toLocaleString("en-IN") });
  summary.addRow({});
  for (const [label, value] of kpis) summary.addRow({ label, value });

  const breakdown = (name: string, rows: Array<{ label: string; value: number; count: number }>) => {
    if (!rows.length) return;
    const sheet = workbook.addWorksheet(name.slice(0, 31));
    sheet.columns = [
      { header: "Group", key: "label", width: 32 },
      { header: "Value", key: "value", width: 18 },
      { header: "Count", key: "count", width: 10 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) sheet.addRow(row);
  };

  breakdown("By owner", data.byOwner);
  breakdown("By status", data.byStatus);
  breakdown("By destination", data.byDestination);
  breakdown("By source", data.bySource);

  const trend = workbook.addWorksheet("By month");
  trend.columns = [
    { header: "Month", key: "month", width: 14 },
    { header: "Value", key: "value", width: 18 },
    { header: "Count", key: "count", width: 10 },
  ];
  trend.getRow(1).font = { bold: true };
  for (const row of data.series) trend.addRow(row);

  const table = workbook.addWorksheet(`${moduleName.slice(0, 20)} records`.slice(0, 31));
  table.columns = recordColumns.map((header) => ({
    header,
    key: header.toLowerCase(),
    width: header === "Notes" || header === "Detail" ? 40 : 18,
  }));
  table.getRow(1).font = { bold: true };
  table.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFEFEF" },
  };
  for (const record of records) table.addRow(toCells(record as RecordRow));
  if (records.length) {
    table.autoFilter = { from: "A1", to: { row: 1, column: recordColumns.length } };
    table.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    filename: `${input.report}-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
    buffer,
  };
}

/** A printable PDF of the same report — the version you email, not re-type. */
export async function buildReportPdf(input: ReportExportInput): Promise<{
  filename: string;
  buffer: Buffer;
}> {
  const { organization, data, records, currency, title, kpis, moduleName } = await loadReport(input);

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = 40;
  const width = doc.page.width - 80;

  doc.fontSize(18).font("Helvetica-Bold").fillColor("#17191a").text(organization.name, left, 40);
  doc.fontSize(9).font("Helvetica").fillColor("#555555");
  if (organization.address) doc.text(organization.address, left, doc.y + 2);
  if (organization.gstin) doc.text(`GSTIN: ${organization.gstin}`, left, doc.y + 2);

  doc.moveDown(1.2);
  doc.fontSize(15).font("Helvetica-Bold").fillColor("#17191a").text(title);
  doc.fontSize(9).font("Helvetica").fillColor("#555555");
  doc.text(`${data.filters.branch} · ${data.filters.range} · generated ${new Date().toLocaleString("en-IN")}`);

  doc.moveDown(1);
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#17191a").text("Summary");
  doc.moveDown(0.4);
  for (const [label, value] of kpis) {
    doc.fontSize(9).font("Helvetica").fillColor("#555555").text(label, left, doc.y, { width: 180, continued: false });
    const y = doc.y - doc.currentLineHeight();
    doc.font("Helvetica-Bold").fillColor("#17191a").text(value, left + 190, y, { width: width - 190 });
    doc.moveDown(0.3);
  }

  const table = (
    heading: string,
    columns: Array<{ label: string; width: number; align?: "left" | "right" }>,
    rows: Array<Array<string>>,
    limit = 40,
  ) => {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.moveDown(0.8);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#17191a").text(heading);
    doc.moveDown(0.3);
    const startY = doc.y;
    let x = left;
    doc.fontSize(8).fillColor("#555555");
    for (const column of columns) {
      doc.text(column.label.toUpperCase(), x, startY, { width: column.width, align: column.align ?? "left" });
      x += column.width;
    }
    doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor("#dddddd").stroke();
    doc.moveDown(0.4);
    doc.fillColor("#17191a");
    for (const row of rows.slice(0, limit)) {
      if (doc.y > doc.page.height - 70) {
        doc.addPage();
      }
      const y = doc.y;
      let cx = left;
      for (let index = 0; index < columns.length; index++) {
        const column = columns[index]!;
        doc.fontSize(8).text(row[index] ?? "", cx, y, {
          width: column.width - 4,
          align: column.align ?? "left",
          ellipsis: true,
          lineBreak: false,
        });
        cx += column.width;
      }
      doc.moveDown(0.35);
    }
  };

  table(
    "Performance",
    [
      { label: "Group", width: 200 },
      { label: "Value", width: 140, align: "right" },
      { label: "Count", width: 80, align: "right" },
    ],
    data.byOwner.map((row) => [row.label || "Unassigned", money(row.value, currency), String(row.count)]),
  );

  table(
    "By status",
    [
      { label: "Status", width: 200 },
      { label: "Value", width: 140, align: "right" },
      { label: "Count", width: 80, align: "right" },
    ],
    data.byStatus.map((row) => [row.label || "—", money(row.value, currency), String(row.count)]),
  );

  table(
    `${moduleName} (latest 40)`,
    [
      { label: "Reference", width: 80 },
      { label: "Name", width: 150 },
      { label: "Date", width: 70 },
      { label: "Status", width: 90 },
      { label: "Amount", width: 130, align: "right" },
    ],
    records.map((row) => [
      row.reference,
      row.name,
      row.date,
      row.status,
      `${row.currency || currency} ${Math.round(row.amount).toLocaleString("en-IN")}`,
    ]),
  );

  const footerY = doc.page.height - 50;
  doc
    .fontSize(7)
    .fillColor("#888888")
    .text(
      `${organization.name} · ${moduleName} report · generated by Traveldesk on ${new Date().toLocaleString("en-IN")}`,
      left,
      footerY,
      { width },
    );

  doc.end();
  const buffer = await done;
  return {
    filename: `${input.report}-report-${new Date().toISOString().slice(0, 10)}.pdf`,
    buffer,
  };
}
