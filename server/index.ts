import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { apiNotFound, metricsAllowed } from "./httpGuards";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations } from "./migrate";
import { startRechargeReconciler } from "./rechargeSettlement";
import { reportsAvailable, startReportOrderSweeper } from "./reportOrders";
import { startAskReservationSweeper } from "./askMetering";
import { FREE_CHAT_MINUTES } from "./paymentService";
import { features } from "./features";
import { emailConfigured } from "./emailService";
import { waitForDatabase } from "./db";
import { setupWebSocket } from "./websocketService";
import { runAstronomySelfCheck } from "./astroEngine/selfCheck";
import client from "prom-client";

// Prevent unhandled errors from killing the process before the port binds
process.on("uncaughtException", (err) =>
  console.error("[fatal] Uncaught exception:", err),
);
process.on("unhandledRejection", (err) =>
  console.error("[fatal] Unhandled rejection:", err),
);

const app = express();
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

// Process metrics reveal internals: in production they need `Authorization: Bearer $METRICS_TOKEN`
// and are not served at all without one.
app.get('/metrics', async (req, res) => {
  if (!metricsAllowed(req.headers.authorization)) return res.status(404).json({ message: 'Not found' });
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Payments touch the Release A schema and its guard, which exist only once migrations have run:
// until then this instance refuses them (Razorpay retries webhooks; the browser can retry).
app.use('/api/payment', (_req, res, next) => {
  if (startupReady) return next();
  res.status(503).json({ code: 'starting', message: 'Payments are starting up. Please try again in a moment.' });
});

app.get('/api/health', (_req, res) => {
  if (startupError) {
    return res.status(503).json({
      ok: false,
      ready: false,
      error: startupError,
      hint: startupError.includes('database') || startupError.includes('ENOTFOUND') || startupError.includes('tenant')
        ? 'DATABASE_URL is invalid or still pointing at a deleted Neon host. Set it to your Supabase Postgres URI in Render, then redeploy.'
        : undefined,
    });
  }

  if (!startupReady) {
    return res.status(503).json({ ok: false, ready: false, status: 'starting' });
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
    freeChatMinutes: FREE_CHAT_MINUTES,
    marketplaceEnabled: features.marketplace(),
    reportsAvailable: reportsAvailable(),
    emailVerification: features.emailVerification() && emailConfigured(),
    askPacksEnabled: features.askPacks(),
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

// Await DB connection properly before registering routes and auth (which use connect-pg-simple).
// On DB failure we keep the process alive so /api/health can report the real error instead of
// crash-looping (Render would otherwise restart forever and login would show a generic failure).
waitForDatabase()
  .then(async () => {
    // Fail closed: nothing but /api/health is served unless the canonical astronomy stack works; never degrade.
    const astro = runAstronomySelfCheck();
    if (!astro.ok) {
      startupError = `astronomy self-check failed: ${astro.failures.join('; ')}`;
      console.error("[startup] FATAL astronomy self-check failed — no API routes registered (fail-closed); /api/health reports 503:", astro.failures);
      return;
    }
    log("astronomy self-check passed (Swiss Ephemeris, Lahiri, geo-tz/all, ICU)");

    try {
      await registerRoutes(app, httpServer);
    } catch (err) {
      startupError = err instanceof Error ? `route registration failed: ${err.message}` : "route registration failed";
      console.error("[startup] registerRoutes failed:", err);
      return;
    }

    try {
      setupWebSocket(httpServer);
    } catch (err) {
      startupError = err instanceof Error ? `websocket setup failed: ${err.message}` : "websocket setup failed";
      console.error("[startup] WebSocket setup failed:", err);
      return;
    }

    // An unknown API path is a JSON 404, never the SPA's HTML.
    app.use('/api', apiNotFound);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      throw err;
    });

    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }

    // Run DB migrations, then mark startup complete.
    try {
      await runMigrations();
      startupReady = true;
      startupError = null;
      log("startup ready");
      if (features.askMeteringEnforced() && !(features.emailVerification() && emailConfigured())) {
        console.warn("[ask] FEATURE_ASK_METERING_ENFORCE is on but email verification is unavailable: email/password accounts get no free questions.");
      }
      if (features.emailVerification() && !emailConfigured()) console.warn("[email] FEATURE_EMAIL_VERIFICATION is on but SMTP/APP_URL is not configured: no links are sent.");
      startRechargeReconciler();
      startReportOrderSweeper();
      startAskReservationSweeper();
    } catch (err) {
      startupError = err instanceof Error ? err.message : "migration failed";
      console.error("[startup/migrate] Migration failed:", err);
    }
  })
  .catch((err) => {
    startupError = err instanceof Error ? err.message : "critical startup failure";
    console.error("[startup/migrate] Critical startup failure:", err);
    // Do not process.exit — stay up so healthchecks expose the DB error to operators.
  });
