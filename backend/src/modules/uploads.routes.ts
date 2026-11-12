import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { NotFoundError, BadRequestError, ForbiddenError } from "../lib/errors";
import { env } from "../config/env";
import { randomToken } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { scanFile } from "../services/virus-scan";
import { hasPermission } from "../domain/rbac";

const router = Router();
router.use(requireAuth);

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
    // Sanitize: keep only safe extension chars, never allow .html/.php/.js
    const BLOCKED_EXTS = new Set([".html", ".htm", ".php", ".php3", ".php4", ".phtml", ".js", ".jsx", ".ts", ".tsx", ".sh", ".bash", ".cmd", ".bat", ".exe", ".dll", ".so"]);
    const safeExt = BLOCKED_EXTS.has(ext) ? ".bin" : ext;
    cb(null, `${Date.now()}-${randomToken(6)}${safeExt}`);
  },
});

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  },
});

/**
 * Magic-byte (file signature) verification.
 *
 * The Content-Type header is trivially spoofable, so after multer writes the
 * file to disk we read its first few bytes and check they match the claimed
 * type. A file that announces itself as a PDF but is actually an executable
 * never enters the workspace.
 *
 * Returns the detected MIME type, or null when the bytes don't match any known
 * signature.
 */
function detectMimeType(filePath: string): string | null {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(261);
    const bytesRead = fs.readSync(fd, buf, 0, 261, 0);
    if (bytesRead < 4) return null;

    // PDF: %PDF
    if (buf.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return "application/pdf";

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return "image/png";

    // GIF: GIF87a or GIF89a
    if (buf.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "image/gif";

    // RIFF....WEBP (WebP)
    if (
      buf.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) && // "RIFF"
      buf.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50])) // "WEBP"
    )
      return "image/webp";

    // OLE2 compound document (DOC, XLS — legacy MS Office)
    if (
      buf.subarray(0, 8).equals(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      )
    )
      return "application/msword";

    // ZIP archive (DOCX, XLSX are ZIP-based OOXML)
    if (
      buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05) && (buf[3] === 0x04 || buf[3] === 0x06)
    ) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    // Plain text (CSV / TXT) — check for printable ASCII/UTF-8 with no binary control chars
    const sample = buf.subarray(0, Math.min(bytesRead, 512));
    let isText = true;
    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];
      // Allow tab (9), newline (10), carriage return (13), printable ASCII (32-126),
      // and common UTF-8 continuation bytes (128+). Reject other control chars (0-8, 11, 12, 14-31).
      if (byte < 9 || (byte > 13 && byte < 32)) {
        isText = false;
        break;
      }
    }
    if (isText) return "text/plain";

    return null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Verifies that the file on disk matches one of the allowed MIME types by
 * reading its magic bytes. Throws BadRequestError on mismatch and deletes the
 * uploaded file so a spoofed file never lingers in the uploads directory.
 */
function verifyFileContent(filePath: string, claimedMime: string): string {
  const detected = detectMimeType(filePath);
  if (!detected) {
    safeUnlink(filePath);
    throw new BadRequestError(
      "The uploaded file does not match any allowed type. Its content could not be verified.",
    );
  }
  // The detected type may be more specific (image/jpeg vs application/msword)
  // or a sibling of the claimed type. Accept when both are in the allow-list
  // and they belong to the same family (image, pdf, office, text).
  if (detected === claimedMime) return detected;
  // Map ZIP-based OOXML: detected is docx-type but file may be xlsx — both are valid
  if (
    detected === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    (claimedMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      claimedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  ) {
    return claimedMime;
  }
  // OLE2 covers both .doc and .xls
  if (
    detected === "application/msword" &&
    (claimedMime === "application/msword" ||
      claimedMime === "application/vnd.ms-excel")
  ) {
    return claimedMime;
  }
  // Text covers both .txt and .csv
  if (detected === "text/plain" && (claimedMime === "text/plain" || claimedMime === "text/csv")) {
    return claimedMime;
  }
  safeUnlink(filePath);
  throw new BadRequestError(
    `File content (${detected}) does not match the claimed type (${claimedMime}). The upload was rejected for security.`,
  );
}

/** Deletes a file without throwing if it doesn't exist. */
function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* already gone */
  }
}

