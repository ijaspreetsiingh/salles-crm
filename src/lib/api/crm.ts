/**
 * Typed endpoint helpers + DTO mappers between the Traveldesk API and the
 * frontend CRM catalogue types.
 */
import { apiRequest } from "./client";
import type { CustomField, RecordRow, Task } from "@/lib/crm/catalog";

/* ------------------------------------------------------------------ *
 * API DTOs
 * ------------------------------------------------------------------ */

export type OrganizationDto = {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  gstin: string | null;
  supportEmail: string | null;
  phone: string | null;
  address: string | null;
  currency: string | null;
  financialYear: string | null;
  timezone: string | null;
  settings: Record<string, unknown>;
};

export type SessionUserDto = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  /** Whether the email address has been verified. */
  emailVerified?: boolean;
  /** ISO timestamp of the last sign-in, or null when they never have. */
  lastLoginAt?: string | null;
  /** True when this email is listed in the platform's PLATFORM_ADMIN_EMAILS. */
  isPlatformAdmin?: boolean;
};

export type PermissionSetDto = {
  modules: "*" | string[];
  actions: "*" | string[];
};

export type SessionDto = {
  accessToken: string;
  refreshToken: string;
  user: SessionUserDto;
  membership: { organizationId: string; roleKey: string; branchId: string | null };
  organization?: OrganizationDto;
  permissions?: PermissionSetDto;
  /** True when the role demands a second factor and the person has not set it up. */
  twoFactorSetupRequired?: boolean;
  twoFactorEnabled?: boolean;
  recoveryCodeUsed?: boolean;
};

export type MeDto = {
  user: SessionUserDto;
  organization: OrganizationDto;
  membership: {
    roleKey: string;
    branchId: string | null;
    /** True when this role only ever sees its own office. */
    branchScoped: boolean;
  };
  permissions?: PermissionSetDto;
};

export type RecordDto = {
  id: string;
  moduleId: string;
  reference: string;
  name: string;
  detail: string;
  destination: string;
  owner: string;
  branch: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  customerType: string;
  extra: Record<string, unknown>;
  createdAt?: string;
  /** Version stamp used for optimistic locking on save. */
  updatedAt?: string;
};

export type TaskDto = {
  id: string;
  title: string;
  type: string;
  owner: string;
  date: string;
  priority: string;
  done: boolean;
  relatedModule?: string | null;
  relatedRecordId?: string | null;
};

export type CustomFieldDto = {
  id: string;
  moduleId: string;
  key: string;
  label: string;
  type: string;
  options: string[];
};

export type BranchDto = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  active: boolean;
  members?: number;
};

export type MemberDto = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl?: string | null;
  roleKey: string;
  roleName: string;
  branch: string | null;
  branchId: string | null;
  active: boolean;
  /** ISO timestamp of the last sign-in, or null when they never have. */
  lastLoginAt?: string | null;
  /** Work currently assigned to this person — real counts, never estimates. */
  openTasks?: number;
  openEnquiries?: number;
  activeTrips?: number;
  pipelineValue?: number;
};

/**
 * The things that need a human, already filtered on the server for one person
 * or one branch. Same shape `buildWorklist` has always taken.
 */
export type AttentionDto = {
  scope: "mine" | "team";
  person: string;
  today: string;
  tasks: TaskDto[];
  leads: RecordDto[];
  bookings: RecordDto[];
  finance: RecordDto[];
  visa: RecordDto[];
  groups: RecordDto[];
};

export type AuditDto = {
  id: string;
  action: string;
  moduleId: string;
  recordId: string | null;
  label: string;
  actor: string;
  createdAt: string;
};

type Page<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

/* ------------------------------------------------------------------ *
 * Role label <-> key
 * ------------------------------------------------------------------ */

export const ROLE_LABEL_BY_KEY: Record<string, string> = {
  company_admin: "Company admin",
  branch_manager: "Branch manager",
  sales: "Sales",
  operations: "Operations",
  finance: "Finance",
  support: "Support",
};

export const ROLE_KEY_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_LABEL_BY_KEY).map(([key, label]) => [label, key]),
);

/* ------------------------------------------------------------------ *
 * Mappers: API -> UI
 * ------------------------------------------------------------------ */

