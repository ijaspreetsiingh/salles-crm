import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hash,
  Lock,
  MessageSquare,
  Plus,
  Search,
  Send,
  User,
  Users,
  X,
  RefreshCw,
  CornerDownLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar } from "./ui";
import { useCRM } from "@/lib/crm/store";
import { useApiQuery } from "@/lib/api/hooks";
import { useSocket } from "@/hooks/useSocket";
import { errorMessage } from "@/lib/api/client";
import {
  fetchChatChannels,
  fetchChatMessages,
  sendChatMessage,
  addChatReaction,
  markChatRead,
  createChatChannel,
  openDirectMessage,
  fetchChatMembers,
  type ChatChannelDto,
  type ChatMessageDto,
} from "@/lib/api/modules";

/* ==========================================================================
   Team Chat — internal Slack-style messaging for the travel team.

   Left sidebar  : channels (#general, #sales…) + DM list + "New channel" btn
   Right panel   : message thread — bubbles, emoji reactions, reply-to,
                   @mention, infinite scroll, real-time socket.io updates.
   ========================================================================== */

// ── quick-emoji bar ──────────────────────────────────────────────────────────
const QUICK_EMOJI = ["👍", "🙏", "✅", "❤️", "😂", "🔥"];

// ── timestamp helper ─────────────────────────────────────────────────────────
function msgTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    d.toLocaleDateString([], { day: "2-digit", month: "short" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

// ── component ─────────────────────────────────────────────────────────────────
export function TeamChat() {
  const { status, user } = useCRM();

  // ── channels
  const { data: rawChannels, reload: reloadChannels } = useApiQuery(
    () => fetchChatChannels(),
    [],
    status === "ready",
  );
  const [channels, setChannels] = useState<ChatChannelDto[]>([]);
  useEffect(() => {
    setChannels(rawChannels ?? []);
  }, [rawChannels]);

  // ── members (for @mention + DM picker)
  const { data: members } = useApiQuery(() => fetchChatMembers(), [], status === "ready");

  // ── active channel
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = channels.find((c) => c.id === activeId) ?? channels[0] ?? null;

  // Set first channel on load
  useEffect(() => {
    if (!activeId && channels.length > 0) setActiveId(channels[0]!.id);
  }, [channels, activeId]);

  // ── messages
  const { data: rawMessages, reload: reloadMessages } = useApiQuery(
    () => (active ? fetchChatMessages(active.id) : Promise.resolve([])),
    [active?.id],
    status === "ready" && Boolean(active),
  );
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  useEffect(() => {
    setMessages(rawMessages ?? []);
  }, [rawMessages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark read when switching channel
  useEffect(() => {
    if (active) {
      void markChatRead(active.id).catch(() => undefined);
      setChannels((prev) => prev.map((c) => (c.id === active.id ? { ...c, unreadCount: 0 } : c)));
    }
  }, [active?.id]);

  // ── compose
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [showEmoji, setShowEmoji] = useState<string | null>(null); // message id for reaction picker

  // ── @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // ── dialogs
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [newChannelBusy, setNewChannelBusy] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmQuery, setDmQuery] = useState("");

  // ── sidebar search
  const [sidebarSearch, setSidebarSearch] = useState("");

  // ── socket.io real-time handlers ─────────────────────────────────────────

  const handleNewMessage = useCallback(
    (msg: ChatMessageDto) => {
      if (msg.channelId === active?.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Mark read immediately since we're looking at it
        void markChatRead(msg.channelId).catch(() => undefined);
      } else {
        // Bump unread badge for other channels
        setChannels((prev) =>
          prev.map((c) =>
            c.id === msg.channelId
              ? {
                  ...c,
                  unreadCount: (c.unreadCount ?? 0) + 1,
                  lastMessage: msg.body.slice(0, 80),
                  lastMessageAt: msg.createdAt,
                }
              : c,
          ),
        );
      }
    },
    [active?.id],
  );

  const handleMessageUpdated = useCallback((msg: ChatMessageDto) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
  }, []);

  const handleNewChannel = useCallback((ch: ChatChannelDto) => {
    setChannels((prev) => {
      if (prev.some((c) => c.id === ch.id)) return prev;
      return [ch, ...prev];
    });
  }, []);

  useSocket("team_message:new", handleNewMessage);
  useSocket("team_message:updated", handleMessageUpdated);
  useSocket("team_channel:new", handleNewChannel);

  // ── send ──────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!active || !draft.trim() || sending) return;
    const body = draft.trim();
    setDraft("");
    setReplyTo(null);
    setSending(true);

    // Optimistic
    const optimistic: ChatMessageDto = {
      id: `opt-${Date.now()}`,
      channelId: active.id,
      body,
      senderId: user?.id ?? "",
      senderName: user?.name ?? "You",
      senderAvatar: null,
      reactions: [],
      replyToId: replyTo?.id ?? null,
      replyToBody: replyTo?.body ?? null,
      edited: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await sendChatMessage(active.id, body, replyTo?.id);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      toast.error(errorMessage(err, "Could not send message"));
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!active) return;
    try {
      const updated = await addChatReaction(active.id, messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch (err) {
      toast.error(errorMessage(err, "Could not add reaction"));
    }
    setShowEmoji(null);
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) return;
    setNewChannelBusy(true);
    try {
      const ch = await createChatChannel({
        name: newChannelName.trim(),
        description: newChannelDesc.trim(),
        isPrivate: newChannelPrivate,
      });
      setChannels((prev) => {
        if (prev.some((c) => c.id === ch.id)) return prev;
        return [ch, ...prev];
      });
      setActiveId(ch.id);
      setNewChannelOpen(false);
      setNewChannelName("");
      setNewChannelDesc("");
      setNewChannelPrivate(false);
      toast.success(`Channel ${ch.name} created`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not create channel"));
    } finally {
      setNewChannelBusy(false);
    }
  };

  const startDM = async (memberId: string) => {
    try {
      const ch = await openDirectMessage(memberId);
      if (ch) {
        setChannels((prev) => {
          if (prev.some((c) => c.id === ch.id)) return prev;
          return [ch, ...prev];
        });
        setActiveId(ch.id);
      }
      setDmOpen(false);
      setDmQuery("");
    } catch (err) {
      toast.error(errorMessage(err, "Could not open DM"));
    }
  };

  // @mention: detect "@" in draft
  const handleDraftChange = (v: string) => {
    setDraft(v);
    const atMatch = v.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1] ?? "");
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (name: string) => {
    const newDraft = draft.replace(/@(\w*)$/, `@${name} `);
    setDraft(newDraft);
    setMentionOpen(false);
    draftRef.current?.focus();
  };

  // ── sidebar data
  const regularChannels = channels.filter((c) => !c.isDirect);
  const dmChannels = channels.filter((c) => c.isDirect);

  const filteredRegular = regularChannels.filter((c) =>
    c.name.toLowerCase().includes(sidebarSearch.toLowerCase()),
  );
  const filteredDMs = dmChannels.filter((c) =>
    (c.description ?? "").toLowerCase().includes(sidebarSearch.toLowerCase()),
  );

  const totalUnread = channels.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

  // ── loading guard
  if (status !== "ready") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <MessageSquare className="size-12 text-muted animate-pulse" />
      </div>
    );
  }

  // ── render
  return (
    <div className="flex h-full min-h-[580px] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Team Chat</h1>
          <p className="text-xs text-muted">
            {totalUnread > 0 ? (
              <span className="text-tomato font-semibold">{totalUnread} unread · </span>
            ) : null}
            {channels.length} channels
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={reloadChannels} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDmOpen(true)}>
            <User className="size-4 mr-1" /> Direct message
          </Button>
          <Button size="sm" onClick={() => setNewChannelOpen(true)}>
            <Plus className="size-4 mr-1" /> New channel
          </Button>
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        {/* ── Left sidebar ──────────────────────────────────────────────── */}
        <div className="flex w-[220px] shrink-0 flex-col border-r border-line bg-gray-50">
          {/* Sidebar search */}
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted" />
            <input
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
              placeholder="Find channel…"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {/* Channels section */}
            <div className="mb-1">
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Channels
                </span>
                <button
                  onClick={() => setNewChannelOpen(true)}
                  className="text-muted hover:text-foreground"
                  title="New channel"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {filteredRegular.length === 0 && (
                <p className="px-3 py-1 text-[11px] text-muted">No channels yet</p>
              )}
              {filteredRegular.map((ch) => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  active={ch.id === active?.id}
                  onClick={() => setActiveId(ch.id)}
                />
              ))}
            </div>

            {/* DMs section */}
            {filteredDMs.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Direct messages
                  </span>
                  <button
                    onClick={() => setDmOpen(true)}
                    className="text-muted hover:text-foreground"
                    title="New DM"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                {filteredDMs.map((ch) => (
                  <ChannelItem
                    key={ch.id}
                    channel={ch}
                    active={ch.id === active?.id}
                    onClick={() => setActiveId(ch.id)}
                    isDirect
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: message area ───────────────────────────────────────── */}
        {active ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Channel header */}
            <div className="flex items-center gap-3 border-b border-line px-4 py-3 shrink-0">
              {active.isDirect ? (
                <User className="size-4 text-muted" />
              ) : active.isPrivate ? (
                <Lock className="size-4 text-muted" />
              ) : (
                <Hash className="size-4 text-muted" />
              )}
              <div>
                <p className="text-sm font-semibold">
                  {active.isDirect ? active.description : active.name}
                </p>
                {active.description && !active.isDirect && (
                  <p className="text-xs text-muted">{active.description}</p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2 text-xs text-muted">
                <Users className="size-3.5" />
                {active.memberCount} members
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
              style={{ background: "#f7f8fa" }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted">
                  <Hash className="size-12" />
                  <p className="text-sm font-medium">
                    {active.isDirect
                      ? `Start a conversation with ${active.description}`
                      : `Welcome to ${active.name}`}
                  </p>
                  <p className="text-xs">Send the first message.</p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isMe = m.senderId === user?.id;
                  const prevMsg = messages[idx - 1];
                  const showSender =
                    !prevMsg ||
                    prevMsg.senderId !== m.senderId ||
                    new Date(m.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() >
                      5 * 60 * 1000;

                  return (
                    <div
                      key={m.id}
                      className="group relative flex gap-3 rounded-xl px-2 py-1 hover:bg-white/80"
                    >
                      {/* Avatar — only shown when sender changes */}
                      <div className="w-8 shrink-0 pt-0.5">
                        {showSender && (
                          <div className="size-8">
                            <Avatar name={m.senderName} />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {showSender && (
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <span className="text-[13px] font-semibold text-foreground">
                              {isMe ? "You" : m.senderName}
                            </span>
                            <span className="text-[10px] text-muted">{msgTime(m.createdAt)}</span>
                          </div>
                        )}

                        {/* Reply quote */}
                        {m.replyToId && m.replyToBody && (
                          <div className="mb-1 border-l-2 border-gray-300 pl-2 text-xs text-muted truncate">
                            {m.replyToBody.slice(0, 80)}
                          </div>
                        )}

                        <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
                          {m.body}
                        </p>

                        {/* Reactions */}
                        {m.reactions.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {m.reactions.map((r) => (
                              <button
                                key={r.emoji}
                                onClick={() => void toggleReaction(m.id, r.emoji)}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                                  r.mine
                                    ? "border-blue-200 bg-blue-50 text-blue-700"
                                    : "border-line bg-white text-muted hover:bg-glass-2",
                                )}
                              >
                                {r.emoji} {r.count}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Hover action bar */}
                      <div className="absolute right-2 top-1 hidden items-center gap-1 rounded-xl border border-line bg-white px-1.5 py-1 shadow-sm group-hover:flex">
                        {QUICK_EMOJI.map((e) => (
                          <button
                            key={e}
                            onClick={() => void toggleReaction(m.id, e)}
                            className="text-base hover:scale-125 transition-transform"
                            title={`React with ${e}`}
                          >
                            {e}
                          </button>
                        ))}
                        <button
                          onClick={() => setReplyTo(m)}
                          className="ml-1 rounded-lg px-1.5 py-0.5 text-xs text-muted hover:bg-glass-2 hover:text-foreground"
                          title="Reply"
                        >
                          <CornerDownLeft className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-line bg-white px-4 py-3 shrink-0">
              {/* Reply strip */}
              {replyTo && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-glass-2 px-3 py-1.5 text-xs text-muted">
                  <span className="truncate">
                    Replying to <strong>{replyTo.senderName}</strong>: {replyTo.body.slice(0, 60)}
                  </span>
                  <button onClick={() => setReplyTo(null)} className="ml-2 hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </div>
              )}

              {/* @mention dropdown */}
              {mentionOpen && members && (
                <div className="mb-2 rounded-xl border border-line bg-white shadow-md overflow-hidden">
                  {members
                    .filter(
                      (m) =>
                        mentionQuery === "" ||
                        m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
                    )
                    .slice(0, 6)
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => insertMention(m.name)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-glass-2"
                      >
                        <div className="size-6">
                          <Avatar name={m.name} />
                        </div>
                        {m.name}
                      </button>
                    ))}
                </div>
              )}

              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
                }}
              >
                <div className="flex-1 relative">
                  <textarea
                    ref={draftRef}
                    className="w-full min-h-[44px] max-h-[120px] resize-none rounded-xl border border-line bg-glass-1 px-3 py-2.5 text-sm outline-none focus:border-ink placeholder:text-muted"
                    placeholder={`Message ${active.isDirect ? active.description : active.name}   · @ to mention`}
                    rows={1}
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && mentionOpen) {
                        e.preventDefault();
                        setMentionOpen(false);
                        return;
                      }
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="h-10 w-10 shrink-0 rounded-xl p-0"
                  title="Send (Ctrl+Enter)"
                >
                  {sending ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </form>
              <p className="mt-1 text-[10px] text-muted">Ctrl+Enter to send · @ to mention</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
            <MessageSquare className="size-16" />
            <p className="text-sm font-medium">Select a channel to start chatting</p>
            <Button size="sm" onClick={() => setNewChannelOpen(true)}>
              <Plus className="size-4 mr-1" /> Create first channel
            </Button>
          </div>
        )}
      </div>

      {/* ── New channel dialog ────────────────────────────────────────────── */}
      <Dialog open={newChannelOpen} onOpenChange={setNewChannelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New channel</DialogTitle>
            <DialogDescription>
              Channels are where your team communicates. They are organised by topic — e.g. #sales,
              #ops.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>Channel name</Label>
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
                <Hash className="size-4 text-muted" />
                <input
                  className="flex-1 bg-transparent py-2 text-sm outline-none"
                  placeholder="e.g. sales"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value.replace(/\s+/g, "-"))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Description (optional)</Label>
              <Input
                value={newChannelDesc}
                onChange={(e) => setNewChannelDesc(e.target.value)}
                placeholder="What is this channel for?"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={newChannelPrivate}
                onChange={(e) => setNewChannelPrivate(e.target.checked)}
                className="size-4 rounded"
              />
              <div>
                <p className="text-sm font-medium">Private channel</p>
                <p className="text-xs text-muted">Only invited members can see and join</p>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewChannelOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newChannelName.trim() || newChannelBusy}
              onClick={() => void createChannel()}
            >
              {newChannelBusy ? "Creating…" : "Create channel"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DM picker dialog ─────────────────────────────────────────────── */}
      <Dialog open={dmOpen} onOpenChange={setDmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Direct message</DialogTitle>
            <DialogDescription>Pick a teammate to message privately.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="flex items-center gap-2 rounded-md border border-input px-3">
              <Search className="size-4 text-muted" />
              <input
                className="flex-1 bg-transparent py-2 text-sm outline-none"
                placeholder="Search teammates…"
                value={dmQuery}
                onChange={(e) => setDmQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {(members ?? [])
                .filter(
                  (m) =>
                    m.id !== user?.id &&
                    (dmQuery === "" || m.name.toLowerCase().includes(dmQuery.toLowerCase())),
                )
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => void startDM(m.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-glass-2"
                  >
                    <div className="size-8">
                      <Avatar name={m.name} />
                    </div>
                    <span className="text-sm font-medium">{m.name}</span>
                  </button>
                ))}
              {(members ?? []).filter((m) => m.id !== user?.id).length === 0 && (
                <p className="py-4 text-center text-xs text-muted">No other team members found</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sidebar channel item ─────────────────────────────────────────────────────
function ChannelItem({
  channel,
  active,
  onClick,
  isDirect = false,
}: {
  channel: ChatChannelDto;
  active: boolean;
  onClick: () => void;
  isDirect?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-ink/10 font-semibold text-foreground"
          : "text-muted hover:bg-gray-100 hover:text-foreground",
      )}
    >
      <span className="shrink-0 text-muted">
        {isDirect ? (
          <User className="size-3.5" />
        ) : channel.isPrivate ? (
          <Lock className="size-3.5" />
        ) : (
          <Hash className="size-3.5" />
        )}
      </span>
      <span className="flex-1 truncate text-xs">
        {isDirect ? channel.description : channel.name}
      </span>
      {channel.unreadCount > 0 && (
        <span className="flex-shrink-0 rounded-full bg-tomato px-1.5 py-0.5 text-[10px] font-bold text-white">
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}
