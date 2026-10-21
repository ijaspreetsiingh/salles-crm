import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Calendar,
  Inbox,
  Moon,
  Sun,
  Plus,
  Search,
  Send,
  Share2,
  Smartphone,
  Star,
  Upload,
  Check,
  X,
  PhoneOff,
  Mic,
  MicOff,
  DollarSign,
  UserCheck,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./ui";
import { me, deals, customers, events } from "@/lib/crm-data";
import { cn } from "@/lib/utils";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { to: "/", label: "Overview", hint: "Your priorities and sales health" },
  { to: "/pipeline", label: "Pipeline", hint: "Move opportunities forward" },
  { to: "/customers", label: "Customers", hint: "Accounts and contacts" },
  { to: "/schedule", label: "Schedule", hint: "Calls, meetings and follow-ups" },
  { to: "/finance", label: "Finance", hint: "Invoices and collections" },
  { to: "/growth", label: "Growth", hint: "Team results and targets" },
  { to: "/projects", label: "Projects", hint: "Customer handoffs and delivery" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [favsOpen, setFavsOpen] = useState(false);
  const [newRecordOpen, setNewRecordOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Call timer effect
  useEffect(() => {
    let interval: any;
    if (callActive) {
      interval = setInterval(() => {
        setCallSeconds((s) => s + 1);
      }, 1000);
    } else {
      setCallSeconds(0);
    }
    return () => clearInterval(interval);
  }, [callActive]);

  // Initialize theme
  useEffect(() => {
    const isSavedDark =
      localStorage.getItem("rapport_theme") === "dark" ||
      document.documentElement.getAttribute("data-theme") === "dark";
    if (isSavedDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      } else if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
      localStorage.setItem("rapport_theme", "dark");
      toast.success("Dark theme enabled");
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("rapport_theme", "light");
      toast.success("Light theme enabled");
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard?.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    }
  };

  const handleExportCSV = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Name,Company,Role,Segment,Pipeline", ...customers.map((c) => `${c.name},${c.company},${c.role},${c.segment},${c.pipeline ?? 0}`)].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "rapport_customers.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported customer directory as CSV");
  };

  const formatCallTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <>
      {/* Ambient Floating Mesh Glows (Rapport signature warm orbs) */}
      <div className="mesh" aria-hidden="true">
        <i className="mesh__a" />
        <i className="mesh__b" />
        <i className="mesh__c" />
      </div>

      <div className="app-container min-h-screen text-foreground transition-colors duration-400">
        {/* Floating Dock (Exact match to Image 6) */}
        <nav className="dock hidden xl:flex" aria-label="Quick actions">
          {/* Search (⌘K) */}
          <button
            type="button"
            className="dock__btn"
            onClick={() => setCommandOpen(true)}
            aria-label="Search (⌘K)"
          >
            <Search className="size-4.5" />
            <span className="dock__tip">
              Search <kbd>⌘K</kbd>
            </span>
          </button>

          {/* Create new */}
          <button
            type="button"
            className="dock__btn"
            onClick={() => setNewRecordOpen(true)}
            aria-label="Create new"
          >
            <Plus className="size-4.5" />
            <span className="dock__tip">Create</span>
          </button>

          {/* Favourite customers */}
          <button
            type="button"
            className="dock__btn"
            onClick={() => setFavsOpen(true)}
            aria-label="Favourite customers"
          >
            <Star className="size-4.5" />
            <span className="dock__tip">Favourites</span>
          </button>

          {/* Today's agenda */}
          <button
            type="button"
            className="dock__btn"
            onClick={() => setTodayOpen(true)}
            aria-label="Today's agenda"
          >
            <Calendar className="size-4.5" />
            <span className="dock__tip">Today</span>
          </button>

          {/* Log a call */}
          <button
            type="button"
            className="dock__btn"
            onClick={() => {
              setCallActive(true);
              toast.info("Connecting call with Elena Rostova (Acme Corp)...");
            }}
            aria-label="Log a call"
          >
            <Smartphone className="size-4.5" />
            <span className="dock__tip">Log a call</span>
          </button>

          {/* Compose message */}
          <button
            type="button"
            className="dock__btn"
            onClick={() => {
              toast.info("Compose email", { description: "Outreach template ready." });
            }}
            aria-label="Compose email"
          >
            <Send className="size-4.5" />
            <span className="dock__tip">Compose</span>
          </button>

          {/* Copy link */}
          <button
            type="button"
            className="dock__btn"
            onClick={handleCopyLink}
            aria-label="Copy link to this page"
          >
            <Share2 className="size-4.5" />
            <span className="dock__tip">Copy link</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            className="dock__btn"
            onClick={handleExportCSV}
            aria-label="Export customers as CSV"
          >
            <Upload className="size-4.5" />
            <span className="dock__tip">Export CSV</span>
          </button>

          <span className="dock__sep" aria-hidden="true" />

          {/* Settings / Shortcuts */}
          <button
            type="button"
            className="dock__btn"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard Shortcuts"
          >
            <HelpCircle className="size-4.5" />
            <span className="dock__tip">Shortcuts <kbd>?</kbd></span>
          </button>

          {/* Theme Switcher */}
          <button
            type="button"
            className="dock__btn"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? <Sun className="size-4.5 text-sun" /> : <Moon className="size-4.5" />}
            <span className="dock__tip">Theme</span>
          </button>
        </nav>

        {/* Main Application Content Container */}
        <div className="mx-auto max-w-[1840px] px-4 pb-20 sm:px-6 xl:pl-28 xl:pr-8">
          {/* Top Header (Exact match to Image 6) */}
          <header className="flex flex-wrap items-center justify-between gap-3 py-5.5">
            {/* Brand Logo */}
            <Link to="/" className="flex items-center gap-2.5 transition-transform active:scale-95">
              <span className="grid size-9.5 place-items-center rounded-xl bg-ink text-lg font-bold text-on-ink shadow-xs">
                R
              </span>
              <span className="text-[21px] font-bold tracking-tight text-foreground">rapport</span>
            </Link>

            {/* Clean Navigation Tabs (Exact match to Image 6) */}
            <nav className="crm-nav flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="CRM sections">
              {navItems.map((n) => {
                const isActive =
                  n.to === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(n.to);

                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    title={n.hint}
                    aria-label={`${n.label}: ${n.hint}`}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-semibold transition-colors sm:px-4",
                      isActive
                        ? "bg-ink text-on-ink shadow-xs"
                        : "text-foreground hover:bg-well",
                    )}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>

            {/* Top Right Buttons (Exact match to Image 6) */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="hidden h-10 items-center gap-2 rounded-full border border-rim bg-glass-2 px-3.5 text-sm text-muted shadow-xs transition-colors hover:bg-glass-3 sm:flex"
                aria-label="Search CRM"
              >
                <Search className="size-4" />
                <span>Search</span>
                <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
              </button>
              <button
                type="button"
                onClick={() => setNewRecordOpen(true)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-semibold text-on-ink shadow-xs transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Create</span>
                <span className="sm:hidden">New</span>
              </button>
              {/* Activity Button */}
              <button
                onClick={() => toast.info("Activity Feed", { description: "Recent team updates." })}
                className="grid size-10 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs transition-transform hover:scale-105 active:scale-95"
                title="Activity"
                aria-label="Activity"
              >
                <Inbox className="size-4 text-foreground" />
              </button>

              {/* Notifications Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="relative grid size-10 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs transition-transform hover:scale-105 active:scale-95"
                    title="Notifications"
                    aria-label="Notifications"
                  >
                    <Bell className="size-4 text-foreground" />
                    <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-tomato ring-2 ring-background" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 rounded-3xl p-3 shadow-2xl backdrop-blur-2xl">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-sm font-bold">Notifications</span>
                    <button
                      onClick={() => toast.success("Marked all read")}
                      className="text-xs text-muted hover:text-foreground"
                    >
                      Mark all read
                    </button>
                  </div>
                  <DropdownMenuSeparator />
                  <div className="space-y-1 py-1 text-xs">
                    <div className="rounded-2xl p-2 hover:bg-well transition-colors">
                      <p className="font-semibold text-foreground">Acme Corp signed contract 🎉</p>
                      <p className="text-muted">Enterprise tier $184,000 ARR has been approved.</p>
                      <span className="text-[10px] text-faint">5m ago</span>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Avatar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex size-10 items-center justify-center rounded-full border border-rim bg-glass-2 p-0.5 shadow-xs transition-transform hover:scale-105 active:scale-95">
                    <Avatar person={me} size={36} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-3xl p-2.5 shadow-2xl backdrop-blur-2xl">
                  <div className="flex items-center gap-3 p-2">
                    <Avatar person={me} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm leading-tight text-foreground">{me.name}</p>
                      <p className="truncate text-xs text-muted">{me.role}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer gap-2 rounded-xl py-2">
                    {isDark ? <Sun className="size-4 text-sun" /> : <Moon className="size-4" />}
                    <span>{isDark ? "Light theme" : "Dark theme"}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShortcutsOpen(true)} className="cursor-pointer gap-2 rounded-xl py-2">
                    <HelpCircle className="size-4" />
                    <span>Keyboard shortcuts</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-glass-2 px-3.5 py-2 text-xs text-muted" role="note">
            <span className="rounded-full bg-butter px-2 py-0.5 font-bold text-on-butter">Preview</span>
            <span>Example CRM data only. Changes in this design preview do not sync to ERPNext.</span>
          </div>

          {/* Page Route Content */}
          <main className="animate-in fade-in duration-300">{children}</main>
        </div>

        {/* Live Callbar (Bottom floating pill) */}
        {callActive && (
          <div className="callbar" role="status" aria-live="polite">
            <div className="callbar__who">
              <span className="callbar__ring" />
              <Avatar person={customers[0]} size={36} className="ring-2 ring-white/60" />
            </div>
            <div className="callbar__text">
              <b>Elena Rostova (Acme Corp)</b>
              <small>{formatCallTime(callSeconds)} · Connected via Cloud Voice</small>
            </div>
            <button
              onClick={() => {
                setIsMuted(!isMuted);
                toast.info(isMuted ? "Microphone unmuted" : "Microphone muted");
              }}
              className="grid size-9 place-items-center rounded-full border border-white/30 transition-colors hover:bg-white/20"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
            <button
              onClick={() => {
                setCallActive(false);
                toast.success(`Call ended with Elena (${formatCallTime(callSeconds)})`);
              }}
              className="callbar__end flex items-center gap-1.5"
            >
              <PhoneOff className="size-3.5" /> End call
            </button>
          </div>
        )}

        {/* Command Palette (⌘K) */}
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Search customers, deals, pages…" />
          <CommandList className="max-h-96">
            <CommandEmpty>No matching records or pages found.</CommandEmpty>

            <CommandGroup heading="Pages">
              {navItems.map((n) => (
                <CommandItem
                  key={n.to}
                  onSelect={() => {
                    navigate({ to: n.to });
                    setCommandOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Search className="mr-2 size-4 text-muted" />
                  <span>Go to {n.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Deals">
              {deals.slice(0, 5).map((d) => (
                <CommandItem
                  key={d.id}
                  onSelect={() => {
                    navigate({ to: "/pipeline" });
                    setCommandOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <DollarSign className="mr-2 size-4 text-pine" />
                  <span className="font-semibold">{d.title}</span>
                  <span className="ml-2 text-xs text-muted">{d.company} · ${d.value.toLocaleString()}</span>
                  <CommandShortcut>{d.stage}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Customers">
              {customers.slice(0, 5).map((c) => (
                <CommandItem
                  key={c.slug}
                  onSelect={() => {
                    navigate({ to: "/customers" });
                    setCommandOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <UserCheck className="mr-2 size-4 text-butter" />
                  <span>{c.name}</span>
                  <span className="ml-2 text-xs text-muted">{c.company}</span>
                  <CommandShortcut>{c.segment}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        {/* Today's Agenda Dialog */}
        <Dialog open={todayOpen} onOpenChange={setTodayOpen}>
          <DialogContent className="max-w-md rounded-3xl p-6 shadow-2xl backdrop-blur-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Today's Agenda</DialogTitle>
              <DialogDescription>Calls, meetings and closing follow-ups for today.</DialogDescription>
            </DialogHeader>

            <div className="mt-3 space-y-2.5">
              {events
                .filter((e) => e.day === 17 && e.month === 0)
                .map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-2xl border border-line bg-glass-2 p-3"
                  >
                    <div>
                      <p className="font-semibold text-sm text-foreground">{ev.title}</p>
                      <p className="text-xs text-muted">{ev.company} · {ev.time}</p>
                    </div>
                    <span className="rounded-full bg-well px-2.5 py-0.5 text-xs font-semibold">
                      {ev.kind}
                    </span>
                  </div>
                ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Favourites Dialog */}
        <Dialog open={favsOpen} onOpenChange={setFavsOpen}>
          <DialogContent className="max-w-md rounded-3xl p-6 shadow-2xl backdrop-blur-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Star className="size-5 fill-butter text-butter" />
                <DialogTitle className="text-xl font-bold">Favourite Accounts</DialogTitle>
              </div>
              <DialogDescription>Pinned VIP customers and critical negotiations.</DialogDescription>
            </DialogHeader>

            <div className="mt-3 space-y-2">
              {customers.slice(0, 5).map((c) => (
                <div
                  key={c.slug}
                  className="flex items-center justify-between rounded-2xl border border-line bg-glass-2 p-3 transition-colors hover:bg-well"
                >
                  <div className="flex items-center gap-3">
                    <Avatar person={c} size={36} />
                    <div>
                      <p className="font-bold text-sm text-foreground">{c.name}</p>
                      <p className="text-xs text-muted">{c.company} · {c.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setFavsOpen(false);
                      navigate({ to: "/customers" });
                    }}
                    className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-on-ink"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Quick Create Dialog */}
        <Dialog open={newRecordOpen} onOpenChange={setNewRecordOpen}>
          <DialogContent className="max-w-md rounded-3xl p-6 shadow-2xl backdrop-blur-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Create New Record</DialogTitle>
              <DialogDescription>Choose what you need. The relevant CRM section will open so you can enter the details.</DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { title: "New Deal", desc: "Open the pipeline to add an opportunity", action: () => navigate({ to: "/pipeline" }) },
                { title: "New Customer", desc: "Open the directory to add an account", action: () => navigate({ to: "/customers" }) },
                { title: "New Task", desc: "Open the schedule to add a follow-up", action: () => navigate({ to: "/schedule" }) },
                { title: "New Invoice", desc: "Open finance to record an invoice", action: () => navigate({ to: "/finance" }) },
              ].map((item) => (
                <button
                  key={item.title}
                  onClick={() => {
                    setNewRecordOpen(false);
                    item.action();
                  }}
                  className="flex flex-col items-start rounded-2xl border border-line bg-glass-2 p-4 text-left transition-all hover:bg-well hover:scale-[1.02] active:scale-98"
                >
                  <span className="font-bold text-sm text-foreground">{item.title}</span>
                  <span className="text-xs text-muted">{item.desc}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Keyboard Shortcuts Dialog */}
        <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <DialogContent className="max-w-md rounded-3xl p-6 shadow-2xl backdrop-blur-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Keyboard Shortcuts</DialogTitle>
              <DialogDescription>Navigate Rapport with speed and precision.</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-2 text-sm">
              {[
                ["⌘ K  or  /", "Open Search Finder"],
                ["N", "Create Record"],
                ["T", "New Task"],
                ["G then O", "Go to Overview"],
                ["G then P", "Go to Pipeline"],
                ["G then C", "Go to Customers"],
                ["Esc", "Close Dialogs / Card Focus"],
                ["?", "This List"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between border-b border-line py-2">
                  <span className="text-muted">{desc}</span>
                  <kbd className="rounded-lg border border-line-2 bg-glass-2 px-2 py-0.5 font-mono text-xs font-semibold">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

export type Stat = { icon: ReactNode; value: ReactNode; label: string; badge?: ReactNode };

const pageDescriptions: Record<string, string> = {
  Overview: "Start here: review what needs attention, then follow the next step for each deal.",
  Pipeline: "Track each opportunity from qualification to close. Move a deal when its stage changes.",
  Directory: "Find an account, see its relationship context, and open the next follow-up.",
  Schedule: "Plan calls, meetings, tasks, and follow-ups in one shared agenda.",
  Invoices: "Review invoice status and collection progress linked to customer accounts.",
  Performance: "See team results, conversion trends, and progress toward sales targets.",
  Projects: "Follow customer work after a deal is won and keep handoffs visible.",
};

export function PageHeader({ title, stats, right }: { title: [string, string]; stats: Stat[]; right?: ReactNode }) {
  const description = pageDescriptions[title[1].trim()] ?? "Review the key details and choose a clear next action.";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-12 gap-y-5 mb-7">
      <div className="flex flex-wrap items-center gap-x-12 gap-y-4">
        <div className="max-w-72">
          <h1 className="text-[34px] font-semibold leading-[1.04] tracking-tight sm:text-[38px] text-foreground">
            {title[0]}
            <br />
            {title[1]}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-3.5 transition-transform duration-200 hover:-translate-y-0.5">
              <span className="grid size-11.5 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs [&_svg]:size-5">
                {s.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
                  {s.value}
                  {s.badge}
                </div>
                <div className="max-w-44 text-xs leading-tight text-muted">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Badge({ tone = "forest", children }: { tone?: "forest" | "sun" | "ember" | "light"; children: ReactNode }) {
  const map = {
    forest: "bg-pine text-on-pine",
    sun: "bg-butter text-on-butter font-bold",
    ember: "bg-tomato text-on-tomato font-bold",
    light: "bg-glass-2 text-foreground border border-line",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide", map[tone])}>
      {children}
    </span>
  );
}
