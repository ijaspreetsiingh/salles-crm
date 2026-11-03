/**
 * Payables (money owed to suppliers) and the GST working paper.
 */
import { apiRequest } from "./client";

export type PayableDto = {
  id: string;
  supplierName: string;
  supplierRecordId: string | null;
  reference: string;
  description: string;
  amount: number;
  currency: string;
  gstRate: number;
  dueDate: string | null;
  status: "due" | "partial" | "paid" | string;
  paid: number;
  balance: number;
  overdue: boolean;
  notes: string;
  createdAt: string;
};

export type PayablesDto = {
  items: PayableDto[];
  totals: {
    billed: number;
    paid: number;
    outstanding: number;
    overdue: number;
    upcoming: number;
    count: number;
  };
  suppliers: Array<{ name: string; outstanding: number; count: number }>;
};

export type PayableInput = {
  supplierName: string;
  supplierRecordId?: string;
  reference?: string;
  description?: string;
  amount: number;
  currency?: string;
  gstRate?: number;
  dueDate?: string;
  notes?: string;
};

export type SettlementInput = {
  amount: number;
  paidOn?: string;
  method?: string;
  referenceNo?: string;
  note?: string;
};

export const fetchPayables = (query: { status?: string; q?: string } = {}) =>
  apiRequest<PayablesDto>("/payables", { query });

export const createPayable = (body: PayableInput) =>
  apiRequest<{ payable: PayableDto }>("/payables", { method: "POST", body });

export const settlePayable = (id: string, body: SettlementInput) =>
  apiRequest<{ payable: PayableDto }>(`/payables/${id}/payments`, { method: "POST", body });

export const updatePayable = (id: string, body: Partial<PayableInput>) =>
  apiRequest<{ payable: PayableDto }>(`/payables/${id}`, { method: "PATCH", body });

export const deletePayable = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/payables/${id}`, { method: "DELETE" });

export type TaxSummaryDto = {
  period: { from: string; to: string; financialYear: string };
  output: { taxable: number; tax: number; count: number };
  input: { taxable: number; tax: number; count: number };
  net: number;
  /** TCS collected under section 206C(1G) — reported apart from GST. */
  tcs?: {
    rate: number;
    collected: number;
    count: number;
    byRate: Array<{ rate: number; collected: number }>;
  };
  months: Array<{ month: string; output: number; input: number; net: number }>;
  rates: Array<{ rate: number; output: number; input: number }>;
  invoices: Array<{
    reference: string;
    name: string;
    date: string;
    rate: number;
    taxable: number;
    tax: number;
    tcs?: number;
    tcsRate?: number;
    total: number;
  }>;
};

export const fetchTaxSummary = (from?: string, to?: string) =>
  apiRequest<TaxSummaryDto>("/finance/tax-summary", {
    query: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
  });
