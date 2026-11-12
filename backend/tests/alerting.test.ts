import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Alerts exist so an operator hears about a broken deployment from the software
 * instead of a customer. Two things must hold: the message actually leaves, and
 * a failing endpoint cannot flood the channel into being muted.
 */

process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/services/test";
process.env.ALERT_MIN_INTERVAL_MS = "60000";

const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
vi.stubGlobal("fetch", fetchMock);

const { alertingEnabled, resetAlertThrottle, sendAlert } = await import(
  "../src/services/alerting"
);

describe("alert webhook", () => {
  beforeEach(() => {
    resetAlertThrottle();
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => new Response("ok", { status: 200 }));
  });

  afterEach(() => {
    resetAlertThrottle();
  });

  it("is enabled only when a webhook is configured", () => {
    expect(alertingEnabled()).toBe(true);
  });

  it("posts a message the channel understands", async () => {
    const sent = await sendAlert({
      key: "http:POST:/bookings:internal_error",
      title: "POST /bookings failed (500)",
      body: "request abc-123",
      level: "error",
    });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/services/test");
    expect(String(init.body)).toContain("POST /bookings failed (500)");
    expect(String(init.body)).toContain("abc-123");
  });

  it("sends a repeated failure once, not on every request", async () => {
    const alert = { key: "same-failure", title: "Payment webhook failed" };

    expect(await sendAlert(alert)).toBe(true);
    expect(await sendAlert(alert)).toBe(false);
    expect(await sendAlert(alert)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a different failure as its own alert", async () => {
    expect(await sendAlert({ key: "a", title: "A failed" })).toBe(true);
    expect(await sendAlert({ key: "b", title: "B failed" })).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never throws when the webhook is down", async () => {
    fetchMock.mockImplementation(async () => new Response("nope", { status: 500 }));
    expect(await sendAlert({ key: "down", title: "Anything" })).toBe(false);

    fetchMock.mockImplementation(async () => {
      throw new Error("ECONNREFUSED");
    });
    resetAlertThrottle();
    expect(await sendAlert({ key: "down-2", title: "Anything" })).toBe(false);
  });
});
