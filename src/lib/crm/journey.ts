import { findModule, type RecordRow } from "./catalog";
import { fetchRelations, type RecordRelationEdge } from "@/lib/api/relations";

/* ==========================================================================
   The journey.

   V1 (name-matching): guesses related records by name / reference text.
   V2 (real relations): reads explicit RecordRelation rows from the API.

   buildJourney()              — synchronous, uses V1 name-matching as the
                                 immediate/offline fallback (no API call).
   buildJourneyFromRelations() — async, reads the real RecordRelation table.
                                 Called after first paint; replaces the guess
                                 with the truth.

   The RecordSheet renders the guess instantly, then calls the async version
   and re-renders with the real data — so there is no loading flash and no
   stale data.
   ========================================================================== */

export type JourneyStep = {
  id: string;
  label: string;
  /** The module this step belongs to, when a step has a record. */
  moduleId?: string;
  /** The record that fulfils this step, when there is one. */
  record?: RecordRow;
  /** Why there is no record yet (shown as a hint). */
  missing?: string;
  /** Extra context under the step, e.g. "60% paid". */
  detail?: string;
};

export type JourneyKind = "booking" | "lead" | "quotation" | "invoice" | "generic";

type StepDef = {
  id: string;
  label: string;
  moduleId: string;
  /** Statuses that fit this step best (tried before any other). */
  prefer?: string[];
};

/** The canonical chain, in order. */
const BOOKING_STEPS: StepDef[] = [
  { id: "enquiry", label: "Enquiry", moduleId: "leads" },
  { id: "quotation", label: "Quotation", moduleId: "quotations", prefer: ["Accepted", "Sent"] },
  { id: "invoice", label: "Invoice", moduleId: "finance", prefer: ["Draft", "Sent", "Overdue"] },
  { id: "visa", label: "Visa", moduleId: "visa" },
  { id: "flight", label: "Flight", moduleId: "flights" },
  { id: "hotel", label: "Hotel", moduleId: "hotels" },
  { id: "transfer", label: "Transfer", moduleId: "transfers" },
  { id: "departure", label: "Departure", moduleId: "operations" },
  { id: "support", label: "Support", moduleId: "support" },
];

const LEAD_STEPS: StepDef[] = [
  { id: "enquiry", label: "Enquiry", moduleId: "leads" },
  { id: "quotation", label: "Quotation", moduleId: "quotations" },
  { id: "booking", label: "Booking", moduleId: "bookings" },
  { id: "invoice", label: "Invoice", moduleId: "finance" },
  { id: "visa", label: "Visa", moduleId: "visa" },
  { id: "departure", label: "Departure", moduleId: "operations" },
];

const QUOTATION_STEPS: StepDef[] = [
  { id: "enquiry", label: "Enquiry", moduleId: "leads" },
  { id: "quotation", label: "Quotation", moduleId: "quotations" },
  { id: "booking", label: "Booking", moduleId: "bookings" },
  { id: "invoice", label: "Invoice", moduleId: "finance" },
];

const INVOICE_STEPS: StepDef[] = [
  { id: "booking", label: "Booking", moduleId: "bookings" },
  { id: "invoice", label: "Invoice", moduleId: "finance" },
  { id: "visa", label: "Visa", moduleId: "visa" },
  { id: "support", label: "Support", moduleId: "support" },
];

const GENERIC_STEPS: StepDef[] = [
  { id: "record", label: "Record", moduleId: "" },
  { id: "tasks", label: "Tasks", moduleId: "" },
  { id: "messages", label: "Messages", moduleId: "inbox" },
  { id: "documents", label: "Documents", moduleId: "" },
];

const STEPS: Record<JourneyKind, StepDef[]> = {
  booking: BOOKING_STEPS,
  lead: LEAD_STEPS,
  quotation: QUOTATION_STEPS,
  invoice: INVOICE_STEPS,
  generic: GENERIC_STEPS,
};

