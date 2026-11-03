/**
 * The payment ledger API.
 *
 * Money lives on the server as records (receipt number, date, mode, bank
 * reference), so the invoice status, the received column and the receipt all
 * come from the same place.
 */
import { apiBlob, apiRequest } from "./client";

export type PaymentDto = {
  id: string;
  moduleId: string;
  reference: string;
  kind: "payment" | "refund" | string;
  receiptNo: string | null;
  referenceNo: string;
  note: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  paidOn: string;
  createdAt: string;
};

export type LedgerTotalsDto = {
  received: number;
  refunded: number;
  net: number;
  balance: number;
  count: number;
};

export type LedgerDto = {
  items: PaymentDto[];
  totals: LedgerTotalsDto | null;
};

export type PaymentInput = {
  module: "finance" | "bookings";
  reference: string;
  amount: number;
  currency?: string;
  method?: string;
  kind?: "payment" | "refund";
  referenceNo?: string;
  note?: string;
  paidOn?: string;
};

export const fetchLedger = (moduleId: string, reference: string) =>
  apiRequest<LedgerDto>("/payments", { query: { module: moduleId, reference } });

export const createPayment = (body: PaymentInput) =>
  apiRequest<{ payment: PaymentDto; totals: LedgerTotalsDto }>("/payments", {
    method: "POST",
    body,
  });

export const removePayment = (id: string) =>
  apiRequest<{ deleted: boolean; totals: LedgerTotalsDto | null }>(`/payments/${id}`, {
    method: "DELETE",
  });

export const fetchReceipt = (id: string) => apiBlob(`/payments/${id}/receipt`);
