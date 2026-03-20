import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { logger } from "./logger";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  logger.info({ source }, message);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Aggressive caching for hashed assets, no-cache for HTML.
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store");
          return;
        }
        // Vite emits fingerprinted assets under /assets
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }),
  );

  // SPA fallback: only for browser navigation requests.
  // Never rewrite asset/file requests (so JS/CSS don't accidentally load HTML).
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();

    const ext = path.extname(req.path);
    const isAssetRoute =
      req.path.startsWith("/assets/") ||
      req.path.startsWith("/favicon") ||
      req.path === "/favicon.ico" ||
      ext.length > 0;

    if (isAssetRoute) return next();

    // If the browser is explicitly asking for HTML, serve the SPA shell.
    const accept = req.headers.accept || "";
    if (typeof accept === "string" && !accept.includes("text/html")) return next();

    return res.sendFile(path.resolve(distPath, "index.html"));
  });
}
