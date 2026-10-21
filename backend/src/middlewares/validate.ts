import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { BadRequestError } from "../lib/errors";

type Source = "body" | "query" | "params";

/** Validates and coerces a request segment against a Zod schema. */
export function validate(schema: ZodTypeAny, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new BadRequestError("Validation failed", flatten(result.error)));
    }
    // Express 4 keeps `query` as a getter on some versions; assign defensively.
    if (source === "query") {
      Object.defineProperty(req, "query", { value: result.data, configurable: true });
    } else {
      req[source] = result.data;
    }
    next();
  };
}

export function flatten(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}
