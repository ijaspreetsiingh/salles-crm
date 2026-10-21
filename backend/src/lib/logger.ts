import pino from "pino";
import { isProd } from "../config/env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  base: { service: "traveldesk-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    remove: true,
  },
  transport: isProd
    ? undefined
    : {
        target: "pino/file",
        options: { destination: 1 },
      },
});