export function toRecordRow(dto: RecordDto): RecordRow {
  const row: RecordRow = {
    id: dto.reference || dto.id,
    name: dto.name ?? "",
    detail: dto.detail ?? "",
    destination: dto.destination ?? "",
    owner: dto.owner ?? "",
    branch: dto.branch ?? "",
    date: dto.date ?? "",
    amount: Number(dto.amount) || 0,
    currency: dto.currency ?? "",
    status: dto.status ?? "",
    email: dto.email ?? "",
    phone: dto.phone ?? "",
    source: dto.source ?? "",
    notes: dto.notes ?? "",
  };
  if (dto.customerType) row.customerType = dto.customerType as "Corporate" | "VIP" | "Leisure";
  if (dto.updatedAt) row.updatedAt = dto.updatedAt;
  const extra = (dto.extra ?? {}) as Record<string, string | number>;
  if (Object.keys(extra).length > 0) row.extra = extra;
  return row;
}

export function toRecordBody(row: RecordRow) {
  return {
    name: row.name || "Untitled",
    detail: row.detail ?? "",
    destination: row.destination ?? "",
    owner: row.owner ?? "",
    branch: row.branch ?? "",
    date: row.date ?? "",
    amount: Number.isFinite(row.amount) ? row.amount : 0,
    currency: row.currency ?? "",
    status: row.status ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    source: row.source ?? "",
    notes: row.notes ?? "",
    extra: row.extra ?? {},
  };
}

export function toTask(dto: TaskDto): Task {
  const task: Task = {
    id: dto.id,
    title: dto.title,
    type: dto.type,
    owner: dto.owner ?? "",
    date: dto.date,
    priority: dto.priority,
    done: Boolean(dto.done),
  };
  if (dto.relatedModule) task.relatedModule = dto.relatedModule;
  if (dto.relatedRecordId) task.relatedRecordId = dto.relatedRecordId;
  return task;
}

const fieldType = (type: string): CustomField["type"] =>
  type === "number" ? "number" : type === "date" ? "date" : type === "select" ? "select" : "text";

export function toCustomField(dto: CustomFieldDto): CustomField {
  return { id: dto.id, label: dto.label, type: fieldType(dto.type) };
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export const fetchCsrf = () => apiRequest<{ csrfToken: string }>("/auth/csrf", { auth: false });
export const login = (
  email: string,
  password: string,
  second?: { totp?: string; recoveryCode?: string },
) =>
  apiRequest<SessionDto>("/auth/login", {
    method: "POST",
    // Only sent when the account actually has a second factor; the server
    // ignores them otherwise.
    body: { email, password, ...(second ?? {}) },
    auth: false,
  });

export const register = (body: {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
}) => apiRequest<SessionDto>("/auth/register", { method: "POST", body, auth: false });

export const logout = () =>
  apiRequest<{ loggedOut: boolean }>("/auth/logout", { method: "POST", body: {} }).catch(() => ({
    loggedOut: true,
  }));

export const fetchMe = () => apiRequest<MeDto>("/auth/me");

/* ------------------------------------------------------------------ *
 * Two-factor authentication (Settings → Profile → Security)
 * ------------------------------------------------------------------ */

export type TwoFactorStatusDto = {
  /** The role demands a second factor and it is not set up yet. */
  required: boolean;
  /** The role is privileged but enforcement is off in this environment. */
  recommended: boolean;
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
  setupRequired: boolean;
};

export const fetchTwoFactorStatus = () => apiRequest<TwoFactorStatusDto>("/auth/2fa/status");

export const startTwoFactorSetup = () =>
  apiRequest<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup", {
    method: "POST",
    body: {},
  });

export const enableTwoFactor = (code: string) =>
  apiRequest<{ enabled: boolean; recoveryCodes: string[] }>("/auth/2fa/enable", {
    method: "POST",
    body: { code },
  });

export const disableTwoFactor = (password: string) =>
  apiRequest<{ enabled: boolean }>("/auth/2fa/disable", { method: "POST", body: { password } });

export const regenerateRecoveryCodes = (password: string) =>
  apiRequest<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes", {
    method: "POST",
    body: { password },
  });

/* ------------------------------------------------------------------ *
 * Workspace records
 * ------------------------------------------------------------------ */

export async function fetchRecords(moduleId: string): Promise<RecordDto[]> {
  const page = await apiRequest<Page<RecordDto>>(`/workspace/${moduleId}/records`, {
    query: { pageSize: 200, sort: "createdAt", order: "desc" },
  });
  return page.items ?? [];
}

