import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe2,
  LayoutGrid,
  Lightbulb,
  List,
  Loader2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  CellValue,
  DateFilter,
  EmptyState,
  PageHeading,
  RecordDialog,
  Status,
  workflowDataFor,
} from "./common";
import { RecordSheet } from "./record-sheet";
import { RecordCards } from "./record-cards";
import { RowMenu } from "./row-menu";
import { NotificationBell, type Notification } from "./notification-bell";
import { Btn, FilterMenu, Kbd, Segmented, Sheet } from "./ui";
import { Page, PageIdentity } from "./page";
import { Ledger } from "./archetypes/ledger";
import { Pipeline } from "./archetypes/pipeline";
import { Work } from "./archetypes/work";
import { FirstRunWizard } from "./firstrun";
import { HelpPanel } from "./help";
import { guideFor } from "@/lib/crm/guide";
import { plain, plainModule } from "@/lib/crm/language";
import { t, detectLanguage, type Language, LANGUAGES } from "@/lib/crm/i18n";
import {
  exportRows,
  findModule,
  formatDay,
  money,
  modules,
  type Module,
  type RecordRow,
} from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { cn } from "@/lib/utils";
import {
  takeCommsFocus,
  takeProfileFocus,
  setCommsFocus,
  setProfileFocus,
  type CommsFocus,
} from "@/lib/crm/handoff";
import { COMMS_TEMPLATES, fillCommsTemplate } from "@/lib/crm/comms-templates";
import { getSchema, getTabDef, extraKeyName, type ModuleSchema } from "@/lib/crm/schema";
import { CustomerDirectory } from "./customer-directory";
import { CustomerProfile } from "./customer-profile";
import { QuotationCover } from "./quotation-cover";
import { GrowthReports } from "./growth-reports";
import { WhatsAppConnect } from "./whatsapp-connect";
import { AutomationStudio, ExecutionHistory } from "./automation-canvas";
import { Expenses, Payables, ProfitLoss, TaxSummary } from "./finance-panels";
import { ReconciliationPanel } from "./reconciliation-panel";
import { HotelRates } from "./hotel-rates-panel";
import { HotelSearch } from "./hotel-search";
import { TeamChat } from "./team-chat";
import { PNRQueue } from "./pnr-queue";
import { RecycleBin } from "./recycle-bin";
import { Campaigns } from "./campaigns-panel";
import { TwoFactorPanel } from "./two-factor";
import { WebsitePanel } from "./website-panel";
import { ROLE_KEY_BY_LABEL } from "@/lib/api/crm";
import { errorMessage } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import {
  connectIntegration,
  createSavedReport,
  createWebhook,
  createWorkflow,
  createApiKey,
  changePassword,
  createConversation,
  createCallLog,
  createMessageTemplate,
  deleteCallLog,
  deleteMessageTemplate,
  deleteSavedReport,
  deleteWebhook,
  deleteWorkflow,
  disconnectIntegration,
  downloadReport,
  exportRecordsCsv,
  fetchApiKeys,
  fetchAssistantMessages,
  fetchChannelStatus,
  fetchCallLogs,
  fetchConsents,
  fetchConversation,
  fetchConversationChannels,
  fetchConversations,
  fetchIntegrations,
  fetchInvoices,
  fetchMessageTemplates,
  fetchPlans,
  fetchRoleMatrix,
  fetchSavedReports,
  fetchSubscription,
  fetchWebhooks,
  fetchWebhookDeliveries,
  fetchWorkflows,
  fetchDomain,
  revokeApiKey,
  removeEmailChannel,
  removeRazorpayChannel,
  removeWhatsAppChannel,
  retryWebhookDelivery,
  runReport,
  runWorkflow,
  saveEmailChannel,
  saveRazorpayChannel,
  saveWhatsAppChannel,
  saveConsent,
  type ConsentDto,
  searchFlights,
  sendAssistantMessage,
  sendConversationMessage,
  sendEmailTest,
  sendWhatsAppTest,
  testWebhook,
  updateProfile,
  updateRole,
  updateSubscription,
  updateDomain,
  updateWorkflow,
  type AssistantMessageDto,
  type ConversationDto,
  type IntegrationDto,
  type MessageDto,
  type PlanDto,
  type ReportKey,
  type WebhookDeliveryDto,
  type RoleDto,
  type WorkflowDto,
  type FlightSearchResult,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api/modules";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  endOfDay,
  endOfMonth,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from "date-fns";

const dateInRange = (iso: string, range: string) => {
  const day = parseISO(iso);
  if (Number.isNaN(day.getTime())) return true; // keep records with free-form dates
  const now = new Date();
  if (range === "This week")
    return !isBefore(day, startOfWeek(now)) && !isAfter(day, endOfDay(now));
  if (range === "This month")
    return !isBefore(day, startOfMonth(now)) && !isAfter(day, endOfDay(now));
  if (range === "Last month")
    return (
      !isBefore(day, startOfMonth(subMonths(now, 1))) &&
      !isAfter(day, endOfMonth(subMonths(now, 1)))
    );
  if (range === "This year")
    return !isBefore(day, startOfYear(now)) && !isAfter(day, endOfDay(now));
  return true; // All time
};

type SortKey = "id" | "name" | "destination" | "date" | "amount" | "status" | "owner";

const SORTABLE_KEYS: SortKey[] = ["id", "name", "destination", "date", "amount", "status", "owner"];
const isSortableKey = (key: string): key is SortKey => (SORTABLE_KEYS as string[]).includes(key);

/**
 * Modules whose tabs are genuine sub-screens (an editor, a console, a canvas)
 * keep their catalogue tab list. Everything else uses the trimmed guide
 * views, so a module stops offering eight tabs that all show the same table.
 */
const SPECIAL_TAB_MODULES = new Set([
  "assistant",
  "inbox",
  "integrations",
  "settings",
  "reports",
  "quotations",
  "automation",
  "flights",
  "campaigns",
  "team-chat",
]);

export function Workspace({ module }: { module: Module }) {
  const guide = guideFor(module);
  const {
    getRows,
    update,
    createRecord,
    settings,
    fields,
    user,
    permissions,
    status,
    recordsLoading,
  } = useCRM();
  const navigate = useNavigate();
  const allowed =
    !permissions || permissions.modules === "*" || permissions.modules.includes(module.id);
  const currency = settings.currency;
  const schema = getSchema(module.id);
  const customFields = fields[module.id] ?? [];

  /** Modules whose tabs are real sub-screens keep the catalogue tab list. */
  const usesModuleTabs = SPECIAL_TAB_MODULES.has(module.id);
  const tabOptions = usesModuleTabs ? module.tabs : guide.views.map((v) => v.label);

  const [tab, setTab] = useState(tabOptions[0] ?? "Overview");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [date, setDate] = useState("All time");
  const [owner, setOwner] = useState("All owners");
  const [filters, setFilters] = useState(false);
  const [row, setRow] = useState<RecordRow | null>(null);
  const [create, setCreate] = useState(false);
  const [createStage, setCreateStage] = useState<string | null>(null);
  /** The record being edited in the form dialog (opened from the side panel). */
  const [editingRow, setEditingRow] = useState<RecordRow | null>(null);
  /** The module the open side-panel record belongs to (may differ after a conversion). */
  const [sheetModuleId, setSheetModuleId] = useState<string | null>(null);
  /** A cross-module create (lead → booking, booking → invoice) pending in form. */
  const [workflowCreate, setWorkflowCreate] = useState<{
    module: Module;
    data: Partial<RecordRow>;
  } | null>(null);
  const [view, setView] = useState<"work" | "list" | "board" | "cards" | "grid">(
    guide.archetype === "catalogue" ? "grid" : "work",
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [showTips, setShowTips] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [help, setHelp] = useState(false);
  const offered = useRef(false);

  /** Real-time notifications via SSE. */
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userLanguage, setUserLanguage] = useState<Language>("en");
  const [showNotifications, setShowNotifications] = useState(false);

  const rows = getRows(module.id, tab);
  const tabDef = getTabDef(schema, tab);
  const activeView = usesModuleTabs ? undefined : guide.views.find((v) => v.label === tab);

  /** Language preference + the real notification tray from the API. */
  useEffect(() => {
    const stored = localStorage.getItem("travo.language");
    if (
      stored &&
      (stored === "en" || stored === "hi" || stored === "es" || stored === "fr" || stored === "ar")
    ) {
      setUserLanguage(stored as Language);
    } else {
      setUserLanguage(detectLanguage());
    }

    // One authenticated read of the tray. The app polls it with the rest of
    // the workspace instead of holding an EventSource open on a route the
    // server never implemented.
    let cancelled = false;
    fetchNotifications()
      .then((tray) => {
        if (cancelled) return;
        const items: Notification[] = (tray.items ?? []).map((n) => ({
          ...n,
          moduleId: n.moduleId ?? "",
          recordId: n.recordId ?? "",
          level: (["info", "warning", "danger", "success"] as const).includes(
            n.level as "info" | "warning" | "danger" | "success",
          )
            ? (n.level as Notification["level"])
            : "info",
        }));
        setNotifications(items);
        setUnreadCount(tray.unread ?? 0);
      })
      .catch(() => {
        // The tray is supplementary; the workspace works without it.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const handleOpenNotification = (n: Notification) => {
    if (n.moduleId) {
      void navigate({ to: `/workspace/$module`, params: { module: n.moduleId } });
    }
  };

  // A view narrows by status; a search never changes the headline numbers.
  const scoped = useMemo(() => {
    const statuses = activeView?.statuses ?? tabDef.statuses;
    return statuses ? rows.filter((r) => statuses.includes(r.status)) : rows;
  }, [rows, activeView, tabDef]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = scoped.filter(
      (r) =>
        (!q ||
          `${r.name} ${r.destination} ${r.id} ${r.detail} ${r.email} ${r.phone} ${r.owner} ${r.notes}`
            .toLowerCase()
            .includes(q)) &&
        (statusFilter.length === 0 || statusFilter.includes(r.status)) &&
        (owner === "All owners" || r.owner === owner) &&
        dateInRange(r.date, date),
    );
    if (!sort) return matched;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      const av = sort.key === "amount" ? a.amount : String(a[sort.key]);
      const bv = sort.key === "amount" ? b.amount : String(b[sort.key]);
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir;
    });
  }, [scoped, query, statusFilter, owner, date, sort]);

  const noun = module.noun;
  const activeEmployees = settings.employees.filter((e) => e.active);

  // KPI context — computed from the view, not from the search box, so the
  // headline numbers never move while you type.
  const kpiContext = useMemo(
    () => ({
      money: (value: number) => money(value, currency),
      countBy: (statuses: string[]) =>
        statuses.length === 0
          ? scoped.length
          : scoped.filter((r) => statuses.includes(r.status)).length,
      sumBy: (statuses?: string[]) =>
        (statuses ? scoped.filter((r) => statuses.includes(r.status)) : scoped).reduce(
          (a, r) => a + (Number(r.amount) || 0),
          0,
        ),
    }),
    [scoped, currency],
  );

  const kpis = schema.kpis.map((kpi) => ({ ...kpi, display: kpi.value(scoped, kpiContext) }));

  const special =
    module.id === "assistant"
      ? "assistant"
      : module.id === "inbox"
        ? "inbox"
        : module.id === "reports" && tab === "Growth"
          ? "growth"
          : module.id === "reports"
            ? "reports"
            : module.id === "integrations"
              ? "integrations"
              : module.id === "quotations" && tab === "Itinerary builder"
                ? "itinerary"
                : module.id === "automation" && tab === "Workflows"
                  ? "automation"
                  : module.id === "settings"
                    ? "settings"
                    : module.id === "flights" && tab === "Flight search"
                      ? "flights"
                      : null;

  /** Customers get the Rapport directory grid instead of the generic table/board. */
  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null,
    );

  /** Open the create form, optionally pre-set to a pipeline stage. */
  const openCreate = (stage?: string) => {
    setCreateStage(stage ?? null);
    setCreate(true);
  };

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows],
  );

  const ownerOptions = useMemo(
    () => ["All owners", ...activeEmployees.map((e) => e.name)],
    [activeEmployees],
  );

  const canBoard = Boolean(schema.boardStatuses?.length);
  const boardStages = schema.boardStatuses ?? [];

  const isSpecialView =
    module.id === "assistant" ||
    module.id === "inbox" ||
    module.id === "integrations" ||
    module.id === "settings" ||
    module.id === "team-chat" ||
    (module.id === "finance" &&
      (tab === "Payables" ||
        tab === "Tax & GST" ||
        tab === "Expenses" ||
        tab === "Profitability" ||
        tab === "Reconciliation")) ||
    (module.id === "reports" && tab !== "Growth") ||
    (module.id === "quotations" && tab === "Itinerary builder") ||
    (module.id === "automation" && (tab === "Workflows" || tab === "Execution history")) ||
    (module.id === "flights" && tab === "Flight search") ||
    (module.id === "flights" && tab === "PNR queue") ||
    (module.id === "hotels" &&
      (tab === "Rate plans" || tab === "Hotels" || tab === "Room inventory")) ||
    (module.id === "campaigns" && tab === "Campaigns") ||
    (module.id === "distribution" && tab === "Website pages");

  // A brand-new workspace does not show an empty table. It sits the person
  // down and walks them through making their first record. Pages with their own
  // console (canvas, inbox, settings, reports) create nothing, so they never
  // get the record wizard laid over the top of them.
  useEffect(() => {
    if (offered.current) return;
    if (isSpecialView) return;
    // Only a loaded, genuinely empty module gets the guided first record.
    if (status !== "ready") return;
    // The context slice may still be arriving; an empty array now would open
    // the first-run wizard on a workspace that is not empty.
    if (recordsLoading) return;
    if (rows.length === 0 && !query && statusFilter.length === 0 && owner === "All owners") {
      offered.current = true;
      setWizard(true);
    }
  }, [rows.length, query, statusFilter.length, owner, status, isSpecialView, recordsLoading]);

  const specialBody = (() => {
    if (module.id === "assistant") return <Assistant tab={tab} />;
    if (module.id === "inbox") return <Inbox tab={tab} />;
    if (module.id === "team-chat") return <TeamChat />;
    if (module.id === "finance" && tab === "Payables") return <Payables />;
    if (module.id === "finance" && tab === "Tax & GST") return <TaxSummary />;
    if (module.id === "finance" && tab === "Expenses") return <Expenses />;
    if (module.id === "finance" && tab === "Profitability") return <ProfitLoss />;
    if (module.id === "finance" && tab === "Reconciliation") return <ReconciliationPanel />;
    if (module.id === "reports" && tab === "Growth") return <GrowthReports />;
    if (module.id === "reports") return <Reports rows={rows} tab={tab} />;
    if (module.id === "integrations") return <Integrations tab={tab} />;
    if (module.id === "quotations" && tab === "Itinerary builder") return <Itinerary rows={rows} />;
    if (module.id === "automation" && tab === "Workflows") return <AutomationStudio />;
    if (module.id === "automation" && tab === "Execution history") return <ExecutionHistory />;
    if (module.id === "settings")
      return (
        <SettingsPanel tab={tab} userLanguage={userLanguage} setUserLanguage={setUserLanguage} />
      );
    if (module.id === "flights" && tab === "Flight search")
      return <FlightSearch onOpen={setRow} rows={rows} />;
    if (module.id === "flights" && tab === "PNR queue") return <PNRQueue />;
    // Hotels — "Hotels" and "Room inventory" tabs get the live search + contract rates UI.
    // "Rate plans" tab keeps the original rate-plan editor for backward compat.
    if (module.id === "hotels" && (tab === "Hotels" || tab === "Room inventory"))
      return <HotelSearch />;
    if (module.id === "hotels" && tab === "Rate plans") return <HotelRates />;
    if (module.id === "campaigns" && tab === "Campaigns") return <Campaigns />;
    if (module.id === "distribution" && tab === "Website pages") return <WebsitePanel />;
    return null;
  })();

  const showDirectory = module.id === "customers" && view === "grid";
  /** The full-page Customer Information cover (replaces the whole page). */
  const [profileCover, setProfileCover] = useState<RecordRow | null>(null);
  /** The full-page Quotation cover for the Price quotes module. */
  const [quoteCover, setQuoteCover] = useState<RecordRow | null>(null);

  // A hand-off from another page (a lead's side panel) opens the cover here.
  useEffect(() => {
    if (module.id !== "customers") return;
    const requested = takeProfileFocus<RecordRow>();
    if (requested?.id) setProfileCover(requested);
  }, [module.id]);

  const openCommunications = (row?: RecordRow, channel?: "Email" | "WhatsApp") => {
    if (row) {
      const phone = (row.phone || "").replace(/[^\\d+]/g, "");
      setCommsFocus({
        name: row.name,
        email: row.email || undefined,
        phone: phone || undefined,
        channel: channel ?? "WhatsApp",
        module: module.id,
        recordId: row.id,
      });
    }
    void navigate({ to: "/workspace/$module", params: { module: "inbox" } });
  };

  /** The module the open side-panel record belongs to. */
  const sheetModule =
    (sheetModuleId ? modules.find((m) => m.id === sheetModuleId) : undefined) ?? module;

  /**
   * The drawer shows the record as it is *now*, not the snapshot taken when it
   * was opened: saving inside the drawer (a package plan, a quote line) writes
   * to the store, and the panel has to reflect what was just saved.
   */
  const liveRow = row
    ? (getRows(sheetModule.id).find((candidate) => candidate.id === row.id) ?? row)
    : null;

  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <div className="glass-card w-full max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Access denied</h1>
          <p className="mt-2 text-sm text-muted">
            Your role cannot open the {module.name} workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Page
        identity={
          profileCover || quoteCover ? null : (
            <PageIdentity
              eyebrow={module.group}
              title={plainModule(module)}
              purpose={guide.purpose}
              stats={
                isSpecialView
                  ? undefined
                  : kpis.map((kpi) => ({
                      icon: <span className={`kpi-dot kpi-dot--${kpi.tone}`} aria-hidden />,
                      value: kpi.display,
                      label: plain(kpi.label),
                      tone: kpi.tone === "ink" ? "neutral" : kpi.tone,
                      // Clicking a number shows exactly the records behind it.
                      onClick:
                        kpi.statuses && kpi.statuses.length > 0
                          ? () => setStatusFilter(kpi.statuses!)
                          : undefined,
                    }))
              }
              actions={
                isSpecialView ? null : (
                  <>
                    <Btn
                      size="md"
                      onClick={() => setHelp(true)}
                      aria-label={`How ${plainModule(module)} works`}
                      title={`How ${plainModule(module)} works`}
                    >
                      <CircleHelp />
                    </Btn>
                    <Btn
                      size="md"
                      icon={<ArrowDownToLine />}
                      onClick={() => {
                        exportRows(filtered, module.id);
                        toast.success("CSV exported");
                      }}
                    >
                      Export
                    </Btn>
                    <Btn
                      size="md"
                      tone={unreadCount > 0 ? "danger" : "secondary"}
                      icon={<Bell className="size-5" />}
                      onClick={() => setShowNotifications(true)}
                      aria-label="Notifications"
                      title={`Notifications (${unreadCount})`}
                    >
                      {unreadCount > 0 ? `Notifications (${unreadCount})` : "Notifications"}
                      {unreadCount > 0 ? (
                        <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-destructive border border-background" />
                      ) : null}
                    </Btn>
                    <Btn size="md" tone="primary" icon={<Plus />} onClick={() => openCreate()}>
                      {guide.primary}
                    </Btn>
                  </>
                )
              }
            />
          )
        }
        switchboard={
          profileCover || quoteCover ? null : (
            <>
              <Segmented
                options={tabOptions as string[]}
                value={tab}
                onChange={(next) => {
                  setTab(next);
                  setQuery("");
                  setStatusFilter([]);
                  setOwner("All owners");
                }}
                label={`${module.name} views`}
              />
              {isSpecialView ? null : (
                <>
                  <div className="switchboard__spacer" />
                  <FilterMenu
                    label="Status"
                    value={statusFilter[0] ?? "All"}
                    options={["All", ...statusOptions]}
                    onChange={(next) => setStatusFilter(next === "All" ? [] : [next])}
                    counts={Object.fromEntries(
                      statusOptions.map((s) => [s, rows.filter((r) => r.status === s).length]),
                    )}
                  />
                  <FilterMenu
                    label="Assigned to"
                    value={owner}
                    options={ownerOptions}
                    onChange={setOwner}
                  />
                  <FilterMenu
                    label="Date"
                    value={date}
                    options={["This week", "This month", "Last month", "This year", "All time"]}
                    onChange={setDate}
                  />
                  {canBoard ? (
                    <Segmented
                      options={["List", "Board", "Cards"]}
                      value={view === "board" ? "Board" : view === "list" ? "List" : "Cards"}
                      onChange={(next) =>
                        setView(
                          next === "Board"
                            ? "board"
                            : next === "List"
                              ? "list"
                              : module.id === "customers"
                                ? "grid"
                                : "cards",
                        )
                      }
                      label="Layout"
                    />
                  ) : (
                    <Segmented
                      options={["List", "Cards"]}
                      value={view === "list" ? "List" : "Cards"}
                      onChange={(next) =>
                        setView(
                          next === "List" ? "list" : module.id === "customers" ? "grid" : "cards",
                        )
                      }
                      label="Layout"
                    />
                  )}
                  <button type="button" onClick={() => setView("list")}>
                    Table
                  </button>
                </>
              )}
              <div className="switchboard__spacer" />
              <div className="switchboard__search">
                <Search className="size-4" />
                <input
                  aria-label={`Search ${module.name}`}
                  placeholder={`Search ${module.name.toLowerCase()}…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="text-faint hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </>
          )
        }
        work={
          profileCover ? (
            <CustomerProfile
              row={profileCover}
              currency={currency}
              onBack={() => setProfileCover(null)}
              onOpenCommunications={openCommunications}
            />
          ) : quoteCover ? (
            <QuotationCover
              row={quoteCover}
              currency={currency}
              onBack={() => setQuoteCover(null)}
              onEdit={() => {
                setEditingRow(quoteCover);
                setQuoteCover(null);
              }}
              onOpenCommunications={openCommunications}
            />
          ) : isSpecialView ? (
            specialBody
          ) : (
            <>
              {showDirectory ? (
                <CustomerDirectory
                  rows={filtered}
                  currency={currency}
                  onOpenProfile={(r) => setProfileCover(r)}
                  onOpenCommunications={openCommunications}
                />
              ) : view === "board" && canBoard ? (
                <Pipeline
                  rows={filtered}
                  stages={boardStages}
                  currency={currency}
                  noun={noun}
                  onOpen={(r) => setRow(r)}
                  onMove={(record, stage) => update(module.id, { ...record, status: stage })}
                  onCreate={(stage) => openCreate(stage)}
                  emptyTitle={guide.empty.title}
                  emptyDescription={guide.empty.description}
                  emptySteps={guide.empty.steps}
                />
              ) : view === "work" ? (
                <Work
                  rows={filtered}
                  currency={currency}
                  onOpen={(r) => (module.id === "quotations" ? setQuoteCover(r) : setRow(r))}
                  onCreate={() => openCreate()}
                  createLabel={guide.primary}
                  emptyTitle={guide.empty.title}
                  emptyDescription={guide.empty.description}
                  emptySteps={guide.empty.steps}
                />
              ) : view === "cards" && module.id !== "customers" ? (
                <RecordCards
                  rows={filtered}
                  module={module}
                  currency={currency}
                  onOpen={(r) => (module.id === "quotations" ? setQuoteCover(r) : setRow(r))}
                  emptyHint={guide.empty.title}
                />
              ) : (
                <Ledger
                  rows={filtered}
                  columns={schema.columns}
                  currency={currency}
                  sort={sort}
                  onSort={(next) =>
                    setSort(next ? { key: next.key as SortKey, dir: next.dir } : null)
                  }
                  onOpen={(r) => (module.id === "quotations" ? setQuoteCover(r) : setRow(r))}
                  onCreate={() => openCreate()}
                  createLabel={guide.primary}
                  rowActions={(row) => (
                    <RowMenu
                      module={module}
                      row={row}
                      onOpen={(r) => (module.id === "quotations" ? setQuoteCover(r) : setRow(r))}
                      onEdit={(r) => {
                        setRow(r);
                        setEditingRow(r);
                      }}
                    />
                  )}
                  emptyTitle={guide.empty.title}
                  emptyDescription={guide.empty.description}
                  emptySteps={guide.empty.steps}
                  emptyIcon={<Lightbulb size={22} />}
                  onExport={(rowsToExport) => {
                    exportRows(rowsToExport, `${module.id}-export`);
                    toast.success("CSV exported");
                  }}
                  bulkActions={(ids, clear) => (
                    <>
                      <Btn
                        size="sm"
                        tone="secondary"
                        className="!bg-on-ink/15 !text-on-ink !border-0"
                        icon={<Check />}
                        onClick={() => {
                          const me = user?.name ?? activeEmployees[0]?.name ?? "";
                          ids.forEach((id) => {
                            const item = rows.find((r) => r.id === id);
                            if (item) update(module.id, { ...item, owner: me });
                          });
                          clear();
                          toast.success(`Assigned to ${me}`);
                        }}
                      >
                        Assign to me
                      </Btn>
                    </>
                  )}
                />
              )}
            </>
          )
        }
        footer={
          isSpecialView ? null : (
            <>
              <span>
                {filtered.length} of {rows.length} {noun}
                {rows.length === 1 ? "" : "s"} shown
                {customFields.length > 0
                  ? ` · ${customFields.length} custom field${customFields.length > 1 ? "s" : ""}`
                  : ""}
              </span>
              <span>
                Press <Kbd>/</Kbd> to search · <Kbd>n</Kbd> to create · <Kbd>?</Kbd> for shortcuts
              </span>
            </>
          )
        }
      />
      {(create || editingRow) && (
        <RecordDialog
          module={module}
          row={editingRow}
          create={create}
          {...(createStage ? { initialData: { status: createStage } } : {})}
          onClose={() => {
            setCreate(false);
            setCreateStage(null);
            setEditingRow(null);
          }}
        />
      )}
      {liveRow && !editingRow && (
        <RecordSheet
          module={sheetModule}
          row={liveRow}
          onClose={() => {
            setRow(null);
            setSheetModuleId(null);
          }}
          onEdit={() => setEditingRow(liveRow)}
          onWorkflow={(targetModuleId, created) => {
            // A freshly created document opens right here in the drawer.
            if (targetModuleId === "__open__" && created) {
              // A freshly created quotation/proposal opens in this drawer,
              // now as a quotation (with its PDF and send actions).
              setRow(created);
              setSheetModuleId("quotations");
              toast.success(`${created.id} ready — download the PDF or email it below`);
              return;
            }
            // Email / WhatsApp hand off to Communications with this contact.
            if (targetModuleId === "__comms__") {
              setRow(null);
              void navigate({ to: "/workspace/$module", params: { module: "inbox" } });
              return;
            }
            // The drawer is only rendered when liveRow exists, and liveRow is
            // always the freshest copy of that record.
            const workflowRow = liveRow!;
            const targetModuleMeta = modules.find((m) => m.id === targetModuleId);
            if (!targetModuleMeta) return;
            // Converting a lead to a booking is a one-click action: the booking
            // is created straight away, no second form in the way.
            const data = workflowDataFor(targetModuleId, module.id, workflowRow);
            if (targetModuleId === "bookings") {
              const createdRow: RecordRow = {
                id: `BK-${Date.now().toString(36).toUpperCase().slice(-6)}`,
                name: workflowRow.name,
                detail: data.detail ?? "",
                destination: workflowRow.destination,
                owner: workflowRow.owner,
                branch: workflowRow.branch,
                date: workflowRow.date || new Date().toISOString().slice(0, 10),
                amount: workflowRow.amount,
                ...(workflowRow.currency ? { currency: workflowRow.currency } : {}),
                status: data.status ?? "Pending",
                email: workflowRow.email,
                phone: workflowRow.phone,
                source: workflowRow.source,
                notes: data.notes ?? "",
                // Carry the source record's reference (e.g. the quotation this
                // booking was converted from) alongside its own extras.
                extra: { ...(workflowRow.extra ?? {}), ...(data.extra ?? {}) },
              };
              void createRecord("bookings", createdRow).then((saved) => {
                if (!saved) return;
                toast.success(`Booking ${saved.id} created from ${workflowRow.id}`);
                setRow(saved);
                setSheetModuleId("bookings");
              });
              return;
            }
            setWorkflowCreate({
              module: targetModuleMeta,
              data,
            });
          }}
          onOpenProfile={(profileRow) => {
            if (module.id === "quotations") {
              setRow(null);
              setQuoteCover(profileRow);
              return;
            }
            setRow(null);
            setProfileFocus(profileRow);
            if (module.id !== "customers") {
              void navigate({ to: "/workspace/$module", params: { module: "customers" } });
            }
          }}
        />
      )}
      {workflowCreate && (
        <RecordDialog
          module={workflowCreate.module}
          create
          initialData={workflowCreate.data}
          onClose={() => setWorkflowCreate(null)}
        />
      )}
      <FirstRunWizard
        module={module}
        open={wizard}
        onClose={() => setWizard(false)}
        onCreated={() => {
          setShowTips(false);
        }}
      />
      <HelpPanel
        module={module}
        open={help}
        onClose={() => setHelp(false)}
        onStart={() => setWizard(true)}
      />
      <NotificationBell
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
        lang={userLanguage}
        onOpenNotification={handleOpenNotification}
      />
    </>
  );
}
function Assistant({ tab }: { tab: string }) {
  const { user, status } = useCRM();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<AssistantMessageDto[]>([]);
  const [working, setWorking] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    "Plan a Bali itinerary for a couple",
    "Show me today's priorities",
    "What is this month's net profit?",
  ]);
  const [liveMode, setLiveMode] = useState<boolean | null>(null);

  // Conversation history is stored server-side against the workspace.
  const { data: history } = useApiQuery(
    () => fetchAssistantMessages("default"),
    [],
    status === "ready",
  );

  useEffect(() => {
    if (history) setMessages(history);
  }, [history]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || working) return;
    setPrompt("");
    setWorking(true);
    const optimistic: AssistantMessageDto = {
      id: `local-${Date.now()}`,
      role: "user",
      content: value,
      model: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    sendAssistantMessage(value)
      .then((res) => {
        setMessages((prev) => [...prev, res.reply]);
        setLiveMode(res.live ?? null);
        if (res.suggestions.length) setSuggestions(res.suggestions);
      })
      .catch((e) => toast.error(errorMessage(e, "Assistant is unavailable")))
      .finally(() => setWorking(false));
  };

  return (
    <div className="assistant-workspace">
      <div className="assistant-heading">
        <div className="assistant-logo">
          <Sparkles size={30} />
        </div>
        <span className="eyebrow">TRAVELDESK INTELLIGENCE</span>
        <h2>
          {tab === "Itinerary generator"
            ? "A journey starts with an idea."
            : "What can we make easier today?"}
        </h2>
        <p>Your travel team's assistant, grounded in this workspace.</p>
        {liveMode === false ? (
          <small className="assistant-setup-hint">
            Running on built-in answers. Add an <b>LLM_API_KEY</b> on the server to switch to the
            full AI model.
          </small>
        ) : null}
      </div>
      {messages.length === 0 ? (
        <div className="prompt-grid">
          {suggestions.slice(0, 3).map((text) => (
            <Button key={text} variant="outline" className="prompt-card" onClick={() => send(text)}>
              <Sparkles size={18} />
              <span>{text}</span>
              <ArrowUpRight size={15} />
            </Button>
          ))}
        </div>
      ) : (
        <div className="chat-messages">
          {messages.map((m) => (
            <div className={`chat-message ${m.role}`} key={m.id}>
              <span>
                {m.role === "user" ? (
                  <Avatar name={user?.name ?? "You"} size="small" />
                ) : (
                  <Sparkles size={20} />
                )}
              </span>
              <div>{m.content}</div>
            </div>
          ))}
          {working && (
            <p className="loading-message">
              <Loader2 className="animate-spin" size={15} /> Preparing your draft…
            </p>
          )}
        </div>
      )}
      {messages.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggestions.map((s) => (
            <Button key={s} size="sm" variant="outline" onClick={() => send(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(prompt);
        }}
      >
        <textarea
          aria-label="Message assistant"
          placeholder="Ask about an itinerary, a booking or your business…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button size="icon" title="Send message" disabled={working || !prompt.trim()}>
          <ArrowRight />
        </Button>
      </form>
      <p className="assistant-disclaimer">
        <ShieldCheck size={12} /> Drafts only. Ticketing, refunds and payments require human
        approval.
      </p>
    </div>
  );
}

const INBOX_FALLBACK_CHANNELS = ["Shared inbox", "WhatsApp", "Email", "Call logs"];

function Inbox({ tab }: { tab: string }) {
  // The three record-keeping tabs have their own real screens.
  if (tab === "Call logs") return <CallLogsPanel />;
  if (tab === "Templates") return <TemplatesPanel />;
  if (tab === "Consent") return <ConsentPanel />;
  return <InboxThreads tab={tab} />;
}

function InboxThreads({ tab }: { tab: string }) {
  const { status, user, settings, getRows } = useCRM();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState(tab);
  const [draft, setDraft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<MessageDto[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [newForm, setNewForm] = useState({
    name: "",
    email: "",
    phone: "",
    channel: "Email" as "Email" | "WhatsApp" | "Phone",
    subject: "",
    message: "",
  });
  const customers = getRows("customers");
  /**
   * A record's side panel can hand this page a contact ("email Priya about
   * LD-2402"). The conversation for that contact opens straight away, with
   * both their email and phone ready to use.
   */
  const [focus, setFocus] = useState<CommsFocus | null>(null);

  // Conversations arrive from the shared-inbox API; channel counters drive the filter.
  const { data: page, reload: reloadConversations } = useApiQuery(
    () =>
      fetchConversations({
        ...(channel && channel !== "Shared inbox" ? { channel } : {}),
        ...(query.trim() ? { search: query.trim() } : {}),
      }),
    [channel, query],
    status === "ready",
  );
  const conversations = page?.items ?? [];
  const { data: channels } = useApiQuery(() => fetchConversationChannels(), [], status === "ready");
  const { data: templates } = useApiQuery(() => fetchMessageTemplates(), [], status === "ready");
  // Live channel state: a scanned WhatsApp number sends instead of queueing.
  const { data: channelStatus } = useApiQuery(() => fetchChannelStatus(), [], status === "ready");

  // Pick up the hand-off from a record's side panel and open that contact.
  useEffect(() => {
    const requested = takeCommsFocus();
    if (!requested) return;
    setFocus(requested);
    setChannel(requested.channel);
    setQuery("");
  }, []);

  const active: ConversationDto | undefined =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  const { data: thread } = useApiQuery(
    () => (active ? fetchConversation(active.id) : Promise.resolve(null)),
    [active?.id],
    status === "ready" && Boolean(active),
  );
  const messages: MessageDto[] = [...(thread?.messages ?? []), ...pending];

  const channelOptions = channels?.length
    ? channels.map((c) => c.channel)
    : INBOX_FALLBACK_CHANNELS;

  const selectConversation = (id: string) => {
    setActiveId(id);
    setPending([]);
  };

  // The contact handed over from a record: their email and phone, both ready.
  const focusConversation = conversations.find(
    (c) =>
      (focus?.email && c.contactEmail === focus.email) ||
      (focus?.phone && c.contactPhone === focus.phone),
  );

  // If a thread already exists for this contact, open it.
  useEffect(() => {
    if (!focus || !focusConversation || activeId) return;
    setActiveId(focusConversation.id);
  }, [focus, focusConversation, activeId]);

  // If no thread exists for this contact yet, start one so the user can write.
  const startConversation = async () => {
    if (!focus) return;
    try {
      const created = await createConversation({
        channel: focus.channel,
        contactName: focus.name,
        ...(focus.email ? { contactEmail: focus.email } : {}),
        ...(focus.phone ? { contactPhone: focus.phone } : {}),
        subject:
          focus.channel === "Email"
            ? `Enquiry conversation — ${focus.name}`
            : `WhatsApp conversation — ${focus.name}`,
      });
      setChannel(focus.channel);
      setActiveId(created.id);
      setPending([]);
      // The new thread must appear in the list, then open.
      reloadConversations();
      toast.success("Conversation opened");
    } catch (err) {
      toast.error(errorMessage(err, "Could not open the conversation"));
    }
  };

  /** Inserts a house-style reply, greeting the person already on screen. */
  const insertTemplate = (template: (typeof COMMS_TEMPLATES)[number]) => {
    setDraft(
      fillCommsTemplate(template.body, {
        name: active?.contactName ?? focus?.name,
        agent: user?.name,
        company: settings.orgName,
      }),
    );
  };

  /** Starts a brand-new thread with a real contact (or a typed one). */
  const startNewThread = async () => {
    if (!newForm.name.trim()) {
      toast.error("Add the contact name");
      return;
    }
    if (newForm.channel === "Email" && !newForm.email.trim()) {
      toast.error("Add the email address for an email thread");
      return;
    }
    if (newForm.channel !== "Email" && !newForm.phone.trim()) {
      toast.error("Add the phone number with country code");
      return;
    }
    setNewBusy(true);
    try {
      const created = await createConversation({
        contactName: newForm.name.trim(),
        channel: newForm.channel,
        ...(newForm.email.trim() ? { contactEmail: newForm.email.trim() } : {}),
        ...(newForm.phone.trim() ? { contactPhone: newForm.phone.trim() } : {}),
        subject:
          newForm.subject.trim() || `${newForm.channel} conversation — ${newForm.name.trim()}`,
      });
      if (newForm.message.trim()) {
        await sendConversationMessage(created.id, newForm.message.trim());
      }
      setActiveId(created.id);
      setPending([]);
      setNewOpen(false);
      setNewForm({ name: "", email: "", phone: "", channel: "Email", subject: "", message: "" });
      reloadConversations();
      toast.success(
        newForm.message.trim() ? "Conversation started and message sent" : "Conversation started",
      );
    } catch (err) {
      toast.error(errorMessage(err, "Could not start the conversation"));
    } finally {
      setNewBusy(false);
    }
  };

  const newConversationDialog = (
    <Sheet
      open={newOpen}
      onClose={() => setNewOpen(false)}
      title="New conversation"
      description="Pick a customer or type a new contact. The first message leaves through the channel you choose."
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => setNewOpen(false)}>
            Cancel
          </Button>
          <Button disabled={newBusy} onClick={() => void startNewThread()}>
            <Send size={14} /> {newBusy ? "Starting…" : "Start conversation"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Contact name
          <input
            list="inbox-customers"
            value={newForm.name}
            onChange={(e) => {
              const match = customers.find((c) => c.name === e.target.value);
              setNewForm({
                ...newForm,
                name: e.target.value,
                ...(match
                  ? {
                      email: newForm.email || match.email || "",
                      phone: newForm.phone || match.phone || "",
                    }
                  : {}),
              });
            }}
            placeholder="e.g. Priya Mehta"
          />
          <datalist id="inbox-customers">
            {customers.slice(0, 200).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>

        <label className="grid gap-1 text-xs font-semibold text-muted">
          Channel
          <select
            value={newForm.channel}
            onChange={(e) =>
              setNewForm({
                ...newForm,
                channel: e.target.value as "Email" | "WhatsApp" | "Phone",
              })
            }
          >
            <option value="Email">Email</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Phone">Phone (log a call)</option>
          </select>
        </label>

        {newForm.channel === "Email" && (
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Subject
            <input
              value={newForm.subject}
              onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })}
              placeholder="e.g. Your Dubai itinerary"
            />
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Email{newForm.channel === "Email" ? "" : " (optional)"}
            <input
              type="email"
              value={newForm.email}
              onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
              placeholder="customer@example.com"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Phone{newForm.channel === "Email" ? " (optional)" : ""}
            <input
              value={newForm.phone}
              onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
              placeholder="+91 98765 43210"
            />
          </label>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-muted">
          First message
          <textarea
            rows={6}
            value={newForm.message}
            onChange={(e) => setNewForm({ ...newForm, message: e.target.value })}
            placeholder="Hi Priya, thank you for reaching out — here is the plan I mentioned…"
          />
          <span className="text-[11px] font-normal text-muted">
            Leave it empty to start the thread and write later.
          </span>
        </label>
      </div>
    </Sheet>
  );

  // A workspace with no threads still needs a way to write the first one.
  if (status === "ready" && !active && !focus)
    return (
      <>
        <EmptyState
          title="No conversations yet"
          description="Start with a customer — an email or a WhatsApp message goes out from this workspace."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <MessageCircle size={15} /> New conversation
            </Button>
          }
        />
        {newConversationDialog}
      </>
    );

  return (
    <div className="inbox-workspace">
      {newConversationDialog}
      <div className="conversation-list">
        <Button
          size="sm"
          variant="outline"
          style={{ marginBottom: 8, width: "100%" }}
          onClick={() => setNewOpen(true)}
        >
          <Plus size={14} /> New conversation
        </Button>
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search conversations"
            placeholder="Search conversations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="select-control" style={{ marginTop: 8 }}>
          <select
            aria-label="Channel"
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              setActiveId(null);
              setPending([]);
            }}
          >
            {channelOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        {conversations.map((c) => (
          <Button
            variant="ghost"
            className={c.id === active?.id ? "conversation active" : "conversation"}
            key={c.id}
            onClick={() => selectConversation(c.id)}
          >
            <Avatar name={c.contactName} />
            <span>
              <strong>
                {c.contactName}
                <small>{c.messageCount}</small>
              </strong>
              <p>{c.preview || c.subject}</p>
              <small>{c.channel}</small>
            </span>
          </Button>
        ))}
        {conversations.length === 0 && (
          <p className="cost-disclaimer">No conversations in this channel yet.</p>
        )}
      </div>
      {/* The contact handed over from a record: email and phone, both usable */}
      {focus && (
        <div className="conversation-main">
          <div className="conversation-header">
            <Avatar name={focus.name} />
            <div>
              <h3>{focus.name}</h3>
              <p>
                {[focus.email, focus.phone].filter(Boolean).join(" · ") || "No contact details"}
                {" · "}
                {focus.channel}
                {focus.module ? ` · from ${focus.module}` : ""}
              </p>
            </div>
            <Status value="Open" />
          </div>
          <div className="conversation-messages">
            <span className="chat-date">Ready to talk</span>
            <p className="cost-disclaimer">
              This is {focus.name}
              {focus.module ? ` from the ${focus.module} workspace` : ""}. Their email and phone are
              above — pick a channel and write the first message.
            </p>
          </div>
          <div
            className="template-chips"
            style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 16px 8px" }}
          >
            <Button size="sm" variant="outline" onClick={startConversation}>
              <Mail size={13} /> Open {focus.channel} thread
            </Button>
            {focus.email && (
              <a
                href={`mailto:${focus.email}`}
                className="message-compose-link"
                title={`Write to ${focus.email}`}
              >
                <Mail size={13} /> {focus.email}
              </a>
            )}
            {focus.phone && (
              <a
                href={`tel:${focus.phone}`}
                className="message-compose-link"
                title={`Call ${focus.phone}`}
              >
                <Phone size={13} /> {focus.phone}
              </a>
            )}
          </div>
        </div>
      )}
      {active && (
        <div className="conversation-main">
          <div className="conversation-header">
            <Avatar name={active.contactName} />
            <div>
              <h3>{active.contactName}</h3>
              <p>
                {active.contactEmail || active.contactPhone || "No contact details"} ·{" "}
                {active.channel}
              </p>
            </div>
            <Status value={active.status} />
          </div>
          <div className="conversation-messages">
            <span className="chat-date">Conversation</span>
            {messages.map((m) => (
              <div
                className={`message-bubble ${m.direction === "out" ? "outgoing" : "incoming"}`}
                key={m.id}
              >
                {m.body}
                <small>
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="cost-disclaimer">No messages yet. Write the first reply below.</p>
            )}
          </div>
          <div
            className="template-chips"
            style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 16px 8px" }}
          >
            <span
              style={{
                width: "100%",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--faint)",
              }}
            >
              Professional replies
            </span>
            {COMMS_TEMPLATES.filter(
              (tpl) => tpl.channel === "Any" || tpl.channel === active.channel,
            ).map((tpl) => (
              <Button
                key={tpl.name}
                size="sm"
                variant="outline"
                title={`${tpl.channel}${tpl.subject ? ` · ${tpl.subject}` : ""}`}
                onClick={() => insertTemplate(tpl)}
              >
                {tpl.channel === "WhatsApp" ? <MessageCircle size={13} /> : <Mail size={13} />}
                {tpl.name}
              </Button>
            ))}
            {templates?.map((tpl) => (
              <Button key={tpl.id} size="sm" variant="ghost" onClick={() => setDraft(tpl.body)}>
                {tpl.name}
              </Button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "0 16px 4px",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            <span>
              Replying on <strong style={{ color: "var(--text)" }}>{active.channel}</strong>
              {active.channel === "WhatsApp" &&
                !channelStatus?.whatsapp?.web?.linked &&
                " · queued until a number is linked in Settings"}
            </span>
            <span>{draft.trim() ? `${draft.trim().length} characters` : ""}</span>
          </div>
          <form
            className="message-compose"
            onSubmit={(e) => {
              e.preventDefault();
              const value = draft.trim();
              if (!value) return;
              setDraft("");
              sendConversationMessage(active.id, value)
                .then((msg) => {
                  setPending((prev) => [...prev, msg]);
                  toast.success(
                    // Email/WhatsApp replies go out through the real providers
                    // (or sit queued in the outbox until SMTP/WhatsApp is set up).
                    msg.delivery === "sent"
                      ? "Delivered"
                      : msg.delivery === "failed"
                        ? "Provider rejected the message — check the outbox"
                        : msg.delivery === "queued"
                          ? "Queued for delivery — connect SMTP/WhatsApp in server settings to send live"
                          : "Reply added to the thread",
                  );
                })
                .catch((err) => toast.error(errorMessage(err, "Could not send reply")));
            }}
          >
            <textarea
              aria-label="Reply message"
              placeholder="Write a reply…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button disabled={!draft.trim()}>
              <Send /> Send reply
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

const REPORT_KEY_BY_TAB: Record<string, ReportKey> = {
  Sales: "sales",
  Bookings: "bookings",
  Operations: "operations",
  Finance: "finance",
  B2B: "b2b",
  Marketing: "marketing",
  "Team performance": "team",
};

function reportRange(value: string): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (value === "This week") return { from: iso(startOfWeek(now)), to: iso(endOfDay(now)) };
  if (value === "This month") return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
  if (value === "Last month") {
    const prev = subMonths(now, 1);
    return { from: iso(startOfMonth(prev)), to: iso(endOfMonth(prev)) };
  }
  if (value === "This year") return { from: iso(startOfYear(now)), to: iso(endOfDay(now)) };
  return {};
}

function Reports({ rows, tab }: { rows: RecordRow[]; tab: string }) {
  const { settings, getRows, status } = useCRM();
  const [date, setDate] = useState("This month");
  const [branch, setBranch] = useState("All branches");
  const [service, setService] = useState("All services");
  const currency = settings.currency;
  const reportKey = REPORT_KEY_BY_TAB[tab] ?? "sales";
  const apiFilters = {
    ...(branch === "All branches" ? {} : { branch }),
    ...reportRange(date),
  };

  // Live report + saved views come from the server; records stay the fallback.
  const { data: report } = useApiQuery(
    () => runReport(reportKey, apiFilters),
    [reportKey, branch, date],
    status === "ready" && tab !== "Saved reports",
  );
  const { data: savedList, reload: reloadSaved } = useApiQuery(
    () => fetchSavedReports(),
    [],
    status === "ready",
  );
  const savedTitles = new Set((savedList ?? []).map((s) => s.title));

  const inBranch = (r: RecordRow) => branch === "All branches" || r.branch === branch;
  const bookingsAll = getRows("bookings").filter(inBranch);
  const rev = bookingsAll.filter((r) => r.status !== "Cancelled").reduce((a, r) => a + r.amount, 0);
  const avg = bookingsAll.length ? Math.round(rev / bookingsAll.length) : 0;
  const conv = bookingsAll.length
    ? Math.round(
        (bookingsAll.filter((r) => ["Confirmed", "Won"].includes(r.status)).length /
          Math.max(1, bookingsAll.length)) *
          100,
      )
    : 0;
  const fallbackDest = Object.entries(
    bookingsAll.reduce<Record<string, number>>((acc, r) => {
      acc[r.destination] = (acc[r.destination] ?? 0) + r.amount;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const summary = report?.summary;
  const bars: Array<[string, number]> = report?.byDestination.length
    ? report.byDestination.map((d) => [d.label, d.value] as [string, number])
    : fallbackDest;

  const exportReport = () => {
    exportRecordsCsv("bookings", branch === "All branches" ? {} : { branch })
      .then((csv) => {
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${tab}-${date}-${branch}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Report exported");
      })
      .catch(() => {
        exportRows(rows, `${tab}-${date}-${branch}-${service}`);
        toast.success("Report exported");
      });
  };

  /** Server-rendered Excel / PDF of exactly the report on screen. */
  const downloadReportFile = async (format: "xlsx" | "pdf") => {
    try {
      const blob = await downloadReport(reportKey, apiFilters, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${reportKey}-report-${new Date().toISOString().slice(0, 10)}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(format === "xlsx" ? "Excel workbook downloaded" : "PDF downloaded");
    } catch (err) {
      toast.error(
        errorMessage(err, `Could not build the ${format === "xlsx" ? "Excel" : "PDF"} file`),
      );
    }
  };

  const saveView = (title: string) => {
    void createSavedReport({ title, report: reportKey, filters: apiFilters })
      .then(() => {
        toast.success("Report view saved");
        reloadSaved();
      })
      .catch((e) => toast.error(errorMessage(e, "Could not save report")));
  };

  return (
    <>
      <div className="report-filter-band">
        <DateFilter value={date} onChange={setDate} />
        <select
          aria-label="Report branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        >
          <option>All branches</option>
          {settings.branches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select
          aria-label="Report service"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option>All services</option>
          <option>Flights</option>
          <option>Hotels</option>
          <option>Packages</option>
        </select>
        <Button variant="outline" onClick={exportReport}>
          <ArrowDownToLine /> CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => void downloadReportFile("xlsx")}
          title="Excel workbook: summary, records and every breakdown"
        >
          <FileSpreadsheet /> Excel
        </Button>
        <Button
          variant="outline"
          onClick={() => void downloadReportFile("pdf")}
          title="Printable PDF of this report"
        >
          <FileText /> PDF
        </Button>
        {tab !== "Saved reports" && (
          <Button variant="outline" onClick={() => saveView(`${tab} performance summary`)}>
            <Plus /> Save view
          </Button>
        )}
      </div>
      <div className="module-stats">
        {[
          ["Revenue", money(summary?.revenue ?? rev, currency)],
          [
            "Gross margin",
            // Shown as "—" when no supplier cost is on record, rather than a guess.
            summary?.grossMargin === null || summary?.grossMargin === undefined
              ? "—"
              : money(summary.grossMargin, currency),
          ],
          ["Conversion rate", `${summary?.conversionRate ?? conv}%`],
          ["Average booking value", money(summary?.averageValue ?? avg, currency)],
        ].map(([t, v]) => (
          <div key={t}>
            <p>{t}</p>
            <strong>{v}</strong>
            <small>
              {date} · {branch}
            </small>
          </div>
        ))}
      </div>
      {tab === "Saved reports" ? (
        savedList && savedList.length > 0 ? (
          <div className="reports-grid">
            {savedList.map((s) => (
              <section className="report-item" key={s.id}>
                <div className="section-heading">
                  <h3>{s.title}</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete report"
                    onClick={() => {
                      void deleteSavedReport(s.id)
                        .then(() => {
                          toast.success("Report deleted");
                          reloadSaved();
                        })
                        .catch((e) => toast.error(errorMessage(e, "Could not delete report")));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <p>
                  {findModule(s.moduleId)?.name ?? s.moduleId} · saved {formatDay(s.createdAt)}
                </p>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No saved reports yet"
            description="Your saved report views will appear here."
          />
        )
      ) : (
        <div className="reports-grid">
          {[
            `${tab} performance summary`,
            "Booking profitability",
            "Revenue by destination",
            "Team target attainment",
            "Receivables aging",
            "Supplier fulfilment",
          ].map((title) => (
            <section className="report-item" key={title}>
              <div className="section-heading">
                <h3>{title}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  title={savedTitles.has(title) ? `Saved: ${title}` : `Save ${title}`}
                  onClick={() => saveView(title)}
                >
                  {savedTitles.has(title) ? <Check /> : <Plus />}
                </Button>
              </div>
              <div className="report-bars">
                {(bars.slice(0, 4).length
                  ? bars.slice(0, 4)
                  : ([["Sample", 100000]] as Array<[string, number]>)
                ).map(([d, amt]) => {
                  const max = bars[0]?.[1] || 1;
                  const pct = Math.round((amt / max) * 100);
                  return (
                    <div key={d}>
                      <span>{d}</span>
                      <div>
                        <i className="report-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <strong>{money(amt, currency)}</strong>
                    </div>
                  );
                })}
              </div>
              <Button variant="link" onClick={exportReport}>
                Download report <ArrowDownToLine />
              </Button>
            </section>
          ))}
        </div>
      )}
      <p className="cost-disclaimer">Figures shown in {currency} · live analytics.</p>
    </>
  );
}

function Integrations({ tab }: { tab: string }) {
  const { status } = useCRM();
  const [active, setActive] = useState<IntegrationDto | null>(null);
  const [environment, setEnvironment] = useState<"Sandbox" | "Production">("Sandbox");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  // Supplier/business connections and outbound webhooks are workspace data.
  const { data: integrations, reload: reloadIntegrations } = useApiQuery(
    () => fetchIntegrations(),
    [],
    status === "ready",
  );
  const { data: webhooks, reload: reloadWebhooks } = useApiQuery(
    () => fetchWebhooks(),
    [],
    status === "ready" && tab === "API & webhooks",
  );
  const { data: deliveries, reload: reloadDeliveries } = useApiQuery(
    () => fetchWebhookDeliveries(50),
    [],
    status === "ready" && tab === "Connection logs",
  );
  const list = integrations ?? [];
  const filtered =
    tab === "Business apps"
      ? list.filter((c) => c.category === "business" || c.category === "payment")
      : tab === "Supplier connections"
        ? list.filter((c) => c.category === "gds" || c.category === "supplier")
        : list;

  const connect = () => {
    if (!active) return;
    void connectIntegration(active.id, {
      environment,
      config: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() },
    })
      .then(() => {
        toast.success(`${active.provider} connected (${environment})`);
        setActive(null);
        setApiKey("");
        setApiSecret("");
        reloadIntegrations();
      })
      .catch((e) => toast.error(errorMessage(e, "Could not connect")));
  };

  const disconnect = (c: IntegrationDto) => {
    void disconnectIntegration(c.id)
      .then(() => {
        toast.success(`${c.provider} disconnected`);
        reloadIntegrations();
      })
      .catch((e) => toast.error(errorMessage(e, "Could not disconnect")));
  };

  const addWebhook = () => {
    const url = webhookUrl.trim();
    if (!url) return;
    void createWebhook({ url })
      .then(() => {
        toast.success("Webhook created");
        setWebhookUrl("");
        reloadWebhooks();
      })
      .catch((e) => toast.error(errorMessage(e, "Could not create webhook")));
  };

  const testHook = (id: string) => {
    void testWebhook(id)
      .then((res) => toast.success(`Test delivery: ${res.status}`))
      .catch((e) => toast.error(errorMessage(e, "Test delivery failed")));
  };

  const removeHook = (id: string) => {
    void deleteWebhook(id)
      .then(() => {
        toast.success("Webhook deleted");
        reloadWebhooks();
      })
      .catch((e) => toast.error(errorMessage(e, "Could not delete webhook")));
  };

  return (
    <>
      <div className="integration-notice">
        <ShieldCheck size={19} />
        <div>
          <strong>Supplier connections</strong>
          <p>
            Connect travel suppliers and business apps for this workspace. Credentials are stored
            against your organisation only.
          </p>
        </div>
      </div>
      {tab === "API & webhooks" ? (
        <>
          <div className="report-filter-band">
            <input
              aria-label="Webhook URL"
              placeholder="https://your-endpoint.example.com/hooks"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              style={{ flex: 1, minWidth: 260 }}
            />
            <Button disabled={!webhookUrl.trim()} onClick={addWebhook}>
              <Plus /> Add webhook
            </Button>
          </div>
          <div className="integration-grid">
            {(webhooks ?? []).map((w) => (
              <div className="integration-card" key={w.id}>
                <span className="integration-logo tone-2">
                  <Globe2 size={18} />
                </span>
                <h3>{w.url}</h3>
                <p>
                  {w.events.length} event{w.events.length === 1 ? "" : "s"} · {w.deliveries}{" "}
                  deliveries
                </p>
                <Status value={w.active ? "Active" : "Paused"} />
                <div style={{ display: "flex", gap: 6 }}>
                  <Button variant="outline" onClick={() => testHook(w.id)}>
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete webhook"
                    onClick={() => removeHook(w.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            {(webhooks ?? []).length === 0 && (
              <EmptyState
                title="No webhooks yet"
                description="Add an endpoint to receive workspace events."
              />
            )}
          </div>
        </>
      ) : tab === "Connection logs" ? (
        <WebhookLog deliveries={deliveries ?? []} onRetried={reloadDeliveries} />
      ) : (
        <div className="integration-grid">
          {filtered.map((c, i) => (
            <div className="integration-card" key={c.id}>
              <span className={`integration-logo tone-${i % 4}`}>{c.provider[0]}</span>
              <h3>{c.provider}</h3>
              <p>
                {c.category === "business" || c.category === "payment"
                  ? "Business communication and service distribution"
                  : "Air inventory, reservations and ticketing"}
              </p>
              <Status value={c.status} />
              {c.status === "Connected" ? (
                <Button variant="outline" onClick={() => disconnect(c)}>
                  Disconnect
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setActive(c)}>
                  Configure <Settings2 />
                </Button>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              title="No connections"
              description="No integrations are configured for this workspace."
            />
          )}
        </div>
      )}
      <Dialog
        open={Boolean(active)}
        onOpenChange={(o) => {
          if (!o) {
            setActive(null);
            setApiKey("");
            setApiSecret("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active?.provider} configuration</DialogTitle>
            <DialogDescription>
              Choose the environment to connect this provider for your organisation.
            </DialogDescription>
          </DialogHeader>
          <label className="setting-row">
            Environment
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "Sandbox" | "Production")}
            >
              <option>Sandbox</option>
              <option>Production</option>
            </select>
          </label>
          <label className="setting-row">
            API Key
            <input
              type="text"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <label className="setting-row">
            API Secret
            <input
              type="password"
              placeholder="Enter your API secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
            />
          </label>
          <div className="note-box">
            Live supplier access requires authorised credentials and a commercial agreement. This
            workspace records the connection intent and audit trail.
          </div>
          <Button onClick={connect}>
            <Check /> Connect {active?.provider}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The webhook delivery log.
 *
 * "We never got the event" is the only conversation an integrator has, so the
 * screen answers three questions in order: did it go, what did the other side
 * say, and can I send it again without asking a developer.
 */
function WebhookLog({
  deliveries,
  onRetried,
}: {
  deliveries: WebhookDeliveryDto[];
  onRetried: () => void;
}) {
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const failed = deliveries.filter((d) => d.status !== "success");
  const rows = onlyFailed ? failed : deliveries;

  const retry = (id: string) => {
    setBusy(id);
    void retryWebhookDelivery(id)
      .then((result) => {
        toast.success(
          result.status === "success"
            ? `Delivered again (${result.responseCode ?? "200"})`
            : `Still failing (${result.responseCode ?? "no response"})`,
        );
        onRetried();
      })
      .catch((err) => toast.error(errorMessage(err, "Could not resend the event")))
      .finally(() => setBusy(null));
  };

  if (deliveries.length === 0) {
    return (
      <EmptyState
        title="Nothing sent yet"
        description="When a webhook fires, every attempt shows up here with the response your endpoint sent back."
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={onlyFailed ? "outline" : "default"}
          onClick={() => setOnlyFailed(false)}
        >
          All {deliveries.length}
        </Button>
        <Button
          size="sm"
          variant={onlyFailed ? "default" : "outline"}
          onClick={() => setOnlyFailed(true)}
        >
          Failed {failed.length}
        </Button>
        <span className="text-xs text-muted">
          {failed.length === 0
            ? "Everything your endpoints received went through."
            : "A failed delivery means the endpoint did not answer 2xx — your data was not lost."}
        </span>
      </div>

      <ul className="grid gap-2">
        {rows.map((delivery) => (
          <li key={delivery.id} className="glass-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex size-2.5 shrink-0 rounded-full ${
                  delivery.status === "success" ? "bg-pine" : "bg-tomato"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{delivery.event}</strong>
                  <span className="text-xs text-faint">
                    {delivery.responseCode ? `HTTP ${delivery.responseCode}` : "no response"}
                  </span>
                  {!delivery.active && (
                    <span className="status status-warning">
                      <span /> Paused
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">{delivery.url}</p>
              </div>
              <span className="text-xs text-faint">
                {new Date(delivery.createdAt).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === delivery.id}
                onClick={() => retry(delivery.id)}
              >
                <Send /> {busy === delivery.id ? "Sending…" : "Send again"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpanded(expanded === delivery.id ? null : delivery.id)}
              >
                {expanded === delivery.id ? "Hide payload" : "Payload"}
              </Button>
            </div>
            {expanded === delivery.id && (
              <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-well p-2 text-[11px] leading-relaxed text-muted">
                {delivery.payload}
              </pre>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="glass-card p-4 text-sm text-muted">
            No failed deliveries — nothing to fix here.
          </li>
        )}
      </ul>
    </div>
  );
}

function Itinerary({ rows }: { rows: RecordRow[] }) {
  const { settings, createRecord, updateRecord } = useCRM();
  const currency = settings.currency;

  // Load from an existing draft quotation if one exists, otherwise use sensible defaults.
  const draftQuote = rows.find((r) => r.status === "Draft");
  const savedItinerary = (draftQuote?.extra as Record<string, unknown> | undefined)?.[
    "itinerary"
  ] as
    | {
        title?: string;
        days?: Array<{ title: string; description: string; cost: number }>;
        hotel?: number;
        markup?: number;
        travellers?: number;
      }
    | undefined;

  const [title, setTitle] = useState(savedItinerary?.title ?? "Bali Bliss Escape");
  const [days, setDays] = useState(
    savedItinerary?.days ?? [
      {
        title: "Arrival in Bali",
        description: "Private airport transfer and check-in at your Ubud hotel.",
        cost: 18000,
      },
      {
        title: "Ubud cultural discovery",
        description: "Tegallalang rice terraces, temple visit and local lunch.",
        cost: 12000,
      },
      {
        title: "Ubud to Seminyak",
        description: "Waterfall excursion and scenic private transfer.",
        cost: 16000,
      },
      {
        title: "Uluwatu & sunset",
        description: "Uluwatu Temple, Kecak dance and seaside dinner.",
        cost: 15000,
      },
      {
        title: "A day at your own pace",
        description: "Enjoy the beach or add an optional island excursion.",
        cost: 8000,
      },
      { title: "Departure", description: "Breakfast, checkout and airport transfer.", cost: 9000 },
    ],
  );
  const [hotel, setHotel] = useState(savedItinerary?.hotel ?? 70000);
  const [markup, setMarkup] = useState(savedItinerary?.markup ?? 20);
  const [travellers, setTravellers] = useState(savedItinerary?.travellers ?? 2);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const cost = days.reduce((a, d) => a + d.cost, 0) + hotel;
  const sellingPrice = Math.round(cost * (1 + markup / 100));

  const saveDraft = async () => {
    setSaving(true);
    try {
      const itineraryData = { title, days, hotel, markup, travellers };
      if (draftQuote) {
        await updateRecord("quotations", {
          ...draftQuote,
          extra: { ...(draftQuote.extra ?? {}), itinerary: itineraryData } as unknown as Record<
            string,
            string | number
          >,
          amount: sellingPrice,
        });
      } else {
        await createRecord("quotations", {
          id: `QT-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          name: title,
          detail: `${days.length}-day itinerary · ${travellers} travellers`,
          destination: "Bali, Indonesia",
          owner: "",
          branch: "",
          date: new Date().toISOString().slice(0, 10),
          amount: sellingPrice,
          currency,
          status: "Draft",
          email: "",
          phone: "",
          source: "Itinerary builder",
          notes: "",
          extra: { itinerary: itineraryData } as unknown as Record<string, string | number>,
        });
      }
      toast.success("Itinerary saved as a draft quotation");
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the itinerary"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="itinerary-workspace">
      <div className="itinerary-editor">
        <label className="itinerary-title-label">
          ITINERARY TITLE
          <input
            aria-label="Itinerary title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="itinerary-meta">
          <span>
            <Plane size={15} /> Bali, Indonesia
          </span>
          <span>{days.length} days · 2 adults</span>
          <Status value="Draft" />
        </div>
        {days.map((d, i) => (
          <div className="itinerary-day" key={i}>
            <div className="day-number">
              <span>DAY</span>
              <strong>{i + 1}</strong>
            </div>
            <div>
              <input
                aria-label={`Day ${i + 1} title`}
                value={d.title}
                onChange={(e) =>
                  setDays(
                    days.map((item, j) => (j === i ? { ...item, title: e.target.value } : item)),
                  )
                }
              />
              <textarea
                aria-label={`Day ${i + 1} description`}
                value={d.description}
                onChange={(e) =>
                  setDays(
                    days.map((item, j) =>
                      j === i ? { ...item, description: e.target.value } : item,
                    ),
                  )
                }
              />
              <label>
                Service cost ({currency})
                <input
                  aria-label={`Day ${i + 1} cost`}
                  type="number"
                  min="0"
                  value={d.cost}
                  onChange={(e) =>
                    setDays(
                      days.map((item, j) =>
                        j === i ? { ...item, cost: Number(e.target.value) } : item,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <Button
              variant="ghost"
              size="icon"
              title={`Remove day ${i + 1}`}
              onClick={() => setDays(days.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            setDays([
              ...days,
              { title: "New day", description: "Add activities and services.", cost: 0 },
            ])
          }
        >
          <Plus /> Add day
        </Button>
      </div>
      <aside className="costing-panel">
        <h3>Quotation costing</h3>
        <p>2 adults · {currency}</p>
        <label>
          Accommodation cost
          <input
            type="number"
            min="0"
            value={hotel}
            onChange={(e) => setHotel(Number(e.target.value))}
          />
        </label>
        <label>
          Markup (%)
          <input
            type="number"
            min="0"
            max="100"
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
          />
        </label>
        <dl>
          <div>
            <dt>Supplier cost</dt>
            <dd>{money(cost, currency)}</dd>
          </div>
          <div>
            <dt>Markup</dt>
            <dd>{money((cost * markup) / 100, currency)}</dd>
          </div>
          <div className="cost-total">
            <dt>Selling price</dt>
            <dd>{money(Math.round(cost * (1 + markup / 100)), currency)}</dd>
          </div>
          <div>
            <dt>Gross profit</dt>
            <dd className="positive">{money((cost * markup) / 100, currency)}</dd>
          </div>
        </dl>
        <p className="cost-disclaimer">
          Before taxes, commissions and fees. Tax treatment is configured by your finance team.
        </p>
        <Button onClick={saveDraft} disabled={saving}>
          <Check /> {saving ? "Saving…" : "Save draft"}
        </Button>
        <Button variant="outline" onClick={() => setPreview(true)}>
          <FileText /> Preview proposal
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <FileText /> Print / Save PDF
        </Button>
      </aside>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="proposal-dialog">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Bali, Indonesia · {days.length} days · 2 adults</DialogDescription>
          </DialogHeader>
          {days.map((d, i) => (
            <div key={i}>
              <h4>
                Day {i + 1} — {d.title}
              </h4>
              <p>{d.description}</p>
            </div>
          ))}
          <h3>Total package: {money(Math.round(cost * (1 + markup / 100)), currency)}</h3>
          <Button
            variant="outline"
            onClick={() => {
              const text = `${title}\n\n${days.map((d, i) => `Day ${i + 1}: ${d.title}\n${d.description}`).join("\n\n")}\nTotal: ${money(Math.round(cost * (1 + markup / 100)), currency)}`;
              const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = "itinerary-proposal.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <ArrowDownToLine /> Download draft
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const WORKFLOW_TRIGGERS = [
  "New lead created",
  "Booking confirmed",
  "Payment overdue",
  "Quote expiring",
  "Task completed",
];
const WORKFLOW_CONDITIONS = [
  "All records",
  "Destination is Bali",
  "Amount above ₹1,00,000",
  "Assigned owner is empty",
];
const WORKFLOW_ACTIONS = [
  "Create follow-up task",
  "Assign to sales owner",
  "Request manager approval",
  "Prepare reminder draft",
];

function Automations() {
  const { status } = useCRM();
  const [editing, setEditing] = useState<WorkflowDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [moduleId, setModuleId] = useState("leads");
  const [trigger, setTrigger] = useState("New lead created");
  const [condition, setCondition] = useState("All records");
  const [action, setAction] = useState("Create follow-up task");

  // Workflows are persisted server-side; each run is recorded in execution history.
  const { data: workflows, reload } = useApiQuery(() => fetchWorkflows(), [], status === "ready");
  const list = workflows ?? [];

  const openCreate = () => {
    setName("");
    setModuleId("leads");
    setTrigger("New lead created");
    setCondition("All records");
    setAction("Create follow-up task");
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (w: WorkflowDto) => {
    setName(w.name);
    setModuleId(w.moduleId);
    setTrigger(w.trigger);
    setCondition(w.condition);
    setAction(w.action);
    setCreating(false);
    setEditing(w);
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  const save = () => {
    const done = () => {
      toast.success(editing ? "Workflow updated" : "Workflow created");
      close();
      reload();
    };
    const fail = (e: unknown) => toast.error(errorMessage(e, "Could not save workflow"));
    if (editing) {
      void updateWorkflow(editing.id, { name, trigger, condition, action }).then(done).catch(fail);
    } else {
      void createWorkflow({ name, moduleId, trigger, condition, action }).then(done).catch(fail);
    }
  };

  const toggle = (w: WorkflowDto) => {
    const next = w.status === "Active" ? "Paused" : "Active";
    void updateWorkflow(w.id, { status: next })
      .then(() => {
        toast.success(`Workflow ${next.toLowerCase()}`);
        reload();
      })
      .catch((e) => toast.error(errorMessage(e, "Could not update workflow")));
  };

  const remove = (w: WorkflowDto) => {
    void deleteWorkflow(w.id)
      .then(() => {
        toast.success("Workflow deleted");
        reload();
      })
      .catch((e) => toast.error(errorMessage(e, "Could not delete workflow")));
  };

  const run = (w: WorkflowDto) => {
    void runWorkflow(w.id)
      .then((res) => {
        toast.success(res.log || "Workflow executed");
        reload();
      })
      .catch((e) => toast.error(errorMessage(e, "Could not run workflow")));
  };

  const triggerOpts = Array.from(new Set([trigger, ...WORKFLOW_TRIGGERS]));
  const conditionOpts = Array.from(new Set([condition, ...WORKFLOW_CONDITIONS]));
  const actionOpts = Array.from(new Set([action, ...WORKFLOW_ACTIONS]));

  return (
    <>
      <div className="report-filter-band">
        <Button onClick={openCreate}>
          <Plus /> New workflow
        </Button>
        <span className="cost-disclaimer" style={{ marginLeft: "auto" }}>
          {list.length} workflow{list.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="automation-grid">
        {list.map((w) => (
          <div className="automation-card" key={w.id}>
            <div className="section-heading">
              <span className="workflow-icon">
                <Workflow size={22} />
              </span>
              <label className="toggle" title={`Toggle ${w.name}`}>
                <input type="checkbox" checked={w.status === "Active"} onChange={() => toggle(w)} />
                <span />
              </label>
            </div>
            <h3>{w.name}</h3>
            <p>{w.condition}</p>
            <div className="workflow-steps">
              <span>{w.trigger}</span>
              <ArrowRight size={12} />
              <span>{w.condition}</span>
              <ArrowRight size={12} />
              <span>{w.action}</span>
            </div>
            <div className="automation-bottom">
              <Status value={w.status} />
              <div style={{ display: "flex", gap: 6 }}>
                <Button variant="link" size="sm" onClick={() => run(w)}>
                  Run <ArrowUpRight />
                </Button>
                <Button variant="link" size="sm" onClick={() => openEdit(w)}>
                  Edit <ArrowUpRight />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete workflow"
                  onClick={() => remove(w)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <EmptyState
            title="No workflows yet"
            description="Create an automation to save your team time."
          />
        )}
      </div>
      <Dialog open={creating || Boolean(editing)} onOpenChange={(o) => (o ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? editing.name : "New workflow"}</DialogTitle>
            <DialogDescription>
              Actions run inside the workspace only — nothing is sent to suppliers.
            </DialogDescription>
          </DialogHeader>
          <label className="setting-row">
            Name
            <input
              aria-label="Workflow name"
              value={name}
              placeholder="e.g. Route new Bali enquiries"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="setting-row">
            Module
            <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              {allModules.map((m) => (
                <option key={m} value={m}>
                  {findModule(m)?.name ?? m}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["Trigger", trigger, setTrigger, triggerOpts],
              ["Condition", condition, setCondition, conditionOpts],
              ["Action", action, setAction, actionOpts],
            ] as Array<[string, string, (v: string) => void, string[]]>
          ).map(([label, value, setter, opts]) => (
            <label className="setting-row" key={label}>
              {label}
              <select value={value} onChange={(e) => setter(e.target.value)}>
                {opts.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
          <Button disabled={name.trim().length < 2} onClick={save}>
            <Check /> {editing ? "Save workflow" : "Create workflow"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

const allModules = findModule("leads")
  ? [
      "leads",
      "customers",
      "bookings",
      "quotations",
      "finance",
      "operations",
      "support",
      "suppliers",
      "agents",
      "visa",
    ]
  : [];

function SettingsPanel({
  tab,
  userLanguage,
  setUserLanguage,
}: {
  tab: string;
  userLanguage: Language;
  setUserLanguage: (v: Language) => void;
}) {
  const {
    settings,
    updateSettings,
    audit,
    fields,
    addField,
    removeField,
    user,
    reload,
    status: authStatus,
  } = useCRM();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const security = settings.security;
  const [cycleDraft, setCycleDraft] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<string | null>(null);
  const [savingBilling, setSavingBilling] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [auditModule, setAuditModule] = useState("All modules");
  const [newBranch, setNewBranch] = useState("");
  const [fieldModule, setFieldModule] = useState("leads");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<"text" | "number" | "date" | "select">("text");
  const [domainDraft, setDomainDraft] = useState("");
  const [currentDomain, setCurrentDomain] = useState<string | null>(null);
  const [savingDomain, setSavingDomain] = useState(false);
  const activeEmployees = settings.employees.filter((e) => e.active);

  // The organisation's own email / WhatsApp accounts.
  const { data: channelStatus, reload: reloadChannels } = useApiQuery(
    () => fetchChannelStatus(),
    [],
    authStatus === "ready",
  );
  const [smtpForm, setSmtpForm] = useState({
    host: "",
    port: 587,
    user: "",
    pass: "",
    from: "",
  });
  const [smtpTestTo, setSmtpTestTo] = useState("");
  const [waForm, setWaForm] = useState({ phoneNumberId: "", token: "" });
  const [waTestTo, setWaTestTo] = useState("");
  const [rzForm, setRzForm] = useState({ keyId: "", keySecret: "", webhookSecret: "" });

  // Prefill the email form from the saved account once it loads.
  useEffect(() => {
    if (!channelStatus?.email?.user) return;
    setSmtpForm((prev) => ({
      ...prev,
      host: prev.host || channelStatus.email.host,
      user: prev.user || channelStatus.email.user,
      from: prev.from || channelStatus.email.from,
    }));
    setWaForm((prev) => ({
      ...prev,
      phoneNumberId: prev.phoneNumberId || channelStatus.whatsapp.phoneNumberId,
    }));
  }, [channelStatus]);

  // Live billing: plan, usage counters and issued invoices for the organisation.
  const { data: subscription, reload: reloadSubscription } = useApiQuery(
    () => fetchSubscription(),
    [],
    authStatus === "ready",
  );
  const { data: domain, reload: reloadDomain } = useApiQuery(
    () => fetchDomain(),
    [],
    authStatus === "ready",
  );
  const { data: plans } = useApiQuery(() => fetchPlans(), [], authStatus === "ready");
  const { data: invoices } = useApiQuery(() => fetchInvoices(), [], authStatus === "ready");
  const { data: matrix, reload: reloadRoles } = useApiQuery(
    () => fetchRoleMatrix(),
    [],
    authStatus === "ready",
  );
  useEffect(() => {
    setCurrentDomain(domain?.customDomain ?? null);
  }, [domain]);

  const { data: apiKeys, reload: reloadKeys } = useApiQuery(
    () => fetchApiKeys(),
    [],
    authStatus === "ready",
  );

  const roleRows = matrix?.roles ?? [];
  const roleActions = matrix?.actions ?? ["view", "create", "edit", "approve", "export", "delete"];
  const roleAllowed = (role: RoleDto, action: string) =>
    role.permissions.actions === "*" || role.permissions.actions.includes(action);
  const keyRows = apiKeys ?? [];

  const saveRoles = async () => {
    setSavingRoles(true);
    try {
      await Promise.all(
        roleRows.map((role) => {
          const explicit = roleActions.filter(
            (action) => permissions[`${role.id}-${action}`] ?? roleAllowed(role, action),
          );
          const actions =
            role.permissions.actions === "*" && explicit.length === roleActions.length
              ? ("*" as const)
              : explicit;
          return updateRole(role.id, {
            permissions: { modules: role.permissions.modules, actions },
          });
        }),
      );
      reloadRoles();
      setPermissions({});
      toast.success("Permissions saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingRoles(false);
    }
  };

  const addKey = async () => {
    if (!keyName.trim()) return;
    setCreatingKey(true);
    try {
      const created = await createApiKey({ name: keyName.trim() });
      setNewKey(created.key);
      setKeyName("");
      reloadKeys();
      toast.success("API key created");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeKey = async (id: string, name: string) => {
    try {
      await revokeApiKey(id);
      reloadKeys();
      toast.success(`${name} revoked`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const saveProfile = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    setSavingProfile(true);
    try {
      await updateProfile({
        name: String(fd.get("name") ?? "").trim(),
        phone: String(fd.get("phone") ?? "").trim(),
      });
      await reload();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    setSavingPassword(true);
    try {
      await changePassword(String(fd.get("current") ?? ""), String(fd.get("next") ?? ""));
      form.reset();
      toast.success("Password updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  if (tab === "Profile")
    return (
      <div className="settings-workspace">
        <h2>Your profile</h2>
        <p>Update your details and password. Changes save to your account.</p>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile(e.currentTarget);
          }}
        >
          <label>
            Name
            <input name="name" defaultValue={user?.name ?? ""} required />
          </label>
          <label>
            Email
            <input name="email" defaultValue={user?.email ?? ""} disabled />
          </label>
          <label>
            Phone
            <input name="phone" defaultValue={user?.phone ?? ""} />
          </label>
          <div className="full-width dialog-actions">
            <Button type="submit" disabled={savingProfile}>
              <Check /> Save profile
            </Button>
          </div>
        </form>
        <h3>Change password</h3>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void savePassword(e.currentTarget);
          }}
        >
          <label>
            Current password
            <input name="current" type="password" required autoComplete="current-password" />
          </label>
          <label>
            New password
            <input name="next" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <div className="full-width dialog-actions">
            <Button type="submit" variant="outline" disabled={savingPassword}>
              <Check /> Update password
            </Button>
          </div>
          <h3>Language</h3>
          <label className="setting-row">
            Display language
            <select
              value={userLanguage}
              onChange={(e) => {
                const next = e.target.value as Language;
                setUserLanguage(next);
                localStorage.setItem("travo.language", next);
              }}
            >
              {Object.entries(LANGUAGES).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.native} ({info.label})
                </option>
              ))}
            </select>
          </label>
          <p className="setting-hint">
            Notifications use this language today. The rest of the workspace is still in English
            while translations are completed — we say so instead of pretending.
          </p>
        </form>
        <TwoFactorPanel enabled={authStatus === "ready"} />
      </div>
    );

  if (tab === "Roles & permissions")
    return (
      <div className="settings-workspace">
        <h2>Roles & permissions</h2>
        <p>
          Live roles from your workspace. Saving applies the matrix to every member on that role.
        </p>
        {roleRows.length === 0 ? (
          <EmptyState
            title="No roles loaded"
            description="Sign in against the API to manage roles and permissions."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table permission-table">
              <thead>
                <tr>
                  <th>Role</th>
                  {roleActions.map((action) => (
                    <th key={action}>
                      {action.charAt(0).toUpperCase()}
                      {action.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roleRows.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <strong>{role.name}</strong>
                      <small>
                        {role.members} members{role.isSystem ? " · built-in" : ""}
                      </small>
                    </td>
                    {roleActions.map((action) => (
                      <td key={action}>
                        <input
                          aria-label={`${role.name} ${action}`}
                          type="checkbox"
                          checked={permissions[`${role.id}-${action}`] ?? roleAllowed(role, action)}
                          onChange={(e) =>
                            setPermissions({
                              ...permissions,
                              [`${role.id}-${action}`]: e.target.checked,
                            })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="dialog-actions">
          <Button disabled={savingRoles || roleRows.length === 0} onClick={() => void saveRoles()}>
            <Check /> Save permissions
          </Button>
        </div>
        <h3>API keys</h3>
        {keyRows.length === 0 ? (
          <EmptyState
            title="No API keys"
            description="Create a key to let external systems call this workspace."
          />
        ) : (
          <div className="branch-list">
            {keyRows.map((k) => (
              <div className="security-row" key={k.id}>
                <div>
                  <h3>{k.name}</h3>
                  <p>
                    {k.prefix}… · {k.scopes.join(", ") || "all scopes"} ·{" "}
                    {k.lastUsedAt ? `last used ${formatDay(k.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  title={`Revoke ${k.name}`}
                  onClick={() => void revokeKey(k.id, k.name)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
        <form
          className="dialog-actions"
          onSubmit={(e) => {
            e.preventDefault();
            void addKey();
          }}
        >
          <input
            aria-label="New API key name"
            placeholder="Key name (e.g. Zapier)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
          />
          <Button type="submit" disabled={creatingKey || !keyName.trim()}>
            <Plus /> Create key
          </Button>
        </form>
        {newKey && (
          <div className="note-box">
            Copy this key now — it will not be shown again:
            <code> {newKey}</code>
          </div>
        )}
      </div>
    );

  if (tab === "Security")
    return (
      <div className="settings-workspace">
        <h2>Security preferences</h2>
        <p>What this browser should remember while you work.</p>
        {(
          [
            [
              "twoFactor",
              "Two-factor authentication (not available yet)",
              "Not switched on yet. Sign-in is protected by your password, refresh-token rotation and per-account rate limits until 2FA ships.",
            ],
            ["mask", "Mask sensitive traveller data", "Hide passport numbers in list views."],
            ["quiet", "Quiet hours", "Pause non-urgent alerts outside work hours."],
          ] as Array<[keyof typeof security, string, string]>
        ).map(([key, title, desc]) => (
          <div className="security-row" key={key}>
            <div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                aria-label={title}
                disabled={key === "twoFactor"}
                checked={security[key]}
                onChange={(e) =>
                  updateSettings({ security: { ...security, [key]: e.target.checked } })
                }
              />
              <span />
            </label>
          </div>
        ))}
        <p className="cost-disclaimer">
          These switches are remembered in this browser. The real rules — who can see which branch,
          which records and which actions — are enforced by the server on every request.
        </p>
        <div className="dialog-actions">
          <Button onClick={() => toast.success("Preferences saved")}>
            <Check /> Save preferences
          </Button>
        </div>
      </div>
    );

  if (tab === "Recycle bin") return <RecycleBin />;

  if (tab === "Tax settings")
    return (
      <div className="settings-workspace">
        <h2>Tax configuration</h2>
        <p>Tax treatment depends on the travel service and legal entity.</p>
        <div className="form-grid">
          <label>
            Tax regime
            <select
              value={settings.taxRegime}
              onChange={(e) => updateSettings({ taxRegime: e.target.value })}
            >
              <option>GST</option>
              <option>VAT</option>
              <option>No tax</option>
            </select>
          </label>
          <label>
            Default rate (%)
            <input
              type="number"
              min="0"
              max="100"
              value={settings.taxRate}
              onChange={(e) => updateSettings({ taxRate: Number(e.target.value) })}
            />
          </label>
          <label>
            GSTIN
            <input
              value={settings.gstin}
              onChange={(e) => updateSettings({ gstin: e.target.value })}
            />
          </label>
          <label>
            TCS % (section 206C(1G))
            <input
              type="number"
              min="0"
              max="30"
              step="0.1"
              value={settings.tcsPercent}
              onChange={(e) => updateSettings({ tcsPercent: Number(e.target.value) || 0 })}
            />
          </label>
          <label>
            TCS note on the invoice
            <input
              value={settings.tcsNote}
              placeholder="e.g. TCS collected on international packages"
              onChange={(e) => updateSettings({ tcsNote: e.target.value })}
            />
          </label>
          <label>
            Invoice prefix
            <input
              value={settings.invoicePrefix}
              onChange={(e) => updateSettings({ invoicePrefix: e.target.value })}
            />
          </label>
          <label>
            Financial year
            <select
              value={settings.financialYear}
              onChange={(e) => updateSettings({ financialYear: e.target.value })}
            >
              <option>April – March</option>
              <option>January – December</option>
            </select>
          </label>
          <label>
            Display currency
            <select
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value })}
            >
              <option>INR</option>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
              <option>AED</option>
              <option>SGD</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm text-muted">
          Leave TCS at 0 unless you collect it. When it is above zero every GST invoice prints a
          separate TCS line under the tax, and the Tax &amp; GST working paper reports it apart from
          GST — because it is money held for the government, not income. A single invoice can
          override the rate by storing <code>tcsRate</code> in its extra fields.
        </p>
        <div className="fx-rates-block">
          <h3>FX rates (INR per unit)</h3>
          <p>
            Foreign-currency invoices show the rate used so the INR tax value is never a mystery.
            Update these whenever your bank rate moves.
          </p>
          <div className="fx-rates-grid">
            {(["USD", "EUR", "GBP", "AED", "SGD"] as const).map((code) => (
              <label key={code}>
                1 {code} = ? INR
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.fxRates[code] ?? ""}
                  onChange={(e) =>
                    updateSettings({
                      fxRates: { ...settings.fxRates, [code]: Number(e.target.value) || 0 },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <Button onClick={() => toast.success("Tax settings saved")}>
            <Check /> Save preferences
          </Button>
        </div>
      </div>
    );

  if (tab === "Email & WhatsApp")
    return (
      <div className="settings-workspace">
        <h2>Email &amp; WhatsApp</h2>
        <p>
          Connect YOUR OWN accounts so enquiries, quotations and invoices really reach the customer.
          Gmail needs an app password (Google Account → Security → 2-Step Verification → App
          passwords).
        </p>
        {channelStatus?.email.configured ? (
          <div className="branch-list" style={{ marginBottom: 16 }}>
            <div className="security-row">
              <div>
                <h3>Email is live</h3>
                <p>
                  {channelStatus.email.user} via {channelStatus.email.host} ·{" "}
                  {channelStatus.email.source === "env"
                    ? "server default"
                    : "your workspace settings"}
                </p>
              </div>
              <Status value="Connected" />
            </div>
          </div>
        ) : (
          <div className="branch-list" style={{ marginBottom: 16 }}>
            <div className="security-row">
              <div>
                <h3>Email is not connected</h3>
                <p>
                  Messages are still written to the outbox and queued — nothing is lost, but nothing
                  is delivered until you connect an account.
                </p>
              </div>
              <Status value="Not connected" />
            </div>
          </div>
        )}
        <div className="form-grid">
          <label>
            SMTP host
            <input
              placeholder="smtp.gmail.com"
              value={smtpForm.host}
              onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
            />
          </label>
          <label>
            Port
            <input
              type="number"
              value={smtpForm.port}
              onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) || 587 })}
            />
          </label>
          <label>
            Username
            <input
              placeholder="you@yourcompany.com"
              value={smtpForm.user}
              onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
            />
          </label>
          <label>
            App password
            <input
              type="password"
              placeholder="leave blank to keep the saved one"
              value={smtpForm.pass}
              onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })}
            />
          </label>
          <label>
            From address
            <input
              placeholder="bookings@yourcompany.com"
              value={smtpForm.from}
              onChange={(e) => setSmtpForm({ ...smtpForm, from: e.target.value })}
            />
          </label>
          <label>
            Send a test to
            <input
              type="email"
              placeholder="you@yourcompany.com"
              value={smtpTestTo}
              onChange={(e) => setSmtpTestTo(e.target.value)}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <Button
            onClick={async () => {
              try {
                await saveEmailChannel({
                  host: smtpForm.host,
                  port: smtpForm.port,
                  secure: smtpForm.port === 465,
                  user: smtpForm.user,
                  ...(smtpForm.pass ? { pass: smtpForm.pass } : {}),
                  ...(smtpForm.from ? { from: smtpForm.from } : {}),
                });
                setSmtpForm({ ...smtpForm, pass: "" });
                reloadChannels();
                toast.success("Email channel saved");
              } catch (err) {
                toast.error(errorMessage(err, "Could not save the email channel"));
              }
            }}
          >
            <Check /> Save email account
          </Button>
          <Button
            variant="outline"
            disabled={!smtpTestTo}
            onClick={async () => {
              try {
                const result = await sendEmailTest(smtpTestTo);
                toast.success(
                  result.status === "sent"
                    ? "Test email sent"
                    : result.status === "failed"
                      ? "Test email failed — check the host, port and app password"
                      : "Test email queued — save the account first",
                );
              } catch (err) {
                toast.error(errorMessage(err, "Could not send the test email"));
              }
            }}
          >
            Send test email
          </Button>
          {channelStatus?.email.source === "settings" && (
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await removeEmailChannel();
                  reloadChannels();
                  toast.success("Email channel removed — back to the server default");
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              Disconnect
            </Button>
          )}
        </div>

        <WhatsAppConnect />

        <h3 style={{ marginTop: 28 }}>WhatsApp Business (Cloud API)</h3>
        <p>
          Optional for agencies on Meta&apos;s official API. Add your permanent access token and
          phone number ID — messages then leave the system for real. The scanned number above is
          used first when it is linked.
        </p>
        <div className="form-grid">
          <label>
            Phone number ID
            <input
              placeholder="123456789012345"
              value={waForm.phoneNumberId}
              onChange={(e) => setWaForm({ ...waForm, phoneNumberId: e.target.value })}
            />
          </label>
          <label>
            Access token
            <input
              type="password"
              placeholder="leave blank to keep the saved one"
              value={waForm.token}
              onChange={(e) => setWaForm({ ...waForm, token: e.target.value })}
            />
          </label>
          <label>
            Send a test to
            <input
              placeholder="+91 98765 43210"
              value={waTestTo}
              onChange={(e) => setWaTestTo(e.target.value)}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <Button
            onClick={async () => {
              try {
                await saveWhatsAppChannel({
                  phoneNumberId: waForm.phoneNumberId,
                  ...(waForm.token ? { token: waForm.token } : {}),
                });
                setWaForm({ ...waForm, token: "" });
                reloadChannels();
                toast.success("WhatsApp channel saved");
              } catch (err) {
                toast.error(errorMessage(err, "Could not save the WhatsApp channel"));
              }
            }}
          >
            <Check /> Save WhatsApp account
          </Button>
          <Button
            variant="outline"
            disabled={!waTestTo}
            onClick={async () => {
              try {
                const result = await sendWhatsAppTest(waTestTo);
                toast.success(
                  result.status === "sent"
                    ? "Test WhatsApp message sent"
                    : result.status === "failed"
                      ? "Test message failed — check the token and number ID"
                      : "Test message queued — save the account first",
                );
              } catch (err) {
                toast.error(errorMessage(err, "Could not send the test message"));
              }
            }}
          >
            Send test message
          </Button>
          {channelStatus?.whatsapp.source === "settings" && (
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await removeWhatsAppChannel();
                  reloadChannels();
                  toast.success("WhatsApp channel removed");
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              Disconnect
            </Button>
          )}
        </div>

        <h3 style={{ marginTop: 28 }}>Razorpay Payments</h3>
        <p>
          Collect payments from customers online. Create Razorpay payment links from invoices and
          let customers pay by card, UPI, net banking or wallet.
        </p>
        <div className="form-grid">
          <label>
            Key ID
            <input
              placeholder="rzp_live_1234567890"
              value={rzForm.keyId}
              onChange={(e) => setRzForm({ ...rzForm, keyId: e.target.value })}
            />
          </label>
          <label>
            Key Secret
            <input
              type="password"
              placeholder="leave blank to keep the saved one"
              value={rzForm.keySecret}
              onChange={(e) => setRzForm({ ...rzForm, keySecret: e.target.value })}
            />
          </label>
          <label>
            Webhook Secret
            <input
              type="password"
              placeholder="optional — for Razorpay webhook verification"
              value={rzForm.webhookSecret}
              onChange={(e) => setRzForm({ ...rzForm, webhookSecret: e.target.value })}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <Button
            onClick={async () => {
              try {
                await saveRazorpayChannel({
                  keyId: rzForm.keyId,
                  keySecret: rzForm.keySecret,
                  ...(rzForm.webhookSecret ? { webhookSecret: rzForm.webhookSecret } : {}),
                });
                setRzForm({ keyId: "", keySecret: "", webhookSecret: "" });
                reloadChannels();
                toast.success("Razorpay credentials saved");
              } catch (err) {
                toast.error(errorMessage(err, "Could not save Razorpay credentials"));
              }
            }}
          >
            <Check /> Save Razorpay account
          </Button>
          {channelStatus?.razorpay.source === "settings" && (
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await removeRazorpayChannel();
                  reloadChannels();
                  toast.success("Razorpay credentials removed");
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>
    );

  if (tab === "White-label domain")
    return (
      <div className="settings-workspace">
        <h2>White-label domain</h2>
        <p>
          Let your customers reach you at your own domain — crm.youragency.com — instead of
          traveldesk.io. You&rsquo;ll need to point a CNAME record at your Traveldesk URL.
        </p>
        <div className="form-grid">
          <label>
            Custom domain
            <input
              placeholder="crm.youragency.com"
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <Button
            disabled={savingDomain || !domainDraft}
            onClick={async () => {
              try {
                await updateDomain({ customDomain: domainDraft });
                reloadDomain();
                setDomainDraft("");
                toast.success("Custom domain updated");
              } catch (err) {
                toast.error(errorMessage(err, "Could not update domain"));
              } finally {
                setSavingDomain(false);
              }
            }}
          >
            <Check /> Set domain
          </Button>
          <Button
            variant="outline"
            disabled={savingDomain || !currentDomain}
            onClick={async () => {
              try {
                await updateDomain({ customDomain: null });
                reloadDomain();
                toast.success("Custom domain removed");
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setSavingDomain(false);
              }
            }}
          >
            Remove domain
          </Button>
        </div>
        <div className="glass-card mt-6 p-5 rounded-xl">
          <h3>Current domain</h3>
          <p>
            {currentDomain ? (
              <>
                <span className="font-mono">{currentDomain}</span>
                <p className="text-sm text-muted mt-2">
                  Point a CNAME record at your Traveldesk URL, then SSL is handled automatically.
                </p>
              </>
            ) : (
              <span className="text-muted">No custom domain set — using traveldesk.io</span>
            )}
          </p>
        </div>
      </div>
    );

  if (tab === "Organisation")
    return (
      <div className="settings-workspace">
        <h2>Organisation profile</h2>
        <p>Used across invoices, proposals and traveller communications.</p>
        <div className="form-grid">
          <label>
            Trading name
            <input
              value={settings.orgName}
              onChange={(e) => updateSettings({ orgName: e.target.value })}
            />
          </label>
          <label>
            Legal entity
            <input
              value={settings.legalName}
              onChange={(e) => updateSettings({ legalName: e.target.value })}
            />
          </label>
          <label>
            GSTIN / Tax ID
            <input
              value={settings.gstin}
              onChange={(e) => updateSettings({ gstin: e.target.value })}
            />
          </label>
          <label>
            Support email
            <input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => updateSettings({ supportEmail: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={settings.phone}
              onChange={(e) => updateSettings({ phone: e.target.value })}
            />
          </label>
          <label className="full-width">
            Registered address
            <input
              value={settings.address}
              onChange={(e) => updateSettings({ address: e.target.value })}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <Button onClick={() => toast.success("Organisation profile saved")}>
            <Check /> Save preferences
          </Button>
        </div>
      </div>
    );

  if (tab === "Branches")
    return (
      <div className="settings-workspace">
        <h2>Branches</h2>
        <p>Branches filter reporting and record assignment across the workspace.</p>
        <div className="branch-list">
          {settings.branches.map((b) => {
            const staff = activeEmployees.filter((e) => e.branch === b).length;
            return (
              <div className="security-row" key={b}>
                <div>
                  <h3>{b}</h3>
                  <p>
                    {staff} team member{staff === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  title={`Remove ${b}`}
                  onClick={() => {
                    if (settings.branches.length <= 1) {
                      toast.error("At least one branch is required");
                      return;
                    }
                    updateSettings({ branches: settings.branches.filter((x) => x !== b) });
                    toast.success(`${b} removed`);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>
        <form
          className="dialog-actions"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newBranch.trim();
            if (!name) return;
            if (settings.branches.includes(name)) {
              toast.error("Branch already exists");
              return;
            }
            updateSettings({ branches: [...settings.branches, name] });
            setNewBranch("");
            toast.success(`${name} added`);
          }}
        >
          <input
            placeholder="New branch name"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            required
          />
          <Button type="submit">
            <Plus /> Add branch
          </Button>
        </form>
      </div>
    );

  if (tab === "Employees")
    return (
      <div className="settings-workspace">
        <h2>Employees</h2>
        <p>Team members available for assignment, ownership and reporting.</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {settings.employees.map((e) => (
                <tr key={e.name}>
                  <td>
                    <span className="customer-cell">
                      <Avatar name={e.name} size="small" />
                      {e.name}
                    </span>
                  </td>
                  <td>{e.role}</td>
                  <td>{e.branch}</td>
                  <td>
                    <Status value={e.active ? "Active" : "Pending"} />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={e.active ? `Deactivate ${e.name}` : `Activate ${e.name}`}
                      onClick={() =>
                        updateSettings({
                          employees: settings.employees.map((x) =>
                            x.name === e.name ? { ...x, active: !x.active } : x,
                          ),
                        })
                      }
                    >
                      {e.active ? <Trash2 /> : <Check />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="dialog-actions"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name")).trim();
            const email = String(fd.get("email")).trim();
            if (!name) return;
            if (settings.employees.some((x) => x.name === name)) {
              toast.error("Employee already exists");
              return;
            }
            updateSettings({
              employees: [
                ...settings.employees,
                {
                  name,
                  email,
                  role: String(fd.get("role")),
                  branch: String(fd.get("branch")),
                  active: true,
                },
              ],
            });
            toast.success(`${name} invited`);
          }}
        >
          <input name="name" placeholder="Full name" required />
          <input name="email" type="email" placeholder="Work email" required />
          <select name="role" aria-label="Employee role" defaultValue="Sales">
            {Object.keys(ROLE_KEY_BY_LABEL).map((label) => (
              <option key={label}>{label}</option>
            ))}
          </select>
          <select name="branch" aria-label="Employee branch">
            {settings.branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <Button type="submit">
            <Plus /> Invite employee
          </Button>
        </form>
      </div>
    );

  if (tab === "Audit logs")
    return (
      <div className="settings-workspace">
        <h2>Audit logs</h2>
        <p>Every record change in this workspace, newest first. Stored on the server.</p>
        <div className="report-filter-band">
          <select
            aria-label="Filter audit module"
            value={auditModule}
            onChange={(e) => setAuditModule(e.target.value)}
          >
            <option>All modules</option>
            {allModules.map((id) => (
              <option key={id}>{findModule(id)?.name}</option>
            ))}
          </select>
        </div>
        {audit.filter(
          (a) => auditModule === "All modules" || findModule(a.module)?.name === auditModule,
        ).length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Create, edit or delete a record and it will appear here."
          />
        ) : (
          <div className="timeline">
            {audit
              .filter(
                (a) => auditModule === "All modules" || findModule(a.module)?.name === auditModule,
              )
              .map((a) => (
                <div key={a.id}>
                  <span className="timeline-dot" />
                  <h4>
                    {a.action} · {findModule(a.module)?.name ?? a.module}
                  </h4>
                  <p>
                    {a.user} {a.action.toLowerCase()} “{a.label}” ({a.recordId}).
                  </p>
                  <small>
                    {new Date(a.at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              ))}
          </div>
        )}
      </div>
    );

  if (tab === "Company admin")
    return (
      <div className="settings-workspace">
        <h2>Company admin</h2>
        <p>
          Organisation-level controls for {settings.orgName}. The Traveldesk platform console lives
          in its own portal.
        </p>
        <div className="subscription-summary">
          <div>
            <h3>{settings.orgName}</h3>
            <p>
              {settings.employees.length} team members A� {settings.branches.length} branches A�{" "}
              {settings.currency}
            </p>
          </div>
          <Status value="Active" />
        </div>
        <h3>Team</h3>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {settings.employees.map((e) => (
                <tr key={e.name}>
                  <td>{e.name}</td>
                  <td>{e.role}</td>
                  <td>{e.branch}</td>
                  <td>
                    <Status value={e.active ? "Active" : "Inactive"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

  if (tab === "Custom fields")
    return (
      <div className="settings-workspace">
        <h2>Custom fields</h2>
        <p>
          Add organisation-specific fields to any module's records — passport type, loyalty number,
          booking channel, anything you track.
        </p>
        <div className="report-filter-band">
          <select
            aria-label="Custom field module"
            value={fieldModule}
            onChange={(e) => setFieldModule(e.target.value)}
          >
            {allModules.map((id) => (
              <option key={id} value={id}>
                {findModule(id)?.name}
              </option>
            ))}
          </select>
        </div>
        <form
          className="dialog-actions"
          onSubmit={(e) => {
            e.preventDefault();
            const label = fieldLabel.trim();
            if (!label) return;
            addField(fieldModule, { id: `cf-${Date.now().toString(36)}`, label, type: fieldType });
            setFieldLabel("");
            toast.success(`“${label}” added to ${findModule(fieldModule)?.name}`);
          }}
        >
          <input
            placeholder="Field label (e.g. Passport number)"
            value={fieldLabel}
            onChange={(e) => setFieldLabel(e.target.value)}
            required
          />
          <select
            aria-label="Field type"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as typeof fieldType)}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
          </select>
          <Button type="submit">
            <Plus /> Add field
          </Button>
        </form>
        {(fields[fieldModule] ?? []).length === 0 ? (
          <EmptyState
            title="No custom fields"
            description="Added fields appear in this module's record forms automatically."
          />
        ) : (
          <div className="branch-list">
            {(fields[fieldModule] ?? []).map((f) => (
              <div className="security-row" key={f.id}>
                <div>
                  <h3>{f.label}</h3>
                  <p>{f.type} field · shown in record forms</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  title={`Remove ${f.label}`}
                  onClick={() => {
                    removeField(fieldModule, f.id);
                    toast.success(`“${f.label}” removed`);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );

  if (tab === "More modules")
    return (
      <div className="settings-workspace">
        <h2>More modules</h2>
        <p>
          Specialised workspaces kept out of the main menu to keep everyday navigation simple. Open
          them here whenever you need them.
        </p>
        <div className="branch-list">
          {modules
            .filter((m) => m.navHidden)
            .map((m) => (
              <Link
                key={m.id}
                to="/workspace/$module"
                params={{ module: m.id }}
                className="security-row"
                style={{ cursor: "pointer" }}
              >
                <div>
                  <h3>{m.name}</h3>
                  <p>{m.description}</p>
                </div>
                <ArrowUpRight size={18} />
              </Link>
            ))}
        </div>
      </div>
    );

  // Subscriptions (default)
  const sub = subscription?.subscription;
  const plan = subscription?.plan;
  const billingCycle = cycleDraft ?? sub?.billingCycle ?? "Yearly";
  const planName = sub?.planName ?? plan?.name ?? "Enterprise";
  const subStatus = sub?.status ?? "Active";
  const seats = sub?.seats ?? settings.employees.length;
  const planOptions = plans ?? [];
  const usageRows: Array<[string, number, number | null]> = subscription?.usage.length
    ? subscription.usage.map((u) => [u.metric, u.used, u.limit])
    : [
        ["Team members", settings.employees.length, 25],
        ["Branches", settings.branches.length, 5],
        ["Bookings", 156, 1000],
      ];
  const invoiceRows = invoices?.invoices ?? [];

  const saveBilling = async (patch: Parameters<typeof updateSubscription>[0], label: string) => {
    setSavingBilling(true);
    try {
      await updateSubscription(patch);
      reloadSubscription();
      toast.success(label);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingBilling(false);
    }
  };

  return (
    <div className="settings-workspace">
      <h2>{planName} subscription</h2>
      <p>
        {settings.orgName} · {subStatus}
        {sub?.currentPeriodEnd ? ` · renews ${formatDay(sub.currentPeriodEnd)}` : ""}
      </p>
      <div className="subscription-summary">
        <ShieldCheck size={28} />
        <div>
          <h3>{planName}</h3>
          <p>
            {planOptions.length} plans available · {seats} team members · {settings.branches.length}{" "}
            branches
          </p>
        </div>
        <Status value={subStatus} />
      </div>
      <label className="setting-row">
        Billing cycle
        <select
          value={billingCycle}
          disabled={savingBilling}
          onChange={(e) => {
            setCycleDraft(e.target.value);
            void saveBilling(
              { billingCycle: e.target.value as "Monthly" | "Yearly" },
              `Billing cycle set to ${e.target.value}`,
            );
          }}
        >
          <option>Yearly</option>
          <option>Monthly</option>
        </select>
      </label>
      {planOptions.length > 0 && (
        <label className="setting-row">
          Plan
          <select
            value={planDraft ?? sub?.planKey ?? planOptions[0]?.key ?? ""}
            disabled={savingBilling}
            onChange={(e) => {
              setPlanDraft(e.target.value);
              void saveBilling({ planKey: e.target.value }, "Subscription plan updated");
            }}
          >
            {planOptions.map((p: PlanDto) => (
              <option key={p.key} value={p.key}>
                {p.name}
                {p.popular ? " (popular)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="usage-bars">
        {usageRows.map(([label, used, max], i) => (
          <div key={label}>
            <p>
              {label}
              <span>
                {used} / {max ?? "∞"}
              </span>
            </p>
            <div>
              <span
                className={`usage-${i % 3}`}
                style={{ width: max ? `${Math.min(100, (used / max) * 100)}%` : "12%" }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="security-row">
        <div>
          <h3>Cancel at period end</h3>
          <p>Keep access until the current billing period finishes, then stop renewal.</p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            aria-label="Cancel at period end"
            checked={sub?.cancelAtPeriodEnd ?? false}
            disabled={savingBilling}
            onChange={(e) =>
              void saveBilling(
                { cancelAtPeriodEnd: e.target.checked },
                e.target.checked ? "Subscription set to cancel at period end" : "Renewal resumed",
              )
            }
          />
          <span />
        </label>
      </div>
      <h3>Invoices</h3>
      {invoiceRows.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Issued invoices for this organisation will appear here."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Issued</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoiceRows.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.period}</td>
                  <td>{formatDay(inv.issuedAt)}</td>
                  <td>{inv.planKey}</td>
                  <td>
                    <Status value={inv.status} />
                  </td>
                  <td>{money(inv.amount, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="dialog-actions">
        <Button
          variant="outline"
          onClick={() => {
            void reload().then(() => toast.success("Workspace refreshed"));
          }}
        >
          <RefreshCw /> Refresh workspace
        </Button>
        <Button
          disabled={savingBilling}
          onClick={() => {
            reloadSubscription();
            toast.success("Billing refreshed");
          }}
        >
          <Check /> Refresh billing
        </Button>
      </div>
    </div>
  );
}

function FlightSearch({ rows, onOpen }: { rows: RecordRow[]; onOpen: (r: RecordRow) => void }) {
  const { settings } = useCRM();
  const currency = settings.currency;
  const [trip, setTrip] = useState("Round trip");
  const [from, setFrom] = useState("DEL");
  const [to, setTo] = useState("DPS");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [adults, setAdults] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FlightSearchResult | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const outcome = await searchFlights({ from, to, date, adults: Number(adults) || 1 });
      setResult(outcome);
      setSearched(true);
    } catch (err) {
      toast.error(errorMessage(err));
      setResult({ configured: true, offers: [] });
      setSearched(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flight-search-panel">
        <div className="segmented-control">
          {["Round trip", "One way", "Multi-city"].map((t) => (
            <Button
              key={t}
              variant="ghost"
              className={trip === t ? "active" : ""}
              onClick={() => setTrip(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <form className="flight-search-form" onSubmit={(e) => void runSearch(e)}>
          <label>
            From (IATA)
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value.toUpperCase())}
              required
              maxLength={3}
              pattern="[A-Za-z]{3}"
            />
          </label>
          <label>
            To (IATA)
            <input
              value={to}
              onChange={(e) => setTo(e.target.value.toUpperCase())}
              required
              maxLength={3}
              pattern="[A-Za-z]{3}"
            />
          </label>
          <label>
            Departure
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          {trip !== "One way" && (
            <label>
              {trip === "Multi-city" ? "Next destination" : "Return"}
              <input type={trip === "Multi-city" ? "text" : "date"} />
            </label>
          )}
          <label>
            Travellers
            <select value={adults} onChange={(e) => setAdults(e.target.value)}>
              {["1", "2", "3", "4", "5"].map((n) => (
                <option key={n} value={n}>
                  {n} adult{n === "1" ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy}>
            <Search /> {busy ? "Searching…" : "Search live fares"}
          </Button>
        </form>
      </div>
      {searched && result && !result.configured ? (
        <div className="integration-notice">
          <Plane size={19} />
          <div>
            <strong>Live flight search needs a one-time setup</strong>
            <p>{result.message}</p>
          </div>
        </div>
      ) : null}
      {searched && result ? (
        result.configured && result.offers.length > 0 ? (
          <div className="flight-results">
            <h3>
              Live fares · {from} → {to}
            </h3>
            {result.offers.map((offer, i) => (
              <div className="flight-result" key={`${offer.airline}-${i}`}>
                <span className={`airline-logo tone-${i % 3}`}>
                  {offer.airline.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h4>{offer.airline}</h4>
                  <small>
                    {offer.seatsLeft != null
                      ? `${offer.seatsLeft} seats left`
                      : "Availability live"}
                  </small>
                </div>
                <div className="flight-times">
                  <strong>{offer.departure.time.slice(11, 16)}</strong>
                  <span>{offer.departure.airport}</span>
                  <ArrowRight size={16} />
                  <span>{offer.arrival.airport}</span>
                  <strong>{offer.arrival.time.slice(11, 16)}</strong>
                </div>
                <div>
                  <strong>{money(offer.price, offer.currency || currency)}</strong>
                  <small>per traveller · live fare</small>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const fareLine = `${offer.airline} · ${from}→${to} · ${offer.departure.time.slice(11, 16)}–${offer.arrival.time.slice(11, 16)} · ${money(offer.price, offer.currency || currency)} per traveller`;
                    try {
                      await navigator.clipboard.writeText(fareLine);
                      toast.success("Fare copied — paste it into a quote or booking note.");
                    } catch {
                      toast.info(fareLine);
                    }
                  }}
                >
                  Copy fare
                </Button>
              </div>
            ))}
          </div>
        ) : result.configured ? (
          <EmptyState
            title="No flights found"
            description={`No published fares for ${from} → ${to} on ${date}. Try another date or route.`}
          />
        ) : null
      ) : (
        <EmptyState
          title="Find your next connection"
          description="Search live Amadeus fares the moment credentials are set — no more made-up sample data."
        />
      )}
    </>
  );
}

/* ====================================================================== *
 * Call logs � every call, with the outcome, logged in one place.
 * ====================================================================== */

function CallLogsPanel() {
  const { status, user } = useCRM();
  const { data: calls, reload } = useApiQuery(() => fetchCallLogs(), [], status === "ready");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [direction, setDirection] = useState<"Inbound" | "Outbound">("Outbound");
  const [outcome, setOutcome] = useState("Connected");
  const [minutes, setMinutes] = useState("5");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = calls ?? [];

  const log = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createCallLog({
        contactName: name.trim(),
        ...(phone.trim() ? { contactPhone: phone.trim() } : {}),
        direction,
        outcome,
        durationMinutes: Number(minutes) || 0,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(user?.name ? { owner: user.name } : {}),
      });
      setName("");
      setPhone("");
      setMinutes("5");
      setNotes("");
      reload();
      toast.success("Call logged");
    } catch (err) {
      toast.error(errorMessage(err, "Could not log the call"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-workspace">
      <h2>Call logs</h2>
      <p>Every call your team makes, with the outcome. Log one after the call, not later.</p>
      <div className="form-grid">
        <label>
          Who did you speak to
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer name"
          />
        </label>
        <label>
          Number
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
        </label>
        <label>
          Direction
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "Inbound" | "Outbound")}
          >
            <option>Outbound</option>
            <option>Inbound</option>
          </select>
        </label>
        <label>
          Outcome
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option>Connected</option>
            <option>No answer</option>
            <option>Busy</option>
            <option>Callback requested</option>
            <option>Not interested</option>
            <option>Converted</option>
          </select>
        </label>
        <label>
          Talk time (minutes)
          <input
            type="number"
            min="0"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <label>
          Notes
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was discussed"
          />
        </label>
      </div>
      <div className="dialog-actions">
        <Button onClick={log} disabled={busy || !name.trim()}>
          <Check /> Log call
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="glass-card mt-4 p-8 text-center text-sm text-muted">
          No calls logged yet. Every call you log shows up here with its outcome.
        </p>
      ) : (
        <div className="glass-card mt-4 overflow-x-auto p-5">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-3">When</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">Direction</th>
                <th className="pb-3">Outcome</th>
                <th className="pb-3">Time</th>
                <th className="pb-3">Agent</th>
                <th className="pb-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((call) => (
                <tr key={call.id} className="border-t border-line">
                  <td className="py-2.5 text-xs text-muted">
                    {new Date(call.calledAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2.5">
                    <div className="font-semibold">{call.contactName}</div>
                    {call.contactPhone && (
                      <div className="text-xs text-muted">{call.contactPhone}</div>
                    )}
                  </td>
                  <td className="py-2.5">{call.direction}</td>
                  <td className="py-2.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        call.outcome === "Converted"
                          ? "bg-pine text-on-pine"
                          : call.outcome === "No answer" || call.outcome === "Busy"
                            ? "bg-well"
                            : "bg-glass-2",
                      )}
                    >
                      {call.outcome}
                    </span>
                  </td>
                  <td className="py-2.5 tabular-nums">{call.durationMinutes} min</td>
                  <td className="py-2.5 text-xs text-muted">{call.owner || "�"}</td>
                  <td className="py-2.5 text-xs text-muted">{call.notes || "�"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== *
 * Message templates � the replies your team sends every day.
 * ====================================================================== */

function TemplatesPanel() {
  const { status } = useCRM();
  const { data: templates, reload } = useApiQuery(
    () => fetchMessageTemplates(),
    [],
    status === "ready",
  );
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("Email");
  const [busy, setBusy] = useState(false);

  const rows = templates ?? [];

  const create = async () => {
    if (!name.trim() || !body.trim() || busy) return;
    setBusy(true);
    try {
      await createMessageTemplate({ channel, name: name.trim(), body: body.trim() });
      setName("");
      setBody("");
      reload();
      toast.success("Template saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the template"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-workspace">
      <h2>Message templates</h2>
      <p>The replies you send every day. They show up as one-tap chips inside any conversation.</p>
      <div className="form-grid">
        <label>
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option>Email</option>
            <option>WhatsApp</option>
            <option>Shared inbox</option>
          </select>
        </label>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Itinerary proposal"
          />
        </label>
      </div>
      <label className="block">
        Message
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Hi {name}, here is the itinerary we discussed�"
        />
      </label>
      <div className="dialog-actions">
        <Button onClick={create} disabled={busy || !name.trim() || !body.trim()}>
          <Check /> Save template
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="glass-card mt-4 p-8 text-center text-sm text-muted">
          No templates yet � save the reply you type most often.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((tpl) => (
            <article key={tpl.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold">{tpl.name}</h3>
                  <p className="text-[11px] text-muted">{tpl.channel}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Delete template ${tpl.name}`}
                  className="text-muted hover:text-foreground"
                  onClick={async () => {
                    try {
                      await deleteMessageTemplate(tpl.id);
                      reload();
                      toast.success("Template deleted");
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                {tpl.body}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ====================================================================== *
 * Consent � what each customer agreed to be contacted on.
 * ====================================================================== */

function ConsentPanel() {
  const { status, getRows } = useCRM();
  const { data: consents, reload } = useApiQuery(() => fetchConsents(), [], status === "ready");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = consents ?? [];
  const customers = getRows("customers");

  const save = async (
    contactEmail: string,
    contactName: string,
    values: {
      email: boolean;
      whatsapp: boolean;
      calls: boolean;
    },
  ) => {
    setBusy(true);
    try {
      await saveConsent({
        contactEmail,
        contactName,
        email: values.email,
        whatsapp: values.whatsapp,
        calls: values.calls,
        source: "Workspace",
      });
      reload();
      toast.success("Consent saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save consent"));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (row: ConsentDto, key: "email" | "whatsapp" | "calls") => {
    void save(row.contactEmail, row.contactName, {
      email: key === "email" ? !row.email : row.email,
      whatsapp: key === "whatsapp" ? !row.whatsapp : row.whatsapp,
      calls: key === "calls" ? !row.calls : row.calls,
    });
  };

  return (
    <div className="settings-workspace">
      <h2>Consent</h2>
      <p>
        What each customer agreed to. Only message a contact on the channels they ticked � that is
        what keeps you compliant.
      </p>
      <div className="form-grid">
        <label>
          Customer email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@email.com"
          />
        </label>
        <label>
          Customer name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
        </label>
      </div>
      <div className="dialog-actions">
        <Button
          disabled={busy || !email.trim()}
          onClick={() => {
            setEmail("");
            void save(email.trim(), name.trim(), { email: true, whatsapp: false, calls: false });
          }}
        >
          <Check /> Record consent
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="glass-card mt-4 p-8 text-center text-sm text-muted">
          No consent recorded yet. Add the first customer above.
        </p>
      ) : (
        <div className="glass-card mt-4 overflow-x-auto p-5">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">WhatsApp</th>
                <th className="pb-3">Calls</th>
                <th className="pb-3">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="py-2.5">
                    <div className="font-semibold">{row.contactName || row.contactEmail}</div>
                    <div className="text-xs text-muted">{row.contactEmail}</div>
                  </td>
                  {(["email", "whatsapp", "calls"] as const).map((key) => (
                    <td key={key} className="py-2.5">
                      <input
                        type="checkbox"
                        checked={row[key]}
                        disabled={busy}
                        aria-label={`${key} consent for ${row.contactEmail}`}
                        onChange={() => toggle(row, key)}
                      />
                    </td>
                  ))}
                  <td className="py-2.5 text-xs text-muted">
                    {new Date(row.capturedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {customers.length > 0 && (
        <>
          <h3 className="mt-8">Your customers</h3>
          <p>Tick a channel to record consent for a customer you already have.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {customers.slice(0, 12).map((customer) => {
              const existing = rows.find((r) => r.contactEmail === customer.email);
              return (
                <div
                  key={customer.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-glass-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{customer.name}</div>
                    <div className="truncate text-[11px] text-muted">
                      {customer.email || "no email on file"}
                    </div>
                  </div>
                  {customer.email ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void save(customer.email, customer.name, {
                          email: !(existing?.email ?? false),
                          whatsapp: existing?.whatsapp ?? false,
                          calls: existing?.calls ?? false,
                        })
                      }
                    >
                      {existing?.email ? "On" : "Add"}
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted">no email</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
