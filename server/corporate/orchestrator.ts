import { storage } from "../storage";
import { type AiCompany, type AiEmployee, type AiInitiative, type AiDirective } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      { role: "CEO", name: "Aria", personality: "Visionary, decisive, and strictly goal-oriented. Expert in high-level strategy." },
      { role: "CFO", name: "Sterling", personality: "Analytical, risk-averse, focusing on ROI, burn rate, and capital efficiency." },
      { role: "CTO", name: "Nikola", personality: "Practical, focused on scalability, technical debt, and rapid prototyping." },
      { role: "CMO", name: "Sloane", personality: "Creative, obsessed with CAC, LTV, and market psychology." },
      { role: "BRAND", name: "Elias", personality: "Aesthetic-focused, guardian of identity and public perception." },
      { role: "SALES", name: "Vance", personality: "Results-driven, expert in conversion funnels and high-ticket closing." },
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

Define 3-4 concrete strategic INITIATIVES to reach this goal. Return ONLY valid JSON:
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
    // Implementation for departmental delegation logic
    // ... logic to query relevant agent based on initiative context ...
    return [];
  }
}

export const corporateOrchestrator = new CorporateOrchestrator();
