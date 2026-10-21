import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { env } from "../config/env";
import { randomToken } from "../lib/utils";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${randomToken(6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});

const dto = (a: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  moduleId: string | null;
  recordId: string | null;
  createdAt: Date;
}) => ({
  id: a.id,
  filename: a.filename,
  mimeType: a.mimeType,
  size: a.size,
  moduleId: a.moduleId,
  recordId: a.recordId,
  url: `${env.APP_URL}/api/v1/uploads/${a.id}`,
  createdAt: a.createdAt.toISOString(),
});

/** Uploads a document (passport scans, vouchers, invoices…) against a record. */
router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError("No file uploaded (use multipart field 'file')");

    const attachment = await prisma.attachment.create({
      data: {
        organizationId: req.auth!.organizationId,
        moduleId: (req.body.moduleId as string) || null,
        recordId: (req.body.recordId as string) || null,
        filename: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedById: req.auth!.apiKeyId ? null : req.auth!.userId,
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: attachment.moduleId ?? "inbox",
      recordId: attachment.recordId ?? attachment.id,
      label: `File uploaded: ${attachment.filename}`,
      req,
    });

    return created(res, dto(attachment));
  }),
);

/** Lists attachments, optionally scoped to a module or record. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { moduleId, recordId } = req.query as Record<string, string | undefined>;
    const attachments = await prisma.attachment.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        ...(moduleId ? { moduleId } : {}),
        ...(recordId ? { recordId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(res, attachments.map(dto));
  }),
);

/** Streams an attachment back to the client. */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!attachment) throw new NotFoundError("Attachment");

    const filePath = path.join(uploadDir, attachment.storedName);
    if (!fs.existsSync(filePath)) throw new NotFoundError("File");

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.filename)}"`);
    return fs.createReadStream(filePath).pipe(res);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!attachment) throw new NotFoundError("Attachment");

    const filePath = path.join(uploadDir, attachment.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.attachment.delete({ where: { id: attachment.id } });

    return ok(res, { deleted: true });
  }),
);

export default router;
