import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileText,
  Filter,
  Globe2,
  LayoutGrid,
  Lightbulb,
  List,
  Loader2,
  MoreHorizontal,
  Plane,
  Plus,
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
} from "./common";
import { Btn, FilterMenu, Kbd, Segmented } from "./ui";
import { Page, PageIdentity } from "./page";
import { Ledger } from "./archetypes/ledger";
import { Pipeline } from "./archetypes/pipeline";
import { FirstRunWizard } from "./firstrun";
import { HelpPanel } from "./help";
import { guideFor } from "@/lib/crm/guide";
import { plain, plainModule } from "@/lib/crm/language";
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
import { getSchema, getTabDef, extraKeyName, type ModuleSchema } from "@/lib/crm/schema";
import { CustomerDirectory } from "./customer-directory";
import { GrowthReports } from "./growth-reports";
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
  deleteSavedReport,
  deleteWebhook,
  deleteWorkflow,
  disconnectIntegration,
  exportRecordsCsv,
  fetchApiKeys,
  fetchAssistantMessages,
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
  fetchWorkflows,
  revokeApiKey,
  runReport,
  runWorkflow,
  sendAssistantMessage,
  sendConversationMessage,
  testWebhook,
  updateProfile,
  updateRole,
  updateSubscription,
  updateWorkflow,
  type AssistantMessageDto,
  type ConversationDto,
  type IntegrationDto,
  type MessageDto,
  type PlanDto,
  type ReportKey,
  type RoleDto,
  type WorkflowDto,
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
]);

