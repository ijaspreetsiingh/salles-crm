import { useMemo, type ReactNode } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, type RecordRow } from "@/lib/crm/catalog";
import { Avatar, EmptyState, Meter } from "../ui";
import { Status } from "../common";

/* ==========================================================================
   A4 — Catalogue.

   A card grid for things you browse rather than scan: customers, hotels,
   packages, website pages. Every card answers three questions without a
   click — what is it, who is it for, and how is it doing.
   ========================================================================== */

export type CatalogueCard = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  meta: Array<{ label: string; value: ReactNode }>;
  /** Optional 0–100 score shown as a meter. */
  score?: { pct: number; label: string };
  tags?: string[];
  footer?: ReactNode;
  onOpen: () => void;
};

export function Catalogue({
  cards,
  emptyTitle,
  emptyDescription,
  emptySteps,
  emptyIcon,
  emptyAction,
  columns = "auto",
}: {
  cards: CatalogueCard[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptySteps?: string[];
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  columns?: "auto" | 2 | 3 | 4;
}) {
  const gridClass =
    columns === "auto"
      ? "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      : columns === 2
        ? "sm:grid-cols-2"
        : columns === 3
          ? "sm:grid-cols-2 lg:grid-cols-3"
          : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle ?? "Nothing here yet"}
        description={emptyDescription}
        steps={emptySteps}
        actions={emptyAction}
      />
    );
  }

  return (
    <div className={cn("grid gap-3", gridClass)}>
      {cards.map((card) => (
        <article
          key={card.id}
          onClick={card.onOpen}
          className="glass-card group flex cursor-pointer flex-col p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop"
        >
          <div className="flex items-start gap-3">
            <Avatar name={card.title} size={38} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
                {card.title}
              </h3>
              {card.subtitle && (
                <p className="mt-0.5 truncate text-[11.5px] text-muted">{card.subtitle}</p>
              )}
            </div>
            {card.badge}
          </div>

          {card.meta.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {card.meta.map((item) => (
                <div key={item.label} className="rounded-[14px] bg-well px-2.5 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 truncate text-[12.5px] font-semibold text-foreground">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {card.score && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold uppercase tracking-wide text-faint">
                  {card.score.label}
                </span>
                <span className="font-bold text-foreground tabular-nums">
                  {Math.round(card.score.pct)}%
                </span>
              </div>
              <Meter pct={card.score.pct} />
            </div>
          )}

          {card.tags && card.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-well px-2.5 py-1 text-[10.5px] font-semibold text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {card.footer && <div className="mt-3">{card.footer}</div>}
        </article>
      ))}
    </div>
  );
}

/** Builds a catalogue card from a plain record. */
export function recordCard(
  row: RecordRow,
  currency: string,
  onOpen: () => void,
  extra?: Partial<CatalogueCard>,
): CatalogueCard {
  return {
    id: row.id,
    title: row.name,
    subtitle: row.destination || row.detail,
    badge: <Status value={row.status} />,
    meta: [
      { label: "Value", value: money(row.amount, currency) },
      { label: "Owner", value: row.owner || "Unassigned" },
    ],
    onOpen,
    ...extra,
  };
}

export { MapPin, Mail, Phone };
