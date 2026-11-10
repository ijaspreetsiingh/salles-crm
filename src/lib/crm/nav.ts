import {
  BadgeIndianRupee,
  BarChart3,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  Globe,
  Handshake,
  Home,
  Hotel,
  KanbanSquare,
  LifeBuoy,
  MessageCircle,
  MessageSquare,
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
   Navigation model

   Two ideas, and nothing else:

   1. The core of a CRM is fixed. Enquiries, customers, quotes, bookings,
      money, tasks, conversations, reports and the team are always in the
      sidebar, in the order the work happens. A person never has to "add"
      them, and a new joiner cannot accidentally hide them.

   2. Everything a travel agency *might* need — hotels, visas, groups,
      agents, automation, integrations — lives behind "Add more". Adding one
      puts it in the sidebar permanently; removing it puts it back.

   `tasks` and `team` are screens, not workspace modules, so they carry their
   own route instead of a module id. That used to be a bug: they were listed
   as addable modules but no module existed, so the toggle did nothing.
   ========================================================================== */

export type NavEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Two-key shortcut: "g" then this. */
  go: string;
  /** Where it goes. Module screens use `/workspace/<id>`; standalone pages set this. */
  to?: string;
  /** Module id to highlight when this entry is the current page. */
  moduleId: string;
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
  "team-chat": MessageSquare,
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
  "team-chat": "C",
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
  support: "u",
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
 * The fixed part of the sidebar, in working order.
 *
 * "Today" is the home page; the rest follow the life of a trip — an enquiry,
 * the customer, the quote, the booking, the money, the follow-up, the
 * conversation, the numbers, the people.
 */
export const CORE_LINKS: NavGroup[] = [
  {
    id: "start",
    label: "Start here",
    entries: [{ id: "today", moduleId: "today", label: "Today", icon: Home, go: "T", to: "/" }],
  },
  {
    id: "selling",
    label: "Selling",
    entries: [
      {
        id: "leads",
        moduleId: "leads",
        label: "Enquiries",
        icon: UserPlus,
        go: "l",
      },
      {
        id: "customers",
        moduleId: "customers",
        label: "Customers",
        icon: Users,
        go: "c",
      },
      {
        id: "packages",
        moduleId: "packages",
        label: "Packages",
        icon: Package,
        go: "p",
      },
      {
        id: "quotations",
        moduleId: "quotations",
        label: "Quotes",
        icon: FileSpreadsheet,
        go: "q",
      },
    ],
  },
  {
    id: "trips",
    label: "Trips",
    entries: [{ id: "bookings", moduleId: "bookings", label: "Bookings", icon: Ticket, go: "b" }],
  },
  {
    id: "money",
    label: "Money",
    entries: [
      { id: "finance", moduleId: "finance", label: "Invoices & money", icon: Wallet, go: "F" },
    ],
  },
  {
    id: "working",
    label: "Working",
    entries: [
      {
        id: "tasks",
        moduleId: "tasks",
        label: "Tasks",
        icon: CalendarDays,
        go: "t",
        to: "/tasks",
      },
      {
        id: "inbox",
        moduleId: "inbox",
        label: "Conversations",
        icon: MessageCircle,
        go: "i",
      },
      {
        id: "team-chat",
        moduleId: "team-chat",
        label: "Team chat",
        icon: MessageSquare,
        go: "C",
      },
      {
        id: "reports",
        moduleId: "reports",
        label: "Reports",
        icon: BarChart3,
        go: "r",
      },
      {
        id: "team",
        moduleId: "team",
        label: "Your team",
        icon: Users,
        go: "e",
        to: "/team",
      },
    ],
  },
];

/** Every core module id — the workspace should never hide these. */
export const CORE_MODULE_IDS: string[] = [
  "leads",
  "customers",
  "packages",
  "quotations",
  "bookings",
  "finance",
  "inbox",
  "team-chat",
  "reports",
];

/**
 * Extra modules — offered under "Add more", never forced on anyone.
 * These are real workspace modules (`modules` catalogue), so enabling one
 * always produces a working screen.
 */
export const EXTRA_MODULE_IDS: string[] = [
  "companies",
  "campaigns",
  "flights",
  "hotels",
  "transfers",
  "visa",
  "groups",
  "operations",
  "suppliers",
  "support",
  "agents",
  "assistant",
  "automation",
  "distribution",
  "integrations",
  "settings",
  "team-chat",
];

/** Plain-language note shown next to an extra module in the Add more list. */
export const EXTRA_HINTS: Record<string, string> = {
  companies: "Corporate accounts, travel policies and cost centres",
  campaigns: "Email and WhatsApp campaigns with a delivery log",
  flights: "Live fare search, PNR queue, reissues and refunds",
  hotels: "Live hotel search, room inventory, rate plans and vouchers",
  transfers: "Airport pickups and ground transport",
  visa: "Applications, checklists and document reminders",
  groups: "Group trips, delegates, room blocks and budgets",
  operations: "Departures, manifests and day-of-travel work",
  suppliers: "Supplier contracts, allotments and purchase orders",
  support: "Complaints and after-trip service",
  agents: "B2B agents, credit limits and commissions",
  assistant: "Ask questions about your own workspace",
  automation: "Workflows that run without anyone remembering",
  distribution: "Website pages and the lead-capture form",
  integrations: "WhatsApp, email, payments, webhooks",
  "team-chat": "Internal Slack-style chat — channels, DMs, emoji reactions",
  settings: "Company, branches, roles, tax, recycle bin",
};

/** Sidebar highlight key for a path. Standalone screens map to themselves. */
export function activeKeyFor(path: string, moduleId: string | null): string | null {
  if (path === "/tasks") return "tasks";
  if (path === "/team") return "team";
  if (path === "/insights") return "reports";
  if (path === "/") return "today";
  return moduleId;
}

/**
 * Build the sidebar: the fixed core first, then whatever extras the person
 * has added. `enabledModuleIds` only ever affects the extras group.
 */
export function buildSidebarGroups(
  enabledModuleIds: string[],
  /** The caller's role: `"*"` for full access, else the module ids it may open. */
  allowedModules: string[] | "*" = "*",
): NavGroup[] {
  const enabledSet = new Set(enabledModuleIds);
  const canOpen = (moduleId: string) =>
    allowedModules === "*" ||
    // Screens that are not catalogue modules (Today, Tasks, Your team) are
    // never role-gated, so they must not disappear from the sidebar.
    !modules.some((m) => m.id === moduleId) ||
    allowedModules.includes(moduleId);
  const extras: NavEntry[] = EXTRA_MODULE_IDS.filter((id) => enabledSet.has(id))
    .map((id) => {
      const meta = modules.find((m) => m.id === id);
      if (!meta) return null;
      return {
        id,
        moduleId: id,
        label: plain(meta.name),
        icon: ICONS[id] ?? KanbanSquare,
        go: GOTO[id] ?? id.charAt(0),
      } satisfies NavEntry;
    })
    .filter((entry): entry is NavEntry => Boolean(entry));

  const core = CORE_LINKS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => canOpen(entry.moduleId)),
  })).filter((group) => group.entries.length > 0);

  return extras.length > 0
    ? [...core, { id: "extras", label: "Added by you", entries: extras }]
    : core;
}

/** Flat list of every destination, in sidebar order — used by the palette. */
export function buildNavEntries(
  enabledModuleIds: string[],
  allowedModules: string[] | "*" = "*",
): NavEntry[] {
  return buildSidebarGroups(enabledModuleIds, allowedModules).flatMap((g) => g.entries);
}

/** "g" then <key> to a destination. */
export function buildGoShortcuts(
  enabledModuleIds: string[],
  allowedModules: string[] | "*" = "*",
): Record<string, string> {
  return Object.fromEntries(
    buildNavEntries(enabledModuleIds, allowedModules).map((e) => [
      e.go,
      e.to ?? `/workspace/${e.moduleId}`,
    ]),
  );
}

/** Icon lookup for any module id. */
export const iconFor = (id: string): LucideIcon => ICONS[id] ?? KanbanSquare;

/** Modules a workspace starts with: the core, nothing else. */
export const DEFAULT_ENABLED_MODULES: string[] = [...CORE_MODULE_IDS];

/** Backwards-compatible alias used by older call sites. */
export const buildNavGroups = buildSidebarGroups;

export type { Module };
