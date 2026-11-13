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
// New production-gap routes
import relationsRoutes from "../modules/relations.routes";
import timelineRoutes from "../modules/timeline.routes";
import savedViewsRoutes from "../modules/saved-views.routes";
import favoritesRoutes from "../modules/favorites.routes";
import preferencesRoutes from "../modules/preferences.routes";
import einvoiceRoutes from "../modules/einvoice.routes";
import exportRoutes from "../modules/export.routes";
// Priority module routes
import corporateRoutes from "../modules/corporate.routes";
import distributionRoutes from "../modules/distribution.routes";
import transfersExtRoutes from "../modules/transfers.routes";
import suppliersExtRoutes from "../modules/suppliers-ext.routes";
import operationsExtRoutes from "../modules/operations-ext.routes";
import moduleExtensionsRoutes from "../modules/module-extensions.routes";
import financeExtensionsRoutes from "../modules/finance-extensions.routes";
import assistantExtensionsRoutes from "../modules/assistant-extensions.routes";
import teamChatExtensionsRoutes from "../modules/team-chat-extensions.routes";
import privacyRoutes from "../modules/privacy.routes";
import attendanceRoutes from "../modules/attendance.routes";
import creditNoteRoutes from "../modules/creditNotes.routes";
import itineraryCatalogRoutes from "../modules/itinerary-catalog.routes";

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

  // Privacy (data-subject erasure) + attendance
  router.use("/privacy", privacyRoutes);
  router.use("/attendance", attendanceRoutes);
  router.use("/credit-notes", creditNoteRoutes);

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

  // New production-gap routes
  router.use("/relations", relationsRoutes);
  router.use("/timeline", timelineRoutes);
  router.use("/saved-views", savedViewsRoutes);
  router.use("/favorites", favoritesRoutes);
  router.use("/preferences", preferencesRoutes);
  router.use("/einvoice", einvoiceRoutes);
  router.use("/export", exportRoutes);
  // Priority module routes
  router.use("/corporate", corporateRoutes);
  router.use("/distribution", distributionRoutes);
  router.use("/transfers", transfersExtRoutes);
  router.use("/suppliers-ext", suppliersExtRoutes);
  router.use("/operations-ext", operationsExtRoutes);
  router.use("/ext", moduleExtensionsRoutes);
  router.use("/finance-ext", financeExtensionsRoutes);
  router.use("/assistant-ext", assistantExtensionsRoutes);
  router.use("/team-chat-ext", teamChatExtensionsRoutes);
  router.use("/itinerary-catalog", itineraryCatalogRoutes);

  return router;
}
