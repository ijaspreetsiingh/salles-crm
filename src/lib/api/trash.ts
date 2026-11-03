/**
 * The recycle bin — records deleted by the team, and the way back.
 *
 * Deletes are soft, so the server already kept the row; this is the screen
 * that makes that useful.
 */
import { apiRequest } from "./client";

export type TrashedRecord = {
  id: string;
  moduleId: string;
  moduleName: string;
  reference: string;
  name: string;
  detail: string;
  destination: string;
  owner: string;
  branch: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  email: string;
  phone: string;
  deletedAt: string | null;
  updatedAt: string;
};

export type TrashDto = { total: number; items: TrashedRecord[] };

export const fetchTrash = (params: { q?: string; module?: string; take?: number } = {}) =>
  apiRequest<TrashDto>("/workspace/trash", {
    query: { q: params.q, module: params.module, take: params.take },
  });

export const restoreTrashed = (id: string) =>
  apiRequest<{ id: string; reference: string }>(`/workspace/trash/${id}/restore`, {
    method: "POST",
  });

export const purgeTrashed = (id: string) =>
  apiRequest<{ purged: boolean }>(`/workspace/trash/${id}`, { method: "DELETE" });

export const emptyTrash = () =>
  apiRequest<{ purged: number }>("/workspace/trash/empty", { method: "POST" });
