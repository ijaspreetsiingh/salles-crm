import { createFileRoute } from "@tanstack/react-router";

/**
 * The platform super admin portal. AuthGate renders the standalone portal for
 * this path (outside the travel-company workspace shell), so the route
 * component itself stays empty — see AuthGate in login.tsx.
 */
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Platform admin — Traveldesk" }],
  }),
  component: () => null,
});
