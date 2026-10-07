/**
 * Evidence / Resolution / Timeline types shared by server and client.
 * Evidence is produced deterministically from a CanonicalChart; the AI only
 * explains it.
 */
import type { Graha } from "./canonical";

export const EVIDENCE_ENGINE_VERSION = "3.0.0" as const;

export const LIFE_DOMAINS = [
  "career", "wealth", "relationships", "leadership", "property", "foreign", "education", "children", "spirituality",
] as const;
export type LifeDomain = typeof LIFE_DOMAINS[number];

export const DOMAIN_LABELS: Record<LifeDomain, string> = {
  career: "Career", wealth: "Wealth", relationships: "Relationships", leadership: "Leadership",
  property: "Property & Home", foreign: "Foreign & Travel", education: "Education", children: "Children", spirituality: "Spirituality",
};

export type EvidenceSource = "D1" | "D4" | "D7" | "D9" | "D10" | "Dasha" | "Ashtakavarga" | "Shadbala" | "Yoga" | "Jaimini";
export type EvidenceDirection = "positive" | "negative" | "neutral";
export type EvidenceStrength = "strong" | "moderate" | "weak";
/**
 * classical-principle — a widely taught textbook principle (no verse cited);
 * derived-rule — a deterministic encoding/threshold built on classical ideas;
 * modern-convention — a practitioner convention without a classical basis.
 */
export type EvidenceProvenance = "classical-principle" | "derived-rule" | "modern-convention";

export interface EvidenceItem {
  id: string;
  domain: LifeDomain;
  factor: string;          // short label, e.g. "10th lord placement"
  planet?: Graha;
  house?: number;
  direction: EvidenceDirection;
  strength: EvidenceStrength;
  source: EvidenceSource;
  provenance: EvidenceProvenance;
  rule: string;            // the general rule being applied
  explanation: string;     // the chart-specific fact
  requiresBirthTime: boolean;
  /** False when the birth time is approximate and this item depends on it. */
  usable: boolean;
}

export const VERDICTS = ["Exceptional", "Very Strong", "Strong", "Mixed", "Challenging", "Very Challenging"] as const;
export type Verdict = typeof VERDICTS[number];
export type Confidence = "High" | "Medium" | "Low";

export interface DomainResolution {
  domain: LifeDomain;
  label: string;
  verdict: Verdict;
  confidence: Confidence;
  supporting: EvidenceItem[];
  conflicting: EvidenceItem[];
  neutral: EvidenceItem[];
  excluded: EvidenceItem[];     // not usable (birth-time dependent with approximate time)
  confirmedBy: EvidenceSource[];  // independent sources on the supporting side
  contradictedBy: EvidenceSource[];
  conclusion: string;           // deterministic, template-built sentence
  notes: string[];
}

export interface TimelinePeriod {
  level: "mahadasha" | "antardasha";
  lord: Graha;
  start: string;
  end: string;
  status: "past" | "current" | "upcoming";
  themes: string[];
  domains: Array<{ domain: LifeDomain; direction: EvidenceDirection; reasons: string[] }>;
  supporting: string[];
  conflicting: string[];
  confidence: Confidence;
  whyItMatters: string;
  antardashas?: TimelinePeriod[];
}

export interface KundliInsights {
  engineVersion: typeof EVIDENCE_ENGINE_VERSION;
  asOf: string;
  headline: { lagna: string | null; moonSign: string; sunSign: string; calculation: string; timeAccuracy: "exact" | "approximate" };
  domains: DomainResolution[];
  timeline: TimelinePeriod[];
  currentPeriod: { mahadasha: Graha; antardasha: Graha | null; start: string; end: string } | null;
  notes: string[];
}