/**
 * Every record in the workspace, grouped by module — one request instead of
 * one per module. The sign-in screen waits on this, so speed matters.
 *
 * This is a recent slice for cross-module context, not a module's full list:
 * module screens page their own records in through `fetchModulePage`.
 */
export async function fetchAllRecords(): Promise<Record<string, RecordDto[]>> {
  return apiRequest<Record<string, RecordDto[]>>("/workspace/all-records");
}

/**
 * The module catalogue, including each module's workflow statuses.
 *
 * This is the only place the list is authored; the UI paints itself from
 * here so it can never offer a status the API will reject.
 */
export type ModuleCatalogueDto = {
  id: string;
  name: string;
  group: string;
  statuses: string[];
  tabs: string[];
  noun: string;
};

export async function fetchWorkspaceModules(): Promise<ModuleCatalogueDto[]> {
  const data = await apiRequest<{ modules: ModuleCatalogueDto[] }>("/workspace/modules");
  return data.modules ?? [];
}

/** One page of a module's records, already filtered and sorted by the server. */
export type ModuleListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string[];
  owner?: string;
  /** Which office's records to show. */
  branch?: string;
  from?: string;
  to?: string;
  sort?: string;
  order?: "asc" | "desc";
  customerType?: string;
};

export type PageMetaDto = { page: number; pageSize: number; total: number; totalPages: number };

export type ModulePageDto = { items: RecordDto[]; meta: PageMetaDto };

/** Numbers for a module header, counted over the whole filtered set. */
export type ModuleStatsDto = {
  moduleId: string;
  total: number;
  active: number;
  awaiting: number;
  contractValue: number;
  collected: number;
  variant: "finance" | "default";
  breakdown: Array<{ status: string; count: number; amount: number }>;
};

export type ModuleFacetsDto = {
  tabs: string[];
  statuses: string[];
  owners: string[];
  branches: string[];
  sources: string[];
  statusCounts: Record<string, number>;
  ownerCounts: Record<string, number>;
};

const listQuery = (query: ModuleListQuery): Record<string, string | number> => {
  const out: Record<string, string | number> = {};
  if (query.page) out["page"] = query.page;
  if (query.pageSize) out["pageSize"] = query.pageSize;
  if (query.search?.trim()) out["search"] = query.search.trim();
  if (query.status?.length) out["status"] = query.status.join(",");
  if (query.customerType) out["customerType"] = query.customerType;
  if (query.owner) out["owner"] = query.owner;
  if (query.branch) out["branch"] = query.branch;
  if (query.from) out["from"] = query.from;
  if (query.to) out["to"] = query.to;
  if (query.sort) out["sort"] = query.sort;
  if (query.order) out["order"] = query.order;
  return out;
};

/**
 * A page of module records.
 *
 * The list is asked for — not filtered from a cached pile — so a workspace
 * with twenty thousand old enquiries still searches all of them, and the
 * footer can say honestly how many matched.
 */
export const fetchModulePage = (moduleId: string, query: ModuleListQuery = {}) =>
  apiRequest<ModulePageDto>(`/workspace/${moduleId}/records`, { query: listQuery(query) });

export const fetchModuleStats = (moduleId: string, query: ModuleListQuery = {}) =>
  apiRequest<ModuleStatsDto>(`/workspace/${moduleId}/stats`, { query: listQuery(query) });

export const fetchModuleFacets = (moduleId: string) =>
  apiRequest<ModuleFacetsDto>(`/workspace/${moduleId}/facets`);

/* ------------------------------------------------------------------ *
 * Duplicates
 * ------------------------------------------------------------------ */

export type DuplicateMemberDto = {
  id: string;
  reference: string;
  name: string;
  destination: string;
  owner: string;
  branch: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  email: string;
  phone: string;
  createdAt: string;
  filled: number;
};

export type DuplicateGroupDto = {
  key: string;
  reasons: string[];
  records: DuplicateMemberDto[];
};

export type DuplicateScanDto = { groups: DuplicateGroupDto[]; scanned: number };

/** Records in one module that look like the same customer, with the reason. */
export const fetchModuleDuplicates = (moduleId: string) =>
  apiRequest<DuplicateScanDto>(`/workspace/${moduleId}/duplicates`);

export type MergeResultDto = {
  record: RecordDto;
  mergedReferences: string[];
  moved: Record<string, number>;
};

