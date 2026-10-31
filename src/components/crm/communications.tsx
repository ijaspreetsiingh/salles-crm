import { useMemo, useState, useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Mail,
  Phone,
  MessageCircle,
  Clock,
  Check,
  X,
  ArrowRight,
  User,
  Settings,
  Send,
  Search,
  Filter,
  MoreVertical,
  MailOpen,
  Smartphone,
  AtSign,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
import { useApiQuery } from "@/lib/api/hooks";
import { Avatar } from "./ui";
import { Status } from "./common";
import { errorMessage } from "@/lib/api/client";
import { formatDay } from "@/lib/crm/catalog";

/* ==========================================================================
   Communications — Real-world ready shared inbox.

   Email, WhatsApp, Phone, Instagram, Web chat — all in one place.
   Every conversation is linked to a customer record, so you never lose
   context. Templates, call logs, and consent management included.
   ========================================================================== */

const CHANNEL_COLORS: Record<string, string> = {
  WhatsApp: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Email: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Phone: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  Instagram: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  "Web chat": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  "Shared inbox": "bg-slate-100 text-slate-800 dark:bg-slate-800/30 dark:text-slate-400",
};

const CHANNEL_ICONS: Record<string, ReactNode> = {
  WhatsApp: (
    <span className="size-4">
      <Smartphone className="size-16" />
    </span>
  ),
  Email: (
    <span className="size-4">
      <Mail className="size-16" />
    </span>
  ),
  Phone: (
    <span className="size-4">
      <Phone className="size-16" />
    </span>
  ),
  Instagram: (
    <span className="size-4">
      <MessageCircle className="size-16" />
    </span>
  ),
  "Web chat": (
    <span className="size-4">
      <AtSign className="size-16" />
    </span>
  ),
  "Shared inbox": (
    <span className="size-4">
      <Inbox />
    </span>
  ),
};

const DELIVERY_ICONS: Record<string, ReactNode> = {
  sent: (
    <span className="size-3">
      <Check className="size-16" />
    </span>
  ),
  delivered: (
    <span className="size-3">
      <Check className="size-16" />
    </span>
  ),
  read: (
    <span className="size-3">
      <Check className="size-16" />
    </span>
  ),
  failed: (
    <span className="size-3 text-tomato">
      <X className="size-16" />
    </span>
  ),
  queued: (
    <span className="size-3">
      <Clock className="size-16" />
    </span>
  ),
};

const channelIcon = (channel: string) =>
  CHANNEL_ICONS[channel] ?? (
    <span className="size-4">
      <MessageCircle className="size-16" />
    </span>
  );
const channelBadge = (channel: string) => CHANNEL_COLORS[channel] ?? "bg-slate-100 text-slate-800";

type CommsTab = "all" | "whatsapp" | "email" | "phone" | "instagram" | "web";

export function Communications() {
  const { settings, status } = useCRM();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<CommsTab>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<MessageDto[]>([]);

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
  const conversations: ConversationDto[] = page?.items ?? [];
  const { data: channels } = useApiQuery(() => fetchConversationChannels(), [], status === "ready");
  const { data: channelStatus } = useApiQuery(() => fetchChannelStatus(), [], status === "ready");
  const { data: templates } = useApiQuery(() => fetchMessageTemplates(), [], status === "ready");

  const channelList = useMemo(() => {
    const set = new Set<string>(["Shared inbox"]);
    conversations.forEach((c) => set.add(c.channel));
    channels?.forEach((c) => set.add(c.channel));
    return Array.from(set);
  }, [conversations, channels]);

  const active: ConversationDto | undefined =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  const { data: thread } = useApiQuery(
    () => (active ? fetchConversation(active.id) : Promise.resolve(null)),
    [active?.id],
    status === "ready" && Boolean(active),
  );
  const messages: MessageDto[] = [...(thread?.messages ?? []), ...pending];

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const matchesSearch =
        !query.trim() ||
        c.contactName.toLowerCase().includes(query.trim().toLowerCase()) ||
        c.contactEmail?.toLowerCase().includes(query.trim().toLowerCase()) ||
        c.contactPhone?.includes(query.trim()) ||
        c.subject?.toLowerCase().includes(query.trim().toLowerCase());
      return matchesSearch;
    });
  }, [conversations, query]);

  const unreadCount = conversations.filter((c) => c.status === "Open").length;

  const sendMessage = async () => {
    if (!active || !draft.trim()) return;
    const value = draft.trim();
    setDraft("");
    try {
      const msg = await sendConversationMessage(active.id, value);
      setPending((prev) => [...prev, msg]);
      const delivery = msg.delivery;
      if (delivery === "sent") toast.success("Delivered");
      else if (delivery === "failed") toast.error("Message failed — check outbox");
      else if (delivery === "queued") toast.info("Queued — connect SMTP/WhatsApp to send live");
      else toast.success("Message added");
    } catch (err) {
      toast.error(errorMessage(err, "Could not send message"));
    }
  };

  const markResolved = async () => {
    if (!active) return;
    try {
      await updateConversation(active.id, { status: "Resolved" });
      toast.success("Marked resolved");
      reloadConversations();
      setActiveId(active.id);
    } catch (err) {
      toast.error(errorMessage(err, "Could not update status"));
    }
  };

  const startNewConversation = async () => {
    // This would open a contact picker — for now, show a prompt
    const name = prompt("Enter contact name:");
    if (!name) return;
    const email = prompt("Enter email (optional):");
    const phone = prompt("Enter phone (optional):");
    try {
      const created = await createConversation({
        contactName: name,
        channel: "Email",
        ...(email ? { contactEmail: email } : {}),
        ...(phone ? { contactPhone: phone } : {}),
        subject: `New conversation — ${name}`,
      });
      setActiveId(created.id);
      reloadConversations();
      toast.success("Conversation started");
    } catch (err) {
      toast.error(errorMessage(err, "Could not start conversation"));
    }
  };

  const deliveryIcon = (delivery?: string | null) => {
    if (!delivery) return <Clock className="size-3 text-muted" />;
    return DELIVERY_ICONS[delivery] ?? <Clock className="size-3 text-muted" />;
  };

  const deliveryLabel = (delivery?: string | null) => {
    if (!delivery) return "Pending";
    const labels: Record<string, string> = {
      sent: "Sent",
      delivered: "Delivered",
      read: "Read",
      failed: "Failed",
      queued: "Queued",
    };
    return labels[delivery] ?? delivery;
  };

  if (status !== "ready") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <MessageCircle className="size-12 mx-auto text-muted mb-2" />
          <p className="text-sm text-muted">Loading conversations…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="comms-workspace">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conversations</h1>
          <p className="text-sm text-muted">
            {unreadCount} unread · {conversations.length} total conversations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={startNewConversation}>
            <MessageCircle className="size-4 mr-2" /> New Conversation
          </Button>
          <Button onClick={reloadConversations}>
            <ArrowRight className="size-4" /> Refresh
          </Button>
        </div>
        {channelStatus && channelStatus.whatsapp && channelStatus.whatsapp.configured ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 text-green-800 border border-green-200">
            <span className="text-xs font-medium">WhatsApp connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            <span className="text-xs font-medium">WhatsApp not configured</span>
            <Link
              to="/workspace/$module"
              params={{ module: "settings" }}
              className="text-xs underline hover:text-amber-700"
            >
              Configure in Settings
            </Link>
          </div>
        )}
        {channelStatus && channelStatus.email && channelStatus.email.configured ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 text-green-800 border border-green-200">
            <span className="text-xs font-medium">Email connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            <span className="text-xs font-medium">Email not configured</span>
            <Link
              to="/workspace/$module"
              params={{ module: "settings" }}
              className="text-xs underline hover:text-amber-700"
            >
              Configure in Settings
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Conversation List */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Search className="size-4 text-muted" />
            <Input
              placeholder="Search conversations, contacts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 text-sm"
            />
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Label className="text-xs font-medium text-muted uppercase tracking-wider">
              Channel
            </Label>
            <div className="flex gap-1 overflow-x-auto pb-1">
              <button
                onClick={() => setTab("all")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                  tab === "all" ? "bg-ink text-on-ink" : "bg-glass-2 text-muted hover:bg-glass-3",
                )}
              >
                All
              </button>
              {channelList.map((ch) => {
                const key = ch.toLowerCase().includes("whatsapp")
                  ? "whatsapp"
                  : ch.toLowerCase().includes("email")
                    ? "email"
                    : ch.toLowerCase().includes("phone")
                      ? "phone"
                      : ch.toLowerCase().includes("instagram")
                        ? "instagram"
                        : ch.toLowerCase().includes("web")
                          ? "web"
                          : "all";
                return (
                  <button
                    key={ch}
                    onClick={() => setTab(key as CommsTab)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                      tab === key ? "bg-ink text-on-ink" : "bg-glass-2 text-muted hover:bg-glass-3",
                    )}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Label className="text-xs font-medium text-muted uppercase tracking-wider">
              Status
            </Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={statusFilter} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="conversation-list space-y-1">
            {filteredConversations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-well p-8 text-center">
                <MessageCircle className="size-12 mx-auto text-muted mb-2" />
                <p className="text-sm text-muted">
                  {filteredConversations.length === 0 && query.trim()
                    ? "No conversations match your search."
                    : "No conversations yet. Start one from a customer record or create a new conversation."}
                </p>
              </div>
            ) : (
              filteredConversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                    c.id === activeId
                      ? "border-ink bg-ink/10"
                      : "border-line bg-white hover:bg-glass-2 hover:border-line-2",
                    c.status === "Open" && "ring-1 ring-pine/20",
                  )}
                >
                  <div className="relative">
                    <div className="size-10 flex shrink-0">
                      <Avatar name={c.contactName} />
                    </div>
                    {c.status === "Open" && (
                      <div className="absolute -right-1 -bottom-1 size-2.5 rounded-full bg-tomato ring-2 ring-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        {c.contactName}
                      </h4>
                      <span
                        className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${channelBadge(c.channel)}`}
                      >
                        {c.channel}
                      </span>
                    </div>
                    <p className="text-xs text-muted truncate">
                      {c.preview || c.subject || "No messages yet"}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted">
                        {c.channel} · {c.messageCount} msg
                      </span>
                      <Status value={c.status} />
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Conversation Detail */}
        <div className="lg:col-span-7 flex flex-col h-[600px]">
          {active ? (
            <div className="flex flex-col h-full">
              {/* Conversation Header */}
              <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-line bg-glass-2 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="size-10 flex shrink-0">
                    <Avatar name={active.contactName} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{active.contactName}</h3>
                    <p className="text-xs text-muted truncate">
                      {active.contactEmail || active.contactPhone || "No contact details"}
                      {active.contactEmail && active.contactPhone ? " · " : ""}
                      {active.contactPhone || ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${channelBadge(active.channel)}`}
                  >
                    {active.channel}
                  </span>
                  <Status value={active.status} />
                  <Button variant="ghost" size="icon" onClick={markResolved}>
                    <MoreVertical className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted">
                    <MessageCircle className="size-12 mb-2" />
                    <p className="text-sm">No messages yet. Write the first reply.</p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex gap-3 max-w-[80%]",
                        m.direction === "out" ? "flex-row-reverse ml-auto" : "mr-auto",
                      )}
                    >
                      <div className="relative">
                        {m.direction === "in" && (
                          <div className="absolute -left-4 -top-0.5 size-5 rounded-full bg-glass-2 flex items-center justify-center">
                            <User className="size-3 text-muted" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "rounded-2xl p-3 text-sm shadow-sm",
                            m.direction === "out"
                              ? "bg-ink text-on-ink rounded-tr-none"
                              : "bg-glass-2 text-foreground rounded-tl-none",
                          )}
                        >
                          {m.body}
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[9px]">
                              {new Date(m.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {m.delivery && (
                              <>
                                {deliveryIcon(m.delivery)}
                                <span className="text-[9px] text-muted">
                                  {deliveryLabel(m.delivery)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Templates */}
              {templates && templates.length > 0 && (
                <div className="border-t border-line bg-glass-2 p-3 shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
                    Quick Templates
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => setDraft(tpl.body)}
                        className="px-3 py-1.5 rounded-lg border border-line bg-white text-xs text-muted hover:bg-glass-3 hover:text-foreground transition-colors whitespace-nowrap"
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Compose */}
              <form
                className="border-t border-line bg-glass-2 p-3 shrink-0"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
                }}
              >
                <div className="flex items-center gap-2">
                  <Textarea
                    placeholder="Write a reply…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    className="flex-1 resize-none text-sm border-none bg-transparent focus:ring-0"
                  />
                  <Button type="submit" disabled={!draft.trim()} className="h-10 px-4">
                    <Send className="size-4" /> Send
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <MessageCircle className="size-20 mb-4" />
              <h3 className="text-sm font-semibold text-foreground">Select a conversation</h3>
              <p className="text-xs text-muted mt-1">
                Pick a conversation from the list to start messaging.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Inbox() {
  return (
    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 7v10a4 4 0 004 4h0v-3m0 0v-3m-3 3h12"
      />
    </svg>
  );
}
