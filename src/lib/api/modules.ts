/**
 * Extended Traveldesk API surface: insights, engagement, commerce, files and
 * administration. Mirrors every router mounted under /api/v1 that the CRM UI
 * consumes beyond the core records/tasks/members layer in `crm.ts`.
 */
import { apiDownload, apiRequest, apiUpload } from "./client";

/* ------------------------------------------------------------------ *
 * Shared shapes
 * ------------------------------------------------------------------ */

export type Paged<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type Filters = { branch?: string; from?: string; to?: string };

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export type DashboardOverviewDto = {
  metrics: {
    revenue: number;
    collected: number;
    outstanding: number;
    bookings: number;
    confirmedBookings: number;
    newLeads: number;
    quotationsSent: number;
    upcomingDepartures: number;
    openTasks: number;
    conversionRate: number;
    averageBookingValue: number;
    /** null when no supplier cost has been recorded — never a guess. */
    grossMargin?: number | null;
    grossMarginPercent?: number | null;
    cost?: number | null;
  };
  revenueSeries: Array<{ month: string; revenue: number; bookings: number }>;
  pipeline: Array<{ stage: string; count: number; value: number }>;
  upcomingDepartures: Array<{
    id: string;
    reference: string;
    name: string;
    destination: string;
    date: string;
    status: string;
    amount: number;
  }>;
  attention: Array<{
    label: string;
    detail: string;
    moduleId: string;
    recordId: string;
    level: string;
  }>;
  byDestination: Array<{ label: string; count: number; value: number }>;
  byOwner: Array<{ label: string; count: number; value: number }>;
};

export type DashboardCountersDto = {
  newLeads: number;
  pendingBookings: number;
  openTickets: number;
  tasksToday: number;
  overdueInvoices: number;
};

export type DerivedNotificationDto = {
  title: string;
  body: string;
  moduleId: string;
  level: "info" | "warning" | "danger" | "success";
};

export const fetchDashboardOverview = (filters: Filters = {}) =>
  apiRequest<DashboardOverviewDto>("/dashboard/overview", { query: filters });

export const fetchDashboardCounters = () => apiRequest<DashboardCountersDto>("/dashboard/counters");

export const fetchDashboardAlerts = () => apiRequest<DerivedNotificationDto[]>("/dashboard/alerts");

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

export type NotificationDto = {
  id: string;
  title: string;
  body: string;
  moduleId: string | null;
  recordId: string | null;
  level: string;
  read: boolean;
  createdAt: string;
};

export type NotificationTrayDto = {
  items: NotificationDto[];
  derived: DerivedNotificationDto[];
  unread: number;
};

export const fetchNotifications = () => apiRequest<NotificationTrayDto>("/notifications");

export const markNotificationRead = (id: string) =>
  apiRequest<{ read: boolean }>(`/notifications/${id}/read`, { method: "POST", body: {} });

export const markAllNotificationsRead = () =>
  apiRequest<{ read: number }>("/notifications/read-all", { method: "POST", body: {} });

/* ------------------------------------------------------------------ *
 * Global search
 * ------------------------------------------------------------------ */

export type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  moduleId: string;
  status?: string;
};

export type SearchResponseDto = {
  query: string;
  groups: Array<{ group: string; items: SearchItem[] }>;
};

export const searchWorkspace = (q: string) =>
  apiRequest<SearchResponseDto>("/search", { query: { q } });

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

export type ReportKey =
  "sales" | "bookings" | "operations" | "finance" | "b2b" | "marketing" | "team";

export type ReportResultDto = {
  report: string;
  moduleId: string;
  generatedAt: string;
  filters: { branch: string; range: string };
  summary: {
    records: number;
    revenue: number;
    /** null when no supplier cost has been recorded — never a guess. */
    grossMargin: number | null;
    grossMarginPercent: number | null;
    cost?: number | null;
    conversionRate: number;
    averageValue: number;
    won: number;
  };
  series: Array<{ month: string; value: number; count: number }>;
  byDestination: Array<{ label: string; count: number; value: number }>;
  byOwner: Array<{ label: string; count: number; value: number }>;
  byStatus: Array<{ label: string; count: number; value: number }>;
  bySource: Array<{ label: string; count: number; value: number }>;
};

