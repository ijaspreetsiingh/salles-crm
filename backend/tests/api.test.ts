import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("platform endpoints", () => {
  it("returns a healthy status", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
  });

  it("exposes service metadata with the full module catalogue", async () => {
    const res = await request(app).get("/api/v1/meta");
    expect(res.status).toBe(200);
    expect(res.body.data.moduleCount).toBe(24);
    expect(res.body.data.modules).toContain("bookings");
  });

  it("returns a structured 404 for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("route_not_found");
    expect(res.body.error.requestId).toBeTruthy();
  });
});

describe("auth guards", () => {
  it("rejects protected routes without a token", async () => {
    const res = await request(app).get("/api/v1/workspace/leads/records");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("rejects invalid credentials with a validation envelope", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});
