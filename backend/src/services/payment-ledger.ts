import PDFDocument from "pdfkit";
import { lockOrganization, prisma, type Tx } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { roundMoney, sumMoney, subtractMoney, moneyGte } from "../lib/money";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { fireWorkflows } from "./automation";
import { dispatchWebhookEvent } from "./webhook-dispatch";

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

/** Record.date is stored as a "YYYY-MM-DD" string, so parse it explicitly. */
const asDate = (value: unknown): Date | null => {
  const raw = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
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

export type LedgerScope = {
  organizationId: string;
  moduleId: string;
  reference: string;
  total: number;
};

/** Sums the ledger for one document. */
export async function ledgerTotals(input: LedgerScope): Promise<LedgerTotals> {
  return prisma.$transaction((tx) => ledgerTotalsInTx(tx, input));
}

/** Same as `ledgerTotals`, inside an existing transaction. */
export async function ledgerTotalsInTx(tx: Tx, input: LedgerScope): Promise<LedgerTotals> {
  const rows = await tx.payment.findMany({
    where: {
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      recordReference: input.reference,
      status: { in: ["paid", "recorded"] },
    },
    select: { amount: true, kind: true },
  });
  const received = sumMoney(
    rows.filter((row) => row.kind !== "refund").map((row) => row.amount),
  );
  const refunded = sumMoney(
    rows.filter((row) => row.kind === "refund").map((row) => row.amount),
  );
  const net = subtractMoney(received, refunded);
  return {
    received,
    refunded,
    net,
    balance: Math.max(0, subtractMoney(input.total, net)),
    count: rows.length,
  };
}

/**
 * Writes the ledger total back onto the record.
 *
 * `extra.received` keeps the existing columns, KPIs and reports working, and an
 * invoice earns its status from the money that actually arrived.
 */
export async function syncRecordMoney(
  input: Omit<LedgerScope, "total">,
): Promise<LedgerTotals | null> {
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    return syncRecordMoneyInTx(tx, input);
  });
}

/** Same as `syncRecordMoney`, inside an existing (already locked) transaction. */
export async function syncRecordMoneyInTx(
  tx: Tx,
  input: Omit<LedgerScope, "total">,
): Promise<LedgerTotals | null> {
  const record = await tx.record.findFirst({
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
    await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        moduleId: input.moduleId,
        recordReference: input.reference,
        kind: "payment",
        receiptNo: await nextReceiptNoInTx(tx, input.organizationId, "payment"),
        referenceNo: "",
        note: "Opening balance carried over from earlier records",
        amount: roundMoney(legacyReceived),
        currency: record.currency || "INR",
        method: String(extra.paymentMode ?? "Bank transfer"),
        status: "recorded",
        provider: "manual",
        paidOn: asDate(extra.invoiceDate) ?? asDate(record.date) ?? new Date(),
      },
    });
    migratedLegacy = true;
  }

  const totals = await ledgerTotalsInTx(tx, {
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
    if (moneyGte(totals.net, record.amount) && record.amount > 0) status = "Paid";
    else if (totals.net > 0) status = "Partially paid";
    else if (current === "Paid" || current === "Partially paid") status = "Draft";
  }

  await tx.record.update({
    where: { id: record.id },
    data: { status, extra: JSON.stringify(nextExtra) },
  });

  return totals;
}

/**
 * Next human receipt number for the organisation.
 *
 * Counting rows is wrong as soon as one receipt is deleted: the next number
 * repeats and two receipts share an identity. A retired sequence row keeps the
 * series moving forward, and the `(organizationId, receiptNo)` unique index is
 * the last line of defence if two tills ever race.
 */