export type SavedReportDto = {
  id: string;
  title: string;
  moduleId: string;
  filters: Record<string, unknown>;
  createdAt: string;
};

export const fetchSavedReports = () => apiRequest<SavedReportDto[]>("/reports/saved");

export const createSavedReport = (body: {
  title: string;
  report: ReportKey;
  filters?: Record<string, unknown>;
}) =>
  apiRequest<SavedReportDto>("/reports/saved", { method: "POST", body: { filters: {}, ...body } });

export const deleteSavedReport = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/reports/saved/${id}`, { method: "DELETE" });

export const runReport = (report: ReportKey, filters: Filters = {}) =>
  apiRequest<ReportResultDto>(`/reports/${report}`, { query: filters });

/* ------------------------------------------------------------------ *
 * Assistant
 * ------------------------------------------------------------------ */

export type AssistantMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  createdAt: string;
};

export type AssistantReplyDto = {
  conversationId: string;
  reply: AssistantMessageDto;
  suggestions: string[];
};

export const sendAssistantMessage = (message: string, conversationId = "default") =>
  apiRequest<AssistantReplyDto>("/assistant/chat", {
    method: "POST",
    body: { message, conversationId },
  });

export const fetchAssistantMessages = (conversationId = "default") =>
  apiRequest<AssistantMessageDto[]>("/assistant/messages", { query: { conversationId } });

export const clearAssistantConversation = (conversationId: string) =>
  apiRequest<{ cleared: number }>(`/assistant/conversation/${conversationId}`, {
    method: "DELETE",
  });

export const generateItinerary = (body: {
  destination: string;
  nights: number;
  travellers: number;
  interests?: string;
}) =>
  apiRequest<{
    destination: string;
    nights: number;
    travellers: number;
    itinerary: string;
    generatedBy: string;
  }>("/assistant/itinerary", { method: "POST", body });

/* ------------------------------------------------------------------ *
 * Conversations (shared inbox)
 * ------------------------------------------------------------------ */

export type ConversationDto = {
  id: string;
  channel: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  subject: string;
  status: string;
  assignedTo: string | null;
  lastMessageAt: string;
  preview: string;
  messageCount: number;
};

export type MessageDto = {
  id: string;
  direction: string;
  channel: string;
  body: string;
  sentBy: string | null;
  createdAt: string;
};

export const fetchConversations = (
  params: { channel?: string; status?: string; search?: string } = {},
) => apiRequest<Paged<ConversationDto>>("/conversations", { query: { pageSize: 50, ...params } });

export const fetchConversationChannels = () =>
  apiRequest<Array<{ channel: string; count: number }>>("/conversations/channels");

export const fetchConversation = (id: string) =>
  apiRequest<ConversationDto & { messages: MessageDto[] }>(`/conversations/${id}`);

export const createConversation = (body: {
  contactName: string;
  channel?: string;
  contactEmail?: string;
  contactPhone?: string;
  subject?: string;
}) => apiRequest<ConversationDto>("/conversations", { method: "POST", body });

export const sendConversationMessage = (id: string, body: string) =>
  apiRequest<MessageDto>(`/conversations/${id}/messages`, { method: "POST", body: { body } });

export const updateConversation = (id: string, body: { status?: string; assignedTo?: string }) =>
  apiRequest<ConversationDto>(`/conversations/${id}`, { method: "PATCH", body });

export const fetchMessageTemplates = () =>
  apiRequest<Array<{ id: string; channel: string; name: string; body: string }>>(
    "/conversations/templates/list",
  );

/* ------------------------------------------------------------------ *
 * Workflows
 * ------------------------------------------------------------------ */

export type WorkflowDto = {
  id: string;
  name: string;
  moduleId: string;
  trigger: string;
  condition: string;
  action: string;
  status: string;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
};

export type WorkflowRunDto = {
  id: string;
  workflow: string;
  status: string;
  trigger: string;
  log: string;
  startedAt: string;
  finishedAt: string | null;
};

export const fetchWorkflows = (params: { status?: string; moduleId?: string } = {}) =>
  apiRequest<WorkflowDto[]>("/workflows", { query: params });

export const fetchWorkflowRuns = () =>
  apiRequest<Paged<WorkflowRunDto>>("/workflows/runs", { query: { pageSize: 30 } });

export const createWorkflow = (body: {
  name: string;
  moduleId?: string;
  trigger: string;
  condition?: string;
  action: string;
  status?: "Active" | "Paused";
}) => apiRequest<WorkflowDto>("/workflows", { method: "POST", body });

export const updateWorkflow = (
  id: string,
  body: Partial<Pick<WorkflowDto, "name" | "trigger" | "condition" | "action" | "status">>,
) => apiRequest<WorkflowDto>(`/workflows/${id}`, { method: "PATCH", body });

export const deleteWorkflow = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/workflows/${id}`, { method: "DELETE" });