export const mergeModuleRecords = (moduleId: string, keep: string, merges: string[]) =>
  apiRequest<MergeResultDto>(`/workspace/${moduleId}/merge`, {
    method: "POST",
    body: { keep, merge: merges },
  });

/**
 * Today's work, queried from the database rather than filtered from the
 * capped record cache. `mine` includes the unclaimed queue; `team` covers
 * the branch for managers.
 */
export const fetchAttention = (scope: "mine" | "team" = "mine", branch?: string) =>
  apiRequest<AttentionDto>("/workspace/attention", {
    query: { scope, ...(branch && branch !== "All branches" ? { branch } : {}) },
  });

/** What a CSV import did, in plain numbers and per-row notes. */
export type ImportResultDto = {
  created: number;
  skipped: number;
  issues: Array<{ row: number; message: string }>;
  sample: Array<{ reference: string; name: string }>;
};

export const importRecordsCsv = (moduleId: string, csv: string) =>
  apiRequest<ImportResultDto>(`/workspace/${moduleId}/import`, {
    method: "POST",
    body: { csv },
  });

export const createRecord = (moduleId: string, body: unknown) =>
  apiRequest<RecordDto>(`/workspace/${moduleId}/records`, { method: "POST", body });

export const updateRecord = (
  moduleId: string,
  id: string,
  body: unknown,
  expectedUpdatedAt?: string,
) =>
  apiRequest<RecordDto>(`/workspace/${moduleId}/records/${id}`, {
    method: "PATCH",
    body: expectedUpdatedAt ? { ...(body as object), expectedUpdatedAt } : body,
  });

export const deleteRecord = (moduleId: string, id: string) =>
  apiRequest<{ deleted: boolean }>(`/workspace/${moduleId}/records/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

export async function fetchTasks(): Promise<TaskDto[]> {
  const page = await apiRequest<Page<TaskDto>>("/tasks", { query: { pageSize: 200 } });
  return page.items ?? [];
}

export const createTask = (body: unknown) =>
  apiRequest<TaskDto>("/tasks", { method: "POST", body });

export const updateTask = (id: string, body: unknown) =>
  apiRequest<TaskDto>(`/tasks/${id}`, { method: "PATCH", body });

export const deleteTask = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/tasks/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * Custom fields
 * ------------------------------------------------------------------ */

export const fetchCustomFields = () => apiRequest<CustomFieldDto[]>("/custom-fields");

export const createCustomField = (body: unknown) =>
  apiRequest<CustomFieldDto>("/custom-fields", { method: "POST", body });

export const deleteCustomField = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/custom-fields/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * Organisation, branches, members
 * ------------------------------------------------------------------ */

export const fetchOrganization = () => apiRequest<OrganizationDto>("/organizations/current");

export const patchOrganization = (body: unknown) =>
  apiRequest<OrganizationDto>("/organizations/current", { method: "PATCH", body });

export const fetchBranches = () => apiRequest<BranchDto[]>("/organizations/current/branches");

export const createBranch = (body: unknown) =>
  apiRequest<BranchDto>("/organizations/current/branches", { method: "POST", body });

export const deleteBranch = (id: string) =>
  apiRequest<{ deactivated: boolean }>(`/organizations/current/branches/${id}`, {
    method: "DELETE",
  });

export const fetchMembers = () => apiRequest<MemberDto[]>("/members");

export const createMember = (body: unknown) =>
  apiRequest<{ id: string; newUser?: boolean }>("/members", { method: "POST", body });

/** What happened to a departing teammate's unfinished work. */
export type HandoverSummary = { records: number; tasks: number; to: string | null };

export const updateMember = (id: string, body: unknown) =>
  apiRequest<{ handover?: HandoverSummary | null }>(`/members/${id}`, { method: "PATCH", body });

/**
 * Shares records nobody owns across the team, least-loaded person first.
 * `moduleId` defaults to enquiries — the queue that actually piles up.
 */
export const shareUnclaimedWork = (moduleId = "leads", limit = 100) =>
  apiRequest<{ assigned: number; byPerson: Array<{ name: string; count: number }> }>(
    "/members/workload/share",
    { method: "POST", body: { moduleId, limit } },
  );

/* ------------------------------------------------------------------ *
 * Audit trail
 * ------------------------------------------------------------------ */

export async function fetchAudit(): Promise<AuditDto[]> {
  const page = await apiRequest<Page<AuditDto>>("/audit", { query: { pageSize: 200 } });
  return page.items ?? [];
}
