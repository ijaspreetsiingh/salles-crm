/**
 * Agency expenses and the profit & loss view.
 */
import { apiRequest } from "./client";

export type ExpenseDto = {
  id: string;
  category: string;
  vendor: string;
  description: string;
  amount: number;
  currency: string;
  gstRate: number;
  spentOn: string;
  method: string;
  referenceNo: string;
  notes: string;
  createdAt: string;
};

export type ExpensesDto = {
  items: ExpenseDto[];
  categories: string[];
  totals: {
    spent: number;
    count: number;
    average: number;
    byCategory: Array<{ category: string; amount: number; count: number }>;
  };
};

export type ExpenseInput = {
  category: string;
  vendor?: string;
  description?: string;
  amount: number;
  currency?: string;
  gstRate?: number;
  spentOn?: string;
  method?: string;
  referenceNo?: string;
  notes?: string;
};

export const fetchExpenses = (from?: string, to?: string) =>
  apiRequest<ExpensesDto>("/expenses", {
    query: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
  });

export const createExpense = (body: ExpenseInput) =>
  apiRequest<{ expense: ExpenseDto }>("/expenses", { method: "POST", body });

export const updateExpense = (id: string, body: Partial<ExpenseInput>) =>
  apiRequest<{ expense: ExpenseDto }>(`/expenses/${id}`, { method: "PATCH", body });

export const deleteExpense = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/expenses/${id}`, { method: "DELETE" });

export type ProfitLossDto = {
  period: { from: string; to: string };
  revenue: { net: number; invoiced: number; invoices: number };
  supplierCost: number;
  expenses: number;
  grossProfit: number;
  grossMargin: number | null;
  netProfit: number;
  netMargin: number | null;
  months: Array<{
    month: string;
    revenue: number;
    supplierCost: number;
    expenses: number;
    netProfit: number;
  }>;
  expenseCategories: Array<{ category: string; amount: number }>;
};

export const fetchProfitLoss = (from?: string, to?: string) =>
  apiRequest<ProfitLossDto>("/expenses/p-and-l", {
    query: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
  });
