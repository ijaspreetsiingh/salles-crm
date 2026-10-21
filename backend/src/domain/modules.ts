// The workspace catalogue. This mirrors the frontend `src/lib/crm/catalog.ts`
// one-to-one so the API and UI speak the exact same module ids, tabs and nouns.

export type ModuleId =
  | "leads"
  | "customers"
  | "quotations"
  | "companies"
  | "inbox"
  | "campaigns"
  | "bookings"
  | "flights"
  | "hotels"
  | "packages"
  | "transfers"
  | "visa"
  | "groups"
  | "operations"
  | "suppliers"
  | "support"
  | "agents"
  | "finance"
  | "assistant"
  | "automation"
  | "reports"
  | "distribution"
  | "integrations"
  | "settings";

export type ModuleDef = {
  id: ModuleId;
  name: string;
  group: string;
  tabs: string[];
  description: string;
  noun: string;
  /** Modules that render a bespoke workspace instead of the generic record table. */
  special?:
    | "assistant"
    | "inbox"
    | "reports"
    | "integrations"
    | "automation"
    | "settings"
    | "flights"
    | "itinerary";
  /** Default statuses used when seeding and when a module has no status map. */
  statuses: string[];
  /** Reference prefix used for human-friendly record ids (LD-2401). */
  prefix: string;
};

