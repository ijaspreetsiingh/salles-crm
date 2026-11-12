/**
 * FavoriteButton — star/unstar any record or module.
 *
 * Shows a filled star when starred, outline when not. Optimistic update:
 * the star fills immediately, then syncs to the server in the background.
 * On error it rolls back and shows a toast.
 */
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { addFavorite, checkFavorite, removeFavoriteByTarget } from "@/lib/api/favorites";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Props = {
  targetType: "record" | "module";
  targetId: string;
  /** If you already know the starred state, pass it to skip the check request. */
  initialStarred?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function FavoriteButton({
  targetType,
  targetId,
  initialStarred,
  size = "md",
  className,
}: Props) {
  const [starred, setStarred] = useState<boolean>(initialStarred ?? false);
  const [loading, setLoading] = useState(initialStarred === undefined);

  // If we don't know the initial state, check the server.
  useEffect(() => {
    if (initialStarred !== undefined) return;
    let cancelled = false;
    checkFavorite(targetType, targetId)
      .then(({ starred: s }) => {
        if (!cancelled) {
          setStarred(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId, initialStarred]);

  const toggle = async () => {
    if (loading) return;
    const prev = starred;
    setStarred(!starred); // optimistic
    try {
      if (prev) {
        await removeFavoriteByTarget(targetType, targetId);
      } else {
        await addFavorite(targetType, targetId);
      }
    } catch (err) {
      setStarred(prev); // rollback
      toast.error(errorMessage(err, "Could not update favorites"));
    }
  };

  const iconSize = size === "sm" ? "size-3.5" : "size-4";

  return (
    <button
      type="button"
      aria-label={starred ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={starred}
      title={starred ? "Remove from favorites" : "Add to favorites"}
      disabled={loading}
      onClick={() => void toggle()}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        starred
          ? "text-amber-400 hover:text-amber-500"
          : "text-muted hover:text-foreground",
        loading && "opacity-40",
        className,
      )}
    >
      <Star
        className={cn(iconSize, starred && "fill-amber-400")}
        aria-hidden
      />
    </button>
  );
}
