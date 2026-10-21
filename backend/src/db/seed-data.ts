import { MODULES, type ModuleDef } from "../domain/modules";

// Demo dataset that mirrors the frontend `catalog.ts` so the seeded API returns
// exactly the same shapes the UI already renders.

export const ORG_SEED = {
  name: "Horizon Travel",
  legalName: "Horizon Travel Pvt. Ltd.",
  gstin: "27AAECH1234F1Z5",
  supportEmail: "hello@horizontravel.in",
  phone: "+91 22 4000 1200",
  address: "Level 4, Maker Chambers, Nariman Point, Mumbai 400021",
  currency: "INR",
  financialYear: "April – March",
};

export const BRANCH_SEED = ["Mumbai", "Delhi", "Bengaluru"];

export const EMPLOYEE_SEED: Array<{
  name: string;
  role: string;
  branch: string;
  roleKey: string;
  email: string;
  active: boolean;
}> = [
  { name: "Sarah Wilson", role: "Workspace administrator", branch: "Mumbai", roleKey: "company_admin", email: "owner@horizontravel.in", active: true },
  { name: "Rahul Verma", role: "Sales manager", branch: "Delhi", roleKey: "sales", email: "rahul.verma@horizontravel.in", active: true },
  { name: "Emily Chen", role: "Operations lead", branch: "Bengaluru", roleKey: "operations", email: "emily.chen@horizontravel.in", active: true },
  { name: "Daniel Kumar", role: "Finance executive", branch: "Mumbai", roleKey: "finance", email: "daniel.kumar@horizontravel.in", active: true },
  { name: "Priya Nair", role: "Support agent", branch: "Delhi", roleKey: "support", email: "priya.nair@horizontravel.in", active: true },
];

export const PEOPLE = [
  "Aarav Sharma",
  "Priya Mehta",
  "Rohan Kapoor",
  "Ananya Iyer",
  "Vikram Singh",
  "Neha Patel",
  "Arjun Desai",
  "Isha Gupta",
];

export const DESTINATIONS = [
  "Bali, Indonesia",
  "Dubai, UAE",
  "Paris, France",
  "Phuket, Thailand",
  "Singapore",
  "Maldives",
  "Tokyo, Japan",
  "London, UK",
];

