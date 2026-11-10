import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  Clock,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  User,
  X,
  AtSign,
  Inbox,
  Reply,
  Smile,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  fetchConversations,
  fetchConversation,
  fetchConversationChannels,
  fetchChannelStatus,
  createConversation,
  sendConversationMessage,
  updateConversation,
  fetchMessageTemplates,
  type ConversationDto,
  type MessageDto,
} from "@/lib/api/modules";
import { useCRM } from "@/lib/crm/store";
import { takeCommsFocus, type CommsFocus } from "@/lib/crm/handoff";
import { useApiQuery } from "@/lib/api/hooks";
import { Avatar } from "./ui";
import { Status } from "./common";
import { errorMessage } from "@/lib/api/client";
import { useSocket } from "@/hooks/useSocket";

/* -------------------------------------------------------------------------
   Communications — WhatsApp-style real-time inbox.

   Left panel  : conversation list with live unread badge, channel filters.
   Right panel : full message thread — bubbles, delivery ticks, timestamps,
                 template picker, compose box, mark-resolved.

   Real-time: every inbound WhatsApp / email message arrives via socket.io
   so agents never need to hit Refresh.
   ------------------------------------------------------------------------- */

// ── colours & icons ─────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  WhatsApp: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Email: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Phone: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  Instagram: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  "Web chat": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  "Shared inbox": "bg-slate-100 text-slate-800 dark:bg-slate-800/30 dark:text-slate-400",
};

const channelBadge = (ch: string) => CHANNEL_COLORS[ch] ?? "bg-slate-100 text-slate-800";

const ChannelIcon = ({ channel }: { channel: string }) => {
  if (channel === "WhatsApp") return <Smartphone className="size-3.5" />;
  if (channel === "Email") return <Mail className="size-3.5" />;
  if (channel === "Phone") return <Phone className="size-3.5" />;
  if (channel === "Instagram") return <AtSign className="size-3.5" />;
  return <MessageCircle className="size-3.5" />;
};

// Delivery status tick — same visual language as WhatsApp
const DeliveryTick = ({ delivery }: { delivery?: string | null }) => {
  if (!delivery || delivery === "queued") return <Clock className="size-3 opacity-60" />;
  if (delivery === "failed") return <X className="size-3 text-red-400" />;
  if (delivery === "read") return <CheckCheck className="size-3 text-blue-400" />;
  if (delivery === "delivered") return <CheckCheck className="size-3 opacity-70" />;
  // sent
  return <Check className="size-3 opacity-70" />;
};

// ── built-in professional templates ─────────────────────────────────────────

const PROFESSIONAL_TEMPLATES = [
  {
    name: "Quotation follow-up",
    channel: "Email",
    body: "Hi {name},\n\nI wanted to make sure my proposal reached you and to check whether the dates, hotels and pace feel right.\n\nIf you would like any change, let me know and I will send a revised plan, usually the same day.\n\nWarm regards,\n{agent}",
  },
  {
    name: "Booking confirmed",
    channel: "Email",
    body: "Hi {name},\n\nGood news — your booking is confirmed. Please check the traveller names and dates in the attached voucher and reply to confirm.\n\nWarm regards,\n{agent}",
  },
  {
    name: "Payment reminder",
    channel: "Email",
    body: "Hi {name},\n\nA gentle reminder that the balance for your trip is due. You can pay via the link in your invoice or by bank transfer.\n\nWarm regards,\n{agent}",
  },
  {
    name: "Docs needed",
    channel: "WhatsApp",
    body: "Hi {name}, to move your visa forward I need clear photos of each traveller's passport (first + last page) and one recent photograph. Send them here.",
  },
  {
    name: "Trip check-in",
    channel: "WhatsApp",
    body: "Hi {name}, just checking you have everything — tickets, visa and hotel voucher are in your email. Safe travels! Message me here any time.",
  },
  {
    name: "Thank you & feedback",
    channel: "Email",
    body: "Hi {name},\n\nI hope you are back home rested. It would help us a lot to know what worked well and what we could do better next time.\n\nWarm regards,\n{agent}",
  },
];

// ── component ─────────────────────────────────────────────────────────────

type CommsTab = "all" | "whatsapp" | "email" | "phone";