export const runWorkflow = (id: string) =>
  apiRequest<{ status: string; log: string; finishedAt?: string }>(`/workflows/${id}/run`, {
    method: "POST",
    body: {},
  });

export const fetchWorkflowRunsFor = (id: string) =>
  apiRequest<Array<WorkflowRunDto & { workflowId: string }>>(`/workflows/${id}/runs`);

/* ------------------------------------------------------------------ *
 * Integrations + webhooks
 * ------------------------------------------------------------------ */

export type IntegrationDto = {
  id: string;
  provider: string;
  category: string;
  status: string;
  environment: string;
  config: Record<string, unknown>;
  connectedAt: string | null;
};

export const fetchIntegrations = () => apiRequest<IntegrationDto[]>("/integrations");

export const connectIntegration = (
  id: string,
  body: { environment?: "Sandbox" | "Production"; config?: Record<string, unknown> } = {},
) =>
  apiRequest<IntegrationDto>(`/integrations/${id}/connect`, {
    method: "POST",
    body: { config: {}, ...body },
  });

export const disconnectIntegration = (id: string) =>
  apiRequest<IntegrationDto>(`/integrations/${id}/disconnect`, { method: "POST", body: {} });

export const fetchWebhooks = () =>
  apiRequest<
    Array<{
      id: string;
      url: string;
      events: string[];
      active: boolean;
      secret: string;
      deliveries: number;
      createdAt: string;
    }>
  >("/integrations/webhooks/list");

export const createWebhook = (body: { url: string; events?: string[]; active?: boolean }) =>
  apiRequest<{ id: string; url: string; events: string[]; active: boolean }>(
    "/integrations/webhooks",
    {
      method: "POST",
      body,
    },
  );

