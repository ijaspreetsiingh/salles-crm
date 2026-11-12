import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Compass,
  CornerDownLeft,
  FileText,
  Home,
  Menu,
  Moon,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  Sun,
  Ticket,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Wallet,
  Zap,
  Package,
  PlaneTakeoff,
  Receipt,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useCRM } from "@/lib/crm/store";
import { toRecordRow, toTask } from "@/lib/api/crm";
import { findModule, modules } from "@/lib/crm/catalog";
import {
  activeKeyFor,
  buildNavEntries,
  buildSidebarGroups,
  CORE_MODULE_IDS,
  DEFAULT_ENABLED_MODULES,
  EXTRA_HINTS,
  EXTRA_MODULE_IDS,
  ICONS,
  type NavEntry,
} from "@/lib/crm/nav";
import { plainModule } from "@/lib/crm/language";
import { buildWorklist } from "@/lib/crm/worklist";
import { prefs, useDensity, usePrefs } from "@/lib/crm/prefs";
import { useApiQuery } from "@/lib/api/hooks";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { ContextualHelp } from "./contextual-help";
import { SetupWizard, useSetupWizard } from "./setup-wizard";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  searchWorkspace,
  type SearchResponseDto,
} from "@/lib/api/modules";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, IconBtn, Kbd, Sheet } from "./ui";
import { cn } from "@/lib/utils";

/* ==========================================================================
   The application shell.

   A collapsible sidebar holds every module in five short groups, with the
   things that need attention at the very top. A slim top bar carries
   search, branch, notifications and profile. One command palette
   (Ctrl/Cmd + K) reaches records, tasks, people and actions, so nothing
   is more than a couple of keystrokes away.
   ========================================================================== */

/** Statuses that mean "this needs a human" — drives the red counters. */
const ALERT_STATUS: Record<string, string[]> = {
  leads: ["New"],
  bookings: ["Pending", "On hold"],
  quotations: ["Sent"],
  support: ["Open", "Escalated"],
  finance: ["Overdue"],
  visa: ["Documents pending"],
  integrations: ["Not connected"],
};

type PaletteGroup = {
  id: string;
  label: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    icon: ReactNode;
    run: () => void;
  }>;
};

/**
 * The five-step welcome tour.
 *
 * Each step has a title, body, icon, a tip (shown in a highlight box),
 * and an optional action link that navigates the user directly to the
 * relevant module so they can try it immediately.
 */
const TOUR_STEPS: Array<{
  title: string;
  body: string;
  tip: string;
  icon: ReactNode;
  action?: { label: string; to: string };
}> = [
  {
    title: "Capture every enquiry",
    body: "When a customer asks about a trip, add an enquiry — name, destination, travel dates, and phone number. Takes 20 seconds. Every future quote, booking and invoice ties back to this one record.",
    tip: "Sidebar → Enquiries → + New",
    icon: <Plus className="size-4" />,
    action: { label: "Open Enquiries", to: "/workspace/leads" },
  },
  {
    title: "Build a quote in minutes",
    body: "Pick the enquiry, add flights, hotels and transfers as line items. GST calculates automatically. One click sends a professional PDF to the customer's email — no spreadsheet needed.",
    tip: "Open the enquiry → Convert to Quote",
    icon: <FileText className="size-4" />,
    action: { label: "Open Quotations", to: "/workspace/quotations" },
  },
  {
    title: "Confirm the booking",
    body: "Customer said yes? Convert the quote to a booking in one click. Add departure date, travellers, and supplier confirmations. The PNR queue tracks any pending ticket deadlines with countdown timers.",
    tip: "Quote → Confirm Booking",
    icon: <PlaneTakeoff className="size-4" />,
    action: { label: "Open Bookings", to: "/workspace/bookings" },
  },
  {
    title: "Collect payment",
    body: "Raise a GST invoice from the booking and share a Razorpay payment link. When the customer pays, the invoice marks itself paid automatically — no chasing, no manual entry.",
    tip: "Booking → Raise Invoice → Send Link",
    icon: <Receipt className="size-4" />,
    action: { label: "Open Finance", to: "/workspace/finance" },
  },
  {
    title: "Build repeat business",
    body: "Every trip builds the customer's full history — past bookings, money owed, open follow-ups. Next time they travel, you already know them. That is the whole CRM in one line.",
    tip: "Customers module → full history",
    icon: <Users className="size-4" />,
    action: { label: "Open Customers", to: "/workspace/customers" },
  },
];

/**
 * Which office you are looking at.
 *
 * This used to be a chip that looked switchable and did nothing, which is
 * worse than no control at all. It now narrows the whole workspace — the
 * home list, the module lists and the dashboard numbers — and a role that can
 * only see its own office gets a plain label instead of a choice it does not
 * have.
 */