export function Communications() {
  const { settings, status, user, getRows } = useCRM();
  const customers = getRows("customers");

  // ── filters
  const [tab, setTab] = useState<CommsTab>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<CommsFocus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Pick up a contact handed off from a record's side panel (Email/WhatsApp click).
  useEffect(() => {
    const requested = takeCommsFocus();
    if (!requested) return;
    setPendingFocus(requested);
    const tabMap: Record<string, CommsTab> = {
      Email: "email",
      WhatsApp: "whatsapp",
      Phone: "phone",
    };
    setTab(tabMap[requested.channel] ?? "all");
    if (requested.name) setQuery(requested.name);
    setNewForm((prev) => ({
      ...prev,
      name: requested.name ?? prev.name,
      email: requested.email ?? prev.email,
      phone: requested.phone ?? prev.phone,
      channel: (requested.channel as "Email" | "WhatsApp" | "Phone") ?? prev.channel,
    }));
    setNewOpen(true);
  }, []);

  // ── new-conversation dialog
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

  // ── compose
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── conversations list (server data)
  const { data: page, reload: reloadConversations } = useApiQuery(
    () =>
      fetchConversations({
        ...(tab !== "all" ? { channel: tab.charAt(0).toUpperCase() + tab.slice(1) } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(query.trim() ? { search: query.trim() } : {}),
      }),
    [tab, statusFilter, query],
    status === "ready",
  );

  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  useEffect(() => {
    setConversations(page?.items ?? []);
  }, [page]);

  // If the handed-off contact already has a thread, open it instead of the new dialog.
  useEffect(() => {
    if (!pendingFocus || conversations.length === 0) return;
    const needle = (
      pendingFocus.phone ||
      pendingFocus.email ||
      pendingFocus.name ||
      ""
    ).toLowerCase();
    const match = conversations.find((c) => {
      const hay = `${c.contactName} ${c.contactEmail ?? ""} ${c.contactPhone ?? ""}`.toLowerCase();
      return needle && hay.includes(needle);
    });
    if (match) {
      setActiveId(match.id);
      setNewOpen(false);
    }
    setPendingFocus(null);
  }, [conversations, pendingFocus]);

  const { data: channels } = useApiQuery(() => fetchConversationChannels(), [], status === "ready");
  const { data: channelStatus } = useApiQuery(() => fetchChannelStatus(), [], status === "ready");
  const { data: savedTemplates } = useApiQuery(
    () => fetchMessageTemplates(),
    [],
    status === "ready",
  );

  // ── active thread
  const active = conversations.find((c) => c.id === activeId) ?? conversations[0] ?? null;

  const { data: thread, reload: reloadThread } = useApiQuery(
    () => (active ? fetchConversation(active.id) : Promise.resolve(null)),
    [active?.id],
    status === "ready" && Boolean(active),
  );

  const [messages, setMessages] = useState<MessageDto[]>([]);
  useEffect(() => {
    setMessages(thread?.messages ?? []);
  }, [thread]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update active conversation when list changes (e.g. after socket update)
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0]!.id);
    }
  }, [conversations, activeId]);

  // ── socket.io real-time handlers ──────────────────────────────────────────

  const handleNewMessage = useCallback(
    (msg: MessageDto & { conversationId: string }) => {
      // If message belongs to the open conversation, append it immediately
      if (msg.conversationId === active?.id) {
        setMessages((prev) => {
          // Avoid duplicates (server may echo our own outbound message)
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      // Always refresh the sidebar list preview
      reloadConversations();
    },
    [active?.id, reloadConversations],
  );

  const handleConversationNew = useCallback((conv: ConversationDto) => {
    setConversations((prev) => {
      if (prev.some((c) => c.id === conv.id)) return prev;
      return [conv, ...prev];
    });
    toast.info(`New ${conv.channel} from ${conv.contactName}`);
  }, []);

  const handleConversationUpdated = useCallback(
    (patch: Partial<ConversationDto> & { id: string }) => {
      setConversations((prev) => prev.map((c) => (c.id === patch.id ? { ...c, ...patch } : c)));
    },
    [],
  );

  useSocket("message:new", handleNewMessage);
  useSocket("conversation:new", handleConversationNew);
  useSocket("conversation:updated", handleConversationUpdated);

  // Delivery receipt from Meta WhatsApp webhook — updates tick instantly
  const handleDeliveryUpdate = useCallback(
    (update: { messageId: string; conversationId: string; delivery: string }) => {
      if (update.conversationId === active?.id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === update.messageId ? { ...m, delivery: update.delivery } : m)),
        );
      }
    },
    [active?.id],
  );
  useSocket("message:delivery", handleDeliveryUpdate);

  // ── send message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!active || !draft.trim() || sending) return;
    const value = draft.trim();
    setDraft("");
    setReplyTo(null);
    setSending(true);

    // Optimistic message bubble
    const optimistic: MessageDto = {
      id: `opt-${Date.now()}`,
      direction: "out",
      channel: active.channel,
      body: value,
      sentBy: user?.name ?? "You",
      createdAt: new Date().toISOString(),
      delivery: "queued",
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await sendConversationMessage(active.id, value);
      // Replace optimistic bubble with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...optimistic, ...saved } : m)),
      );
      const d = saved.delivery;
      if (d === "failed") toast.error("Message failed — check outbox");
      else if (d === "queued")
        toast.info("Queued — connect SMTP / WhatsApp in Settings to deliver live");
    } catch (err) {
      // Remove optimistic bubble on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(value);
      toast.error(errorMessage(err, "Could not send message"));
    } finally {
      setSending(false);
    }
  };

  const markResolved = async () => {
    if (!active) return;
    try {
      await updateConversation(active.id, { status: "Resolved" });
      toast.success("Marked as resolved");
      reloadConversations();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update status"));
    }
  };

  const applyTemplate = (tpl: (typeof PROFESSIONAL_TEMPLATES)[number]) => {
    const name = active?.contactName.split(" ")[0] ?? "there";
    const body = tpl.body
      .replaceAll("{name}", name)
      .replaceAll("{agent}", user?.name ?? "Your consultant");
    setDraft(body);
  };

  const startConversation = async () => {
    if (!newForm.name.trim()) {
      toast.error("Contact name required");
      return;
    }
    if (newForm.channel === "Email" && !newForm.email.trim()) {
      toast.error("Email address required for Email conversations");
      return;
    }
    if (newForm.channel !== "Email" && !newForm.phone.trim()) {
      toast.error("Phone number required for WhatsApp / Phone conversations");
      return;
    }
    setNewBusy(true);
    try {
      const created = await createConversation({
        contactName: newForm.name.trim(),
        channel: newForm.channel,
        ...(newForm.email.trim() ? { contactEmail: newForm.email.trim() } : {}),
        ...(newForm.phone.trim() ? { contactPhone: newForm.phone.trim() } : {}),
        subject: newForm.subject.trim() || `Conversation with ${newForm.name.trim()}`,
      });
      if (newForm.message.trim()) {
        await sendConversationMessage(created.id, newForm.message.trim());
      }
      setActiveId(created.id);
      setNewOpen(false);
      setNewForm({ name: "", email: "", phone: "", channel: "Email", subject: "", message: "" });
      reloadConversations();
      toast.success("Conversation started");
    } catch (err) {
      toast.error(errorMessage(err, "Could not start conversation"));
    } finally {
      setNewBusy(false);
    }
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const channelList = useMemo(() => {
    const set = new Set<string>(["Shared inbox"]);
    conversations.forEach((c) => set.add(c.channel));
    channels?.forEach((c) => set.add(c.channel));
    return Array.from(set);
  }, [conversations, channels]);

  const filtered = useMemo(
    () =>
      conversations.filter((c) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          c.contactName.toLowerCase().includes(q) ||
          (c.contactEmail ?? "").toLowerCase().includes(q) ||
          (c.contactPhone ?? "").includes(q) ||
          (c.subject ?? "").toLowerCase().includes(q)
        );
      }),
    [conversations, query],
  );

  const unread = conversations.filter((c) => c.status === "Open").length;

  // ── loading / unauthenticated guard ───────────────────────────────────────

  if (status !== "ready") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <MessageCircle className="size-12 text-muted animate-pulse" />
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Conversations</h1>
          <p className="text-xs text-muted">
            {unread > 0 ? (
              <span className="text-tomato font-semibold">{unread} unread · </span>
            ) : null}
            {conversations.length} total
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Channel status pills */}
          {channelStatus?.whatsapp?.configured || channelStatus?.whatsapp?.web?.linked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
              <Smartphone className="size-3" /> WhatsApp
            </span>
          ) : (
            <Link
              to="/workspace/$module"
              params={{ module: "settings" }}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200"
            >
              <Smartphone className="size-3" /> WhatsApp — connect
            </Link>
          )}
          {channelStatus?.email?.configured ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
              <Mail className="size-3" /> Email
            </span>
          ) : (
            <Link
              to="/workspace/$module"
              params={{ module: "settings" }}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200"
            >
              <Mail className="size-3" /> Email — connect
            </Link>
          )}

          <Button variant="outline" size="icon" onClick={reloadConversations} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="size-4 mr-1" /> New conversation
          </Button>
        </div>
      </div>

      {/* ── Workspace: list + thread (WhatsApp-Web style) ─────────────────── */}
      <div className="flex flex-1 overflow-hidden rounded-2xl border border-line bg-white shadow-sm min-h-[600px]">
        {/* Mobile sidebar toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="md:hidden absolute top-3 left-3 z-10 rounded-full bg-white p-2 shadow"
          aria-label="Toggle conversation list"
        >
          <MessageCircle className="size-4" />
        </button>

        {/* ── Left: conversation list (slides in/out) ──────────────────── */}
        <div
          className={cn(
            "flex w-full shrink-0 flex-col border-r border-line bg-[#f0f2f5] transition-transform duration-300 md:w-[340px]",
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
            "md:relative absolute inset-y-0 left-0 z-20 md:z-auto",
          )}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              placeholder="Search conversations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Channel tabs */}
          <div className="flex gap-1 border-b border-line px-3 py-2 overflow-x-auto">
            {(
              [
                { key: "all", label: "All" },
                { key: "whatsapp", label: "WhatsApp" },
                { key: "email", label: "Email" },
                { key: "phone", label: "Phone" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                  tab === key ? "bg-ink text-on-ink" : "text-muted hover:bg-glass-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted shrink-0">
              Status
            </Label>
            <select
              className="flex-1 bg-transparent text-xs text-muted outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="Open">Open</option>
              <option value="In progress">In progress</option>
              <option value="Pending">Pending</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted">
                <Inbox className="size-10" />
                <p className="text-xs text-center">
                  {query ? "No conversations match your search." : "No conversations yet."}
                </p>
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors border-b border-line/50",
                    c.id === active?.id ? "bg-ink/5" : "hover:bg-glass-2",
                  )}
                >
                  {/* Avatar + unread dot */}
                  <div className="relative mt-0.5 shrink-0">
                    <div className="size-9">
                      <Avatar name={c.contactName} />
                    </div>
                    {c.status === "Open" && (
                      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-tomato ring-2 ring-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          "truncate text-sm",
                          c.status === "Open" ? "font-semibold text-foreground" : "text-foreground",
                        )}
                      >
                        {c.contactName}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted whitespace-nowrap">
                        {new Date(c.lastMessageAt).toLocaleDateString([], {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted">{c.preview || c.subject}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          channelBadge(c.channel),
                        )}
                      >
                        <ChannelIcon channel={c.channel} />
                        {c.channel}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right: message thread ────────────────────────────────────── */}
        {active ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Thread header (WhatsApp green) */}
            <div className="flex items-center justify-between gap-3 bg-[#008069] px-4 py-3 shrink-0 text-white">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden rounded-full p-1 hover:bg-white/10"
                  aria-label="Back to list"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="size-9">
                  <Avatar name={active.contactName} />
                </div>
                <div>
                  <p className="text-sm font-semibold">{active.contactName}</p>
                  <p className="text-xs text-white/80">
                    {[active.contactPhone, active.contactEmail].filter(Boolean).join(" · ") ||
                      "No contact details"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    channelBadge(active.channel),
                  )}
                >
                  <ChannelIcon channel={active.channel} />
                  {active.channel}
                </span>
                <Status value={active.status} />
                {active.status !== "Resolved" && (
                  <button
                    onClick={markResolved}
                    className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:bg-glass-2"
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            </div>

            {/* Messages bubble area */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
              style={{
                background: "linear-gradient(180deg, #e5ddd5 0%, #d9d0c7 100%)",
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 40%)",
              }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted">
                  <MessageCircle className="size-12" />
                  <p className="text-sm">No messages yet. Write the first one.</p>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex gap-2 max-w-[75%]",
                      m.direction === "out" ? "ml-auto flex-row-reverse" : "mr-auto",
                    )}
                  >
                    {m.direction === "in" && (
                      <div className="size-7 shrink-0 rounded-full bg-glass-3 flex items-center justify-center mt-1">
                        <User className="size-3.5 text-muted" />
                      </div>
                    )}

                    <div className="flex flex-col gap-0.5">
                      {/* Bubble */}
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                          m.direction === "out"
                            ? "bg-[#d9fdd3] text-gray-900 rounded-tr-none shadow-sm" // WhatsApp-green for outbound
                            : "bg-white text-gray-900 rounded-tl-none border border-line",
                        )}
                      >
                        {/* Reply quote */}
                        {m.direction === "out" && replyTo?.id === m.id && (
                          <div className="mb-1.5 rounded border-l-2 border-green-500 bg-green-50 px-2 py-1 text-[11px] text-muted">
                            {replyTo.body.slice(0, 80)}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      </div>

                      {/* Timestamp + tick */}
                      <div
                        className={cn(
                          "flex items-center gap-1 text-[10px] text-muted",
                          m.direction === "out" ? "justify-end" : "justify-start",
                        )}
                      >
                        {m.sentBy && m.direction === "out" && <span>{m.sentBy}</span>}
                        <span>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {m.direction === "out" && (
                          <DeliveryTick {...(m.delivery != null ? { delivery: m.delivery } : {})} />
                        )}
                        {/* Quick reply button */}
                        {m.direction === "in" && (
                          <button
                            onClick={() => setReplyTo(m)}
                            className="ml-1 opacity-0 hover:opacity-100 group-hover:opacity-100 text-muted hover:text-foreground"
                            title="Reply"
                          >
                            <Reply className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {/* Anchor for auto-scroll */}
              <div ref={messagesEndRef} />
            </div>

            {/* Template chips */}
            <div className="border-t border-line bg-glass-1 px-3 pt-2 pb-1 shrink-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Quick replies
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {PROFESSIONAL_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    onClick={() => applyTemplate(tpl)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors hover:bg-glass-3",
                      tpl.channel === "WhatsApp"
                        ? "border-green-200 bg-green-50 text-green-800"
                        : "border-blue-200 bg-blue-50 text-blue-800",
                    )}
                  >
                    {tpl.channel === "WhatsApp" ? (
                      <Smartphone className="size-3" />
                    ) : (
                      <Mail className="size-3" />
                    )}
                    {tpl.name}
                  </button>
                ))}
                {savedTemplates?.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setDraft(tpl.body)}
                    className="shrink-0 rounded-full border border-dashed border-line px-3 py-1 text-[11px] text-muted hover:bg-glass-2"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Compose */}
            <form
              className="flex items-end gap-2 border-t border-line bg-white px-3 py-2 shrink-0"
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
            >
              <div className="flex-1 flex flex-col gap-1">
                {/* Reply-to strip */}
                {replyTo && (
                  <div className="flex items-center justify-between rounded-lg bg-glass-2 px-2 py-1 text-[11px] text-muted">
                    <span className="truncate">Replying to: {replyTo.body.slice(0, 60)}…</span>
                    <button type="button" onClick={() => setReplyTo(null)}>
                      <X className="size-3" />
                    </button>
                  </div>
                )}
                <textarea
                  className="min-h-[48px] max-h-[140px] w-full resize-none rounded-xl border border-line bg-glass-1 px-3 py-2 text-sm outline-none focus:border-ink focus:ring-0 placeholder:text-muted"
                  placeholder={active.channel === "WhatsApp" ? "Type a message…" : "Hi {name}, …"}
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Ctrl/Cmd+Enter sends
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <p className="text-[10px] text-muted">
                  Replying on <strong className="text-foreground">{active.channel}</strong>
                  {active.channel === "WhatsApp" &&
                    !channelStatus?.whatsapp?.configured &&
                    !channelStatus?.whatsapp?.web?.linked &&
                    " · message will queue until WhatsApp is connected"}
                  {" · Ctrl+Enter to send"}
                </p>
              </div>

              <Button
                type="submit"
                disabled={!draft.trim() || sending}
                className="h-10 px-4 shrink-0"
              >
                {sending ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
            <MessageCircle className="size-16" />
            <p className="text-sm font-medium">Select a conversation</p>
            <p className="text-xs">or start a new one</p>
          </div>
        )}
      </div>

      {/* ── New conversation dialog ───────────────────────────────────────── */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
            <DialogDescription>
              Start an email, WhatsApp or call log thread with a contact.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>Contact name</Label>
              <Input
                list="comms-customers"
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
                placeholder="Priya Mehta"
              />
              <datalist id="comms-customers">
                {customers.slice(0, 200).map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-1">
              <Label>Channel</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
            </div>
            {newForm.channel === "Email" && (
              <div className="grid gap-1">
                <Label>Subject</Label>
                <Input
                  value={newForm.subject}
                  onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })}
                  placeholder="Your Dubai itinerary"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newForm.email}
                  onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                  placeholder="name@email.com"
                />
              </div>
              <div className="grid gap-1">
                <Label>Phone</Label>
                <Input
                  value={newForm.phone}
                  onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>First message</Label>
              <Textarea
                rows={4}
                value={newForm.message}
                onChange={(e) => setNewForm({ ...newForm, message: e.target.value })}
                placeholder="Hi Priya, thank you for reaching out…"
              />
              <p className="text-[11px] text-muted">Leave empty to write later.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button disabled={newBusy} onClick={() => void startConversation()}>
              <Send className="size-4" />
              {newBusy ? "Starting…" : "Start conversation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