export const MODULES: ModuleDef[] = [
  {
    id: "leads",
    name: "Leads & enquiries",
    group: "Sales & CRM",
    tabs: ["All leads", "Sales pipeline", "Follow-ups", "Lead sources"],
    description: "Every enquiry, from first hello to a confirmed journey.",
    noun: "lead",
    statuses: ["New", "Contacted", "Qualified", "Quoted", "Won", "Lost"],
    prefix: "LD",
  },
  {
    id: "customers",
    name: "Customers",
    group: "Sales & CRM",
    tabs: ["Customers", "Traveller profiles", "Loyalty", "Documents"],
    description: "Relationships, travel history and the details that matter.",
    noun: "customer",
    statuses: ["Active", "Pending", "Confirmed"],
    prefix: "CUS",
  },
  {
    id: "quotations",
    name: "Quotations",
    group: "Sales & CRM",
    tabs: ["All quotations", "Itinerary builder", "Templates", "Approvals"],
    description: "Thoughtful itineraries. Clear pricing. Faster decisions.",
    noun: "quotation",
    statuses: ["Sent", "Draft", "Accepted", "Expired"],
    prefix: "QT",
  },
  {
    id: "companies",
    name: "Companies & corporate",
    group: "Sales & CRM",
    tabs: ["Companies", "Travel requests", "Policies", "Cost centres", "Approvals"],
    description: "Manage corporate relationships and business travel.",
    noun: "company",
    statuses: ["Active", "Pending", "Confirmed"],
    prefix: "COM",
  },
  {
    id: "inbox",
    name: "Communications",
    group: "Sales & CRM",
    tabs: ["Shared inbox", "WhatsApp", "Email", "Call logs", "Templates", "Consent"],
    description: "Keep every conversation connected to the customer.",
    noun: "conversation",
    special: "inbox",
    statuses: ["Open", "In progress", "Resolved", "Escalated"],
    prefix: "CNV",
  },
  {
    id: "campaigns",
    name: "Marketing",
    group: "Sales & CRM",
    tabs: ["Campaigns", "Segments", "Referrals & coupons", "Attribution"],
    description: "Turn the right audience into your next travellers.",
    noun: "campaign",
    statuses: ["Active", "Paused", "Draft"],
    prefix: "CAM",
  },
  {
    id: "bookings",
    name: "Bookings",
    group: "Bookings & trips",
    tabs: ["All bookings", "Reservations", "Amendments", "Cancellations", "Refunds"],
    description: "One booking. Every service. Nothing left behind.",
    noun: "booking",
    statuses: ["Confirmed", "Pending", "On hold", "Cancelled"],
    prefix: "BK",
  },
  {
    id: "flights",
    name: "Flights & ticketing",
    group: "Bookings & trips",
    tabs: ["Flight search", "PNR queue", "Tickets", "Ancillaries", "Reissues & refunds"],
    description: "Manage air reservations, ticketing queues and deadlines.",
    noun: "reservation",
    statuses: ["Confirmed", "Pending", "On hold", "Cancelled"],
    prefix: "FLT",
  },
  {
    id: "hotels",
    name: "Hotels & stays",
    group: "Bookings & trips",
    tabs: ["Hotels", "Room inventory", "Rate plans", "Vouchers"],
    description: "Room availability, contracts and every guest confirmation.",
    noun: "hotel",
    statuses: ["Active", "Pending", "Confirmed"],
    prefix: "HTL",
  },
  {
    id: "packages",
    name: "Packages & activities",
    group: "Bookings & trips",
    tabs: ["Tour packages", "Activities", "Fixed departures", "Seasonal rates"],
    description: "Curate memorable journeys and bookable experiences.",
    noun: "package",
    statuses: ["Active", "Pending", "Confirmed"],
    prefix: "PKG",
  },
  {
    id: "transfers",
    name: "Ground transport",
    group: "Bookings & trips",
    tabs: ["Transfers", "Vehicles", "Drivers", "Rail, bus & cruise"],
    description: "Coordinate every pickup, connection and arrival.",
    noun: "transfer",
    statuses: ["Confirmed", "Pending", "In progress"],
    prefix: "TRF",
  },
  {
    id: "visa",
    name: "Visa & insurance",
    group: "Bookings & trips",
    tabs: ["Applications", "Document checklists", "Appointments", "Insurance", "Travel advisories"],
    description: "Travel documents and protection, tracked end to end.",
    noun: "application",
    statuses: ["In review", "Documents pending", "Approved", "Submitted"],
    prefix: "VIS",
  },
  {
    id: "groups",
    name: "Groups & MICE",
    group: "Bookings & trips",
    tabs: ["Group trips", "Delegates", "Room blocks", "Budgets", "Suppliers"],
    description: "Seamless coordination for groups, conferences and events.",
    noun: "group",
    statuses: ["Confirmed", "Pending", "In progress"],
    prefix: "GRP",
  },
  {
    id: "operations",
    name: "Trip operations",
    group: "Operations",
    tabs: ["Departures", "Manifests", "Daily operations", "Vouchers", "Incidents", "Deadlines"],
    description: "Give every departure the attention it deserves.",
    noun: "trip",
    statuses: ["Confirmed", "Pending", "In progress"],
    prefix: "OPS",
  },
  {
    id: "suppliers",
    name: "Suppliers & contracts",
    group: "Operations",
    tabs: ["Suppliers", "Contracts", "Allotments", "Purchase orders", "Settlements"],
    description: "Your partner network, rates and commitments in one place.",
    noun: "supplier",
    statuses: ["Active", "Pending", "Confirmed"],
    prefix: "SUP",
  },
  {
    id: "support",
    name: "Support & complaints",
    group: "Operations",
    tabs: ["Support tickets", "Refund requests", "Escalations", "Feedback", "Knowledge base"],
    description: "Resolve issues with clarity, care and accountability.",
    noun: "ticket",
    statuses: ["Open", "In progress", "Resolved", "Escalated"],
    prefix: "TKT",
  },
  {
    id: "agents",
    name: "B2B agent network",
    group: "B2B network",
    tabs: [
      "Agents",
      "Sub-agents",
      "Distributors",
      "KYC approvals",
      "Credit limits",
      "Commissions",
      "Agent portal",
    ],
    description: "Grow your distribution network with confidence.",
    noun: "agent",
    statuses: ["Active", "KYC pending", "Active"],
    prefix: "AGN",
  },
  {
    id: "finance",
    name: "Finance & accounting",
    group: "Finance",
    tabs: [
      "Invoices",
      "Payments",
      "Receivables",
      "Payables",
      "Ledger",
      "Expenses",
      "Tax & GST",
      "Reconciliation",
      "Profitability",
    ],
    description: "A clear view of your cash flow and every booking's margin.",
    noun: "invoice",
    statuses: ["Paid", "Overdue", "Pending", "Partially paid"],
    prefix: "INV",
  },
  {
    id: "assistant",
    name: "AI assistant",
    group: "AI & automation",
    tabs: ["Assistant", "Itinerary generator", "Sales intelligence", "Operations insights"],
    description: "A thoughtful co-pilot for your travel team.",
    noun: "draft",
    special: "assistant",
    statuses: ["Draft", "Ready"],
    prefix: "AI",
  },
  {
    id: "automation",
    name: "Workflow automation",
    group: "AI & automation",
    tabs: ["Workflows", "Automated alerts", "Execution history", "Approvals"],
    description: "Less repetitive work. More time for your customers.",
    noun: "workflow",
    special: "automation",
    statuses: ["Active", "Paused"],
    prefix: "WFL",
  },
  {
    id: "reports",
    name: "Reports & analytics",
    group: "Reports & analytics",
    tabs: [
      "Sales",
      "Bookings",
      "Operations",
      "Finance",
      "B2B",
      "Marketing",
      "Team performance",
      "Saved reports",
    ],
    description: "Turn your business activity into better decisions.",
    noun: "report",
    special: "reports",
    statuses: ["Ready"],
    prefix: "RPT",
  },
  {
    id: "distribution",
    name: "Website & distribution",
    group: "Website & distribution",
    tabs: [
      "Website pages",
      "Destinations",
      "Product catalogue",
      "B2C portal",
      "B2B portal",
      "Content & SEO",
    ],
    description: "Manage your storefront, catalogue and distribution channels.",
    noun: "page",
    statuses: ["Published", "Draft"],
    prefix: "WEB",
  },
  {
    id: "integrations",
    name: "Integrations",
    group: "Website & distribution",
    tabs: ["Supplier connections", "Business apps", "API & webhooks", "Connection logs"],
    description: "Manage travel suppliers and business connections.",
    noun: "connection",
    special: "integrations",
    statuses: ["Not connected"],
    prefix: "INT",
  },
  {
    id: "settings",
    name: "Administration",
    group: "Administration",
    tabs: [
      "Organisation",
      "Branches",
      "Employees",
      "Roles & permissions",
      "Subscriptions",
      "Tax settings",
      "Audit logs",
      "Security",
      "Custom fields",
    ],
    description: "Your organisation, your team and the way you work.",
    noun: "record",
    special: "settings",
    statuses: ["Active"],
    prefix: "SET",
  },
];

export const MODULE_MAP: Record<string, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.id, m]),
);

export const findModule = (id: string): ModuleDef | undefined => MODULE_MAP[id];

export const moduleGroups = (): Array<{ group: string; modules: ModuleDef[] }> => {
  const groups = Array.from(new Set(MODULES.map((m) => m.group)));
  return groups.map((group) => ({ group, modules: MODULES.filter((m) => m.group === group) }));
};
