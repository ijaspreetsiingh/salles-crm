import type { ModuleDef } from "../domain/modules";
import { BRANCH_SEED, EMPLOYEE_SEED } from "./seed-data";

/* ==========================================================================
   Seed v2 — connected business chains.

   The old seed gave every module its own eight unrelated names, so a booking
   had no enquiry, an invoice had no booking, and every cross-module view
   (journey, interaction history, revenue attribution) was empty.

   This file builds ten real business stories instead. Each one is a
   traveller who moved through the pipeline, and every record names the one
   before it — so "what is still missing for this trip?" has an answer.
   ========================================================================== */

export type ChainRecord = {
  moduleId: string;
  reference: string;
  name: string;
  detail: string;
  destination: string;
  dateOffset: number;
  amount: number;
  status: string;
  email: string;
  phone: string;
  source: string;
  ownerName: string;
  branchName: string;
  notes: string;
  extra: Record<string, string | number>;
};

type Story = {
  customer: string;
  destination: string;
  travellers: number;
  value: number;
  cost: number;
  source: string;
  branch: string;
  owner: string;
  /** 0 = enquiry only, 4 = travelled and billed. */
  stage: 0 | 1 | 2 | 3 | 4;
};

const STORIES: Story[] = [
  {
    customer: "Aarav Sharma",
    destination: "Bali, Indonesia",
    travellers: 2,
    value: 385000,
    cost: 274000,
    source: "Website",
    branch: "Mumbai",
    owner: "Sarah Wilson",
    stage: 4,
  },
  {
    customer: "Priya Mehta",
    destination: "Dubai, UAE",
    travellers: 4,
    value: 512000,
    cost: 361000,
    source: "WhatsApp",
    branch: "Delhi",
    owner: "Rahul Verma",
    stage: 4,
  },
  {
    customer: "Rohan Kapoor",
    destination: "Paris, France",
    travellers: 2,
    value: 448000,
    cost: 322000,
    source: "Referral",
    branch: "Mumbai",
    owner: "Sarah Wilson",
    stage: 3,
  },
  {
    customer: "Ananya Iyer",
    destination: "Phuket, Thailand",
    travellers: 5,
    value: 296000,
    cost: 198000,
    source: "B2B agent",
    branch: "Bengaluru",
    owner: "Emily Chen",
    stage: 3,
  },
  {
    customer: "Vikram Singh",
    destination: "Singapore",
    travellers: 2,
    value: 214000,
    cost: 152000,
    source: "Website",
    branch: "Delhi",
    owner: "Rahul Verma",
    stage: 2,
  },
  {
    customer: "Neha Patel",
    destination: "Maldives",
    travellers: 2,
    value: 468000,
    cost: 340000,
    source: "WhatsApp",
    branch: "Mumbai",
    owner: "Sarah Wilson",
    stage: 2,
  },
  {
    customer: "Arjun Desai",
    destination: "Tokyo, Japan",
    travellers: 3,
    value: 372000,
    cost: 268000,
    source: "Website",
    branch: "Bengaluru",
    owner: "Emily Chen",
    stage: 1,
  },
  {
    customer: "Isha Gupta",
    destination: "London, UK",
    travellers: 2,
    value: 324000,
    cost: 236000,
    source: "Referral",
    branch: "Delhi",
    owner: "Rahul Verma",
    stage: 1,
  },
  {
    customer: "Kabir Rao",
    destination: "Bali, Indonesia",
    travellers: 6,
    value: 288000,
    cost: 190000,
    source: "Website",
    branch: "Bengaluru",
    owner: "Emily Chen",
    stage: 0,
  },
  {
    customer: "Meera Joshi",
    destination: "Dubai, UAE",
    travellers: 4,
    value: 356000,
    cost: 244000,
    source: "WhatsApp",
    branch: "Mumbai",
    owner: "Sarah Wilson",
    stage: 0,
  },
];

