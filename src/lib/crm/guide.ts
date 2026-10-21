import type { Module } from "./catalog";

/* ==========================================================================
   The guide.

   One plain-language sentence explaining what each page is for, the verb
   for its primary action, and a three-step explanation shown the first
   time a page is empty. This is what lets a brand-new user understand a
   screen without reading a manual.
   ========================================================================== */

export type Archetype = "pipeline" | "ledger" | "catalogue" | "queue" | "schedule" | "special";

export type ModuleGuide = {
  /** What this page is for — one sentence, no jargon. */
  purpose: string;
  /** Which layout the page uses. */
  archetype: Archetype;
  /** The primary action, written as verb + object. */
  primary: string;
  /** Shown when the page has no records yet. */
  empty: {
    title: string;
    description: string;
    steps: string[];
  };
  /** The views that survive the tab cleanup. */
  views: Array<{ label: string; statuses?: string[]; hint?: string }>;
};

const g = (
  purpose: string,
  archetype: Archetype,
  primary: string,
  empty: ModuleGuide["empty"],
  views: ModuleGuide["views"],
): ModuleGuide => ({ purpose, archetype, primary, empty, views });

export const guides: Record<string, ModuleGuide> = {
  leads: g(
    "Every enquiry that comes in about a trip, from the first message to a confirmed journey.",
    "pipeline",
    "Add an enquiry",
    {
      title: "No enquiries yet",
      description:
        "An enquiry is any question about a trip — a flight, a hotel, a holiday package. Add one here and it becomes your first lead.",
      steps: [
        "Add who asked and how to reach them",
        "Set the stage to New",
        "Move it along as you reply",
      ],
    },
    [
      { label: "All enquiries", hint: "Everything, newest first." },
      {
        label: "Pipeline",
        statuses: ["New", "Contacted", "Qualified", "Quoted"],
        hint: "Drag a card to move it to the next stage.",
      },
      { label: "Follow-ups", hint: "Enquiries that still need a reply." },
      { label: "Sources", hint: "Where your enquiries come from." },
    ],
  ),
  customers: g(
    "Everyone who travels with you — their details, their history and their next trip.",
    "catalogue",
    "Add a customer",
    {
      title: "No customers yet",
      description:
        "A customer record holds everything you know about one traveller: contact details, trip history and lifetime value.",
      steps: [
        "Add the traveller's name and contact",
        "Record a trip or two",
        "Their history builds itself from there",
      ],
    },
    [
      { label: "All customers", hint: "Everyone you have travelled with." },
      { label: "Travellers", hint: "Traveller profiles and documents." },
      { label: "Loyalty", hint: "Your repeat travellers." },
      { label: "Documents", hint: "Passports, visas and policies." },
    ],
  ),
  quotations: g(
    "Priced proposals you send to customers, with the costs and margin behind every line.",
    "ledger",
    "Add a price quote",
    {
      title: "No quotations yet",
      description:
        "A quotation is the price you show a customer. Build the itinerary, set your markup, and send it.",
      steps: [
        "Name the trip and the travellers",
        "Add the services and what they cost you",
        "Set your markup and send",
      ],
    },
    [
      { label: "All quotations", hint: "Drafts, sent and accepted." },
      { label: "Drafts", statuses: ["Draft"], hint: "Still being written." },
      { label: "Sent", statuses: ["Sent"], hint: "Waiting for a decision." },
      { label: "Accepted", statuses: ["Accepted"], hint: "Ready to convert into a booking." },
    ],
  ),
  companies: g(
    "Companies you handle travel for, and the rules you follow when booking for them.",
    "ledger",
    "Add a business account",
    {
      title: "No companies yet",
      description:
        "A company record stores their travel policy, approved cost centres and the people who travel for them.",
      steps: [
        "Add the company and a contact",
        "Set their travel policy",
        "Add their employees as travellers",
      ],
    },
    [
      { label: "All companies", hint: "Every corporate account." },
      { label: "Travel requests", hint: "Open requests to approve." },
      { label: "Policies", hint: "Rules and limits per company." },
      { label: "Cost centres", hint: "Where each trip is billed." },
    ],
  ),
  inbox: g(
    "Every conversation with a customer — WhatsApp, email and calls — next to the record it belongs to.",
    "special",
    "Start a conversation",
    {
      title: "No conversations yet",
      description:
        "When a customer writes to you, the message lands here so nobody has to chase an answer.",
      steps: [
        "Reply to a customer in any channel",
        "Link the conversation to their record",
        "Mark it resolved when you are done",
      ],
    },
    [
      { label: "All", hint: "Every open and closed conversation." },
      { label: "Mine", hint: "Conversations assigned to you." },
      { label: "Unassigned", hint: "Nobody has picked these up yet." },
    ],
  ),
  campaigns: g(
    "Marketing offers, the audiences they reach, and the bookings they actually produce.",
    "ledger",
    "Start a campaign",
    {
      title: "No campaigns yet",
      description:
        "A campaign is an offer you push to a group of travellers. Track who joined and what it earned.",
      steps: [
        "Name the campaign and the audience",
        "Set the offer",
        "Enquiries carry the campaign as their source",
      ],
    },
    [
      { label: "All campaigns", hint: "Live, paused and finished." },
      { label: "Live", statuses: ["Active"], hint: "Currently running." },
      { label: "Drafts", statuses: ["Draft"], hint: "Not published yet." },
    ],
  ),
  bookings: g(
    "Every confirmed trip — who is travelling, what they booked and everything still to do.",
    "pipeline",
    "Add a trip",
    {
      title: "No bookings yet",
      description:
        "A booking is a confirmed trip. Everything else — flights, hotels, visa, invoice — hangs off it.",
      steps: [
        "Add the traveller and the trip",
        "Add the services they booked",
        "Invoice it and watch the journey complete",
      ],
    },
    [
      { label: "All bookings", hint: "Every trip, confirmed and not." },
      {
        label: "Awaiting confirmation",
        statuses: ["Pending", "On hold"],
        hint: "Still waiting on a supplier.",
      },
      { label: "Confirmed", statuses: ["Confirmed"], hint: "Travellers are going." },
      { label: "Cancelled", statuses: ["Cancelled"], hint: "Closed out." },
    ],
  ),
  flights: g(
    "Air reservations, ticketing deadlines and everything that can go wrong on a flight.",
    "schedule",
    "Add a flight",
    {
      title: "No flights yet",
      description:
        "Track every air reservation, the PNR, and the ticketing deadline so nothing is missed.",
      steps: [
        "Add the route and the PNR",
        "Set the ticketing deadline",
        "The queue sorts itself by deadline",
      ],
    },
    [
      { label: "All reservations", hint: "Every flight on file." },
      { label: "PNR queue", statuses: ["Held", "Queued"], hint: "Waiting to be ticketed." },
      { label: "Ticketed", statuses: ["Ticketed"], hint: "Issued and confirmed." },
      { label: "Cancellations", statuses: ["Cancelled"], hint: "Reissues and refunds." },
    ],
  ),
  hotels: g(
    "Hotel contracts, room allotments and the guest confirmations that come with them.",
    "catalogue",
    "Add a hotel",
    {
      title: "No hotels yet",
      description:
        "Add the properties you work with so you can track your rates, allotments and vouchers.",
      steps: [
        "Add the property and your rate",
        "Set how many rooms you can sell",
        "Vouchers follow your bookings",
      ],
    },
    [
      { label: "All hotels", hint: "Every property." },
      { label: "Room inventory", hint: "What you have available." },
      { label: "Rate plans", hint: "The prices you sell at." },
    ],
  ),
  packages: g(
    "The trips you package and sell — what they cost, what they sell for, and when they leave.",
    "catalogue",
    "Add a package",
    {
      title: "No packages yet",
      description: "A package is a trip you designed: hotels, transfers, activities and a price.",
      steps: [
        "Name the package and the destination",
        "Build the day-by-day plan",
        "Set seasonal pricing",
      ],
    },
    [
      { label: "All packages", hint: "Everything you sell." },
      { label: "Fixed departures", hint: "Trips with a set departure date." },
      { label: "Seasonal rates", hint: "Prices by season." },
    ],
  ),
  transfers: g(
    "Airport pickups, city tours and every connection in between.",
    "schedule",
    "Add a transfer",
    {
      title: "No transfers yet",
      description: "Keep every pickup, driver and vehicle in one place so arrivals run smoothly.",
      steps: [
        "Add the transfer and the flight it follows",
        "Assign a vehicle and driver",
        "Travellers get the details",
      ],
    },
    [
      { label: "All transfers", hint: "Every movement you handle." },
      { label: "Vehicles", hint: "Your fleet." },
      { label: "Drivers", hint: "Who is on the road." },
    ],
  ),
  visa: g(
    "Travel documents and insurance, tracked from first upload to approval.",
    "queue",
    "Start a visa application",
    {
      title: "No visa applications yet",
      description:
        "Each application has a document checklist and an appointment, so you always know what is missing.",
      steps: [
        "Add the applicant and the destination",
        "Work through the document checklist",
        "Submit and track the approval",
      ],
    },
    [
      { label: "All applications", hint: "Every file in progress." },
      {
        label: "Documents pending",
        statuses: ["Documents pending"],
        hint: "Waiting on paperwork.",
      },
      { label: "In review", statuses: ["In review"], hint: "With the consulate." },
      { label: "Approved", statuses: ["Approved"], hint: "Ready to travel." },
    ],
  ),
  groups: g(
    "Group trips, conferences and events, with one rooming list and one budget.",
    "ledger",
    "Add a group",
    {
      title: "No groups yet",
      description:
        "A group brings many travellers, many rooms and one budget. Keep it in one place.",
      steps: [
        "Add the group and the dates",
        "Add delegates and their rooms",
        "Track the budget against actuals",
      ],
    },
    [
      { label: "All groups", hint: "Every group trip." },
      { label: "Delegates", hint: "Who is travelling." },
      { label: "Room blocks", hint: "Rooms held per hotel." },
    ],
  ),
  operations: g(
    "The day-of view: who leaves, what they need, and what could go wrong.",
    "schedule",
    "Open the departure board",
    {
      title: "No departures yet",
      description:
        "The departure board is the list of trips leaving soon, with a checklist for each one.",
      steps: [
        "Create a booking",
        "It appears here on the departure board",
        "Tick off the checklist as you go",
      ],
    },
    [
      { label: "Departures", hint: "Trips leaving, soonest first." },
      { label: "Manifests", hint: "Final traveller lists." },
      { label: "Vouchers", hint: "Documents travellers need." },
      { label: "Incidents", hint: "Anything that went wrong." },
    ],
  ),
  suppliers: g(
    "The partners you sell through — their rates, your commitments and what you owe them.",
    "ledger",
    "Add a partner",
    {
      title: "No suppliers yet",
      description:
        "Add the airlines, hotels and DMCs you work with to track rates, allotments and settlement.",
      steps: [
        "Add the supplier and what they offer",
        "Add your rate or contract",
        "Bookings settle against them",
      ],
    },
    [
      { label: "All suppliers", hint: "Every partner." },
      { label: "Contracts", hint: "Agreements and expiry dates." },
      { label: "Allotments", hint: "What you have committed." },
    ],
  ),
  support: g(
    "Customer problems, from the first complaint to the refund.",
    "queue",
    "Log a problem",
    {
      title: "No tickets yet",
      description:
        "Every problem a customer raises gets a ticket, an owner and a clock — so nothing is dropped.",
      steps: [
        "Log the problem and who raised it",
        "Assign it to someone",
        "Resolve it and record the outcome",
      ],
    },
    [
      { label: "All tickets", hint: "Open and resolved." },
      { label: "Open", statuses: ["Open"], hint: "Not started yet." },
      { label: "In progress", statuses: ["In progress"], hint: "Being worked on." },
      { label: "Escalated", statuses: ["Escalated"], hint: "Needs a manager." },
    ],
  ),
  agents: g(
    "The B2B agents who sell your trips on your behalf.",
    "ledger",
    "Invite an agent",
    {
      title: "No agents yet",
      description:
        "Give each agent a credit limit, a commission rate and a portal they can book from.",
      steps: [
        "Add the agent and their contact",
        "Set their credit limit and commission",
        "Approve their KYC to let them book",
      ],
    },
    [
      { label: "All agents", hint: "Everyone in the network." },
      { label: "KYC pending", statuses: ["KYC pending"], hint: "Waiting on documents." },
      { label: "Active", statuses: ["Active"], hint: "Approved and trading." },
    ],
  ),
  finance: g(
    "Every invoice, payment and margin — where the money is, and who still owes you.",
    "ledger",
    "Add an invoice",
    {
      title: "No invoices yet",
      description:
        "Invoices track what a customer owes you. Payments, receivables and margin follow automatically.",
      steps: [
        "Create an invoice against a booking",
        "Record payments as they arrive",
        "Watch receivables age in the sidebar",
      ],
    },
    [
      { label: "All invoices", hint: "Every invoice." },
      {
        label: "Receivables",
        statuses: ["Sent", "Partially paid", "Overdue"],
        hint: "Money still owed to you.",
      },
      { label: "Overdue", statuses: ["Overdue"], hint: "Past the due date." },
      { label: "Paid", statuses: ["Paid"], hint: "Settled." },
    ],
  ),
  assistant: g(
    "A co-pilot that knows your workspace — ask it anything about your business.",
    "special",
    "Ask a question",
    {
      title: "Ask your first question",
      description:
        "The assistant reads your live workspace, so it can answer questions about real bookings, revenue and customers.",
      steps: [
        "Ask about your business",
        "It uses your live data, not guesses",
        "Turn any answer into an action",
      ],
    },
    [{ label: "Assistant", hint: "Ask anything about your workspace." }],
  ),
  automation: g(
    "Rules that do the repetitive work for you — assign, remind, escalate.",
    "special",
    "New rule",
    {
      title: "No workflows yet",
      description:
        "A workflow watches for something, checks a condition and does something — like reminding you about quotes that are about to expire.",
      steps: [
        "Choose what starts the rule",
        "Add the condition to check",
        "Choose what should happen",
      ],
    },
    [
      { label: "Workflows", hint: "Your automation rules." },
      { label: "Execution history", hint: "What ran, and when." },
    ],
  ),
  reports: g(
    "Your business turned into numbers you can act on.",
    "special",
    "Save this view",
    {
      title: "No report data yet",
      description:
        "Reports are built from your live records. Create a booking or an invoice and the numbers appear here.",
      steps: ["Pick a report type", "Set a date range", "Drill into anything that looks odd"],
    },
    [
      { label: "Sales", hint: "Enquiries, pipeline and conversion." },
      { label: "Bookings", hint: "Trips, destinations and value." },
      { label: "Finance", hint: "Revenue, margin and receivables." },
      { label: "Team", hint: "How each person is doing." },
    ],
  ),
  distribution: g(
    "Your public website — the pages, destinations and packages that customers see.",
    "catalogue",
    "Add a page",
    {
      title: "No pages yet",
      description:
        "Create the pages of your website and publish the destinations and packages you want to sell.",
      steps: [
        "Add a page and its content",
        "Publish the destinations you sell",
        "Your B2C portal updates itself",
      ],
    },
    [
      { label: "Website pages", hint: "Every page on your site." },
      { label: "Destinations", hint: "Where you take people." },
      { label: "Product catalogue", hint: "What you sell." },
    ],
  ),
  integrations: g(
    "The systems you connect to — GDS, suppliers, payment gateways and your own API.",
    "special",
    "Connect a system",
    {
      title: "Nothing connected yet",
      description: "Connect the tools you already use and Traveldesk will talk to them for you.",
      steps: ["Pick a provider", "Choose sandbox or production", "Test the connection"],
    },
    [
      { label: "Supplier connections", hint: "GDS, DMCs, bed banks." },
      { label: "Business apps", hint: "Email, calendars, payments." },
      { label: "API & webhooks", hint: "Build on top of Traveldesk." },
      { label: "Connection logs", hint: "Recent traffic and errors." },
    ],
  ),
  settings: g(
    "Your organisation, your team and the way you work.",
    "special",
    "Save changes",
    {
      title: "Your workspace is ready",
      description:
        "Set up your branches, invite your team and decide who can see what. Everything here is saved as you go.",
      steps: [
        "Add your branches",
        "Invite the team and give them roles",
        "Adjust appearance to taste",
      ],
    },
    [
      { label: "Organisation", hint: "Your company details, tax and currency." },
      { label: "People & roles", hint: "Who works here and what they can do." },
      { label: "Branches", hint: "Your offices." },
      { label: "Appearance", hint: "Theme, density and defaults." },
      { label: "System", hint: "Audit log, custom fields, API keys, billing." },
    ],
  ),
};

export const guideFor = (module: Module): ModuleGuide =>
  guides[module.id] ??
  g(
    module.description,
    "ledger",
    `Create ${module.noun}`,
    {
      title: `No ${module.noun}s yet`,
      description: module.description,
      steps: ["Add the details", "Save it", "It appears in your list"],
    },
    [{ label: "All", hint: `Every ${module.noun}.` }],
  );
