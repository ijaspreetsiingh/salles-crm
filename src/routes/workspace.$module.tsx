import { createFileRoute, notFound } from "@tanstack/react-router";
import { findModule } from "@/lib/crm/catalog";
import { Workspace } from "@/components/crm/workspace";
export const Route = createFileRoute("/workspace/$module")({
  beforeLoad: ({ params }) => {
    if (!findModule(params.module)) throw notFound();
  },
  head: ({ params }) => {
    const m = findModule(params.module);
    return {
      meta: [
        { title: `${m?.name ?? "Workspace"} — Traveldesk` },
        { name: "description", content: m?.description ?? "Travel business workspace." },
        { property: "og:title", content: `${m?.name ?? "Workspace"} — Traveldesk` },
        { property: "og:description", content: m?.description ?? "Travel business workspace." },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ModulePage,
});
function ModulePage() {
  const { module: id } = Route.useParams();
  const module = findModule(id);
  if (!module) return null;
  return <Workspace module={module} key={id} />;
}
