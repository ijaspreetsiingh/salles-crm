import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { flatten } from "./validate";
import { ZodError } from "zod";
import { captureException } from "../services/sentry";
import { alertInBackground } from "../services/alerting";

/** Central error translator — turns any thrown error into a consistent payload. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = "internal_error";
  let message = "Something went wrong on our end";
  let details: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    code = "validation_failed";
    message = "Validation failed";
    details = flatten(err);
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      status = 409;
      code = "conflict";
      message = `A record with this ${String(err.meta?.target ?? "value")} already exists`;
    } else if (err.code === "P2025") {
      status = 404;
      code = "not_found";
      message = "Record not found";
    } else if (err.code === "P2003") {
      status = 400;
      code = "invalid_reference";
      message = "Related record does not exist";
    } else {
      status = 400;
      code = "database_error";
      message = "The request could not be completed";
    }
  } else if (err instanceof Error) {
    message = status === 500 ? "Something went wrong on our end" : err.message;
  }

  const logPayload = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    err,
  };
  if (status >= 500) logger.error(logPayload, message);
  else logger.warn({ requestId: req.requestId, path: req.originalUrl, code }, message);

  /*
   * A 5xx is the server admitting it broke a customer's action. Logging it is
   * not enough: the owner finds out by phone. Send it to Sentry when a DSN is
   * configured, and post a throttled message to the alert webhook when one is,
   * so the same broken route cannot fill the channel.
   */
  if (status >= 500) {
    const route = req.originalUrl.split("?")[0];
    void captureException(err, {
      requestId: req.requestId,
      method: req.method,
      path: route,
      status,
      code,
    }).catch(() => undefined);
    alertInBackground({
      key: `http:${req.method}:${route}:${code}`,
      title: `${req.method} ${route} failed (${status})`,
      body: `request ${req.requestId ?? "(no id)"} — ${message}`,
      level: "error",
    });
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId: req.requestId,
    },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: "route_not_found",
      message: `No route matches ${req.method} ${req.originalUrl}`,
      requestId: req.requestId,
    },
  });
}
