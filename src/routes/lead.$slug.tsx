import { createFileRoute } from "@tanstack/react-router";
import { LeadFormPage } from "@/components/crm/lead-form-page";

export const Route = createFileRoute("/lead/$slug")({
  head: () => ({
    meta: [
      { title: "Plan my trip — enquiry" },
      {
        name: "description",
        content: "Send your trip details to the travel desk and get a plan within one working day.",
      },
    ],
  }),
  component: LeadFormPage,
});