const SPECIFICS: Record<string, string[]> = {
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

const STATUS_MAP: Record<string, string[]> = {
  leads: ["New", "Contacted", "Qualified", "Quoted", "Won", "Lost"],
  bookings: ["Confirmed", "Pending", "On hold", "Confirmed", "Cancelled"],
  quotations: ["Sent", "Draft", "Accepted", "Expired"],
  finance: ["Paid", "Overdue", "Pending", "Paid", "Partially paid"],
  visa: ["In review", "Documents pending", "Approved", "Submitted"],
  support: ["Open", "In progress", "Resolved", "Escalated"],
  integrations: ["Not connected"],
  automation: ["Active", "Paused"],
  operations: ["Confirmed", "Pending", "In progress"],
  agents: ["Active", "KYC pending", "Active"],
  settings: ["Active"],
  distribution: ["Published", "Draft"],
};

const DATE_OFFSETS = [-42, -16, -6, -1, 2, 8, 24, 58];
const AMOUNTS = [185000, 92000, 324000, 148000, 112000, 268000, 386000, 245000];
const SOURCES = ["Website", "WhatsApp", "Referral", "B2B agent"];
const FLIGHT_DETAILS = [
  "DEL → DPS · SQ 403",
  "BOM → DXB · EK 501",
  "DEL → CDG · AF 225",
  "BOM → HKT · 6E 1073",
  "DEL → SIN · SQ 401",
  "BOM → MLE · UK 271",
  "DEL → NRT · JL 740",
  "BOM → LHR · BA 138",
];
const TRANSFER_TYPES = ["Airport pickup", "Private transfer", "City tour", "Airport drop"];
const DOC_TYPES = ["Passport", "Visa", "Insurance policy", "Travel consent"];
const TRAVELLERS = [6, 4, 8, 5, 4, 6, 10, 7];

export const isoOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const detailFor = (module: ModuleDef, tab: string | undefined, name: string, i: number) => {
  if (module.id === "flights") return FLIGHT_DETAILS[i] ?? "";
  if (module.id === "transfers")
    return `${TRANSFER_TYPES[i % 4]} · ${(i % 3) + 2} passengers`;
  if (tab === "Documents") return `${DOC_TYPES[i % 4]} · ${name}`;
  return `${(i % 3) + 2} travellers · ${TRAVELLERS[i]} days`;
};

export type SeedRecord = {
  moduleId: string;
  reference: string;
  name: string;
  detail: string;
  destination: string;
  ownerName: string;
  branchName: string;
  date: string;
  amount: number;
  status: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
};

/** Builds eight demo records for a module — identical to the frontend seed. */
export function buildModuleRecords(module: ModuleDef): SeedRecord[] {
  const statuses = STATUS_MAP[module.id] ?? module.statuses;
  const owners = EMPLOYEE_SEED.filter((e) => e.active).map((e) => e.name);

  return PEOPLE.map((name, i) => {
    const displayName = SPECIFICS[module.id]?.[i] ?? name;
    return {
      moduleId: module.id,
      reference: `${module.prefix}-${2401 + i}`,
      name: displayName,
      detail: detailFor(module, module.tabs[0], name, i),
      destination: DESTINATIONS[i] ?? "",
      ownerName: owners[i % owners.length] ?? "",
      branchName: BRANCH_SEED[i % BRANCH_SEED.length] ?? "Mumbai",
      date: isoOffset(DATE_OFFSETS[i] ?? 0),
      amount: AMOUNTS[i] ?? 0,
      status: statuses[i % statuses.length] ?? "Pending",
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      phone: `+91 98${i}00 12${i}45`,
      source: SOURCES[i % SOURCES.length] ?? "Website",
      notes:
        "Customer prefers a morning departure. Follow up with the supplier for final confirmation.",
    };
  });
}

export const TASK_SEED: Array<{
  title: string;
  type: string;
  offset: number;
  priority: string;
  done: boolean;
}> = [
  { title: "Follow up with Aarav on Bali quotation", type: "Sales follow-up", offset: 0, priority: "High", done: false },
  { title: "Issue Dubai tickets before deadline", type: "Ticketing", offset: 0, priority: "Urgent", done: false },
  { title: "Collect balance payment for BK-2402", type: "Payment collection", offset: 1, priority: "High", done: false },
  { title: "Confirm Bali hotel voucher", type: "Supplier follow-up", offset: 2, priority: "Normal", done: false },
  { title: "Review group rooming list", type: "Trip operations", offset: 3, priority: "Normal", done: true },
  { title: "Send Paris departure briefing", type: "Departure", offset: 5, priority: "Normal", done: false },
  { title: "Verify visa documents for Neha", type: "Documents", offset: 7, priority: "High", done: false },
  { title: "Supplier settlement review", type: "Finance", offset: 10, priority: "Normal", done: false },
];

export const taskDate = (offset: number) => isoOffset(offset);

export const WORKFLOW_SEED = [
  { name: "New enquiry assignment", trigger: "New lead created", condition: "Assigned owner is empty", action: "Assign to sales owner", status: "Active" },
  { name: "Quote expiry reminder", trigger: "Quote expiring", condition: "All records", action: "Prepare reminder draft", status: "Active" },
  { name: "Payment due follow-up", trigger: "Payment overdue", condition: "Amount above ₹1,00,000", action: "Create follow-up task", status: "Active" },
  { name: "Departure briefing", trigger: "Booking confirmed", condition: "Destination is Bali", action: "Prepare reminder draft", status: "Active" },
  { name: "Supplier escalation", trigger: "Payment overdue", condition: "All records", action: "Request manager approval", status: "Paused" },
  { name: "Post-trip review request", trigger: "Booking confirmed", condition: "All records", action: "Prepare reminder draft", status: "Active" },
  { name: "Low-margin approval", trigger: "Quote expiring", condition: "Amount above ₹1,00,000", action: "Request manager approval", status: "Paused" },
  { name: "Passport expiry alert", trigger: "New lead created", condition: "All records", action: "Create follow-up task", status: "Active" },
];

export const INTEGRATION_SEED = [
  { provider: "Amadeus GDS", category: "gds", description: "Air inventory, reservations and ticketing" },
  { provider: "Sabre", category: "gds", description: "Air inventory, reservations and ticketing" },
  { provider: "Travelport", category: "gds", description: "Air inventory, reservations and ticketing" },
  { provider: "Airline NDC", category: "gds", description: "Air inventory, reservations and ticketing" },
  { provider: "Hotelbeds", category: "supplier", description: "Hotel availability and rate plans" },
  { provider: "WhatsApp Business", category: "business", description: "Business communication and service distribution" },
  { provider: "Google Workspace", category: "business", description: "Business communication and service distribution" },
  { provider: "Payment gateway", category: "payment", description: "Collections and payment links" },
];

export const TEMPLATE_SEED = [
  { channel: "Shared inbox", name: "Acknowledgement", body: "Thanks for reaching out. I'll share details shortly." },
  { channel: "Shared inbox", name: "Details request", body: "Please share your travel dates and pax count." },
  { channel: "WhatsApp", name: "WhatsApp greeting", body: "Hi! Thanks for your enquiry. 📞" },
  { channel: "Email", name: "Itinerary proposal", body: "Subject: Your Bali Itinerary\n\nHi [Name], please find attached draft itinerary." },
  { channel: "Call logs", name: "Call summary", body: "Called customer. Requested dates." },
];

export const MESSAGE_SEED = [
  "Hi! We are planning a trip. Could you send us a package?",
  "Absolutely! I'll prepare a personalised itinerary and share it shortly.",
  "That sounds great, thank you! We prefer a relaxed itinerary.",
];

export const PLAN_SEED = [
  {
    key: "starter",
    name: "Starter",
    priceMonthly: 4999,
    priceYearly: 49990,
    features: ["5 workspaces", "Email support", "Core CRM"],
    limits: { seats: 5, branches: 1, bookings: 250 },
    popular: false,
    position: 1,
  },
  {
    key: "growth",
    name: "Growth",
    priceMonthly: 14999,
    priceYearly: 149990,
    features: ["All sales workspaces", "Priority support", "Automation", "Reports"],
    limits: { seats: 15, branches: 3, bookings: 1000 },
    popular: true,
    position: 2,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceMonthly: 39999,
    priceYearly: 399990,
    features: ["Every workspace", "Dedicated success manager", "SSO & audit", "API & webhooks"],
    limits: { seats: 100, branches: 25, bookings: 100000 },
    popular: false,
    position: 3,
  },
];

/** The module catalogue excluding bespoke-only workspaces that hold no records. */
export const RECORD_MODULES = MODULES.filter(
  (m) => !["reports", "settings", "integrations", "automation", "assistant"].includes(m.id),
);
