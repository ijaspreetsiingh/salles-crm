import { createFileRoute } from "@tanstack/react-router";
import { Team } from "@/components/crm/team";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Your team — Traveldesk" },
      {
        name: "description",
        content:
          "Who is on the team, what they can see, and how much work each person is carrying.",
      },
      { property: "og:title", content: "Your team — Traveldesk" },
      {
        property: "og:description",
        content:
          "Who is on the team, what they can see, and how much work each person is carrying.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Team,
});
