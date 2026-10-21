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
};

export type SessionDto = {
  accessToken: string;
  refreshToken: string;
  user: SessionUserDto;
  membership: { organizationId: string; roleKey: string; branchId: string | null };
  organization?: OrganizationDto;
};

export type MeDto = {
  user: SessionUserDto & { lastLoginAt?: string | null };
  organization: OrganizationDto;
  membership: { roleKey: string; branchId: string | null };
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
  status: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  extra: Record<string, unknown>;
};

export type TaskDto = {
  id: string;
  title: string;
  type: string;
  owner: string;
  date: string;
  priority: string;
  done: boolean;
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
  roleKey: string;
  roleName: string;
  branch: string | null;
  branchId: string | null;
  active: boolean;
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
    status: dto.status ?? "",
    email: dto.email ?? "",
    phone: dto.phone ?? "",
    source: dto.source ?? "",
    notes: dto.notes ?? "",
  };
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
    status: row.status ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    source: row.source ?? "",
    notes: row.notes ?? "",
    extra: row.extra ?? {},
  };
}

export function toTask(dto: TaskDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    type: dto.type,
    owner: dto.owner ?? "",
    date: dto.date,
    priority: dto.priority,
    done: Boolean(dto.done),
  };
}

const fieldType = (type: string): CustomField["type"] =>
  type === "number" ? "number" : type === "date" ? "date" : type === "select" ? "select" : "text";

export function toCustomField(dto: CustomFieldDto): CustomField {
  return { id: dto.id, label: dto.label, type: fieldType(dto.type) };
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export const login = (email: string, password: string) =>
  apiRequest<SessionDto>("/auth/login", { method: "POST", body: { email, password }, auth: false });

export const logout = () =>
  apiRequest<{ loggedOut: boolean }>("/auth/logout", { method: "POST", body: {} }).catch(() => ({
    loggedOut: true,
  }));

export const fetchMe = () => apiRequest<MeDto>("/auth/me");

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
 */
export async function fetchAllRecords(): Promise<Record<string, RecordDto[]>> {
  return apiRequest<Record<string, RecordDto[]>>("/workspace/all-records");
}

export const createRecord = (moduleId: string, body: unknown) =>
  apiRequest<RecordDto>(`/workspace/${moduleId}/records`, { method: "POST", body });

export const updateRecord = (moduleId: string, id: string, body: unknown) =>
  apiRequest<RecordDto>(`/workspace/${moduleId}/records/${id}`, { method: "PATCH", body });

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
  apiRequest<{ id: string }>("/members", { method: "POST", body });

export const updateMember = (id: string, body: unknown) =>
  apiRequest<unknown>(`/members/${id}`, { method: "PATCH", body });

/* ------------------------------------------------------------------ *
 * Audit trail
 * ------------------------------------------------------------------ */

export async function fetchAudit(): Promise<AuditDto[]> {
  const page = await apiRequest<Page<AuditDto>>("/audit", { query: { pageSize: 200 } });
  return page.items ?? [];
}
