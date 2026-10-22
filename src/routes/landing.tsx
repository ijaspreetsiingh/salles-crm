import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/crm/landing-page";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "Traveldesk — the CRM built for travel businesses" },
      {
        name: "description",
        content:
          "Enquiries, bookings, visas, invoices and your whole team — connected on one calm dashboard. Start a free trial today.",
      },
      { property: "og:title", content: "Traveldesk — the CRM built for travel businesses" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});
