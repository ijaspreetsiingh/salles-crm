import { Building2, CalendarDays, Mail, MapPin, Phone, Star, UserRound } from "lucide-react";
import { Avatar, Status } from "./common";
import { money, type Module, type RecordRow } from "@/lib/crm/catalog";
import { cn } from "@/lib/utils";

/**
 * The "Cards" layout — the same card design the Customers grid uses
 * (avatar, headline detail, money well, status), generalised to every module.
 * Clicking anywhere on a card opens the right-side record panel.
 */
export function RecordCards({
  rows,
  module,
  currency,
  onOpen,
  emptyHint = "No records yet.",
}: {
  rows: RecordRow[];
  module: Module;
  currency: string;
  onOpen: (row: RecordRow) => void;
  emptyHint?: string;
}) {
  if (rows.length === 0) {
    return <div className="glass-card p-10 text-center text-sm text-muted">{emptyHint}</div>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((row) => {
        const contactPhone = row.phone.replace(/[^\d+]/g, "");
        return (
          <article
            key={row.id}
            onClick={() => onOpen(row)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(row);
            }}
            tabIndex={0}
            role="button"
            aria-label={`Open ${module.noun} ${row.id} — ${row.name}`}
            className="glass-card group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:shadow-pop"
          >
            <div className="flex items-start justify-between">
              <Avatar name={row.name || row.id} size="normal" />
              {row.status === "VIP" && (
                <span
                  className="grid size-8 place-items-center rounded-full bg-butter text-on-butter"
                  title="VIP"
                >
                  <Star className="size-4 fill-current" />
                </span>
              )}
            </div>
            <h3 className="mt-3 truncate text-base font-bold tracking-tight">
              {row.name || row.id}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {row.id}
              {row.destination ? ` · ${row.destination}` : ""}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-well p-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-muted">Amount</div>
                <div className="truncate text-sm font-bold">
                  {money(row.amount, row.currency || currency)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-muted">Date</div>
                <div className="truncate text-sm font-bold">
                  {row.date
                    ? new Date(row.date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })
                    : "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <Status value={row.status} />
              {row.owner && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-semibold">
                  <UserRound className="size-3" /> {row.owner.split(" ")[0]}
                </span>
              )}
              {row.branch && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-semibold">
                  <Building2 className="size-3" /> {row.branch}
                </span>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-muted">
                {(row.destination || row.detail) && <MapPin className="size-3 shrink-0" />}
                <span className="truncate">{row.detail || "Click for full details"}</span>
              </span>
              <div className="flex gap-1.5 opacity-70 transition-opacity group-hover:opacity-100">
                {row.email && (
                  <a
                    href={`mailto:${row.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
                    title={`Email ${row.email}`}
                  >
                    <Mail className="size-3.5" />
                  </a>
                )}
                {contactPhone && (
                  <a
                    href={`tel:${contactPhone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
                    title={`Call ${contactPhone}`}
                  >
                    <Phone className="size-3.5" />
                  </a>
                )}
                {row.date && (
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full border border-line text-muted",
                    )}
                    title={new Date(row.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  >
                    <CalendarDays className="size-3.5" />
                  </span>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
