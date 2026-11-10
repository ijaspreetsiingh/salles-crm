/**
 * REST client for the Traveldesk API.
 *
 * Responsibilities:
 *  - resolve the API base URL from `VITE_API_URL`
 *  - attach the bearer access token to every request
 *  - unwrap the `{ success, data }` / `{ success:false, error }` envelope
 *  - transparently rotate the access token with the refresh token on a 401
 */

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;

export const API_BASE_URL = (env["VITE_API_URL"] ?? "http://localhost:4000/api/v1").replace(
  /\/+$/,
  "",
);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Waits before retrying, with a little jitter so many tabs do not wake up
 * at the same moment.
 */
const backoff = (attempt: number) =>
  new Promise<void>((resolve) => {
    const wait = Math.min(4_000, 400 * 2 ** attempt) + Math.random() * 250;
    setTimeout(resolve, wait);
  });

/**
 * Runs a request, retrying a couple of times when the server asks us to
 * slow down. A person should never see a blank screen because the app was
 * slightly too eager.
 */
async function withRetry<T>(run: () => Promise<Response>, useAuth: boolean): Promise<Response> {
  let response = await run();
  let attempt = 0;
  while (response.status === 429 && attempt < 3) {
    const retryAfter = Number(response.headers.get("retry-after") ?? 0);
    if (retryAfter > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(retryAfter, 5_000) * 1000));
    } else {
      await backoff(attempt);
    }
    attempt += 1;
    response = await run();
  }
  void useAuth;
  return response;
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const storage = (): Storage | null => (typeof window === "undefined" ? null : window.localStorage);

/**
 * Access tokens are held in memory only.
 *
 * The server already issues an httpOnly `access_token` cookie and rotates it
 * with an httpOnly refresh cookie, so a page refresh recovers the session
 * without any script ever being able to read the token. Older builds wrote the
 * token to localStorage; those keys are removed the first time this module
 * loads so an XSS bug cannot replay a stale token.
 */
const LEGACY_ACCESS_KEY = "traveldesk.accessToken";
const LEGACY_REFRESH_KEY = "traveldesk.refreshToken";

let memoryAccessToken: string | null = null;

function clearLegacyTokens(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(LEGACY_ACCESS_KEY);
  store.removeItem(LEGACY_REFRESH_KEY);
}

export const tokenStore = {
  get access(): string | null {
    return memoryAccessToken;
  },
  get refresh(): string | null {
    // The refresh token lives in an httpOnly cookie; JavaScript must not see it.
    return null;
  },
  set(access: string | null, _refresh?: string | null) {
    memoryAccessToken = access || null;
    clearLegacyTokens();
  },
  clear() {
    memoryAccessToken = null;
    clearLegacyTokens();
  },
};

// Run once on import (browser only).
clearLegacyTokens();

/** CSRF cookie is intentionally readable — that is how double-submit works. */
const readCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
};

type Query = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Send the bearer token (default true). Set false for login/register. */
  auth?: boolean;
};

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exchanges the stored refresh token for a new token pair. */
async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    if (!response.ok) return false;
    const payload = (await response.json().catch(() => null)) as {
      data?: { accessToken?: string; refreshToken?: string };
    } | null;
    const data = payload?.data;
    if (data?.accessToken) tokenStore.set(data.accessToken, data.refreshToken ?? undefined);
    return true;
  } catch {
    return false;
  }
}

/**
 * A request that never reached the API is not a server error and not a wrong
 * password — saying "Failed to fetch" hides that. This is the sentence the
 * sign-in card shows instead, with the address the browser actually tried.
 */
const unreachable = () =>
  new ApiError(
    0,
    "network_error",
    `Can't reach the server at ${API_BASE_URL}. Check your internet connection and that the API is running, then try again.`,
  );

/** `withRetry`, but a dead network reads as a sentence rather than "Failed to fetch". */
async function sendWithRetry(send: () => Promise<Response>, useAuth: boolean): Promise<Response> {
  try {
    return await withRetry(send, useAuth);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unreachable();
  }
}

