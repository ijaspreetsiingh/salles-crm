/**
 * Frontend API client — Favorites (starred records + modules).
 */
import { apiRequest } from "./client";

export type Favorite = {
  id: string;
  targetType: "record" | "module";
  targetId: string;
  record: {
    id: string;
    reference: string;
    name: string;
    moduleId: string;
    status: string;
  } | null;
  createdAt: string;
};

/** Lists all favorites for the current user. */
export async function fetchFavorites(): Promise<Favorite[]> {
  return apiRequest("/favorites");
}

/** Checks if a specific record or module is starred. */
export async function checkFavorite(
  targetType: "record" | "module",
  targetId: string,
): Promise<{ starred: boolean; id: string | null }> {
  return apiRequest("/favorites/check", { query: { targetType, targetId } });
}

/** Stars a record or module. Idempotent — returns existing if already starred. */
export async function addFavorite(
  targetType: "record" | "module",
  targetId: string,
): Promise<{ id: string; created: boolean }> {
  return apiRequest("/favorites", { method: "POST", body: { targetType, targetId } });
}

/** Removes a favorite by id. */
export async function removeFavorite(id: string): Promise<{ deleted: boolean }> {
  return apiRequest(`/favorites/${id}`, { method: "DELETE" });
}

/** Removes a favorite by target (simpler for the star-toggle). */
export async function removeFavoriteByTarget(
  targetType: "record" | "module",
  targetId: string,
): Promise<{ deleted: boolean }> {
  return apiRequest(`/favorites/target/${targetType}/${targetId}`, { method: "DELETE" });
}
