/**
 * Frontend API client — Record Relations.
 *
 * Replaces the old name-matching journey rail with real typed links.
 */
import { apiRequest } from "./client";

export type RelationKind =
  | "quoted"
  | "booked"
  | "invoiced"
  | "visa_for"
  | "flight_for"
  | "hotel_for"
  | "transfer_for"
  | "paying_for"
  | "escalated_to"
  | "related";

export type RecordRelationEdge = {
  id: string;
  kind: RelationKind;
  direction: "from" | "to";
  relatedId: string;
  related: {
    id: string;
    reference: string;
    name: string;
    moduleId: string;
    status: string;
  } | null;
  createdAt: string;
};

/** All relations for a record — both directions. */
export async function fetchRelations(recordId: string): Promise<{ edges: RecordRelationEdge[] }> {
  return apiRequest(`/relations/${recordId}`);
}

/** Links two records. Idempotent — safe to call twice. */
export async function linkRecords(params: {
  fromId: string;
  toId: string;
  kind: RelationKind;
}): Promise<{ id: string; fromId: string; toId: string; kind: string; createdAt: string }> {
  return apiRequest("/relations", { method: "POST", body: params });
}

/** Removes a relation link by its id. */
export async function unlinkRecords(relationId: string): Promise<{ deleted: boolean }> {
  return apiRequest(`/relations/${relationId}`, { method: "DELETE" });
}
