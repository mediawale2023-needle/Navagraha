/**
 * WebSocket Service
 *
 * Handles real-time events:
 * - Chat messages (user ↔ astrologer)
 * - Astrologer online/offline presence
 * - Billing ticks (every 30 seconds during active consultation)
 * - Incoming call notifications
 * - Session end signals
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { storage } from "./storage";
import { features } from "./features";
import { MARKETPLACE_PAUSED_MESSAGE } from "./marketplace";
import { getSession, getSessionIdentity } from "./auth";

interface WSClient {
  ws: WebSocket;
  userId?: string;
  astrologerId?: string;
  role: "user" | "astrologer";
  consultationId?: string;
}

type WSMessage = Record<string, unknown> & { type: string };

// Maps userId/astrologerId → WSClient
const userClients = new Map<string, WSClient>();
const astrologerClients = new Map<string, WSClient>();

// Messages that start or carry a consultation; refused while the marketplace is paused.
const PAUSED_MESSAGES = new Set(["chat_message", "astrologer_reply", "start_billing", "call_request", "call_accepted"]);

// Active billing timers: consultationId → NodeJS.Timeout
const billingTimers = new Map<string, NodeJS.Timeout>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const sessionMiddleware = getSession();

  wss.on("connection", (ws, req) => {
    const client: WSClient = { ws, role: "user" };

    ws.on("message", async (raw) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (PAUSED_MESSAGES.has(msg.type) && !features.marketplace()) {
        send(ws, { type: "marketplace_paused", message: MARKETPLACE_PAUSED_MESSAGE });
        return;
      }

      switch (msg.type) {
        case "auth": {
          await hydrateSession(req, sessionMiddleware);
          const { userId, astrologerId } = getSessionIdentity(req as any);
          const requestedRole = (msg as { role?: "user" | "astrologer" }).role;

          if (requestedRole === "astrologer" && astrologerId) {
            client.role = "astrologer";
            client.astrologerId = astrologerId;
            astrologerClients.set(astrologerId, client);
            // Connecting only marks an astrologer available while consultations are open.
            if (features.marketplace()) {
              await storage.updateAstrologerOnlineStatus(astrologerId, true);
              broadcastAstrologerStatus(astrologerId, "online");
            }
            send(ws, { type: "auth_ok", astrologerId });
          } else if (userId) {
            client.role = "user";
            client.userId = userId;
            userClients.set(userId, client);
            send(ws, { type: "auth_ok", userId });
          } else {
            send(ws, { type: "auth_error", message: "No authenticated session found" });
          }
          break;
        }

        case "chat_message": {
          // User sends a chat message
          const { astrologerId, message, consultationId } = msg as unknown as {
            astrologerId: string;
            message: string | Record<string, unknown>;
            consultationId?: string;
          };
          const userId = client.userId;

          if (!userId || !astrologerId || !message) break;

          const saved = typeof message === "string"
            ? await storage.createChatMessage({
                userId,
                astrologerId,
                message,
                sender: "user",
              })
            : message;

          // Echo to sender
          send(ws, { type: "message_saved", message: saved });

          // Forward to astrologer if online
          const astrClient = astrologerClients.get(astrologerId);
          if (astrClient) {
            send(astrClient.ws, {
              type: "new_message",
              message: saved,
              consultationId,
            });
          }
          break;
        }

        case "astrologer_reply": {
          // Astrologer sends reply
          const { userId, message, consultationId } = msg as unknown as {
            userId: string;
            message: string | Record<string, unknown>;
            consultationId?: string;
          };
          const astrologerId = client.astrologerId;

          if (!astrologerId || !userId || !message) break;

          const saved = typeof message === "string"
            ? await storage.createChatMessage({
                userId,
                astrologerId,
                message,
                sender: "astrologer",
              })
            : message;

          // Forward to user
          const userClient = userClients.get(userId);
          if (userClient) {
            send(userClient.ws, {
              type: "new_message",
              message: saved,
              consultationId,
            });
          }
          // Echo to astrologer
          send(ws, { type: "message_saved", message: saved });
          break;
        }

        case "start_billing": {
          // Begin per-minute billing for a consultation
          const { consultationId, astrologerId } = msg as unknown as {
            consultationId: string;
            astrologerId: string;
          };
          const userId = client.userId;

          if (billingTimers.has(consultationId)) break; // already running
          if (!userId || !astrologerId) break;
          const consultation = await storage.getConsultationById(consultationId);
          if (!consultation || consultation.userId !== userId || consultation.astrologerId !== astrologerId || consultation.status !== "active") {
            send(ws, { type: "billing_error", message: "Invalid consultation" });
            break;
          }

          // First-chat-free: skip charging for the first N minutes
          const freeMinutes = consultation.isFree ? (consultation.freeMinutes || 0) : 0;
          let minutesElapsed = 0;

          // Admin/test accounts ride free for the whole session.
          const freeAccess = await storage.hasFreeAccess(userId);

          // Deduct every 60 seconds
          const timer = setInterval(async () => {
            try {
              // Never charge for a marketplace that has been switched off, or for a
              // consultation that has been closed (by the user, the pause, or another instance).
              const live = features.marketplace() ? await storage.getConsultationById(consultationId) : null;
              if (live?.status !== "active") {
                clearInterval(timer);
                billingTimers.delete(consultationId);
                return;
              }

              const cost = parseFloat(consultation.pricePerMinute || "0");

              // Free-access (admin) account: tick without charging.
              if (freeAccess) {
                const freeClient = userClients.get(userId);
                if (freeClient) {
                  send(freeClient.ws, {
                    type: "billing_tick",
                    deducted: 0,
                    free: true,
                    consultationId,
                  });
                }
                return;
              }

              // Free-minute window: notify but don't charge
              if (minutesElapsed < freeMinutes) {
                minutesElapsed++;
                const freeClient = userClients.get(userId);
                if (freeClient) {
                  send(freeClient.ws, {
                    type: "billing_tick",
                    deducted: 0,
                    free: true,
                    freeMinutesLeft: freeMinutes - minutesElapsed,
                    consultationId,
                  });
                }
                return;
              }

              // A consultation priced at ₹0 runs without charging.
              if (!(cost > 0)) {
                const freeClient = userClients.get(userId);
                if (freeClient) send(freeClient.ws, { type: "billing_tick", deducted: 0, consultationId });
                return;
              }

              // Atomic: a purchase made during the chat cannot be lost to this write.
              const debited = await storage.tryDebitBalance(userId, cost);

              if (debited === null) {
                // Insufficient balance — end session
                clearInterval(timer);
                billingTimers.delete(consultationId);

                const userClient = userClients.get(userId);
                if (userClient) {
                  send(userClient.ws, { type: "session_ended", reason: "insufficient_balance", consultationId });
                }
                const astrClient = astrologerClients.get(astrologerId);
                if (astrClient) {
                  send(astrClient.ws, { type: "session_ended", reason: "user_balance_empty", consultationId });
                }
                // End consultation in DB
                await storage.endConsultation(consultationId);
                return;
              }

              const newBalance = debited;

              // Record transaction
              await storage.createTransaction({
                userId,
                amount: cost.toString(),
                type: "debit",
                description: `Consultation - 1 minute`,
                status: "completed",
                consultationId,
              });

              // Notify user of deduction
              const userClient = userClients.get(userId);
              if (userClient) {
                send(userClient.ws, {
                  type: "billing_tick",
                  deducted: cost,
                  newBalance: parseFloat(newBalance),
                  consultationId,
                  warning: parseFloat(newBalance) < cost * 3, // warn when <3 mins left
                });
              }
            } catch (err) {
              console.error("Billing error:", err);
            }
          }, 60_000);

          billingTimers.set(consultationId, timer);
          send(ws, { type: "billing_started", consultationId });
          break;
        }

        case "stop_billing": {
          const { consultationId } = msg as unknown as { consultationId: string };
          const timer = billingTimers.get(consultationId);
          const consultation = await storage.getConsultationById(consultationId);
          const isParticipant = consultation && (
            consultation.userId === client.userId || consultation.astrologerId === client.astrologerId
          );
          if (!isParticipant) break;
          if (timer) {
            clearInterval(timer);
            billingTimers.delete(consultationId);
          }
          await storage.endConsultation(consultationId);
          send(ws, { type: "billing_stopped", consultationId });
          break;
        }

        case "call_request": {
          // User requests a call
          const { astrologerId, callType, consultationId } = msg as unknown as {
            astrologerId: string;
            callType: "voice" | "video";
            consultationId: string;
          };
          const userId = client.userId;

          if (!userId) {
            break;
          }

          const astrClient = astrologerClients.get(astrologerId);
          if (astrClient) {
            send(astrClient.ws, {
              type: "incoming_call",
              userId,
              callType,
              consultationId,
            });
            send(ws, { type: "call_ringing", consultationId });
          } else {
            send(ws, { type: "call_failed", reason: "astrologer_offline", consultationId });
          }
          break;
        }

        case "call_accepted": {
          const { userId, consultationId } = msg as unknown as {
            userId: string;
            consultationId: string;
          };
          const astrologerId = client.astrologerId;
          if (!astrologerId) break;
          const userClient = userClients.get(userId);
          if (userClient) {
            send(userClient.ws, { type: "call_accepted", consultationId });
          }
          break;
        }

        case "call_rejected": {
          const { userId, consultationId } = msg as unknown as { userId: string; consultationId: string };
          const userClient = userClients.get(userId);
          if (userClient) {
            send(userClient.ws, { type: "call_rejected", consultationId });
          }
          break;
        }

        case "ping":
          send(ws, { type: "pong" });
          break;
      }
    });

    ws.on("close", async () => {
      // Clean up presence
      if (client.role === "astrologer" && client.astrologerId) {
        astrologerClients.delete(client.astrologerId);
        await storage.updateAstrologerOnlineStatus(client.astrologerId, false);
        broadcastAstrologerStatus(client.astrologerId, "offline");
      } else if (client.userId) {
        userClients.delete(client.userId);
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
    });

    // Send initial connection ack
    send(ws, { type: "connected" });
  });

  return wss;
}

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

async function hydrateSession(req: IncomingMessage, sessionMiddleware: ReturnType<typeof getSession>) {
  if ((req as any).session) {
    return;
  }

  await new Promise<void>((resolve) => {
    sessionMiddleware(
      req as any,
      {
        getHeader: () => undefined,
        setHeader: () => undefined,
        end: () => undefined,
      } as any,
      () => resolve(),
    );
  });
}

function broadcastAstrologerStatus(astrologerId: string, status: "online" | "offline" | "busy") {
  const msg = JSON.stringify({ type: "astrologer_status", astrologerId, status });
  userClients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  });
}

/** Send a notification to a specific user via WebSocket */
export function notifyUser(userId: string, data: object) {
  const client = userClients.get(userId);
  if (client) send(client.ws, data);
}

/** Send a notification to a specific astrologer via WebSocket */
export function notifyAstrologer(astrologerId: string, data: object) {
  const client = astrologerClients.get(astrologerId);
  if (client) send(client.ws, data);
}

/** Get list of currently online astrologer IDs */
export function getOnlineAstrologerIds(): string[] {
  return Array.from(astrologerClients.keys());
}
