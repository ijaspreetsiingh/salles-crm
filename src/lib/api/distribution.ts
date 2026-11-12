/** Distribution — public catalogue, CMS pages, destinations, B2B portal. */
import { apiRequest } from "./client";

export type CatalogueItem = {
  id: string; reference: string; title: string; summary: string;
  destination: string; price: number; currency: string;
  nights: number | null; imageUrl: string | null; highlights: string[];
};

export type CmsPage = {
  id: string; title: string; slug: string; pageType: string;
  metaTitle: string; metaDescription: string; status: string; updatedAt: string;
};

export const fetchCatalogue = (orgSlug: string, opts?: { destination?: string; q?: string }) =>
  apiRequest<{ organization: string; total: number; items: CatalogueItem[] }>(
    "/distribution/catalogue", { query: { org: orgSlug, ...opts } }
  );

export const fetchCatalogueItem = (id: string) =>
  apiRequest<Record<string, unknown>>(`/distribution/catalogue/${id}`);

export const submitEnquiry = (body: Record<string, unknown>) =>
  apiRequest<{ received: boolean; reference?: string }>("/distribution/enquiry", { method: "POST", body });

export const fetchPages = () => apiRequest<CmsPage[]>("/distribution/pages");
export const createPage = (body: Record<string, unknown>) =>
  apiRequest("/distribution/pages", { method: "POST", body });
export const updatePage = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/distribution/pages/${id}`, { method: "PATCH", body });
export const deletePage = (id: string) =>
  apiRequest(`/distribution/pages/${id}`, { method: "DELETE" });

export const fetchDestinations = () => apiRequest<Record<string, unknown>[]>("/distribution/destinations");
export const createDestination = (body: Record<string, unknown>) =>
  apiRequest("/distribution/destinations", { method: "POST", body });
export const updateDestination = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/distribution/destinations/${id}`, { method: "PATCH", body });

export const fetchB2BStats = () =>
  apiRequest<{ confirmedBookings: number; totalRevenue: number }>("/distribution/b2b-portal/stats");
