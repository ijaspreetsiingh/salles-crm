/**
 * Frontend API client for all module extensions (Tasks 3-12).
 * One file to avoid 12 separate tiny API files.
 */
import { apiRequest } from "./client";

// ─── Campaigns: Segments, Coupons, Attribution ───────────────────────────────
export const fetchSegments = () => apiRequest("/ext/campaigns/segments");
export const createSegment = (body: Record<string, unknown>) => apiRequest("/ext/campaigns/segments", { method: "POST", body });
export const deleteSegment = (id: string) => apiRequest(`/ext/campaigns/segments/${id}`, { method: "DELETE" });
export const fetchCoupons = () => apiRequest("/ext/campaigns/coupons");
export const createCoupon = (body: Record<string, unknown>) => apiRequest("/ext/campaigns/coupons", { method: "POST", body });
export const updateCoupon = (id: string, body: Record<string, unknown>) => apiRequest(`/ext/campaigns/coupons/${id}`, { method: "PATCH", body });
export const deleteCoupon = (id: string) => apiRequest(`/ext/campaigns/coupons/${id}`, { method: "DELETE" });
export const fetchAttribution = () => apiRequest("/ext/campaigns/attribution");

// ─── Flights: E-ticket, Ancillaries, Reissues/Refunds ──────────────────────────
export const getETicketUrl = (recordId: string) => `/api/v1/ext/flights/${recordId}/e-ticket`;
export const fetchAncillaries = (recordId: string) => apiRequest(`/ext/flights/${recordId}/ancillaries`);
export const createAncillary = (body: Record<string, unknown>) => apiRequest("/ext/flights/ancillaries", { method: "POST", body });
export const createReissueRefund = (body: Record<string, unknown>) => apiRequest("/ext/flights/reissues-refunds", { method: "POST", body });
export const updateReissueRefund = (id: string, body: Record<string, unknown>) => apiRequest(`/ext/flights/reissues-refunds/${id}`, { method: "PATCH", body });

// ─── Packages: Departures, Seasonal Rates ──────────────────────────────────────
export const fetchDepartures = () => apiRequest("/ext/packages/departures");
export const createDeparture = (body: Record<string, unknown>) => apiRequest("/ext/packages/departures", { method: "POST", body });
export const updateDeparture = (id: string, body: Record<string, unknown>) => apiRequest(`/ext/packages/departures/${id}`, { method: "PATCH", body });
export const fetchSeasonalRates = () => apiRequest("/ext/packages/seasonal-rates");
export const createSeasonalRate = (body: Record<string, unknown>) => apiRequest("/ext/packages/seasonal-rates", { method: "POST", body });

// ─── Visa: Insurance, Appointments, Advisories ────────────────────────────────
export const fetchInsurance = () => apiRequest("/ext/visa/insurance");
export const createInsurance = (body: Record<string, unknown>) => apiRequest("/ext/visa/insurance", { method: "POST", body });
export const fetchAppointments = () => apiRequest("/ext/visa/appointments");
export const createAppointment = (body: Record<string, unknown>) => apiRequest("/ext/visa/appointments", { method: "POST", body });
export const fetchAdvisories = () => apiRequest("/ext/visa/advisories");
export const createAdvisory = (body: Record<string, unknown>) => apiRequest("/ext/visa/advisories", { method: "POST", body });

// ─── Support: Refunds, KB, Feedback ───────────────────────────────────────────
export const fetchRefunds = () => apiRequest("/ext/support/refunds");
export const createRefund = (body: Record<string, unknown>) => apiRequest("/ext/support/refunds", { method: "POST", body });
export const decideRefund = (id: string, action: string, note?: string) => apiRequest(`/ext/support/refunds/${id}/decision`, { method: "POST", body: { action, note: note ?? "" } });
export const fetchKB = () => apiRequest("/ext/support/kb");
export const createKB = (body: Record<string, unknown>) => apiRequest("/ext/support/kb", { method: "POST", body });
export const updateKB = (id: string, body: Record<string, unknown>) => apiRequest(`/ext/support/kb/${id}`, { method: "PATCH", body });
export const fetchFeedback = () => apiRequest("/ext/support/feedback");
export const createFeedback = (body: Record<string, unknown>) => apiRequest("/ext/support/feedback", { method: "POST", body });

