import type { NextFunction, Request, Response } from "express";

/**
 * A small, dependency-free metrics registry.
 *
 * Why hand-rolled: the product ships as one Node process and an agency should
 * not have to run Prometheus, Grafana and a collector to answer "is the API
 * slow today?". The numbers here are the ones an on-call person actually
 * looks at — how many requests, how many failed, how long they took — plus
 * process memory, in the Prometheus text format so a real monitoring stack can
 * scrape it when one exists.
 *
 * Labels are deliberately coarse: the matched route, not the URL. A label per
 * record id would grow without bound and take the process down, which is a
 * classic way to turn monitoring into an outage.
 */

type Bucket = {
  method: string;
  status: string;
  route: string;
  count: number;
  durationMs: number;
};

const buckets = new Map<string, Bucket>();
let inFlight = 0;
let startedAt = Date.now();

const MAX_ROUTES = 500;

const escapeLabel = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Counts one request. Mounted before the routers so it sees every route. */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  inFlight += 1;
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    inFlight -= 1;
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = `${req.baseUrl || ""}${req.route?.path ?? ""}` || req.path || "unmatched";

    // A runaway set of labels is worse than no metric; collapse the tail.
    const key = `${req.method}|${res.statusCode}|${route}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.durationMs += durationMs;
      return;
    }
    if (buckets.size >= MAX_ROUTES) {
      const overflow = buckets.get("other|0|other");
      if (overflow) {
        overflow.count += 1;
        overflow.durationMs += durationMs;
      } else {
        buckets.set("other|0|other", {
          method: "other",
          status: "0",
          route: "other",
          count: 1,
          durationMs,
        });
      }
      return;
    }
    buckets.set(key, {
      method: req.method,
      status: String(res.statusCode),
      route,
      count: 1,
      durationMs,
    });
  });

  next();
}

/** Renders everything as Prometheus text exposition format. */
export function renderMetrics(): string {
  const memory = process.memoryUsage();
  const lines: string[] = [];

  lines.push("# HELP traveldesk_http_requests_total Requests handled, by method, status and route.");
  lines.push("# TYPE traveldesk_http_requests_total counter");
  for (const bucket of buckets.values()) {
    lines.push(
      `traveldesk_http_requests_total{method="${escapeLabel(bucket.method)}",status="${escapeLabel(
        bucket.status,
      )}",route="${escapeLabel(bucket.route)}"} ${bucket.count}`,
    );
  }

  lines.push("# HELP traveldesk_http_request_duration_seconds_total Time spent handling requests.");
  lines.push("# TYPE traveldesk_http_request_duration_seconds_total counter");
  for (const bucket of buckets.values()) {
    lines.push(
      `traveldesk_http_request_duration_seconds_total{method="${escapeLabel(
        bucket.method,
      )}",status="${escapeLabel(bucket.status)}",route="${escapeLabel(
        bucket.route,
      )}"} ${(bucket.durationMs / 1000).toFixed(4)}`,
    );
  }

  lines.push("# HELP traveldesk_http_requests_in_flight Requests currently being handled.");
  lines.push("# TYPE traveldesk_http_requests_in_flight gauge");
  lines.push(`traveldesk_http_requests_in_flight ${inFlight}`);

  lines.push("# HELP traveldesk_process_uptime_seconds Seconds since this process started.");
  lines.push("# TYPE traveldesk_process_uptime_seconds gauge");
  lines.push(`traveldesk_process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`);

  lines.push("# HELP traveldesk_process_resident_memory_bytes Resident memory size.");
  lines.push("# TYPE traveldesk_process_resident_memory_bytes gauge");
  lines.push(`traveldesk_process_resident_memory_bytes ${memory.rss}`);

  lines.push("# HELP traveldesk_nodejs_heap_used_bytes V8 heap in use.");
  lines.push("# TYPE traveldesk_nodejs_heap_used_bytes gauge");
  lines.push(`traveldesk_nodejs_heap_used_bytes ${memory.heapUsed}`);

  return `${lines.join("\n")}\n`;
}

/** Exposed for tests. */
export function resetMetrics() {
  buckets.clear();
  inFlight = 0;
  startedAt = Date.now();
}
