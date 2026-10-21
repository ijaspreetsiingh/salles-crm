import { useCallback, useEffect, useState } from "react";

/* ==========================================================================
   Per-user interface preferences.

   Stored locally so the shell never waits on a round-trip, and mirrored to
   the server (Preference model) when a session is active.
   ========================================================================== */

const KEY = "traveldesk.prefs";

export type Prefs = {
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  sidebarCollapsed: boolean;
  defaultBranch: string;
  defaultLanding: string;
  favouriteModules: string[];
  recentModules: string[];
  tourCompleted: boolean;
};

const DEFAULTS: Prefs = {
  theme: "system",
  density: "comfortable",
  sidebarCollapsed: false,
  defaultBranch: "All branches",
  defaultLanding: "/",
  favouriteModules: ["leads", "bookings", "finance"],
  recentModules: [],
  tourCompleted: false,
};

let cache: Prefs | null = null;

const read = (): Prefs => {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    cache = DEFAULTS;
  }
  return cache;
};

const write = (next: Prefs) => {
  cache = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage disabled — preferences stay in memory for this session */
  }
};

const listeners = new Set<(prefs: Prefs) => void>();

export const prefs = {
  get: read,
  set(patch: Partial<Prefs>) {
    const next = { ...read(), ...patch };
    write(next);
    listeners.forEach((fn) => fn(next));
  },
  subscribe(fn: (prefs: Prefs) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Record a visit so the sidebar can show "Recent". */
  touch(moduleId: string) {
    const current = read();
    const recent = [moduleId, ...current.recentModules.filter((m) => m !== moduleId)].slice(0, 6);
    if (recent.join(",") === current.recentModules.join(",")) return;
    prefs.set({ recentModules: recent });
  },
};

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [state, setState] = useState<Prefs>(read);
  useEffect(() => {
    const off = prefs.subscribe(setState);
    const onStorage = () => setState(read());
    window.addEventListener("storage", onStorage);
    return () => {
      off();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => prefs.set(patch), []);
  return [state, update];
}

/** Applies the density preference to the document root. */
export function useDensity(density: Prefs["density"]) {
  useEffect(() => {
    document.documentElement.dataset["density"] = density;
  }, [density]);
}
