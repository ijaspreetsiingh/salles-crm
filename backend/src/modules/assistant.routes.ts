import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { env } from "../config/env";
import {
  buildItinerary,
  callModel,
  deterministicReply,
  workspaceSnapshot,
} from "../services/ai";

const router = Router();
router.use(requireAuth);

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().max(80).default("default"),
});

const itinerarySchema = z.object({
  destination: z.string().min(2).max(120),
  nights: z.coerce.number().int().min(1).max(30),
  travellers: z.coerce.number().int().min(1).max(60),
  interests: z.string().max(200).optional(),
});

const toDto = (m: { id: string; role: string; content: string; model: string | null; createdAt: Date }) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  model: m.model,
  createdAt: m.createdAt.toISOString(),
});

/** Conversational assistant grounded in the live workspace. */
router.post(
  "/chat",
  validate(chatSchema),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { message, conversationId } = req.body as z.infer<typeof chatSchema>;

    const history = await prisma.aiMessage.findMany({
      where: { organizationId: auth.organizationId, conversationId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    await prisma.aiMessage.create({
      data: { organizationId: auth.organizationId, userId: auth.userId, conversationId, role: "user", content: message },
    });

    const snap = await workspaceSnapshot(auth.organizationId);

    const live = await callModel([
      {
        role: "system",
        content: `You are Traveldesk Assistant for a travel agency. Be concise, practical and business-focused. Current workspace snapshot: ${JSON.stringify(snap)}.`,
      },
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: message },
    ]);

    const content = live ?? deterministicReply(message, snap);
    const model = live ? env.LLM_MODEL : "traveldesk-rules";

    const assistantMessage = await prisma.aiMessage.create({
      data: {
        organizationId: auth.organizationId,
        userId: auth.userId,
        conversationId,
        role: "assistant",
        content,
        model,
      },
    });

    return ok(res, {
      conversationId,
      reply: toDto(assistantMessage),
      suggestions: [
        "Draft a quotation for the Bali enquiry",
        "Which destination is performing best?",
        "Summarise my overdue payments",
        "Generate a 6-day Dubai itinerary",
      ],
    });
  }),
);

/** Loads conversation history (assistant workspace). */
router.get(
  "/messages",
  asyncHandler(async (req, res) => {
    const conversationId = (req.query.conversationId as string) || "default";
    const messages = await prisma.aiMessage.findMany({
      where: { organizationId: req.auth!.organizationId, conversationId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return ok(res, messages.map(toDto));
  }),
);

/** Clears a conversation. */
router.delete(
  "/conversation/:conversationId",
  asyncHandler(async (req, res) => {
    const result = await prisma.aiMessage.deleteMany({
      where: { organizationId: req.auth!.organizationId, conversationId: req.params.conversationId },
    });
    return ok(res, { cleared: result.count });
  }),
);

/** Itinerary generator with optional live model enrichment. */
router.post(
  "/itinerary",
  validate(itinerarySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof itinerarySchema>;
    const draft = buildItinerary(body);

    const live = await callModel([
      { role: "system", content: "You are a senior travel designer. Produce a polished day-by-day itinerary." },
      { role: "user", content: `Create a short itinerary. Destination: ${body.destination}, nights: ${body.nights}, travellers: ${body.travellers}, interests: ${body.interests ?? "general"}.` },
    ]);

    return ok(res, {
      destination: body.destination,
      nights: body.nights,
      travellers: body.travellers,
      itinerary: live ?? draft,
      generatedBy: live ? env.LLM_MODEL : "traveldesk-rules",
    });
  }),
);

export default router;
