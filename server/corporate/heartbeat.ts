/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  NAVAGRAHA CORPORATE HEARTBEAT ENGINE                   ║
 * ║  Inspired by Paperclip's heartbeat model.               ║
 * ║                                                         ║
 * ║  Runs scheduled autonomous work for every AI exec.      ║
 * ║  Execs wake up, assess the mission state, and produce  ║
 * ║  actionable reports — even while you sleep.            ║
 * ╚══════════════════════════════════════════════════════════╝
 */

import { storage } from "../storage";
import { type AiEmployee, type AiCompany } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Schedule Config ─────────────────────────────────────────────────────────
// Morning briefing: 8:00 AM IST = 2:30 AM UTC
// Evening standup:  9:00 PM IST = 3:30 PM UTC
const MORNING_HOUR_UTC = 2;
const MORNING_MIN_UTC  = 30;
const EVENING_HOUR_UTC = 15;
const EVENING_MIN_UTC  = 30;

// Exec-specific morning tasks keyed by role
const EXEC_MORNING_TASKS: Record<string, string> = {
  CEO:   "Review the current mission progress and issue 1 strategic directive for the team for today.",
  CFO:   "Analyse yesterday's user acquisition cost trends and flag any burn-rate risks.",
  CTO:   "Review the product backlog and suggest the single most impactful technical win for this week.",
  CMO:   "Propose 1 specific growth experiment to run this week (channel, hook, target segment).",
  BRAND: "Identify 1 brand positioning tweak that would improve perceived value for the target market.",
  SALES: "Generate a list of 3 high-leverage actions to close more paying users this week.",
};

// Exec-specific evening check-in tasks
const EXEC_EVENING_TASKS: Record<string, string> = {
  CEO:   "End-of-day summary: Progress, blockers, and tomorrow's priority.",
  CFO:   "Evening financial pulse: Revenue signals, cost trends, and budget status.",
  CTO:   "Technical health check: Any risks, tech debt, or quick wins spotted today.",
  CMO:   "Marketing recap: What's working this week and what to cut.",
  BRAND: "Brand health check: Public perception signals for today.",
  SALES: "Sales pipeline update: Closable leads and conversion blockers.",
};

// ── One exec heartbeat ───────────────────────────────────────────────────────
async function runExecHeartbeat(
  company: AiCompany,
  exec: AiEmployee,
  task: string,
  session: "morning" | "evening"
): Promise<void> {
  const systemPrompt = `You are ${exec.name}, the ${exec.role} of ${company.name}.
PERSONALITY: ${exec.personality}
COMPANY MISSION: ${company.mission}
TARGET: ₹5 Crore ARR in 6 months.

It is your scheduled ${session} heartbeat. Your task: ${task}

Be specific, actionable, and concise. Max 4 sentences. No pleasantries. Just the insight.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
    });

    const content = response.choices[0].message.content || "...";
    const thread = `heartbeat-${session}`;

    await storage.saveBoardroomMessage({
      companyId: company.id,
      senderType: "employee",
      senderId: String(exec.id),
      senderName: exec.name,
      senderRole: exec.role,
      receiverType: "all",
      receiverId: null,
      content: `[${session === "morning" ? "☀️ Morning" : "🌙 Evening"} Report] ${content}`,
      thread,
    });

    // Update exec's lastOutput
    await storage.updateAiEmployee(exec.id, {
      lastOutput: content.slice(0, 120),
      updatedAt: new Date(),
    });

    console.log(`[heartbeat] ✅ ${exec.name} (${exec.role}) completed ${session} report`);
  } catch (err) {
    console.error(`[heartbeat] ❌ ${exec.name} failed:`, err);
  }
}

// ── Run all execs for a session ─────────────────────────────────────────────
async function runHeartbeatSession(session: "morning" | "evening"): Promise<void> {
  console.log(`[heartbeat] 🔔 Starting ${session} session at ${new Date().toISOString()}`);

  try {
    // Get all companies and run their execs
    // We'll get all companies by scanning ai_employees -> company IDs
    const allEmployees = await (storage as any).db?.select?.() || [];
    
    // Use a simpler approach: query a known user's company, or iterate
    // Since storage doesn't expose "all companies", we query via raw approach
    // For now, we run for all active companies found via employees table
    const { db } = await import("../db");
    const { aiCompanies, aiEmployees } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const companies = await db.select().from(aiCompanies);

    for (const company of companies) {
      const employees = await db.select().from(aiEmployees).where(eq(aiEmployees.companyId, company.id));
      const tasks = session === "morning" ? EXEC_MORNING_TASKS : EXEC_EVENING_TASKS;

      for (const exec of employees) {
        const task = tasks[exec.role] || "Provide a brief update on your departmental priorities.";
        await runExecHeartbeat(company, exec, task, session);
        // Small delay between execs to avoid rate limits
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    console.log(`[heartbeat] ✅ ${session} session complete`);
  } catch (err) {
    console.error(`[heartbeat] ❌ Session failed:`, err);
  }
}

// ── Scheduler ───────────────────────────────────────────────────────────────
function scheduleNextRun(targetHour: number, targetMin: number, name: string, fn: () => void): void {
  function getDelayMs(): number {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      targetHour, targetMin, 0, 0
    ));
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  function loop() {
    const delay = getDelayMs();
    const nextTime = new Date(Date.now() + delay);
    console.log(`[heartbeat] ⏰ ${name} next run at ${nextTime.toISOString()} (in ${Math.round(delay / 60000)} min)`);
    setTimeout(() => {
      fn();
      loop(); // Reschedule for next day
    }, delay);
  }

  loop();
}

// ── Public API ───────────────────────────────────────────────────────────────
export function startHeartbeatEngine(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[heartbeat] ⚠️  OPENAI_API_KEY not set — heartbeat engine disabled");
    return;
  }

  console.log("[heartbeat] 🚀 Heartbeat engine starting…");

  // Schedule morning briefing (8 AM IST)
  scheduleNextRun(MORNING_HOUR_UTC, MORNING_MIN_UTC, "Morning Briefing", () => runHeartbeatSession("morning"));

  // Schedule evening standup (9 PM IST)
  scheduleNextRun(EVENING_HOUR_UTC, EVENING_MIN_UTC, "Evening Standup", () => runHeartbeatSession("evening"));

  console.log("[heartbeat] ✅ Scheduled: Morning @ 8AM IST, Evening @ 9PM IST");
}

/** Run one immediate heartbeat session (for testing or manual trigger) */
export async function triggerHeartbeat(session: "morning" | "evening"): Promise<void> {
  return runHeartbeatSession(session);
}
