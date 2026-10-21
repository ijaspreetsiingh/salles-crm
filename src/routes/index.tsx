import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/crm/home";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Traveldesk" },
      {
        name: "description",
        content: "What needs you today: enquiries to answer, invoices to chase, trips to prepare.",
      },
      { property: "og:title", content: "Today — Traveldesk" },
      {
        property: "og:description",
        content: "A short list of the things that need doing, in order.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});
