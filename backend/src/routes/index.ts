import { Router } from "express";
import healthRoutes from "../modules/health.routes";
import authRoutes from "../modules/auth.routes";
import organizationRoutes from "../modules/organization.routes";
import memberRoutes from "../modules/members.routes";
import roleRoutes from "../modules/roles.routes";
import customFieldRoutes from "../modules/customFields.routes";
import workspaceRoutes from "../modules/workspace.routes";
import taskRoutes from "../modules/tasks.routes";
import auditRoutes from "../modules/audit.routes";
import domainRoutes from "../modules/domains.routes";
import notificationRoutes from "../modules/notifications.routes";
import dashboardRoutes from "../modules/dashboard.routes";
import reportRoutes from "../modules/reports.routes";
import assistantRoutes from "../modules/assistant.routes";
import conversationRoutes from "../modules/conversations.routes";
import workflowRoutes from "../modules/workflows.routes";
import integrationRoutes from "../modules/integrations.routes";
import billingRoutes from "../modules/billing.routes";
import platformRoutes from "../modules/platform.routes";
import financeRoutes, { webhookRouter as razorpayWebhook } from "../modules/finance.routes";
import paymentRoutes from "../modules/payments.routes";
import payableRoutes from "../modules/payables.routes";
import expenseRoutes from "../modules/expenses.routes";
import hotelRateRoutes from "../modules/hotelRates.routes";
import campaignRoutes from "../modules/campaigns.routes";
import publicRoutes from "../modules/public.routes";
import flightsRoutes from "../modules/flights.routes";
import channelsRoutes from "../modules/channels.routes";
import commsRecordsRoutes from "../modules/comms-records.routes";
import searchRoutes from "../modules/search.routes";
import uploadRoutes from "../modules/uploads.routes";
import apiKeyRoutes from "../modules/apiKeys.routes";
import hotelAllotmentRoutes from "../modules/hotelAllotments.routes";
import groupRoutes from "../modules/groups.routes";
import visaRoutes from "../modules/visa.routes";
import tallyExportRoutes from "../modules/tally-export.routes";
import gstExportRoutes from "../modules/gst-export.routes";
import agentRoutes from "../modules/agents.routes";
import operationsRoutes from "../modules/operations.routes";
import inboundRoutes from "../modules/inbound.routes";
import packageRoutes from "../modules/packages.routes";
import teamChatRoutes from "../modules/team-chat.routes";
import hotelsRoutes from "../modules/hotels.routes";
import pushRoutes from "../modules/push.routes";
import pnrRoutes from "../modules/pnr.routes";
import portalRoutes from "../modules/portal.routes";
import reconciliationRoutes from "../modules/reconciliation.routes";
import integrationsTestRoutes from "../modules/integrations-test.routes";

/** Mounts every feature router under /api/v1. */
export function buildRoutes(): Router {
  const router = Router();

  // Platform (unauthenticated)
  router.use("/", healthRoutes);

  // Identity & tenancy
  router.use("/auth", authRoutes);
  router.use("/organizations", organizationRoutes);
  router.use("/members", memberRoutes);
  router.use("/roles", roleRoutes);
  router.use("/api-keys", apiKeyRoutes);

  // Workspace & records
  router.use("/workspace", workspaceRoutes);
  router.use("/packages", packageRoutes);
  router.use("/custom-fields", customFieldRoutes);
  router.use("/payments", paymentRoutes);
  router.use("/payables", payableRoutes);
  router.use("/expenses", expenseRoutes);
  router.use("/hotel-rates", hotelRateRoutes);
  router.use("/hotel-allotments", hotelAllotmentRoutes);
  router.use("/groups", groupRoutes);
  router.use("/visa", visaRoutes);
  router.use("/tally", tallyExportRoutes);
  router.use("/gst", gstExportRoutes);
  router.use("/agents", agentRoutes);
  router.use("/operations", operationsRoutes);

  // Inbound email / WhatsApp webhooks (no auth — the sender is a provider)
  router.use("/inbound", inboundRoutes);
  router.use("/campaigns", campaignRoutes);
  router.use("/tasks", taskRoutes);

  // Team Chat
  router.use("/team-chat", teamChatRoutes);

  // Hotel search + contract rates
  router.use("/hotels", hotelsRoutes);

  // Browser push notifications (VAPID)
  router.use("/push", pushRoutes);

  // Flight PNR queue
  router.use("/pnr", pnrRoutes);

  // Customer self-service portal (public token-based + staff token generator)
  router.use("/portal", portalRoutes);

  // Payment reconciliation
  router.use("/reconciliation", reconciliationRoutes);

  // Insights
  router.use("/dashboard", dashboardRoutes);
  router.use("/reports", reportRoutes);
  router.use("/audit", auditRoutes);
  router.use("/domains", domainRoutes);
  router.use("/notifications", notificationRoutes);
  router.use("/search", searchRoutes);

  // Engagement
  router.use("/assistant", assistantRoutes);
  router.use("/conversations", conversationRoutes);
  router.use("/comms", commsRecordsRoutes);
  router.use("/workflows", workflowRoutes);
  router.use("/integrations", integrationRoutes);
  router.use("/integrations/test", integrationsTestRoutes);
  router.use("/channels", channelsRoutes);

  // Commerce & files
  router.use("/billing", billingRoutes);
  router.use("/platform", platformRoutes);
  router.use("/finance", financeRoutes);
  router.use("/flights", flightsRoutes);
  router.use("/uploads", uploadRoutes);

  // Public lead capture for every travel company's website
  router.use("/public", publicRoutes);

  // Signature-verified payment webhooks (no auth middleware)
  router.use("/webhooks/razorpay", razorpayWebhook);

  return router;
}
