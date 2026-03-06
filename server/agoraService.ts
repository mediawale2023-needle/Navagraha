/**
 * Agora Token Service
 *
 * Generates RTC tokens for Agora voice/video calls.
 * Requires:
 *   AGORA_APP_ID      — from Agora Console
 *   AGORA_APP_CERTIFICATE — from Agora Console
 *
 * Apply at: https://www.agora.io
 * Free tier: 10,000 minutes/month
 * India latency: excellent (servers in Mumbai)
 */

import { RtcTokenBuilder, RtcRole } from "agora-access-token";

export type AgoraRole = "publisher" | "subscriber";

/**
 * Generate an Agora RTC token.
 * @param channelName - unique channel ID (we use consultationId)
 * @param uid - numeric user ID (0 = dynamic assignment)
 * @param role - publisher (can send audio/video) | subscriber (receive only)
 * @param expirySeconds - token validity in seconds (default: 3600 = 1 hour)
 */
export function generateAgoraToken(
  channelName: string,
  uid: number,
  role: AgoraRole = "publisher",
  expirySeconds = 3600
): string {
  const appId = process.env.AGORA_APP_ID;
  const certificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !certificate) {
    throw new Error(
      "AGORA_APP_ID and AGORA_APP_CERTIFICATE must be set. " +
        "Apply at https://www.agora.io"
    );
  }

  const agoraRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const expireTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;

  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    certificate,
    channelName,
    uid,
    agoraRole,
    expireTimestamp
  );
}

/**
 * Generate a unique channel name for a consultation.
 * Format: navagraha_{consultationId}
 */
export function getChannelName(consultationId: string): string {
  return `navagraha_${consultationId}`;
}