/**
 * Reference counters per module so the whole seed reads like a real ledger.
 * The chain references start after the base demo records (2401–2408) so the
 * two never collide.
 */
const counters: Record<string, number> = {};

const nextReference = (module: ModuleDef) => {
  counters[module.id] = (counters[module.id] ?? 2410) + 1;
  return `${module.prefix}-${counters[module.id]}`;
};

const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const slug = (name: string) => name.toLowerCase().replaceAll(" ", ".");

/**
 * Builds the ten connected stories. Every record carries the traveller's
 * name and the reference of the record before it, which is what lets the
 * UI stitch a chain together.
 */
export function buildChainRecords(modules: ModuleDef[]): ChainRecord[] {
  const mod = (id: string) => modules.find((m) => m.id === id)!;
  const out: ChainRecord[] = [];

  for (const story of STORIES) {
    const email = `${slug(story.customer)}@example.com`;
    const phone = `+91 98${STORIES.indexOf(story) + 10}00 12${STORIES.indexOf(story) + 10}45`;
    const base = {
      destination: story.destination,
      email,
      phone,
      source: story.source,
      ownerName: story.owner,
      branchName: story.branch,
    };

    // 1 — the enquiry
    const leadRef = nextReference(mod("leads"));
    out.push({
      ...base,
      moduleId: "leads",
      reference: leadRef,
      name: story.customer,
      detail: `${story.travellers} travellers · ${story.destination} · ${story.value.toLocaleString("en-IN")} budget`,
      dateOffset: -34,
      amount: story.value,
      status: story.stage === 0 ? "New" : story.stage === 1 ? "Quoted" : "Won",
      notes: `Enquiry from ${story.source}. Prefers a morning departure.`,
      extra: {
        travellers: story.travellers,
        tripType: story.value > 300000 ? "Luxury" : "Leisure",
        travelMonth: iso(10).slice(0, 7),
      },
    });

    if (story.stage === 0) continue;

    // 2 — the quotation
    const quoteRef = nextReference(mod("quotations"));
    out.push({
      ...base,
      moduleId: "quotations",
      reference: quoteRef,
      name: `Holiday package — ${story.destination}`,
      detail: `Quotation for ${story.customer} · from lead ${leadRef}`,
      dateOffset: -30,
      amount: story.value,
      status: story.stage === 1 ? "Sent" : "Accepted",
      notes: `Includes flights, ${story.travellers} nights stay, transfers and sightseeing.`,
      extra: { travellers: story.travellers, validUntil: iso(20), markup: 18 },
    });

    if (story.stage === 1) continue;

    // 3 — the booking
    const bookingRef = nextReference(mod("bookings"));
    out.push({
      ...base,
      moduleId: "bookings",
      reference: bookingRef,
      name: story.customer,
      detail: `Booking for ${story.customer} · from lead ${leadRef}`,
      dateOffset: -26,
      amount: story.value,
      status: "Confirmed",
      notes: `Departure briefing to be sent 3 days before travel.`,
      extra: {
        pax: story.travellers,
        cost: story.cost,
        received: story.stage === 4 ? Math.round(story.value * 0.6) : 0,
        departure: iso(21),
        return: iso(21 + story.travellers + 4),
        services: "Flights, hotel, transfers, sightseeing",
      },
    });

    if (story.stage === 2) continue;

    // 4 — the visa application
    const visaRef = nextReference(mod("visa"));
    out.push({
      ...base,
      moduleId: "visa",
      reference: visaRef,
      name: story.customer,
      detail: `Visa application for ${story.customer} · for booking ${bookingRef}`,
      dateOffset: -22,
      amount: 8500,
      status: story.stage === 4 ? "Approved" : "In review",
      notes: "Passport valid for 6 months beyond travel date.",
      extra: {
        passport: "A${4092831 + STORIES.indexOf(story)}",
        nationality: "Indian",
        visaType: story.destination.includes("Japan") ? "Tourist" : "e-Visa",
        applicationId: `APP-${4800 + STORIES.indexOf(story)}`,
        centre: "Mumbai",
      },
    });

    // 5 — the flight
    const flightRef = nextReference(mod("flights"));
    out.push({
      ...base,
      moduleId: "flights",
      reference: flightRef,
      name: `${story.customer} — ${story.destination}`,
      detail: `Flight for ${story.customer} · for booking ${bookingRef}`,
      dateOffset: -20,
      amount: Math.round(story.value * 0.42),
      status: story.stage === 4 ? "Ticketed" : "Held",
      notes: "Ticketing deadline: 3 days before departure.",
      extra: {
        pnr: `PNR${String(8100 + STORIES.indexOf(story))}`,
        route: `BOM → ${story.destination.split(",")[0]}`,
        airline: "IndiGo",
        deadline: iso(14),
      },
    });

    // 6 — the hotel
    const hotelRef = nextReference(mod("hotels"));
    out.push({
      ...base,
      moduleId: "hotels",
      reference: hotelRef,
      name: `${story.destination.split(",")[0]} Beach Resort`,
      detail: `Hotel for ${story.customer} · for booking ${bookingRef}`,
      dateOffset: -18,
      amount: Math.round(story.value * 0.38),
      status: story.stage === 4 ? "Vouchered" : "Confirmed",
      notes: "Breakfast included. Free cancellation until 7 days before arrival.",
      extra: { nights: story.travellers + 4, rooms: Math.ceil(story.travellers / 2), ratePlan: "BB" },
    });

    // 7 — the transfer
    const transferRef = nextReference(mod("transfers"));
    out.push({
      ...base,
      moduleId: "transfers",
      reference: transferRef,
      name: `Airport pickup — ${story.destination.split(",")[0]}`,
      detail: `Transfer for ${story.customer} · for booking ${bookingRef}`,
      dateOffset: -16,
      amount: Math.round(story.value * 0.05),
      status: "Confirmed",
      notes: "Driver to meet the flight with a name board.",
      extra: { vehicle: "Toyota Innova", driver: "Suresh", pickup: iso(21) },
    });

    if (story.stage === 3) continue;

    // 8 — the invoice
    const invoiceRef = nextReference(mod("finance"));
    out.push({
      ...base,
      moduleId: "finance",
      reference: invoiceRef,
      name: story.customer,
      detail: `Invoice for booking ${bookingRef}`,
      dateOffset: -12,
      amount: story.value,
      status: "Partially paid",
      notes: "Balance due 15 days before departure.",
      extra: {
        invoiceDate: iso(-12),
        received: Math.round(story.value * 0.6),
        gst: Math.round(story.value * 0.05),
        paymentMode: "Bank transfer",
      },
    });

    // 9 — the post-trip support ticket
    const ticketRef = nextReference(mod("support"));
    out.push({
      ...base,
      moduleId: "support",
      reference: ticketRef,
      name: `Post-trip feedback — ${story.customer}`,
      detail: `Feedback for booking ${bookingRef} · ${story.customer}`,
      dateOffset: 6,
      amount: 0,
      status: "Open",
      notes: "Collect the hotel review and settle the supplier invoice.",
      extra: { category: "Service quality", priority: "Low" },
    });
  }

  return out;
}

