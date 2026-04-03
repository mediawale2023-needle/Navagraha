import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runMigrations } from "./migrate";
import { waitForDatabase } from "./db";
import { setupWebSocket } from "./websocketService";
import { startHeartbeatEngine } from "./corporate/heartbeat";
import { corporateOrchestrator } from "./corporate/orchestrator";
import client from "prom-client";

// Prevent unhandled errors from killing the process before the port binds
process.on("uncaughtException", (err) =>
  console.error("[fatal] Uncaught exception:", err),
);
process.on("unhandledRejection", (err) =>
  console.error("[fatal] Unhandled rejection:", err),
);

const app = express();

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

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Register /api/config immediately so Railway's healthcheck gets a 200
// before the async init (auth, DB) completes.
app.get("/api/config", (_req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    agoraAppId: process.env.AGORA_APP_ID || "",
    posthogKey: process.env.POSTHOG_API_KEY || "",
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
      console.error("[startup] registerRoutes failed:", err);
    }

    try {
      setupWebSocket(httpServer);
    } catch (err) {
      console.error("[startup] WebSocket setup failed:", err);
    }

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

    // Run DB migrations, then start the heartbeat engine and watchdog
    return runMigrations().then(async () => {
      startHeartbeatEngine();
      await corporateOrchestrator.resumePendingTasks();
    });
  })
  .catch((err) => {
    console.error("[startup/migrate] Critical startup failure:", err);
  });