/** Which journey a record belongs to. */
export function journeyKind(moduleId: string): JourneyKind {
  if (moduleId === "bookings") return "booking";
  if (moduleId === "leads") return "lead";
  if (moduleId === "quotations") return "quotation";
  if (moduleId === "finance") return "invoice";
  return "generic";
}

/** Reference codes look like LD-2401, BK-2403, INV-2405 … */
const REFERENCE = /\b([A-Z]{2,4}-\d{3,6})\b/g;

/**
 * Links two records when one of them mentions the other's reference or
 * name. This is how a booking finds its enquiry, its invoice and its visa
 * without needing a dedicated relation table.
 *
 * The link is looked for in both directions: a booking that says "from lead
 * LD-2411" finds the lead, and an invoice that says "for booking BK-2411"
 * is found by the booking.
 */
export function relatedRecords(
  record: RecordRow,
  all: Record<string, RecordRow[]>,
): Record<string, RecordRow[]> {
  const out: Record<string, RecordRow[]> = {};
  const name = record.name.trim().toLowerCase();
  const references = new Set<string>();
  for (const match of `${record.detail ?? ""} ${record.notes ?? ""}`.matchAll(REFERENCE)) {
    if (match[1]) references.add(match[1]);
  }

  for (const [moduleId, rows] of Object.entries(all)) {
    const found = rows.filter((candidate) => {
      if (candidate.id === record.id) return false;
      const recordRefs = Array.isArray(record.extra?.["relatedRefs"])
        ? (record.extra?.["relatedRefs"] as unknown[])
        : [];
      const candidateRefs = Array.isArray(candidate.extra?.["relatedRefs"])
        ? (candidate.extra?.["relatedRefs"] as unknown[])
        : [];
      if (recordRefs.includes(candidate.id) || candidateRefs.includes(record.id)) return true;
      // 1 — the candidate's reference is named in this record.
      if (references.has(candidate.id)) return true;
      const candidateText = `${candidate.detail ?? ""} ${candidate.notes ?? ""}`.toLowerCase();
      // 2 — this record's reference is named in the candidate.
      if (record.id && candidateText.includes(record.id.toLowerCase())) return true;
      if (!name || name.length < 3) return false;
      // 3 — the candidate names this record ("Quotation for Aarav Sharma").
      const sameDestination =
        !record.destination ||
        !candidate.destination ||
        record.destination.trim().toLowerCase() === candidate.destination.trim().toLowerCase();
      if (candidateText.includes(name) && sameDestination) return true;
      // 4 — both are the same traveller (the enquiry and the booking share a name).
      return candidate.name.trim().toLowerCase() === name && sameDestination;
    });
    if (found.length) out[moduleId] = found;
  }
  return out;
}

/** Extra context for a step, e.g. how much of an invoice has been paid. */
function stepDetail(step: StepDef, record: RecordRow): string | undefined {
  if (step.moduleId !== "finance") return undefined;
  const extra = record.extra ?? {};
  const received = Number(extra["received"] ?? 0);
  if (!received || !record.amount) return undefined;
  return `${Math.round((received / record.amount) * 100)}% paid`;
}

/**
 * Resolves the journey for a record: which steps have a record behind them,
 * which are still open, and which record satisfies each step.
 */
export function buildJourney(
  record: RecordRow,
  moduleId: string,
  all: Record<string, RecordRow[]>,
): JourneyStep[] {
  const kind = journeyKind(moduleId);
  const steps = STEPS[kind];
  const related = relatedRecords(record, all);
  const relatedByModule = new Map<string, RecordRow[]>();
  for (const [id, rows] of Object.entries(related)) relatedByModule.set(id, rows);

  const used = new Set<string>();
  const result: JourneyStep[] = [];

  for (const step of steps) {
    let match: RecordRow | undefined;

    // The record itself fills its own step.
    if (step.moduleId === moduleId) {
      match = record;
    } else if (step.moduleId) {
      const pool = relatedByModule.get(step.moduleId) ?? [];
      const unused = pool.filter((r) => !used.has(r.id));
      // Prefer the candidate whose status fits the step best.
      match =
        (step.prefer ? unused.find((r) => step.prefer!.includes(r.status)) : undefined) ??
        unused[0];
    }

    if (match) used.add(match.id);
    const detail = match ? stepDetail(step, match) : undefined;
    result.push({
      id: step.id,
      label: step.label,
      moduleId: step.moduleId || moduleId,
      ...(match ? { record: match } : {}),
      ...(detail ? { detail } : {}),
      ...(match ? {} : { missing: `No ${step.label.toLowerCase()} yet` }),
    });
  }

  return result;
}

