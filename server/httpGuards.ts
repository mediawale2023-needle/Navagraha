import type { Request, Response } from "express";
import crypto from "crypto";

export function apiNotFound(req: Request, res: Response) {
  res.status(404).json({ message: `No API route for ${req.method} ${req.originalUrl.split("?")[0]}` });
}

export function metricsAllowed(authorization: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  const token = env.METRICS_TOKEN;
  if (!token) return false;
  const given = Buffer.from(authorization?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
