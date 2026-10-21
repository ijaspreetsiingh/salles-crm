import { useState } from "react";
import { MoreHorizontal, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { money, stageMeta, type Deal } from "@/lib/crm-data";
import { AvatarStack } from "./ui";

const toneCls = {
  sun: "bg-sun/90 text-sun-foreground border border-sun/40 shadow-sm",
  forest: "bg-forest/90 text-forest-foreground border border-forest/40 shadow-sm",
  ember: "bg-ember/90 text-ember-foreground border border-ember/40 shadow-sm",
  ink: "bg-ink/90 text-ink-foreground border border-ink/40 shadow-sm",
};
const ringCls = { sun: "ring-sun", forest: "ring-forest", ember: "ring-ember", ink: "ring-ink" };

export function DealCard({
  deal,
  tall,
  showStage,
  onOpenDetails,
}: {
  deal: Deal;
  tall?: boolean;
  showStage?: boolean;
  onOpenDetails?: (deal: Deal) => void;
}) {
  const meta = stageMeta[deal.stage];
  const [starred, setStarred] = useState(false);

  const toggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !starred;
    setStarred(next);
    toast.success(next ? `Starred ${deal.title}` : `Unstarred ${deal.title}`);
  };

  return (
    <article
      onClick={() => onOpenDetails?.(deal)}
      className={cn(
        "group relative flex cursor-pointer flex-col rounded-3xl p-4.5 backdrop-blur-md transition-all duration-300",
        "hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/10 active:scale-[0.98]",
        toneCls[meta.tone],
        tall ? "min-h-56" : "min-h-40",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="rounded-full bg-black/15 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-sm">
          Closes {deal.closes}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleStar}
            aria-label="Star deal"
            className="grid size-7.5 place-items-center rounded-full border border-current/20 transition-all hover:scale-110 hover:bg-current/15"
          >
            <Star
              className={cn("size-3.5 transition-colors", starred ? "fill-current text-current" : "opacity-75")}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails?.(deal);
            }}
            aria-label="Deal actions"
            className="grid size-7.5 place-items-center rounded-full border border-current/20 transition-all hover:scale-110 hover:bg-current/15"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2.5">
        <h3 className="text-lg font-bold leading-snug tracking-tight transition-transform duration-200 group-hover:translate-x-0.5">
          {deal.title}
        </h3>
        <p className="mt-0.5 text-xs font-medium opacity-80">{deal.company}</p>
      </div>

      {/* Probability Progress Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-medium opacity-85">
          <span>{deal.stage}</span>
          <span>{meta.prob}% probability</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/20">
          <div
            className="h-full rounded-full bg-current transition-all duration-500"
            style={{ width: `${meta.prob}%` }}
          />
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between pt-4">
        <div>
          <div className="text-2xl font-bold tracking-tight">{money(deal.value)}</div>
          {showStage && (
            <div className="mt-0.5 text-[11px] font-medium opacity-75">
              Weighted: {money(Math.round(deal.value * (meta.prob / 100)))}
            </div>
          )}
        </div>
        <AvatarStack team={deal.team} size={26} ring={ringCls[meta.tone]} />
      </div>
    </article>
  );
}
