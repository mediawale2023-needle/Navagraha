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
import type { Server } from "http";
import { storage } from "./storage";

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

// Active billing timers: consultationId → NodeJS.Timeout
const billingTimers = new Map<string, NodeJS.Timeout>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const client: WSClient = { ws, role: "user" };

    ws.on("message", async (raw) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "auth": {
          // Register the connection
          const { userId, astrologerId, role } = msg as unknown as {
            userId?: string;
            astrologerId?: string;
            role: "user" | "astrologer";
          };
          client.role = role;
          if (role === "astrologer" && astrologerId) {
            client.astrologerId = astrologerId;
            astrologerClients.set(astrologerId, client);
            // Update DB presence
            await storage.updateAstrologerOnlineStatus(astrologerId, true);
            // Broadcast updated status
            broadcastAstrologerStatus(astrologerId, "online");
            send(ws, { type: "auth_ok", astrologerId });
          } else if (userId) {
            client.userId = userId;
            userClients.set(userId, client);
            send(ws, { type: "auth_ok", userId });
          }
          break;
        }

        case "chat_message": {
          // User sends a chat message
          const { userId, astrologerId, message, consultationId } = msg as unknown as {
            userId: string;
            astrologerId: string;
            message: string;
            consultationId?: string;
          };

          if (!userId || !astrologerId || !message) break;

          // Save to DB
          const saved = await storage.createChatMessage({
            userId,
            astrologerId,
            message,
            sender: "user",
          });

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
          const { astrologerId, userId, message, consultationId } = msg as unknown as {
            astrologerId: string;
            userId: string;
            message: string;
            consultationId?: string;
          };

          if (!astrologerId || !userId || !message) break;

          const saved = await storage.createChatMessage({
            userId,
            astrologerId,
            message,
            sender: "astrologer",
          });

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
          const { consultationId, userId, astrologerId, pricePerMinute } = msg as unknown as {
            consultationId: string;
            userId: string;
            astrologerId: string;
            pricePerMinute: number;
          };

          if (billingTimers.has(consultationId)) break; // already running

          // Deduct every 60 seconds
          const timer = setInterval(async () => {
            try {
              const wallet = await storage.getWallet(userId);
              const balance = parseFloat(wallet?.balance || "0");
              const cost = pricePerMinute;

              if (balance < cost) {
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

              // Deduct from wallet
              const newBalance = (balance - cost).toFixed(2);
              await storage.updateWalletBalance(userId, newBalance);

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
          const { userId, astrologerId, callType, consultationId } = msg as unknown as {
            userId: string;
            astrologerId: string;
            callType: "voice" | "video";
            consultationId: string;
          };

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
          const { userId, astrologerId, consultationId } = msg as unknown as {
            userId: string;
            astrologerId: string;
            consultationId: string;
          };
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
