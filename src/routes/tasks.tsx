import { createFileRoute } from "@tanstack/react-router";
import { Tasks } from "@/components/crm/tasks";
export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks & Calendar — Traveldesk" },
      {
        name: "description",
        content: "Team follow-ups, travel deadlines and departure calendars for Horizon Travel.",
      },
      { property: "og:title", content: "Tasks & Calendar — Traveldesk" },
      { property: "og:description", content: "Keep every follow-up and travel deadline on track." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Tasks,
});
