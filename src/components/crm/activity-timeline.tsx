/**
 * ActivityTimeline — the user-facing story of a record.
 *
 * Shows notes, calls, emails, status changes and payments in reverse
 * chronological order. Used in the RecordSheet's timeline tab.
 *
 * Easy to use:
 *   - Type a note and press Enter or click Add
 *   - Click the bin on your own notes to delete them
 *   - System events (status changes, payments) are read-only
 */
import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Phone,
  Mail,
  MessageCircle,
  ArrowRight,
  CreditCard,
  Link2,
  Link2Off,
  FilePlus,
  File,
  Loader2,
  Trash2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchTimeline,
  addTimelineEvent,
  deleteTimelineEvent,
  type TimelineEvent,
  type TimelineEventType,
} from "@/lib/api/timeline";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<TimelineEventType, React.ReactNode> = {
  note: <MessageSquare className="size-3.5" />,
  call: <Phone className="size-3.5" />,
  email: <Mail className="size-3.5" />,
  whatsapp: <MessageCircle className="size-3.5" />,
  status_change: <ArrowRight className="size-3.5" />,
  field_change: <ArrowRight className="size-3.5" />,
  payment: <CreditCard className="size-3.5" />,
  relation_added: <Link2 className="size-3.5" />,
  relation_removed: <Link2Off className="size-3.5" />,
  created: <FilePlus className="size-3.5" />,
  imported: <File className="size-3.5" />,
};

const TYPE_LABEL: Record<TimelineEventType, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  whatsapp: "WhatsApp",
  status_change: "Status changed",
  field_change: "Field updated",
  payment: "Payment",
  relation_added: "Linked",
  relation_removed: "Unlinked",
  created: "Created",
  imported: "Imported",
};

type Props = {
  recordId: string;
  currentUserId?: string | null;
};

export function ActivityTimeline({ recordId, currentUserId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    try {
      const page = await fetchTimeline(recordId, { ...(cursor ? { cursor } : {}) });
      setEvents((prev) => (cursor ? [...prev, ...page.events] : page.events));
      setNextCursor(page.nextCursor);
    } catch {
      // non-critical — timeline just won't show
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setEvents([]);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const handleAdd = async () => {
    const body = note.trim();
    if (!body || adding) return;
    setAdding(true);
    // Optimistic
    const optimistic: TimelineEvent = {
      id: `opt-${Date.now()}`,
      type: "note",
      body,
      meta: {},
      actorId: currentUserId ?? null,
      actorName: "You",
      createdAt: new Date().toISOString(),
    };
    setEvents((prev) => [optimistic, ...prev]);
    setNote("");
    try {
      const created = await addTimelineEvent(recordId, { type: "note", body });
      setEvents((prev) => prev.map((e) => (e.id === optimistic.id ? created : e)));
    } catch (err) {
      setEvents((prev) => prev.filter((e) => e.id !== optimistic.id));
      setNote(body);
      toast.error(errorMessage(err, "Could not add note"));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (event: TimelineEvent) => {
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    try {
      await deleteTimelineEvent(recordId, event.id);
    } catch (err) {
      setEvents((prev) => [event, ...prev]);
      toast.error(errorMessage(err, "Could not delete note"));
    }
  };

  return (
    <section aria-label="Activity timeline" className="grid gap-3">
      {/* Add note */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          aria-label="Add a note"
          placeholder="Add a note, call outcome, or reminder…"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleAdd();
            }
          }}
          className="flex-1 rounded-xl border border-line bg-glass-2 px-3 py-2 text-sm placeholder:text-muted resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          size="sm"
          disabled={adding || !note.trim()}
          onClick={() => void handleAdd()}
          title="Add note (Ctrl+Enter)"
        >
          {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </Button>
      </div>
      <p className="text-[11px] text-muted">Ctrl+Enter to submit</p>

      {/* Timeline events */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted" aria-label="Loading timeline" />
        </div>
      ) : events.length === 0 ? (
        <p className="rounded-xl border border-line bg-glass-2 p-4 text-center text-xs text-muted">
          No activity yet. Add a note above to start the record's story.
        </p>
      ) : (
        <ol className="relative grid gap-0 border-l border-line pl-4" aria-label="Activity events">
          {events.map((event) => (
            <li key={event.id} className="relative mb-4 last:mb-0">
              {/* Timeline dot */}
              <span
                className={cn(
                  "absolute -left-[1.1rem] top-1 inline-flex size-5 items-center justify-center rounded-full border border-line bg-background text-muted",
                )}
                aria-hidden
              >
                {TYPE_ICON[event.type] ?? <MessageSquare className="size-3.5" />}
              </span>
              <div className="rounded-xl border border-line bg-glass-2 px-3 py-2 ml-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {TYPE_LABEL[event.type] ?? event.type}
                    </span>
                    <span className="ml-2 text-[11px] text-faint">
                      {event.actorName} ·{" "}
                      {new Date(event.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {event.type === "note" && event.actorId === currentUserId && (
                    <button
                      type="button"
                      aria-label="Delete note"
                      className="shrink-0 text-muted hover:text-destructive"
                      onClick={() => void handleDelete(event)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                {event.body && (
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{event.body}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {nextCursor && (
        <Button
          variant="outline"
          size="sm"
          disabled={loadingMore}
          onClick={() => void load(nextCursor)}
        >
          {loadingMore ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            "Load earlier activity"
          )}
        </Button>
      )}
    </section>
  );
}