function BranchSwitch({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choices = ["All branches", ...options];

  return (
    <span className="relative" ref={ref}>
      <button
        type="button"
        className="branch-switch"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Office: ${value}`}
        title="Which office's work you are looking at"
        onClick={() => setOpen((state) => !state)}
      >
        <span className="online-dot" />
        {value}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="filter__menu right-0 left-auto z-50" role="listbox">
          <div className="filter__label">Which office</div>
          {choices.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              className={cn("filter__option", value === option && "is-active")}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {value === option && <Check className="size-3.5" />}
              <span className={cn(value !== option && "pl-5")}>{option}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * One sidebar destination.
 *
 * Standalone screens (Today, Tasks, Your team) have their own route; module
 * screens go through `/workspace/$module`. Keeping the three explicit keeps
 * the router's types honest instead of casting a string.
 */
function SidebarItem({
  entry,
  active,
  badge,
  onNavigate,
}: {
  entry: NavEntry;
  active: boolean;
  badge: number;
  onNavigate: () => void;
}) {
  const Icon = entry.icon;
  const className = cn("sidebar__item", active && "is-active");
  const body = (
    <>
      <span className="sidebar__icon">
        <Icon className="size-4" />
      </span>
      <span className="sidebar__label">{entry.label}</span>
      {badge > 0 && (
        <span className={cn("sidebar__count", entry.moduleId !== "today" && "is-alert")}>
          {badge}
        </span>
      )}
    </>
  );

  if (entry.to === "/") {
    return (
      <Link to="/" className={className} onClick={onNavigate}>
        {body}
      </Link>
    );
  }
  if (entry.to === "/tasks") {
    return (
      <Link to="/tasks" className={className} onClick={onNavigate}>
        {body}
      </Link>
    );
  }
  if (entry.to === "/team") {
    return (
      <Link to="/team" className={className} onClick={onNavigate}>
        {body}
      </Link>
    );
  }
  return (
    <Link
      to="/workspace/$module"
      params={{ module: entry.moduleId }}
      className={className}
      onClick={onNavigate}
    >
      {body}
    </Link>
  );
}

export function CRMShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const {
    getRows,
    tasks,
    attention,
    settings,
    organizationName,
    roleLabel,
    user,
    logout,
    branchScoped,
    myBranch,
    status,
    permissions,
  } = useCRM();
  const moduleAllowed = (id: string) =>
    !permissions || permissions.modules === "*" || permissions.modules.includes(id);
  const [prefsState, setPrefs] = usePrefs();
  const enabledModuleIds = prefsState.sidebarModules ?? DEFAULT_ENABLED_MODULES;
  const visibleModules = modules.filter(
    (m) => moduleAllowed(m.id) && enabledModuleIds.includes(m.id),
  );

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [apiResults, setApiResults] = useState<SearchResponseDto | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [extraPopupOpen, setExtraPopupOpen] = useState(false);
  const [welcomeTourOpen, setWelcomeTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  /** The office every screen is narrowed to. One value, kept in preferences. */
  const branch = prefsState.defaultBranch;
  /** Core destinations are always present; extras only once added. */
  const sidebarGroups = buildSidebarGroups(enabledModuleIds, permissions?.modules ?? "*");
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingGo = useRef<string | null>(null);

  useDensity(prefsState.density);

  // Register browser push notifications once the workspace is ready.
  // Silent no-op when VAPID is not configured or browser doesn't support it.
  usePushNotifications(status === "ready");

  // Setup wizard — shown once to company_admin on first login
  const isAdmin = roleLabel === "Company Admin" || roleLabel === "company_admin";
  const { open: setupOpen, close: closeSetup } = useSetupWizard(status === "ready" && isAdmin);

  // Apply white-label brand color to CSS variables for active states.
  useEffect(() => {
    if (settings.brandPrimaryColor) {
      document.documentElement.style.setProperty("--brand", settings.brandPrimaryColor);
    }
  }, [settings.brandPrimaryColor]);

  // Show the welcome tour once per user — Travo's "1 minute to learn" flow.
  useEffect(() => {
    if (status === "ready" && typeof localStorage !== "undefined") {
      const done = localStorage.getItem("travo.welcome_tour_done");
      if (!done) setWelcomeTourOpen(true);
    }
  }, [status]);

  const isMac = /Mac|iPhone|iPad/.test(
    typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent,
  );

  /* ------------------------------------------------------------- theme */

  useEffect(() => {
    const saved = localStorage.getItem("traveldesk_theme");
    const prefersDark =
      saved === null &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (saved === "dark" || prefersDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const dark = document.documentElement.classList.contains("dark");
    if (dark) {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("traveldesk_theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
      localStorage.setItem("traveldesk_theme", "dark");
    }
  };

  /* ---------------------------------------------------------- counters */

  const counts = useMemo(() => {
    const out: Record<string, { total: number; alert: number }> = {};
    const allowed = modules.filter(
      (m) => !permissions || permissions.modules === "*" || permissions.modules.includes(m.id),
    );
    for (const module of allowed) {
      const rows = getRows(module.id);
      const alertStatuses = ALERT_STATUS[module.id];
      out[module.id] = {
        total: rows.length,
        alert: alertStatuses ? rows.filter((r) => alertStatuses.includes(r.status)).length : 0,
      };
    }
    return out;
  }, [getRows, permissions]);

  /**
   * How many things are waiting for this person right now.
   *
   * Once signed in this reads the server's personal attention feed, so a
   * fifty-person workspace does not tell everyone the same number.
   */
  const needsYou = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const source = attention
      ? {
          tasks: attention.tasks.map(toTask),
          leads: attention.leads.map(toRecordRow),
          bookings: attention.bookings.map(toRecordRow),
          finance: attention.finance.map(toRecordRow),
          visa: attention.visa.map(toRecordRow),
          groups: attention.groups.map(toRecordRow),
          today: attention.today,
        }
      : {
          tasks,
          leads: getRows("leads"),
          bookings: getRows("bookings"),
          finance: getRows("finance"),
          visa: getRows("visa"),
          groups: getRows("groups"),
          today,
        };
    return buildWorklist({ ...source, currency: settings.currency }).length;
  }, [attention, tasks, getRows, settings.currency]);

  const activeTeam = settings.employees.filter((e) => e.active).length;

  const openTasks = tasks.filter((t) => !t.done).length;

  const { data: tray, reload: reloadTray } = useApiQuery(
    () => fetchNotifications(),
    [],
    status === "ready",
  );
  const unread = tray?.unread ?? 0;
  const [notifyOpen, setNotifyOpen] = useState(false);
  const notifyItems = tray?.items ?? [];
  const notifyDerived = tray?.derived ?? [];

  /** Open the record a notification is about, and clear its unread dot. */
  const openNotification = (n: { id: string; read: boolean; moduleId: string | null }) => {
    setNotifyOpen(false);
    if (!n.read) {
      void markNotificationRead(n.id)
        .then(() => reloadTray())
        .catch(() => undefined);
    }
    if (n.moduleId) {
      void navigate({ to: "/workspace/$module", params: { module: n.moduleId } });
    }
  };

  /* --------------------------------------------------------- keyboard */

  /**
   * Open a sidebar destination.
   *
   * Some entries are real standalone screens (Today is `/`, Tasks is
   * `/tasks`, Your team is `/team`) and some are workspace modules. The entry
   * already knows which it is via `to`, so this is the one place that decides
   * — the palette and the "g" shortcuts both go through it, so they can never
   * drift apart.
   */
  const openNavEntry = useCallback(
    (entry: NavEntry) => {
      if (entry.to === "/tasks") void navigate({ to: "/tasks" });
      else if (entry.to === "/team") void navigate({ to: "/team" });
      else if (entry.to === "/") void navigate({ to: "/" });
      else void navigate({ to: "/workspace/$module", params: { module: entry.moduleId } });
    },
    [navigate],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing) return;

      if (event.key === "/") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (event.key === "n" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setCreateOpen(true);
        return;
      }
      if (event.key === "g" && !event.metaKey && !event.ctrlKey) {
        pendingGo.current = "g";
        return;
      }
      if (pendingGo.current === "g") {
        pendingGo.current = null;
        const entry = buildNavEntries(enabledModuleIds, permissions?.modules ?? "*").find(
          (e) => e.go === event.key,
        );
        if (entry) {
          event.preventDefault();
          openNavEntry(entry);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabledModuleIds, permissions, openNavEntry]);

  useEffect(() => {
    if (paletteOpen) {
      window.setTimeout(() => searchRef.current?.focus(), 40);
    } else {
      setQuery("");
      setApiResults(null);
    }
  }, [paletteOpen]);

  /* ------------------------------------------------- server-side search */

  useEffect(() => {
    if (!paletteOpen || query.trim().length < 2 || status !== "ready") {
      setApiResults(null);
      return;
    }
    const handle = window.setTimeout(() => {
      searchWorkspace(query.trim())
        .then(setApiResults)
        .catch(() => setApiResults(null));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query, paletteOpen, status]);

  /* --------------------------------------------------------- palette */

  const closePalette = () => setPaletteOpen(false);

  const groups = useMemo<PaletteGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (text: string) => !q || text.toLowerCase().includes(q);

    const goTo: PaletteGroup = {
      id: "go",
      label: "Go to",
      items: buildNavEntries(enabledModuleIds, permissions?.modules ?? "*")
        .filter((e) => matches(e.label))
        .slice(0, 6)
        .map((e) => ({
          id: `go-${e.id}`,
          title: e.label,
          subtitle: "Open this page",
          icon: <e.icon className="size-4" />,
          run: () => {
            openNavEntry(e);
          },
        })),
    };

    const recordItems: PaletteGroup["items"] = [];
    if (apiResults) {
      for (const group of apiResults.groups) {
        for (const item of group.items) {
          recordItems.push({
            id: `rec-${item.id}`,
            title: item.title,
            subtitle: `${item.subtitle} · ${group.group}`,
            icon: <FileText className="size-4" />,
            run: () => {
              void navigate({ to: "/workspace/$module", params: { module: item.moduleId } });
            },
          });
        }
      }
    } else if (q.length >= 2) {
      for (const module of visibleModules) {
        for (const row of getRows(module.id)) {
          if (!`${row.name} ${row.id} ${row.destination}`.toLowerCase().includes(q)) continue;
          recordItems.push({
            id: `rec-${module.id}-${row.id}`,
            title: row.name,
            subtitle: `${row.id} · ${plainModule(module.name)}`,
            icon: <FileText className="size-4" />,
            run: () => {
              void navigate({ to: "/workspace/$module", params: { module: module.id } });
            },
          });
          if (recordItems.length >= 8) break;
        }
        if (recordItems.length >= 8) break;
      }
    }

    const taskItems: PaletteGroup["items"] = tasks
      .filter((t) => matches(`${t.title} ${t.type} ${t.owner}`))
      .slice(0, 4)
      .map((t) => ({
        id: `task-${t.id}`,
        title: t.title,
        subtitle: `${t.type} · ${t.date}`,
        icon: <CalendarDays className="size-4" />,
        run: () => {
          void navigate({ to: "/tasks" });
        },
      }));

    const peopleItems: PaletteGroup["items"] = settings.employees
      .filter((e) => matches(`${e.name} ${e.role} ${e.branch}`))
      .slice(0, 4)
      .map((e) => ({
        id: `person-${e.name}`,
        title: e.name,
        subtitle: `${e.role} · ${e.branch}`,
        icon: <User className="size-4" />,
        run: () => {
          void navigate({ to: "/team" });
        },
      }));

    const actionList: PaletteGroup["items"] = [
      {
        id: "act-new-lead",
        title: "Add an enquiry",
        subtitle: "Someone asked about a trip",
        icon: <Plus className="size-4" />,
        run: () => void navigate({ to: "/workspace/$module", params: { module: "leads" } }),
      },
      {
        id: "act-new-booking",
        title: "Add a trip",
        subtitle: "Someone is travelling",
        icon: <Ticket className="size-4" />,
        run: () => void navigate({ to: "/workspace/$module", params: { module: "bookings" } }),
      },
      {
        id: "act-invoice",
        title: "Add an invoice",
        subtitle: "Bill a customer",
        icon: <Wallet className="size-4" />,
        run: () => void navigate({ to: "/workspace/$module", params: { module: "finance" } }),
      },
      {
        id: "act-tasks",
        title: "Tasks",
        subtitle: "See what is due",
        icon: <CalendarDays className="size-4" />,
        run: () => void navigate({ to: "/tasks" }),
      },
      {
        id: "act-team",
        title: "Your team",
        subtitle: "Who is on the team, what they can see, how much work they carry",
        icon: <Users className="size-4" />,
        run: () => void navigate({ to: "/team" }),
      },
      {
        id: "act-insights",
        title: "How the business is doing",
        subtitle: "Revenue, trips and what needs attention",
        icon: <TrendingUp className="size-4" />,
        run: () => void navigate({ to: "/insights" }),
      },
      {
        id: "act-assistant",
        title: "Ask the assistant",
        subtitle: "Ask anything about your business",
        icon: <Zap className="size-4" />,
        run: () => void navigate({ to: "/workspace/$module", params: { module: "assistant" } }),
      },
      {
        id: "act-settings",
        title: "Settings",
        subtitle: "Your company, your team, your preferences",
        icon: <Settings2 className="size-4" />,
        run: () => void navigate({ to: "/workspace/$module", params: { module: "settings" } }),
      },
    ].filter((a) => matches(`${a.title} ${a.subtitle}`));

    return [
      goTo,
      { id: "records", label: "Records", items: recordItems },
      { id: "tasks", label: "Tasks", items: taskItems },
      { id: "people", label: "People", items: peopleItems },
      { id: "actions", label: "Actions", items: actionList },
    ].filter((g) => g.items.length > 0);
  }, [
    query,
    apiResults,
    tasks,
    settings.employees,
    getRows,
    navigate,
    openNavEntry,
    visibleModules,
    enabledModuleIds,
  ]);

  /* --------------------------------------------------------- handlers */

  const openModule = useCallback((id: string) => {
    prefs.touch(id);
    setMobileOpen(false);
  }, []);

  const current = findModule(path.split("/")[2] ?? "");
  const activeModuleId = current?.id ?? null;
  const pageTitle = current
    ? plainModule(current.name)
    : path === "/tasks"
      ? "Tasks"
      : path === "/team"
        ? "Your team"
        : path === "/insights"
          ? "How the business is doing"
          : "Today";

  const markAllRead = () => {
    if (status !== "ready" || unread === 0) return;
    void markAllNotificationsRead()
      .then(() => reloadTray())
      .catch(() => undefined);
  };

  const favourites = prefsState.favouriteModules;
  const toggleFavourite = (id: string) => {
    const next = favourites.includes(id) ? favourites.filter((m) => m !== id) : [...favourites, id];
    prefs.set({ favouriteModules: next });
  };

  /** Finishing or skipping the tour marks it done, so it never returns. */
  const closeTour = () => {
    setWelcomeTourOpen(false);
    setTourStep(0);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("travo.welcome_tour_done", "true");
    }
  };

  // Public lead-form pages render standalone — no workspace chrome around them.
  if (path.startsWith("/lead/")) return <div className="public-page">{children}</div>;

  return (
    <div
      className={`shell ${prefsState.sidebarCollapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
    >
      <div className="mesh" aria-hidden="true">
        <i className="mesh__a" />
        <i className="mesh__b" />
        <i className="mesh__c" />
      </div>

      <div className="shell__scrim" onClick={() => setMobileOpen(false)} aria-hidden />

      <a className="skip" href="#main-content">
        Skip to content
      </a>

      {/* ------------------------------------------------------ Sidebar */}
      <nav className="sidebar" aria-label="Workspace sections">
        <Link to="/" className="sidebar__brand">
          {settings.brandLogo && !settings.hideBranding ? (
            <img
              src={settings.brandLogo}
              alt={settings.orgName}
              className="sidebar__mark h-8 w-auto object-contain"
            />
          ) : (
            <span className="sidebar__mark">
              <Compass className="size-[18px]" />
            </span>
          )}
          {!settings.hideBranding && (
            <span className="sidebar__wordmark">{settings.orgName ?? "Traveldesk"}</span>
          )}
        </Link>

        <button
          type="button"
          className="sidebar__search"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search everything"
        >
          <Search className="size-4" />
          <span>Search everything</span>
          <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </button>

        <div className="sidebar__scroll">
          {/* The most important thing sits at the very top. */}
          <Link
            to="/"
            className={`sidebar__now ${path === "/" ? "is-active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <span className="sidebar__now-icon">
              <Sparkles className="size-4" />
            </span>
            <span className="sidebar__now-text">
              <b>What needs you</b>
              <small>
                {needsYou === 0
                  ? "Nothing is waiting"
                  : `${needsYou} thing${needsYou === 1 ? "" : "s"} waiting for you`}
              </small>
            </span>
            {needsYou > 0 && <span className="sidebar__now-count">{needsYou}</span>}
          </Link>

          {/* The fixed core of the CRM, then anything this person added. */}
          {sidebarGroups.map((group) => (
            <div key={group.id} className="sidebar__group">
              <p className="sidebar__grouplabel">{group.label}</p>
              {group.entries.map((entry) => (
                <SidebarItem
                  key={entry.id}
                  entry={entry}
                  active={activeKeyFor(path, activeModuleId) === entry.moduleId}
                  badge={
                    entry.moduleId === "today" ? needsYou : (counts[entry.moduleId]?.alert ?? 0)
                  }
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </div>
          ))}

          <button
            type="button"
            className="sidebar__item"
            onClick={() => setExtraPopupOpen(true)}
            title="Add more modules"
          >
            <span className="sidebar__icon">
              <Plus className="size-4" />
            </span>
            <span className="sidebar__label">Add more</span>
          </button>
        </div>

        <div className="sidebar__foot">
          <Link
            to="/workspace/$module"
            params={{ module: "settings" }}
            className="sidebar__footbtn sidebar__footlink"
            aria-label="Settings"
            title="Settings"
          >
            <Settings2 className="size-4" />
          </Link>
          <IconBtn
            label={prefsState.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setPrefs({ sidebarCollapsed: !prefsState.sidebarCollapsed })}
          >
            {prefsState.sidebarCollapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </IconBtn>
          <IconBtn label="Switch theme" onClick={toggleTheme}>
            {document.documentElement.classList.contains("dark") ? <Sun /> : <Moon />}
          </IconBtn>
          <IconBtn label="How this works" onClick={() => setHelpOpen(true)}>
            <CircleHelp />
          </IconBtn>
        </div>
      </nav>

      {/* ------------------------------------------------------ Topbar */}
      <div className="shell__main">
        <header className="topbar">
          <button
            type="button"
            className="topbar__btn lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>

          <div className="topbar__title">
            <strong>{pageTitle}</strong>
            <span>
              {organizationName} · {roleLabel}
            </span>
          </div>

          <div className="topbar__spacer" />

          <div className="topbar__group">
            {/* An office switcher is only offered when there is a real
                workspace behind it: in the demo there is nothing to narrow,
                and a branch-scoped role only ever sees its own office. */}
            {status === "ready" && settings.branches.length > 1 && !branchScoped ? (
              <BranchSwitch
                value={branch}
                options={settings.branches}
                onChange={(next) => setPrefs({ defaultBranch: next })}
              />
            ) : (
              <span className="branch-switch" title="The office you work from">
                <span className="online-dot" />
                {branchScoped && myBranch ? myBranch : branch}
              </span>
            )}

            <IconBtn label="Search everything" onClick={() => setPaletteOpen(true)}>
              <Search />
            </IconBtn>

            <IconBtn label="How this works" onClick={() => setHelpOpen(true)}>
              <CircleHelp />
            </IconBtn>

            <Popover open={notifyOpen} onOpenChange={setNotifyOpen}>
              <PopoverTrigger
                aria-label="Notifications"
                title="Notifications"
                className={cn(
                  "relative grid size-9 shrink-0 place-items-center rounded-full border border-transparent text-muted transition-all duration-150 hover:bg-well hover:text-foreground",
                  "[&_svg]:size-4",
                )}
              >
                <Bell />
                {unread > 0 && <span className="notify-dot" />}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                  <strong className="text-sm">Notifications</strong>
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllRead()}
                      className="text-xs font-medium text-muted transition-colors hover:text-foreground"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                  {notifyItems.length === 0 && notifyDerived.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-muted">
                      Nothing needs you right now.
                    </p>
                  ) : (
                    <>
                      {notifyItems.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => openNotification(n)}
                          className={cn(
                            "flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-well",
                            !n.read && "bg-well/60",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <strong className="text-sm">{n.title}</strong>
                            {!n.read && <span className="size-1.5 rounded-full bg-destructive" />}
                          </span>
                          {n.body && (
                            <span className="text-xs text-muted line-clamp-2">{n.body}</span>
                          )}
                        </button>
                      ))}
                      {notifyDerived.map((d, i) => (
                        <button
                          key={`derived-${i}`}
                          type="button"
                          onClick={() => {
                            setNotifyOpen(false);
                            void navigate({
                              to: "/workspace/$module",
                              params: { module: d.moduleId },
                            });
                          }}
                          className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-well"
                        >
                          <strong className="text-sm">{d.title}</strong>
                          {d.body && <span className="text-xs text-muted line-clamp-2">{d.body}</span>}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <button
              type="button"
              className="topbar__avatar"
              onClick={() => setProfileOpen(true)}
              aria-label="Your account"
              title={user?.name ?? "Your account"}
            >
              {user?.name
                ? user.name
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()
                : "TD"}
            </button>
          </div>
        </header>

        <main id="main-content">
          {status !== "ready" && (
            <div className="demo-banner" role="status">
              Not connected to the workspace — nothing you add will be saved until the connection is
              back.
            </div>
          )}
          {children}
        </main>
      </div>

      {/* ------------------------------------------------ Command palette */}
      {paletteOpen && (
        <>
          <div className="app-scrim" onClick={closePalette} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search and commands"
            className="fixed left-1/2 top-[8vh] z-[70] w-[min(94vw,680px)] -translate-x-1/2 overflow-hidden rounded-[24px] bg-float shadow-pop"
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Search className="size-[18px] shrink-0 text-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closePalette();
                  if (e.key === "Enter") {
                    const first = groups[0]?.items[0];
                    if (first) {
                      first.run();
                      closePalette();
                    }
                  }
                }}
                placeholder="Search records, people, tasks…  or type &gt; for actions"
                aria-label="Search everything"
                className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-faint"
              />
              <Kbd>Esc</Kbd>
            </div>

            <div className="max-h-[56vh] overflow-y-auto px-2 py-2">
              {groups.length === 0 && (
                <p className="px-4 py-8 text-center text-[13px] text-muted">
                  Nothing matched “{query}”. Try a customer name, a reference like LD-2401, or a
                  page name.
                </p>
              )}
              {groups.map((group) => (
                <Fragment key={group.id}>
                  <div className="filter__label px-3 pt-2 pb-1">{group.label}</div>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-well"
                      onClick={() => {
                        item.run();
                        closePalette();
                      }}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-well text-muted">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-foreground">
                          {item.title}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted">
                          {item.subtitle}
                        </span>
                      </span>
                      <CornerDownLeft className="size-3.5 shrink-0 text-faint" />
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[11px] text-faint">
              <span>Press g then a letter to jump to a page</span>
              <span>Press ? for help</span>
            </div>
          </div>
        </>
      )}

      {/* -------------------------------------------------- Quick create */}
      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add something new"
        description="Pick what you need — the right page opens with the form ready."
        width={560}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { id: "leads", label: "An enquiry", desc: "Someone asked about a trip" },
            { id: "bookings", label: "A trip", desc: "Someone is travelling" },
            { id: "quotations", label: "A price quote", desc: "A proposal for a customer" },
            { id: "finance", label: "An invoice", desc: "Bill a customer" },
            { id: "visa", label: "A visa application", desc: "Travel papers" },
            { id: "support", label: "A customer problem", desc: "Something went wrong" },
          ].map((item) => {
            const meta = modules.find((m) => m.id === item.id);
            if (!meta) return null;
            return (
              <button
                key={item.id}
                type="button"
                className="flex flex-col items-start gap-1 rounded-2xl border border-line bg-glass-2 p-4 text-left transition-all hover:bg-glass-3 hover:shadow-xs"
                onClick={() => {
                  setCreateOpen(false);
                  void navigate({ to: "/workspace/$module", params: { module: item.id } });
                }}
              >
                <span className="text-[13.5px] font-semibold text-foreground">{item.label}</span>
                <span className="text-[11.5px] text-muted">{item.desc}</span>
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* --------------------------------------------------- Profile sheet */}
      <Sheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Your account"
        description={organizationName}
        width={460}
      >
        <div className="flex items-center gap-3">
          <Avatar name={user?.name ?? "You"} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">
              {user?.name ?? "Workspace user"}
            </p>
            <p className="truncate text-[12.5px] text-muted">
              {user?.email ?? settings.supportEmail}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3">
          {[
            ["Role", roleLabel],
            ["Organisation", organizationName],
            ["Branch", branch],
            ["Pages available", `${visibleModules.length}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-glass-2 p-3">
              <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                {k}
              </dt>
              <dd className="mt-1 text-[13px] font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
            Favourite pages
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleModules.slice(0, 12).map((m) => {
              const on = favourites.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleFavourite(m.id)}
                  className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                    on ? "bg-ink text-on-ink" : "bg-well text-muted hover:text-foreground"
                  }`}
                >
                  {on && <Star className="mr-1 inline size-3" />}
                  {plainModule(m.name)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {user?.isPlatformAdmin && (
            <button
              type="button"
              className="h-10 rounded-full bg-pine px-4 text-[13px] font-semibold text-on-pine transition-opacity hover:opacity-90"
              onClick={() => {
                setProfileOpen(false);
                void navigate({ to: "/admin" });
              }}
            >
              Platform admin
            </button>
          )}
          <button
            type="button"
            className="h-10 rounded-full border border-line-2 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-well"
            onClick={() => {
              setProfileOpen(false);
              void logout();
            }}
          >
            Sign out
          </button>
        </div>
      </Sheet>

      {/* ------------------------------------------------------ Extra modules popup */}
      <Sheet
        open={extraPopupOpen}
        onClose={() => setExtraPopupOpen(false)}
        title="Add more modules"
        description="The core CRM is fixed in the sidebar (whatever your role can open). Add the extras your agency actually needs — they stay until you remove them."
        width={560}
      >
        <div className="space-y-3">
          <p className="text-[12.5px] text-muted">
            Always there: Today, Enquiries, Customers, Packages, Quotes, Bookings, money, Tasks,
            Conversations, Reports and Your team.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXTRA_MODULE_IDS.map((id) => {
              const m = modules.find((mod) => mod.id === id);
              if (!m) return null;
              // Never offer a screen this person's role cannot open.
              if (!moduleAllowed(id)) return null;
              const isEnabled = enabledModuleIds.includes(id);
              const Icon = ICONS[id] ?? Package;
              return (
                <button
                  key={id}
                  type="button"
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isEnabled
                      ? "border-ink bg-ink/5 text-foreground"
                      : "border-line bg-white text-foreground hover:bg-glass-2 hover:border-ink"
                  }`}
                  title={EXTRA_HINTS[id] ?? plainModule(m.name)}
                  onClick={() => {
                    if (isEnabled) {
                      setPrefs({
                        sidebarModules: enabledModuleIds.filter((mid) => mid !== id),
                      });
                    } else {
                      setPrefs({
                        sidebarModules: [...enabledModuleIds, id],
                      });
                    }
                  }}
                >
                  <span className={`size-4 shrink-0 ${isEnabled ? "text-ink" : "text-muted"}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {plainModule(m.name)}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {EXTRA_HINTS[id] ?? ""}
                    </span>
                  </span>
                  <span className="ml-auto text-[11px] text-muted">
                    {isEnabled ? "Added" : "Add to sidebar"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-line">
            <button
              type="button"
              onClick={() => setExtraPopupOpen(false)}
              className="w-full py-2.5 rounded-xl border border-line text-[13px] font-medium hover:bg-glass-2"
            >
              Done
            </button>
          </div>
        </div>
      </Sheet>

      {/* ------------------------------------------------------ Help panel */}
      <Sheet
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={
          activeModuleId
            ? `How to use ${activeModuleId.charAt(0).toUpperCase() + activeModuleId.slice(1)}`
            : "How to use Traveldesk"
        }
        description="Tips, shortcuts and answers — just for this screen."
        width={520}
      >
        <ContextualHelp moduleId={activeModuleId} isMac={isMac} />
      </Sheet>

      {/* ------------------------------------------------------ Welcome tour */}
      <Sheet
        open={welcomeTourOpen}
        onClose={() => closeTour()}
        title="Welcome to Travo CRM"
        description="Five steps to run your travel business. You will get it in under a minute."
        width={560}
      >
        <TourStep
          step={tourStep + 1}
          total={TOUR_STEPS.length}
          title={TOUR_STEPS[tourStep]!.title}
          body={TOUR_STEPS[tourStep]!.body}
          tip={TOUR_STEPS[tourStep]!.tip}
          icon={TOUR_STEPS[tourStep]!.icon}
          {...(TOUR_STEPS[tourStep]!.action ? { action: TOUR_STEPS[tourStep]!.action } : {})}
          cta={tourStep === TOUR_STEPS.length - 1 ? "Start using Traveldesk" : "Next"}
          isLast={tourStep === TOUR_STEPS.length - 1}
          onNext={() => {
            if (tourStep === TOUR_STEPS.length - 1) closeTour();
            else setTourStep((s) => s + 1);
          }}
          {...(tourStep > 0 ? { onBack: () => setTourStep((s) => s - 1) } : {})}
          onSkip={closeTour}
        />
      </Sheet>

      {/* ------------------------------------------------------ Setup Wizard (first-time admin) */}
      <SetupWizard open={setupOpen} onClose={closeSetup} />

      {/* ------------------------------------------------------ Mobile bottom dock */}
      <nav className="mobile-dock" aria-label="Bottom navigation">
        {[
          { id: "leads", icon: <UserPlus className="size-5" />, label: "Enquiries" },
          { id: "bookings", icon: <Ticket className="size-5" />, label: "Trips" },
          { id: "quotations", icon: <FileText className="size-5" />, label: "Quotes" },
          { id: "finance", icon: <Wallet className="size-5" />, label: "Money" },
          { id: "customers", icon: <Users className="size-5" />, label: "Customers" },
        ].map((item) => {
          const active = activeModuleId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`dock__btn ${active ? 'aria-current="page"' : ""}`}
              onClick={() => {
                setMobileOpen(false);
                void navigate({ to: "/workspace/$module", params: { module: item.id } });
              }}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              {item.icon}
              <span className="dock__tip">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function TourStep({
  step,
  total,
  title,
  body,
  tip,
  icon,
  action,
  cta,
  onNext,
  onBack,
  onSkip,
  isLast = false,
}: {
  step: number;
  total: number;
  title: string;
  body: string;
  tip?: string;
  icon: React.ReactNode;
  action?: { label: string; to: string };
  cta: string;
  onNext: () => void;
  onBack?: (() => void) | undefined;
  onSkip?: (() => void) | undefined;
  isLast?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Step {step} of {total}
        </span>
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-2 rounded-full transition-colors ${
                i < step - 1 ? "bg-pine" : i === step - 1 ? "bg-pine/60" : "bg-well"
              }`}
              aria-hidden
            />
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-pine/10 text-pine">
          {icon}
        </span>
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight text-foreground">{title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{body}</p>
        </div>
      </div>

      {tip && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          <Zap className="size-3.5 text-amber-500 shrink-0" />
          <p className="text-[12px] text-amber-800 font-medium">{tip}</p>
        </div>
      )}

      {action && (
        <button
          type="button"
          onClick={() => {
            void navigate({ to: action.to } as Parameters<typeof navigate>[0]);
          }}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-pine hover:underline"
        >
          {action.label} <ArrowRight className="size-3.5" />
        </button>
      )}

      <div className="mt-4 pt-3 border-t border-line">
        <div className="flex gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-line px-4 py-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-glass-2"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className={`flex-1 rounded-xl px-4 py-3 text-[13px] font-semibold transition-colors ${
              isLast
                ? "bg-ink text-on-ink hover:opacity-90"
                : "border border-line text-foreground hover:bg-glass-2"
            }`}
          >
            {isLast ? cta : cta + " →"}
          </button>
        </div>
        {!isLast && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 w-full py-2 text-[12px] font-medium text-muted hover:text-foreground"
          >
            Skip — I will explore on my own
          </button>
        )}
      </div>
    </div>
  );
}
