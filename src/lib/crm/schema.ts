/**
 * Module schemas — the single source of truth for how each CRM module looks and
 * behaves: its KPI cards, table columns, create/edit form, detail sections and
 * the meaning of each tab.
 *
 * The workspace renderer and the record dialog are both driven from here, so a
 * new module (or a deeper one) only needs a schema entry — never bespoke JSX.
 * Field keys are either a core `RecordRow` key ("name", "amount"…) or a
 * `extra:<key>` key that is stored in the record's `extra` JSON column.
 */
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Building2,
  Bus,
  Compass,
  FileText,
  Globe,
  Headphones,
  Hotel,
  Inbox,
  Landmark,
  ListTodo,
  MapPinned,
  Megaphone,
  Network,
  Package,
  Plane,
  Plug,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import { findModule, money, type RecordRow } from "./catalog";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type FieldType = "text" | "email" | "tel" | "number" | "date" | "select" | "textarea";

/** Where a form field value lives. */
export type FieldDef = {
  /** `name` | `amount` (core) or `extra:pnr` (JSON). */
  key: string;
  label: string;
  type: FieldType;
  /** Static choices, or a reference to a dynamic option set. */
  options?: string[] | "statuses" | "owners" | "branches" | "sources";
  required?: boolean;
  /** One-line helper shown under the input — keeps the UI easy to learn. */
  hint?: string;
  placeholder?: string;
  /** Renders across both form columns. */
  wide?: boolean;
  /** Form section this field belongs to. */
  group: string;
};

export type ColumnKind =
  "text" | "money" | "date" | "status" | "owner" | "person" | "chip" | "mono" | "progress";

export type ColumnDef = {
  /** `id` | `name` | `extra:pnr` … */
  key: string;
  label: string;
  kind?: ColumnKind;
  sortable?: boolean;
  align?: "left" | "right";
};

export type KpiDef = {
  label: string;
  hint: string;
  tone: "pine" | "butter" | "tomato" | "ink";
  value: (rows: RecordRow[], context: KpiContext) => string;
  /** Statuses this KPI counts — lets the UI drill into the matching filter. */
  statuses?: string[] | undefined;
};

export type KpiContext = {
  /** Currency-aware formatter for the active organisation. */
  money: (value: number) => string;
  /** Count of rows whose status is in `statuses`. */
  countBy: (statuses: string[]) => number;
  /** Sum of amounts, optionally limited to `statuses`. */
  sumBy: (statuses?: string[]) => number;
};

export type TabDef = {
  label: string;
  /** Status subset this tab shows. Omit to show every record. */
  statuses?: string[];
  /** Default rendering for the tab. */
  view?: "list" | "board" | "calendar";
  /** Plain-language explanation of what the tab is for. */
  hint?: string;
};

export type ModuleSchema = {
  id: string;
  icon: LucideIcon;
  singular: string;
  plural: string;
  /** Statuses a record can move through, in workflow order. */
  statuses: string[];
  sources?: string[];
  /** Form section order for the create/edit dialog. */
  sections: string[];
  fields: FieldDef[];
  columns: ColumnDef[];
  kpis: KpiDef[];
  /** Detail-dialog groups: a title plus the field keys to show. */
  detailSections: Array<{ title: string; keys: string[] }>;
  /** Three bite-sized "how to use this" tips rendered above the table. */
  tips: string[];
  tabs?: TabDef[];
  /** Preferred board column ordering when the board view is used. */
  boardStatuses?: string[];
};

/* ------------------------------------------------------------------ *
 * Shared building blocks
 * ------------------------------------------------------------------ */

const CONTACT_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Full name",
    type: "text",
    required: true,
    group: "Contact",
    placeholder: "e.g. Aarav Sharma",
  },
  { key: "email", label: "Email", type: "email", group: "Contact", placeholder: "name@email.com" },
  { key: "phone", label: "Phone", type: "tel", group: "Contact", placeholder: "+91 98…" },
];

const DESTINATION_FIELD: FieldDef = {
  key: "destination",
  label: "Destination",
  type: "text",
  group: "Trip",
  placeholder: "e.g. Bali, Indonesia",
  hint: "City, country — used by reports and filters.",
};

const OWNER_FIELDS: FieldDef[] = [
  { key: "owner", label: "Assigned to", type: "select", options: "owners", group: "Ownership" },
  { key: "branch", label: "Branch", type: "select", options: "branches", group: "Ownership" },
];

const NOTES_FIELD: FieldDef = {
  key: "notes",
  label: "Internal notes",
  type: "textarea",
  group: "Notes",
  wide: true,
  placeholder: "Preferences, promises, next steps…",
};

type ExtraField = Omit<FieldDef, "key" | "group"> & { key?: string; group?: string };

/** camelCase key generated from a field label, e.g. "Travel date" → travelDate. */
const keyFromLabel = (label: string) =>
  label
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("");

/** Builds a form field stored inside the record's `extra` JSON blob. */
const extra = (def: ExtraField, group: string): FieldDef => {
  const key = def.key ?? keyFromLabel(def.label);
  return {
    ...def,
    group: def.group ?? group,
    key: key.startsWith("extra:") ? key : `extra:${key}`,
  };
};

const col = (
  key: string,
  label: string,
  kind: ColumnKind = "text",
  sortable = true,
): ColumnDef => ({
  key,
  label,
  kind,
  sortable,
});

const REF_COL = col("id", "Reference", "mono");
const STATUS_COL = col("status", "Status", "status", false);
const VALUE_COL: ColumnDef = { ...col("amount", "Value", "money"), align: "right" };
const OWNER_COL = col("owner", "Owner", "owner", false);

const kpiCount = (
  label: string,
  statuses: string[],
  hint: string,
  tone: KpiDef["tone"] = "pine",
): KpiDef => ({
  label,
  hint,
  tone,
  statuses,
  value: (rows, ctx) => String(ctx.countBy(statuses)),
});

const kpiSum = (
  label: string,
  hint: string,
  statuses?: string[],
  tone: KpiDef["tone"] = "ink",
): KpiDef => ({
  label,
  hint,
  tone,
  statuses,
  value: (rows, ctx) => ctx.money(ctx.sumBy(statuses)),
});

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

