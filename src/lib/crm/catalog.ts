import { addDays, format, parseISO } from "date-fns";

export type Module = {
  id: string;
  name: string;
  group: string;
  tabs: string[];
  description: string;
  noun: string;
  /** Hidden from the top nav; still reachable from Settings → More modules. */
  navHidden?: boolean;
};

export const modules: Module[] = [
  {
    id: "leads",
    name: "Leads & enquiries",
    group: "Sales & CRM",
    tabs: ["All leads", "Sales pipeline", "Follow-ups", "Lead sources"],
    description: "Every enquiry, from first hello to a confirmed journey.",
    noun: "lead",
  },
  {
    id: "customers",
    name: "Customers",
    group: "Sales & CRM",
    tabs: ["Customers", "Traveller profiles", "Loyalty", "Documents"],
    description: "Relationships, travel history and the details that matter.",
    noun: "customer",
  },
  {
    id: "quotations",
    name: "Quotations",
    group: "Sales & CRM",
    tabs: ["All quotations", "Itinerary builder", "Templates", "Approvals"],
    description: "Thoughtful itineraries. Clear pricing. Faster decisions.",
    noun: "quotation",
  },
  {
    id: "companies",
    name: "Companies & corporate",
    group: "Sales & CRM",
    tabs: ["Companies", "Travel requests", "Policies", "Cost centres", "Approvals"],
    description: "Manage corporate relationships and business travel.",
    noun: "company",
  },
  {
    id: "inbox",
    name: "Communications",
    group: "Sales & CRM",
    tabs: ["Shared inbox", "WhatsApp", "Email", "Call logs", "Templates", "Consent"],
    description: "Keep every conversation connected to the customer.",
    noun: "conversation",
  },
  {
    id: "campaigns",
    name: "Marketing",
    group: "Sales & CRM",
    tabs: ["Campaigns", "Segments", "Referrals & coupons", "Attribution"],
    description: "Turn the right audience into your next travellers.",
    noun: "campaign",
  },
  {
    id: "bookings",
    name: "Bookings",
    group: "Bookings & trips",
    tabs: ["All bookings", "Reservations", "Amendments", "Cancellations", "Refunds"],
    description: "One booking. Every service. Nothing left behind.",
    noun: "booking",
  },
  {
    id: "flights",
    name: "Flights & ticketing",
    group: "Bookings & trips",
    tabs: ["Flight search", "PNR queue", "Tickets", "Ancillaries", "Reissues & refunds"],
    description: "Manage air reservations, ticketing queues and deadlines.",
    noun: "reservation",
  },
  {
    id: "hotels",
    name: "Hotels & stays",
    group: "Bookings & trips",
    tabs: ["Hotels", "Room inventory", "Rate plans", "Vouchers"],
    description: "Room availability, contracts and every guest confirmation.",
    noun: "hotel",
  },
  {
    id: "packages",
    name: "Packages & activities",
    group: "Bookings & trips",
    tabs: ["Tour packages", "Activities", "Fixed departures", "Seasonal rates"],
    description: "Curate memorable journeys and bookable experiences.",
    noun: "package",
  },
  {
    id: "transfers",
    name: "Ground transport",
    group: "Bookings & trips",
    tabs: ["Transfers", "Vehicles", "Drivers", "Rail, bus & cruise"],
    description: "Coordinate every pickup, connection and arrival.",
    noun: "transfer",
  },
  {
    id: "visa",
    name: "Visa & insurance",
    group: "Bookings & trips",
    tabs: ["Applications", "Document checklists", "Appointments", "Insurance", "Travel advisories"],
    description: "Travel documents and protection, tracked end to end.",
    noun: "application",
  },
  {
    id: "groups",
    name: "Groups & MICE",
    group: "Bookings & trips",
    tabs: ["Group trips", "Delegates", "Room blocks", "Budgets", "Suppliers"],
    description: "Seamless coordination for groups, conferences and events.",
    noun: "group",
    navHidden: true,
  },
  {
    id: "operations",
    name: "Trip operations",
    group: "Operations",
    tabs: ["Departures", "Manifests", "Daily operations", "Vouchers", "Incidents", "Deadlines"],
    description: "Give every departure the attention it deserves.",
    noun: "trip",
  },
  {
    id: "suppliers",
    name: "Suppliers & contracts",
    group: "Operations",
    tabs: ["Suppliers", "Contracts", "Allotments", "Purchase orders", "Settlements"],
    description: "Your partner network, rates and commitments in one place.",
    noun: "supplier",
  },
  {
    id: "support",
    name: "Support & complaints",
    group: "Operations",
    tabs: ["Support tickets", "Refund requests", "Escalations", "Feedback", "Knowledge base"],
    description: "Resolve issues with clarity, care and accountability.",
    noun: "ticket",
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
    navHidden: true,
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
  },
  {
    id: "assistant",
    name: "AI assistant",
    group: "AI & automation",
    tabs: ["Assistant", "Itinerary generator", "Sales intelligence", "Operations insights"],
    description: "A thoughtful co-pilot for your travel team.",
    noun: "draft",
  },
  {
    id: "automation",
    name: "Workflow automation",
    group: "AI & automation",
    tabs: ["Workflows", "Automated alerts", "Execution history", "Approvals"],
    description: "Less repetitive work. More time for your customers.",
    noun: "workflow",
  },
  {
    id: "reports",
    name: "Reports & analytics",
    group: "Reports & analytics",
    tabs: [
      "Growth",
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
    navHidden: true,
  },
  {
    id: "integrations",
    name: "Integrations",
    group: "Operations",
    tabs: ["Supplier connections", "Business apps", "API & webhooks", "Connection logs"],
    description: "Manage travel suppliers and business connections.",
    noun: "connection",
  },
  {
    id: "settings",
    name: "Administration",
    group: "Administration",
    tabs: [
      "Organisation",
      "Branches",
      "Employees",
      "Profile",
      "Roles & permissions",
      "Subscriptions",
      "Tax settings",
      "Audit logs",
      "Security",
      "Custom fields",
      "More modules",
    ],
    description: "Your organisation, your team and the way you work.",
    noun: "record",
  },
];

export const findModule = (id: string) => modules.find((m) => m.id === id);

export const people = [
  "Aarav Sharma",
  "Priya Mehta",
  "Rohan Kapoor",
  "Ananya Iyer",
  "Vikram Singh",
  "Neha Patel",
  "Arjun Desai",
  "Isha Gupta",
];
export const destinations = [
  "Bali, Indonesia",
  "Dubai, UAE",
  "Paris, France",
  "Phuket, Thailand",
  "Singapore",
  "Maldives",
  "Tokyo, Japan",
  "London, UK",
];

export type RecordRow = {
  id: string;
  name: string;
  detail: string;
  destination: string;
  owner: string;
  branch: string;
  date: string; // ISO yyyy-mm-dd
  amount: number;
  status: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  extra?: Record<string, string | number>;
};

export type Task = {
  id: string;
  title: string;
  type: string;
  owner: string;
  date: string; // ISO yyyy-mm-dd
  priority: string;
  done: boolean;
  /** The module this task belongs to, when it was created from a record. */
  relatedModule?: string;
  /** The reference of the record this task belongs to. */
  relatedRecordId?: string;
};

export type CustomField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select";
};

