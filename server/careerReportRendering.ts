import { z } from 'zod';
import { GRAHAS, SIGN_NAMES } from '@shared/v3/canonical';
import { careerReportProblems } from './careerReport';
import type { CareerPacket, CareerEvidenceSet } from './careerReportEvidence';

export function careerSummary({ chart, brief, packets, asOf }: CareerEvidenceSet): string {
  const tenth = chart.houses[9];
  const lord = chart.planets.find((p) => p.name === tenth.lord)!;
  const fields = brief.fields.filter((f) => f.rating !== 'weakly supported');
  const periods = packets[8].facts.filter((f) => f.contexts.includes('Vimshottari')).slice(0, 2).map((f) => f.text).join(' ');
  return `This Career & Profession Report uses the verified D1 birth chart and D10 professional chart as of ${asOf.toISOString().slice(0, 10)}. In D1, the 10th house is ${tenth.sign}; its lord ${tenth.lord} is in ${lord.sign}, house ${lord.house}. The D10 Lagna is ${brief.facts.d10LagnaSign}, ruled by ${brief.facts.d10LagnaLord}. These professional foundations are compared in the sections below, including the conditions that support or qualify their traditional interpretation. ${periods} The dates describe calculated periods, not promised professional events. ${fields.length ? `Fields warranting comparison under the existing assessment are ${fields.map((f) => `${f.label} (${f.rating})`).join(', ')}.` : 'No assessed field has sufficient support for a positive recommendation.'} Each field assessment includes its reasons and limits. The D10 reading depends on the accuracy of the recorded birth time. Actual skills, experience, resources and opportunities must also inform decisions; none can be established from a birth chart alone.`;
}

/** PDF/UI tables must use the same authority as the narrative, never legacy projections. */
export function careerMetadata({ chart, asOf }: CareerEvidenceSet, kundli: any) {
  const positions = chart.planets.map((p) => ({ planet: p.name, sign: p.sign, house: p.house, degree: p.degreeInSign, retrograde: p.retrograde }));
  const status = (p: { start: string; end: string }): 'past' | 'current' | 'upcoming' => Date.parse(p.start) > +asOf ? 'upcoming' : Date.parse(p.end) <= +asOf ? 'past' : 'current';
  return {
    birthDetails: { name: typeof kundli?.name === 'string' ? kundli.name : undefined, dateOfBirth: chart.birth.localDate, timeOfBirth: chart.birth.localTime, placeOfBirth: chart.birth.place, ascendant: chart.ascendant.sign, moonSign: chart.planets.find((p) => p.name === 'Moon')!.sign, sunSign: chart.planets.find((p) => p.name === 'Sun')!.sign, timeAccuracy: 'exact' as const },
    planetaryPositions: positions,
    chartData: { houses: chart.houses.map((h) => ({ house: h.house, sign: h.sign, planets: h.occupants })), planetaryPositions: positions.map((p) => ({ ...p, isRetrograde: p.retrograde })) },
    dashaTimeline: chart.dashas.vimshottari.mahadashas.map((p) => {
      const ad = p.antardashas.find((a) => status(a) === 'current');
      return { planet: p.lord, startDate: p.start.slice(0, 10), endDate: p.end.slice(0, 10), status: status(p), currentAntardasha: ad ? { planet: ad.lord, startDate: ad.start.slice(0, 10), endDate: ad.end.slice(0, 10) } : null };
    }),
  };
}