export const deleteWebhook = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/integrations/webhooks/${id}`, { method: "DELETE" });

export const testWebhook = (id: string) =>
  apiRequest<{ id: string; status: string; responseCode: number | null; createdAt: string }>(
    `/integrations/webhooks/${id}/test`,
    { method: "POST", body: {} },
  );

/* ------------------------------------------------------------------ *
 * Billing
 * ------------------------------------------------------------------ */

export type PlanDto = {
  key: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  features: string[];
  limits: Record<string, number>;
  popular: boolean;
};

export type SubscriptionDto = {
  subscription: {
    planKey: string;
    planName: string;
    status: string;
    billingCycle: string;
    seats: number;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
  plan: {
    key: string;
    name: string;
    priceMonthly: number;
    priceYearly: number;
    currency: string;
    features: string[];
    limits: Record<string, number>;
  };
  usage: Array<{ metric: string; used: number; limit: number | null }>;
};

export type InvoiceListDto = {
  invoices: Array<{
    id: string;
    issuedAt: string;
    period: string;
    amount: number;
    currency: string;
    status: string;
    planKey: string;
  }>;
  totals: { billed: number; currency: string };
};

export const fetchPlans = () => apiRequest<PlanDto[]>("/billing/plans");

export const fetchSubscription = () => apiRequest<SubscriptionDto>("/billing/subscription");

export const updateSubscription = (body: {
  planKey?: string;
  billingCycle?: "Monthly" | "Yearly";
  seats?: number;
  cancelAtPeriodEnd?: boolean;
}) => apiRequest<unknown>("/billing/subscription", { method: "PATCH", body });

export const fetchUsage = () =>
  apiRequest<Array<{ id: string; metric: string; quantity: number; period: string }>>(
    "/billing/usage",
  );

export const fetchInvoices = () => apiRequest<InvoiceListDto>("/billing/invoices");

/* ------------------------------------------------------------------ *
 * Uploads
 * ------------------------------------------------------------------ */

export type AttachmentDto = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  moduleId: string | null;
  recordId: string | null;
  url: string;
  createdAt: string;
};

export const fetchAttachments = (params: { moduleId?: string; recordId?: string } = {}) =>
  apiRequest<AttachmentDto[]>("/uploads", { query: params });

export const uploadAttachment = (
  file: File,
  meta: { moduleId?: string; recordId?: string } = {},
) => {
  const form = new FormData();
  form.append("file", file);
  if (meta.moduleId) form.append("moduleId", meta.moduleId);
  if (meta.recordId) form.append("recordId", meta.recordId);
  return apiUpload<AttachmentDto>("/uploads", form);
};

export const deleteAttachment = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/uploads/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * Roles & permissions
 * ------------------------------------------------------------------ */

export type PermissionSetDto = { modules: "*" | string[]; actions: "*" | string[] };

export type RoleDto = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: PermissionSetDto;
  isSystem: boolean;
  members: number;
};

export type RoleMatrixDto = {
  actions: string[];
  modules: Array<{ id: string; name: string; group: string }>;
  roles: RoleDto[];
  templates: Array<{ key: string; name: string; permissions: PermissionSetDto }>;
};

export const fetchRoles = () => apiRequest<RoleDto[]>("/roles");

export const fetchRoleMatrix = () => apiRequest<RoleMatrixDto>("/roles/matrix");

export const createRole = (body: {
  name: string;
  description?: string;
  permissions: PermissionSetDto;
}) => apiRequest<RoleDto>("/roles", { method: "POST", body });

export const updateRole = (
  id: string,
  body: { name?: string; description?: string; permissions?: PermissionSetDto },
) => apiRequest<RoleDto>(`/roles/${id}`, { method: "PATCH", body });

export const deleteRole = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/roles/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * API keys
 * ------------------------------------------------------------------ */

export type ApiKeyDto = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
};

export const fetchApiKeys = () => apiRequest<ApiKeyDto[]>("/api-keys");

export const createApiKey = (body: { name: string; scopes?: string[] }) =>
  apiRequest<{ id: string; name: string; key: string; scopes: string[] }>("/api-keys", {
    method: "POST",
    body,
  });

export const revokeApiKey = (id: string) =>
  apiRequest<{ revoked: boolean }>(`/api-keys/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * Auth extras
 * ------------------------------------------------------------------ */

export const updateProfile = (body: { name?: string; phone?: string; avatarUrl?: string }) =>
  apiRequest<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
  }>("/auth/me", {
    method: "PATCH",
    body,
  });

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiRequest<{ updated: boolean }>("/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });

/* ------------------------------------------------------------------ *
 * Workspace extras
 * ------------------------------------------------------------------ */

export const bulkRecords = (
  moduleId: string,
  body: { action: "delete" | "status" | "assign"; ids: string[]; value?: string },
) =>
  apiRequest<{ affected: number }>(`/workspace/${moduleId}/records/bulk`, { method: "POST", body });

export const exportRecordsCsv = (moduleId: string, filters: Filters = {}) =>
  apiDownload(`/workspace/${moduleId}/export.csv`, filters);
