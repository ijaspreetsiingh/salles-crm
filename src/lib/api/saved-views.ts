/**
 * Frontend API client — Saved Views.
 *
 * Persistent filter+sort+column configs per module per user.
 */
import { apiRequest } from "./client";

export type SavedView = {
  id: string;
  moduleId: string;
  title: string;
  filters: Record<string, unknown>;
  sort: Record<string, unknown>;
  columns: string[];
  layout: "table" | "board" | "cards";
  isDefault: boolean;
  isShared: boolean;
  isOwn: boolean;
  createdAt: string;
};

export type SavedViewInput = {
  moduleId: string;
  title: string;
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  columns?: string[];
  layout?: "table" | "board" | "cards";
  isDefault?: boolean;
  isShared?: boolean;
};

/** Lists all saved views visible to the current user, optionally for one module. */
export async function fetchSavedViews(moduleId?: string): Promise<SavedView[]> {
  return apiRequest("/saved-views", { query: { moduleId } });
}

/** Creates a new saved view. */
export async function createSavedView(input: SavedViewInput): Promise<SavedView> {
  return apiRequest("/saved-views", { method: "POST", body: input });
}

/** Updates an existing saved view (owner only). */
export async function updateSavedView(
  id: string,
  patch: Partial<SavedViewInput>,
): Promise<{ id: string; updated: boolean }> {
  return apiRequest(`/saved-views/${id}`, { method: "PATCH", body: patch });
}

/** Deletes a saved view (owner only). */
export async function deleteSavedView(id: string): Promise<{ deleted: boolean }> {
  return apiRequest(`/saved-views/${id}`, { method: "DELETE" });
}