/** Tasks that belong to the chains above, so "my day" is never empty. */
export function buildChainTasks(): Array<{
  title: string;
  type: string;
  offset: number;
  priority: string;
  done: boolean;
  owner: string;
  relatedModule: string;
  relatedReference: string;
}> {
  return [
    {
      title: "Collect balance payment for BK-2401",
      type: "Payment collection",
      offset: 0,
      priority: "Urgent",
      done: false,
      owner: "Sarah Wilson",
      relatedModule: "finance",
      relatedReference: "INV-2401",
    },
    {
      title: "Send departure briefing for Priya Mehta",
      type: "Departure",
      offset: 0,
      priority: "High",
      done: false,
      owner: "Rahul Verma",
      relatedModule: "bookings",
      relatedReference: "BK-2402",
    },
    {
      title: "Chase Rohan Kapoor for visa documents",
      type: "Documents",
      offset: 1,
      priority: "High",
      done: false,
      owner: "Sarah Wilson",
      relatedModule: "visa",
      relatedReference: "VIS-2403",
    },
    {
      title: "Confirm Bali hotel voucher with DMC",
      type: "Supplier follow-up",
      offset: 2,
      priority: "Normal",
      done: false,
      owner: "Emily Chen",
      relatedModule: "hotels",
      relatedReference: "HTL-2401",
    },
    {
      title: "Reconcile supplier settlement for March",
      type: "Finance",
      offset: 3,
      priority: "Normal",
      done: false,
      owner: "Daniel Kumar",
      relatedModule: "finance",
      relatedReference: "INV-2401",
    },
    {
      title: "Call Kabir Rao back about Bali dates",
      type: "Sales follow-up",
      offset: 0,
      priority: "High",
      done: false,
      owner: "Emily Chen",
      relatedModule: "leads",
      relatedReference: "LD-2409",
    },
    {
      title: "Send Tokyo quotation to Arjun Desai",
      type: "Sales follow-up",
      offset: 1,
      priority: "Normal",
      done: false,
      owner: "Emily Chen",
      relatedModule: "quotations",
      relatedReference: "QT-2407",
    },
    {
      title: "Collect post-trip feedback from Aarav Sharma",
      type: "Customer care",
      offset: 4,
      priority: "Low",
      done: false,
      owner: "Priya Nair",
      relatedModule: "support",
      relatedReference: "TKT-2401",
    },
    {
      title: "Issue tickets for Neha Patel before deadline",
      type: "Ticketing",
      offset: -1,
      priority: "Urgent",
      done: false,
      owner: "Rahul Verma",
      relatedModule: "flights",
      relatedReference: "FLT-2405",
    },
    {
      title: "Update Maldives itinerary PDF",
      type: "Trip operations",
      offset: 2,
      priority: "Normal",
      done: true,
      owner: "Sarah Wilson",
      relatedModule: "bookings",
      relatedReference: "BK-2405",
    },
  ];
}

