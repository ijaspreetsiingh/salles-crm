import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { amadeusConfigured, searchFlightOffers } from "../services/amadeus";

const router = Router();
router.use(requireAuth);

const searchSchema = z.object({
  from: z.string().regex(/^[A-Za-z]{3}$/, "Use the 3-letter airport code (DEL)"),
  to: z.string().regex(/^[A-Za-z]{3}$/, "Use the 3-letter airport code (DPS)"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(9).default(1),
});

/** Real flight search through Amadeus when keys are configured. */
router.get(
  "/search",
  requireAuth,
  validate(searchSchema, "query"),
  asyncHandler(async (req, res) => {
    if (!amadeusConfigured()) {
      return ok(res, {
        configured: false,
        offers: [],
        message:
          "Live flight search needs Amadeus credentials. Add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET to your server settings.",
      });
    }
    const query = req.query as unknown as z.infer<typeof searchSchema>;
    const { offers, currency } = await searchFlightOffers({
      origin: query.from.toUpperCase(),
      destination: query.to.toUpperCase(),
      date: query.date,
      adults: query.adults,
    });
    return ok(res, { configured: true, offers, currency });
  }),
);

export default router;
