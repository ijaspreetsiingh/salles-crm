import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** Assigns a correlation id to every request for tracing across logs. */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
