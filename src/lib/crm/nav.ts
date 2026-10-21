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
   Navigation model.

   The sidebar tree is the primary way around the app. Every module is
   reachable in one click, and every module also has a two-key shortcut
   (press "g", then the letter).
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

const ICONS: Record<string, LucideIcon> = {
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
 * Five short groups, in the order a travel agency actually works:
 * selling, trips, working, money, tools. Settings lives in the footer.
 */
const ORDER: string[][] = [
  ["leads", "customers", "quotations", "companies", "inbox", "campaigns"],
  ["bookings", "flights", "hotels", "packages", "transfers", "visa", "groups"],
  ["operations", "suppliers", "support", "agents"],
  ["finance"],
  ["assistant", "automation", "reports", "distribution", "integrations"],
];

/**
 * The sidebar is grouped by what the person is trying to do, not by which
 * database table the record lives in. Five short groups beat nine long
 * ones.
 */
const GROUP_LABELS: Record<string, string> = {
  leads: "Selling",
  bookings: "Trips",
  operations: "Working",
  finance: "Money",
  assistant: "Tools",
};

export const navGroups: NavGroup[] = ORDER.map((ids) => {
  const entries = ids
    .map((id) => modules.find((m) => m.id === id))
    .filter((m): m is Module => Boolean(m))
    .map((m) => ({
      id: m.id,
      // The sidebar always speaks plain language.
      label: plain(m.name),
      icon: ICONS[m.id] ?? KanbanSquare,
      go: GOTO[m.id] ?? m.id.charAt(0),
    }));
  return {
    id: ids[0] ?? "",
    label: GROUP_LABELS[ids[0] ?? ""] ?? "More",
    entries,
  };
});

/** Flat list of every module, in sidebar order — used by the palette. */
export const navEntries: NavEntry[] = navGroups.flatMap((g) => g.entries);

/** "g" then <key> to module id. */
export const goShortcuts: Record<string, string> = Object.fromEntries(
  navEntries.map((e) => [e.go, e.id]),
);

/** Icon lookup for any module id. */
export const iconFor = (id: string): LucideIcon => ICONS[id] ?? KanbanSquare;
