import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  defaultSettings,
  modules,
  type CustomField,
  type Employee,
  type RecordRow,
  type Settings,
  type Task,
} from "./catalog";
import * as api from "@/lib/api/crm";
import { applyModuleStatuses } from "./statuses";
import { bulkRecords, updateSubscription } from "@/lib/api/modules";
import { restoreTrashed } from "@/lib/api/trash";
import { ApiError, errorMessage, tokenStore } from "@/lib/api/client";
import { toast } from "sonner";

export type AuditEntry = {
  id: string;
  at: string; // ISO datetime
  user: string;
  action: string;
  module: string;
  recordId: string;
  label: string;
};

/** Session lifecycle of the workspace. */
export type AuthStatus = "loading" | "unauthenticated" | "ready";

/**
 * How much of a module's list the browser is holding.
 *
 * A module can hold far more records than one page, so the screen always
 * knows the true total and can say "showing 200 of 4,180" instead of quietly
 * pretending the page is everything.
 */
export type ModulePageState = {
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  /** True when this account also manages the platform (/admin portal). */
  isPlatformAdmin: boolean;
};

type Store = {
  status: AuthStatus;
  /** Shown on the sign-in screen when the API could not be reached. */
  bootError: string | null;
  /**
   * Signed in, but the role demands a second factor and it is not set up yet.
   *
   * The API answers every other route with 403 `two_factor_setup_required`, so
   * the shell must not pretend the workspace failed to load — it shows the
   * enrolment screen instead.
   */
  twoFactorSetupRequired: boolean;
  user: SessionUser | null;
  organizationName: string;
  /** Public URL slug — used for the hosted lead form + website widget. */
  organizationSlug: string;
  roleLabel: string;
  permissions: api.PermissionSetDto | null;
  /** True when this role only ever sees records belonging to its own branch. */
  branchScoped: boolean;
  /** The office this person is attached to, by name. Empty = not set. */
  myBranch: string;
  records: Record<string, RecordRow[]>;
  /**
   * True while the cross-module context cache is still arriving after sign-in.
   *
   * The shell paints as soon as the profile is known; the recent-records slice
   * follows in the background. Screens use this to say "loading" rather than
   * "empty" while it is in flight.
   */
  recordsLoading: boolean;
  /** Per-module page/total state, for honest "showing X of Y" copy. */
  modulePages: Record<string, ModulePageState>;
  /**
   * Loads a module's records from the server, filtered and sorted there.
   * Page 1 replaces the module's rows; later pages append to them.
   */
  loadModulePage: (
    moduleId: string,
    query: api.ModuleListQuery,
    options?: { page?: number },
  ) => Promise<void>;
  /**
   * Loads every record of a module (paged), for screens that total numbers.
   * The sign-in cache only holds a recent slice, so analytics call this.
   */
  ensureModuleRecords: (moduleId: string) => Promise<void>;
  tasks: Task[];
  /**
   * Today's work from the server, scoped to this person. Null until the
   * workspace has loaded (or when the API is unavailable).
   */
  attention: api.AttentionDto | null;
  /** Re-reads today's work, optionally for the whole branch. */
  refreshAttention: (scope?: "mine" | "team") => Promise<void>;
  audit: AuditEntry[];
  fields: Record<string, CustomField[]>;
  settings: Settings;
  login: (
    email: string,
    password: string,
    second?: { totp?: string; recoveryCode?: string },
  ) => Promise<{ twoFactorSetupRequired: boolean }>;
  register: (
    organizationName: string,
    name: string,
    email: string,
    password: string,
    phone?: string,
    planKey?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  getRows: (id: string, tab?: string) => RecordRow[];
  /** Creates a record (optimistic, fire-and-forget). */
  save: (module: string, row: RecordRow) => void;
  /** Creates a record and resolves with the saved row (server reference). */
  createRecord: (module: string, row: RecordRow) => Promise<RecordRow | null>;
  update: (module: string, row: RecordRow) => void;
  /** Updates a record and resolves only once the server has kept the change. */
  updateRecord: (module: string, row: RecordRow) => Promise<RecordRow | null>;
  /** Re-reads one module after a side effect (a payment changing a status). */
  refreshModuleRecords: (moduleId: string) => Promise<void>;
  remove: (module: string, rowId: string) => void;
  /**
   * Applies one change to many records at once and re-reads the list.
   * Resolves with how many records actually changed.
   */
  bulkUpdate: (
    moduleId: string,
    references: string[],
    action: "assign" | "status" | "delete",
    value?: string,
  ) => Promise<number>;
  /** Folds duplicates into one record; resolves with what moved. */
  mergeInto: (
    moduleId: string,
    keep: string,
    merges: string[],
  ) => Promise<api.MergeResultDto | null>;
  addTask: (task: Omit<Task, "id">) => void;
  updateTask: (task: Task) => void;
  toggleTask: (id: string, done: boolean) => void;
  removeTask: (id: string) => void;
  addField: (module: string, field: CustomField) => void;
  removeField: (module: string, fieldId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetDemoData: () => void;
};

const Context = createContext<Store | null>(null);

const mapAudit = (dto: api.AuditDto): AuditEntry => ({
  id: dto.id,
  at: dto.createdAt,
  user: dto.actor,
  action: dto.action,
  module: dto.moduleId,
  recordId: dto.recordId ?? "",
  label: dto.label,
});

function buildSettings(
  org: api.OrganizationDto,
  branches: api.BranchDto[],
  members: api.MemberDto[],
): Settings {
  const employees: Employee[] = members.map((m) => ({
    name: m.name,
    role: m.roleName,
    branch: m.branch ?? "",
    active: m.active,
    id: m.id,
    email: m.email,
    roleKey: m.roleKey,
  }));
  return {
    orgName: org.name,
    legalName: org.legalName ?? org.name,
    gstin: org.gstin ?? "",
    supportEmail: org.supportEmail ?? "",
    phone: org.phone ?? "",
    address: org.address ?? "",
    currency: org.currency ?? "INR",
    financialYear: org.financialYear ?? "April – March",
    taxRegime: String((org.settings ?? {})["taxRegime"] ?? defaultSettings.taxRegime),
    taxRate: Number((org.settings ?? {})["taxRate"] ?? defaultSettings.taxRate),
    tcsPercent: Number((org.settings ?? {})["tcsPercent"] ?? defaultSettings.tcsPercent),
    tcsNote: String((org.settings ?? {})["tcsNote"] ?? defaultSettings.tcsNote),
    invoicePrefix: String((org.settings ?? {})["invoicePrefix"] ?? defaultSettings.invoicePrefix),
    fxRates: {
      ...defaultSettings.fxRates,
      ...(((org.settings ?? {})["fxRates"] ?? {}) as Record<string, number>),
    },
    security: {
      twoFactor: Boolean(
        (((org.settings ?? {})["security"] ?? {}) as Record<string, unknown>)["twoFactor"] ??
        defaultSettings.security.twoFactor,
      ),
      mask: Boolean(
        (((org.settings ?? {})["security"] ?? {}) as Record<string, unknown>)["mask"] ??
        defaultSettings.security.mask,
      ),
      quiet: Boolean(
        (((org.settings ?? {})["security"] ?? {}) as Record<string, unknown>)["quiet"] ??
        defaultSettings.security.quiet,
      ),
    },
    branches: branches.filter((b) => b.active).map((b) => b.name),
    employees,
  };
}

let auditCounter = 0;
const nextAuditId = () => `AUD-${Date.now().toString(36)}-${(auditCounter++).toString(36)}`;

const emailLooksValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * The API's way of saying "enrol an authenticator before anything else".
 * Company admins, branch managers and finance get this when enforcement is on
 * and they have not set one up yet.
 */
const isTwoFactorSetupRequired = (error: unknown) =>
  error instanceof ApiError && error.code === "two_factor_setup_required";

export function CRMProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  /** See `Store.twoFactorSetupRequired`. */
  const [twoFactorSetupRequired, setTwoFactorSetupRequired] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organizationName, setOrganizationName] = useState(defaultSettings.orgName);
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [roleLabel, setRoleLabel] = useState("Workspace admin");
  const [permissions, setPermissions] = useState<api.PermissionSetDto | null>(null);
  /** True when this role only ever sees its own office. */
  const [branchScoped, setBranchScoped] = useState(false);
  /** The office this person works from, by name. */
  const [myBranch, setMyBranch] = useState("");
  const [records, setRecords] = useState<Record<string, RecordRow[]>>({});
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [modulePages, setModulePages] = useState<Record<string, ModulePageState>>({});
  // Tasks start empty: they arrive from the API with the rest of the
  // workspace, so an empty account never flashes sample tasks.
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attention, setAttention] = useState<api.AttentionDto | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [fields, setFields] = useState<Record<string, CustomField[]>>({});
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Server-side identifiers, kept out of React state (they never render).
  const recordIds = useRef(new Map<string, string>()); // `${module}/${reference}` -> server id
  /** Latest list request per module, so a slow page cannot overwrite a newer one. */
  const listRequests = useRef(new Map<string, number>());
  /**
   * The filters the module list is currently showing, and how many pages of
   * it are loaded. A change made outside the list — a bulk edit, a merge —
   * re-reads exactly this, so the screen goes back to matching the database.
   */
  const listQueries = useRef(new Map<string, { query: api.ModuleListQuery; pages: number }>());
  const branchIds = useRef(new Map<string, string>()); // branch name -> id
  const memberIds = useRef(new Map<string, string>()); // member name -> membership id
  /** Modules that have loaded their own page, so the context slice must not overwrite them. */
  const loadedModules = useRef(new Set<string>());
  const pendingOrgPatch = useRef<Record<string, unknown>>({});
  const orgPatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void import("@/lib/monitoring").then((m) => m.initMonitoring());
  }, []);

  useEffect(
    () => () => {
      if (orgPatchTimer.current) clearTimeout(orgPatchTimer.current);
    },
    [],
  );

  const recordKey = (module: string, reference: string) => `${module}/${reference}`;

  const ingestRecords = useCallback((moduleId: string, dtos: api.RecordDto[]): RecordRow[] => {
    return dtos.map((dto) => {
      const reference = dto.reference || dto.id;
      recordIds.current.set(recordKey(moduleId, reference), dto.id);
      return api.toRecordRow(dto);
    });
  }, []);

  /** Loads the whole signed-in workspace: profile, records, tasks, fields, audit. */
  const loadWorkspace = useCallback(async () => {
    // The module catalogue carries the workflow statuses the API enforces.
    // Loading it first means every form offers exactly what the server will
    // accept — a mismatch here is how "create" used to fail silently.
    const catalogue = await api
      .fetchWorkspaceModules()
      .then(applyModuleStatuses)
      .catch(() => undefined);
    void catalogue;

    const [me, customFields, taskList, organization, branches, members, attentionToday] =
      await Promise.all([
        api.fetchMe(),
        api.fetchCustomFields().catch(() => [] as api.CustomFieldDto[]),
        api.fetchTasks().catch(() => [] as api.TaskDto[]),
        api.fetchOrganization(),
        api.fetchBranches().catch(() => [] as api.BranchDto[]),
        api.fetchMembers().catch(() => [] as api.MemberDto[]),
        // The attention feed is what the home page and the sidebar count
        // read. A failure here must never block the workspace.
        api.fetchAttention().catch(() => null),
      ]);
    const auditList = await api.fetchAudit().catch(() => [] as api.AuditDto[]);

    recordIds.current = new Map();
    loadedModules.current = new Set();
    // Every module starts "loaded but empty" so the shell can paint without
    // waiting for the cross-module context cache. The real slice follows below.
    const nextRecords: Record<string, RecordRow[]> = {};
    for (const module of modules) nextRecords[module.id] = [];

    branchIds.current = new Map(branches.map((b) => [b.name, b.id]));
    memberIds.current = new Map(members.map((m) => [`${m.name}::${m.email ?? ""}`, m.id]));

    const nextFields: Record<string, CustomField[]> = {};
    for (const dto of customFields) {
      nextFields[dto.moduleId] = [...(nextFields[dto.moduleId] ?? []), api.toCustomField(dto)];
    }

    setUser({
      id: me.user.id,
      name: me.user.name,
      email: me.user.email,
      phone: me.user.phone ?? null,
      avatarUrl: me.user.avatarUrl ?? null,
      emailVerified: me.user.emailVerified === true,
      isPlatformAdmin: me.user.isPlatformAdmin === true,
    });
    setRoleLabel(api.ROLE_LABEL_BY_KEY[me.membership.roleKey] ?? "Workspace admin");
    setPermissions(me.permissions ?? { modules: "*", actions: "*" });
    setBranchScoped(me.membership.branchScoped === true);
    setMyBranch(branches.find((branch) => branch.id === me.membership.branchId)?.name ?? "");
    setOrganizationName(organization.name);
    setOrganizationSlug(organization.slug ?? "");
    setRecords(nextRecords);
    setTasks(taskList.map(api.toTask));
    setAttention(attentionToday);
    setFields(nextFields);
    setAudit(auditList.map(mapAudit));
    setSettings(buildSettings(organization, branches, members));
    setTwoFactorSetupRequired(false);
    setRecordsLoading(true);
    setStatus("ready");

    /*
     * The recent slice of every module is *context* — the record drawer's
     * history and cross-module links — not the lists themselves. Module
     * screens ask for their own pages, filtered and sorted by the server. So
     * this arrives after first paint: a workspace with tens of thousands of
     * rows no longer makes sign-in wait on rows nobody is looking at.
     */
    void api
      .fetchAllRecords()
      .then((grouped) => {
        setRecords((prev) => {
          const next = { ...prev };
          for (const [moduleId, dtos] of Object.entries(grouped)) {
            // A module that already loaded its own page has fresher rows than
            // this sign-in snapshot, so never clobber it.
            if (loadedModules.current.has(moduleId)) continue;
            if ((prev[moduleId] ?? []).length > 0) continue;
            next[moduleId] = ingestRecords(moduleId, dtos);
          }
          return next;
        });
      })
      .catch(() => {
        /* Context is best-effort; each module screen loads its own page. */
      })
      .finally(() => setRecordsLoading(false));
  }, [ingestRecords]);

  useEffect(() => {
    void api.fetchCsrf().catch(() => {
      /* CSRF is best-effort; the cookie may already be present. */
    });
    let cancelled = false;
    void (async () => {
      try {
        await loadWorkspace();
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          tokenStore.clear();
          setStatus("unauthenticated");
          return;
        }
        /*
         * An enforced-but-unenrolled admin is signed in and healthy; the only
         * thing missing is the authenticator app. Sending them to the login
         * screen would loop — they have no way to enrol from there.
         */
        if (isTwoFactorSetupRequired(error)) {
          setTwoFactorSetupRequired(true);
          setStatus("ready");
          return;
        }
        setBootError(errorMessage(error, "Could not reach the Traveldesk API"));
        setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadWorkspace]);

  /**
   * Loads the workspace after a successful sign-in or registration.
   * Returns true when the person still has to enrol a second factor — in that
   * case the shell shows the enrolment wall instead of the workspace.
   */
  const loadWorkspaceAfterAuth = useCallback(async (): Promise<boolean> => {
    try {
      await loadWorkspace();
      return false;
    } catch (error) {
      if (!isTwoFactorSetupRequired(error)) throw error;
      setTwoFactorSetupRequired(true);
      setStatus("ready");
      return true;
    }
  }, [loadWorkspace]);

  const login = useCallback(
    async (email: string, password: string, second?: { totp?: string; recoveryCode?: string }) => {
      const session = await api.login(email, password, second);
      const gated = await loadWorkspaceAfterAuth();
      return { twoFactorSetupRequired: gated || Boolean(session.twoFactorSetupRequired) };
    },
    [loadWorkspaceAfterAuth],
  );

  const register = useCallback(
    async (
      organizationName: string,
      name: string,
      email: string,
      password: string,
      phone?: string,
      planKey?: string,
    ) => {
      await api.register({
        organizationName,
        name,
        email,
        password,
        ...(phone ? { phone } : {}),
      });
      const gated = await loadWorkspaceAfterAuth();
      if (planKey && !gated) {
        try {
          await updateSubscription({ planKey });
        } catch {
          // Plan selection is best-effort; the workspace still opens.
        }
      }
    },
    [loadWorkspaceAfterAuth],
  );

  const logout = useCallback(async () => {
    await api.logout();
    recordIds.current = new Map();
    loadedModules.current = new Set();
    branchIds.current = new Map();
    memberIds.current = new Map();
    setUser(null);
    setRoleLabel("Workspace admin");
    setPermissions(null);
    setOrganizationName(defaultSettings.orgName);
    setRecords({});
    setModulePages({});
    setTasks([]);
    setAttention(null);
    setFields({});
    setAudit([]);
    setSettings(defaultSettings);
    setTwoFactorSetupRequired(false);
    setStatus("unauthenticated");
  }, []);

  const refreshAttention = useCallback(async (scope: "mine" | "team" = "mine") => {
    try {
      setAttention(await api.fetchAttention(scope));
    } catch {
      // Keep the last known list; a transient failure should not blank the day.
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      await loadWorkspace();
    } catch (error) {
      toast.error(errorMessage(error, "Could not refresh the workspace"));
    }
  }, [loadWorkspace]);

  const refreshAudit = useCallback(async () => {
    try {
      setAudit((await api.fetchAudit()).map(mapAudit));
    } catch {
      // Audit access is role-gated — a non-admin simply keeps the cached list.
    }
  }, []);

  const refreshModule = useCallback(
    async (moduleId: string) => {
      loadedModules.current.add(moduleId);
      try {
        const dtos = await api.fetchRecords(moduleId);
        setRecords((prev) => ({ ...prev, [moduleId]: ingestRecords(moduleId, dtos) }));
      } catch {
        /* keep the current list on a transient failure */
      }
    },
    [ingestRecords],
  );

  /**
   * Reads *every* record of a module, page by page.
   *
   * The sign-in cache deliberately holds only a recent slice — enough for a
   * drawer, not enough to total a year of bookings. A screen that adds up
   * numbers (growth, profitability) calls this so the figure it shows is the
   * whole module, not whatever happened to be cached. It is opt-in per module
   * so signing in never pays for it.
   */
  const ensureModuleRecords = useCallback(
    async (moduleId: string): Promise<void> => {
      loadedModules.current.add(moduleId);
      try {
        const pageSize = 500;
        const all: api.RecordDto[] = [];
        let total = Number.POSITIVE_INFINITY;
        for (let page = 1; all.length < total && page <= 60; page += 1) {
          const result = await api.fetchModulePage(moduleId, {
            page,
            pageSize,
            sort: "createdAt",
            order: "asc",
          });
          all.push(...(result.items ?? []));
          total = result.meta?.total ?? all.length;
          if ((result.items ?? []).length === 0) break;
        }
        setRecords((prev) => ({ ...prev, [moduleId]: ingestRecords(moduleId, all) }));
      } catch {
        /* keep the context slice; the screen still renders what it has */
      }
    },
    [ingestRecords],
  );

  /**
   * Loads one page of a module's list from the server.
   *
   * Filtering, searching and sorting happen in the database, so the answer is
   * about the whole module — not the slice the browser happens to hold. Page 1
   * replaces the module's rows; later pages append.
   */
  const loadModulePage = useCallback(
    async (moduleId: string, query: api.ModuleListQuery, options?: { page?: number }) => {
      const page = options?.page ?? 1;
      loadedModules.current.add(moduleId);
      const pageSize = query.pageSize ?? 200;
      listQueries.current.set(moduleId, {
        query,
        pages: page <= 1 ? 1 : Math.max(page, listQueries.current.get(moduleId)?.pages ?? 1),
      });
      const seq = (listRequests.current.get(moduleId) ?? 0) + 1;
      listRequests.current.set(moduleId, seq);
      setModulePages((prev) => ({
        ...prev,
        [moduleId]: {
          total: prev[moduleId]?.total ?? 0,
          page: prev[moduleId]?.page ?? 0,
          pageSize,
          loading: true,
        },
      }));
      try {
        const result = await api.fetchModulePage(moduleId, { ...query, page, pageSize });
        // A newer request (another filter, another page) already won.
        if (listRequests.current.get(moduleId) !== seq) return;
        const rows = ingestRecords(moduleId, result.items);
        setRecords((prev) => ({
          ...prev,
          [moduleId]: page <= 1 ? rows : [...(prev[moduleId] ?? []), ...rows],
        }));
        setModulePages((prev) => ({
          ...prev,
          [moduleId]: {
            total: result.meta.total,
            page,
            pageSize: result.meta.pageSize,
            loading: false,
          },
        }));
      } catch (error) {
        if (listRequests.current.get(moduleId) !== seq) return;
        setModulePages((prev) => ({
          ...prev,
          [moduleId]: {
            total: prev[moduleId]?.total ?? 0,
            page: prev[moduleId]?.page ?? 0,
            pageSize,
            loading: false,
          },
        }));
        toast.error(errorMessage(error, "Could not load this list"));
      }
    },
    [ingestRecords],
  );

  const refreshFields = useCallback(async () => {
    try {
      const dtos = await api.fetchCustomFields();
      const grouped: Record<string, CustomField[]> = {};
      for (const dto of dtos) {
        grouped[dto.moduleId] = [...(grouped[dto.moduleId] ?? []), api.toCustomField(dto)];
      }
      setFields(grouped);
    } catch {
      /* keep the current fields */
    }
  }, []);

  const pushAudit = useCallback(
    (action: string, module: string, recordId: string, label: string) => {
      setAudit((prev) =>
        [
          {
            id: nextAuditId(),
            at: new Date().toISOString(),
            user: user?.name ?? "You",
            action,
            module,
            recordId,
            label,
          },
          ...prev,
        ].slice(0, 500),
      );
    },
    [user],
  );

  /* ----- Organisation settings sync (only when signed in) ----- */

  const queueOrgPatch = useCallback((body: Record<string, unknown>) => {
    pendingOrgPatch.current = { ...pendingOrgPatch.current, ...body };
    if (orgPatchTimer.current) clearTimeout(orgPatchTimer.current);
    orgPatchTimer.current = setTimeout(() => {
      const payload = pendingOrgPatch.current;
      pendingOrgPatch.current = {};
      orgPatchTimer.current = null;
      if (Object.keys(payload).length === 0) return;
      void api
        .patchOrganization(payload)
        .then((org) => {
          // Sync the authoritative server state back so the UI never drifts.
          const branches = api.fetchBranches().catch(() => []);
          const members = api.fetchMembers().catch(() => []);
          void Promise.all([branches, members]).then(([b, m]) => {
            setSettings(buildSettings(org, b ?? [], m ?? []));
          });
        })
        .catch((error) => {
          toast.error(errorMessage(error, "Could not save organisation settings"));
          // Rollback: re-fetch the real server state so the UI matches the database.
          void api
            .fetchOrganization()
            .then((org) => {
              void Promise.all([
                api.fetchBranches().catch(() => []),
                api.fetchMembers().catch(() => []),
              ]).then(([b, m]) => setSettings(buildSettings(org, b ?? [], m ?? [])));
            })
            .catch(() => {
              /* network down — keep the optimistic state, user will see it on reconnect */
            });
        });
    }, 600);
  }, []);

  const syncSettings = useCallback(
    (prev: Settings, next: Settings) => {
      const orgBody: Record<string, unknown> = {};
      if (next.orgName.trim().length >= 2 && next.orgName !== prev.orgName)
        orgBody["name"] = next.orgName;
      if (next.legalName !== prev.legalName) orgBody["legalName"] = next.legalName;
      if (next.gstin !== prev.gstin) orgBody["gstin"] = next.gstin;
      if (next.supportEmail !== prev.supportEmail && emailLooksValid(next.supportEmail))
        orgBody["supportEmail"] = next.supportEmail;
      if (next.phone !== prev.phone) orgBody["phone"] = next.phone;
      if (next.address !== prev.address) orgBody["address"] = next.address;
      if (next.currency !== prev.currency) orgBody["currency"] = next.currency;
      if (next.financialYear !== prev.financialYear) orgBody["financialYear"] = next.financialYear;
      if (
        next.taxRegime !== prev.taxRegime ||
        next.taxRate !== prev.taxRate ||
        next.tcsPercent !== prev.tcsPercent ||
        next.tcsNote !== prev.tcsNote ||
        next.invoicePrefix !== prev.invoicePrefix ||
        JSON.stringify(next.fxRates) !== JSON.stringify(prev.fxRates) ||
        JSON.stringify(next.security) !== JSON.stringify(prev.security)
      ) {
        orgBody["settings"] = {
          taxRegime: next.taxRegime,
          taxRate: next.taxRate,
          tcsPercent: next.tcsPercent,
          tcsNote: next.tcsNote,
          invoicePrefix: next.invoicePrefix,
          fxRates: next.fxRates,
          security: next.security,
        };
      }
      if (Object.keys(orgBody).length > 0) queueOrgPatch(orgBody);

      if (next.branches !== prev.branches) {
        for (const name of next.branches.filter((b) => !prev.branches.includes(b))) {
          void api
            .createBranch({ name })
            .then((branch) => branchIds.current.set(branch.name, branch.id))
            .catch((error) => toast.error(errorMessage(error, `Could not add the ${name} branch`)));
        }
        for (const name of prev.branches.filter((b) => !next.branches.includes(b))) {
          const id = branchIds.current.get(name);
          if (!id) continue;
          void api
            .deleteBranch(id)
            .catch((error) =>
              toast.error(errorMessage(error, `Could not remove the ${name} branch`)),
            );
        }
      }

      if (next.employees !== prev.employees) {
        const before = new Map(prev.employees.map((e) => [e.name, e]));
        const after = new Map(next.employees.map((e) => [e.name, e]));

        for (const [name, employee] of after) {
          const existing = before.get(name);
          if (!existing) {
            const roleKey = employee.roleKey ?? api.ROLE_KEY_BY_LABEL[employee.role] ?? "sales";
            if (!employee.email) {
              toast.error(`Add a work email for ${name} before inviting them`);
              continue;
            }
            const branchId = branchIds.current.get(employee.branch);
            void api
              .createMember({
                name,
                email: employee.email,
                roleKey,
                ...(branchId ? { branchId } : {}),
              })
              .then((res) => memberIds.current.set(`${name}::${employee.email ?? ""}`, res.id))
              .catch((error) => toast.error(errorMessage(error, `Could not invite ${name}`)));
          } else if (existing.active !== employee.active) {
            const id = memberIds.current.get(`${name}::${employee.email ?? ""}`) ?? existing.id;
            if (!id) continue;
            void api
              .updateMember(id, { active: employee.active })
              .catch((error) => toast.error(errorMessage(error, `Could not update ${name}`)));
          }
        }

        for (const [name, employee] of before) {
          if (after.has(name)) continue;
          const id = memberIds.current.get(`${name}::${employee.email ?? ""}`);
          if (!id) continue;
          void api
            .updateMember(id, { active: false })
            .catch((error) => toast.error(errorMessage(error, `Could not deactivate ${name}`)));
        }
      }
    },
    [queueOrgPatch],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      if (status === "ready") syncSettings(settings, next);
    },
    [settings, status, syncSettings],
  );

  /* ----- Records ----- */

  const getRows = useCallback(
    (id: string, _tab?: string): RecordRow[] => records[id] ?? [],
    [records],
  );

  const save = useCallback(
    (module: string, row: RecordRow) => {
      if (status !== "ready") {
        // Never write into a local pretend list: the record would look saved
        // and disappear on reload.
        toast.error("Not connected — this record was not saved");
        return;
      }
      void (async () => {
        try {
          const dto = await api.createRecord(module, api.toRecordBody(row));
          const mapped = api.toRecordRow(dto);
          recordIds.current.set(recordKey(module, mapped.id), dto.id);
          setRecords((prev) => ({ ...prev, [module]: [mapped, ...(prev[module] ?? [])] }));
          void refreshAudit();
        } catch (error) {
          toast.error(errorMessage(error, `Could not save the ${module} record`));
        }
      })();
    },
    [status, pushAudit, refreshAudit],
  );

  /** Same as save, but resolves with the created row (with its real reference). */
  const createRecord = useCallback(
    (module: string, row: RecordRow): Promise<RecordRow | null> => {
      if (status !== "ready") {
        toast.error("Not connected — this record was not saved");
        return Promise.resolve(null);
      }
      return (async () => {
        try {
          const dto = await api.createRecord(module, api.toRecordBody(row));
          const mapped = api.toRecordRow(dto);
          recordIds.current.set(recordKey(module, mapped.id), dto.id);
          setRecords((prev) => ({ ...prev, [module]: [mapped, ...(prev[module] ?? [])] }));
          void refreshAudit();
          return mapped;
        } catch (error) {
          toast.error(errorMessage(error, `Could not save the ${module} record`));
          return null;
        }
      })();
    },
    [status, pushAudit, refreshAudit],
  );

  const update = useCallback(
    (module: string, row: RecordRow) => {
      if (status !== "ready") {
        setRecords((prev) => ({
          ...prev,
          [module]: (prev[module] ?? []).map((r) => (r.id === row.id ? row : r)),
        }));
        pushAudit("Updated", module, row.id, row.name);
        return;
      }
      const serverId = recordIds.current.get(recordKey(module, row.id));
      setRecords((prev) => ({
        ...prev,
        [module]: (prev[module] ?? []).map((r) => (r.id === row.id ? row : r)),
      }));
      if (!serverId) {
        void refreshModule(module);
        return;
      }
      void (async () => {
        try {
          const dto = await api.updateRecord(
            module,
            serverId,
            api.toRecordBody(row),
            row.updatedAt,
          );
          const mapped = api.toRecordRow(dto);
          setRecords((prev) => ({
            ...prev,
            [module]: (prev[module] ?? []).map((r) => (r.id === row.id ? mapped : r)),
          }));
          void refreshAudit();
        } catch (error) {
          toast.error(errorMessage(error, "Could not update the record"));
          void refreshModule(module);
        }
      })();
    },
    [status, pushAudit, refreshAudit, refreshModule],
  );

  /**
   * Update that resolves with the saved row.
   *
   * The dialog stays open (and the button stays busy) until the server has
   * answered, so "Saved" is never shown for a change that was rejected.
   */
  const updateRecord = useCallback(
    (module: string, row: RecordRow): Promise<RecordRow | null> => {
      if (status !== "ready") {
        toast.error("Not connected — this change was not saved");
        return Promise.resolve(null);
      }
      const serverId = recordIds.current.get(recordKey(module, row.id));
      if (!serverId) {
        toast.error("This record is still syncing — try again in a moment");
        return Promise.resolve(null);
      }
      return (async () => {
        try {
          const dto = await api.updateRecord(
            module,
            serverId,
            api.toRecordBody(row),
            row.updatedAt,
          );
          const mapped = api.toRecordRow(dto);
          setRecords((prev) => ({
            ...prev,
            [module]: (prev[module] ?? []).map((r) => (r.id === row.id ? mapped : r)),
          }));
          void refreshAudit();
          return mapped;
        } catch (error) {
          toast.error(errorMessage(error, `Could not update the ${module} record`));
          // A conflict means this screen is stale; pull the current version so
          // the next save carries the right stamp.
          if (error instanceof ApiError && error.status === 409) void refreshModule(module);
          return null;
        }
      })();
    },
    [status, refreshAudit, refreshModule],
  );

  const remove = useCallback(
    (module: string, rowId: string) => {
      if (status !== "ready") {
        const label = (records[module] ?? []).find((r) => r.id === rowId)?.name ?? rowId;
        setRecords((prev) => ({
          ...prev,
          [module]: (prev[module] ?? []).filter((r) => r.id !== rowId),
        }));
        pushAudit("Deleted", module, rowId, label);
        return;
      }
      const label = (records[module] ?? []).find((r) => r.id === rowId)?.name ?? "Record";
      const serverId = recordIds.current.get(recordKey(module, rowId));
      setRecords((prev) => ({
        ...prev,
        [module]: (prev[module] ?? []).filter((r) => r.id !== rowId),
      }));
      if (!serverId) return;
      void api
        .deleteRecord(module, serverId)
        .then(() => {
          void refreshAudit();
          // Deleting is soft, so the honest message is "it moved", not "it is
          // gone" — and there is one click back if the wrong row was hit.
          toast.success(`${label} moved to the recycle bin`, {
            duration: 8000,
            action: {
              label: "Undo",
              onClick: () => {
                void restoreTrashed(serverId)
                  .then(() => {
                    toast.success(`${label} restored`);
                    void refreshModule(module);
                  })
                  .catch((error) =>
                    toast.error(errorMessage(error, "Could not restore the record")),
                  );
              },
            },
          });
        })
        .catch((error) => {
          toast.error(errorMessage(error, "Could not delete the record"));
          void refreshModule(module);
        });
    },
    [status, records, pushAudit, refreshAudit, refreshModule],
  );

  /**
   * Re-reads the module list a bulk change or a merge just altered.
   *
   * Only what was already on screen is re-fetched, so "load 200 more" does
   * not quietly collapse back to the first page after an edit.
   */
  const reloadList = useCallback(
    async (moduleId: string) => {
      const state = listQueries.current.get(moduleId);
      if (!state) return;
      const pages = Math.min(Math.max(state.pages, 1), 10);
      for (let page = 1; page <= pages; page++) {
        await loadModulePage(moduleId, state.query, { page });
      }
    },
    [loadModulePage],
  );

  /**
   * Applies one change to many records at once.
   *
   * The change is made in the database and the list is then re-read from it,
   * rather than edited row by row in the browser: 400 touched records that
   * disagree with the server is worse than a slower button.
   */
  const bulkUpdate = useCallback(
    async (
      moduleId: string,
      references: string[],
      action: "assign" | "status" | "delete",
      value?: string,
    ): Promise<number> => {
      if (status !== "ready") {
        // Demo workspace — the same edit, applied in memory.
        setRecords((prev) => {
          const rows = prev[moduleId] ?? [];
          const next =
            action === "delete"
              ? rows.filter((row) => !references.includes(row.id))
              : rows.map((row) => {
                  if (!references.includes(row.id)) return row;
                  if (action === "status") return { ...row, status: value ?? row.status };
                  return { ...row, owner: value ?? row.owner };
                });
          return { ...prev, [moduleId]: next };
        });
        pushAudit(
          action === "delete" ? "Deleted" : action === "status" ? "Updated" : "Assigned",
          moduleId,
          "",
          `${references.length} record${references.length === 1 ? "" : "s"} ${
            action === "delete"
              ? "deleted"
              : action === "status"
                ? `set to ${value}`
                : `assigned to ${value || "the unclaimed queue"}`
          }`,
        );
        return references.length;
      }

      const result = await bulkRecords(moduleId, {
        action,
        references,
        ...(value !== undefined ? { value } : {}),
      });
      await reloadList(moduleId);
      void refreshAudit();
      return result.affected;
    },
    [status, pushAudit, refreshAudit, reloadList],
  );

  /**
   * Folds duplicate records into one and re-reads the list.
   *
   * Returns how many child rows came across, so the screen can report what
   * actually moved instead of just saying "done".
   */
  const mergeInto = useCallback(
    async (moduleId: string, keep: string, merges: string[]) => {
      if (status !== "ready") {
        setRecords((prev) => ({
          ...prev,
          [moduleId]: (prev[moduleId] ?? []).filter((row) => !merges.includes(row.id)),
        }));
        pushAudit("Updated", moduleId, "", `${merges.length} records merged into ${keep}`);
        return null;
      }
      const result = await api.mergeModuleRecords(moduleId, keep, merges);
      await reloadList(moduleId);
      void refreshAudit();
      return result;
    },
    [status, pushAudit, refreshAudit, reloadList],
  );

  /* ----- Tasks ----- */

  const addTask = useCallback(
    (task: Omit<Task, "id">) => {
      if (status !== "ready") {
        setTasks((prev) => [
          ...prev,
          { ...task, id: String(Math.max(0, ...prev.map((t) => Number(t.id) || 0)) + 1) },
        ]);
        return;
      }
      void api
        .createTask({
          title: task.title,
          type: task.type,
          owner: task.owner,
          date: task.date,
          priority: task.priority,
          done: task.done,
          ...(task.relatedModule ? { relatedModule: task.relatedModule } : {}),
          ...(task.relatedRecordId ? { relatedRecordId: task.relatedRecordId } : {}),
        })
        .then((dto) => setTasks((prev) => [...prev, api.toTask(dto)]))
        .catch((error) => toast.error(errorMessage(error, "Could not create the task")));
    },
    [status],
  );

  const updateTask = useCallback(
    (task: Task) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      if (status !== "ready") return;
      void api
        .updateTask(task.id, {
          title: task.title,
          type: task.type,
          owner: task.owner,
          date: task.date,
          priority: task.priority,
          done: task.done,
        })
        .catch((error) => toast.error(errorMessage(error, "Could not update the task")));
    },
    [status],
  );

  const toggleTask = useCallback(
    (id: string, done: boolean) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
      if (status !== "ready") return;
      void api
        .updateTask(id, { done })
        .catch((error) => toast.error(errorMessage(error, "Could not update the task")));
    },
    [status],
  );

  const removeTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (status !== "ready") return;
      void api.deleteTask(id).catch(() => toast.error("Could not delete the task"));
    },
    [status],
  );

  /* ----- Custom fields ----- */

  const addField = useCallback(
    (module: string, field: CustomField) => {
      if (status !== "ready") {
        setFields((prev) => ({ ...prev, [module]: [...(prev[module] ?? []), field] }));
        return;
      }
      void api
        .createCustomField({ moduleId: module, label: field.label, type: field.type, options: [] })
        .then((dto) =>
          setFields((prev) => ({
            ...prev,
            [module]: [...(prev[module] ?? []), api.toCustomField(dto)],
          })),
        )
        .catch((error) => toast.error(errorMessage(error, "Could not add the custom field")));
    },
    [status],
  );

  const removeField = useCallback(
    (module: string, fieldId: string) => {
      setFields((prev) => ({
        ...prev,
        [module]: (prev[module] ?? []).filter((f) => f.id !== fieldId),
      }));
      if (status !== "ready") return;
      void api.deleteCustomField(fieldId).catch((error) => {
        toast.error(errorMessage(error, "Could not remove the custom field"));
        void refreshFields();
      });
    },
    [status, refreshFields],
  );

  const resetDemoData = useCallback(() => {
    if (status === "ready") {
      void reload();
      return;
    }
    setRecords({});
    setTasks([]);
    setFields({});
    setAudit([]);
    setSettings(defaultSettings);
  }, [status, reload]);

  return (
    <Context.Provider
      value={{
        status,
        bootError,
        twoFactorSetupRequired,
        user,
        organizationName,
        organizationSlug,
        roleLabel,
        permissions,
        branchScoped,
        myBranch,
        records,
        recordsLoading,
        modulePages,
        loadModulePage,
        ensureModuleRecords,
        tasks,
        attention,
        refreshAttention,
        audit,
        fields,
        settings,
        login,
        register,
        logout,
        reload,
        getRows,
        save,
        createRecord,
        updateRecord,
        refreshModuleRecords: refreshModule,
        update,
        remove,
        bulkUpdate,
        mergeInto,
        addTask,
        updateTask,
        toggleTask,
        removeTask,
        addField,
        removeField,
        updateSettings,
        resetDemoData,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useCRM() {
  const store = useContext(Context);
  if (!store) throw new Error("CRMProvider is required");
  return store;
}
