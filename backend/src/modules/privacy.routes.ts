import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError } from "../lib/errors";
import { eraseCustomerData } from "../services/data-erasure";

/**
 * Privacy operations. A data-subject request is an administrative action, so
 * it needs `delete` on the customers module (company admins hold it; sales
 * does not) and leaves an audit entry.
 */
const router = Router();
router.use(requireAuth);

const erasureSchema = z
  .object({
    email: z.string().email().max(160).optional(),
    phone: z.string().min(6).max(30).optional(),
    recordId: z.string().min(6).max(60).optional(),
    reason: z.string().max(300).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone || value.recordId), {
    message: "Provide email, phone or recordId so the right person is erased",
  });

router.post(
  "/erasure",
  requireModulePermission("customers", "delete"),
  validate(erasureSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof erasureSchema>;
    if (!body.recordId && !body.email && !body.phone) {
      throw new BadRequestError("Provide email, phone or recordId");
    }
    const summary = await eraseCustomerData(req.auth!.organizationId, body, req);
    return ok(res, summary);
  }),
);

export default router;
