import { storage } from "../storage";
import { type AiCompany, type AiEmployee, type AiInitiative, type AiDirective } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * HARD CONSTRAINTS: These are injected into EVERY exec system prompt.
 * The founder does not want human hires — the whole team must operate
 * with AI tools, automation, APIs, and autonomous agents.
 */
const FOUNDER_CONSTRAINTS = `
CRITICAL OPERATING RULES — Non-negotiable:
1. ZERO human hires. Do NOT recommend hiring any developers, designers, analysts, or any human staff.
2. Every solution must use AI tools, automation, SaaS platforms, APIs, or autonomous agents.
3. Infrastructure = Railway/Docker/existing stack. No Kubernetes, no cloud migration overhead.
4. Data = PostHog, Mixpanel, or Supabase. No data engineers needed.
5. Development = AI coding assistants (GitHub Copilot, Claude, GPT-4). No dev team.
6. Your job is to make the FOUNDER more powerful, not to expand headcount.
`.trim();

/**
 * The Corporate Orchestrator handles the high-level business logic
 * for the AI C-Suite. It is responsible for taking a user's mission
 * and delegating it to specialized departmental agents.
 */
export class CorporateOrchestrator {
  
  /**
   * Initializes a new "Boardroom" for a user if it doesn't exist.
   * This hires the default C-Suite: CEO, CTO, CFO, CMO, Brand, Sales.
   */
  async hireDefaultCSuite(userId: string, companyName: string, mission: string): Promise<AiCompany> {
    // 1. Create the Company
    const company = await storage.createAiCompany({
      userId: userId,   // varchar UUID — do NOT parseInt
      name: companyName,
      mission: mission,
      industry: "Technology / Personal Growth",
      targetRevenue: "50000000", // 5 Crore in paise
      targetCurrency: "INR",
      targetDeadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    });

    // 2. Hire the Executive Team
    const staff = [
      { role: "CEO",   name: "Aria",     personality: "Visionary, decisive, goal-oriented. Maximises leverage per person. Allergic to unnecessary headcount." },
      { role: "CFO",   name: "Sterling", personality: "Analytical, capital-efficient. Prefers SaaS tools over salaries. Tracks burn daily." },
      { role: "CTO",   name: "Nikola",   personality: "AI-native engineer. Uses AI coding tools, automation, and APIs instead of hiring devs. Never recommends human hires." },
      { role: "CMO",   name: "Sloane",   personality: "Growth-obsessed. Runs AI-generated content, paid experiments, and no-code funnels." },
      { role: "BRAND", name: "Elias",    personality: "Aesthetic-first. Uses AI design tools (Midjourney, Canva AI) and brand automation." },
      { role: "SALES", name: "Vance",    personality: "Closes deals with AI outreach, CRM automation, and no SDR team." },
    ];

    for (const member of staff) {
      await storage.createAiEmployee({
        companyId: company.id,
        ...member,
        status: "active",
      });
    }

    return company;
  }

