import { env } from "../config/env";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

const hasLiveModel = () => Boolean(env.LLM_API_KEY);

/**
 * Calls an OpenAI-compatible chat endpoint when a key is configured. Without a
 * key (demo / offline mode) the caller falls back to the deterministic engine.
 */
export async function callModel(messages: ChatTurn[]): Promise<string | null> {
  if (!hasLiveModel()) return null;
  try {
    const response = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({ model: env.LLM_MODEL, messages, temperature: 0.4 }),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "LLM request failed");
      return null;
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return payload.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    logger.warn({ err: error }, "LLM request errored");
    return null;
  }
}

type WorkspaceSnapshot = {
  bookings: number;
  confirmedBookings: number;
  newLeads: number;
  revenue: number;
  overdue: number;
  topDestination: string;
};

async function snapshot(organizationId: string): Promise<WorkspaceSnapshot> {
  const base = { organizationId, deletedAt: null } as const;
  const [bookings, confirmed, newLeads, revenueAgg, overdueAgg, destinations] = await Promise.all([
    prisma.record.count({ where: { ...base, moduleId: "bookings" } }),
    prisma.record.count({ where: { ...base, moduleId: "bookings", status: "Confirmed" } }),
    prisma.record.count({ where: { ...base, moduleId: "leads", status: "New" } }),
    prisma.record.aggregate({ where: { ...base, moduleId: "bookings" }, _sum: { amount: true } }),
    prisma.record.aggregate({ where: { ...base, moduleId: "finance", status: "Overdue" }, _sum: { amount: true } }),
    prisma.record.groupBy({
      by: ["destination"],
      where: { ...base, moduleId: "bookings" },
      _count: { _all: true },
      orderBy: { _count: { destination: "desc" } },
      take: 1,
    }),
  ]);

  return {
    bookings,
    confirmedBookings: confirmed,
    newLeads,
    revenue: revenueAgg._sum.amount ?? 0,
    overdue: overdueAgg._sum.amount ?? 0,
    topDestination: destinations[0]?.destination ?? "Bali, Indonesia",
  };
}

const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

/** Rule-based assistant used offline so the workspace is always usable. */
export function deterministicReply(message: string, snap: WorkspaceSnapshot): string {
  const text = message.toLowerCase();

  if (/best.sell|top destination|popular/.test(text)) {
    return `Your strongest destination right now is **${snap.topDestination}**. It leads confirmed departures this quarter. I can pull the full destination report, or draft a promo push for it.`;
  }
  if (/quote|quotation|price|pricing/.test(text)) {
    return `A ready-to-send quote usually needs: trip dates, pax count, hotel category and inclusions. Based on your live data you have **${snap.newLeads} open enquiries** — I can prepare a quotation outline for any of them.`;
  }
  if (/overdue|payment|invoice|receivable|outstanding/.test(text)) {
    return `You currently have **${inr(snap.overdue)}** in overdue receivables. I'd start with the oldest invoices, send payment reminders, and flag any booking at risk of cancellation.`;
  }
  if (/itinerary|plan|days/.test(text)) {
    return `I can draft a day-by-day itinerary. Share the destination, number of nights, pax and travel style and I'll produce a client-ready outline with inclusions and exclusions.`;
  }
  if (/forecast|projection|next month|revenue/.test(text)) {
    return `Confirmed booking value is **${inr(snap.revenue)}** across **${snap.bookings} bookings** (${snap.confirmedBookings} confirmed). At your current conversion, next month looks consistent with this quarter's run rate.`;
  }
  if (/visa|document|passport/.test(text)) {
    return `There are visa applications with pending documents. I can list the travellers, the missing documents and the next embassy appointment slots.`;
  }

  return `Here's where things stand: **${snap.newLeads} new leads**, **${snap.bookings} bookings** worth **${inr(snap.revenue)}** and **${inr(snap.overdue)}** overdue. Ask me to draft a quotation, summarise a customer, generate an itinerary, or review your overdue payments.`;
}

/** Produces a day-by-day itinerary outline (deterministic, always available). */
export function buildItinerary(input: {
  destination: string;
  nights: number;
  travellers: number;
  interests?: string;
}): string {
  const { destination, nights, travellers, interests } = input;
  const days = nights + 1;
  const theme = interests?.trim() ? `focused on ${interests.trim()}` : "with a relaxed pace";
  const lines: string[] = [
    `**${days}-day / ${nights}-night itinerary — ${destination}**`,
    `Travellers: ${travellers} · Style: ${theme}`,
    "",
    `**Day 1 — Arrival & check-in**`,
    `Arrive into ${destination}, private transfer to your hotel, evening at leisure.`,
  ];
  for (let day = 2; day < days; day += 1) {
    lines.push(
      `**Day ${day} — Experience day**`,
      day % 2 === 1
        ? `Guided sightseeing, local cuisine experience and free time.`
        : `Optional excursion, spa or beach time, dinner at a recommended restaurant.`,
    );
  }
  lines.push(
    `**Day ${days} — Departure**`,
    `Breakfast, checkout and assisted airport transfer.`,
    "",
    `**Inclusions:** accommodation, daily breakfast, airport transfers, sightseeing as per itinerary, 24×7 on-trip support.`,
    `**Exclusions:** flights, visa fees, personal expenses, travel insurance, anything not listed above.`,
  );
  return lines.join("\n");
}

export { snapshot as workspaceSnapshot };
