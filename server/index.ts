import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations, seedHomepageContent } from "./migrate";
import { pool, waitForDatabase } from "./db";
import { setupWebSocket } from "./websocketService";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import * as Sentry from "@sentry/node";
import { logger } from "./logger";
import crypto from "crypto";

// Prevent unhandled errors from killing the process before the port binds
process.on("uncaughtException", (err) =>
  logger.fatal({ err }, "Uncaught exception"),
);
process.on("unhandledRejection", (err) =>
  logger.fatal({ err }, "Unhandled rejection"),
);

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = (process.env.APP_ORIGIN || process.env.APP_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Allow non-browser clients (no Origin header)
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(
  helmet({
    // Enable CSP later once frontend sources are finalized.
    contentSecurityPolicy: false,
  }),
);

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  });
  app.use((req, _res, next) => {
    try {
      Sentry.setContext("request", {
        method: req.method,
        url: req.originalUrl,
        headers: {
          origin: req.headers.origin,
          referer: req.headers.referer,
          "user-agent": req.headers["user-agent"],
        },
      });
    } catch {}
    next();
  });
}

app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers["x-request-id"];
      const id = Array.isArray(existing) ? existing[0] : existing;
      if (id) return id;
      const newId = crypto.randomUUID();
      res.setHeader("x-request-id", newId);
      return newId;
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req(req) {
        return {
          id: (req as any).id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort,
          headers: {
            "user-agent": req.headers["user-agent"],
            origin: req.headers.origin,
            referer: req.headers.referer,
          },
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

// CSRF-ish guard for cookie-based sessions:
// For state-changing API requests (except webhooks), require Origin/Referer to match allowlist.
app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (!isStateChanging) return next();
  if (!req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/api/payment/razorpay/webhook")) return next();
  if (req.path.startsWith("/api/payment/snapmint/callback")) return next();
  if (req.path.startsWith("/api/payment/lazypay/callback")) return next();

  // Only enforce when cookies are present (browser session context)
  const hasCookie = Boolean(req.headers.cookie);
  if (!hasCookie) return next();

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowed = allowedOrigins.length ? allowedOrigins : undefined;

  // If no allowlist configured, allow in dev; block in prod for safety.
  if (!allowed) {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "CSRF protection: APP_ORIGIN not configured" });
    }
    return next();
  }

  if (origin && allowed.includes(origin)) return next();
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (allowed.includes(refOrigin)) return next();
    } catch {}
  }
  return res.status(403).json({ message: "Forbidden" });
});

// ── Create the HTTP server and bind the port FIRST so the healthcheck
//    can succeed while the rest of the stack (auth, DB, etc.) initialises. ──

const httpServer = createServer(app);

// Register /api/config immediately so Railway's healthcheck gets a 200
// before the async init (auth, DB) completes.
app.get("/api/config", (_req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    agoraAppId: process.env.AGORA_APP_ID || "",
  });
});

// Liveness: process is up (no DB dependency)
app.get("/api/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: DB is reachable (and therefore API can serve requests safely)
app.get("/api/readyz", async (_req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ status: "not_ready", reason: "DATABASE_URL_not_set" });
  }
  try {
    await pool.query("select 1 as ok");
    res.status(200).json({ status: "ready" });
  } catch (err: any) {
    res.status(503).json({ status: "not_ready", reason: "db_unreachable", message: err?.message });
  }
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  log(`serving on port ${port}`);
});

let wsServer: ReturnType<typeof setupWebSocket> | undefined;

async function shutdown(signal: string) {
  logger.warn({ signal }, "Shutdown requested. Draining...");
  try {
    wsServer?.close();
  } catch (err) {
    logger.warn({ err }, "WS close error");
  }

  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  }).catch(() => {});

  try {
    await pool.end();
  } catch (err) {
    logger.warn({ err }, "DB pool end error");
  }

  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

// ── Now do everything else (routes, auth, websocket, vite, migrations) ──

// Await DB connection properly before registering routes and auth (which use connect-pg-simple)
waitForDatabase()
  .then(async () => {
    if (process.env.NODE_ENV === "production") {
      const missing: string[] = [];
      if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
      if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
      if (missing.length) {
        logger.error({ missing }, "Missing required env vars");
        process.exit(1);
      }
    }

    try {
      await registerRoutes(app, httpServer);
    } catch (err) {
      logger.error({ err }, "registerRoutes failed");
    }

    try {
      wsServer = setupWebSocket(httpServer);
    } catch (err) {
      logger.error({ err }, "WebSocket setup failed");
    }

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      if (process.env.SENTRY_DSN) {
        try {
          Sentry.captureException(err);
        } catch {}
      }
      res.status(status).json({ message });
      // Let Sentry and Express handle this; do not crash the process here.
    });

    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }

    // Run legacy bootstrap migrations only when explicitly enabled.
    // In production, prefer running `npm run db:migrate` (drizzle-kit) in Railway startCommand.
    if (process.env.RUN_MIGRATIONS_ON_STARTUP === "true") {
      return runMigrations();
    }

    // Ensure homepage content exists even when we rely on drizzle-kit push for schema.
    if (process.env.SEED_HOMEPAGE_CONTENT_ON_STARTUP !== "false") {
      await seedHomepageContent();
    }
  })
  .catch((err) => {
    logger.fatal({ err }, "Critical startup failure");
  });