// ─── Agents: KYC, Credit, Sub-agents ───────────────────────────────────────────
export const fetchKYC = (agentId: string) => apiRequest(`/ext/agents/${agentId}/kyc`);
export const createKYC = (body: Record<string, unknown>) => apiRequest("/ext/agents/kyc", { method: "POST", body });
export const updateKYC = (id: string, body: Record<string, unknown>) => apiRequest(`/ext/agents/kyc/${id}`, { method: "PATCH", body });
export const fetchCredit = (agentId: string) => apiRequest(`/ext/agents/${agentId}/credit`);
export const setCredit = (body: Record<string, unknown>) => apiRequest("/ext/agents/credit", { method: "POST", body });
export const fetchSubAgents = (agentId: string) => apiRequest(`/ext/agents/${agentId}/sub-agents`);
export const createSubAgent = (body: Record<string, unknown>) => apiRequest("/ext/agents/sub-agents", { method: "POST", body });

// ─── Finance: Ledger, Receivables Aging ───────────────────────────────────────
export const fetchLedger = (opts?: { from?: string; to?: string; take?: number }) =>
  apiRequest("/finance-ext/ledger", { ...(opts ? { query: opts } : {}) });
export const fetchReceivablesAging = () => apiRequest("/finance-ext/receivables-aging");

// ─── AI Assistant: Insights ───────────────────────────────────────────────────
export const fetchSalesIntelligence = () => apiRequest("/assistant-ext/sales-intelligence");
export const fetchOpsInsights = () => apiRequest("/assistant-ext/operations-insights");

// ─── Team Chat: Search, Files, Mentions ───────────────────────────────────────
export const searchMessages = (q: string) => apiRequest("/team-chat-ext/search", { query: { q } });
export const fetchChatFiles = (channelId?: string) => apiRequest("/team-chat-ext/files", { query: { channelId } });
export const shareFile = (body: Record<string, unknown>) => apiRequest("/team-chat-ext/files", { method: "POST", body });
export const sendMentions = (body: Record<string, unknown>) => apiRequest("/team-chat-ext/mentions", { method: "POST", body });

// ─── Operations: Voucher, Daily Dashboard ─────────────────────────────────────
export type Incident = {
  id: string; reference: string; title: string; description: string;
  severity: string; category: string; tripId: string | null; tripReference: string | null;
  affectedPassengers: string[]; reportedBy: string | null;
  status: string; resolution: string | null;
  createdAt: string; updatedAt: string;
};
export type Deadline = {
  type: "ticketing" | "visa" | "departure";
  id: string; label: string; date: string;
  daysLeft: number; recordId: string | null; urgency: string;
};
export const getVoucherUrl = (recordId: string) => `/api/v1/operations-ext/vouchers/${recordId}`;
export const fetchDailyDashboard = () => apiRequest("/operations-ext/daily-dashboard");
export const fetchDeadlines = (days?: number) =>
  apiRequest<{ deadlines: Deadline[] }>("/operations-ext/deadlines", { ...(days ? { query: { days } } : {}) });
export const fetchIncidents = () => apiRequest<Incident[]>("/operations-ext/incidents");
export const createIncident = (body: Record<string, unknown>) =>
  apiRequest("/operations-ext/incidents", { method: "POST", body });
export const updateIncident = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/operations-ext/incidents/${id}`, { method: "PATCH", body });

export type TravelRequest = {
  id: string; reference: string; employeeName: string; employeeEmail: string;
  destination: string; purpose: string; companyId: string; costCentreId: string | null;
  departureDate: string; returnDate: string; estimatedBudget: number; currency: string;
  flightRequired: boolean; hotelRequired: boolean; transferRequired: boolean;
  status: string; approvalLevel: number; approvalHistory: unknown[];
  notes: string; createdAt: string;
};
export const fetchTravelRequests = (companyId?: string, status?: string) =>
  apiRequest("/corporate/travel-requests", { query: { companyId, status } });
export const createTravelRequest = (body: Record<string, unknown>) =>
  apiRequest("/corporate/travel-requests", { method: "POST", body });
export const decideTravelRequest = (id: string, action: "approve" | "reject", note?: string) =>
  apiRequest(`/corporate/travel-requests/${id}/decision`, { method: "POST", body: { action, note: note ?? "" } });
export const fetchCostCentres = (companyId?: string) =>
  apiRequest("/corporate/cost-centres", { query: { companyId } });
export const createCostCentre = (body: Record<string, unknown>) =>
  apiRequest("/corporate/cost-centres", { method: "POST", body });
export const updateCostCentre = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/corporate/cost-centres/${id}`, { method: "PATCH", body });
export const deleteCostCentre = (id: string) =>
  apiRequest(`/corporate/cost-centres/${id}`, { method: "DELETE" });

