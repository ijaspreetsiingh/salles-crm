import type { ModuleId } from "./modules";

/** Actions mirror the permission matrix rendered in the Administration workspace. */
export const ACTIONS = ["view", "create", "edit", "approve", "export", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/** Stored shape of `Role.permissions`. */
export type PermissionSet = {
  /** "*" = every module, otherwise an explicit allow-list. */
  modules: "*" | string[];
  /** "*" = every action, otherwise an explicit allow-list. */
  actions: "*" | Action[];
};

export type RoleDef = {
  key: string;
  name: string;
  description: string;
  permissions: PermissionSet;
  isSystem: boolean;
  /**
   * When true the role only ever sees records that belong to its own branch
   * (plus records that are not tied to a branch). Roles that manage the whole
   * company keep this off.
   */
  branchScoped: boolean;
};

const ALL: PermissionSet = { modules: "*", actions: "*" };

/**
 * Built-in roles seeded into every organisation. They are the starting point a
 * company admin can then customise from the Roles & permissions screen.
 */
export const ROLE_DEFS: RoleDef[] = [
  {
    key: "company_admin",
    name: "Company admin",
    description: "Full access to every workspace, setting and approval.",
    permissions: ALL,
    isSystem: true,
    branchScoped: false,
  },
  {
    key: "branch_manager",
    name: "Branch manager",
    description: "Runs a branch end to end, including approvals and reporting.",
    permissions: {
      modules: [
        "leads",
        "customers",
        "quotations",
        "companies",
        "bookings",
        "operations",
        "suppliers",
        "support",
        "agents",
        "reports",
        "inbox",
        "finance",
      ],
      actions: ["view", "create", "edit", "approve", "export"],
    },
    isSystem: true,
    branchScoped: true,
  },
  {
    key: "sales",
    name: "Sales",
    description: "Owns enquiries, quotations and customer relationships.",
    permissions: {
      modules: [
        "leads",
        "customers",
        "quotations",
        "companies",
        "campaigns",
        "bookings",
        "inbox",
        "reports",
        "distribution",
      ],
      actions: ["view", "create", "edit", "export"],
    },
    isSystem: true,
    branchScoped: true,
  },
  {
    key: "operations",
    name: "Operations",
    description: "Coordinates trips, suppliers, transport and on-trip delivery.",
    permissions: {
      modules: [
        "bookings",
        "flights",
        "hotels",
        "packages",
        "transfers",
        "visa",
        "groups",
        "operations",
        "suppliers",
        "support",
        "reports",
      ],
      actions: ["view", "create", "edit", "export"],
    },
    isSystem: true,
    branchScoped: true,
  },
  {
    key: "finance",
    name: "Finance",
    description: "Invoices, payments, ledgers, tax and profitability.",
    permissions: {
      modules: ["finance", "bookings", "suppliers", "agents", "reports"],
      actions: ["view", "create", "edit", "approve", "export"],
    },
    isSystem: true,
    branchScoped: false,
  },
  {
    key: "support",
    name: "Support",
    description: "Handles tickets, complaints, feedback and customer care.",
    permissions: {
      modules: ["support", "inbox", "customers", "bookings", "reports"],
      actions: ["view", "create", "edit", "export"],
    },
    isSystem: true,
    branchScoped: true,
  },
];

export const ROLE_MAP: Record<string, RoleDef> = Object.fromEntries(
  ROLE_DEFS.map((r) => [r.key, r]),
);

/**
 * True when this role may only work inside its own branch.
 * Unknown custom roles are treated as branch scoped — the safe default.
 */
export function isBranchScoped(roleKey: string): boolean {
  const role = ROLE_MAP[roleKey];
  if (!role) return true;
  return role.branchScoped;
}

export function normalizePermissions(input: unknown): PermissionSet {
  const value = (input ?? {}) as Partial<PermissionSet>;
  const modules = value.modules === "*" || Array.isArray(value.modules) ? value.modules : "*";
  const actions = value.actions === "*" || Array.isArray(value.actions) ? value.actions : "*";
  return { modules, actions } as PermissionSet;
}

export function hasPermission(
  permissions: PermissionSet,
  moduleId: ModuleId | string,
  action: Action,
): boolean {
  const moduleOk = permissions.modules === "*" || permissions.modules.includes(moduleId);
  const actionOk = permissions.actions === "*" || permissions.actions.includes(action);
  return moduleOk && actionOk;
}

/** Human readable default matrix used when seeding / previewing roles. */
export function describeRole(role: RoleDef): string {
  if (role.permissions.modules === "*" && role.permissions.actions === "*") return "Full access";
  const moduleCount =
    role.permissions.modules === "*" ? "all modules" : `${role.permissions.modules.length} modules`;
  const actionCount =
    role.permissions.actions === "*" ? "all actions" : role.permissions.actions.join(", ");
  return `${moduleCount} · ${actionCount}`;
}
