import { ForbiddenError } from "../lib/errors";
import { parseJson } from "../lib/utils";

/**
 * Segregation of duties for money records.
 *
 * The person who creates an invoice must not also be the person who marks it
 * approved/paid, or deletes it after it has been issued. Role permissions say
 * *what* a person may do; this says they cannot be both sides of the same
 * transaction.
 *
 * Rules are stored in the organization's settings under `sodRules`. Each rule
 * names a module and a list of "sensitive" actions. When one person does a
 * sensitive action on a record they created, it is refused — unless an
 * override role (e.g. company_admin) is allowed to bypass.
 *
 * Default rules:
 *   finance: approve, delete
 *   payments: approve, delete
 *   payables: approve, delete
 *
 * A rule can list `overrideRoles` — roles that may bypass the check (e.g.
 * company_admin in a small office where one person wears both hats).
 */

type SodRule = {
  moduleId: string;
  actions: ("approve" | "delete" | "export")[];
  overrideRoles?: string[];
};

const DEFAULT_RULES: SodRule[] = [
  { moduleId: "finance", actions: ["approve", "delete"] },
  { moduleId: "payments", actions: ["approve", "delete"] },
  { moduleId: "payables", actions: ["approve", "delete"] },
];

export type SodInput = {
  moduleId: string;
  action: "approve" | "delete" | "export";
  actorId: string;
  actorRoleKey: string;
  createdById: string | null | undefined;
  currentStatus: string;
  nextStatus?: string;
};

const APPROVAL_STATUSES = new Set(["Approved", "Paid", "Processed"]);
const UNISSUED_STATUSES = new Set(["Draft", "Cancelled", "Void", ""]);

/** Read the organization's SOD rules from its settings JSON. */
export function readSodRules(settingsJson: string | null | undefined): SodRule[] {
  try {
    const settings = parseJson<{ sodRules?: SodRule[] }>(settingsJson ?? "{}", {});
    const rules = settings.sodRules;
    if (Array.isArray(rules) && rules.length > 0) return rules;
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_RULES;
}

/** Find the rule (if any) that applies to this module + action. */
function findRule(rules: SodRule[], moduleId: string, action: string): SodRule | null {
  for (const rule of rules) {
    if (rule.moduleId !== moduleId) continue;
    if (rule.actions.includes(action as any)) return rule;
  }
  return null;
}

/**
 * Refuses a sensitive action when the actor also created the record, unless
 * their role is listed in the rule's overrideRoles.
 *
 * Returns nothing when the action is allowed. Throws ForbiddenError when it
 * is not — with a plain-language message the screen can show.
 */
export function assertSegregationOfDuties(input: {
  moduleId: string;
  action: "approve" | "delete" | "export";
  actorId: string;
  actorRoleKey: string;
  createdById: string | null | undefined;
  currentStatus: string;
  nextStatus?: string;
  rules?: SodRule[];
}): void {
  const rules = input.rules ?? DEFAULT_RULES;
  const rule = findRule(rules, input.moduleId, input.action);
  if (!rule) return;

  // Same person must have created the record for SOD to apply.
  if (!input.actorId || !input.createdById || input.actorId !== input.createdById) return;

  // Override roles can bypass (small office, one person wears both hats).
  if (rule.overrideRoles && rule.overrideRoles.includes(input.actorRoleKey)) return;

  if (input.action === "approve") {
    const next = input.nextStatus ?? "";
    if (next && next !== input.currentStatus && APPROVAL_STATUSES.has(next)) {
      throw new ForbiddenError(
        `The person who created this ${input.moduleId} record cannot approve or mark it paid. Ask another user with approval rights.`,
        "segregation_of_duties",
      );
    }
    return;
  }

  if (input.action === "delete") {
    if (!UNISSUED_STATUSES.has(input.currentStatus)) {
      throw new ForbiddenError(
        `The person who created this ${input.moduleId} record cannot delete it after it has been issued. Ask another admin.`,
        "segregation_of_duties",
      );
    }
    return;
  }

  if (input.action === "export") {
    // Export is always allowed — it is read-only. Kept for rule completeness.
    return;
  }
}