const block = z.object({ factIds: z.array(z.string()).min(1).max(40), contexts: z.array(z.enum(['D1', 'D10', 'Vimshottari'])).min(1).max(3), text: z.string().min(1).max(6000) }).strict();
export const careerDraftSchema = z.object({ supporting: block, limiting: block, conclusion: block }).strict();
export type CareerDraft = z.infer<typeof careerDraftSchema>;
export const countCareerWords = (s: string) => (s.match(/[A-Za-z0-9'’-]+/g) ?? []).length;

// Facts live in typed references and are rendered by code. Free prose cannot restate or
// introduce placements, periods, combinations or professional-field recommendations.
const FACT_PROSE = new RegExp(`\\b(${[...GRAHAS, ...SIGN_NAMES, 'D1', 'D10', 'Lagna', 'Dasamsa', 'Mahadasha', 'Antardasha', 'Vimshottari', 'yoga', 'yogas', 'nakshatra', 'ascendant', 'exalted', 'debilitated', 'combust', 'retrograde', 'kendra', 'trikona', 'dusthana', 'bindus', 'degrees', 'lord', 'lords'].join('|')})\\b|\\d|\\b(?:own sign|rising sign|planet|planets|house|houses|conjunct|conjunction|aspect|aspects|zodiac)\\b`, 'i');
/**
 * A named planetary placement must cite that planet's verified placement
 * in the same chart and interpretation block.
 * Chart-wide accuracy is checked separately by textProblems().
 */
function unsupportedPlacementClaims(
  text: string,
  factIds: string[],
): string[] {
  const problems: string[] = [];
  const planetNames = GRAHAS.join('|');
  const signNames = SIGN_NAMES.join('|');

  const placement = new RegExp(
    `\\b(${planetNames})\\b(?:['’]s)?\\s+(?:(?:is|sits|placed|posited|located|was)\\s+)?(?:in|into|occupies)\\s+(?:the\\s+sign\\s+(?:of\\s+)?)?(${signNames})\\b`,
    'gi',
  );

  for (const match of Array.from(text.matchAll(placement))) {
    const planet = GRAHAS.find(
      (name) => name.toLowerCase() === match[1].toLowerCase(),
    );
    if (!planet) continue;

    const sentenceStart = Math.max(
      text.lastIndexOf('.', match.index) + 1,
      text.lastIndexOf('!', match.index) + 1,
      text.lastIndexOf('?', match.index) + 1,
    );
    const nextPunctuation = text.slice(match.index + match[0].length).search(/[.!?]/);
    const sentenceEnd = nextPunctuation < 0
      ? text.length
      : match.index + match[0].length + nextPunctuation;
    const sentence = text.slice(sentenceStart, sentenceEnd);

    const charts = Array.from(sentence.matchAll(/\bD(1|10)\b/gi))
      .map((m) => `D${m[1]}`);

    const uniqueCharts = Array.from(new Set(charts));

    if (uniqueCharts.length === 0) {
      problems.push(`placement for ${planet}: identify the chart (D1 or D10)`);
      continue;
    }

    if (uniqueCharts.length > 1) {
      problems.push(`placement for ${planet}: clarify whether this placement belongs to D1 or D10`);
      continue;
    }

    const required = `${uniqueCharts[0]}.planet.${planet}`;
    if (!factIds.includes(required)) {
      problems.push(`placement for ${planet}: cite ${required} in this block`);
    }
  }

  return problems;
}

const CERTAIN = /\b(?:will|shall|definitely|certainly|guaranteed|destined|inevitably)\b/i;
const GENERIC = /\b(?:leadership (?:potential|qualities|capabilities|roles?)|hard work|networking|success will come|bright future|great potential|strong potential|many opportunities|opportunities will|natural leader|challenges may arise|with patience|work hard|positive energy|cosmic)\b/i;
const FIELD_CLAIM = /\b(?:recommend\w*|suited|suitable|ideal|best|pursue|choose|enter)\b[^.!?]*\b(?:government|administrat\w*|business|entrepreneur\w*|financ\w*|management|communicat\w*|media|consult\w*|teach\w*|bank\w*|sales|marketing)\b/i;

/** This is a stronger structural contract, not a keyword proxy for evidence or balance. */
export function validateCareerDraft(packet: CareerPacket, input: unknown): { draft?: CareerDraft; problems: string[] } {
  const parsed = careerDraftSchema.safeParse(input);
  if (!parsed.success) return { problems: ['schema: supply supporting, limiting and conclusion blocks with factIds, contexts and text'] };
  const draft = parsed.data;
  const problems: string[] = [];
  for (const [kind, b] of Object.entries(draft)) {
    const refs = b.factIds.map((id) => packet.facts.find((f) => f.id === id));
    if (new Set(b.factIds).size !== b.factIds.length) problems.push(`${kind}: duplicate evidence references`);
    if (kind !== 'conclusion' && !b.factIds.some((id) => packet[kind as 'supporting' | 'limiting'].includes(id))) problems.push(`${kind}: reference the supplied ${kind} indicators or their explicit evidence gap`);
    if (refs.some((f) => !f)) problems.push(`${kind}: unknown or out-of-section evidence reference`);
    const contexts = Array.from(new Set(refs.flatMap((f) => f?.contexts ?? []))).sort();
    if (JSON.stringify(Array.from(new Set(b.contexts)).sort()) !== JSON.stringify(contexts)) problems.push(`${kind}: D1/D10/period context must exactly match referenced facts`);

    problems.push(...unsupportedPlacementClaims(b.text, b.factIds).map((problem) => `${kind}: ${problem}`));
    if (CERTAIN.test(b.text)) problems.push(`${kind}: certain predictions prohibited`);
    if (GENERIC.test(b.text)) problems.push(`${kind}: generic content`);
    if (FIELD_CLAIM.test(b.text)) problems.push(`${kind}: professional recommendations must come from the deterministic field assessment`);
    if (packet.id === 6 && /\b(?:government|administration|entrepreneurship|finance|management|communication|media|consulting|teaching|banking|sales|marketing|business)\b/i.test(b.text)) problems.push(`${kind}: name professional fields only through their verified references`);
    const min = packet.minimumWords === 40 ? 10 : 45;
    if (countCareerWords(b.text) < min) problems.push(`${kind}: too short; provide at least ${min} substantive words explaining the referenced evidence`);
  }
  const argued = new Set([...draft.supporting.factIds, ...draft.limiting.factIds]);
  if (draft.conclusion.factIds.some((id) => !argued.has(id))) problems.push('conclusion: use only evidence already weighed in supporting or limiting blocks');
  if (countCareerWords([...packet.facts.map((f) => f.text), draftProse(draft)].join('\n')) < packet.minimumWords) problems.push(`too short: substantive section requires ${packet.minimumWords} words, excluding labels and reference IDs; expand the interpretations without repeating facts`);
  const repetition = careerReportProblems([{ heading: packet.heading, body: draftProse(draft) }]);
  problems.push(...(repetition.get(packet.heading) ?? []).map(() => 'repetition: each paragraph must add distinct information'));
  return { draft, problems };
}

export function draftProse(draft: CareerDraft): string { return [draft.supporting.text, draft.limiting.text, draft.conclusion.text].join('\n\n'); }

/** Every factual value is owned by the engine; AI supplies interpretation only. */
export function renderCareerSection(packet: CareerPacket, draft: CareerDraft): string {
  const labels = { supporting: 'Supporting indicators', limiting: 'Opposing or limiting indicators', conclusion: 'Practical conclusion' };
  const ref = (id: string) => `E${packet.facts.findIndex((f) => f.id === id) + 1}`;
  const facts = packet.facts.map((f) => `[${ref(f.id)}; ${f.contexts.join(' / ')}] ${f.text}`).join('\n');
  return `Verified evidence\n${facts}\n\n` + (Object.keys(labels) as Array<keyof CareerDraft>).map((key) => {
    const b = draft[key];
    return `${labels[key]} (${b.contexts.join(' / ')}; evidence: ${b.factIds.map(ref).join(', ')})\n${b.text}`;
  }).join('\n\n');
}

export function careerDraftPrompt(packet: CareerPacket, problems: string[] = []): string {
  // Private birth details, the full canonical chart and legacy projections are never sent.
  return `Write one Career Report interpretation for an adult reader. Return JSON with exactly three blocks: supporting, limiting, conclusion. Each block has factIds (IDs from the packet), contexts (the exact union of D1, D10, Vimshottari contexts of those facts), and text.
The application prints ALL verified facts separately. You may use planetary names, signs, houses, chart names and traditional astrological terminology when explaining the supplied evidence. Every factual astrological claim must be supported by a factId cited in the SAME block and must agree exactly with that verified fact. Clearly identify D1 versus D10 when describing placements. Do not invent placements, aspects, yogas, dignities, period dates or numerical values. Do not introduce chart facts absent from the cited evidence. Explain its permitted traditional meaning and practical implications. Each block needs 80-100 substantive words (10-30 if minimumWords is 40). The total prose plus verified facts must meet minimumWords; labels and reference IDs do not count. No filler, personal-history assumptions, certainty, fabricated strengths or limitations. A lack of adverse evidence must be described as a limitation of inference, not as an invented obstacle. Put supporting evidence first, limiting evidence second, and a conditional conclusion last. The conclusion must cite only evidence already weighed in the first two blocks. Conclusions must not introduce a new career recommendation: field recommendations are printed from the deterministic assessment. Never promise employment, wealth or events. These are traditional interpretations, not scientific predictions. Avoid repeated sentences across sections. Respect the section's permitted interpretations.
PACKET\n${JSON.stringify({ ...packet, facts: packet.facts.map(({ value, ...fact }) => fact) })}${problems.length ? `\nCORRECTION: The previous section failed these exact checks. Correct each; the evidence has not changed.\n${problems.join('\n')}` : ''}`;
}
