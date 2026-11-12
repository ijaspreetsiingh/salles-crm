/** Corporate — travel requests, cost centres, policies, approvals. */
import { apiRequest } from "./client";

export type CostCentre = {
  id: string; name: string; code: string; companyId: string;
  budget: number; currency: string; managerId: string | null; active: boolean;
};

export type TravelPolicy = {
  flightClass: string; hotelStarMax: number; perDiemCap: number;
  currency: string; advanceBookingDays: number; requireApprovalAbove: number;
  approverIds: string[]; notes: string;
};

export type TravelRequest = {
  id: string; reference: string; employeeName: string; employeeEmail: string;
  destination: string; purpose: string; companyId: string; costCentreId: string | null;
  departureDate: string; returnDate: string; estimatedBudget: number; currency: string;
  flightRequired: boolean; hotelRequired: boolean; transferRequired: boolean;
  status: string; approvalLevel: number; approvalHistory: unknown[];
  notes: string; createdAt: string;
};

export const fetchCostCentres = (companyId?: string) =>
  apiRequest<CostCentre[]>("/corporate/cost-centres", { query: { companyId } });

export const createCostCentre = (body: Partial<CostCentre> & { companyId: string; name: string }) =>
  apiRequest("/corporate/cost-centres", { method: "POST", body });

export const updateCostCentre = (id: string, body: Partial<CostCentre>) =>
  apiRequest(`/corporate/cost-centres/${id}`, { method: "PATCH", body });

export const deleteCostCentre = (id: string) =>
  apiRequest(`/corporate/cost-centres/${id}`, { method: "DELETE" });

export const fetchPolicy = (companyId: string) =>
  apiRequest<{ configured: boolean; policy: TravelPolicy | null }>(`/corporate/policies/${companyId}`);

export const savePolicy = (companyId: string, body: TravelPolicy) =>
  apiRequest(`/corporate/policies/${companyId}`, { method: "PUT", body });

export const fetchTravelRequests = (companyId?: string, status?: string) =>
  apiRequest<TravelRequest[]>("/corporate/travel-requests", { query: { companyId, status } });

export const createTravelRequest = (body: Record<string, unknown>) =>
  apiRequest("/corporate/travel-requests", { method: "POST", body });

export const updateTravelRequest = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/corporate/travel-requests/${id}`, { method: "PATCH", body });

export const decideTravelRequest = (id: string, action: "approve" | "reject", note?: string) =>
  apiRequest(`/corporate/travel-requests/${id}/decision`, { method: "POST", body: { action, note: note ?? "" } });