  /**
   * The CEO analyzes the main Mission and creates high-priority Initiatives.
   */
  async generateStrategicInitiatives(companyId: number): Promise<AiInitiative[]> {
    // Fetch by primary key, NOT by userId
    const company = await storage.getAiCompanyById(companyId);
    if (!company) throw new Error(`Company ${companyId} not found`);

    const employees = await storage.getAiEmployees(companyId);
    const ceo = employees.find((e: AiEmployee) => e.role === "CEO");
    if (!ceo) throw new Error("CEO not found in the boardroom");

    const prompt = `You are ${ceo.name}, the CEO of ${company.name}.
MISSION: ${company.mission}
TARGET: ₹5 Crore ARR in 6 months.

${FOUNDER_CONSTRAINTS}

Define 3-4 concrete strategic INITIATIVES to reach this goal using only AI tools and automation. Return ONLY valid JSON:
{ "initiatives": [{ "title": "...", "description": "..." }] }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = JSON.parse(response.choices[0].message.content || "{}");
    // Handle both { initiatives: [...] } and bare array responses
    const initiativesData: { title: string; description: string }[] =
      Array.isArray(content) ? content : (content.initiatives || []);

    const createdInitiatives: AiInitiative[] = [];
    for (const init of initiativesData) {
      const created = await storage.createAiInitiative({
        companyId: company.id,
        title: init.title,
        description: init.description,
        priority: "high",
        status: "pending",
      });
      createdInitiatives.push(created);
    }

    return createdInitiatives;
  }

  /**
   * Specialized agents (CTO, CFO, etc.) take an Initiative and create Directives (Action Tasks).
   */
  async delegateDirective(initiativeId: number): Promise<AiDirective[]> {
    return [];
  }

  /**
   * User sends a direct message to one specific executive.
   * The executive responds in character.
   */
  async chatWithEmployee(companyId: number, employeeId: number, userMessage: string, userId: string): Promise<{ userMsg: AiDirective | any; replyMsg: any }> {
    const company = await storage.getAiCompanyById(companyId);
    if (!company) throw new Error("Company not found");

    const employees = await storage.getAiEmployees(companyId);
    const exec = employees.find((e: AiEmployee) => e.id === employeeId);
    if (!exec) throw new Error("Executive not found");

    const thread = `dm-${employeeId}`;

    // Save user message
    const userMsg = await storage.saveBoardroomMessage({
      companyId,
      senderType: "user",
      senderId: userId,
      senderName: "You",
      senderRole: "Founder",
      receiverType: "employee",
      receiverId: String(employeeId),
      content: userMessage,
      thread,
    });

    // Load recent thread for context (last 10 messages)
    const history = await storage.getBoardroomThread(companyId, thread);
    const recent = history.slice(-10);

    const systemPrompt = `You are ${exec.name}, the ${exec.role} of ${company.name}.
PERSONALITY: ${exec.personality}
COMPANY MISSION: ${company.mission}
TARGET: ₹5 Crore ARR in 6 months.

${FOUNDER_CONSTRAINTS}

You are in a direct conversation with the Founder. Stay in character. Be concise, sharp, actionable. Max 3 sentences.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...recent.map(m => ({
        role: m.senderType === "user" ? "user" : "assistant" as const,
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const replyText = response.choices[0].message.content || "...";

    const replyMsg = await storage.saveBoardroomMessage({
      companyId,
      senderType: "employee",
      senderId: String(exec.id),
      senderName: exec.name,
      senderRole: exec.role,
      receiverType: "user",
      receiverId: userId,
      content: replyText,
      thread,
    });

    return { userMsg, replyMsg };
  }

  /**
   * Runs an Executive Room debate — all execs respond to a topic in sequence.
   * Useful for strategic discussions the user can observe.
   */
  async runExecRoomDebate(companyId: number, topic: string, userId: string): Promise<any[]> {
    const company = await storage.getAiCompanyById(companyId);
    if (!company) throw new Error("Company not found");

    const employees = await storage.getAiEmployees(companyId);
    const thread = "exec-room";
    const results: any[] = [];

    // Each exec gives their perspective on the topic, sequentially
    for (const exec of employees) {
      const priorMsgs = results.map(r => `${r.senderRole}: ${r.content}`).join("\n");
      const systemPrompt = `You are ${exec.name}, the ${exec.role} of ${company.name}.
PERSONALITY: ${exec.personality}
MISSION: ${company.mission}

${FOUNDER_CONSTRAINTS}

The Founder has asked the executive team to discuss: "${topic}"
${priorMsgs ? `\nWhat colleagues said so far:\n${priorMsgs}` : ""}

Give your perspective as ${exec.role}. Be direct, specific, in-character. Max 2 sentences.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
      });

      const content = response.choices[0].message.content || "...";

      const msg = await storage.saveBoardroomMessage({
        companyId,
        senderType: "employee",
        senderId: String(exec.id),
        senderName: exec.name,
        senderRole: exec.role,
        receiverType: "all",
        receiverId: null,
        content,
        thread,
      });
      results.push(msg);
    }

    return results;
  }
}

export const corporateOrchestrator = new CorporateOrchestrator();
