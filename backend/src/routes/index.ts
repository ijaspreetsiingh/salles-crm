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
import notificationRoutes from "../modules/notifications.routes";
import dashboardRoutes from "../modules/dashboard.routes";
import reportRoutes from "../modules/reports.routes";
import assistantRoutes from "../modules/assistant.routes";
import conversationRoutes from "../modules/conversations.routes";
import workflowRoutes from "../modules/workflows.routes";
import integrationRoutes from "../modules/integrations.routes";
import billingRoutes from "../modules/billing.routes";
import searchRoutes from "../modules/search.routes";
import uploadRoutes from "../modules/uploads.routes";
import apiKeyRoutes from "../modules/apiKeys.routes";

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
  router.use("/custom-fields", customFieldRoutes);
  router.use("/tasks", taskRoutes);

  // Insights
  router.use("/dashboard", dashboardRoutes);
  router.use("/reports", reportRoutes);
  router.use("/audit", auditRoutes);
  router.use("/notifications", notificationRoutes);
  router.use("/search", searchRoutes);

  // Engagement
  router.use("/assistant", assistantRoutes);
  router.use("/conversations", conversationRoutes);
  router.use("/workflows", workflowRoutes);
  router.use("/integrations", integrationRoutes);

  // Commerce & files
  router.use("/billing", billingRoutes);
  router.use("/uploads", uploadRoutes);

  return router;
}
