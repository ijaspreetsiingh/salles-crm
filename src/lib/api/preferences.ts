/**
 * Frontend API client — Server-side user preferences.
 *
 * Syncs UI settings (theme, density, language, landing module) to the server
 * so they're consistent across devices.
 */
import { apiRequest } from "./client";

export type PreferenceKey =
  | "theme"
  | "density"
  | "sidebarPinned"
  | "landingModule"
  | "language"
  | "notifyDigest"
  | "recordsPerPage";

export type UserPreferences = Partial<Record<PreferenceKey, string>>;

/** Loads all preferences for the current user. */
export async function fetchPreferences(): Promise<UserPreferences> {
  const result = await apiRequest<{ prefs: Record<string, string> }>("/preferences");
  return result.prefs as UserPreferences;
}

/** Sets a single preference value on the server. */
export async function setPreference(
  key: PreferenceKey,
  value: string,
): Promise<{ key: string; value: string }> {
  return apiRequest(`/preferences/${key}`, { method: "PUT", body: { value } });
}

/** Sets multiple preferences in a single request. */
export async function setPreferences(
  prefs: Partial<Record<PreferenceKey, string>>,
): Promise<{ saved: number }> {
  return apiRequest("/preferences", {
    method: "PUT",
    body: { prefs: Object.entries(prefs).map(([key, value]) => ({ key, value })) },
  });
}