export function Workspace({ module }: { module: Module }) {
  const guide = guideFor(module);
  const { getRows, update, settings, fields, user } = useCRM();
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
  const [view, setView] = useState(guide.archetype === "catalogue" ? "grid" : "list");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [showTips, setShowTips] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [help, setHelp] = useState(false);
  const offered = useRef(false);

  const rows = getRows(module.id, tab);
  const tabDef = getTabDef(schema, tab);
  const activeView = usesModuleTabs ? undefined : guide.views.find((v) => v.label === tab);

  // A brand-new workspace does not show an empty table. It sits the person
  // down and walks them through making their first record.
  useEffect(() => {
    if (offered.current) return;
    if (rows.length === 0 && !query && statusFilter.length === 0 && owner === "All owners") {
      offered.current = true;
      setWizard(true);
    }
  }, [rows.length, query, statusFilter.length, owner]);

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
    (module.id === "reports" && tab !== "Growth") ||
    (module.id === "quotations" && tab === "Itinerary builder") ||
    (module.id === "automation" && tab === "Workflows") ||
    (module.id === "flights" && tab === "Flight search");

  const specialBody = (() => {
    if (module.id === "assistant") return <Assistant tab={tab} />;
    if (module.id === "inbox") return <Inbox tab={tab} />;
    if (module.id === "reports" && tab === "Growth") return <GrowthReports />;
    if (module.id === "reports") return <Reports rows={rows} tab={tab} />;
    if (module.id === "integrations") return <Integrations tab={tab} />;
    if (module.id === "quotations" && tab === "Itinerary builder") return <Itinerary />;
    if (module.id === "automation" && tab === "Workflows") return <Automations />;
    if (module.id === "settings") return <SettingsPanel tab={tab} />;
    if (module.id === "flights" && tab === "Flight search")
      return <FlightSearch onOpen={setRow} rows={rows} />;
    return null;
  })();

  const showDirectory = module.id === "customers" && view === "grid";

  return (
    <>
      <Page
        identity={
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
                  <Btn size="md" tone="primary" icon={<Plus />} onClick={() => openCreate()}>
                    {guide.primary}
                  </Btn>
                </>
              )
            }
          />
        }
        switchboard={
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
                {canBoard && (
                  <Segmented
                    options={["List", "Board"]}
                    value={view === "board" ? "Board" : "List"}
                    onChange={(next) => setView(next === "Board" ? "board" : "list")}
                    label="Layout"
                  />
                )}
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
        }
        work={
          isSpecialView ? (
            specialBody
          ) : (
            <>
              {showDirectory ? (
                <CustomerDirectory
                  rows={filtered}
                  currency={currency}
                  onOpenRecord={(r) => setRow(r)}
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
              ) : (
                <Ledger
                  rows={filtered}
                  columns={schema.columns}
                  currency={currency}
                  sort={sort}
                  onSort={(next) =>
                    setSort(next ? { key: next.key as SortKey, dir: next.dir } : null)
                  }
                  onOpen={(r) => setRow(r)}
                  onCreate={() => openCreate()}
                  createLabel={guide.primary}
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
      {(row || create) && (
        <RecordDialog
          module={module}
          row={row}
          create={create}
          {...(createStage ? { initialData: { status: createStage } } : {})}
          onClose={() => {
            setRow(null);
            setCreate(false);
            setCreateStage(null);
          }}
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
  const { status } = useCRM();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState(tab);
  const [draft, setDraft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<MessageDto[]>([]);

  // Conversations arrive from the shared-inbox API; channel counters drive the filter.
  const { data: page } = useApiQuery(
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

  if (status === "ready" && !active) return <EmptyState />;

  return (
    <div className="inbox-workspace">
      <div className="conversation-list">
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
          {templates && templates.length > 0 && (
            <div
              className="template-chips"
              style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 16px 8px" }}
            >
              {templates.map((tpl) => (
                <Button key={tpl.id} size="sm" variant="outline" onClick={() => setDraft(tpl.body)}>
                  {tpl.name}
                </Button>
              ))}
            </div>
          )}
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
                  toast.success("Reply added to the thread");
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
          <ArrowDownToLine /> Export report
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
  const list = integrations ?? [];
  const filtered =
    tab === "Business apps"
      ? list.filter((c) => c.category === "business" || c.category === "payment")
      : tab === "Supplier connections"
        ? list.filter((c) => c.category === "gds" || c.category === "supplier")
        : list;

  const connect = () => {
    if (!active) return;
    void connectIntegration(active.id, { environment })
      .then(() => {
        toast.success(`${active.provider} connected (${environment})`);
        setActive(null);
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
        <EmptyState
          title="No connection activity"
          description="Connection and webhook activity will be listed here."
        />
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
          if (!o) setActive(null);
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

function Itinerary() {
  const { settings } = useCRM();
  const currency = settings.currency;
  const [title, setTitle] = useState("Bali Bliss Escape");
  const [days, setDays] = useState([
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
  ]);
  const [hotel, setHotel] = useState(70000);
  const [markup, setMarkup] = useState(20);
  const [preview, setPreview] = useState(false);
  const cost = days.reduce((a, d) => a + d.cost, 0) + hotel;
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
        <Button
          onClick={() => {
            toast.success("Itinerary draft saved for this visit");
          }}
        >
          <Check /> Save draft
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

function SettingsPanel({ tab }: { tab: string }) {
  const {
    settings,
    updateSettings,
    audit,
    fields,
    addField,
    removeField,
    resetDemoData,
    user,
    reload,
    status: authStatus,
  } = useCRM();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [security, setSecurity] = useState({ twoFactor: true, mask: true, quiet: false });
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
  const activeEmployees = settings.employees.filter((e) => e.active);

  // Live billing: plan, usage counters and issued invoices for the organisation.
  const { data: subscription, reload: reloadSubscription } = useApiQuery(
    () => fetchSubscription(),
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
        </form>
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
        <p>Demo controls. Actual security requires server-side enforcement.</p>
        {(
          [
            [
              "twoFactor",
              "Two-factor authentication",
              "Require a second verification step at sign-in.",
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
                checked={security[key]}
                onChange={(e) => setSecurity({ ...security, [key]: e.target.checked })}
              />
              <span />
            </label>
          </div>
        ))}
        <div className="dialog-actions">
          <Button onClick={() => toast.success("Preferences saved for this visit")}>
            <Check /> Save preferences
          </Button>
        </div>
      </div>
    );

  if (tab === "Tax settings")
    return (
      <div className="settings-workspace">
        <h2>Tax configuration</h2>
        <p>Tax treatment depends on the travel service and legal entity.</p>
        <div className="form-grid">
          <label>
            Tax regime
            <select defaultValue="GST">
              <option>GST</option>
              <option>VAT</option>
              <option>No tax</option>
            </select>
          </label>
          <label>
            Default rate (%)
            <input type="number" min="0" max="100" defaultValue="18" />
          </label>
          <label>
            GSTIN
            <input
              value={settings.gstin}
              onChange={(e) => updateSettings({ gstin: e.target.value })}
            />
          </label>
          <label>
            Invoice prefix
            <input defaultValue="HT-INV-" />
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
        <div className="dialog-actions">
          <Button onClick={() => toast.success("Tax settings saved")}>
            <Check /> Save preferences
          </Button>
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
        <p>Every record change in this workspace, newest first. Stored on this device.</p>
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
            resetDemoData();
            toast.success("Workspace data reloaded");
          }}
        >
          <Trash2 /> Reload workspace data
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
  const [searched, setSearched] = useState(false);
  const [from, setFrom] = useState("Delhi (DEL)");
  const [to, setTo] = useState("Bali (DPS)");
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
        <form
          className="flight-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSearched(true);
          }}
        >
          <label>
            From
            <input value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label>
            To
            <input value={to} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <label>
            Departure
            <input type="date" required />
          </label>
          {trip !== "One way" && (
            <label>
              {trip === "Multi-city" ? "Next destination" : "Return"}
              <input type={trip === "Multi-city" ? "text" : "date"} />
            </label>
          )}
          <label>
            Travellers
            <select>
              <option>2 adults · Economy</option>
              <option>1 adult · Economy</option>
              <option>2 adults · Business</option>
            </select>
          </label>
          <Button>
            <Search /> Search flights
          </Button>
        </form>
      </div>
      <div className="integration-notice">
        <Plane size={19} />
        <div>
          <strong>Sample flight inventory</strong>
          <p>
            Fares and availability are illustrative. No PNR, ticket or supplier booking is created.
          </p>
        </div>
      </div>
      {searched ? (
        <div className="flight-results">
          <h3>
            Sample flights · {from} → {to}
          </h3>
          {rows.slice(0, 3).map((r, i) => (
            <div className="flight-result" key={r.id}>
              <span className={`airline-logo tone-${i}`}>{["SQ", "EK", "AI"][i]}</span>
              <div>
                <h4>{["Singapore Airlines", "Emirates", "Air India"][i]}</h4>
                <small>Economy · 25 kg baggage</small>
              </div>
              <div className="flight-times">
                <strong>{["09:00", "11:30", "14:00"][i]}</strong>
                <span>
                  8h 20m · 1 stop
                  <ArrowRight size={16} />
                </span>
                <strong>{["19:50", "22:20", "00:50"][i]}</strong>
              </div>
              <div>
                <strong>{money([48500, 52600, 46200][i] ?? 0, currency)}</strong>
                <small>per traveller · Sample fare</small>
              </div>
              <Button variant="outline" onClick={() => onOpen(r)}>
                View details
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Find your next connection"
          description="Search to explore sample flight options."
        />
      )}
    </>
  );
}
