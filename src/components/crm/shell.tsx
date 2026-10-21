import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Compass,
  CornerDownLeft,
  FileText,
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
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useCRM } from "@/lib/crm/store";
import { findModule, modules } from "@/lib/crm/catalog";
import { goShortcuts, navEntries, navGroups } from "@/lib/crm/nav";
import { plainModule } from "@/lib/crm/language";
import { buildWorklist } from "@/lib/crm/worklist";
import { prefs, useDensity, usePrefs } from "@/lib/crm/prefs";
import { useApiQuery } from "@/lib/api/hooks";
import {
  fetchNotifications,
  markAllNotificationsRead,
  searchWorkspace,
  type SearchResponseDto,
} from "@/lib/api/modules";
import { Avatar, IconBtn, Kbd, Sheet } from "./ui";

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

export function CRMShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { getRows, tasks, settings, organizationName, roleLabel, user, logout, status } = useCRM();
  const [prefsState, setPrefs] = usePrefs();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [apiResults, setApiResults] = useState<SearchResponseDto | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [branch, setBranch] = useState(prefsState.defaultBranch);
  const [openGroups, setOpenGroups] = useState<string[]>(() => navGroups.map((g) => g.id));

  const searchRef = useRef<HTMLInputElement>(null);
  const pendingGo = useRef<string | null>(null);

  useDensity(prefsState.density);

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
    for (const module of modules) {
      const rows = getRows(module.id);
      const alertStatuses = ALERT_STATUS[module.id];
      out[module.id] = {
        total: rows.length,
        alert: alertStatuses ? rows.filter((r) => alertStatuses.includes(r.status)).length : 0,
      };
    }
    return out;
  }, [getRows]);

  /** How many things are waiting for this person right now. */
  const needsYou = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return buildWorklist({
      tasks,
      leads: getRows("leads"),
      bookings: getRows("bookings"),
      finance: getRows("finance"),
      visa: getRows("visa"),
      currency: settings.currency,
      today,
    }).length;
  }, [tasks, getRows, settings.currency]);

  const openTasks = tasks.filter((t) => !t.done).length;

  const { data: tray, reload: reloadTray } = useApiQuery(
    () => fetchNotifications(),
    [],
    status === "ready",
  );
  const unread = tray?.unread ?? 0;

  /* --------------------------------------------------------- keyboard */

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
        const destination = goShortcuts[event.key];
        pendingGo.current = null;
        if (destination) {
          event.preventDefault();
          void navigate({ to: "/workspace/$module", params: { module: destination } });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

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
      items: navEntries
        .filter((e) => matches(e.label))
        .slice(0, 6)
        .map((e) => ({
          id: `go-${e.id}`,
          title: e.label,
          subtitle: "Open this page",
          icon: <e.icon className="size-4" />,
          run: () => {
            void navigate({ to: "/workspace/$module", params: { module: e.id } });
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
      for (const module of modules) {
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
          void navigate({ to: "/workspace/$module", params: { module: "settings" } });
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
  }, [query, apiResults, tasks, settings.employees, getRows, navigate]);

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
          <span className="sidebar__mark">
            <Compass className="size-[18px]" />
          </span>
          <span className="sidebar__wordmark">
            travel<span>desk</span>
          </span>
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

          <Link
            to="/tasks"
            className={`sidebar__item ${path === "/tasks" ? "is-active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <span className="sidebar__icon">
              <CalendarDays className="size-4" />
            </span>
            <span className="sidebar__label">Tasks</span>
            {openTasks > 0 && <span className="sidebar__count">{openTasks}</span>}
          </Link>

          {navGroups.map((group) => {
            const expanded = openGroups.includes(group.id);
            const alerts = group.entries.reduce(
              (sum, entry) => sum + (counts[entry.id]?.alert ?? 0),
              0,
            );
            return (
              <div className="sidebar__group" key={group.id}>
                <button
                  type="button"
                  className="sidebar__grouplabel"
                  aria-expanded={expanded}
                  onClick={() =>
                    setOpenGroups((prev) =>
                      prev.includes(group.id)
                        ? prev.filter((g) => g !== group.id)
                        : [...prev, group.id],
                    )
                  }
                >
                  <ChevronDown className="size-3" />
                  <span>{group.label}</span>
                  {alerts > 0 && <span className="sidebar__grouptotal">{alerts}</span>}
                </button>
                {expanded &&
                  group.entries.map((entry) => {
                    const count = counts[entry.id];
                    return (
                      <Link
                        key={entry.id}
                        to="/workspace/$module"
                        params={{ module: entry.id }}
                        className={`sidebar__item ${activeModuleId === entry.id ? "is-active" : ""}`}
                        onClick={() => openModule(entry.id)}
                        title={entry.label}
                      >
                        <span className="sidebar__icon">
                          <entry.icon className="size-4" />
                        </span>
                        <span className="sidebar__label">{entry.label}</span>
                        {count?.alert ? (
                          <span className="sidebar__count is-alert">{count.alert}</span>
                        ) : null}
                      </Link>
                    );
                  })}
              </div>
            );
          })}
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
            <button type="button" className="branch-switch" title="Filter everything by branch">
              <span className="online-dot" />
              {branch}
              <ChevronDown className="size-3.5" />
            </button>

            <IconBtn label="Search everything" onClick={() => setPaletteOpen(true)}>
              <Search />
            </IconBtn>

            <IconBtn label="How this works" onClick={() => setHelpOpen(true)}>
              <CircleHelp />
            </IconBtn>

            <IconBtn
              label="Notifications"
              onClick={() => {
                void navigate({ to: "/workspace/$module", params: { module: "inbox" } });
                markAllRead();
              }}
            >
              <Bell />
              {unread > 0 && <span className="notify-dot" />}
            </IconBtn>

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

        <main id="main-content">{children}</main>
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
            ["Pages available", `${modules.length}`],
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
            {modules.slice(0, 12).map((m) => {
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

      {/* ------------------------------------------------------ Help panel */}
      <Sheet
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="How to use Traveldesk"
        description="You do not need to learn much. Here is the whole thing."
        width={520}
      >
        <div className="space-y-5">
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-faint">
              The idea
            </h3>
            <ul className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-foreground">
              <li>
                <b className="font-semibold">Today</b> is the home page. It lists the things that
                need you, in order. Start there every morning.
              </li>
              <li>
                <b className="font-semibold">The sidebar</b> is every part of the business, in five
                short groups: selling, trips, working, money and tools.
              </li>
              <li>
                <b className="font-semibold">Search</b> finds anything — a customer, a reference
                like LD-2401, or a task.
              </li>
              <li>
                <b className="font-semibold">Every record</b> shows the same way: what it is, what
                it is worth, who owns it, and what to do next.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-faint">
              Keyboard
            </h3>
            <div className="mt-2 grid gap-1.5">
              {[
                [[isMac ? "⌘K" : "Ctrl K"], "Find anything"],
                [["/"], "Find anything"],
                [["n"], "Add something new"],
                [["g", "l"], "Go to enquiries"],
                [["g", "b"], "Go to trips"],
                [["g", "F"], "Go to money"],
                [["g", "r"], "Go to numbers"],
                [["g", "S"], "Go to settings"],
                [["?"], "Open this panel"],
                [["Esc"], "Close any panel"],
              ].map(([keys, description]) => (
                <div
                  key={description as string}
                  className="flex items-center justify-between gap-4 rounded-xl border border-line bg-glass-2 px-3.5 py-2.5"
                >
                  <span className="text-[12.5px] text-muted">{description}</span>
                  <span className="flex shrink-0 gap-1">
                    {(keys as string[]).map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </Sheet>
    </div>
  );
}