/** Performs a request and returns the unwrapped `data` payload. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const useAuth = options.auth ?? true;

  const send = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const token = tokenStore.access;
    if (useAuth && token) headers["Authorization"] = `Bearer ${token}`;
    const csrf = readCookie("csrf_token");
    if (csrf && method !== "GET") headers["X-CSRF-Token"] = csrf;
    const init: RequestInit = {
      method,
      headers,
      credentials: "include",
      signal: options.signal ?? null,
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    return fetch(buildUrl(path, options.query), init);
  };

  let response: Response;
  try {
    response = await sendWithRetry(send, useAuth);
  } catch {
    throw unreachable();
  }

  if (response.status === 401 && useAuth) {
    refreshInFlight =
      refreshInFlight ??
      refreshSession().finally(() => {
        refreshInFlight = null;
      });
    const refreshed = await refreshInFlight;
    if (refreshed) {
      try {
        response = await sendWithRetry(send, useAuth);
      } catch {
        throw unreachable();
      }
    }
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  const envelope = payload as {
    success?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string; requestId?: string };
  } | null;

  if (!response.ok || envelope?.success === false) {
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? response.statusText ?? "Request failed",
      envelope?.error?.requestId,
    );
  }

  if (envelope && typeof envelope === "object" && "data" in envelope) {
    return envelope.data as T;
  }
  return payload as T;
}

/** Uploads multipart form data (files) and unwraps the envelope. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const useAuth = true;
  const send = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = tokenStore.access;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const csrf = readCookie("csrf_token");
    if (csrf) headers["X-CSRF-Token"] = csrf;
    return fetch(buildUrl(path), { method: "POST", headers, body: form, credentials: "include" });
  };

  let response = await sendWithRetry(send, useAuth);
  if (response.status === 401) {
    refreshInFlight =
      refreshInFlight ??
      refreshSession().finally(() => {
        refreshInFlight = null;
      });
    if (await refreshInFlight) response = await sendWithRetry(send, useAuth);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  const envelope = payload as {
    success?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string; requestId?: string };
  } | null;
  if (!response.ok || envelope?.success === false) {
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? response.statusText ?? "Upload failed",
      envelope?.error?.requestId,
    );
  }
  return (envelope?.data ?? payload) as T;
}

/** Fetches a raw (non-JSON) response body such as a CSV export. */
export async function apiDownload(path: string, query?: Query): Promise<string> {
  const useAuth = true;
  const send = () => {
    const headers: Record<string, string> = { Accept: "text/csv, text/plain, */*" };
    const token = tokenStore.access;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(buildUrl(path, query), { method: "GET", headers, credentials: "include" });
  };

  let response = await sendWithRetry(send, useAuth);
  if (response.status === 401) {
    refreshInFlight =
      refreshInFlight ??
      refreshSession().finally(() => {
        refreshInFlight = null;
      });
    if (await refreshInFlight) response = await sendWithRetry(send, useAuth);
  }
  if (!response.ok)
    throw new ApiError(response.status, `HTTP_${response.status}`, response.statusText);
  return response.text();
}

/** Fetches a binary response body (file downloads) with the bearer token attached. */
export async function apiBlob(path: string, query?: Query): Promise<Blob> {
  const useAuth = true;
  const send = () => {
    const headers: Record<string, string> = { Accept: "*/*" };
    const token = tokenStore.access;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(buildUrl(path, query), { method: "GET", headers, credentials: "include" });
  };

  let response = await sendWithRetry(send, useAuth);
  if (response.status === 401) {
    refreshInFlight =
      refreshInFlight ??
      refreshSession().finally(() => {
        refreshInFlight = null;
      });
    if (await refreshInFlight) response = await sendWithRetry(send, useAuth);
  }
  if (!response.ok)
    throw new ApiError(response.status, `HTTP_${response.status}`, response.statusText);
  return response.blob();
}
