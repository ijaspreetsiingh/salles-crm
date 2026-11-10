import { describe, expect, it } from "vitest";
import { renderMetrics, resetMetrics } from "../src/lib/metrics";

/**
 * The metrics endpoint is what an on-call person reads at 2am. The format is
 * part of the contract: Prometheus rejects a file it cannot parse, and a
 * silently broken scrape is worse than no scrape.
 */
describe("metrics exposition", () => {
  it("renders valid Prometheus text with the core series", () => {
    resetMetrics();
    const text = renderMetrics();
    expect(text).toContain("# TYPE traveldesk_http_requests_total counter");
    expect(text).toContain("traveldesk_http_requests_in_flight 0");
    expect(text).toMatch(/traveldesk_process_resident_memory_bytes \d+/);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("starts empty, so a fresh process reports no traffic", () => {
    resetMetrics();
    const text = renderMetrics();
    expect(text).not.toContain('traveldesk_http_requests_total{method="GET"');
  });
});
