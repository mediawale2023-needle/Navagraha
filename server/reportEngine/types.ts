import { z } from 'zod';
import type { LifeDomain } from '@shared/v3/evidence';

export const REPORT_CATEGORIES = ['career', 'marriage', 'finance', 'year_ahead', 'life', 'life_complete'] as const;
export type UniversalReportCategory = typeof REPORT_CATEGORIES[number];

export type ApproximateBirthTimePolicy = 'allow-stable-facts-only' | 'require-exact';
export type PdfRendererId = 'generic-premium' | 'career-premium';

export interface ReportSectionConfig {
  id: string;
  heading: string;
  purpose: string;
  domains: readonly LifeDomain[];
  required: boolean;
  minWords: number;
  evidenceSelectors?: { planets?: readonly string[]; houses?: readonly number[]; sources?: readonly string[] };
}

export interface UniversalReportConfig {
  reportId: UniversalReportCategory;
  reportName: string;
  reportVersion: number;
  requiredChartData: readonly string[];
  requiredDivisionalCharts: readonly ('D1' | 'D9' | 'D10')[];
  requiredEvidence: readonly string[];
  interpretationModules: readonly string[];
  reportSections: readonly ReportSectionConfig[];
  requiredSections: readonly string[];
  optionalSections: readonly string[];
  promptConfiguration: { maxSectionsPerCall: number; maxOutputTokens: number; tone: string };
  validationPolicy: { minimumEvidencePerSection: number; correctionRounds: number };
  pdfRenderer: PdfRendererId;
  deliveryPolicy: 'persist-before-notify';
  approximateBirthTimePolicy: ApproximateBirthTimePolicy;
}

export interface BlueprintEvidence {
  id: string;
  text: string;
  direction: 'supporting' | 'challenging' | 'neutral';
  source: string;
  domains: readonly LifeDomain[];
  planets?: readonly string[];
  houses?: readonly number[];
}

export interface BlueprintSection extends ReportSectionConfig {
  conclusion: string;
  evidenceIds: string[];
  /** Facts this section explains in depth; no fact leads two sections, so others only refer to it. */
  leadEvidenceIds: string[];
  limitations: string[];
}

export interface UniversalReportBlueprint {
  schemaVersion: 1;
  reportId: UniversalReportCategory;
  reportName: string;
  reportVersion: number;
  asOf: string;
  chartMetadata: { timeAccuracy: 'exact' | 'approximate'; withheld: readonly string[] };
  thesis: string[];
  evidence: BlueprintEvidence[];
  sections: BlueprintSection[];
  chartFacts: string;
  disclosures: string[];
}

export const GeneratedSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
  evidenceLinks: z.array(z.object({
    evidenceId: z.string().min(1),
    conclusion: z.string().min(1),
    explanation: z.string().min(1),
  }).strict()).default([]),
}).strict();

export const NarrativeReplySchema = z.object({
  summary: z.string().optional().default(''),
  summaryEvidenceIds: z.array(z.string()).optional().default([]),
  sections: z.array(GeneratedSectionSchema),
  remedies: z.array(z.string()).optional().default([]),
}).strict();

export type GeneratedSection = z.infer<typeof GeneratedSectionSchema>;
export type NarrativeReply = z.infer<typeof NarrativeReplySchema>;

export interface ReportGenerationMetrics {
  engine: 'universal-report-engine';
  version: 1;
  calls: number;
  transportRetries: number;
  formatRetries: number;
  correctionCalls: number;
  costMicroUsd: number;
  durationMs: number;
  editorialWarnings: number;
}
