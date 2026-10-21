/**
 * Plain language.
 *
 * Every label a person reads goes through here. The internals can be
 * "leads", "Quoted", "Receivables", "Gross margin" — the person using the
 * screen should never have to learn any of that.
 *
 * The rule: say the thing the person would say out loud.
 *   "Leads & enquiries"  -> "Enquiries"
 *   "Gross margin"       -> "Your profit"
 *   "Receivables"        -> "Money owed to you"
 */

import type { Module } from "./catalog";

/** Module names, rewritten for people. */
const MODULE_NAMES: Record<string, string> = {
  leads: "Enquiries",
  customers: "Customers",
  quotations: "Price quotes",
  companies: "Business accounts",
  inbox: "Conversations",
  campaigns: "Marketing",
  bookings: "Trips",
  flights: "Flights",
  hotels: "Hotels",
  packages: "Packages",
  transfers: "Ground transport",
  visa: "Visas & insurance",
  groups: "Groups & events",
  operations: "Departures",
  suppliers: "Partners",
  support: "Customer problems",
  agents: "Agents",
  finance: "Money",
  assistant: "Ask the assistant",
  automation: "Rules that run themselves",
  reports: "Numbers",
  distribution: "Your website",
  integrations: "Connected systems",
  settings: "Settings",
  tasks: "Tasks",
  overview: "Today",
  insights: "How the business is doing",
};

