import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import compression from "compression";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations } from "./migrate";
import { waitForDatabase, pool } from "./db";
import { setupWebSocket, shutdownWebSocket } from "./websocketService";
import client from "prom-client";

// Prevent unhandled errors from killing the process before the port binds
process.on("uncaughtException", (err) =>
  console.error("[fatal] Uncaught exception:", err),
);
process.on("unhandledRejection", (err) =>
  console.error("[fatal] Unhandled rejection:", err),
);

// ── Fail fast on missing critical config in production ─────────────────────
// Everything else degrades gracefully; these two silently break auth/data if
// absent, so refuse to boot without them rather than serve a broken app.
if (process.env.NODE_ENV === "production") {
  const missing = ["DATABASE_URL", "SESSION_SECRET"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    console.error(
      `[startup] Missing required environment variable(s) in production: ${missing.join(", ")}. ` +
      `See .env.example for how to set them.`,
    );
    process.exit(1);
  }
}

const app = express();
app.disable("x-powered-by");
// Skip compression for streamed responses (word-by-word AI output) — gzip
// would buffer the chunks. Streaming routes mark themselves with
// X-Accel-Buffering: no, which also tells reverse proxies not to buffer.
app.use(
  compression({
    filter: (req, res) =>
      res.getHeader("X-Accel-Buffering") === "no"
        ? false
        : compression.filter(req, res),
  }),
);

// Security headers. CSP is intentionally omitted: the client loads Razorpay,
// Agora, Google Maps, Firebase and PostHog scripts, so a strict policy would
// need constant curation — revisit once the third-party set stabilises.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  next();
});
let startupReady = false;
let startupError: string | null = null;

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
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

// ── Create the HTTP server and bind the port FIRST so the healthcheck
//    can succeed while the rest of the stack (auth, DB, etc.) initialises. ──

const httpServer = createServer(app);

// ── Prometheus Metrics ─────────────────────────────────────────────────────
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// When METRICS_TOKEN is set, the scraper must send it as a Bearer token;
// left unset, the endpoint stays open (matches the rest of the app's
// degrade-gracefully convention, but set it in production).
app.get('/metrics', async (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const auth = req.headers.authorization || "";
    const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const ok =
      presented.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(token));
    if (!ok) return res.status(401).json({ message: "Unauthorized" });
  }
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/api/health', (_req, res) => {
  if (startupError) {
    return res.status(500).json({ ok: false, ready: false, error: startupError });
  }

  if (!startupReady) {
    return res.status(503).json({ ok: false, ready: false });
  }

  res.json({ ok: true, ready: true });
});

// Register /api/config immediately so Railway's healthcheck gets a 200
// before the async init (auth, DB) completes.
app.get("/api/config", (_req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    agoraAppId: process.env.AGORA_APP_ID || "",
    posthogKey: process.env.POSTHOG_API_KEY || "",
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.FIREBASE_APP_ID || "",
      vapidKey: process.env.FIREBASE_VAPID_KEY || "",
    },
  });
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  log(`serving on port ${port}`);
});

// ── Now do everything else (routes, auth, websocket, vite, migrations) ──

// Await DB connection properly before registering routes and auth (which use connect-pg-simple)
waitForDatabase()
  .then(async () => {
    try {
      await registerRoutes(app, httpServer);
    } catch (err) {
      startupError = "route registration failed";
      console.error("[startup] registerRoutes failed:", err);
      process.exit(1);
    }

    try {
      setupWebSocket(httpServer);
    } catch (err) {
      startupError = "websocket setup failed";
      console.error("[startup] WebSocket setup failed:", err);
      process.exit(1);
    }

    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      // Never leak internal error details for unexpected (5xx) failures.
      const message =
        status >= 500 ? "Internal Server Error" : err.message || "Request failed";
      console.error(`[error] ${req.method} ${req.path} → ${status}:`, err);
      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    });

    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }

    // Run DB migrations, then mark startup complete.
    return runMigrations().then(() => {
      startupReady = true;
    });
  })
  .catch((err) => {
    startupError = err instanceof Error ? err.message : "critical startup failure";
    console.error("[startup/migrate] Critical startup failure:", err);
    process.exit(1);
  });

// ── Graceful shutdown ───────────────────────────────────────────────────────
// On deploy/restart: stop accepting connections, end in-flight consultations
// (so billing state isn't left dangling in the DB), then close the pool.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} received — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    console.error("[shutdown] Timed out after 10s — forcing exit");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  httpServer.close();
  try {
    await shutdownWebSocket();
  } catch (err) {
    console.error("[shutdown] WebSocket shutdown error:", err);
  }
  try {
    await pool.end();
  } catch (err) {
    console.error("[shutdown] DB pool shutdown error:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