export type Employee = {
  name: string;
  role: string;
  branch: string;
  active: boolean;
  /** Server identifiers — present when the directory is loaded from the API. */
  id?: string;
  email?: string;
  roleKey?: string;
};

export type Settings = {
  orgName: string;
  legalName: string;
  gstin: string;
  supportEmail: string;
  phone: string;
  address: string;
  currency: string;
  financialYear: string;
  branches: string[];
  employees: Employee[];
};

export const defaultSettings: Settings = {
  orgName: "Horizon Travel",
  legalName: "Horizon Travel Pvt. Ltd.",
  gstin: "27AAECH1234F1Z5",
  supportEmail: "hello@horizontravel.in",
  phone: "+91 22 4000 1200",
  address: "Level 4, Maker Chambers, Nariman Point, Mumbai 400021",
  currency: "INR",
  financialYear: "April – March",
  branches: ["Mumbai", "Delhi", "Bengaluru"],
  employees: [
    { name: "Sarah Wilson", role: "Workspace administrator", branch: "Mumbai", active: true },
    { name: "Rahul Verma", role: "Sales manager", branch: "Delhi", active: true },
    { name: "Emily Chen", role: "Operations lead", branch: "Bengaluru", active: true },
    { name: "Daniel Kumar", role: "Finance executive", branch: "Mumbai", active: true },
    { name: "Priya Nair", role: "Support agent", branch: "Delhi", active: true },
  ],
};

