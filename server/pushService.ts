/**
 * Firebase Cloud Messaging (FCM) push delivery — HTTP v1 API.
 *
 * Dependency-light: instead of pulling in the heavy `firebase-admin` SDK we
 * mint a short-lived OAuth2 access token directly from the service-account
 * credentials (the same JWT-bearer flow firebase-admin uses internally) and
 * call the FCM v1 `send` endpoint with `fetch`.
 *
 * Required env (graceful no-op when absent, like the payment gateways):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   (with literal "\n" escapes or real newlines)
 */

import crypto from "crypto";
import { storage } from "./storage";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

interface AccessToken {
  value: string;
  expiresAt: number; // epoch ms
}

let cachedToken: AccessToken | null = null;

function getPrivateKey(): string | null {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return null;
  // Support both real newlines and escaped "\n" from single-line env vars
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      getPrivateKey(),
  );
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(): Promise<string | null> {
  if (!isPushConfigured()) return null;
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.value;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = getPrivateKey()!;
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signature = base64url(
    crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey),
  );
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    console.error("[push] Failed to mint FCM access token:", res.status, await res.text());
    return null;
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  link?: string; // deep link path opened on click
}

async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  payload: PushPayload,
): Promise<{ ok: boolean; invalid: boolean }> {
  const data = { ...(payload.data || {}) };
  if (payload.link) data.link = payload.link;

  const message = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data,
      webpush: {
        fcmOptions: payload.link ? { link: payload.link } : undefined,
        notification: { icon: "/icon-192.png" },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );

  if (res.ok) return { ok: true, invalid: false };

  // A 404/UNREGISTERED or 400/INVALID_ARGUMENT means the token is dead
  const status = res.status;
  const text = await res.text();
  const invalid =
    status === 404 ||
    text.includes("UNREGISTERED") ||
    text.includes("INVALID_ARGUMENT");
  if (!invalid) console.error("[push] send error:", status, text);
  return { ok: false, invalid };
}

async function dispatch(
  ownerId: string,
  ownerType: "user" | "astrologer",
  payload: PushPayload,
): Promise<void> {
  try {
    if (!isPushConfigured()) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    const projectId = process.env.FIREBASE_PROJECT_ID!;

    const tokens = await storage.getPushTokens(ownerId, ownerType);
    if (tokens.length === 0) return;

    await Promise.all(
      tokens.map(async (t) => {
        const result = await sendToToken(accessToken, projectId, t.token, payload);
        if (result.invalid) {
          await storage.deletePushToken(t.token).catch(() => {});
        }
      }),
    );
  } catch (err) {
    console.error("[push] dispatch failed:", err);
  }
}

export function sendPushToUser(userId: string, payload: PushPayload): void {
  // Fire-and-forget — never block the request path on push delivery
  void dispatch(userId, "user", payload);
}

export function sendPushToAstrologer(astrologerId: string, payload: PushPayload): void {
  void dispatch(astrologerId, "astrologer", payload);
}
