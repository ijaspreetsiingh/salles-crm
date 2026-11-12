import { describe, expect, it } from "vitest";
import { WEBHOOK_MAX_ATTEMPTS, webhookBackoffMinutes } from "../src/services/webhook-dispatch";

/**
 * A webhook retry schedule is a promise to somebody else's system.
 *
 * Retry too fast and we look like an attack; retry too slowly and a booking
 * confirmation arrives after the guest has checked in. These tests pin the
 * schedule and the clamping at both ends.
 */
describe("webhook retry backoff", () => {
  it("follows the published schedule from the first retry", () => {
    expect(webhookBackoffMinutes(0)).toBe(1);
    expect(webhookBackoffMinutes(1)).toBe(5);
    expect(webhookBackoffMinutes(2)).toBe(15);
    expect(webhookBackoffMinutes(3)).toBe(60);
    expect(webhookBackoffMinutes(4)).toBe(240);
    expect(webhookBackoffMinutes(5)).toBe(720);
  });

  it("keeps the last step forever instead of jumping to undefined", () => {
    expect(webhookBackoffMinutes(6)).toBe(720);
    expect(webhookBackoffMinutes(50)).toBe(720);
    expect(webhookBackoffMinutes(Number.MAX_SAFE_INTEGER)).toBe(720);
  });

  it("never returns a zero or negative wait", () => {
    expect(webhookBackoffMinutes(-1)).toBe(1);
    expect(webhookBackoffMinutes(-1000)).toBe(1);
  });

  it("is monotonically slower — no retry sneaks in earlier than the last", () => {
    let previous = 0;
    for (let attempt = 0; attempt <= 10; attempt += 1) {
      const delay = webhookBackoffMinutes(attempt);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  it("gives up after a bounded number of attempts", () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBeGreaterThanOrEqual(5);
    expect(WEBHOOK_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
    // Eight attempts at this schedule is a bit over 17 hours of trying.
    const totalMinutes = Array.from({ length: WEBHOOK_MAX_ATTEMPTS }, (_, i) =>
      webhookBackoffMinutes(i),
    ).reduce((sum, minutes) => sum + minutes, 0);
    expect(totalMinutes).toBeGreaterThan(12 * 60);
    expect(totalMinutes).toBeLessThan(48 * 60);
  });
});