/** Conversations that hang off the seeded customers. */
export function buildChainConversations(): Array<{
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  subject: string;
  status: string;
  assignedTo: string;
  channel: string;
  messages: Array<{ direction: "in" | "out"; body: string; sentByName?: string }>;
}> {
  const staff = EMPLOYEE_SEED.filter((e) => e.active).map((e) => e.name);
  return STORIES.slice(0, 6).map((story, i) => ({
    contactName: story.customer,
    contactEmail: `${slug(story.customer)}@example.com`,
    contactPhone: `+91 98${10 + i}00 12${10 + i}45`,
    subject: `${story.destination} trip for ${story.travellers} travellers`,
    status: i < 2 ? "Open" : i < 4 ? "In progress" : "Resolved",
    assignedTo: staff[i % staff.length] ?? "Sarah Wilson",
    channel: i % 3 === 0 ? "WhatsApp" : i % 3 === 1 ? "Email" : "Shared inbox",
    messages: [
      {
        direction: "in",
        body: `Hi, we are planning a trip to ${story.destination} for ${story.travellers} people. Can you share a quote with hotels and transfers included?`,
      },
      {
        direction: "out",
        body: `Thank you for reaching out! I have shared the itinerary with a ${story.value.toLocaleString("en-IN")} budget. Shall we hold the rooms for 48 hours while you review?`,
        sentByName: staff[i % staff.length] ?? "Sarah Wilson",
      },
      {
        direction: "in",
        body: "That works. Please proceed and send the documents for the visa.",
      },
    ],
  }));
}

export const CHAIN_BRANCHES = BRANCH_SEED;
