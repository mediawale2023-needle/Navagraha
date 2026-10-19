import type { BlueprintSection, UniversalReportBlueprint, UniversalReportConfig } from './types';

const evidenceFor = (blueprint: UniversalReportBlueprint, sections: BlueprintSection[]) => {
  const ids = new Set(sections.flatMap((s) => s.evidenceIds));
  return blueprint.evidence.filter((e) => ids.has(e.id));
};

export function narrativePrompt(config: UniversalReportConfig, blueprint: UniversalReportBlueprint, sections: BlueprintSection[], correction?: Record<string, string[]>, explained: string[] = []): string {
  const evidence = evidenceFor(blueprint, sections);
  const limitations = Array.from(new Set(sections.flatMap((s) => s.limitations)));
  const earlier = blueprint.evidence.filter((e) => explained.includes(e.id)).map((e) => e.text);
  return `Write part of a paid ${config.reportName}. The deterministic blueprint is authoritative; explain it but never override or extend it.

REPORT: ${JSON.stringify({ id: config.reportId, version: config.reportVersion, asOf: blueprint.asOf, tone: config.promptConfiguration.tone })}
DISCLOSURES: ${JSON.stringify(blueprint.disclosures)}
LIMITATIONS: ${JSON.stringify(limitations)}
SECTIONS: ${JSON.stringify(sections.map((s) => ({ id: s.id, heading: s.heading, purpose: s.purpose, conclusion: s.conclusion, citableEvidenceIds: s.evidenceIds, leadEvidenceIds: s.leadEvidenceIds, minimumWords: s.minWords, targetWords: Math.ceil(s.minWords * 1.5) })))}
EVIDENCE: ${JSON.stringify(evidence.map((e) => ({ id: e.id, text: e.text, direction: e.direction, source: e.source })))}
${earlier.length ? `ALREADY EXPLAINED IN EARLIER SECTIONS: ${JSON.stringify(earlier)}
` : ''}
Rules:
- Plain, personalised English addressed to "you". Explain how cited facts lead to each practical conclusion.
- Use only supplied facts, conclusions and evidence. Do not calculate, infer a missing placement, or invent dates, yogas, professions or life events.
- Write each section body as three paragraphs of three to four full sentences each (about its targetWords). minimumWords is a hard floor and a shorter body is rejected. Take the length from that section's own evidence, never from filler.
- Each section returns section-level evidenceIds from its own citableEvidenceIds only. EVIDENCE lists entries for every section in this call; an id outside a section's citableEvidenceIds is rejected for that section. For every section also return evidenceLinks that explicitly state the practical conclusion and explain how the cited verified fact supports it. IDs are metadata and must never appear in prose.
- Explain each chart fact fully once. Each section builds its explanation on its own leadEvidenceIds; any other fact it cites gets a brief reference in a clause, never a second explanation. Facts ALREADY EXPLAINED IN EARLIER SECTIONS get a brief reference only.
- Every paragraph rests on a named fact of this chart (a planet, house, sign, period or dated change from EVIDENCE). Never write a paragraph about astrology in general or advice that would suit anyone.
- Distinguish supporting evidence from limits and use cautious language. No guarantees, fear, medical/lifespan claims or sales pressure.
- Return remedies as an empty array. Remedies are attached later only when the deterministic chart supplies them.
- Keep every required section substantive. Editorial polish is desirable, but factual accuracy and completeness take priority.
${correction ? `CORRECTION: Rewrite only the listed sections. Preserve accepted content outside this call. Resolve every blocking problem without adding unsupported claims:\n${JSON.stringify(correction)}` : ''}

Return JSON only: {"summary":"${correction ? 'empty unless summary is requested' : 'report-wide synthesis'}","summaryEvidenceIds":["evidence id"],"sections":[{"heading":"exact requested heading","body":"...","evidenceIds":["id"],"evidenceLinks":[{"evidenceId":"id","conclusion":"specific practical conclusion","explanation":"how that verified fact supports this conclusion, including uncertainty"}]}],"remedies":[]}`;
}