/** Words that appear in tables, filters and headings. */
const PHRASES: Array<[RegExp, string]> = [
  [/^leads? & enquiries$/i, "Enquiries"],
  [/^sales & crm$/i, "Selling"],
  [/^bookings & trips$/i, "Trips"],
  [/^b2b network$/i, "Agent network"],
  [/^ai & automation$/i, "Smart tools"],
  [/^reports & analytics$/i, "Numbers"],
  [/^website & distribution$/i, "Your website"],
  [/^trip operations$/i, "Departures"],
  [/^suppliers & contracts$/i, "Partners"],
  [/^support & complaints$/i, "Customer problems"],
  [/^b2b agent network$/i, "Agents"],
  [/^visa & insurance$/i, "Visas & insurance"],
  [/^companies & corporate$/i, "Business accounts"],
  [/^finance & accounting$/i, "Money"],
  [/^workflow automation$/i, "Rules that run themselves"],
  [/^administration$/i, "Settings"],
  [/^ground transport$/i, "Ground transport"],
  [/^packages & activities$/i, "Packages"],
  [/^flights & ticketing$/i, "Flights"],
  [/^hotels & stays$/i, "Hotels"],
  [/^groups & mice$/i, "Groups & events"],
  [/^ai assistant$/i, "Ask the assistant"],
  [/^ground transport$/i, "Ground transport"],
  [/^quotations$/i, "Price quotes"],
  [/^campaigns$/i, "Marketing"],
  [/^bookings$/i, "Trips"],
  [/^tasks & calendar$/i, "Tasks"],
  [/^itinerary builder$/i, "Build a quote"],
  [/^sales pipeline$/i, "Where enquiries are"],
  [/^lead sources$/i, "Where they found you"],
  [/^traveller profiles$/i, "Traveller details"],
  [/^document checklists$/i, "Papers needed"],
  [/^travel advisories$/i, "Travel advice"],
  [/^fixed departures$/i, "Set departure dates"],
  [/^seasonal rates$/i, "Prices by season"],
  [/^room inventory$/i, "Rooms you have"],
  [/^rate plans$/i, "Your prices"],
  [/^room blocks$/i, "Rooms held"],
  [/^cost centres$/i, "Who pays"],
  [/^referrals & coupons$/i, "Referrals & offers"],
  [/^itinerary generator$/i, "Make an itinerary"],
  [/^sales intelligence$/i, "Selling insights"],
  [/^operations insights$/i, "Operations insights"],
  [/^automated alerts$/i, "Automatic alerts"],
  [/^execution history$/i, "What has run"],
  [/^content & seo$/i, "Content & SEO"],
  [/^b2c portal$/i, "Your public site"],
  [/^b2b portal$/i, "Agent portal"],
  [/^supplier connections$/i, "Travel partners"],
  [/^business apps$/i, "Other tools"],
  [/^api & webhooks$/i, "API & webhooks"],
  [/^connection logs$/i, "Recent activity"],
  [/^roles & permissions$/i, "Who can do what"],
  [/^tax & gst$/i, "Tax"],
  [/^tax settings$/i, "Tax"],
  [/^custom fields$/i, "Extra fields"],
  [/^audit logs$/i, "History"],
  [/^more modules$/i, "All tools"],
  [/^prof itability$/i, "Profit"],
  [/^profitability$/i, "Profit"],
  [/^receivables$/i, "Money owed to you"],
  [/^payables$/i, "Money you owe"],
  [/^reconciliation$/i, "Matching"],
  [/^ledger$/i, "Every transaction"],
  [/^gst$/i, "GST"],
  [/^pnr queue$/i, "Waiting to book"],
  [/^tickets$/i, "Ticketed"],
  [/^ancillaries$/i, "Extra services"],
  [/^reissues & refunds$/i, "Changes & refunds"],
  [/^call logs$/i, "Calls"],
  [/^consent$/i, "Permission to message"],
  [/^shared inbox$/i, "All messages"],
  [/^travel requests$/i, "Travel requests"],
  [/^kyc approvals$/i, "Paperwork"],
  [/^credit limits$/i, "Credit limits"],
  [/^agent portal$/i, "Agent portal"],
  [/^knowledge base$/i, "Answers"],
  [/^feedback$/i, "Feedback"],
  [/^refund requests$/i, "Refund requests"],
  [/^escalations$/i, "Escalations"],
  [/^manifests$/i, "Traveller lists"],
  [/^daily operations$/i, "Today"],
  [/^vouchers$/i, "Vouchers"],
  [/^incidents$/i, "Problems on the day"],
  [/^deadlines$/i, "Deadlines"],
  [/^contracts$/i, "Contracts"],
  [/^allotments$/i, "Rooms & seats you hold"],
  [/^purchase orders$/i, "Purchase orders"],
  [/^settlements$/i, "Settlements"],
  [/^room & rate plans$/i, "Your prices"],
  [/^rail, bus & cruise$/i, "Rail, bus & cruise"],
  [/^drivers$/i, "Drivers"],
  [/^vehicles$/i, "Vehicles"],
  [/^delegates$/i, "People travelling"],
  [/^budgets$/i, "Budgets"],
  [/^appointments$/i, "Appointments"],
  [/^insurance$/i, "Insurance"],
  [/^saved reports$/i, "Saved views"],
  [/^saved views$/i, "Saved views"],
  [/^webster pages$/i, "Website pages"],
  [/^destinations$/i, "Destinations"],
  [/^product catalogue$/i, "What you sell"],
  [/^team performance$/i, "How the team is doing"],
  [/^all invoices$/i, "All invoices"],
  [/^all enquiries$/i, "All enquiries"],
  [/^all bookings$/i, "All trips"],
  [/^all quotations$/i, "All quotes"],
  [/^all customers$/i, "All customers"],
  [/^all campaigns$/i, "All campaigns"],
  [/^all suppliers$/i, "All partners"],
  [/^all tickets$/i, "All problems"],
  [/^all agents$/i, "All agents"],
  [/^all packages$/i, "All packages"],
  [/^all hotels$/i, "All hotels"],
  [/^all groups$/i, "All groups"],
  [/^all pages$/i, "All pages"],
  [/^all records$/i, "Everything"],
  // Stat labels that a new user would not say out loud.
  [/^awaiting confirmation$/i, "Waiting on the supplier"],
  [/^booking value$/i, "Value of trips"],
  [/^outstanding$/i, "Still to pay"],
  [/^open pipeline value$/i, "Value in progress"],
  [/^total invoiced$/i, "Total invoiced"],
  [/^quoted value$/i, "Value of quotes"],
  [/^sent this view$/i, "Sent, waiting for a reply"],
  [/^expiring$/i, "Price expires soon"],
  [/^docs pending$/i, "Papers needed"],
  [/^fees collected$/i, "Fees collected"],
  [/^lifetime value$/i, "Total spent with us"],
  [/^total customers$/i, "Customers"],
  [/^total records$/i, "Records"],
  [/^in conversation$/i, "In conversation"],
  [/^new enquiries$/i, "New enquiries"],
  [/^won$/i, "Became a trip"],
];

/** The word a person would use instead of the internal one. */
export function plain(text: string): string {
  if (!text) return text;
  const direct = MODULE_NAMES[text.toLowerCase()];
  if (direct) return direct;
  for (const [pattern, replacement] of PHRASES) {
    if (pattern.test(text)) return replacement;
  }
  return text;
}

/** The name of a module, in plain language. */
export const plainModule = (module: Module | string): string =>
  plain(typeof module === "string" ? module : module.name);

/**
 * What a status means and what to do about it.
 *
 * Every status chip in the app carries this as its tooltip, so a person
 * never has to guess what "Qualified" is asking them to do.
 */
