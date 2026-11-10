import { prisma } from "../lib/prisma";
import { createNotification } from "./notifications";
import { sendEmail } from "./email";
import { sendWhatsApp } from "./whatsapp";

/**
 * Visual workflow execution.
 *
 * The canvas saves a small graph (nodes + edges). Running it walks from the
 * trigger along the wires, checks each condition against a real record in the
 * chosen module, and performs the actions. A dry run tells you exactly what
 * would happen before anything is created or messaged.
 */

export type GraphNode = {
  id: string;
  type: "trigger" | "condition" | "action";
  kind: string;
  label: string;
  config?: Record<string, string | number | boolean>;
  x: number;
  y: number;
};

export type GraphEdge = { from: string; to: string };
export type WorkflowGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type GraphNodeResult = {
  id: string;
  label: string;
  status: "done" | "skipped" | "failed";
  detail: string;
};

export type GraphRunResult = {
  status: "success" | "failed" | "skipped";
  log: string;
  nodes: GraphNodeResult[];
  dryRun: boolean;
};

export function parseGraph(raw: string | null | undefined): WorkflowGraph | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WorkflowGraph;
    if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) return null;
    return { nodes: parsed.nodes, edges: Array.isArray(parsed.edges) ? parsed.edges : [] };
  } catch {
    return null;
  }
}

type RuntimeContext = {
  organizationId: string;
  moduleId: string;
  userId: string;
  userName: string;
  dryRun: boolean;
  recordName: string;
  amount: number;
  status: string;
  owner: string;
  email: string;
  phone: string;
  recordId: string | null;
};

const text = (value: unknown, fallback = "") =>
  value === undefined || value === null ? fallback : String(value);

function conditionHolds(node: GraphNode, context: RuntimeContext): { ok: boolean; why: string } {
  const value = text(node.config?.["value"]);
  switch (node.kind) {
    case "amount_above": {
      const threshold = Number(value) || 0;
      return {
        ok: context.amount > threshold,
        why: `${context.recordName || "record"} is ${context.amount} — ${
          context.amount > threshold ? "above" : "not above"
        } ${threshold}`,
      };
    }
    case "status_is": {
      const wanted = value.toLowerCase();
      return {
        ok: context.status.toLowerCase() === wanted,
        why: `status is "${context.status}"${wanted ? `, looking for "${value}"` : ""}`,
      };
    }
    case "owner_empty":
      return {
        ok: !context.owner,
        why: context.owner ? `owned by ${context.owner}` : "no owner yet",
      };
    case "always":
      return { ok: true, why: "always runs" };
    default:
      return { ok: true, why: `unknown condition "${node.kind}" treated as true` };
  }
}

async function runAction(node: GraphNode, context: RuntimeContext): Promise<string> {
  const config = node.config ?? {};
  switch (node.kind) {
    case "create_task": {
      const title = text(config["title"], `Follow up: ${context.recordName || node.label}`);
      if (context.dryRun) return `Would create task "${title}"`;
      const task = await prisma.task.create({
        data: {
          organizationId: context.organizationId,
          title,
          type: "Automation",
          ownerName: context.userName,
          ownerId: context.userId,
          date: new Date().toISOString().slice(0, 10),
          priority: "Normal",
        },
      });
      return `Created task ${task.title}`;
    }
    case "notify": {
      const message = text(config["message"], node.label);
      if (context.dryRun) return `Would notify the team: "${message}"`;
      await createNotification({
        organizationId: context.organizationId,
        title: "Automation",
        body: message,
        moduleId: context.moduleId,
        level: "info",
      });
      return "Team notified";
    }
    case "send_email": {
      const to = text(config["to"], context.email);
      if (!to) return "Skipped — no email on this record";
      const subject = text(config["subject"], "A note from your travel consultant");
      const body = text(config["body"], node.label);
      if (context.dryRun) return `Would email ${to} — "${subject}"`;
      const result = await sendEmail({
        organizationId: context.organizationId,
        to,
        subject,
        body,
        template: "automation",
        userId: context.userId,
        relatedModule: context.moduleId,
        relatedReference: context.recordName,
      });
      return result.status === "sent"
        ? `Email sent to ${to}`
        : result.status === "failed"
          ? `Email to ${to} failed — check the outbox`
          : `Email to ${to} queued — connect SMTP to deliver`;
    }
    case "send_whatsapp": {
      const to = text(config["to"], context.phone);
      if (!to) return "Skipped — no phone number on this record";
      const body = text(config["body"], node.label);
      if (context.dryRun) return `Would WhatsApp ${to}`;
      const result = await sendWhatsApp({
        organizationId: context.organizationId,
        to,
        body,
        template: "automation",
        userId: context.userId,
        relatedReference: context.recordName,
      });
      return result.status === "sent"
        ? `WhatsApp sent to ${to}`
        : result.status === "failed"
          ? `WhatsApp to ${to} failed`
          : `WhatsApp to ${to} queued — link a number in Settings`;
    }
    case "assign_owner": {
      if (context.dryRun)
        return `Would assign ${context.recordName || "matching records"} to ${context.userName}`;
      const updated = await prisma.record.updateMany({
        where: {
          organizationId: context.organizationId,
          moduleId: context.moduleId,
          deletedAt: null,
          ...(context.recordId ? { id: context.recordId } : { ownerName: "" }),
        },
        data: { ownerId: context.userId, ownerName: context.userName },
      });
      return `Assigned ${updated.count} record${updated.count === 1 ? "" : "s"} to ${context.userName}`;
    }
    case "update_status": {
      const status = text(config["value"], "Follow-up");
      if (context.dryRun) return `Would set status to "${status}"`;
      if (!context.recordId) return "Skipped — no record to update";
      await prisma.record.update({
        where: { id: context.recordId },
        data: { status },
      });
      return `Status set to "${status}"`;
    }
    default:
      return `Unknown action "${node.kind}" — nothing done`;
  }
}