export const schemas: Record<string, ModuleSchema> = {
  leads: {
    id: "leads",
    icon: Users,
    singular: "lead",
    plural: "leads",
    statuses: ["New", "Contacted", "Qualified", "Quoted", "Won", "Lost"],
    sources: ["Website", "WhatsApp", "Referral", "B2B agent", "Walk-in", "Campaign"],
    sections: ["Contact", "Trip", "Opportunity", "Ownership", "Notes"],
    fields: [
      ...CONTACT_FIELDS,
      DESTINATION_FIELD,
      extra({ label: "Travellers", type: "number", placeholder: "2" }, "Trip"),
      extra({ label: "Travel month", type: "date" }, "Trip"),
      extra(
        {
          label: "Trip type",
          type: "select",
          options: ["Leisure", "Honeymoon", "Family", "Corporate", "Group", "Visa only"],
        },
        "Trip",
      ),
      {
        key: "amount",
        label: "Estimated value",
        type: "number",
        group: "Opportunity",
        hint: "What this enquiry is worth.",
      },
      {
        key: "source",
        label: "Lead source",
        type: "select",
        options: "sources",
        group: "Opportunity",
      },
      {
        key: "status",
        label: "Pipeline stage",
        type: "select",
        options: "statuses",
        group: "Opportunity",
      },
      { key: "date", label: "Next follow-up", type: "date", group: "Opportunity" },
      ...OWNER_FIELDS,
      NOTES_FIELD,
    ],
    columns: [
      REF_COL,
      col("name", "Customer", "person"),
      col("destination", "Destination"),
      { ...col("extra:travellers", "Pax", "chip"), sortable: false },
      { ...col("date", "Follow-up", "date") },
      VALUE_COL,
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("New enquiries", ["New"], "Waiting for the first call", "butter"),
      kpiCount("In conversation", ["Contacted", "Qualified"], "Being qualified right now", "pine"),
      kpiSum("Open pipeline value", "Quoted and qualified deals", ["Qualified", "Quoted"], "ink"),
      kpiCount("Won", ["Won"], "Converted to bookings", "pine"),
    ],
    detailSections: [
      { title: "Contact", keys: ["name", "email", "phone", "source"] },
      {
        title: "Trip",
        keys: ["destination", "extra:travellers", "extra:tripType", "extra:travelMonth", "date"],
      },
      { title: "Opportunity", keys: ["amount", "status", "owner", "branch"] },
    ],
    tips: [
      "Naya enquiry aaya? Create lead → stage New rakho.",
      "Call ke baad stage Contacted / Qualified update karo — pipeline isi se banti hai.",
      "Deal jeet gaye to stage Won karo, phir booking banao.",
    ],
    tabs: [
      { label: "All leads", hint: "Every enquiry, newest first." },
      {
        label: "Sales pipeline",
        statuses: ["New", "Contacted", "Qualified", "Quoted"],
        view: "board",
        hint: "Drag cards between stages.",
      },
      {
        label: "Follow-ups",
        statuses: ["Contacted", "Qualified", "Quoted"],
        hint: "Leads waiting on you.",
      },
      { label: "Lead sources", hint: "Where your enquiries come from." },
    ],
    boardStatuses: ["New", "Contacted", "Qualified", "Quoted", "Won", "Lost"],
  },

  customers: {
    id: "customers",
    icon: Users,
    singular: "customer",
    plural: "customers",
    statuses: ["Active", "Repeat", "VIP", "Inactive"],
    sections: ["Contact", "Travel profile", "Loyalty", "Ownership", "Notes"],
    fields: [
      ...CONTACT_FIELDS,
      extra({ key: "city", label: "City", type: "text" }, "Contact"),
      extra({ key: "dob", label: "Date of birth", type: "date" }, "Travel profile"),
      extra({ key: "passport", label: "Passport number", type: "text" }, "Travel profile"),
      extra({ label: "Passport expiry", type: "date" }, "Travel profile"),
      extra({ key: "airline", label: "Preferred airline", type: "text" }, "Travel profile"),
      extra(
        {
          key: "loyalty",
          label: "Loyalty tier",
          type: "select",
          options: ["None", "Silver", "Gold", "Platinum"],
        },
        "Loyalty",
      ),
      { key: "destination", label: "Favourite destination", type: "text", group: "Travel profile" },
      { key: "amount", label: "Lifetime value", type: "number", group: "Loyalty" },
      {
        key: "status",
        label: "Customer status",
        type: "select",
        options: "statuses",
        group: "Loyalty",
      },
      ...OWNER_FIELDS,
      NOTES_FIELD,
    ],
    columns: [
      REF_COL,
      col("name", "Customer", "person"),
      col("phone", "Phone"),
      col("destination", "Favourite destination"),
      { ...col("amount", "Lifetime value", "money"), align: "right" },
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Total customers", [], "Everyone in your book", "ink"),
      kpiCount("Active", ["Active", "Repeat"], "Booked recently", "pine"),
      kpiCount("VIP", ["VIP"], "Your best travellers", "butter"),
      kpiSum("Lifetime value", "Across all customers", undefined, "ink"),
    ],
    detailSections: [
      { title: "Contact", keys: ["name", "email", "phone", "extra:city"] },
      {
        title: "Travel profile",
        keys: [
          "extra:passport",
          "extra:passportExpiry",
          "extra:dob",
          "extra:airline",
          "destination",
        ],
      },
      {
        title: "Loyalty & ownership",
        keys: ["extra:loyalty", "amount", "status", "owner", "branch"],
      },
    ],
    tips: [
      "Repeat traveller? Status ko Repeat ya VIP set karo.",
      "Passport expiry bhara rakho — visa reminders isi se aate hain.",
      "Har booking ke baad lifetime value update karo.",
    ],
    tabs: [
      { label: "Customers", hint: "Your complete traveller directory." },
      { label: "Traveller profiles", hint: "Passport and preference detail." },
      { label: "Loyalty", statuses: ["Repeat", "VIP"], hint: "Your most valuable customers." },
      { label: "Documents", hint: "Passports, visas and consent forms." },
    ],
  },

  quotations: {
    id: "quotations",
    icon: FileText,
    singular: "quotation",
    plural: "quotations",
    statuses: ["Draft", "Sent", "Accepted", "Expired", "Declined"],
    sections: ["Customer", "Itinerary", "Pricing", "Ownership", "Notes"],
    fields: [
      ...CONTACT_FIELDS,
      DESTINATION_FIELD,
      extra({ label: "Nights", type: "number" }, "Itinerary"),
      extra({ label: "Valid until", type: "date" }, "Itinerary"),
      extra(
        { key: "summary", label: "Itinerary summary", type: "textarea", wide: true },
        "Itinerary",
      ),
      { key: "amount", label: "Quoted price", type: "number", group: "Pricing" },
      extra({ label: "Cost price", type: "number" }, "Pricing"),
      {
        key: "status",
        label: "Quotation status",
        type: "select",
        options: "statuses",
        group: "Pricing",
      },
      { key: "date", label: "Sent on", type: "date", group: "Pricing" },
      ...OWNER_FIELDS,
      NOTES_FIELD,
    ],
    columns: [
      REF_COL,
      col("name", "Customer", "person"),
      col("destination", "Destination"),
      { ...col("extra:nights", "Nights", "chip"), sortable: false },
      col("date", "Sent on", "date"),
      VALUE_COL,
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Sent this view", ["Sent"], "Awaiting the customer", "butter"),
      kpiCount("Accepted", ["Accepted"], "Converted to bookings", "pine"),
      kpiSum("Quoted value", "All quotations in view", ["Sent", "Accepted"], "ink"),
      kpiCount("Expiring", ["Draft", "Expired"], "Need a nudge", "tomato"),
    ],
    detailSections: [
      { title: "Customer", keys: ["name", "email", "phone"] },
      {
        title: "Itinerary",
        keys: ["destination", "extra:nights", "extra:validUntil", "extra:summary"],
      },
      { title: "Pricing", keys: ["amount", "extra:costPrice", "status", "date"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Draft banao → customer ko bhejo → status Sent karo.",
      "Price accept ho gaya to Accepted mark karke booking create karo.",
      "Cost price bharna zaroori hai — margin report isse banti hai.",
    ],
    tabs: [
      { label: "All quotations", hint: "Every quote you have built." },
      { label: "Itinerary builder", hint: "Build day-by-day itineraries." },
      { label: "Templates", hint: "Reusable itinerary starting points." },
      { label: "Approvals", statuses: ["Draft"], hint: "Quotes waiting for internal sign-off." },
    ],
  },

  companies: {
    id: "companies",
    icon: Building2,
    singular: "company",
    plural: "companies",
    statuses: ["Prospect", "Active", "Contracted", "Dormant"],
    sections: ["Company", "Primary contact", "Commercials", "Ownership", "Notes"],
    fields: [
      { key: "name", label: "Company name", type: "text", required: true, group: "Company" },
      extra({ label: "Industry", type: "text" }, "Company"),
      extra({ label: "GSTIN", type: "text" }, "Company"),
      extra({ key: "city", label: "Registered city", type: "text" }, "Company"),
      extra({ key: "contact", label: "Contact person", type: "text" }, "Primary contact"),
      { key: "email", label: "Work email", type: "email", group: "Primary contact" },
      { key: "phone", label: "Phone", type: "tel", group: "Primary contact" },
      extra(
        {
          key: "terms",
          label: "Payment terms",
          type: "select",
          options: ["Prepaid", "Net 15", "Net 30", "Net 45"],
        },
        "Commercials",
      ),
      extra({ label: "Credit limit", type: "number" }, "Commercials"),
      { key: "amount", label: "Annual travel spend", type: "number", group: "Commercials" },
      {
        key: "status",
        label: "Account status",
        type: "select",
        options: "statuses",
        group: "Commercials",
      },
      ...OWNER_FIELDS,
      NOTES_FIELD,
    ],
    columns: [
      REF_COL,
      col("name", "Company", "text"),
      col("extra:contact", "Primary contact"),
      col("email", "Work email"),
      { ...col("extra:terms", "Terms", "chip"), sortable: false },
      { ...col("amount", "Annual spend", "money"), align: "right" },
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Corporate accounts", [], "Companies on file", "ink"),
      kpiCount("Contracted", ["Contracted", "Active"], "Signed and travelling", "pine"),
      kpiCount("Prospects", ["Prospect"], "In the pipeline", "butter"),
      kpiSum("Annual spend", "Across all accounts", undefined, "ink"),
    ],
    detailSections: [
      { title: "Company", keys: ["name", "extra:industry", "extra:gstin", "extra:city"] },
      { title: "Primary contact", keys: ["extra:contact", "email", "phone"] },
      { title: "Commercials", keys: ["extra:terms", "extra:creditLimit", "amount", "status"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Prospect → Contracted jab agreement sign ho jaye.",
      "Credit limit set karo — B2B invoicing isse control hoti hai.",
      "Travel requests company ke under hi track karo.",
    ],
    tabs: [
      { label: "Companies", hint: "All corporate accounts." },
      { label: "Travel requests", hint: "Bookings raised by corporates." },
      { label: "Policies", hint: "Travel policy per company." },
      { label: "Cost centres", hint: "Billing dimensions." },
      { label: "Approvals", hint: "Requests awaiting sign-off." },
    ],
  },

  inbox: {
    id: "inbox",
    icon: Inbox,
    singular: "conversation",
    plural: "conversations",
    statuses: ["Open", "Pending", "Resolved", "Closed"],
    sources: ["WhatsApp", "Email", "Phone", "Instagram", "Web chat"],
    sections: ["Contact", "Conversation", "Ownership", "Notes"],
    fields: [
      ...CONTACT_FIELDS,
      {
        key: "source",
        label: "Channel",
        type: "select",
        options: "sources",
        group: "Conversation",
      },
      extra({ label: "Subject", type: "text", wide: true }, "Conversation"),
      {
        key: "status",
        label: "Status",
        type: "select",
        options: "statuses",
        group: "Conversation",
      },
      { key: "date", label: "Last message", type: "date", group: "Conversation" },
      { key: "detail", label: "Latest message", type: "textarea", group: "Conversation" },
      ...OWNER_FIELDS,
      NOTES_FIELD,
    ],
    columns: [
      REF_COL,
      col("name", "Contact", "person"),
      { ...col("source", "Channel", "chip"), sortable: false },
      col("detail", "Latest message"),
      col("date", "Last message", "date"),
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Open conversations", ["Open"], "Need a reply", "butter"),
      kpiCount("Waiting on customer", ["Pending"], "Awaiting their reply", "ink"),
      kpiCount("Resolved", ["Resolved", "Closed"], "Closed out", "pine"),
      kpiCount("All threads", [], "Across every channel", "ink"),
    ],
    detailSections: [
      { title: "Contact", keys: ["name", "email", "phone", "source"] },
      { title: "Conversation", keys: ["extra:subject", "status", "date"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Har channel ka message ek hi thread me rakho.",
      "Resolve karne ke baad status Closed karo — SLA report isse banti hai.",
    ],
    tabs: [
      { label: "Shared inbox", hint: "One queue for the whole team." },
      { label: "WhatsApp", hint: "Business WhatsApp threads." },
      { label: "Email", hint: "Customer email threads." },
      { label: "Call logs", hint: "Logged calls and outcomes." },
      { label: "Templates", hint: "Reusable message templates." },
      { label: "Consent", hint: "Marketing opt-in records." },
    ],
  },

  campaigns: {
    id: "campaigns",
    icon: Megaphone,
    singular: "campaign",
    plural: "campaigns",
    statuses: ["Draft", "Scheduled", "Live", "Paused", "Completed"],
    sources: ["Email", "WhatsApp", "SMS", "Social", "Google Ads"],
    sections: ["Campaign", "Targeting", "Performance", "Ownership"],
    fields: [
      { key: "name", label: "Campaign name", type: "text", required: true, group: "Campaign" },
      { key: "source", label: "Channel", type: "select", options: "sources", group: "Campaign" },
      extra({ key: "startDate", label: "Start date", type: "date" }, "Campaign"),
      extra({ key: "endDate", label: "End date", type: "date" }, "Campaign"),
      { key: "destination", label: "Featured destination", type: "text", group: "Targeting" },
      extra({ key: "audience", label: "Audience segment", type: "text" }, "Targeting"),
      extra({ key: "audienceSize", label: "Audience size", type: "number" }, "Targeting"),
      { key: "amount", label: "Budget", type: "number", group: "Performance" },
      extra({ key: "enquiries", label: "Enquiries generated", type: "number" }, "Performance"),
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Performance" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Campaign"),
      { ...col("source", "Channel", "chip"), sortable: false },
      col("destination", "Destination"),
      { ...col("extra:audience", "Audience", "chip"), sortable: false },
      { ...col("amount", "Budget", "money"), align: "right" },
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Live campaigns", ["Live"], "Running right now", "pine"),
      kpiCount("Scheduled", ["Scheduled"], "Starting soon", "butter"),
      kpiSum("Total budget", "Across all campaigns", undefined, "ink"),
      kpiCount("Completed", ["Completed"], "Wrapped up", "ink"),
    ],
    detailSections: [
      { title: "Campaign", keys: ["name", "source", "extra:startDate", "extra:endDate", "status"] },
      { title: "Targeting", keys: ["destination", "extra:audience", "extra:audienceSize"] },
      { title: "Performance", keys: ["amount", "extra:enquiries"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Draft me copy ready karo, phir Scheduled karo.",
      "Live hone ke baad hi enquiries count karo.",
      "Budget aur enquiries bharke ROI nikaalo.",
    ],
    tabs: [
      { label: "Campaigns", hint: "Every marketing push." },
      { label: "Segments", hint: "Audience groups you target." },
      { label: "Referrals & coupons", hint: "Word-of-mouth engine." },
      { label: "Attribution", hint: "Which channel brought the booking." },
    ],
  },

  bookings: {
    id: "bookings",
    icon: Ticket,
    singular: "booking",
    plural: "bookings",
    statuses: ["Pending", "On hold", "Confirmed", "Completed", "Cancelled"],
    sources: ["Website", "WhatsApp", "Referral", "B2B agent", "Walk-in"],
    sections: ["Customer", "Trip", "Commercials", "Ownership", "Notes"],
    fields: [
      ...CONTACT_FIELDS,
      DESTINATION_FIELD,
      extra({ key: "departure", label: "Departure date", type: "date" }, "Trip"),
      extra({ key: "return", label: "Return date", type: "date" }, "Trip"),
      extra({ key: "pax", label: "Travellers", type: "number", placeholder: "2" }, "Trip"),
      {
        key: "detail",
        label: "Services booked",
        type: "text",
        group: "Trip",
        placeholder: "Flights + hotel + transfers",
      },
      { key: "amount", label: "Total booking value", type: "number", group: "Commercials" },
      extra({ key: "received", label: "Amount received", type: "number" }, "Commercials"),
      extra({ key: "cost", label: "Supplier cost", type: "number" }, "Commercials"),
      {
        key: "status",
        label: "Booking status",
        type: "select",
        options: "statuses",
        group: "Commercials",
      },
      ...OWNER_FIELDS,
      NOTES_FIELD,
    ],
    columns: [
      REF_COL,
      col("name", "Customer", "person"),
      col("destination", "Destination"),
      col("date", "Departure", "date"),
      { ...col("extra:pax", "Pax", "chip"), sortable: false },
      VALUE_COL,
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Confirmed", ["Confirmed"], "Ready to travel", "pine"),
      kpiCount(
        "Awaiting confirmation",
        ["Pending", "On hold"],
        "Customer or supplier pending",
        "butter",
      ),
      kpiSum("Booking value", "Confirmed bookings in view", ["Confirmed", "Completed"], "ink"),
      kpiSum("Outstanding", "Not yet received", ["Pending", "On hold"], "tomato"),
    ],
    detailSections: [
      { title: "Customer", keys: ["name", "email", "phone"] },
      {
        title: "Trip",
        keys: ["destination", "extra:departure", "extra:return", "extra:pax", "detail"],
      },
      { title: "Commercials", keys: ["amount", "extra:received", "extra:cost", "status"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Booking banane ke baad status Confirmed karo.",
      "Received amount bharte raho — outstanding report isse banti hai.",
      "Departure date ke saath operations manifest auto ban jata hai.",
    ],
    tabs: [
      { label: "All bookings", hint: "Every journey you have sold." },
      { label: "Reservations", hint: "Supplier-level reservations." },
      { label: "Amendments", hint: "Changes after confirmation." },
      { label: "Cancellations", statuses: ["Cancelled"], hint: "Cancelled bookings." },
      { label: "Refunds", hint: "Refund workflow and status." },
    ],
    boardStatuses: ["Pending", "On hold", "Confirmed", "Completed", "Cancelled"],
  },

  flights: {
    id: "flights",
    icon: Plane,
    singular: "reservation",
    plural: "reservations",
    statuses: ["Held", "Queued", "Ticketed", "Reissued", "Cancelled"],
    sources: ["Amadeus", "Sabre", "Travelport", "Airline NDC", "Direct"],
    sections: ["Passenger", "Flight", "Ticketing", "Ownership"],
    fields: [
      { key: "name", label: "Passenger name", type: "text", required: true, group: "Passenger" },
      { key: "email", label: "Email", type: "email", group: "Passenger" },
      { key: "phone", label: "Phone", type: "tel", group: "Passenger" },
      extra(
        { key: "pnr", label: "PNR / record locator", type: "text", placeholder: "ABC123" },
        "Flight",
      ),
      extra({ label: "Airline", type: "text", placeholder: "Emirates" }, "Flight"),
      extra({ label: "Sector", type: "text", placeholder: "BOM → DXB" }, "Flight"),
      extra(
        { key: "flightNo", label: "Flight number", type: "text", placeholder: "EK 501" },
        "Flight",
      ),
      { key: "date", label: "Departure date", type: "date", group: "Flight" },
      extra(
        {
          label: "Cabin",
          type: "select",
          options: ["Economy", "Premium economy", "Business", "First"],
        },
        "Flight",
      ),
      extra({ key: "ticketNo", label: "Ticket number", type: "text" }, "Ticketing"),
      { key: "amount", label: "Fare", type: "number", group: "Ticketing" },
      { key: "detail", label: "Routing summary", type: "text", group: "Flight" },
      {
        key: "status",
        label: "Reservation status",
        type: "select",
        options: "statuses",
        group: "Ticketing",
      },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Passenger", "person"),
      { ...col("extra:pnr", "PNR", "mono"), sortable: false },
      col("extra:sector", "Sector"),
      col("extra:airline", "Airline"),
      col("date", "Departure", "date"),
      { ...col("amount", "Fare", "money"), align: "right" },
      STATUS_COL,
    ],
    kpis: [
      kpiCount("Ticketed", ["Ticketed", "Reissued"], "Tickets issued", "pine"),
      kpiCount("On hold", ["Held", "Queued"], "Ticketing deadline pending", "tomato"),
      kpiSum("Fare value", "Across reservations in view", undefined, "ink"),
      kpiCount("All reservations", [], "In this view", "ink"),
    ],
    detailSections: [
      { title: "Passenger", keys: ["name", "email", "phone"] },
      {
        title: "Flight",
        keys: [
          "extra:pnr",
          "extra:airline",
          "extra:sector",
          "extra:flightNo",
          "date",
          "extra:cabin",
          "detail",
        ],
      },
      { title: "Ticketing", keys: ["extra:ticketNo", "amount", "status"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "PNR hamesha bhara karo — queue aur deadline isse track hoti hai.",
      "Hold tickets ka deadline dekh ke jaldi ticketing karo.",
      "Reissue ho gaya to purana ticket number notes me rakho.",
    ],
    tabs: [
      { label: "Flight search", hint: "Search fares and availability." },
      { label: "PNR queue", hint: "Reservations awaiting ticketing." },
      { label: "Tickets", statuses: ["Ticketed"], hint: "Issued tickets." },
      { label: "Ancillaries", hint: "Baggage, seats and meals." },
      {
        label: "Reissues & refunds",
        statuses: ["Reissued", "Cancelled"],
        hint: "Post-issue changes.",
      },
    ],
    boardStatuses: ["Held", "Queued", "Ticketed", "Reissued", "Cancelled"],
  },

  hotels: {
    id: "hotels",
    icon: Hotel,
    singular: "hotel",
    plural: "hotels",
    statuses: ["Requested", "Confirmed", "Vouchered", "Cancelled"],
    sources: ["Hotelbeds", "Direct contract", "DMC", "OTA"],
    sections: ["Stay", "Rooms", "Commercials", "Ownership"],
    fields: [
      { key: "name", label: "Hotel name", type: "text", required: true, group: "Stay" },
      { key: "destination", label: "City", type: "text", group: "Stay" },
      extra({ key: "checkin", label: "Check-in", type: "date" }, "Stay"),
      extra({ key: "checkout", label: "Check-out", type: "date" }, "Stay"),
      extra({ label: "Room type", type: "text", placeholder: "Deluxe sea view" }, "Rooms"),
      extra({ label: "Rooms", type: "number" }, "Rooms"),
      extra({ label: "Nights", type: "number" }, "Rooms"),
      extra(
        {
          label: "Meal plan",
          type: "select",
          options: ["Room only", "Breakfast", "Half board", "Full board", "All inclusive"],
        },
        "Rooms",
      ),
      { key: "amount", label: "Total rate", type: "number", group: "Commercials" },
      extra({ key: "confirmation", label: "Confirmation number", type: "text" }, "Commercials"),
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Commercials" },
      { key: "email", label: "Hotel email", type: "email", group: "Stay" },
      { key: "phone", label: "Hotel phone", type: "tel", group: "Stay" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Hotel"),
      col("destination", "City"),
      col("extra:checkin", "Check-in", "date"),
      { ...col("extra:nights", "Nights", "chip"), sortable: false },
      { ...col("extra:rooms", "Rooms", "chip"), sortable: false },
      { ...col("amount", "Rate", "money"), align: "right" },
      STATUS_COL,
    ],
    kpis: [
      kpiCount("Confirmed stays", ["Confirmed", "Vouchered"], "Ready for the guest", "pine"),
      kpiCount("Awaiting confirmation", ["Requested"], "Chasing the hotel", "butter"),
      kpiSum("Stay value", "Across this view", undefined, "ink"),
      kpiCount("All properties", [], "In this view", "ink"),
    ],
    detailSections: [
      {
        title: "Stay",
        keys: ["name", "destination", "extra:checkin", "extra:checkout", "email", "phone"],
      },
      { title: "Rooms", keys: ["extra:roomType", "extra:rooms", "extra:nights", "extra:mealPlan"] },
      { title: "Commercials", keys: ["amount", "extra:confirmation", "status"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Check-in / check-out date bhare bina voucher nahi banega.",
      "Confirmation number milte hi status Vouchered karo.",
      "Meal plan guest ko batana zaroori hai.",
    ],
    tabs: [
      { label: "Hotels", hint: "Every stay request and confirmation." },
      { label: "Room inventory", hint: "Rooms held across properties." },
      { label: "Rate plans", hint: "Contracted rates and seasons." },
      { label: "Vouchers", statuses: ["Vouchered"], hint: "Guest-ready vouchers." },
    ],
  },

  packages: {
    id: "packages",
    icon: Package,
    singular: "package",
    plural: "packages",
    statuses: ["Draft", "Published", "Sold out", "Archived"],
    sections: ["Package", "Itinerary", "Pricing", "Ownership"],
    fields: [
      { key: "name", label: "Package name", type: "text", required: true, group: "Package" },
      { key: "destination", label: "Destination", type: "text", group: "Package" },
      extra({ key: "nights", label: "Duration (nights)", type: "number" }, "Itinerary"),
      extra(
        {
          label: "Category",
          type: "select",
          options: ["Honeymoon", "Family", "Adventure", "Luxury", "Budget"],
        },
        "Package",
      ),
      extra({ label: "Highlights", type: "textarea", wide: true }, "Itinerary"),
      { key: "detail", label: "Inclusions", type: "text", group: "Itinerary" },
      { key: "amount", label: "Selling price", type: "number", group: "Pricing" },
      extra({ key: "cost", label: "Cost price", type: "number" }, "Pricing"),
      extra({ key: "seats", label: "Seats available", type: "number" }, "Pricing"),
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Pricing" },
      { key: "date", label: "Valid till", type: "date", group: "Pricing" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Package"),
      col("destination", "Destination"),
      { ...col("extra:nights", "Nights", "chip"), sortable: false },
      { ...col("amount", "Selling price", "money"), align: "right" },
      { ...col("extra:seats", "Seats", "chip"), sortable: false },
      STATUS_COL,
    ],
    kpis: [
      kpiCount("Published", ["Published"], "Live for sale", "pine"),
      kpiCount("Drafts", ["Draft"], "Still being built", "butter"),
      kpiSum("Catalogue value", "Selling price of all packages", undefined, "ink"),
      kpiCount("Sold out", ["Sold out"], "No seats left", "tomato"),
    ],
    detailSections: [
      {
        title: "Package",
        keys: ["name", "destination", "extra:category", "extra:nights", "status"],
      },
      { title: "Itinerary", keys: ["extra:highlights", "detail"] },
      { title: "Pricing", keys: ["amount", "extra:cost", "extra:seats", "date"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Draft me itinerary likho, sab set hone par Published karo.",
      "Seats 0 ho jaye to Sold out mark karo.",
      "Cost price bharna mat bhoolna — margin yahin se aata hai.",
    ],
    tabs: [
      { label: "Tour packages", hint: "Your sellable catalogue." },
      { label: "Activities", hint: "Single bookable experiences." },
      { label: "Fixed departures", hint: "Guaranteed departure dates." },
      { label: "Seasonal rates", hint: "Peak and off-season pricing." },
    ],
  },

  transfers: {
    id: "transfers",
    icon: Bus,
    singular: "transfer",
    plural: "transfers",
    statuses: ["Requested", "Assigned", "Confirmed", "Completed", "Cancelled"],
    sources: ["Direct supplier", "DMC", "Aggregator"],
    sections: ["Transfer", "Vehicle & driver", "Commercials", "Ownership"],
    fields: [
      { key: "name", label: "Guest name", type: "text", required: true, group: "Transfer" },
      extra(
        {
          label: "Transfer type",
          type: "select",
          options: ["Airport pickup", "Airport drop", "Private transfer", "City tour", "Intercity"],
        },
        "Transfer",
      ),
      extra({ key: "pickup", label: "Pickup point", type: "text" }, "Transfer"),
      extra({ key: "dropoff", label: "Drop-off point", type: "text" }, "Transfer"),
      { key: "destination", label: "City", type: "text", group: "Transfer" },
      { key: "date", label: "Pickup date", type: "date", group: "Transfer" },
      extra({ key: "time", label: "Pickup time", type: "text", placeholder: "14:30" }, "Transfer"),
      extra({ key: "pax", label: "Passengers", type: "number" }, "Transfer"),
      extra(
        { label: "Vehicle", type: "select", options: ["Sedan", "SUV", "Van", "Coach", "Luxury"] },
        "Vehicle & driver",
      ),
      extra({ key: "driver", label: "Driver name", type: "text" }, "Vehicle & driver"),
      extra({ label: "Driver phone", type: "tel" }, "Vehicle & driver"),
      { key: "amount", label: "Transfer cost", type: "number", group: "Commercials" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Commercials" },
      { key: "phone", label: "Guest phone", type: "tel", group: "Transfer" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Guest", "person"),
      { ...col("extra:transferType", "Type", "chip"), sortable: false },
      col("destination", "City"),
      col("date", "Pickup", "date"),
      { ...col("extra:vehicle", "Vehicle", "chip"), sortable: false },
      { ...col("amount", "Cost", "money"), align: "right" },
      STATUS_COL,
    ],
    kpis: [
      kpiCount("Confirmed", ["Confirmed", "Assigned"], "Driver allocated", "pine"),
      kpiCount("Awaiting assignment", ["Requested"], "No vehicle yet", "butter"),
      kpiSum("Transfer cost", "Across this view", undefined, "ink"),
      kpiCount("Completed", ["Completed"], "Trips done", "ink"),
    ],
    detailSections: [
      {
        title: "Transfer",
        keys: [
          "name",
          "phone",
          "extra:transferType",
          "extra:pickup",
          "extra:dropoff",
          "destination",
          "date",
          "extra:time",
          "extra:pax",
        ],
      },
      { title: "Vehicle & driver", keys: ["extra:vehicle", "extra:driver", "extra:driverPhone"] },
      { title: "Commercials", keys: ["amount", "status"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Pickup time 24-hour format me likho (14:30).",
      "Driver assign hote hi status Assigned karo.",
      "Guest ko driver number share karne ke baad Confirmed karo.",
    ],
    tabs: [
      { label: "Transfers", hint: "Every pickup and drop." },
      { label: "Vehicles", hint: "Your fleet and partners." },
      { label: "Drivers", hint: "Driver roster and contacts." },
      { label: "Rail, bus & cruise", hint: "Non-road transport options." },
    ],
  },

  visa: {
    id: "visa",
    icon: ShieldCheck,
    singular: "application",
    plural: "applications",
    statuses: ["Documents pending", "In review", "Submitted", "Approved", "Rejected"],
    sections: ["Applicant", "Application", "Appointment", "Ownership"],
    fields: [
      { key: "name", label: "Applicant name", type: "text", required: true, group: "Applicant" },
      extra({ key: "passport", label: "Passport number", type: "text" }, "Applicant"),
      extra({ label: "Passport expiry", type: "date" }, "Applicant"),
      extra({ label: "Nationality", type: "text" }, "Applicant"),
      { key: "destination", label: "Visa country", type: "text", group: "Application" },
      extra(
        {
          label: "Visa type",
          type: "select",
          options: ["Tourist", "Business", "Transit", "Student", "Work"],
        },
        "Application",
      ),
      extra({ label: "Application ID", type: "text" }, "Application"),
      { key: "date", label: "Submission date", type: "date", group: "Appointment" },
      extra({ key: "appointment", label: "Appointment date", type: "date" }, "Appointment"),
      extra({ key: "centre", label: "Appointment centre", type: "text" }, "Appointment"),
      { key: "amount", label: "Visa fee", type: "number", group: "Application" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Application" },
      { key: "email", label: "Email", type: "email", group: "Applicant" },
      { key: "phone", label: "Phone", type: "tel", group: "Applicant" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Applicant", "person"),
      col("destination", "Country"),
      { ...col("extra:visaType", "Type", "chip"), sortable: false },
      col("extra:appointment", "Appointment", "date"),
      { ...col("amount", "Fee", "money"), align: "right" },
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("In progress", ["In review", "Submitted"], "With the embassy", "butter"),
      kpiCount("Approved", ["Approved"], "Ready to travel", "pine"),
      kpiCount("Docs pending", ["Documents pending"], "Waiting on the customer", "tomato"),
      kpiSum("Fees collected", "Across this view", undefined, "ink"),
    ],
    detailSections: [
      {
        title: "Applicant",
        keys: [
          "name",
          "email",
          "phone",
          "extra:passport",
          "extra:passportExpiry",
          "extra:nationality",
        ],
      },
      {
        title: "Application",
        keys: ["destination", "extra:visaType", "extra:applicationId", "amount", "status"],
      },
      { title: "Appointment", keys: ["date", "extra:appointment", "extra:centre"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Passport 6 months se zyada valid hona chahiye — expiry check karo.",
      "Docs complete hone tak status Documents pending rakho.",
      "Appointment date set karke customer ko inform karo.",
    ],
    tabs: [
      { label: "Applications", hint: "Every visa application." },
      { label: "Document checklists", hint: "Per-country document lists." },
      { label: "Appointments", hint: "Embassy and VFS slots." },
      { label: "Insurance", hint: "Travel insurance policies." },
      { label: "Travel advisories", hint: "Country-wise advisories." },
    ],
  },

  groups: {
    id: "groups",
    icon: MapPinned,
    singular: "group",
    plural: "groups",
    statuses: ["Planning", "Open for sale", "Confirmed", "Departed", "Completed"],
    sections: ["Group", "Departure", "Budget", "Ownership"],
    fields: [
      { key: "name", label: "Group name", type: "text", required: true, group: "Group" },
      { key: "destination", label: "Destination", type: "text", group: "Group" },
      extra(
        {
          label: "Group type",
          type: "select",
          options: ["Leisure group", "Corporate offsite", "MICE", "Pilgrimage", "Student"],
        },
        "Group",
      ),
      { key: "date", label: "Departure date", type: "date", group: "Departure" },
      extra({ key: "return", label: "Return date", type: "date" }, "Departure"),
      extra({ key: "pax", label: "Expected pax", type: "number" }, "Departure"),
      extra({ label: "Confirmed pax", type: "number" }, "Departure"),
      extra({ label: "Room blocks", type: "number" }, "Departure"),
      { key: "amount", label: "Group budget", type: "number", group: "Budget" },
      extra({ label: "Cost per pax", type: "number" }, "Budget"),
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Budget" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Group"),
      col("destination", "Destination"),
      col("date", "Departure", "date"),
      { ...col("extra:pax", "Expected pax", "chip"), sortable: false },
      { ...col("amount", "Budget", "money"), align: "right" },
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Open for sale", ["Open for sale", "Planning"], "Filling up", "butter"),
      kpiCount("Confirmed", ["Confirmed", "Departed"], "Locked in", "pine"),
      kpiSum("Group budget", "Across this view", undefined, "ink"),
      kpiCount("All groups", [], "In this view", "ink"),
    ],
    detailSections: [
      { title: "Group", keys: ["name", "destination", "extra:groupType", "status"] },
      {
        title: "Departure",
        keys: ["date", "extra:return", "extra:pax", "extra:confirmedPax", "extra:roomBlocks"],
      },
      { title: "Budget", keys: ["amount", "extra:costPerPax"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Expected pax aur confirmed pax alag rakho — seat count clear rehta hai.",
      "Room blocks bharo, warna hotel oversell ho sakta hai.",
      "Departure date confirm hone par status Confirmed karo.",
    ],
    tabs: [
      { label: "Group trips", hint: "All group movements." },
      { label: "Delegates", hint: "Participant lists." },
      { label: "Room blocks", hint: "Held inventory per hotel." },
      { label: "Budgets", hint: "Cost vs quoted per group." },
      { label: "Suppliers", hint: "Vendors used per group." },
    ],
  },

  operations: {
    id: "operations",
    icon: ListTodo,
    singular: "trip",
    plural: "trips",
    statuses: ["Upcoming", "In progress", "Completed", "Delayed", "Cancelled"],
    sections: ["Trip", "Operations", "Assignment", "Ownership"],
    fields: [
      { key: "name", label: "Trip / departure", type: "text", required: true, group: "Trip" },
      { key: "destination", label: "Destination", type: "text", group: "Trip" },
      { key: "date", label: "Departure date", type: "date", group: "Trip" },
      extra({ key: "pax", label: "Travellers", type: "number" }, "Trip"),
      extra(
        { label: "Manifest", type: "select", options: ["Pending", "Shared", "Verified"] },
        "Operations",
      ),
      extra(
        {
          key: "vouchers",
          label: "Vouchers issued",
          type: "select",
          options: ["No", "Partial", "All"],
        },
        "Operations",
      ),
      extra({ label: "On-trip contact", type: "text" }, "Operations"),
      extra(
        { key: "incidents", label: "Incident notes", type: "textarea", wide: true },
        "Operations",
      ),
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Assignment" },
      { key: "amount", label: "Trip value", type: "number", group: "Assignment" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Trip"),
      col("destination", "Destination"),
      col("date", "Departure", "date"),
      { ...col("extra:pax", "Pax", "chip"), sortable: false },
      { ...col("extra:manifest", "Manifest", "chip"), sortable: false },
      { ...col("extra:vouchers", "Vouchers", "chip"), sortable: false },
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Upcoming", ["Upcoming"], "Departures ahead", "butter"),
      kpiCount("On trip now", ["In progress"], "Travelling right now", "pine"),
      kpiCount("Issues to watch", ["Delayed"], "Needs attention", "tomato"),
      kpiSum("In-flight value", "Upcoming and active trips", ["Upcoming", "In progress"], "ink"),
    ],
    detailSections: [
      { title: "Trip", keys: ["name", "destination", "date", "extra:pax"] },
      {
        title: "Operations",
        keys: ["extra:manifest", "extra:vouchers", "extra:onTripContact", "extra:incidents"],
      },
      { title: "Assignment", keys: ["status", "amount", "owner", "branch"] },
    ],
    tips: [
      "Har departure ka manifest Verified karo travel se pehle.",
      "Vouchers All hone ke baad hi status In progress karo.",
      "Incident aaya to yahin note karo — history ban jayegi.",
    ],
    tabs: [
      { label: "Departures", hint: "Everything leaving soon." },
      { label: "Manifests", hint: "Passenger lists per trip." },
      { label: "Daily operations", hint: "Today's operational board." },
      { label: "Vouchers", hint: "Issued service vouchers." },
      { label: "Incidents", hint: "On-trip issues and resolution." },
      { label: "Deadlines", hint: "Time-critical tasks." },
    ],
  },

  suppliers: {
    id: "suppliers",
    icon: Landmark,
    singular: "supplier",
    plural: "suppliers",
    statuses: ["Active", "Onboarding", "Suspended", "Inactive"],
    sources: ["DMC", "Airline", "Hotel chain", "Transport", "Insurance"],
    sections: ["Supplier", "Contact", "Commercials", "Ownership"],
    fields: [
      { key: "name", label: "Supplier name", type: "text", required: true, group: "Supplier" },
      extra(
        {
          label: "Category",
          type: "select",
          options: ["DMC", "Airline", "Hotel chain", "Transport", "Insurance", "Visa"],
        },
        "Supplier",
      ),
      { key: "destination", label: "City / region", type: "text", group: "Supplier" },
      extra({ key: "contact", label: "Contact person", type: "text" }, "Contact"),
      { key: "email", label: "Email", type: "email", group: "Contact" },
      { key: "phone", label: "Phone", type: "tel", group: "Contact" },
      extra(
        {
          key: "terms",
          label: "Payment terms",
          type: "select",
          options: ["Advance", "Net 15", "Net 30", "Net 45", "Credit"],
        },
        "Commercials",
      ),
      extra({ label: "Credit limit", type: "number" }, "Commercials"),
      { key: "amount", label: "Annual volume", type: "number", group: "Commercials" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Commercials" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Supplier"),
      { ...col("extra:category", "Category", "chip"), sortable: false },
      col("destination", "City"),
      { ...col("extra:terms", "Terms", "chip"), sortable: false },
      { ...col("amount", "Annual volume", "money"), align: "right" },
      STATUS_COL,
    ],
    kpis: [
      kpiCount("Active suppliers", ["Active"], "Working partners", "pine"),
      kpiCount("Onboarding", ["Onboarding"], "Documents pending", "butter"),
      kpiSum("Annual volume", "Across this view", undefined, "ink"),
      kpiCount("All suppliers", [], "In your network", "ink"),
    ],
    detailSections: [
      { title: "Supplier", keys: ["name", "extra:category", "destination", "status"] },
      { title: "Contact", keys: ["extra:contact", "email", "phone"] },
      { title: "Commercials", keys: ["extra:terms", "extra:creditLimit", "amount"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Category set karo — purchase orders isi se group hote hain.",
      "Payment terms galat hone se settlement mismatch hota hai.",
      "Suspended suppliers ko naye bookings me mat lo.",
    ],
    tabs: [
      { label: "Suppliers", hint: "Your partner network." },
      { label: "Contracts", hint: "Rate agreements and validity." },
      { label: "Allotments", hint: "Held inventory with suppliers." },
      { label: "Purchase orders", hint: "Committed purchases." },
      { label: "Settlements", hint: "Payables per supplier." },
    ],
  },

  support: {
    id: "support",
    icon: Headphones,
    singular: "ticket",
    plural: "tickets",
    statuses: ["Open", "In progress", "Escalated", "Resolved", "Closed"],
    sources: ["Phone", "Email", "WhatsApp", "Web form", "Walk-in"],
    sections: ["Customer", "Issue", "Resolution", "Ownership"],
    fields: [
      ...CONTACT_FIELDS,
      extra(
        {
          label: "Category",
          type: "select",
          options: ["Booking change", "Refund", "Voucher", "Billing", "Service quality", "Other"],
        },
        "Issue",
      ),
      extra(
        { label: "Priority", type: "select", options: ["Low", "Normal", "High", "Urgent"] },
        "Issue",
      ),
      { key: "detail", label: "Issue summary", type: "text", wide: true, group: "Issue" },
      { key: "source", label: "Reported via", type: "select", options: "sources", group: "Issue" },
      { key: "date", label: "SLA due", type: "date", group: "Issue" },
      extra({ label: "Resolution", type: "textarea", wide: true }, "Resolution"),
      { key: "amount", label: "Refund / cost impact", type: "number", group: "Resolution" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Resolution" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Customer", "person"),
      { ...col("extra:category", "Category", "chip"), sortable: false },
      { ...col("extra:priority", "Priority", "chip"), sortable: false },
      col("date", "SLA due", "date"),
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Open tickets", ["Open", "In progress"], "Being worked on", "butter"),
      kpiCount("Escalated", ["Escalated"], "Needs a manager", "tomato"),
      kpiCount("Resolved", ["Resolved", "Closed"], "Closed out", "pine"),
      kpiSum("Refund impact", "Across this view", undefined, "ink"),
    ],
    detailSections: [
      { title: "Customer", keys: ["name", "email", "phone", "source"] },
      { title: "Issue", keys: ["extra:category", "extra:priority", "detail", "date"] },
      { title: "Resolution", keys: ["extra:resolution", "amount", "status"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Priority set karo — SLA due date usi hisab se lagti hai.",
      "Escalate karte waqt resolution box me reason likho.",
      "Customer ko update dekar hi status Resolved karo.",
    ],
    tabs: [
      { label: "Support tickets", hint: "Everything customers reported." },
      { label: "Refund requests", hint: "Money going back." },
      { label: "Escalations", statuses: ["Escalated"], hint: "Needs senior attention." },
      { label: "Feedback", hint: "Post-trip reviews." },
      { label: "Knowledge base", hint: "Reusable answers." },
    ],
  },

  agents: {
    id: "agents",
    icon: Network,
    singular: "agent",
    plural: "agents",
    statuses: ["Active", "KYC pending", "Suspended", "Inactive"],
    sources: ["Direct", "Referral", "Marketplace"],
    sections: ["Agent", "Contact", "Commercials", "Ownership"],
    fields: [
      { key: "name", label: "Agency name", type: "text", required: true, group: "Agent" },
      extra(
        {
          key: "tier",
          label: "Agent tier",
          type: "select",
          options: ["Bronze", "Silver", "Gold", "Platinum"],
        },
        "Agent",
      ),
      { key: "destination", label: "City", type: "text", group: "Agent" },
      extra({ key: "licence", label: "IATA / licence no.", type: "text" }, "Agent"),
      extra({ key: "contact", label: "Contact person", type: "text" }, "Contact"),
      { key: "email", label: "Email", type: "email", group: "Contact" },
      { key: "phone", label: "Phone", type: "tel", group: "Contact" },
      extra({ label: "Commission %", type: "number" }, "Commercials"),
      extra({ label: "Credit limit", type: "number" }, "Commercials"),
      extra({ label: "Outstanding", type: "number" }, "Commercials"),
      { key: "amount", label: "Business volume", type: "number", group: "Commercials" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Commercials" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Agency"),
      { ...col("extra:tier", "Tier", "chip"), sortable: false },
      col("destination", "City"),
      { ...col("extra:commission", "Commission %", "chip"), sortable: false },
      { ...col("amount", "Volume", "money"), align: "right" },
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Active agents", ["Active"], "Selling for you", "pine"),
      kpiCount("KYC pending", ["KYC pending"], "Documents to verify", "butter"),
      kpiSum("Network volume", "Across this view", undefined, "ink"),
      kpiSum("Agent outstanding", "Credit to recover", undefined, "tomato"),
    ],
    detailSections: [
      { title: "Agent", keys: ["name", "extra:tier", "destination", "extra:licence", "status"] },
      { title: "Contact", keys: ["extra:contact", "email", "phone"] },
      {
        title: "Commercials",
        keys: ["extra:commission", "extra:creditLimit", "extra:outstanding", "amount"],
      },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "KYC complete hone tak credit limit mat do.",
      "Commission % set karo — payout isse calculate hota hai.",
      "Outstanding update karte raho, warna credit block hoga.",
    ],
    tabs: [
      { label: "Agents", hint: "Your B2B partners." },
      { label: "Sub-agents", hint: "Second-level network." },
      { label: "Distributors", hint: "Regional distributors." },
      { label: "KYC approvals", statuses: ["KYC pending"], hint: "Awaiting verification." },
      { label: "Credit limits", hint: "Exposure per agent." },
      { label: "Commissions", hint: "Payable commissions." },
      { label: "Agent portal", hint: "Self-service settings." },
    ],
  },

  finance: {
    id: "finance",
    icon: Wallet,
    singular: "invoice",
    plural: "invoices",
    statuses: ["Draft", "Sent", "Partially paid", "Paid", "Overdue"],
    sections: ["Customer", "Invoice", "Amounts", "Ownership"],
    fields: [
      ...CONTACT_FIELDS,
      {
        key: "detail",
        label: "Booking reference",
        type: "text",
        group: "Invoice",
        placeholder: "BK-2402",
      },
      { key: "destination", label: "Description", type: "text", group: "Invoice" },
      extra({ label: "Invoice date", type: "date" }, "Invoice"),
      { key: "date", label: "Due date", type: "date", group: "Invoice" },
      { key: "amount", label: "Invoice amount", type: "number", group: "Amounts" },
      extra({ key: "received", label: "Amount received", type: "number" }, "Amounts"),
      extra({ key: "gst", label: "GST rate %", type: "number" }, "Amounts"),
      extra(
        {
          label: "Payment mode",
          type: "select",
          options: ["Bank transfer", "UPI", "Card", "Cash", "Cheque"],
        },
        "Amounts",
      ),
      {
        key: "status",
        label: "Invoice status",
        type: "select",
        options: "statuses",
        group: "Amounts",
      },
      ...OWNER_FIELDS,
      NOTES_FIELD,
    ],
    columns: [
      REF_COL,
      col("name", "Customer", "person"),
      col("detail", "Booking"),
      col("date", "Due date", "date"),
      { ...col("amount", "Invoice amount", "money"), align: "right" },
      { ...col("extra:received", "Received", "money"), align: "right", sortable: false },
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiSum("Total invoiced", "Across this view", undefined, "ink"),
      kpiSum("Collected", "Payments received", ["Paid"], "pine"),
      kpiSum(
        "Outstanding",
        "Still to be received",
        ["Sent", "Partially paid", "Overdue"],
        "butter",
      ),
      kpiSum("Overdue", "Past the due date", ["Overdue"], "tomato"),
    ],
    detailSections: [
      { title: "Customer", keys: ["name", "email", "phone"] },
      { title: "Invoice", keys: ["detail", "destination", "extra:invoiceDate", "date", "status"] },
      { title: "Amounts", keys: ["amount", "extra:received", "extra:gst", "extra:paymentMode"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Due date bhare bina reminder email nahi jayega.",
      "Partial payment hua to Received amount update karo — status auto samajh aata hai.",
      "Overdue invoices ka weekly review karo.",
    ],
    tabs: [
      { label: "Invoices", hint: "Everything billed." },
      { label: "Payments", hint: "Money received." },
      {
        label: "Receivables",
        statuses: ["Sent", "Partially paid", "Overdue"],
        hint: "Money coming in.",
      },
      { label: "Payables", hint: "Money going out." },
      { label: "Ledger", hint: "Full accounting ledger." },
      { label: "Expenses", hint: "Operating expenses." },
      { label: "Tax & GST", hint: "Tax summaries." },
      { label: "Reconciliation", hint: "Match bank and books." },
      { label: "Profitability", hint: "Margin per booking." },
    ],
  },

  assistant: {
    id: "assistant",
    icon: Bot,
    singular: "draft",
    plural: "drafts",
    statuses: ["Draft", "Saved", "Sent"],
    sections: ["Draft", "Prompt", "Ownership"],
    fields: [
      { key: "name", label: "Draft title", type: "text", required: true, group: "Draft" },
      { key: "detail", label: "Generated summary", type: "textarea", wide: true, group: "Draft" },
      { key: "destination", label: "Destination", type: "text", group: "Prompt" },
      { key: "notes", label: "Original prompt", type: "textarea", wide: true, group: "Prompt" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Draft" },
      { key: "date", label: "Created", type: "date", group: "Draft" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Draft"),
      col("destination", "Destination"),
      col("detail", "Summary"),
      col("date", "Created", "date"),
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Saved drafts", ["Saved", "Draft"], "Ready to reuse", "pine"),
      kpiCount("Sent", ["Sent"], "Shared with customers", "ink"),
      kpiCount("All drafts", [], "In this view", "ink"),
      kpiCount("Destinations", [], "Covered in this view", "butter"),
    ],
    detailSections: [
      { title: "Draft", keys: ["name", "destination", "status", "date"] },
      { title: "Content", keys: ["detail", "notes"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Assistant tab me prompt likho aur ready itinerary generate karo.",
      "Pasand aaya output Save karke draft banke rakh lo.",
      "Draft ko quotation me convert kar sakte ho.",
    ],
    tabs: [
      { label: "Assistant", hint: "Chat with your travel co-pilot." },
      { label: "Itinerary generator", hint: "Day-by-day itinerary in seconds." },
      { label: "Sales intelligence", hint: "Which leads to chase first." },
      { label: "Operations insights", hint: "Where trips go wrong." },
    ],
  },

  automation: {
    id: "automation",
    icon: Workflow,
    singular: "workflow",
    plural: "workflows",
    statuses: ["Active", "Paused", "Draft"],
    sections: ["Workflow", "Trigger", "Ownership"],
    fields: [
      { key: "name", label: "Workflow name", type: "text", required: true, group: "Workflow" },
      { key: "detail", label: "What it does", type: "text", wide: true, group: "Workflow" },
      extra(
        {
          key: "trigger",
          label: "Trigger event",
          type: "select",
          options: [
            "Record created",
            "Status changed",
            "Date reached",
            "Payment received",
            "Schedule",
          ],
        },
        "Trigger",
      ),
      extra({ label: "Condition", type: "text" }, "Trigger"),
      extra(
        {
          label: "Action",
          type: "select",
          options: ["Send email", "Send WhatsApp", "Create task", "Assign owner", "Escalate"],
        },
        "Trigger",
      ),
      { key: "date", label: "Last run", type: "date", group: "Workflow" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Workflow" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Workflow"),
      col("extra:trigger", "Trigger"),
      col("extra:action", "Action"),
      col("date", "Last run", "date"),
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Active workflows", ["Active"], "Running automatically", "pine"),
      kpiCount("Paused", ["Paused"], "Temporarily off", "butter"),
      kpiCount("Drafts", ["Draft"], "Not live yet", "ink"),
      kpiCount("All workflows", [], "In this view", "ink"),
    ],
    detailSections: [
      { title: "Workflow", keys: ["name", "detail", "status", "date"] },
      { title: "Trigger", keys: ["extra:trigger", "extra:condition", "extra:action"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Har workflow ka ek trigger aur ek action rakho — simple rehta hai.",
      "Test karne ke baad hi Active karo.",
      "Execution history se failures check karo.",
    ],
    tabs: [
      { label: "Workflows", hint: "Build and manage automations." },
      { label: "Automated alerts", hint: "What your team gets pinged about." },
      { label: "Execution history", hint: "Every run and its outcome." },
      { label: "Approvals", hint: "Steps needing a human." },
    ],
  },

  reports: {
    id: "reports",
    icon: Compass,
    singular: "report",
    plural: "reports",
    statuses: ["Ready", "Scheduled", "Draft"],
    sections: ["Report", "Schedule", "Ownership"],
    fields: [
      { key: "name", label: "Report name", type: "text", required: true, group: "Report" },
      { key: "detail", label: "What it measures", type: "text", wide: true, group: "Report" },
      { key: "destination", label: "Scope", type: "text", group: "Report" },
      extra(
        {
          label: "Frequency",
          type: "select",
          options: ["On demand", "Daily", "Weekly", "Monthly"],
        },
        "Schedule",
      ),
      { key: "date", label: "Last generated", type: "date", group: "Schedule" },
      { key: "amount", label: "Value tracked", type: "number", group: "Report" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Schedule" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Report"),
      col("detail", "Measures"),
      { ...col("extra:frequency", "Frequency", "chip"), sortable: false },
      col("date", "Last generated", "date"),
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Ready reports", ["Ready"], "Run any time", "pine"),
      kpiCount("Scheduled", ["Scheduled"], "Delivered automatically", "butter"),
      kpiSum("Value tracked", "Across this view", undefined, "ink"),
      kpiCount("All reports", [], "In this view", "ink"),
    ],
    detailSections: [
      { title: "Report", keys: ["name", "detail", "destination", "amount"] },
      { title: "Schedule", keys: ["extra:frequency", "date", "status"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Report build karke Save karo — phir Schedule kar sakte ho.",
      "Frequency Daily rakho for cash-flow reports.",
      "Saved reports tab me sab ready-made reports milte hain.",
    ],
    tabs: [
      { label: "Sales", hint: "Pipeline and conversion." },
      { label: "Bookings", hint: "Volume and destinations." },
      { label: "Operations", hint: "Delivery and incidents." },
      { label: "Finance", hint: "Cash flow and margin." },
      { label: "B2B", hint: "Agent and corporate performance." },
      { label: "Marketing", hint: "Channel ROI." },
      { label: "Team performance", hint: "Who is closing what." },
      { label: "Saved reports", hint: "Your saved report library." },
    ],
  },

  distribution: {
    id: "distribution",
    icon: Globe,
    singular: "page",
    plural: "pages",
    statuses: ["Draft", "Published", "Archived"],
    sections: ["Page", "Content", "Ownership"],
    fields: [
      { key: "name", label: "Page / listing title", type: "text", required: true, group: "Page" },
      extra(
        {
          label: "Page type",
          type: "select",
          options: ["Homepage", "Destination", "Package", "Blog", "Landing", "Legal"],
        },
        "Page",
      ),
      extra(
        { key: "slug", label: "URL slug", type: "text", placeholder: "/bali-honeymoon" },
        "Page",
      ),
      { key: "destination", label: "Target destination", type: "text", group: "Page" },
      extra({ label: "Meta title", type: "text", wide: true }, "Content"),
      extra({ label: "Meta description", type: "textarea", wide: true }, "Content"),
      { key: "detail", label: "Content summary", type: "text", wide: true, group: "Content" },
      { key: "date", label: "Last updated", type: "date", group: "Page" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Page" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Page"),
      { ...col("extra:pageType", "Type", "chip"), sortable: false },
      col("extra:slug", "Slug", "mono"),
      col("destination", "Destination"),
      col("date", "Updated", "date"),
      STATUS_COL,
    ],
    kpis: [
      kpiCount("Published", ["Published"], "Live on your website", "pine"),
      kpiCount("Drafts", ["Draft"], "Not published yet", "butter"),
      kpiCount("All pages", [], "In this view", "ink"),
      kpiCount("Destinations", [], "Covered", "ink"),
    ],
    detailSections: [
      {
        title: "Page",
        keys: ["name", "extra:pageType", "extra:slug", "destination", "date", "status"],
      },
      { title: "Content", keys: ["extra:metaTitle", "extra:metaDescription", "detail"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Meta title 60 characters me rakho — Google me poora dikhta hai.",
      "Slug chhota aur keyword-rich rakho.",
      "Draft ready hone par Published karo.",
    ],
    tabs: [
      { label: "Website pages", hint: "Everything on your storefront." },
      { label: "Destinations", hint: "Destination guide pages." },
      { label: "Product catalogue", hint: "Sellable products." },
      { label: "B2C portal", hint: "Direct customer storefront." },
      { label: "B2B portal", hint: "Agent-facing portal." },
      { label: "Content & SEO", hint: "Metadata and keywords." },
    ],
  },

  integrations: {
    id: "integrations",
    icon: Plug,
    singular: "connection",
    plural: "connections",
    statuses: ["Not connected", "Connected", "Error"],
    sections: ["Connection", "Credentials", "Ownership"],
    fields: [
      { key: "name", label: "Connection name", type: "text", required: true, group: "Connection" },
      extra(
        {
          label: "Provider",
          type: "select",
          options: [
            "Amadeus GDS",
            "Sabre",
            "Travelport",
            "Hotelbeds",
            "WhatsApp Business",
            "Google Workspace",
            "Payment gateway",
            "SMTP",
          ],
        },
        "Connection",
      ),
      extra(
        { label: "Environment", type: "select", options: ["Sandbox", "Production"] },
        "Connection",
      ),
      { key: "detail", label: "Purpose", type: "text", wide: true, group: "Connection" },
      extra({ key: "apiKey", label: "API key / client ID", type: "text" }, "Credentials"),
      extra({ key: "webhook", label: "Webhook URL", type: "text", wide: true }, "Credentials"),
      { key: "amount", label: "Monthly cost", type: "number", group: "Connection" },
      { key: "date", label: "Last synced", type: "date", group: "Connection" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Connection" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Connection"),
      col("extra:provider", "Provider"),
      { ...col("extra:environment", "Environment", "chip"), sortable: false },
      col("date", "Last synced", "date"),
      { ...col("amount", "Monthly cost", "money"), align: "right" },
      STATUS_COL,
    ],
    kpis: [
      kpiCount("Connected", ["Connected"], "Live and syncing", "pine"),
      kpiCount("Not connected", ["Not connected"], "Waiting for setup", "butter"),
      kpiCount("Errors", ["Error"], "Needs a fix", "tomato"),
      kpiSum("Monthly cost", "Across this view", undefined, "ink"),
    ],
    detailSections: [
      {
        title: "Connection",
        keys: ["name", "extra:provider", "extra:environment", "detail", "status"],
      },
      { title: "Credentials", keys: ["extra:apiKey", "extra:webhook", "date"] },
      { title: "Ownership", keys: ["owner", "branch"] },
    ],
    tips: [
      "Pehle Sandbox me test karo, phir Production par switch karo.",
      "Error aaye to Connection logs tab dekho.",
      "API key rotate karne ke baad Last synced check karo.",
    ],
    tabs: [
      { label: "Supplier connections", hint: "GDS, hotels and DMC links." },
      { label: "Business apps", hint: "Payments, email and messaging." },
      { label: "API & webhooks", hint: "Keys and outbound hooks." },
      { label: "Connection logs", hint: "Sync history and failures." },
    ],
  },

  settings: {
    id: "settings",
    icon: Sparkles,
    singular: "record",
    plural: "records",
    statuses: ["Active", "Inactive"],
    sections: ["Record", "Details", "Ownership"],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, group: "Record" },
      { key: "detail", label: "Details", type: "text", wide: true, group: "Details" },
      { key: "destination", label: "Region / scope", type: "text", group: "Details" },
      { key: "email", label: "Email", type: "email", group: "Details" },
      { key: "phone", label: "Phone", type: "tel", group: "Details" },
      { key: "amount", label: "Value", type: "number", group: "Details" },
      { key: "date", label: "Date", type: "date", group: "Details" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Record" },
      ...OWNER_FIELDS,
    ],
    columns: [
      REF_COL,
      col("name", "Name"),
      col("detail", "Details"),
      col("destination", "Scope"),
      col("date", "Date", "date"),
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Active", ["Active"], "In use", "pine"),
      kpiCount("Total records", [], "In this view", "ink"),
      kpiSum("Total value", "Across this view", undefined, "ink"),
      kpiCount("Inactive", ["Inactive"], "Archived", "butter"),
    ],
    detailSections: [
      { title: "Record", keys: ["name", "status", "owner", "branch"] },
      { title: "Details", keys: ["detail", "destination", "email", "phone", "amount", "date"] },
    ],
    tips: [
      "Organisation tab me company details update karo.",
      "Employees tab se team members invite karo.",
      "Audit logs tab me har change ka record milta hai.",
    ],
    tabs: [
      { label: "Organisation", hint: "Company profile and branding." },
      { label: "Branches", hint: "Office locations." },
      { label: "Employees", hint: "Team directory." },
      { label: "Profile", hint: "Your personal account." },
      { label: "Roles & permissions", hint: "Who can do what." },
      { label: "Subscriptions", hint: "Plan and billing." },
      { label: "Tax settings", hint: "GST and tax defaults." },
      { label: "Audit logs", hint: "Complete change history." },
      { label: "Security", hint: "Passwords and sessions." },
      { label: "Custom fields", hint: "Your own extra fields." },
    ],
  },
};

/* ------------------------------------------------------------------ *
 * Lookup helpers
 * ------------------------------------------------------------------ */

/** Fallback schema for any module without a bespoke definition. */
function fallbackSchema(id: string): ModuleSchema {
  const module = findModule(id);
  return {
    id,
    icon: Compass,
    singular: module?.noun ?? "record",
    plural: `${module?.noun ?? "record"}s`,
    statuses: ["Active", "Pending", "Completed"],
    sections: ["Record", "Details", "Ownership"],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, group: "Record" },
      { key: "detail", label: "Details", type: "text", wide: true, group: "Details" },
      { key: "destination", label: "Destination", type: "text", group: "Details" },
      { key: "email", label: "Email", type: "email", group: "Details" },
      { key: "phone", label: "Phone", type: "tel", group: "Details" },
      { key: "amount", label: "Value", type: "number", group: "Details" },
      { key: "date", label: "Date", type: "date", group: "Details" },
      { key: "status", label: "Status", type: "select", options: "statuses", group: "Record" },
      ...OWNER_FIELDS,
      NOTES_FIELD,
    ],
    columns: [
      REF_COL,
      col("name", "Name"),
      col("destination", "Destination"),
      col("date", "Date", "date"),
      VALUE_COL,
      STATUS_COL,
      OWNER_COL,
    ],
    kpis: [
      kpiCount("Total records", [], "In this view", "ink"),
      kpiCount("Active", ["Active"], "In use", "pine"),
      kpiCount("Pending", ["Pending"], "Needs action", "butter"),
      kpiSum("Total value", "Across this view", undefined, "ink"),
    ],
    detailSections: [
      { title: "Record", keys: ["name", "status", "owner", "branch"] },
      { title: "Details", keys: ["detail", "destination", "email", "phone", "amount", "date"] },
    ],
    tips: [
      `Yeh ${module?.name ?? "module"} workspace hai — naya record banane ke liye "New" dabao.`,
      "Filters se status, owner aur date ke hisab se list chhaanto.",
      "Board view me cards ko drag karke status badal sakte ho.",
    ],
  };
}

export const getSchema = (id: string): ModuleSchema => schemas[id] ?? fallbackSchema(id);

/** Resolves a `title` for a tab from the schema, else the module catalogue. */
export const getTabDef = (schema: ModuleSchema, tab: string): TabDef =>
  schema.tabs?.find((t) => t.label === tab) ?? { label: tab };

/** Formats a module status list into badge-ready order. */
export const statusOptions = (schema: ModuleSchema) => schema.statuses;

export const isExtraKey = (key: string) => key.startsWith("extra:");
export const extraKeyName = (key: string) => (isExtraKey(key) ? key.slice(6) : key);

/** Formats a currency value with the active organisation currency. */
export const formatMoney = (value: number, currency: string) => money(value, currency);
