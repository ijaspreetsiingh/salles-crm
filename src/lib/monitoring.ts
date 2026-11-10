/**
 * Optional error monitoring.
 *
 * If `VITE_SENTRY_DSN` is set we load Sentry lazily so the bundle stays small
 * when monitoring is disabled. If it is not set (the default) this module is a
 * no-op and the app behaves exactly as before.
 */
const DSN = (import.meta.env as Record<string, string | undefined>)["VITE_SENTRY_DSN"];

const SENTRY_MODULE = "@sentry/react";

export async function initMonitoring(): Promise<void> {
  if (!DSN) return;
  try {
    const Sentry = await import(/* @vite-ignore */ SENTRY_MODULE);
    Sentry.init({ dsn: DSN, tracesSampleRate: 0.1 });
  } catch {
    // Sentry is not installed — monitoring stays disabled.
  }
}

export function captureException(error: unknown): void {
  if (!DSN) return;
  void import(/* @vite-ignore */ SENTRY_MODULE)
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {
      /* ignore */
    });
}
