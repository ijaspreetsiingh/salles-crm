/**
 * Frontend API client — Record Activity Timeline (RecordEvent).
 *
 * Notes, calls, emails, status changes — the user-facing story of a record.
 */
import { apiRequest } from "./client";

export type TimelineEventType =
  | "note"
  | "call"
  | "email"
  | "whatsapp"
  | "status_change"
  | "field_change"
  | "payment"
  | "relation_added"
  | "relation_removed"
  | "created"
  | "imported";

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  body: string;
  meta: Record<string, unknown>;
  actorId: string | null;
  actorName: string;
  createdAt: string;
};

export type TimelinePage = {
  events: TimelineEvent[];
  nextCursor: string | null;
};

/** Fetches the activity timeline for a record. */
export async function fetchTimeline(
  recordId: string,
  opts?: { take?: number; cursor?: string },
): Promise<TimelinePage> {
  return apiRequest(`/timeline/${recordId}`, {
    query: {
      take: opts?.take ?? 50,
      cursor: opts?.cursor,
    },
  });
}

/** Adds a manual event (note, call log, etc.) to a record. */
export async function addTimelineEvent(
  recordId: string,
  event: { type: TimelineEventType; body: string; meta?: Record<string, unknown> },
): Promise<TimelineEvent> {
  return apiRequest(`/timeline/${recordId}`, { method: "POST", body: event });
}

/** Deletes a note-type event. Only the author can delete their own notes. */
export async function deleteTimelineEvent(
  recordId: string,
  eventId: string,
): Promise<{ deleted: boolean }> {
  return apiRequest(`/timeline/${recordId}/${eventId}`, { method: "DELETE" });
}
