import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { fireWorkflows } from "./automation";

/**
 * The payment ledger.
 *
 * Money is a record, not a number typed into a form: every receipt keeps its
 * date, mode, bank reference and who recorded it, and the parent invoice or
 * booking is re-derived from the ledger after each change. That way "amount
 * received", the list column and the invoice status can never disagree.
 */

export type LedgerTotals = {
  received: number;
  refunded: number;
  net: number;
  balance: number;
  count: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

/** Record.date is stored as a "YYYY-MM-DD" string, so parse it explicitly. */
const asDate = (value: unknown): Date | null => {
  const raw = String(value ?? "").slice(0, 10);
  if (!/^d{4}-d{2}-d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** The modules that own money. */
export const MONEY_MODULES = new Set(["finance", "bookings"]);

export function assertMoneyModule(moduleId: string) {
  if (!MONEY_MODULES.has(moduleId)) {
    throw new BadRequestError("Payments can only be recorded against invoices and bookings");
  }
}

/** Sums the ledger for one document. */
export async function ledgerTotals(input: {
  organizationId: string;
  moduleId: string;
  reference: string;
  total: number;
}): Promise<LedgerTotals> {
  const rows = await prisma.payment.findMany({
    where: {
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      recordReference: input.reference,
      status: { in: ["paid", "recorded"] },
    },
    select: { amount: true, kind: true },
  });
  const received = round(
    rows.filter((row) => row.kind !== "refund").reduce((sum, row) => sum + row.amount, 0),
  );
  const refunded = round(
    rows.filter((row) => row.kind === "refund").reduce((sum, row) => sum + row.amount, 0),
  );
  const net = round(received - refunded);
  return {
    received,
    refunded,
    net,
    balance: round(Math.max(0, input.total - net)),
    count: rows.length,
  };
}

/**
 * Writes the ledger total back onto the record.
 *
 * `extra.received` keeps the existing columns, KPIs and reports working, and an
 * invoice earns its status from the money that actually arrived.
 */
export async function syncRecordMoney(input: {
  organizationId: string;
  moduleId: string;
  reference: string;
}): Promise<LedgerTotals | null> {
  const record = await prisma.record.findFirst({
    where: {
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      reference: input.reference,
      deletedAt: null,
    },
  });
  if (!record) return null;

  let extra = parseJson<Record<string, unknown>>(record.extra, {});

  /**
   * Records created before the ledger existed carry one "amount received"
   * number. Turn it into a real opening payment once, so its receipt exists
   * and the number cannot drift away from the money.
   */
  const legacyReceived = Number(extra.received) || 0;
  let migratedLegacy = false;
  if (!extra.ledgerMigrated && legacyReceived > 0) {
    await prisma.payment.create({
      data: {
        organizationId: input.organizationId,
        moduleId: input.moduleId,
        recordReference: input.reference,
        kind: "payment",
        receiptNo: await nextReceiptNo(input.organizationId, "payment"),
        referenceNo: "",
        note: "Opening balance carried over from earlier records",
        amount: round(legacyReceived),
        currency: record.currency || "INR",
        method: String(extra.paymentMode ?? "Bank transfer"),
        status: "recorded",
        provider: "manual",
        paidOn: asDate(extra.invoiceDate) ?? asDate(record.date) ?? new Date(),
      },
    });
    migratedLegacy = true;
  }

  const totals = await ledgerTotals({
    organizationId: input.organizationId,
    moduleId: input.moduleId,
    reference: input.reference,
    total: record.amount,
  });

  const nextExtra: Record<string, unknown> = {
    ...extra,
    ...(migratedLegacy ? { ledgerMigrated: true } : {}),
    received: totals.net,
    balance: totals.balance,
    ...(totals.refunded > 0 ? { refunded: totals.refunded } : {}),
  };
  if (totals.refunded <= 0) delete nextExtra.refunded;

  let status = record.status;
  if (input.moduleId === "finance") {
    const current = record.status;
    if (totals.net >= record.amount - 0.5 && record.amount > 0) status = "Paid";
    else if (totals.net > 0) status = "Partially paid";
    else if (current === "Paid" || current === "Partially paid") status = "Draft";
  }

  await prisma.record.update({
    where: { id: record.id },
    data: { status, extra: JSON.stringify(nextExtra) },
  });

  return totals;
}

/** Next human receipt number for the organisation. */
async function nextReceiptNo(organizationId: string, kind: string): Promise<string> {
  const count = await prisma.payment.count({ where: { organizationId } });
  const prefix = kind === "refund" ? "REF" : "RCP";
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function createLedgerPayment(input: {
  organizationId: string;
  moduleId: string;
  reference: string;
  amount: number;
  currency?: string;
  method?: string;
  kind?: string;
  referenceNo?: string;
  note?: string;
  paidOn?: string | null;
  createdById?: string | null;
}) {
  assertMoneyModule(input.moduleId);
  if (!(input.amount > 0)) throw new BadRequestError("Amount must be greater than zero");

  const record = await prisma.record.findFirst({
    where: {
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      reference: input.reference,
      deletedAt: null,
    },
  });
  if (!record) throw new NotFoundError("Record for this payment");

  const kind = input.kind === "refund" ? "refund" : "payment";
  const paidOn = input.paidOn ? new Date(`${input.paidOn}T00:00:00`) : new Date();
  const payment = await prisma.payment.create({
    data: {
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      recordReference: input.reference,
      kind,
      receiptNo: await nextReceiptNo(input.organizationId, kind),
      referenceNo: input.referenceNo?.slice(0, 120) ?? "",
      note: input.note?.slice(0, 400) ?? "",
      amount: round(input.amount),
      currency: input.currency || record.currency || "INR",
      method: input.method || "Bank transfer",
      status: "recorded",
      provider: "manual",
      paidOn,
      createdById: input.createdById ?? null,
    },
  });

  const totals = await syncRecordMoney({
    organizationId: input.organizationId,
    moduleId: input.moduleId,
    reference: input.reference,
  });

  // Money arriving is a trigger in its own right: send the receipt, thank the
  // customer, open a task for the balance.
  if (kind === "payment") {
    void fireWorkflows({
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      recordId: record.id,
      event: "payment.received",
      status: record.status,
      userId: input.createdById ?? null,
    });
  }

  return { payment: mapPayment(payment), totals };
}

export async function deleteLedgerPayment(input: {
  organizationId: string;
  paymentId: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, organizationId: input.organizationId },
  });
  if (!payment) throw new NotFoundError("Payment");

  await prisma.payment.delete({ where: { id: payment.id } });
  const totals = payment.provider === "manual"
    ? await syncRecordMoney({
        organizationId: input.organizationId,
        moduleId: payment.moduleId,
        reference: payment.recordReference,
      })
    : null;
  return { deleted: true, totals };
}

/**
 * A calendar date as the office typed it.
 *
 * Dates are stored at local midnight, so `toISOString()` would read 18:30 UTC on
 * the previous day in IST and show every payment one day early. Local parts keep
 * the day the money actually arrived.
 */
export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mapPayment(payment: {
  id: string;
  moduleId: string;
  recordReference: string;
  kind: string;
  receiptNo: string | null;
  referenceNo: string;
  note: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  paidOn: Date | null;
  createdAt: Date;
}) {
  return {
    id: payment.id,
    moduleId: payment.moduleId,
    reference: payment.recordReference,
    kind: payment.kind,
    receiptNo: payment.receiptNo,
    referenceNo: payment.referenceNo,
    note: payment.note,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    paidOn: dateKey(payment.paidOn ?? payment.createdAt),
    createdAt: payment.createdAt.toISOString(),
  };
}

/** A printable receipt for one payment. */
export async function generateReceiptPdf(input: {
  organizationId: string;
  paymentId: string;
}): Promise<{ filename: string; stream: PDFKit.PDFDocument }> {
  const [organization, payment] = await Promise.all([
    prisma.organization.findUnique({ where: { id: input.organizationId } }),
    prisma.payment.findFirst({
      where: { id: input.paymentId, organizationId: input.organizationId },
    }),
  ]);
  if (!organization) throw new NotFoundError("Organization");
  if (!payment) throw new NotFoundError("Payment");

  const record = await prisma.record.findFirst({
    where: {
      organizationId: input.organizationId,
      moduleId: payment.moduleId,
      reference: payment.recordReference,
      deletedAt: null,
    },
  });
  const totals = await ledgerTotals({
    organizationId: input.organizationId,
    moduleId: payment.moduleId,
    reference: payment.recordReference,
    total: record?.amount ?? 0,
  });

  const currency = payment.currency || "INR";
  const format = (value: number) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
  const date = (payment.paidOn ?? payment.createdAt).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const doc = new PDFDocument({ size: "A5", margin: 36 });
  doc.font("Helvetica");

  doc.fontSize(16).fillColor("#111111").text(organization.name, { continued: false });
  doc.fontSize(8).fillColor("#666666").text(`GSTIN: ${organization.gstin || "—"}`);
  if (organization.address) doc.text(organization.address, { width: 360 });
  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .fillColor("#111111")
    .text(payment.kind === "refund" ? "Refund receipt" : "Payment receipt");
  doc.fontSize(9).fillColor("#666666").text(`No. ${payment.receiptNo ?? payment.id.slice(-6)}`);
  doc.text(`Date: ${date}`);
  doc.moveDown(0.8);

  const rows: Array<[string, string]> = [
    ["Received from", record?.name || "Customer"],
    ["Against", `${payment.moduleId === "finance" ? "Invoice" : "Booking"} ${payment.recordReference}`],
    ["Mode", payment.method],
    ["Reference", payment.referenceNo || "—"],
  ];
  for (const [label, value] of rows) {
    doc.fontSize(9).fillColor("#666666").text(label, { continued: true, width: 120 });
    doc.fillColor("#111111").text(`  ${value}`);
  }
  if (payment.note) {
    doc.fontSize(9).fillColor("#666666").text("Note", { continued: true, width: 120 });
    doc.fillColor("#111111").text(`  ${payment.note}`);
  }

  doc.moveDown(0.8);
  doc
    .fontSize(12)
    .fillColor("#111111")
    .text(
      `${payment.kind === "refund" ? "Refunded" : "Received"}: ${currency} ${format(payment.amount)}`,
    );
  if (payment.kind !== "refund") {
    doc
      .fontSize(9)
      .fillColor("#666666")
      .text(`Total received: ${currency} ${format(totals.net)}`);
    doc.text(`Balance still due: ${currency} ${format(totals.balance)}`);
  }

  doc.moveDown(1.2);
  doc
    .fontSize(7.5)
    .fillColor("#888888")
    .text(
      "This is a computer-generated receipt. Please quote the receipt number in any correspondence.",
      { width: 340 },
    );

  // The route ends the stream (same contract as the invoice PDF).
  const filename = `receipt-${payment.receiptNo ?? payment.id}.pdf`;
  return { filename, stream: doc };
}
