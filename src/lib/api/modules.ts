/**
 * Extended Traveldesk API surface: insights, engagement, commerce, files and
 * administration. Mirrors every router mounted under /api/v1 that the CRM UI
 * consumes beyond the core records/tasks/members layer in `crm.ts`.
 */
import { apiBlob, apiDownload, apiRequest, apiUpload } from "./client";

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

/**
 * Downloads the report the screen is showing, as a real spreadsheet or a
 * printable PDF — the two files a travel agency actually forwards.
 */
export const downloadReport = async (
  report: ReportKey,
  filters: Filters,
  format: "xlsx" | "pdf",
): Promise<Blob> => apiBlob(`/reports/${report}/export.${format}`, filters);

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
  /** False when the assistant answered from built-in rules (LLM key not set). */
  live: boolean;
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
  /** Present on newly sent outbound messages — sent | queued | failed | null. */
  delivery?: string | null;
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
  /** Canvas graph as JSON: { nodes, edges }. */
  graph?: string;
  status: string;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
};

export type GraphNodeDto = {
  id: string;
  type: "trigger" | "condition" | "action";
  kind: string;
  label: string;
  config?: Record<string, string | number | boolean>;
  x: number;
  y: number;
};

export type WorkflowGraphDto = {
  nodes: GraphNodeDto[];
  edges: Array<{ from: string; to: string }>;
};

export type GraphRunDto = {
  status: string;
  log: string;
  dryRun: boolean;
  nodes: Array<{ id: string; label: string; status: string; detail: string }>;
};

export type WorkflowRunDto = {
  id: string;
  workflow: string;
  workflowId?: string;
  status: string;
  trigger: string;
  log: string;
  /** Attempts made so far; 1 means it has only failed once. */
  attempts: number;
  /** When the automatic retry is due, or null when none is pending. */
  nextAttemptAt: string | null;
  /** Set when the retries ran out and a person has to look at it. */
  deadLetteredAt: string | null;
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
  body: Partial<
    Pick<WorkflowDto, "name" | "trigger" | "condition" | "action" | "status" | "graph">
  >,
) => apiRequest<WorkflowDto>(`/workflows/${id}`, { method: "PATCH", body });

export const deleteWorkflow = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/workflows/${id}`, { method: "DELETE" });

export const runWorkflow = (id: string, options: { dryRun?: boolean } = {}) =>
  apiRequest<{ status: string; log: string; finishedAt?: string } & Partial<GraphRunDto>>(
    `/workflows/${id}/run`,
    {
      method: "POST",
      body: {},
      query: options.dryRun ? { dryRun: "1" } : {},
    },
  );

export const fetchWorkflowRunsFor = (id: string) =>
  apiRequest<Array<WorkflowRunDto & { workflowId: string }>>(`/workflows/${id}/runs`);

/** Try a failed or dead-lettered run again, right now. */
export const retryWorkflowRun = (runId: string) =>
  apiRequest<WorkflowRunDto>(`/workflows/runs/${runId}/retry`, { method: "POST", body: {} });

/** Accept that a run will not be retried. */
export const discardWorkflowRun = (runId: string) =>
  apiRequest<{ discarded: boolean }>(`/workflows/runs/${runId}/discard`, {
    method: "POST",
    body: {},
  });

/* ------------------------------------------------------------------ *
 * Custom Fields
 * ------------------------------------------------------------------ */

export type CustomFieldDto = {
  id: string;
  organizationId: string;
  moduleId: string;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  position: number;
  createdAt: string;
};

export type CustomFieldInput = {
  moduleId: string;
  label: string;
  key?: string;
  type?: "text" | "number" | "date" | "select" | "boolean" | "email" | "phone";
  options?: string[];
  required?: boolean;
  position?: number;
};

export const fetchCustomFields = (moduleId?: string) =>
  apiRequest<CustomFieldDto[]>("/custom-fields", {
    query: moduleId ? { moduleId } : {},
  });

export const createCustomField = (body: CustomFieldInput) =>
  apiRequest<CustomFieldDto>("/custom-fields", { method: "POST", body });

export const updateCustomField = (id: string, body: Partial<CustomFieldInput>) =>
  apiRequest<CustomFieldDto>(`/custom-fields/${id}`, { method: "PATCH", body });

export const deleteCustomField = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/custom-fields/${id}`, { method: "DELETE" });

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

