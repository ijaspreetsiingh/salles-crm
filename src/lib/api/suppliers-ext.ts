/** Suppliers — contracts, purchase orders, settlements. */
import { apiRequest } from "./client";

export type Contract = {
  id: string; reference: string; supplierId: string; supplierName: string;
  contractType: string; validFrom: string; validTo: string;
  value: number; currency: string; status: string; terms: string; createdAt: string;
};

export type PurchaseOrder = {
  id: string; reference: string; supplierId: string; supplierName: string;
  supplierGstin: string; bookingReference: string | null; description: string;
  amount: number; currency: string; gstRate: number; settled: number; balance: number;
  dueDate: string | null; status: string; notes: string; createdAt: string;
};

export type Settlement = {
  poId: string; poReference: string; supplierName: string; amount: number;
  method: string; referenceNo: string | null; paidOn: string; by: string;
};

export const fetchContracts = (supplierId?: string, status?: string) =>
  apiRequest<Contract[]>("/suppliers-ext/contracts", { query: { supplierId, status } });
export const createContract = (body: Record<string, unknown>) =>
  apiRequest("/suppliers-ext/contracts", { method: "POST", body });
export const updateContract = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/suppliers-ext/contracts/${id}`, { method: "PATCH", body });
export const deleteContract = (id: string) =>
  apiRequest(`/suppliers-ext/contracts/${id}`, { method: "DELETE" });

export const fetchPurchaseOrders = (supplierId?: string, status?: string) =>
  apiRequest<PurchaseOrder[]>("/suppliers-ext/purchase-orders", { query: { supplierId, status } });
export const createPurchaseOrder = (body: Record<string, unknown>) =>
  apiRequest("/suppliers-ext/purchase-orders", { method: "POST", body });
export const updatePurchaseOrder = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/suppliers-ext/purchase-orders/${id}`, { method: "PATCH", body });
export const settlePurchaseOrder = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/suppliers-ext/purchase-orders/${id}/settle`, { method: "POST", body });

export const fetchSettlements = (supplierId?: string) =>
  apiRequest<{ total: number; items: Settlement[] }>("/suppliers-ext/settlements", { query: { supplierId } });