const STATUS_GUIDE: Record<string, { meaning: string; next: string }> = {
  // Enquiries
  New: { meaning: "A new question about a trip.", next: "Call them and find out what they want." },
  Contacted: { meaning: "You have replied.", next: "Find out what they want, then send a price." },
  Qualified: {
    meaning: "They want to travel and have a budget.",
    next: "Send them a price quote.",
  },
  Quoted: {
    meaning: "They have a price and are deciding.",
    next: "Follow up if you hear nothing.",
  },
  Won: { meaning: "They are going ahead.", next: "Turn this into a trip." },
  Lost: { meaning: "They are not going ahead.", next: "Ask why, and keep them in your list." },

  // Quotes
  Draft: { meaning: "A price you have not sent yet.", next: "Finish it and send it." },
  Sent: {
    meaning: "The customer has the price and is deciding.",
    next: "Follow up before the price expires.",
  },
  Accepted: { meaning: "They said yes.", next: "Turn this into a trip." },
  Expired: { meaning: "The price is no longer valid.", next: "Price it again and resend." },

  // Trips
  Pending: { meaning: "Booked, waiting on a supplier to confirm.", next: "Chase the supplier." },
  "On hold": { meaning: "Paused for a reason.", next: "Decide whether to restart it." },
  Confirmed: {
    meaning: "Everything is booked and confirmed.",
    next: "Prepare the traveller's documents.",
  },
  Completed: {
    meaning: "The traveller has come home.",
    next: "Ask for feedback and settle the bill.",
  },
  Cancelled: { meaning: "The trip will not happen.", next: "Sort out any refund." },

  // Money
  "Partially paid": {
    meaning: "Some money has arrived, some has not.",
    next: "Collect the balance.",
  },
  Paid: { meaning: "Paid in full.", next: "Nothing to do." },
  Overdue: { meaning: "The payment date has passed.", next: "Chase the payment." },

  // Documents
  "Documents pending": {
    meaning: "Papers are still missing.",
    next: "Ask for the missing papers.",
  },
  "In review": {
    meaning: "With the consulate.",
    next: "Wait, and answer them quickly if they call.",
  },
  Submitted: { meaning: "Sent for processing.", next: "Nothing to do right now." },
  Approved: { meaning: "Approved.", next: "Send the document to the traveller." },
  Rejected: { meaning: "They said no.", next: "Find out why and apply again." },

  // Problems
  Open: { meaning: "Nobody has picked this up yet.", next: "Assign it to someone." },
  "In progress": { meaning: "Someone is working on it.", next: "Keep the customer updated." },
  Escalated: { meaning: "A manager needs to step in.", next: "Handle it today." },
  Resolved: { meaning: "Sorted out.", next: "Nothing to do." },

  // Partners
  "KYC pending": {
    meaning: "Their paperwork is not approved yet.",
    next: "Collect the missing documents.",
  },
  "Not connected": { meaning: "Not set up yet.", next: "Connect it to start using it." },
  Active: { meaning: "Working normally.", next: "Nothing to do." },
  Paused: { meaning: "Switched off for now.", next: "Turn it back on when you need it." },
  // Quotes and pages
  Live: { meaning: "Running.", next: "Nothing to do." },
  Upcoming: { meaning: "Coming up.", next: "Get it ready." },
  Invoiced: { meaning: "Billed.", next: "Nothing to do." },
};

export const statusGuide = (status: string): { meaning: string; next: string } =>
  STATUS_GUIDE[status] ?? {
    meaning: `This record is marked "${status}".`,
    next: "Move it on when the next step is done.",
  };

/** A one-line description of what a module is for, in human words. */
export const MODULE_PURPOSE: Record<string, string> = {
  leads: "Every question that comes in about a trip.",
  customers: "Everyone you travel with, and their history with you.",
  quotations: "Prices you send to customers.",
  companies: "Companies you arrange travel for.",
  inbox: "Every message, call and email with a customer.",
  campaigns: "Offers you push to groups of travellers.",
  bookings: "Trips that are going ahead.",
  flights: "Air bookings, and the deadlines that come with them.",
  hotels: "The properties you work with.",
  packages: "The trips you have put together.",
  transfers: "Pickups, drop-offs and everything in between.",
  visa: "Travel papers and insurance.",
  groups: "Trips with many travellers.",
  operations: "Everything happening on the day of travel.",
  suppliers: "The partners you sell through.",
  support: "Problems customers have raised.",
  agents: "Agents who sell your trips for you.",
  finance: "Invoices, payments and what you have earned.",
  assistant: "Ask anything about your business.",
  automation: "Rules that do the repetitive work for you.",
  reports: "Your business turned into numbers.",
  distribution: "The pages and products your customers see.",
  integrations: "The tools you have connected.",
  settings: "Your company, your team and your preferences.",
};
