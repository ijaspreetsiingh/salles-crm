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
  seedRows,
  seedTasks,
  type CustomField,
  type Employee,
  type RecordRow,
  type Settings,
  type Task,
} from "./catalog";
import * as api from "@/lib/api/crm";
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

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
};

type Store = {
  status: AuthStatus;
  /** Shown on the sign-in screen when the API could not be reached. */
  bootError: string | null;
  user: SessionUser | null;
  organizationName: string;
  roleLabel: string;
  records: Record<string, RecordRow[]>;
  tasks: Task[];
  audit: AuditEntry[];
  fields: Record<string, CustomField[]>;
  settings: Settings;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  getRows: (id: string, tab?: string) => RecordRow[];
  save: (module: string, row: RecordRow) => void;
  update: (module: string, row: RecordRow) => void;
  remove: (module: string, rowId: string) => void;
  addTask: (task: Omit<Task, "id">) => void;
  updateTask: (task: Task) => void;
  toggleTask: (id: string, done: boolean) => void;
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
    branches: branches.filter((b) => b.active).map((b) => b.name),
    employees,
  };
}

let auditCounter = 0;
const nextAuditId = () => `AUD-${Date.now().toString(36)}-${(auditCounter++).toString(36)}`;

const emailLooksValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function CRMProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organizationName, setOrganizationName] = useState(defaultSettings.orgName);
  const [roleLabel, setRoleLabel] = useState("Workspace admin");
  const [records, setRecords] = useState<Record<string, RecordRow[]>>({});
  const [tasks, setTasks] = useState<Task[]>(() => seedTasks());
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [fields, setFields] = useState<Record<string, CustomField[]>>({});
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Server-side identifiers, kept out of React state (they never render).
  const recordIds = useRef(new Map<string, string>()); // `${module}/${reference}` -> server id
  const branchIds = useRef(new Map<string, string>()); // branch name -> id
  const memberIds = useRef(new Map<string, string>()); // member name -> membership id
  const pendingOrgPatch = useRef<Record<string, unknown>>({});
  const orgPatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const [me, customFields, taskList, organization, branches, members] = await Promise.all([
      api.fetchMe(),
      api.fetchCustomFields().catch(() => [] as api.CustomFieldDto[]),
      api.fetchTasks().catch(() => [] as api.TaskDto[]),
      api.fetchOrganization(),
      api.fetchBranches().catch(() => [] as api.BranchDto[]),
      api.fetchMembers().catch(() => [] as api.MemberDto[]),
    ]);
    const auditList = await api.fetchAudit().catch(() => [] as api.AuditDto[]);

    // One request for every module instead of twenty-four. The API groups
    // the records by module, so the app is ready in a single round trip.
    const grouped = await api.fetchAllRecords();

    recordIds.current = new Map();
    const nextRecords: Record<string, RecordRow[]> = {};
    for (const [moduleId, dtos] of Object.entries(grouped)) {
      nextRecords[moduleId] = ingestRecords(moduleId, dtos);
    }
    // A module with no records still needs an (empty) entry so the UI knows
    // it has been loaded.
    for (const module of modules) {
      if (!nextRecords[module.id]) nextRecords[module.id] = [];
    }

    branchIds.current = new Map(branches.map((b) => [b.name, b.id]));
    memberIds.current = new Map(members.map((m) => [m.name, m.id]));

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
    });
    setRoleLabel(api.ROLE_LABEL_BY_KEY[me.membership.roleKey] ?? "Workspace admin");
    setOrganizationName(organization.name);
    setRecords(nextRecords);
    setTasks(taskList.map(api.toTask));
    setFields(nextFields);
    setAudit(auditList.map(mapAudit));
    setSettings(buildSettings(organization, branches, members));
    setStatus("ready");
  }, [ingestRecords]);

  useEffect(() => {
    if (!tokenStore.access) {
      setStatus("unauthenticated");
      return;
    }
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
        setBootError(errorMessage(error, "Could not reach the Traveldesk API"));
        setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadWorkspace]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.login(email, password);
      tokenStore.set(session.accessToken, session.refreshToken);
      await loadWorkspace();
    },
    [loadWorkspace],
  );

  const logout = useCallback(async () => {
    await api.logout();
    tokenStore.clear();
    recordIds.current = new Map();
    branchIds.current = new Map();
    memberIds.current = new Map();
    setUser(null);
    setRoleLabel("Workspace admin");
    setOrganizationName(defaultSettings.orgName);
    setRecords({});
    setTasks(seedTasks());
    setFields({});
    setAudit([]);
    setSettings(defaultSettings);
    setStatus("unauthenticated");
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
      try {
        const dtos = await api.fetchRecords(moduleId);
        setRecords((prev) => ({ ...prev, [moduleId]: ingestRecords(moduleId, dtos) }));
      } catch {
        /* keep the current list on a transient failure */
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
        .catch((error) => toast.error(errorMessage(error, "Could not save organisation settings")));
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
              .then((res) => memberIds.current.set(name, res.id))
              .catch((error) => toast.error(errorMessage(error, `Could not invite ${name}`)));
          } else if (existing.active !== employee.active) {
            const id = memberIds.current.get(name) ?? existing.id;
            if (!id) continue;
            void api
              .updateMember(id, { active: employee.active })
              .catch((error) => toast.error(errorMessage(error, `Could not update ${name}`)));
          }
        }

        for (const [name] of before) {
          if (after.has(name)) continue;
          const id = memberIds.current.get(name);
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
    (id: string, tab?: string): RecordRow[] =>
      records[id] ?? (status === "ready" ? [] : seedRows(id, tab)),
    [records, status],
  );

  const save = useCallback(
    (module: string, row: RecordRow) => {
      if (status !== "ready") {
        setRecords((prev) => ({ ...prev, [module]: [row, ...(prev[module] ?? seedRows(module))] }));
        pushAudit("Created", module, row.id, row.name);
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

  const update = useCallback(
    (module: string, row: RecordRow) => {
      if (status !== "ready") {
        setRecords((prev) => ({
          ...prev,
          [module]: (prev[module] ?? seedRows(module)).map((r) => (r.id === row.id ? row : r)),
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
          const dto = await api.updateRecord(module, serverId, api.toRecordBody(row));
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

  const remove = useCallback(
    (module: string, rowId: string) => {
      if (status !== "ready") {
        const label =
          (records[module] ?? seedRows(module)).find((r) => r.id === rowId)?.name ?? rowId;
        setRecords((prev) => ({
          ...prev,
          [module]: (prev[module] ?? seedRows(module)).filter((r) => r.id !== rowId),
        }));
        pushAudit("Deleted", module, rowId, label);
        return;
      }
      const serverId = recordIds.current.get(recordKey(module, rowId));
      setRecords((prev) => ({
        ...prev,
        [module]: (prev[module] ?? []).filter((r) => r.id !== rowId),
      }));
      if (!serverId) return;
      void api
        .deleteRecord(module, serverId)
        .then(() => void refreshAudit())
        .catch((error) => {
          toast.error(errorMessage(error, "Could not delete the record"));
          void refreshModule(module);
        });
    },
    [status, records, pushAudit, refreshAudit, refreshModule],
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
    setTasks(seedTasks());
    setFields({});
    setAudit([]);
    setSettings(defaultSettings);
  }, [status, reload]);

  return (
    <Context.Provider
      value={{
        status,
        bootError,
        user,
        organizationName,
        roleLabel,
        records,
        tasks,
        audit,
        fields,
        settings,
        login,
        logout,
        reload,
        getRows,
        save,
        update,
        remove,
        addTask,
        updateTask,
        toggleTask,
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
