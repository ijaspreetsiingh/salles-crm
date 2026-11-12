import express, { type Express, type Request } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env, isProd } from "./config/env";
import { logger } from "./lib/logger";
import { requestContext } from "./middlewares/requestContext";
import { metricsMiddleware } from "./lib/metrics";
import { apiLimiter } from "./middlewares/rateLimit";
import { errorHandler, notFoundHandler } from "./middlewares/error";
import { securityHeaders } from "./middlewares/security";
import { csrfProtection } from "./middlewares/csrf";
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
  app.use(
    express.json({
      limit: "2mb",
      /*
       * Keep the exact bytes of every JSON body. Payment webhooks are signed
       * over the raw payload — re-serialising the parsed object changes the
       * bytes (key order, spacing) and makes every signature check fail.
       */
      verify: (req, _res, buffer) => {
        (req as Request & { rawBody?: string }).rawBody = buffer.toString("utf8");
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(securityHeaders);
  app.use(requestContext);
  // Counted before the routers so every route is measured, including 404s.
  app.use(metricsMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId: string }).requestId,
      autoLogging: {
        ignore: (req) => req.url?.includes("/health") || req.url?.includes("/ready") || false,
      },
      /*
       * Access logs keep the path and drop the query string. The customer
       * portal lookup takes `?email=`, and the inbound webhooks accept a
       * `?secret=`; writing either into a log file copies personal data and a
       * credential into whatever ships logs off the box.
       */
      serializers: {
        req: (req: {
          id?: string;
          method?: string;
          url?: string;
          remoteAddress?: string;
          remotePort?: number;
        }) => ({
          id: req.id,
          method: req.method,
          url: (req.url ?? "").split("?")[0],
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort,
        }),
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

  app.use("/api/v1", apiLimiter, csrfProtection, buildRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
