import { Router } from "express";
import { asyncHandler } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { generatePackagePdf } from "../services/package-pdf";

const router = Router();
router.use(requireAuth);

/**
 * The package itself as a PDF: itinerary, inclusions, price by group size and
 * terms. A travel agency hands this to a customer before any quotation exists,
 * so it is not behind the money endpoints.
 */
router.get(
  "/:reference/package.pdf",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { filename, stream } = await generatePackagePdf({
      organizationId: req.auth!.organizationId,
      reference: req.params.reference,
    });
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
      stream.end();
    });
    const pdf = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  }),
);

export default router;