export type CompanyOption = { id: string; name: string; reference: string };
export const fetchCompanies = () => apiRequest<CompanyOption[]>("/corporate/companies");

export type TravelPolicy = {
  flightClass: string; hotelStarMax: number; perDiemCap: number; currency: string;
  advanceBookingDays: number; requireApprovalAbove: number; approverIds: string[]; notes: string;
};
export const fetchPolicy = (companyId: string) =>
  apiRequest<{ configured: boolean; policy: TravelPolicy | null }>(
    `/corporate/policies/${companyId}`,
  );
export const savePolicy = (companyId: string, body: Partial<TravelPolicy>) =>
  apiRequest(`/corporate/policies/${companyId}`, { method: "PUT", body });

// ─── Transfers: Vehicles, Drivers, Rail/Bus/Cruise ──────────────────────────────
export const fetchVehicles = () => apiRequest("/transfers/vehicles");
export const createVehicle = (body: Record<string, unknown>) =>
  apiRequest("/transfers/vehicles", { method: "POST", body });
export const updateVehicle = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/transfers/vehicles/${id}`, { method: "PATCH", body });
export const deleteVehicle = (id: string) =>
  apiRequest(`/transfers/vehicles/${id}`, { method: "DELETE" });
export const fetchDrivers = () => apiRequest("/transfers/drivers");
export const createDriver = (body: Record<string, unknown>) =>
  apiRequest("/transfers/drivers", { method: "POST", body });
export const updateDriver = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/transfers/drivers/${id}`, { method: "PATCH", body });
export const deleteDriver = (id: string) =>
  apiRequest(`/transfers/drivers/${id}`, { method: "DELETE" });
export const assignTransfer = (transferId: string, body: Record<string, unknown>) =>
  apiRequest(`/transfers/${transferId}/assign`, { method: "POST", body });
export const fetchAssignment = (transferId: string) =>
  apiRequest(`/transfers/${transferId}/assignment`);

// ─── Suppliers: Contracts, Purchase Orders, Settlements ──────────────────────
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
  apiRequest("/suppliers-ext/contracts", { query: { supplierId, status } });
export const createContract = (body: Record<string, unknown>) =>
  apiRequest("/suppliers-ext/contracts", { method: "POST", body });
export const updateContract = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/suppliers-ext/contracts/${id}`, { method: "PATCH", body });
export const deleteContract = (id: string) =>
  apiRequest(`/suppliers-ext/contracts/${id}`, { method: "DELETE" });
export const fetchPurchaseOrders = (supplierId?: string, status?: string) =>
  apiRequest("/suppliers-ext/purchase-orders", { query: { supplierId, status } });
export const createPurchaseOrder = (body: Record<string, unknown>) =>
  apiRequest("/suppliers-ext/purchase-orders", { method: "POST", body });
export const updatePurchaseOrder = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/suppliers-ext/purchase-orders/${id}`, { method: "PATCH", body });
export const settlePurchaseOrder = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/suppliers-ext/purchase-orders/${id}/settle`, { method: "POST", body });
export const fetchSettlements = (supplierId?: string) =>
  apiRequest("/suppliers-ext/settlements", { query: { supplierId } });

// ─── Distribution: Pages, Destinations, B2B ───────────────────────────────────
export const fetchCatalogue = (orgSlug: string, opts?: { destination?: string; q?: string }) =>
  apiRequest("/distribution/catalogue", { query: { org: orgSlug, ...opts } });
export const fetchPages = () => apiRequest("/distribution/pages");
export const createPage = (body: Record<string, unknown>) =>
  apiRequest("/distribution/pages", { method: "POST", body });
export const updatePage = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/distribution/pages/${id}`, { method: "PATCH", body });
export const deletePage = (id: string) =>
  apiRequest(`/distribution/pages/${id}`, { method: "DELETE" });
export const fetchDestinationsList = () => apiRequest("/distribution/destinations");
export const createDestination = (body: Record<string, unknown>) =>
  apiRequest("/distribution/destinations", { method: "POST", body });
export const updateDestination = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/distribution/destinations/${id}`, { method: "PATCH", body });
export const fetchB2BStats = () => apiRequest("/distribution/b2b-portal/stats");
