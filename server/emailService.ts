/**
 * Email Service
 *
 * Handles transactional email via Nodemailer (SMTP).
 * Falls back gracefully when SMTP env vars are not set.
 *
 * Emails sent:
 * - Welcome / registration confirmation
 * - Booking confirmation
 * - Payment receipt
 * - Consultation summary
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    throw new Error("Email SMTP configuration is missing");
  }

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return _transporter;
}

const FROM = process.env.EMAIL_FROM || "Navagraha <noreply@navagraha.app>";
const APP_URL = process.env.APP_URL || "http://localhost:5000";

// ─── Shared HTML shell ────────────────────────────────────────────────────────

function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a1a; color: #e2e8f0; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #1a1a3e; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%); padding: 32px; text-align: center; }
    .header h1 { margin: 0; color: #F5A623; font-size: 24px; letter-spacing: 2px; }
    .header p { color: #8B5CF6; margin: 4px 0 0; font-size: 13px; }
    .body { padding: 32px; }
    .body h2 { color: #F5A623; margin-top: 0; }
    .body p { line-height: 1.6; color: #cbd5e0; }
    .btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #F5A623, #e8952b); color: #1a0533; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 16px 0; }
    .footer { background: #0d0d2b; padding: 20px 32px; text-align: center; font-size: 12px; color: #4a5568; }
    .divider { border: none; border-top: 1px solid #2d3748; margin: 20px 0; }
    .info-box { background: #0d0d2b; border-left: 3px solid #F5A623; padding: 16px; border-radius: 4px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🪐 NAVAGRAHA</h1>
      <p>Your Vedic Astrology Companion</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Navagraha. All rights reserved.</p>
      <p>You received this email because you have an account on Navagraha.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Safe send wrapper ────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[email] Sent "${subject}" to ${to}`);
  } catch (err) {
    // Never crash the main flow for email failures
    console.error(`[email] Failed to send "${subject}" to ${to}:`, (err as Error).message);
  }
}

// ─── Email templates ─────────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  firstName: string
): Promise<void> {
  const body = `
    <h2>Namaste, ${firstName || "Cosmic Traveller"}! 🙏</h2>
    <p>Welcome to <strong>Navagraha</strong> — your gateway to the ancient wisdom of Vedic astrology.</p>
    <p>You can now:</p>
    <ul>
      <li>🌟 Generate your <strong>personalised Kundli</strong> (birth chart)</li>
      <li>🤖 Chat with our <strong>AI Astrologer</strong> powered by Claude</li>
      <li>🔮 Consult <strong>verified Jyotish experts</strong> live</li>
      <li>💑 Check <strong>Kundli compatibility</strong> with your partner</li>
    </ul>
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}">Explore Your Destiny →</a>
    </div>
    <hr class="divider" />
    <p style="font-size:13px;color:#718096">
      First, create your Kundli by going to <em>Kundli → Create New Chart</em> and entering your birth details.
    </p>`;

  await sendEmail(to, "Welcome to Navagraha 🪐", htmlShell("Welcome to Navagraha", body));
}

export async function sendBookingConfirmation(
  to: string,
  params: {
    userName: string;
    astrologerName: string;
    type: string;
    scheduledAt: Date;
    durationMinutes: number;
    totalAmount: string;
  }
): Promise<void> {
  const dateStr = params.scheduledAt.toLocaleString("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

  const body = `
    <h2>Booking Confirmed ✅</h2>
    <p>Hi ${params.userName}, your consultation has been booked successfully.</p>
    <div class="info-box">
      <strong>Consultation Details</strong><br/><br/>
      👤 Astrologer: <strong>${params.astrologerName}</strong><br/>
      📅 Date & Time: <strong>${dateStr} IST</strong><br/>
      🎙️ Type: <strong>${params.type.charAt(0).toUpperCase() + params.type.slice(1)} Consultation</strong><br/>
      ⏱️ Duration: <strong>${params.durationMinutes} minutes</strong><br/>
      💰 Amount: <strong>₹${params.totalAmount}</strong>
    </div>
    <p>Please ensure you have a stable internet connection and sufficient wallet balance before the session.</p>
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}/schedule">View My Schedule →</a>
    </div>`;

  await sendEmail(
    to,
    `Booking Confirmed — ${params.type} with ${params.astrologerName}`,
    htmlShell("Booking Confirmed", body)
  );
}

export async function sendPaymentReceipt(
  to: string,
  params: {
    userName: string;
    amount: number;
    bonus: number;
    newBalance: number;
    paymentId: string;
  }
): Promise<void> {
  const body = `
    <h2>Payment Successful 💰</h2>
    <p>Hi ${params.userName}, your wallet has been recharged.</p>
    <div class="info-box">
      <strong>Transaction Details</strong><br/><br/>
      💳 Amount Paid: <strong>₹${params.amount}</strong><br/>
      🎁 Bonus Credits: <strong>₹${params.bonus}</strong><br/>
      💼 New Wallet Balance: <strong>₹${params.newBalance.toFixed(2)}</strong><br/>
      🔖 Payment ID: <code>${params.paymentId}</code>
    </div>
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}/wallet">View Wallet →</a>
    </div>`;

  await sendEmail(to, "Wallet Recharged — Navagraha", htmlShell("Payment Receipt", body));
}

export async function sendConsultationSummary(
  to: string,
  params: {
    userName: string;
    astrologerName: string;
    type: string;
    durationMinutes: number;
    totalAmount: string;
  }
): Promise<void> {
  const body = `
    <h2>Consultation Summary 📜</h2>
    <p>Hi ${params.userName}, your consultation has ended. Here's a summary:</p>
    <div class="info-box">
      👤 Astrologer: <strong>${params.astrologerName}</strong><br/>
      🎙️ Type: <strong>${params.type}</strong><br/>
      ⏱️ Duration: <strong>${params.durationMinutes} minutes</strong><br/>
      💰 Total Charged: <strong>₹${params.totalAmount}</strong>
    </div>
    <p>We hope you received the cosmic guidance you were seeking. 🙏</p>
    <p>Please take a moment to rate your astrologer — your feedback helps others find the right guide.</p>
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}/astrologers">Book Another Session →</a>
    </div>`;

  await sendEmail(
    to,
    `Consultation Summary — ${params.astrologerName}`,
    htmlShell("Consultation Summary", body)
  );
}

export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  resetToken: string
): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

  const body = `
    <h2>Reset Your Password 🔐</h2>
    <p>Hi ${firstName || "there"}, we received a request to reset your Navagraha password.</p>
    <p>Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
    <div style="text-align:center">
      <a class="btn" href="${resetUrl}">Reset Password →</a>
    </div>
    <hr class="divider" />
    <p style="font-size:13px;color:#718096">
      If you didn't request this, you can safely ignore this email. Your password won't change.
    </p>`;

  await sendEmail(to, "Reset Your Navagraha Password", htmlShell("Password Reset", body));
}
