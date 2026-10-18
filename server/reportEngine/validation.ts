import { factualProblems, type ReportGuard } from '../reportQuality';
import type { BlueprintSection, GeneratedSection, NarrativeReply, UniversalReportConfig } from './types';

export interface SectionValidation {
  section: BlueprintSection;
  generated?: GeneratedSection;
  factual: string[];
  completeness: string[];
  editorial: string[];
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const normalized = (s: string) => s.trim().toLowerCase();

export function editorialWarnings(text: string): string[] {
  const warnings: string[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  if (paragraphs.some((p) => words(p) > 180)) warnings.push('contains a paragraph longer than 180 words');
  if (/\b(?:in conclusion|it is important to note|in practical terms)\b/i.test(text)) warnings.push('contains generic editorial phrasing');
  const sentences = text.split(/[.!?]+/).map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()).filter((s) => s.split(/\s+/).length >= 8);
  if (new Set(sentences).size < sentences.length) warnings.push('repeats a sentence');
  return warnings;
}

export function validateNarrative(config: UniversalReportConfig, planned: BlueprintSection[], reply: NarrativeReply, guard: ReportGuard): SectionValidation[] {
  const produced = new Map(reply.sections.map((s) => [normalized(s.heading), s]));
  return planned.map((section) => {
    const generated = produced.get(normalized(section.heading));
    if (!generated) return { section, factual: [], completeness: ['missing required section'], editorial: [] };
    const unknown = generated.evidenceIds.filter((id) => !section.evidenceIds.includes(id));
    const unknownLinks = generated.evidenceLinks.filter((link) => !section.evidenceIds.includes(link.evidenceId));
    const unexplained = generated.evidenceLinks.filter((link) => words(link.explanation) < 8 || words(link.conclusion) < 3);
    const completeness = [
      ...(words(generated.body) < section.minWords ? [`only ${words(generated.body)} words; minimum ${section.minWords}`] : []),
      ...(generated.evidenceIds.length < config.validationPolicy.minimumEvidencePerSection ? ['has no structured supporting evidence'] : []),
      ...(unknown.length ? [`uses evidence outside the section blueprint: ${unknown.slice(0, 3).join(', ')}`] : []),
      ...(generated.evidenceLinks.length < config.validationPolicy.minimumEvidencePerSection ? ['does not explain how evidence supports a conclusion'] : []),
      ...(unknownLinks.length ? [`explains evidence outside the section blueprint: ${unknownLinks.slice(0, 3).map((x) => x.evidenceId).join(', ')}`] : []),
      ...(unexplained.length ? ['contains an incomplete evidence-to-conclusion explanation'] : []),
    ];
    return { section, generated, factual: factualProblems(generated.body, guard), completeness, editorial: editorialWarnings(generated.body) };
  });
}

export const blockingProblems = (v: SectionValidation) => [...v.factual, ...v.completeness];