/** Human label for a record, used in the journey tooltip. */
export const journeyLabel = (step: JourneyStep): string => {
  if (!step.record) return step.missing ?? "Not started";
  const module = findModule(step.moduleId || "");
  return `${step.record.name} · ${module?.name ?? ""}`;
};

// ─── V2: real RecordRelation-backed journey ───────────────────────────────

/**
 * Maps a RecordRelation `kind` to the step id it satisfies.
 *
 * "quoted"      → the quotation step
 * "booked"      → the booking step
 * "invoiced"    → the invoice step
 * "visa_for"    → the visa step
 * "flight_for"  → the flight step
 * "hotel_for"   → the hotel step
 * "transfer_for"→ the transfer step
 */
const KIND_TO_STEP: Record<string, string> = {
  quoted: "quotation",
  booked: "booking",
  invoiced: "invoice",
  visa_for: "visa",
  flight_for: "flight",
  hotel_for: "hotel",
  transfer_for: "transfer",
  paying_for: "invoice",
  escalated_to: "support",
};

/**
 * Builds the journey using real RecordRelation rows from the API.
 *
 * Falls back gracefully: if the API is unreachable or returns no edges, the
 * caller keeps the name-match result it already has.
 *
 * Returns null if the API call fails so the caller can keep its fallback.
 */
export async function buildJourneyFromRelations(
  record: RecordRow,
  moduleId: string,
): Promise<JourneyStep[] | null> {
  let edges: RecordRelationEdge[];
  try {
    const result = await fetchRelations(record.id);
    edges = result.edges;
  } catch {
    // API unreachable — caller keeps name-match fallback.
    return null;
  }

  if (edges.length === 0) {
    // No explicit links yet — return null so the caller keeps name-match
    // rather than showing an empty rail that looks broken.
    return null;
  }

  const kind = journeyKind(moduleId);
  const steps = STEPS[kind];

  // Build a map: stepId → hydrated RecordRow from edge.related
  const stepToRecord = new Map<string, RecordRow>();

  // The record itself always fills its own step.
  const selfStepId = steps.find((s) => s.moduleId === moduleId)?.id;
  if (selfStepId) stepToRecord.set(selfStepId, record);

  for (const edge of edges) {
    if (!edge.related) continue;
    const stepId = KIND_TO_STEP[edge.kind];
    if (!stepId) continue;
    // Don't overwrite if already filled (keep first / prefer "from" direction).
    if (!stepToRecord.has(stepId)) {
      // Convert the slim edge.related shape into a RecordRow-compatible object.
      const relatedRow: RecordRow = {
        id: edge.related.id,
        moduleId: edge.related.moduleId,
        reference: edge.related.reference,
        name: edge.related.name,
        status: edge.related.status,
        // These are not in the edge payload — leave as empty defaults.
        detail: "",
        destination: "",
        owner: "",
        branch: "",
        date: "",
        amount: 0,
        currency: "",
        email: "",
        phone: "",
        source: "",
        notes: "",
        extra: {},
      } as unknown as RecordRow;
      stepToRecord.set(stepId, relatedRow);
    }
  }

  // Build the step list in the canonical order.
  return steps.map((step) => {
    const match = stepToRecord.get(step.id);
    const detail = match ? stepDetail(step, match) : undefined;
    return {
      id: step.id,
      label: step.label,
      moduleId: step.moduleId || moduleId,
      ...(match ? { record: match } : {}),
      ...(detail ? { detail } : {}),
      ...(match ? {} : { missing: `No ${step.label.toLowerCase()} yet` }),
    };
  });
}
