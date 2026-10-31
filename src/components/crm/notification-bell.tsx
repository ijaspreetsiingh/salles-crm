/**
 * Notification bell with real-time unread count and mark-as-read.
 * Connects to the SSE stream opened in Workspace.
 */
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { Bell, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t, type Language } from "@/lib/crm/i18n";
import { cn } from "@/lib/utils";

export interface Notification {
  id: string;
  title: string;
  body?: string;
  moduleId?: string;
  recordId?: string;
  level: "info" | "warning" | "danger" | "success";
  createdAt?: string;
  read?: boolean;
}

interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  lang: Language;
  onOpenNotification?: (n: Notification) => void;
}

export function NotificationBell({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  lang,
  onOpenNotification,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  const markRead = useCallback((id: string) => {
    onMarkRead(id);
  }, [onMarkRead]);

  const levelColor = (level?: string) => {
    switch (level) {
      case "danger": return "text-destructive bg-destructive/10 border-destructive/20";
      case "warning": return "text-amber-600 bg-amber-50 border-amber-100";
      case "success": return "text-green-600 bg-green-50 border-green-100";
      default: return "text-ink bg-ink/5 border-ink/10";
    }
  };

  const openNotification = (n: Notification) => {
    onOpenNotification?.(n);
    if (!n.read) markRead(n.id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 w-[360px] max-h-[480px]">
        <DialogHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm">{t("notifications.title", lang)}</DialogTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onMarkAllRead}
                className="text-xs text-muted"
              >
                {t("notifications.mark_all_read", lang)}
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="p-3 overflow-y-auto max-h-[380px]">
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted">
              {t("notifications.no_notifications", lang)}
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-2 p-3 rounded-xl border cursor-pointer group hover:bg-accent transition-colors",
                    !n.read && "bg-accent/50 border-accent",
                    n.read && "bg-background border-line",
                  )}
                  onClick={() => openNotification(n)}
                >
                  <div className={cn("flex-shrink-0 p-1.5 rounded-lg", levelColor(n.level))}>
                    {n.level === "danger" ? (
                      <Bell className="size-4" />
                    ) : n.level === "warning" ? (
                      <AlertTriangle className="size-4" />
                    ) : n.level === "success" ? (
                      <Check className="size-4" />
                    ) : (
                      <Bell className="size-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1">
                      <h4 className={cn("text-sm font-semibold", !n.read && "text-foreground")}>
                        {n.title}
                      </h4>
                      {!n.read && (
                        <span className="text-xs font-medium text-muted">New</span>
                      )}
                    </div>
                    {n.body && (
                      <p className={cn("text-xs text-muted mt-0.5 line-clamp-2", !n.read && "text-foreground/80")}>
                        {n.body}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      {n.moduleId && (
                        <span className="text-[10px] text-muted uppercase tracking-wider">
                          {n.moduleId}
                        </span>
                      )}
                      {n.createdAt && (
                        <span className="text-[10px] text-muted">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {!n.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="p-1 ml-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead(n.id);
                          }}
                        >
                          <Check className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AlertTriangle(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.className ? undefined : 20}
      height={props.className ? undefined : 20}
      viewBox="0 0 20 20"
      fill="currentColor"
      className={props.className}
    >
      <path d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM9 10a1 1 0 011-1h2a1 1 0 112 2v2a1 1 0 11-2 0v-2H10a1 1 0 01-1-1zM12 9a1 1 0 100-2H9a1 1 0 000 2h3z" />
    </svg>
  );
}
