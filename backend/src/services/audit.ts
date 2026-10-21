import type { Request } from "express";
import { prisma } from "../lib/prisma";
import { stringifyJson } from "../lib/utils";

export type AuditAction =
  | "Created"
  | "Updated"
  | "Deleted"
  | "Login"
  | "Logout"
  | "Export"
  | "Approved"
  | "Assigned"
  | "Connected"
  | "Disconnected"
  | "WorkflowRun"
  | "MessageSent";

type AuditInput = {
  organizationId: string;
  action: AuditAction;
  moduleId?: string;
  recordId?: string;
  label?: string;
  actorId?: string | null;
  actorName?: string;
  meta?: Record<string, unknown>;
  req?: Request;
};

/** Writes an immutable audit trail entry. Never throws into the caller. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        action: input.action,
        moduleId: input.moduleId ?? "",
        recordId: input.recordId ?? "",
        label: input.label ?? "",
        actorId: input.actorId ?? input.req?.auth?.userId ?? null,
        actorName: input.actorName ?? input.req?.auth?.name ?? "System",
        meta: stringifyJson(input.meta ?? {}),
        ip: input.req?.ip,
        userAgent: input.req?.header("user-agent"),
      },
    });
  } catch {
    // Audit failures must never break the request path.
  }
}