const specifics: Record<string, string[]> = {
  suppliers: [
    "Bali Sunshine DMC",
    "Emirates Airlines",
    "Marriott International",
    "Asian Trails",
    "Island Escapes",
    "Royal Caribbean",
    "Japan Explorer",
    "Europamundo",
  ],
  agents: [
    "Horizon Holidays",
    "Skyline Travel Co.",
    "Wanderlust Partners",
    "Global Getaways",
    "Blue Sky Tours",
    "TripNest Agency",
    "Voyage Collective",
    "Compass Travels",
  ],
  companies: [
    "Acme Technologies",
    "Nexora Industries",
    "Summit Consulting",
    "Atlas Enterprises",
    "Brightworks Ltd",
    "Orbit Media",
    "Vertex Solutions",
    "Nova Healthcare",
  ],
  hotels: [
    "The Westin Resort Nusa Dua",
    "Atlantis The Palm",
    "Hôtel Le Meurice",
    "Amari Phuket",
    "Marina Bay Sands",
    "Soneva Fushi",
    "Park Hyatt Tokyo",
    "The Langham London",
  ],
  packages: [
    "Bali Bliss Escape",
    "Dubai City & Desert",
    "Parisian Discovery",
    "Amazing Thailand",
    "Singapore Explorer",
    "Maldives Retreat",
    "Japan in Bloom",
    "London & Beyond",
  ],
  campaigns: [
    "Diwali getaway collection",
    "Winter in Dubai",
    "Europe early bird",
    "Thailand family escapes",
    "Singapore weekend",
    "Honeymoon specials",
    "Japan spring launch",
    "UK summer holidays",
  ],
  integrations: [
    "Amadeus GDS",
    "Sabre",
    "Travelport",
    "Airline NDC",
    "Hotelbeds",
    "WhatsApp Business",
    "Google Workspace",
    "Payment gateway",
  ],
  support: [
    "Flight rescheduling request",
    "Hotel room upgrade",
    "Refund status enquiry",
    "Missing transfer voucher",
    "Meal preference update",
    "Cancellation assistance",
    "Visa document review",
    "Invoice correction",
  ],
  distribution: [
    "Homepage",
    "Dubai destination guide",
    "European escapes",
    "Bali honeymoon collection",
    "Summer offers",
    "Maldives destination guide",
    "Japan travel guide",
    "Contact & enquiries",
  ],
  automation: [
    "New enquiry assignment",
    "Quote expiry reminder",
    "Payment due follow-up",
    "Departure briefing",
    "Supplier escalation",
    "Post-trip review request",
    "Low-margin approval",
    "Passport expiry alert",
  ],
  settings: [
    "Horizon Travel — Head office",
    "Mumbai branch",
    "Delhi branch",
    "Bengaluru branch",
    "Sales team",
    "Operations team",
    "Finance team",
    "Support team",
  ],
};

// Dates spread around today so date filters show realistic slices of data.
const dateOffsets = [-42, -16, -6, -1, 2, 8, 24, 58];
export const isoToday = () => format(new Date(), "yyyy-MM-dd");
const isoOffset = (days: number) => format(addDays(new Date(), days), "yyyy-MM-dd");

// Display helper for ISO record dates ("2026-10-14" → "14 Oct 2026").
export const formatDay = (iso: string) => {
  const parsed = parseISO(iso);
  return Number.isNaN(parsed.getTime()) ? iso : format(parsed, "dd MMM yyyy");
};

