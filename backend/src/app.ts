import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env, isProd } from "./config/env";
import { logger } from "./lib/logger";
import { requestContext } from "./middlewares/requestContext";
import { apiLimiter } from "./middlewares/rateLimit";
import { errorHandler, notFoundHandler } from "./middlewares/error";
import { buildRoutes } from "./routes";

/** Builds the Express application (kept separate from listen() for tests). */
export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        // Outside production, accept any localhost/127.0.0.1 port so the Vite dev
        // server keeps working when it falls back to a free port.
        if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId: string }).requestId,
      autoLogging: {
        ignore: (req) => req.url?.includes("/health") || req.url?.includes("/ready") || false,
      },
    }),
  );

  app.get("/", (_req, res) => {
    res.json({
      success: true,
      data: {
        name: "Traveldesk API",
        version: "1.0.0",
        docs: "/api/v1/meta",
        health: "/api/v1/health",
      },
    });
  });

  app.use("/api/v1", apiLimiter, buildRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
