import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/crm/dashboard";
export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "How the business is doing — Traveldesk" },
      {
        name: "description",
        content:
          "Revenue, pipeline, departures and what needs attention across your travel business.",
      },
      { property: "og:title", content: "How the business is doing — Traveldesk" },
      {
        property: "og:description",
        content: "Revenue, pipeline, departures and what needs attention.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
