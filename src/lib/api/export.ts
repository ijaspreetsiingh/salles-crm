/**
 * Frontend API client — Data Export / Portability (DPDP Act compliance).
 */
import { apiRequest, API_BASE_URL, tokenStore } from "./client";

export type ExportStatus = {
  organization: number;
  records: number;
  customers: number;
  tasks: number;
  conversations: number;
  payments: number;
  auditLogs: number;
  estimatedRows: number;
};

/** Returns row counts for the full data export. */
export async function fetchExportStatus(): Promise<ExportStatus> {
  return apiRequest("/export/status");
}

/**
 * Downloads the full organisation data as a JSON file.
 * Streams directly as a file download.
 */
export async function downloadDataExport(): Promise<void> {
  const url = `${API_BASE_URL}/export/download`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = tokenStore.access;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "GET", headers, credentials: "include" });
  if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);

  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `traveldesk-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

/** Returns all data held for one customer email (subject access request). */
export async function fetchCustomerExport(email: string): Promise<unknown> {
  return apiRequest("/export/customer", { query: { email } });
}
