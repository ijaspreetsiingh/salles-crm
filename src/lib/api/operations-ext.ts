/** Operations — manifests, incidents, deadlines. */
import { apiRequest } from "./client";

export type Manifest = {
  tripId: string; tripReference: string; tripName: string;
  destination: string; departureDate: string;
  passengerCount: number; passengers: Array<Record<string, unknown>>;
};

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

export const fetchManifest = (tripId: string) =>
  apiRequest<Manifest>(`/operations-ext/manifests/${tripId}`);

export const getManifestPrintUrl = (tripId: string) =>
  `/api/v1/operations-ext/manifests/${tripId}/print`;

export const fetchIncidents = (severity?: string, status?: string) =>
  apiRequest<Incident[]>("/operations-ext/incidents", { query: { severity, status } });
export const createIncident = (body: Record<string, unknown>) =>
  apiRequest("/operations-ext/incidents", { method: "POST", body });
export const updateIncident = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/operations-ext/incidents/${id}`, { method: "PATCH", body });

export const fetchDeadlines = (days?: number) =>
  apiRequest<{ total: number; deadlines: Deadline[] }>("/operations-ext/deadlines", { query: { days } });