const dto = (a: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  moduleId: string | null;
  recordId: string | null;
  scanStatus?: string;
  scannedAt?: Date | null;
  createdAt: Date;
}) => ({
  id: a.id,
  filename: a.filename,
  mimeType: a.mimeType,
  size: a.size,
  moduleId: a.moduleId,
  recordId: a.recordId,
  // "clamav:clean" means a real scan; "eicar-only:clean" means no daemon was
  // configured, and the screen can say the file was not fully checked.
  scanStatus: a.scanStatus ?? "",
  scannedAt: a.scannedAt?.toISOString() ?? null,
  url: `${env.APP_URL}/api/v1/uploads/${a.id}`,
  createdAt: a.createdAt.toISOString(),
});

/**
 * Documents are the most sensitive rows in the workspace — passports, visas,
 * tickets, client invoices. Access is therefore checked twice: the file must
 * belong to the caller's organisation, and the caller must be allowed to work
 * in the module the file is filed under.
 */
function assertModuleAccess(
  auth: import("../types/express").AuthContext,
  moduleId: string | null,
  action: "view" | "create" | "delete",
): void {
  if (!moduleId) return;
  if (!hasPermission(auth.permissions, moduleId, action)) {
    throw new ForbiddenError(`Your role cannot ${action} documents in "${moduleId}"`);
  }
}

/** Uploads a document (passport scans, vouchers, invoices…) against a record. */
router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError("No file uploaded (use multipart field 'file')");

    const organizationId = req.auth!.organizationId;
    const moduleId = (req.body.moduleId as string) || null;
    const recordId = (req.body.recordId as string) || null;
    assertModuleAccess(req.auth!, moduleId, "create");

    // Verify the actual file content matches the claimed type — the
    // Content-Type header can be spoofed, so we read the magic bytes.
    const verifiedMime = verifyFileContent(req.file.path, req.file.mimetype);

    /*
     * Malware scan before the file becomes part of the workspace. Magic bytes
     * only prove what a file claims to be; a real virus has the right header.
     * With ClamAV configured an unreachable daemon fails the upload closed —
     * storing an unscanned passport scan is the risk we are trying to avoid.
     */
    const scan = await scanFile(req.file.path);
    if (!scan.clean) {
      safeUnlink(req.file.path);
      throw new BadRequestError(
        `The uploaded file was rejected by the malware scanner${
          scan.signature ? ` (${scan.signature})` : ""
        }.`,
      );
    }

    // A record id from another tenant must never become a place to hang a file.
    if (recordId) {
      const record = await prisma.record.findFirst({
        where: { id: recordId, organizationId },
        select: { id: true },
      });
      if (!record) {
        safeUnlink(req.file.path);
        throw new NotFoundError("Record");
      }
    }

    const attachment = await prisma.attachment.create({
      data: {
        organizationId,
        moduleId,
        recordId,
        filename: req.file.originalname,
        storedName: req.file.filename,
        mimeType: verifiedMime,
        size: req.file.size,
        scanStatus: `${scan.scanner}:clean`,
        scannedAt: new Date(),
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
    if (moduleId) assertModuleAccess(req.auth!, moduleId, "view");
    const permittedModules = req.auth!.permissions.modules;
    const attachments = await prisma.attachment.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        ...(moduleId ? { moduleId } : {}),
        ...(recordId ? { recordId } : {}),
        // Without an explicit module filter, list only files the caller may
        // see: unfiled documents, or documents from their own modules.
        ...(moduleId || permittedModules === "*"
          ? {}
          : { OR: [{ moduleId: null }, { moduleId: { in: permittedModules } }] }),
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
    assertModuleAccess(req.auth!, attachment.moduleId, "view");

    const filePath = path.join(uploadDir, attachment.storedName);
    // Path traversal guard: the resolved path must stay inside uploadDir.
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(uploadDir) + path.sep)) {
      throw new NotFoundError("File");
    }
    if (!fs.existsSync(resolved)) throw new NotFoundError("File");

    res.setHeader("Content-Type", attachment.mimeType);
    /*
     * Only images and PDFs are safe to render in the browser on the API
     * origin. Everything else is forced to download, so an uploaded document
     * can never execute script in the workspace's security context.
     */
    const inline = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/i.test(attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(attachment.filename)}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    return fs.createReadStream(resolved).pipe(res);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!attachment) throw new NotFoundError("Attachment");
    assertModuleAccess(req.auth!, attachment.moduleId, "delete");

    const filePath = path.join(uploadDir, attachment.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.attachment.delete({ where: { id: attachment.id } });

    return ok(res, { deleted: true });
  }),
);

export default router;