/** One row of the delivery log — what was sent, where to, and what came back. */
export type WebhookDeliveryDto = {
  id: string;
  webhookId: string;
  url: string;
  active: boolean;
  event: string;
  status: string;
  responseCode: number | null;
  payload: string;
  createdAt: string;
};

export const fetchWebhookDeliveries = (take = 50) =>
  apiRequest<WebhookDeliveryDto[]>("/integrations/deliveries", { query: { take } });

export const retryWebhookDelivery = (id: string) =>
  apiRequest<{ id: string; status: string; responseCode: number | null; createdAt: string }>(
    `/integrations/deliveries/${id}/retry`,
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
 * White-label domain
 * ------------------------------------------------------------------ */

export type DomainDto = {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
};

export const fetchDomain = () => apiRequest<DomainDto>("/domains/domain");

export const updateDomain = (body: { customDomain: string | null }) =>
  apiRequest<DomainDto>("/domains/domain", { method: "PUT", body });

export const resolveDomain = (domain: string) =>
  apiRequest<{
    id: string;
    name: string;
    slug: string;
    customDomain: string;
    plan: string;
    planStatus: string;
  }>(`/domains/resolve/${encodeURIComponent(domain)}`);

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
  /** "clamav:clean" when a real scan ran; "eicar-only:clean" when none did. */
  scanStatus: string;
  scannedAt: string | null;
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

/* ------------------------------------------------------------------ *
 * Finance commerce: invoices, payment links, outbox
 * ------------------------------------------------------------------ */

export type PaymentLinkDto = {
  id: string;
  status: string;
  checkoutUrl: string | null;
  configured: boolean;
};

export type OutboxEntryDto = {
  id: string;
  channel: string;
  to: string;
  subject: string;
  body: string;
  template: string | null;
  status: string;
  error: string | null;
  relatedModule: string | null;
  relatedReference: string;
  createdAt: string;
  sentAt: string | null;
};

export const downloadInvoicePdf = async (reference: string) => {
  const blob = await apiBlob(`/finance/invoices/${encodeURIComponent(reference)}/invoice.pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `invoice-${reference}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const createPaymentLink = (
  reference: string,
  contact: {
    customerEmail?: string | undefined;
    customerPhone?: string | undefined;
    customerName?: string | undefined;
  } = {},
) =>
  apiRequest<PaymentLinkDto>(`/finance/invoices/${encodeURIComponent(reference)}/payment-link`, {
    method: "POST",
    body: contact,
  });

export const sendInvoiceEmail = (reference: string, to: string, note?: string) =>
  apiRequest<{ status: string; id: string }>(
    `/finance/invoices/${encodeURIComponent(reference)}/send`,
    {
      method: "POST",
      body: { to, note },
    },
  );

export const fetchOutbox = (take = 100) =>
  apiRequest<OutboxEntryDto[]>("/finance/outbox", { query: { take } });

/* ------------------------------------------------------------------ *
 * Call logs & consent — the real Communications records
 * ------------------------------------------------------------------ */

export type CallLogDto = {
  id: string;
  contactName: string;
  contactPhone: string;
  direction: "Inbound" | "Outbound";
  outcome: string;
  durationMinutes: number;
  notes: string;
  recordId: string | null;
  owner: string;
  calledAt: string;
};

export const fetchCallLogs = (take = 100) =>
  apiRequest<CallLogDto[]>("/comms", { query: { take } });

export const createCallLog = (body: {
  contactName: string;
  contactPhone?: string | undefined;
  direction: "Inbound" | "Outbound";
  outcome: string;
  durationMinutes: number;
  notes?: string | undefined;
  recordId?: string | undefined;
  owner?: string | undefined;
}) => apiRequest<CallLogDto>("/comms", { method: "POST", body });

export const deleteCallLog = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/comms/${encodeURIComponent(id)}`, { method: "DELETE" });

export type ConsentDto = {
  id: string;
  contactEmail: string;
  contactPhone: string;
  contactName: string;
  email: boolean;
  whatsapp: boolean;
  calls: boolean;
  source: string;
  capturedAt: string;
  updatedAt: string;
};

export const fetchConsents = () => apiRequest<ConsentDto[]>("/comms/consents");

export const saveConsent = (body: {
  contactEmail: string;
  contactPhone?: string | undefined;
  contactName?: string | undefined;
  email: boolean;
  whatsapp: boolean;
  calls: boolean;
  source?: string | undefined;
}) => apiRequest<ConsentDto>("/comms/consents", { method: "PUT", body });

export const createMessageTemplate = (body: { channel: string; name: string; body: string }) =>
  apiRequest<{ id: string; channel: string; name: string; body: string }>(
    "/conversations/templates",
    { method: "POST", body },
  );

export const deleteMessageTemplate = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/conversations/templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

/* ------------------------------------------------------------------ *
 * Channels — the organisation's own email / WhatsApp accounts
 * ------------------------------------------------------------------ */

export type ChannelStatusDto = {
  email: {
    configured: boolean;
    source: "settings" | "env" | "none";
    host: string;
    user: string;
    from: string;
    hasPassword: boolean;
  };
  whatsapp: {
    configured: boolean;
    source: "settings" | "env" | "none";
    detail: string;
    phoneNumberId: string;
    hasToken: boolean;
    /** Paired WhatsApp Web device, if the team scanned a QR. */
    web?: WhatsAppWebStatusDto;
  };
  razorpay: {
    configured: boolean;
    source: "settings" | "env" | "none";
    detail: string;
    hasKey: boolean;
  };
};

export const fetchChannelStatus = () => apiRequest<ChannelStatusDto>("/channels");

export const saveEmailChannel = (body: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string | undefined;
  from?: string | undefined;
}) => apiRequest<{ saved: boolean }>("/channels/email", { method: "PUT", body });

export const removeEmailChannel = () =>
  apiRequest<{ saved: boolean }>("/channels/email", { method: "DELETE" });

export type WhatsAppWebStatusDto = {
  state: "idle" | "connecting" | "qr" | "connected" | "error";
  qr: string | null;
  me: string | null;
  error: string | null;
  linked: boolean;
};

/** WhatsApp Web pairing (QR scan) — this is the number the team answers on. */
export const fetchWhatsAppWeb = () => apiRequest<WhatsAppWebStatusDto>("/channels/whatsapp/web");

export const connectWhatsAppWeb = () =>
  apiRequest<WhatsAppWebStatusDto>("/channels/whatsapp/web/connect", { method: "POST" });

export const disconnectWhatsAppWeb = () =>
  apiRequest<WhatsAppWebStatusDto>("/channels/whatsapp/web/disconnect", { method: "POST" });

export const sendWhatsAppWebTest = (to: string) =>
  apiRequest<{ status: string; id: string }>("/channels/whatsapp/web/test", {
    method: "POST",
    body: { to },
  });

export const saveWhatsAppChannel = (body: { phoneNumberId: string; token?: string | undefined }) =>
  apiRequest<{ saved: boolean }>("/channels/whatsapp", { method: "PUT", body });

export const removeWhatsAppChannel = () =>
  apiRequest<{ saved: boolean }>("/channels/whatsapp", { method: "DELETE" });

export const saveRazorpayChannel = (body: {
  keyId: string;
  keySecret: string;
  webhookSecret?: string | undefined;
}) => apiRequest<{ saved: boolean }>("/channels/razorpay", { method: "PUT", body });

export const removeRazorpayChannel = () =>
  apiRequest<{ saved: boolean }>("/channels/razorpay", { method: "DELETE" });

export const sendEmailTest = (to: string) =>
  apiRequest<{ status: string; id: string }>("/channels/email/test", {
    method: "POST",
    body: { to },
  });

export const sendWhatsAppTest = (to: string) =>
  apiRequest<{ status: string; id: string }>("/channels/whatsapp/test", {
    method: "POST",
    body: { to },
  });

/* ------------------------------------------------------------------ *
 * Quotations - professional quote PDF with company masthead,
 * itemised packages, validity and terms.
 * ------------------------------------------------------------------ */

export type QuoteItemDto = {
  label: string;
  qty: number;
  rate: number;
};

export const downloadQuotationPdf = async (reference: string) => {
  const blob = await apiBlob(`/finance/quotations/${encodeURIComponent(reference)}/quote.pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `quotation-${reference}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
};

/** The package as a customer-facing PDF: plan, inclusions, prices, terms. */
export const downloadPackagePdf = async (reference: string) => {
  const blob = await apiBlob(`/packages/${encodeURIComponent(reference)}/package.pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `package-${reference}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const sendQuotationEmail = (reference: string, to: string, note?: string) =>
  apiRequest<{ status: string; id: string }>(
    `/finance/quotations/${encodeURIComponent(reference)}/send`,
    {
      method: "POST",
      body: { to, note },
    },
  );

/* ------------------------------------------------------------------ *
 * Flights — real Amadeus search when keys are configured
 * ------------------------------------------------------------------ */

export type FlightOfferDto = {
  airline: string;
  price: number;
  currency: string;
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string };
  seatsLeft?: number;
};

export type FlightSearchResult = {
  configured: boolean;
  offers: FlightOfferDto[];
  currency?: string;
  message?: string;
};

export const searchFlights = (query: { from: string; to: string; date: string; adults?: number }) =>
  apiRequest<FlightSearchResult>("/flights/search", { query });

/* ------------------------------------------------------------------ *
 * Public lead capture (no auth — used by hosted form & website widgets)
 * ------------------------------------------------------------------ */

export const submitPublicLead = (slug: string, body: Record<string, unknown>) =>
  apiRequest<{ ok: boolean; reference: string; message: string }>(`/public/lead-form/${slug}`, {
    method: "POST",
    body,
    auth: false,
  });

export const fetchPublicLeadForm = (slug: string) =>
  apiRequest<{
    organization: { name: string; slug: string; supportEmail: string | null };
    token: string;
    captcha: { provider: string; siteKey: string } | null;
  }>(`/public/lead-form/${slug}`, { auth: false });

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

/**
 * One change applied to many records.
 *
 * The rows are named by their reference ("LD-2409") — the code the person
 * ticked — not by a database id, so what is sent is exactly what was chosen.
 */
export type BulkResultDto = {
  affected: number;
  /**
   * Ticked records that were deliberately left alone, with the reason — a
   * cancelled booking reopened onto a full departure, for instance.
   */
  skipped?: Array<{ reference: string; reason: string }>;
};

export const bulkRecords = (
  moduleId: string,
  body: {
    action: "delete" | "status" | "assign";
    references: string[];
    value?: string;
  },
) =>
  apiRequest<BulkResultDto>(`/workspace/${moduleId}/records/bulk`, {
    method: "POST",
    body,
  });

export const exportRecordsCsv = (moduleId: string, filters: Filters = {}) =>
  apiDownload(`/workspace/${moduleId}/export.csv`, filters);

/* ------------------------------------------------------------------ *
 * The daily email digest
 * ------------------------------------------------------------------ */

export type DigestSettingsDto = {
  enabled: boolean;
  hour: number;
  scope: "mine" | "team";
  recipients: string[];
  lastSentDate: string;
};

export const fetchDigestSettings = () =>
  apiRequest<{ settings: DigestSettingsDto; timezone: string }>("/organizations/current/digest");

export const saveDigestSettings = (body: Partial<DigestSettingsDto>) =>
  apiRequest<{ settings: DigestSettingsDto }>("/organizations/current/digest", {
    method: "PATCH",
    body,
  });

/** Sends today's list to the signed-in person right now and says how it went. */
export const sendDigestNow = () =>
  apiRequest<{ status: string; total: number; to: string }>("/organizations/current/digest/send", {
    method: "POST",
  });

export type PlatformOrgDto = {
  id: string;
  name: string;
  slug: string;
  supportEmail: string | null;
  createdAt: string;
  members: number;
  planKey: string | null;
  status: string;
};

export type PlatformPlanDto = PlanDto & {
  priceYearly: number;
  limits: Record<string, number>;
  position: number;
};

export const fetchPlatformOrganizations = () =>
  apiRequest<PlatformOrgDto[]>("/platform/organizations");
export const fetchPlatformPlans = () => apiRequest<PlatformPlanDto[]>("/platform/plans");
export const createPlatformPlan = (body: {
  key: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  features: string[];
  popular: boolean;
  position: number;
}) => apiRequest<PlatformPlanDto>("/platform/plans", { method: "POST", body });
export const deletePlatformPlan = (key: string) =>
  apiRequest<{ deleted: boolean }>(`/platform/plans/${key}`, { method: "DELETE" });
export const setOrganizationPlan = (orgId: string, body: { planKey: string; status?: string }) =>
  apiRequest<{ organizationId: string; planKey: string; status: string }>(
    `/platform/organizations/${orgId}/plan`,
    { method: "PATCH", body },
  );

/* ------------------------------------------------------------------ *
 * Team Chat
 * ------------------------------------------------------------------ */

export type ChatChannelDto = {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  isDirect: boolean;
  memberCount: number;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

export type ChatMessageDto = {
  id: string;
  channelId: string;
  body: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  reactions: Array<{ emoji: string; count: number; mine: boolean }>;
  replyToId: string | null;
  replyToBody: string | null;
  edited: boolean;
  createdAt: string;
};

export const fetchChatChannels = () => apiRequest<ChatChannelDto[]>("/team-chat/channels");

export const createChatChannel = (body: {
  name: string;
  description?: string;
  isPrivate?: boolean;
  memberIds?: string[];
}) => apiRequest<ChatChannelDto>("/team-chat/channels", { method: "POST", body });

export const fetchChatMessages = (channelId: string, before?: string) =>
  apiRequest<ChatMessageDto[]>(`/team-chat/channels/${channelId}/messages`, {
    query: { pageSize: 50, ...(before ? { before } : {}) },
  });

export const sendChatMessage = (channelId: string, body: string, replyToId?: string) =>
  apiRequest<ChatMessageDto>(`/team-chat/channels/${channelId}/messages`, {
    method: "POST",
    body: { body, replyToId },
  });

export const addChatReaction = (channelId: string, messageId: string, emoji: string) =>
  apiRequest<ChatMessageDto>(`/team-chat/channels/${channelId}/messages/${messageId}/reactions`, {
    method: "POST",
    body: { emoji },
  });

export const markChatRead = (channelId: string) =>
  apiRequest<{ read: boolean }>(`/team-chat/channels/${channelId}/read`, {
    method: "POST",
  });

export const openDirectMessage = (userId: string) =>
  apiRequest<ChatChannelDto>("/team-chat/dm", { method: "POST", body: { userId } });

export const fetchChatMembers = () =>
  apiRequest<Array<{ id: string; name: string; avatarUrl: string | null; online: boolean }>>(
    "/team-chat/members",
  );

/* ------------------------------------------------------------------ *
 * Hotel search (Hotelbeds / manual fallback)
 * ------------------------------------------------------------------ */

export type HotelSearchResult = {
  configured: boolean;
  message?: string;
  hotels: Array<{
    code: string;
    name: string;
    categoryName: string;
    destinationName: string;
    latitude: number | null;
    longitude: number | null;
    rooms: Array<{
      code: string;
      name: string;
      boardName: string;
      net: number;
      currency: string;
      allotment: number;
      cancellationPolicies: string;
    }>;
  }>;
  currency: string;
};

export type HotelContractRate = {
  id: string;
  hotelName: string;
  city: string;
  country: string;
  roomType: string;
  mealPlan: string;
  season: string;
  validFrom: string | null;
  validTo: string | null;
  costPrice: number;
  sellingPrice: number;
  currency: string;
  basis: string;
  cancellation: string;
  supplierName: string;
  notes: string;
  active: boolean;
  createdAt: string;
};

export const searchHotels = (query: {
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms?: number;
  adults?: number;
}) => apiRequest<HotelSearchResult>("/hotels/search", { query });

export const fetchContractRates = (params: { city?: string; hotelName?: string } = {}) =>
  apiRequest<HotelContractRate[]>("/hotels/contract-rates", { query: params });

export const createContractRate = (body: Omit<HotelContractRate, "id" | "createdAt">) =>
  apiRequest<HotelContractRate>("/hotels/contract-rates", { method: "POST", body });

export const updateContractRate = (id: string, body: Partial<HotelContractRate>) =>
  apiRequest<HotelContractRate>(`/hotels/contract-rates/${id}`, { method: "PATCH", body });

export const deleteContractRate = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/hotels/contract-rates/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * Flight PNR Queue
 * ------------------------------------------------------------------ */

export type PNRPassenger = {
  name: string;
  passport: string;
  dob: string;
  nationality: string;
  ticketNumber: string;
};

export type PNRDto = {
  id: string;
  recordId: string | null;
  pnr: string;
  gds: string;
  airline: string;
  route: string;
  departure: string;
  passengers: PNRPassenger[];
  fareType: string;
  ticketDeadline: string | null;
  hoursUntilDeadline: number | null;
  deadlineUrgency: "none" | "ok" | "warning" | "critical" | "expired";
  status: "Active" | "Ticketed" | "Voided" | "Expired" | "Refunded";
  ticketNumbers: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export const fetchPNRs = (params: { status?: string; deadlineHours?: number } = {}) =>
  apiRequest<PNRDto[]>("/pnr", { query: params });

export const createPNR = (body: {
  pnr?: string;
  gds?: string;
  airline?: string;
  route?: string;
  departure?: string;
  passengers?: PNRPassenger[];
  fareType?: string;
  ticketDeadline?: string;
  notes?: string;
  recordId?: string;
}) => apiRequest<PNRDto>("/pnr", { method: "POST", body });

export const updatePNR = (id: string, body: Partial<PNRDto>) =>
  apiRequest<PNRDto>(`/pnr/${id}`, { method: "PATCH", body });

export const issuePNRTickets = (id: string, ticketNumbers: string[]) =>
  apiRequest<PNRDto>(`/pnr/${id}/ticket`, { method: "POST", body: { ticketNumbers } });

export const voidPNR = (id: string, reason: string) =>
  apiRequest<PNRDto>(`/pnr/${id}/void`, { method: "POST", body: { reason } });

export const refundPNR = (id: string, reason: string, amount?: number) =>
  apiRequest<PNRDto>(`/pnr/${id}/refund`, { method: "POST", body: { reason, amount } });

export const expirePNR = (id: string) =>
  apiRequest<{ expired: boolean }>(`/pnr/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * Customer portal
 * ------------------------------------------------------------------ */

export type PortalTokenDto = {
  token: string;
  url: string;
  expiresAt: string;
};

export type PortalBookingDto = {
  id: string;
  reference: string;
  customerName: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  invoices: Array<{
    id: string;
    reference: string;
    amount: number;
    status: string;
    dueDate: string | null;
    paymentLink: string | null;
  }>;
  vouchers: Array<{
    id: string;
    type: string;
    supplierName: string;
    checkIn: string | null;
    checkOut: string | null;
    reference: string;
    downloadUrl: string;
  }>;
};

export const generatePortalToken = (bookingRecordId: string) =>
  apiRequest<PortalTokenDto>("/portal/token", {
    method: "POST",
    body: { recordId: bookingRecordId },
  });

/* ------------------------------------------------------------------ *
 * Payment reconciliation
 * ------------------------------------------------------------------ */

export type ReconciliationSummaryDto = {
  total: number;
  matched: number;
  unmatched: number;
  partial: number;
  items: Array<{
    paymentId: string;
    amount: number;
    currency: string;
    provider: string;
    status: "matched" | "unmatched" | "partial";
    invoiceId: string | null;
    invoiceRef: string | null;
    matchedAt: string | null;
    notes: string;
  }>;
};

export const fetchReconciliationSummary = (params: { from?: string; to?: string } = {}) =>
  apiRequest<ReconciliationSummaryDto>("/reconciliation/summary", { query: params });

export const runReconciliation = () =>
  apiRequest<{ matched: number; unmatched: number }>("/reconciliation/run", { method: "POST" });
