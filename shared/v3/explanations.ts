/**
 * User-facing chart explanations (USER_FACING_REASONING_V1, default off). Plain-language text
 * built from the canonical interpretation context; it explains the existing verdicts and evidence and
 * never changes them. Shared so the client can render what the server sends.
 */
import type { Graha } from "./canonical";
import type { Confidence, EvidenceStrength, LifeDomain, Verdict } from "./evidence";

export const EXPLANATIONS_VERSION = 1 as const;

/** One existing evidence item, in its own words, traceable by id. */
export interface ExplainedFactor {
  evidenceId: string;
  text: string;
  strength: EvidenceStrength;
  /** natal: the birth chart; period: the running dasha; yoga: a recognised combination. */
  kind: "natal" | "period" | "yoga";
}

export interface AreaExplanation {
  domain: LifeDomain;
  label: string;
  /** The existing verdict and confidence, unchanged. */
  verdict: Verdict;
  confidence: Confidence;
  summary: string;
  supports: ExplainedFactor[];
  challenges: ExplainedFactor[];
  /** How the running period bears on this area, when it does. */
  period: string | null;
  /** Yogas that count toward this area's assessment. */
  yogas: string[];
  uncertainty: string[];
}

export interface PlanetExplanation {
  planet: Graha;
  summary: string;
  points: string[];
  uncertainty: string[];
}

export interface YogaExplanation {
  id: string;
  name: string;
  /** Present in the chart (or detected and cancelled). */
  formation: string;
  /** Whether it counts toward an existing assessment, and why not when it does not. */
  contribution: string;
  /** Always says that effectiveness is not assessed. */
  effectiveness: string;
  /** A participant's running period: timing only. */
  period: string | null;
}

export interface PeriodExplanation {
  id: string;
  level: "mahadasha" | "antardasha";
  lord: Graha | null;
  text: string;
  areas: string[];
}

export interface ChartExplanations {
  version: typeof EXPLANATIONS_VERSION;
  birthTime: "exact" | "approximate";
  areas: AreaExplanation[];
  planets: PlanetExplanation[];
  yogas: YogaExplanation[];
  periods: PeriodExplanation[];
  disclosures: string[];
}
