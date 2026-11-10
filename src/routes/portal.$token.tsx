import { createFileRoute } from "@tanstack/react-router";
import { CustomerPortal } from "@/components/portal/customer-portal";

export const Route = createFileRoute("/portal/$token")({
  head: () => ({
    meta: [
      { title: "Your Booking — Traveldesk" },
      {
        name: "description",
        content: "View your booking, pay your invoice and download your travel documents.",
      },
    ],
  }),
  component: PortalPage,
});

function PortalPage() {
  const { token } = Route.useParams();
  return <CustomerPortal token={token} />;
}
