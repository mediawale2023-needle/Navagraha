/**
 * Quality gate for paid AI reports: a section is sold only when it is a real, substantive
 * reading that agrees with the calculated chart. Nothing templated is ever substituted.
 */
import type { CanonicalChart } from "@shared/v3/canonical";
import { validateAnswer } from "./agents/answerGuard.js";
import { runningPeriod, dashaTimingStable } from "./astroEngine/evidence/engine.js";

export class ReportGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportGenerationError";
  }
}

export const MIN_SECTION_CHARS = 300;
export const MIN_SUMMARY_CHARS = 120;

export interface ReportGuard {
  chart: CanonicalChart;
  /** The chart text the model was given: any year it names must come from here. */
  factsText: string;
  transits?: string;
  asOf: Date;
}

export interface Section { heading: string; body: string }

/** Problems with one piece of report text: too short, or claims that contradict the chart. */
export function textProblems(text: string, guard: ReportGuard, minChars: number): string[] {
  const body = text.trim();
  if (body.length < minChars) return [`too short (${body.length} characters)`];
  const rp = runningPeriod(guard.chart, guard.asOf);
  const stable = dashaTimingStable(guard.chart, guard.asOf);
  return validateAnswer(body, {
    chart: guard.chart,
    packetText: `${guard.factsText}\n${guard.transits ?? ""}`,
    transits: guard.transits,
    asOf: guard.asOf,
    running: rp ? { mahadasha: rp.mahadasha, antardasha: rp.antardasha } : null,
    timing: { mahadashaReliable: stable.mahadasha, antardashaReliable: stable.antardasha },
  });
}

/** Matches each planned heading to the model's sections and splits them into sellable and rejected. */
export function checkSections(planned: string[], produced: unknown, guard: ReportGuard): { accepted: Section[]; rejected: Array<{ heading: string; problems: string[] }> } {
  const arr: any[] = Array.isArray(produced) ? produced : [];
  const accepted: Section[] = [];
  const rejected: Array<{ heading: string; problems: string[] }> = [];
  const key = (h: unknown) => (typeof h === "string" ? h.trim().toLowerCase() : "");
  const plannedKeys = new Set(planned.map(key));
  planned.forEach((heading, i) => {
    const byHeading = arr.find((s) => key(s?.heading) === key(heading));
    // By position only when that item is not another planned heading's section.
    const byPosition = arr[i] && !plannedKeys.has(key(arr[i]?.heading)) ? arr[i] : undefined;
    const body = String((byHeading ?? byPosition)?.body ?? "").trim();
    const problems = body ? textProblems(body, guard, MIN_SECTION_CHARS) : ["missing"];
    if (problems.length) rejected.push({ heading, problems });
    else accepted.push({ heading, body });
  });
  return { accepted, rejected };
}

/** Correction note for a regeneration attempt. */
export function correctionNote(rejected: Array<{ heading: string; problems: string[] }>): string {
  return `Your previous draft was rejected. Fix these sections and keep every statement consistent with the chart facts given:\n${rejected
    .map((r) => `- "${r.heading}": ${r.problems.join("; ")}`)
    .join("\n")}`;
}
