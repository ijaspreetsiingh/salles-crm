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

const ACCESS_KEY = "traveldesk.accessToken";
const REFRESH_KEY = "traveldesk.refreshToken";

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

export const tokenStore = {
  get access(): string | null {
    return storage()?.getItem(ACCESS_KEY) ?? null;
  },
  get refresh(): string | null {
    return storage()?.getItem(REFRESH_KEY) ?? null;
  },
  set(access: string | null, refresh?: string | null) {
    const store = storage();
    if (!store) return;
    if (access) store.setItem(ACCESS_KEY, access);
    else store.removeItem(ACCESS_KEY);
    if (refresh !== undefined) {
      if (refresh) store.setItem(REFRESH_KEY, refresh);
      else store.removeItem(REFRESH_KEY);
    }
  },
  clear() {
    const store = storage();
    if (!store) return;
    store.removeItem(ACCESS_KEY);
    store.removeItem(REFRESH_KEY);
  },
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
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;
  try {
    const response = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const payload = (await response.json().catch(() => null)) as {
      data?: { accessToken?: string; refreshToken?: string };
    } | null;
    const data = payload?.data;
    if (!data?.accessToken) return false;
    tokenStore.set(data.accessToken, data.refreshToken ?? refreshToken);
    return true;
  } catch {
    return false;
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
    const init: RequestInit = {
      method,
      headers,
      signal: options.signal ?? null,
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    return fetch(buildUrl(path, options.query), init);
  };

  let response = await withRetry(send, useAuth);

  if (response.status === 401 && useAuth && tokenStore.refresh) {
    refreshInFlight =
      refreshInFlight ??
      refreshSession().finally(() => {
        refreshInFlight = null;
      });
    const refreshed = await refreshInFlight;
    if (refreshed) response = await withRetry(send, useAuth);
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
    return fetch(buildUrl(path), { method: "POST", headers, body: form });
  };

  let response = await withRetry(send, useAuth);
  if (response.status === 401 && tokenStore.refresh) {
    refreshInFlight =
      refreshInFlight ??
      refreshSession().finally(() => {
        refreshInFlight = null;
      });
    if (await refreshInFlight) response = await withRetry(send, useAuth);
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
    return fetch(buildUrl(path, query), { method: "GET", headers });
  };

  let response = await withRetry(send, useAuth);
  if (response.status === 401 && tokenStore.refresh) {
    refreshInFlight =
      refreshInFlight ??
      refreshSession().finally(() => {
        refreshInFlight = null;
      });
    if (await refreshInFlight) response = await withRetry(send, useAuth);
  }
  if (!response.ok)
    throw new ApiError(response.status, `HTTP_${response.status}`, response.statusText);
  return response.text();
}

/** Fetches a binary response body (file downloads) with the bearer token attached. */
export async function apiBlob(path: string): Promise<Blob> {
  const useAuth = true;
  const send = () => {
    const headers: Record<string, string> = { Accept: "*/*" };
    const token = tokenStore.access;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(buildUrl(path), { method: "GET", headers });
  };

  let response = await withRetry(send, useAuth);
  if (response.status === 401 && tokenStore.refresh) {
    refreshInFlight =
      refreshInFlight ??
      refreshSession().finally(() => {
        refreshInFlight = null;
      });
    if (await refreshInFlight) response = await withRetry(send, useAuth);
  }
  if (!response.ok)
    throw new ApiError(response.status, `HTTP_${response.status}`, response.statusText);
  return response.blob();
}
