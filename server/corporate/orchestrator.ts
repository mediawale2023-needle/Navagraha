import { storage } from "../storage";
import { type AiCompany, type AiEmployee, type AiInitiative, type AiDirective, aiInitiatives, aiEmployees, aiDirectives } from "@shared/schema";
import { db } from "../db";
import { eq, asc, and } from "drizzle-orm";
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
      { role: "CEO",      name: "Aria",     personality: "Visionary, decisive, goal-oriented. Maximises leverage per person. Allergic to unnecessary headcount." },
      { role: "CFO",      name: "Sterling", personality: "Analytical, capital-efficient. Prefers SaaS tools over salaries. Tracks burn daily." },
      { role: "CTO",      name: "Nikola",   personality: "AI-native engineer. Uses AI coding tools, automation, and APIs instead of hiring devs. Never recommends human hires." },
      { role: "CMO",      name: "Sloane",   personality: "Growth-obsessed. Runs AI-generated content, paid experiments, and no-code funnels." },
      { role: "BRAND",    name: "Elias",    personality: "Aesthetic-first. Uses AI design tools (Midjourney, Canva AI) and brand automation." },
      { role: "UIUX_DEV", name: "Katya",    personality: "Design-first Frontend Engineer. Bridges Figma to React. Obsessed with high-fidelity animations, micro-interactions, and premium UI. Codes everything he designs." },
      { role: "SALES",    name: "Vance",    personality: "Closes deals with AI outreach, CRM automation, and no SDR team." },
      { role: "DEV",      name: "Ada",      personality: "Full Stack AI Developer. Speaks in Markdown. Turns CTO architecture into pull requests. Obsessed with clean, type-safe code." },
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
   * For the DevAgent Loop, the CTO evaluates technical initiatives and creates CODE_CHANGE tasks.
   * Now accepts optional debateContext to inform the architectural decisions.
   */
  async delegateDirective(initiativeId: number, debateContext?: string): Promise<AiDirective[]> {
    const initiative = await db.select().from(aiInitiatives).where(eq(aiInitiatives.id, initiativeId)).then((r: any[]) => r[0]);
    if (!initiative) throw new Error("Initiative not found");

    const employees = await storage.getAiEmployees(initiative.companyId);
    const cto = employees.find(e => e.role === "CTO");
    const dev = employees.find(e => e.role === "DEV");
    const uiux = employees.find(e => e.role === "UIUX_DEV");

    if (!cto || (!dev && !uiux)) return []; 

    const prompt = `You are ${cto.name}, CTO. 
INITIATIVE: ${initiative.title} (${initiative.description})
${debateContext ? `\nCONTEXT FROM EXEC DEBATE:\n${debateContext}` : ""}

Your engineering team:
- DEV: ${dev?.name || "None"} (Logic, Backend, Core)
- UIUX: ${uiux?.name || "None"} (Frontend, Design, UX/UI)

Break the initiative down into a SEQUENCE of atomic, concrete technical directives (CODE_CHANGE tasks). 
For each task, decide who is the best 'assignee'.
Output strictly JSON: { "tasks": [{ "content": "Instruction...", "assignee": "DEV" | "UIUX" }] }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    const taskDefs = parsed.tasks || [];
    if (taskDefs.length === 0) return [];

    const createdDirectives: AiDirective[] = [];
    for (const def of taskDefs) {
      const assignee = def.assignee === "UIUX" ? uiux : dev;
      if (!assignee) continue;

      const created = await storage.createAiDirective({
        initiativeId,
        issuerId: cto.id,
        assigneeId: assignee.id,
        content: def.content,
        type: "CODE_CHANGE",
        status: "pending",
      });
      createdDirectives.push(created);
    }

    // Self-trigger the first task in the background
    this.processCodeDirective(createdDirectives[0].id).catch(err => {
       console.error(`[CTO] Failed to trigger first task for initiative ${initiativeId}`, err);
    });

    return createdDirectives;
  }

  /**
   * Instructs the DEV agent to read a CODE_CHANGE directive and actually write the code.
   * Returns the array of proposed file changes.
   */
  async processCodeDirective(directiveId: number): Promise<void> {
    const directive = await db.select().from(aiDirectives).where(eq(aiDirectives.id, directiveId)).then((r: any[]) => r[0]);
    if (!directive || directive.type !== "CODE_CHANGE" || !directive.assigneeId) return;

    const dev = await db.select().from(aiEmployees).where(eq(aiEmployees.id, directive.assigneeId)).then((r: any[]) => r[0]);
    if (!dev) return;

    // Load repository context
    const fs = await import("fs/promises");
    const path = await import("path");
    
    const contextFiles = [
      "package.json",
      "shared/schema.ts",
      "server/routes.ts",
      "server/auth.ts"
    ];
    
    let repoContext = "PROJECT ARCHITECTURE:\\n";
    for (const file of contextFiles) {
      try {
        const fullPath = path.join(process.cwd(), file);
        const content = await fs.readFile(fullPath, "utf8");
        // truncate to avoid massive token limits if routes goes huge, though gpt-4o has 128k context
        repoContext += `\\n--- ${file} ---\\n${content}\\n`;
      } catch (e) {
        repoContext += `\\n--- ${file} ---\\n(File not found or unreadable)\\n`;
      }
    }

    // Use gpt-4o for coding tasks
    const prompt = `You are ${dev.name}, the Lead Full Stack AI Developer.
TASK: ${directive.content}

${repoContext}

Provide your response strictly as a JSON object containing an array of proposed changes:
{
  "changes": [
    {
      "filePath": "relative/path/to/file.ts",
      "content": "Full content of the file..."
    }
  ]
}

SAFETY RULES:
1. If the task is STRATEGIC (mapping, identifying, defining boundaries, documenting), do NOT modify existing .ts, .tsx, or server files. Instead, create a new .md file in a 'docs/architecture/' folder.
2. NEVER overwrite a large existing file with a small placeholder or truncated version.
3. If you are adding a new microservice route, you must include the existing routes in 'server/routes.ts' as well—do not delete them.
4. Ensure all code is robust and type-safe.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      response_format: { type: "json_object" },
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content || "{}");
      if (parsed.changes && Array.isArray(parsed.changes)) {
        // 1. Save proposal to DB
        await db.update(aiDirectives)
          .set({ proposedChanges: parsed.changes, status: "approved" }) // Automatically approve
          .where(eq(aiDirectives.id, directiveId));
          
        // 2. Automatically Apply to Disk
        const fs = await import("fs");
        const path = await import("path");
        const { exec } = await import("child_process");
        const util = await import("util");
        const execPromise = util.promisify(exec);
        
        for (const change of parsed.changes as any[]) {
          if (change.filePath && change.content) {
            const absolutePath = path.resolve(process.cwd(), change.filePath);
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, change.content, "utf8");
          }
        }
        
        // 3. Automatically Commit and Push
        try {
          const commitMessage = `feat(ai/dev): ${directive.content.substring(0, 50)}... [Ada Auto-Commit]`;
          
          // Use GITHUB_TOKEN if available to bypass SSH key issues on Railway
          const pushCmd = process.env.GITHUB_TOKEN 
             ? `git push https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/mediawale2023-needle/Navagraha.git main`
             : `git push origin main`;

          await execPromise(`git add . && git commit -m "${commitMessage}" && ${pushCmd}`, {
            timeout: 30000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
          });
          
          await db.update(aiDirectives)
            .set({ status: "completed" }) 
            .where(eq(aiDirectives.id, directiveId));
            
          console.log(`[DevAgent] Ada successfully executed and pushed Task #${directiveId} to GitHub.`);
          
          await storage.updateAiEmployee(dev.id, { 
            lastOutput: `Successfully completed and pushed Task #${directiveId}`,
            updatedAt: new Date() 
          });

          // 4. Report back to Nikola & get next task in the sequence
          const nextTasks = await db.select()
            .from(aiDirectives)
            .where(and(
              eq(aiDirectives.initiativeId, directive.initiativeId),
              eq(aiDirectives.status, "pending")
            ))
            .orderBy(asc(aiDirectives.id)) // Sequential processing
            .limit(1);

          const nextTask = nextTasks[0] as AiDirective | undefined;

          if (nextTask) {
            console.log(`[DevAgent] Task #${directiveId} done. Picking up next task #${nextTask.id} for initiative #${directive.initiativeId}...`);
            // Run in background with small cooldown to avoid rate limits
            setTimeout(() => {
              this.processCodeDirective(nextTask.id).catch(console.error);
            }, 5000);
          } else {
            // Update initiative status if all tasks are done
            await db.update(aiInitiatives)
              .set({ status: "completed" })
              .where(eq(aiInitiatives.id, directive.initiativeId));
            console.log(`[DevAgent] Initiative #${directive.initiativeId} fully implemented.`);
          }
        } catch (gitErr: any) {
          console.error(`[DevAgent] Ada failed to commit/push Task #${directiveId}`, gitErr);
          // Mark as failed so it doesn't show as "pending/writing" forever
          await db.update(aiDirectives)
            .set({ status: "failed" }) 
            .where(eq(aiDirectives.id, directiveId));
          
          await storage.updateAiEmployee(dev.id, { 
            lastOutput: `Git Failure on Task #${directiveId}: ${gitErr.message.substring(0, 80)}`,
            updatedAt: new Date() 
          });
        }
      }
    } catch (err) {
      console.error("Failed to parse DEV proposed changes", err);
    }
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