async function nextReceiptNoInTx(tx: Tx, organizationId: string, kind: string): Promise<string> {
  const prefix = kind === "refund" ? "REF" : "RCP";
  const latest = await tx.payment.findFirst({
    where: { organizationId, receiptNo: { startsWith: `${prefix}-` } },
    orderBy: { receiptNo: "desc" },
    select: { receiptNo: true },
  });
  const parsed = Number.parseInt((latest?.receiptNo ?? "").slice(prefix.length + 1), 10);
  const highest = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const key = { organizationId, moduleId: "receipt", stem: prefix };
  const seq = await tx.sequence.upsert({
    where: { organizationId_moduleId_stem: key },
    // First use seeds from whatever receipts already exist.
    create: { ...key, lastNumber: highest + 1 },
    update: { lastNumber: { increment: 1 } },
  });

  // A sequence that predates some receipts can lag behind the real highest
  // number. Jump ahead instead of handing out a duplicate.
  const number =
    seq.lastNumber > highest
      ? seq.lastNumber
      : (
          await tx.sequence.update({
            where: { organizationId_moduleId_stem: key },
            data: { lastNumber: highest + 1 },
          })
        ).lastNumber;

  return `${prefix}-${String(number).padStart(4, "0")}`;
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

  const kind = input.kind === "refund" ? "refund" : "payment";
  const paidOn = input.paidOn ? new Date(`${input.paidOn}T00:00:00`) : new Date();

  // The receipt, its number and the parent document's derived totals must land
  // together: a receipt that exists while the invoice still says "unpaid" is a
  // reconciliation bug waiting to happen.
  const result = await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);

    const record = await tx.record.findFirst({
      where: {
        organizationId: input.organizationId,
        moduleId: input.moduleId,
        reference: input.reference,
        deletedAt: null,
      },
    });
    if (!record) throw new NotFoundError("Record for this payment");

    const payment = await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        moduleId: input.moduleId,
        recordReference: input.reference,
        kind,
        receiptNo: await nextReceiptNoInTx(tx, input.organizationId, kind),
        referenceNo: input.referenceNo?.slice(0, 120) ?? "",
        note: input.note?.slice(0, 400) ?? "",
        amount: roundMoney(input.amount),
        currency: input.currency || record.currency || "INR",
        method: input.method || "Bank transfer",
        status: "recorded",
        provider: "manual",
        paidOn,
        createdById: input.createdById ?? null,
      },
    });

    const totals = await syncRecordMoneyInTx(tx, {
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      reference: input.reference,
    });

    // The status the invoice earned from this payment, not the one it had
    // before it — workflows branch on it.
    const settled = await tx.record.findUnique({
      where: { id: record.id },
      select: { status: true },
    });

    return { payment, totals, recordId: record.id, status: settled?.status ?? record.status };
  });

  // Money arriving is a trigger in its own right: send the receipt, thank the
  // customer, open a task for the balance.
  if (kind === "payment") {
    void fireWorkflows({
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      recordId: result.recordId,
      event: "payment.received",
      status: result.status,
      userId: input.createdById ?? null,
    });
    void dispatchWebhookEvent({
      organizationId: input.organizationId,
      event: "payment.received",
      dedupeKey: `payment.received:${result.payment.id}`,
      data: {
        id: result.payment.id,
        moduleId: input.moduleId,
        reference: input.reference,
        amount: result.payment.amount,
        currency: result.payment.currency,
        totals: result.totals,
      },
    });
  }

  return { payment: mapPayment(result.payment), totals: result.totals };
}

export async function deleteLedgerPayment(input: { organizationId: string; paymentId: string }) {
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);

    const payment = await tx.payment.findFirst({
      where: { id: input.paymentId, organizationId: input.organizationId },
    });
    if (!payment) throw new NotFoundError("Payment");

    await tx.payment.delete({ where: { id: payment.id } });
    const totals =
      payment.provider === "manual"
        ? await syncRecordMoneyInTx(tx, {
            organizationId: input.organizationId,
            moduleId: payment.moduleId,
            reference: payment.recordReference,
          })
        : null;
    return { deleted: true, totals };
  });
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
  doc
    .fontSize(8)
    .fillColor("#666666")
    .text(`GSTIN: ${organization.gstin || "—"}`);
  if (organization.address) doc.text(organization.address, { width: 360 });
  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .fillColor("#111111")
    .text(payment.kind === "refund" ? "Refund receipt" : "Payment receipt");
  doc
    .fontSize(9)
    .fillColor("#666666")
    .text(`No. ${payment.receiptNo ?? payment.id.slice(-6)}`);
  doc.text(`Date: ${date}`);
  doc.moveDown(0.8);

  const rows: Array<[string, string]> = [
    ["Received from", record?.name || "Customer"],
    [
      "Against",
      `${payment.moduleId === "finance" ? "Invoice" : "Booking"} ${payment.recordReference}`,
    ],
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