export function seedRows(module: string, tab = ""): RecordRow[] {
  const statusMap: Record<string, string[]> = {
    leads: ["New", "Contacted", "Qualified", "Quoted", "Won", "Lost"],
    bookings: ["Confirmed", "Pending", "On hold", "Confirmed", "Cancelled"],
    quotations: ["Sent", "Draft", "Accepted", "Expired"],
    finance: ["Paid", "Overdue", "Pending", "Paid", "Partially paid"],
    visa: ["In review", "Documents pending", "Approved", "Submitted"],
    support: ["Open", "In progress", "Resolved", "Escalated"],
    flights: ["Held", "Queued", "Ticketed", "Reissued", "Cancelled", "Ticketed"],
    hotels: ["Requested", "Confirmed", "Vouchered", "Cancelled", "Vouchered"],
    integrations: ["Not connected"],
    automation: ["Active", "Paused"],
    operations: ["Confirmed", "Pending", "In progress"],
    agents: ["Active", "KYC pending", "Active"],
    settings: ["Active"],
    distribution: ["Published", "Draft"],
  };
  const status = statusMap[module] ?? ["Active", "Pending", "Confirmed"];
  const branches = defaultSettings.branches;
  const owners = defaultSettings.employees.filter((e) => e.active).map((e) => e.name);
  return people.map((name, i) => ({
    id: `${({ leads: "LD", bookings: "BK", quotations: "QT", finance: "INV", support: "TKT" } as Record<string, string>)[module] ?? module.slice(0, 3).toUpperCase()}-${2401 + i}`,
    name: specifics[module]?.[i] ?? name,
    detail:
      module === "flights"
        ? ([
            "DEL → DPS · SQ 403",
            "BOM → DXB · EK 501",
            "DEL → CDG · AF 225",
            "BOM → HKT · 6E 1073",
            "DEL → SIN · SQ 401",
            "BOM → MLE · UK 271",
            "DEL → NRT · JL 740",
            "BOM → LHR · BA 138",
          ][i] ?? "")
        : module === "transfers"
          ? `${["Airport pickup", "Private transfer", "City tour", "Airport drop"][i % 4]} · ${(i % 3) + 2} passengers`
          : tab === "Documents"
            ? `${["Passport", "Visa", "Insurance policy", "Travel consent"][i % 4]} · ${name}`
            : `${(i % 3) + 2} travellers · ${[6, 4, 8, 5, 4, 6, 10, 7][i]} days`,
    destination: destinations[i] ?? "",
    owner: owners[i % owners.length] ?? "",
    branch: branches[i % branches.length] ?? branches[0] ?? "Mumbai",
    date: isoOffset(dateOffsets[i] ?? 0),
    amount: [185000, 92000, 324000, 148000, 112000, 268000, 386000, 245000][i] ?? 0,
    status: status[i % status.length] ?? "Pending",
    email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
    phone: `+91 98${i}00 12${i}45`,
    source: ["Website", "WhatsApp", "Referral", "B2B agent"][i % 4] ?? "Website",
    notes:
      "Customer prefers a morning departure. Follow up with the supplier for final confirmation.",
  }));
}

export function seedTasks(): Task[] {
  const owners = defaultSettings.employees.filter((e) => e.active).map((e) => e.name);
  const seed: Array<[string, string, number, string, boolean]> = [
    ["Follow up with Aarav on Bali quotation", "Sales follow-up", 0, "High", false],
    ["Issue Dubai tickets before deadline", "Ticketing", 0, "Urgent", false],
    ["Collect balance payment for BK-2402", "Payment collection", 1, "High", false],
    ["Confirm Bali hotel voucher", "Supplier follow-up", 2, "Normal", false],
    ["Review group rooming list", "Trip operations", 3, "Normal", true],
    ["Send Paris departure briefing", "Departure", 5, "Normal", false],
    ["Verify visa documents for Neha", "Documents", 7, "High", false],
    ["Supplier settlement review", "Finance", 10, "Normal", false],
  ];
  return seed.map(([title, type, offset, priority, done], i) => ({
    id: String(i + 1),
    title,
    type,
    owner: owners[i % owners.length] ?? "Sarah Wilson",
    date: isoOffset(offset),
    priority,
    done,
  }));
}

const currencyLocale: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  AED: "en-AE",
  SGD: "en-SG",
  THB: "th-TH",
};

export const money = (n: number, currency = "INR") =>
  new Intl.NumberFormat(currencyLocale[currency] ?? "en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);

const csvCell = (value: string | number) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function toCSV(rows: RecordRow[]): string {
  const headers = [
    "Reference",
    "Name",
    "Details",
    "Destination",
    "Branch",
    "Status",
    "Amount",
    "Owner",
    "Email",
    "Phone",
    "Source",
    "Date",
    "Notes",
  ];
  const lines = rows.map((r) =>
    [
      r.id,
      r.name,
      r.detail,
      r.destination,
      r.branch,
      r.status,
      r.amount,
      r.owner,
      r.email,
      r.phone,
      r.source,
      r.date,
      r.notes,
    ]
      .map(csvCell)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

export function exportRows(rows: RecordRow[], filename: string) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
