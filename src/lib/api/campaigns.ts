/**
 * Campaigns — a message, an audience rule and its delivery record.
 */
import { apiRequest } from "./client";

export type CampaignDto = {
  id: string;
  name: string;
  channel: "email" | "whatsapp";
  subject: string;
  body: string;
  audienceModule: string;
  statuses: string[];
  status: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  lastSentAt: string | null;
  createdAt: string;
};

export type AudiencePreviewDto = {
  eligible: number;
  skippedNoAddress: number;
  skippedOptedOut: number;
  total: number;
  sample: Array<{ name: string; reference: string; address: string }>;
};

export type CampaignDeliveryDto = {
  id: string;
  to: string;
  channel: string;
  status: string;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type CampaignInput = {
  name: string;
  channel: "email" | "whatsapp";
  subject?: string;
  body: string;
  audienceModule: string;
  statuses: string[];
};

export const fetchCampaigns = () => apiRequest<CampaignDto[]>("/campaigns");

export const createCampaign = (body: CampaignInput) =>
  apiRequest<CampaignDto>("/campaigns", { method: "POST", body });

export const updateCampaign = (id: string, body: Partial<CampaignInput>) =>
  apiRequest<CampaignDto>(`/campaigns/${id}`, { method: "PATCH", body });

export const deleteCampaign = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/campaigns/${id}`, { method: "DELETE" });

export const fetchCampaignAudience = (id: string) =>
  apiRequest<AudiencePreviewDto>(`/campaigns/${id}/audience`);

export const sendCampaignNow = (id: string) =>
  apiRequest<{ status: string; queued: number }>(`/campaigns/${id}/send`, {
    method: "POST",
    body: {},
  });

export const fetchCampaignDeliveries = (id: string) =>
  apiRequest<CampaignDeliveryDto[]>(`/campaigns/${id}/deliveries`);
