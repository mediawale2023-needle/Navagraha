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
// Blueprint ids ("conclusion:relationships", "relationships:d1:7th-lord-placement:saturn:7") are metadata, never prose.
// Bare numeric citation markers ("growth (3).", "(1, 6);") are the same leak in another form; a list number
// before its item ("(1) Build savings") is ordinary prose.
const EVIDENCE_ID_IN_PROSE = /\b[A-Za-z][\w-]*:[A-Za-z][\w@.:-]*|\(\d{1,3}(?:,\s*\d{1,3})*\)(?=\s*(?:[.,;:]|$))/m;

export function editorialWarnings(text: string): string[] {
  const warnings: string[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  if (paragraphs.some((p) => words(p) > 180)) warnings.push('contains a paragraph longer than 180 words');
  if (/\b(?:in conclusion|it is important to note|in practical terms)\b/i.test(text)) warnings.push('contains generic editorial phrasing');
  const sentences = text.split(/[.!?]+/).map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()).filter((s) => s.split(/\s+/).length >= 8);
  if (new Set(sentences).size < sentences.length) warnings.push('repeats a sentence');
  return warnings;
}

const CHART_TERM = /\b(?:Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu|Lagna|Ascendant|Mahadasha|Antardasha|Sarvashtakavarga|\d{1,2}(?:st|nd|rd|th) (?:house|lord)|D9|D10|Navamsa|Dasamsa|Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)\b/;
const sentencesOf = (text: string) => text.split(/[.!?]+/).map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()).filter((s) => s.split(' ').length >= 8);

/** Report-wide editorial measurements (recorded, never blocking): sentences repeated across sections, and paragraphs that name no chart fact. */
export function reportEditorialWarnings(bodies: string[]): string[] {
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  bodies.forEach((body, i) => { for (const s of Array.from(new Set(sentencesOf(body)))) { if (seen.has(s) && seen.get(s) !== i) warnings.push('repeats a sentence from another section'); else seen.set(s, i); } });
  for (const body of bodies) for (const p of body.split(/\n\s*\n/)) if (words(p) >= 30 && !CHART_TERM.test(p)) warnings.push('has a paragraph that names no chart fact');
  return warnings;
}

const PLANET = '(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu)';
const SIGN = '(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)';
const SIGN_CHANGE = new RegExp(`\\b${PLANET}\\b(?:['’]s)?\\s+(?:moves?|moving|shifts?|shifting|enters|entering|will (?:move|enter|shift)|ingress(?:es)?)\\s+(?:in(?:to)?\\s+|to\\s+)?${SIGN}\\b`, 'g');

/** A sign change the text dates must be one the engine supplied; the guard reads such sentences as transits, not checks. */
export function signChangeProblems(text: string, factsText: string): string[] {
  return Array.from(text.matchAll(SIGN_CHANGE)).filter((m) => !factsText.includes(`${m[1]} moves into ${m[2]}`)).map((m) => `says ${m[1]} moves into ${m[2]}, which no supplied dated change shows`);
}

const DATED = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|20\d{2})\b/;
const SENTENCE = /[^.!?]+[.!?]*/g;

/**
 * A dated sentence ("Mars in Leo from November 2026") speaks of the sky then, not the birth chart. Its planet-in-sign
 * claim is hidden from the birth-chart check only when the engine supplied exactly that dated sign change; any other
 * claim is still checked as a placement, so an invented transit fails closed.
 */
export function withoutSuppliedTransits(text: string, factsText: string): string {
  return text.replace(SENTENCE, (sentence) => !DATED.test(sentence) ? sentence
    : sentence.replace(new RegExp(`\\b${PLANET}\\b([^.!?]{0,40}?)\\b${SIGN}\\b`, 'g'), (m, planet: string, _gap: string, sign: string) =>
      factsText.includes(`${planet} moves into ${sign}`) ? ' '.repeat(m.length) : m));
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
      ...(EVIDENCE_ID_IN_PROSE.test(generated.body) ? ['shows internal evidence ids in the prose; describe the fact in words instead'] : []),
      ...(words(generated.body) < section.minWords ? [`only ${words(generated.body)} words; minimum ${section.minWords}`] : []),
      ...(generated.evidenceIds.length < config.validationPolicy.minimumEvidencePerSection ? ['has no structured supporting evidence'] : []),
      ...(unknown.length ? [`uses evidence outside the section blueprint: ${unknown.slice(0, 3).join(', ')}`] : []),
      ...(generated.evidenceLinks.length < config.validationPolicy.minimumEvidencePerSection ? ['does not explain how evidence supports a conclusion'] : []),
      ...(unknownLinks.length ? [`explains evidence outside the section blueprint: ${unknownLinks.slice(0, 3).map((x) => x.evidenceId).join(', ')}`] : []),
      ...(unexplained.length ? ['contains an incomplete evidence-to-conclusion explanation'] : []),
    ];
    return { section, generated, factual: [...factualProblems(withoutSuppliedTransits(generated.body, guard.factsText), guard), ...signChangeProblems(generated.body, guard.factsText)], completeness, editorial: editorialWarnings(generated.body) };
  });
}

export const blockingProblems = (v: SectionValidation) => [...v.factual, ...v.completeness];