export async function runWorkflowGraph(input: {
  organizationId: string;
  moduleId: string;
  userId: string;
  userName: string;
  graph: WorkflowGraph;
  dryRun: boolean;
  /**
   * The record the run is about. A live trigger passes the record that just
   * changed, so a condition reads *that* lead and not whichever record happens
   * to be newest. A manual test leaves it out and falls back to the latest row.
   */
  recordId?: string | null;
}): Promise<GraphRunResult> {
  const trigger = input.graph.nodes.find((node) => node.type === "trigger");
  if (!trigger) {
    return {
      status: "failed",
      log: "No trigger node — add one and connect the steps",
      nodes: [],
      dryRun: input.dryRun,
    };
  }

  // A real record makes the test honest: the conditions read actual values.
  const record = input.recordId
    ? await prisma.record.findFirst({
        where: { id: input.recordId, organizationId: input.organizationId, deletedAt: null },
      })
    : await prisma.record.findFirst({
        where: { organizationId: input.organizationId, moduleId: input.moduleId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });

  const context: RuntimeContext = {
    organizationId: input.organizationId,
    moduleId: input.moduleId,
    userId: input.userId,
    userName: input.userName,
    dryRun: input.dryRun,
    recordName: record?.name ?? "",
    amount: record?.amount ?? 0,
    status: record?.status ?? "",
    owner: record?.ownerName ?? "",
    email: record?.email ?? "",
    phone: record?.phone ?? "",
    recordId: record?.id ?? null,
  };

  const results: GraphNodeResult[] = [];
  const byId = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const nextOf = (id: string) =>
    input.graph.edges.filter((edge) => edge.from === id).map((edge) => edge.to);

  results.push({
    id: trigger.id,
    label: trigger.label || "Trigger",
    status: "done",
    detail: `Watching ${input.moduleId} for "${trigger.kind}"`,
  });

  const queue = [...nextOf(trigger.id)];
  const visited = new Set<string>([trigger.id]);
  let executed = 0;

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;

    if (node.type === "condition") {
      const check = conditionHolds(node, context);
      results.push({
        id: node.id,
        label: node.label || "Condition",
        status: check.ok ? "done" : "skipped",
        detail: check.why,
      });
      if (check.ok) queue.push(...nextOf(node.id));
      continue;
    }

    try {
      const detail = await runAction(node, context);
      executed += 1;
      results.push({
        id: node.id,
        label: node.label || node.kind,
        status: detail.startsWith("Skipped") ? "skipped" : "done",
        detail,
      });
      queue.push(...nextOf(node.id));
    } catch (error) {
      results.push({
        id: node.id,
        label: node.label || node.kind,
        status: "failed",
        detail: error instanceof Error ? error.message : "Action failed",
      });
    }
  }

  const failed = results.some((result) => result.status === "failed");
  const status = failed ? "failed" : executed === 0 ? "skipped" : "success";
  const prefix = input.dryRun ? "Dry run: " : "";
  return {
    status,
    dryRun: input.dryRun,
    nodes: results,
    log: `${prefix}${results.map((result) => `${result.label}: ${result.detail}`).join(" · ")}`,
  };
}
