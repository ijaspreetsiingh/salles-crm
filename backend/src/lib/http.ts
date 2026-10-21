import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Wraps async handlers so rejected promises reach the global error middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Standard success envelope used by every endpoint. */
export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T) {
  return res.status(201).json({ success: true, data });
}

export function noContent(res: Response) {
  return res.status(204).send();
}