${exec.role === "CTO" ? `As CTO, you are the architect. Your primary job in this chat is to translate Founder requests into technical directives for Ada (the DEV) or Katya (the UIUX_DEV). 
If the Founder asks for ANY technical feature, code change, or product iteration, you MUST respond AND include the following tag at the end of your message:
<DELEGATE>A concise, specific technical instruction for the appropriate engineer to implement this entire request.</DELEGATE>
Do NOT just discuss ideas; if there is work to be done, DELEGATE it immediately.` : ""}

${exec.role === "UIUX_DEV" ? `As the Design Engineer, you can also write code for UI components.
If the Founder asks for a UI change, aesthetic tweak, or frontend feature, you MUST respond AND then add the following tag at the end of your message to assign the coding task to yourself:
<DELEGATE>A specific instruction for yourself to implement the UI change.</DELEGATE>` : ""}

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
      model: exec.role === "CTO" ? "gpt-4o" : "gpt-4o-mini",
      messages,
    });

    const replyText = response.choices[0].message.content || "...";

    // Detect Delegation Intent (for CTO)
    if (exec.role === "CTO" && replyText.includes("<DELEGATE>")) {
      const match = replyText.match(/<DELEGATE>([\s\S]*?)<\/DELEGATE>/);
      if (match && match[1]) {
        const taskContent = match[1].trim();
        // Trigger delegation loop!
        // We'll create a dummy high-level initiative for this manual directive
        const inits = await db.select().from(aiInitiatives).where(eq(aiInitiatives.companyId, companyId)).limit(1);
        const initId = inits[0]?.id || 1; 

        // Important: We call our existing atomic task list generator
        const dummyInit = { title: "Technical Request", description: taskContent };
        const prompt = `You are Nikola, CTO. 
TECHNICAL REQUEST: ${taskContent}

Your DEV is Ada. Break this request down into a SEQUENCE of atomic, concrete technical directives (CODE_CHANGE tasks). 
Output strictly JSON: { "tasks": ["Direct instruction for task 1", "Direct instruction for task 2", ...] }`;

        const delegationResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "system", content: prompt }],
          response_format: { type: "json_object" },
        });

        const parsed = JSON.parse(delegationResponse.choices[0].message.content || "{}");
        const tasks = parsed.tasks || [taskContent];

        for (const content of tasks) {
           const dev = employees.find(e => e.role === "DEV");
           if (dev) {
             const created = await storage.createAiDirective({
               initiativeId: initId,
               issuerId: exec.id,
               assigneeId: dev.id,
               content: content,
               type: "CODE_CHANGE",
               status: "pending",
             });
             // Trigger the first one if we're at the start
             if (content === tasks[0]) {
               this.processCodeDirective(created.id).catch(console.error);
             }
           }
        }
      }
    }

    const replyMsg = await storage.saveBoardroomMessage({
      companyId,
      senderType: "employee",
      senderId: String(exec.id),
      senderName: exec.name,
      senderRole: exec.role,
      receiverType: "user",
      receiverId: userId,
      content: replyText.replace(/<DELEGATE>[\s\S]*?<\/DELEGATE>/g, "").trim() || replyText, // Strip tag for cleaner UI
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

  /**
   * Scans for any CODE_CHANGE directives stuck in 'pending' and resumes them.
   * This is critical for recovering from server restarts or crashes.
   */
  async resumePendingTasks(): Promise<void> {
    const pendingDirectives = await db.select()
      .from(aiDirectives)
      .where(and(
        eq(aiDirectives.type, "CODE_CHANGE"),
        eq(aiDirectives.status, "pending")
      ))
      .orderBy(asc(aiDirectives.id));

    if (pendingDirectives.length > 0) {
      console.log(`[Watchdog] Found ${pendingDirectives.length} pending tasks. Resuming Task #${pendingDirectives[0].id}...`);
      // Start with the oldest pending task; the chain will continue from there
      this.processCodeDirective(pendingDirectives[0].id).catch(err => {
        console.error(`[Watchdog] Failed to resume Task #${pendingDirectives[0].id}`, err);
      });
    }
  }

  /**
   * The "Big Red Button": Chains Debate -> Plan -> Delegate -> Code
   */
  async runAutonomousStrategicChain(companyId: number, goal: string, userId: string): Promise<void> {
    console.log(`[StrategicChain] Starting autonomous chain for company #${companyId}...`);
    
    // 1. Run Executive Debate
    const messages = await this.runExecRoomDebate(companyId, goal, userId);
    const debateSummary = messages.map(m => `${m.senderRole}: ${m.content}`).join("\n");

    // 2. Generate Initiatives (Strategic Plan)
    // We update generateStrategicInitiatives implicitly by giving it the debate summary in the future
    const initiatives = await this.generateStrategicInitiatives(companyId, `Based on this debate: ${debateSummary}`);

    // 3. Delegate the first high-priority initiative
    if (initiatives.length > 0) {
      const topInit = initiatives[0];
      await (this as any).delegateDirective(topInit.id, debateSummary);
    }
  }
}

export const corporateOrchestrator = new CorporateOrchestrator();
