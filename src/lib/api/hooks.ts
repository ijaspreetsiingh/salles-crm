import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./client";

/**
 * Minimal data-fetching hook for API-backed panels.
 *
 * Only runs when `enabled` is true (i.e. once a session exists), so
 * unauthenticated renders — and unit tests — never touch the network.
 */
export function useApiQuery<T>(fetcher: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    fetcher()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(errorMessage(err, "Could not load data"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reloadKey, ...deps]);

  return { data, loading, error, setData, reload };
}
