import {
  BadgeIndianRupee,
  BarChart3,
  Building2,
  FileSpreadsheet,
  Globe,
  Handshake,
  Hotel,
  KanbanSquare,
  LifeBuoy,
  MessageCircle,
  Package,
  Plane,
  Plug,
  Route,
  Settings2,
  Sparkles,
  Ticket,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { modules, type Module } from "./catalog";
import { plain } from "./language";

/* ==========================================================================
   Navigation model — Travo CRM inspired.

   Core modules (CORE_MODULE_IDS): hamesha sidebar mein dikhte hain.
   Extra modules (EXTRA_MODULE_IDS): "More" popup ke under, user add kar sakta hai.
   ========================================================================== */

export type NavEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Two-key shortcut: "g" then this. */
  go: string;
};

export type NavGroup = {
  id: string;
  label: string;
  entries: NavEntry[];
};

export const ICONS: Record<string, LucideIcon> = {
  leads: UserPlus,
  customers: Users,
  quotations: FileSpreadsheet,
  companies: Building2,
  inbox: MessageCircle,
  campaigns: TrendingUp,
  bookings: Ticket,
  flights: Plane,
  hotels: Hotel,
  packages: Package,
  transfers: Truck,
  visa: BadgeIndianRupee,
  groups: Users,
  operations: Route,
  suppliers: Handshake,
  support: LifeBuoy,
  agents: Handshake,
  finance: Wallet,
  assistant: Sparkles,
  automation: Workflow,
  reports: BarChart3,
  distribution: Globe,
  integrations: Plug,
  settings: Settings2,
};

const GOTO: Record<string, string> = {
  leads: "l",
  customers: "c",
  quotations: "q",
  companies: "co",
  inbox: "i",
  campaigns: "m",
  bookings: "b",
  flights: "f",
  hotels: "h",
  packages: "p",
  transfers: "t",
  visa: "v",
  groups: "g",
  operations: "o",
  suppliers: "s",
  support: "h",
  agents: "a",
  finance: "F",
  assistant: "A",
  automation: "w",
  reports: "r",
  distribution: "d",
  integrations: "n",
  settings: "S",
};

/**
 * Core modules — Travo CRM ke sabse zaroori features.
 * Ye HAMESHA sidebar mein dikhte hain, user inhe hatata nahi hai.
 */
export const CORE_MODULE_IDS: string[] = [
  "leads",
  "customers",
  "quotations",
  "bookings",
  "finance",
];

/**
 * Extra modules — "More" popup ke under.
 * User click karke inhe sidebar mein add kar sakta hai.
 */
export const EXTRA_MODULE_IDS: string[] = [
  "tasks",
  "team",
  "companies",
  "inbox",
  "campaigns",
  "flights",
  "hotels",
  "packages",
  "transfers",
  "visa",
  "groups",
  "operations",
  "suppliers",
  "support",
  "agents",
  "assistant",
  "automation",
  "reports",
  "distribution",
  "integrations",
  "settings",
];

/**
 * Sidebar groups in the order a travel agency actually works:
 * Selling, Trips, Money, More (extra).
 */
const ORDER: string[][] = [
  ["leads", "customers", "quotations", "bookings"],
  ["finance"],
];

const GROUP_LABELS: Record<string, string> = {
  leads: "Selling",
  bookings: "Trips",
  finance: "Money",
  default: "More",
};

/**
 * Build sidebar groups from the modules that are currently enabled.
 * Core modules ALWAYS show. Extra modules show only if enabled.
 */
export function buildNavGroups(enabledModuleIds: string[]): NavGroup[] {
  const enabledSet = new Set(enabledModuleIds);

  // Core modules ALWAYS show — force them regardless of enabledSet
  const coreModules = CORE_MODULE_IDS.filter((id) =>
    modules.find((m) => m.id === id),
  );
  const extraModules = EXTRA_MODULE_IDS.filter((id) =>
    enabledSet.has(id) && modules.find((m) => m.id === id),
  );

  const groups: NavGroup[] = ORDER.map((ids) => {
    const entries = ids
      .map((id) => {
        const m = modules.find((mm) => mm.id === id);
        // Core modules always show; extra modules only if enabled
        const isCore = CORE_MODULE_IDS.includes(id);
        const isEnabled = enabledSet.has(id);
        if (!m || (!isCore && !isEnabled)) return null;
        return {
          id: m.id,
          label: plain(m.name),
          icon: ICONS[m.id] ?? KanbanSquare,
          go: GOTO[m.id] ?? m.id.charAt(0),
        };
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    return {
      id: ids[0] ?? "",
      label: GROUP_LABELS[ids[0] ?? ""] ?? "More",
      entries,
    };
  });

  // Add remaining enabled extra modules that didn't fit in ORDER groups
  const usedIds = new Set(ORDER.flat());
  const remaining = extraModules.filter((id) => !usedIds.has(id));
  if (remaining.length > 0) {
    groups.push({
      id: "extra-core",
      label: "More",
      entries: remaining
        .map((id) => {
          const m = modules.find((mm) => mm.id === id);
          if (!m) return null;
          return {
            id: m.id,
            label: plain(m.name),
            icon: ICONS[m.id] ?? KanbanSquare,
            go: GOTO[m.id] ?? m.id.charAt(0),
          };
        })
        .filter((e): e is NonNullable<typeof e> => Boolean(e)),
    });
  }

  return groups.filter((g) => g.entries.length > 0);
}

/** Flat list of every enabled module, in sidebar order — used by the palette. */
export function buildNavEntries(enabledModuleIds: string[]): NavEntry[] {
  return buildNavGroups(enabledModuleIds).flatMap((g) => g.entries);
}

/** "g" then <key> to module id. */
export function buildGoShortcuts(enabledModuleIds: string[]): Record<string, string> {
  return Object.fromEntries(buildNavEntries(enabledModuleIds).map((e) => [e.go, e.id]));
}

/** Icon lookup for any module id. */
export const iconFor = (id: string): LucideIcon => ICONS[id] ?? KanbanSquare;

/** Default enabled modules — core only on first install. */
export const DEFAULT_ENABLED_MODULES: string[] = [
  "leads",
  "customers",
  "quotations",
  "bookings",
  "finance",
];
