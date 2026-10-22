import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "@/components/crm/login";

export const Route = createFileRoute("/login")({
  component: LoginScreen,
});