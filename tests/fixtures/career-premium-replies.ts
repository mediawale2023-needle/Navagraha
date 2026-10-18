/**
 * MOCKED model replies for the plan-driven Career Report: deterministic paragraphs composed from each slot's own
 * evidence, citing what they name. They exercise the pipeline (parsing, citation checks, correction, assembly);
 * they are not, and must never be reported as, an evaluation of GPT-4o's writing.
 */
import type { CareerReportFacts, CareerSectionFacts, CareerSlot } from '../../server/careerReportEvidence';
import type { CareerCompletion } from '../../server/careerReportGeneration';
import type { SectionReply } from '../../server/careerReportRendering';

/** Distinct sentences, used once each per report, so the report-wide repetition check sees no shared frame. */
const CLOSERS = [
  'A useful test is a short assignment with a clear deliverable, judged on what it actually produced.',
  'Watch how quickly feedback reaches you; slow feedback is where this indication tends to cost the most.',
  'Small, reversible commitments let you see whether the reading matches your own experience.',
  'Keep notes on which duties leave you energised and which drain you, since that record outlasts any forecast.',
  'Responsibility offered gradually tends to suit this pattern better than a sudden leap in scope.',
  'Colleagues who review work closely can turn this into an advantage rather than a pressure.',
  'Where a choice is close, the steadier option usually fits this evidence better.',
  'It helps to separate what the role demands daily from what it promises on paper.',
  'Measured targets, agreed in advance, make the strengths described here visible to others.',
  'The weaker side of this reading is best handled by preparation, not avoidance.',
  'Expect the benefit to build over years; short trials show direction, not the final result.',
  'A mentor with experience in this area can shorten the learning considerably.',
  'Treat early friction as information about fit rather than as a verdict on ability.',
  'Organisations with documented processes tend to reward the habits this suggests.',
  'Pairing this strength with a partner who covers its gaps is often more practical than fixing every gap alone.',
  'Your own results over the next year are the best check on how much weight to give this.',
  'Choosing where to specialise matters more here than how fast you move.',
  'Visible, finished work tends to count for more under this pattern than promises of future output.',
  'A written plan with review dates keeps this from drifting into habit.',
  'Seasonal or project-based work is a low-cost way to sample this before committing.',
  'Credit may arrive later than effort under this pattern, so budget patience into plans.',
  'Clear ownership of a defined area tends to bring out the better side of this reading.',
  'When two options look equal, the one with clearer accountability is usually the better fit here.',
  'The pressure described here eases when expectations are explicit from the start.',
  'Short written reviews after each project make the pattern easier to see over time.',
  'Negotiating scope before accepting a role protects against the strain noted here.',
  'Steady skill-building in one domain compounds faster than scattered effort across several.',
  'Ask for responsibilities that can be measured within months, not only over years.',
  'Your network of past colleagues is a practical route into work of this kind.',
  'A trial period, formally agreed, suits the cautious side of this reading.',
  'Technical depth tends to protect you where the evidence is weaker.',
  'Leadership of a small unit is a sensible first step before anything larger.',
  'Budget time for formal training; this evidence favours depth gained slowly.',
  'Regular conversations with someone already doing the work will test the fit cheaply.',
  'Look for employers whose promotion criteria are written down and applied consistently.',
  'Documenting decisions and their outcomes builds the reputation this reading points to.',
  'Changes made between projects carry less risk than changes made in the middle of one.',
  'Choose roles whose daily rhythm matches yours; the evidence speaks to rhythm as much as to field.',
  'A second opinion from a trusted colleague is worth seeking before any large move.',
  'Concentrated effort over a defined season suits this better than constant switching.',
  'Where recognition is slow, a portfolio of finished work speaks on your behalf.',
  'Keep one dependable commitment steady while experimenting at the edges.',
  'An honest audit of current skills is the right starting point here.',
  'Early wins in a narrow area make broader responsibility easier to claim.',
  'Prefer teams where expectations are revisited openly rather than assumed.',
  'Each change of role is best timed after a piece of work is complete.',
  'Look for structures that turn careful work into visible results.',
  'The firmer evidence deserves your first effort; the weaker can wait for proof.',
];
const BODIES = [
  (xs: string) => ` The factors carrying most weight are ${xs}.`,
  (xs: string) => ` Here ${xs} matter most.`,
  (xs: string) => ` Behind this sit ${xs}.`,
  (xs: string) => ` The deciding evidence is ${xs}.`,
  (xs: string) => ` It rests chiefly on ${xs}.`,
  (xs: string) => ` Look first at ${xs}.`,
];

/** Paragraph for one slot: cites its required items plus up to two counted items of its scope, and names only their labels. */
export function paragraphFor(e: CareerReportFacts, slot: CareerSlot, n: number): { text: string; cites: string[] } {
  const item = (id: string) => e.ledger.byId.get(id)!;
  const others = slot.scope.filter((id) => !slot.mustCite.includes(id));
  const counted = others.filter((id) => item(id).role === 'counted');
  const extra = (counted.length ? counted : others).slice(0, 2);
  const cites = Array.from(new Set([...slot.mustCite, ...extra]));
  const named = extra.map((id) => item(id).label);
  const lead: Record<string, string> = {
    'summary.reading': 'This report opens with its conclusions, and the overall reading here is the one your Kundli shows for career.',
    'summary.direction': 'Among the six fields assessed, the leading group and the trailing group are separated by evidence that only one side draws on.',
    'summary.now': 'The present periods set the tone for the next few years, and the coming change of sub-period moves the emphasis.',
    'identity.foundation': 'Your professional make-up is described by how the rising sign, the house of career and their rulers bear on one another.',
    'identity.arrangement': 'The question of a salaried role against independent work is settled by the houses of service and of trade.',
    strengths: 'The professional strengths come first, from the firmest to the lightest.',
    challenges: 'The challenges recur rather than appearing once, which is why they deserve planning.',
    'd1d10.overall': 'The Dasamsa is the divisional chart read for profession; here it is set against the birth chart as a whole.',
    'fields.comparison': 'Drawing the six assessments together shows where the separations are real and where they are slight.',
    'timing.shift': 'The change of sub-period matters less for what it promises than for what it asks you to prepare.',
    'strategy.approach': 'A sensible approach follows from the reading rather than from any single indication.',
  };
  const opening = lead[slot.id] ?? (slot.id.startsWith('field.') ? `${item(slot.mustCite[0]).label} is judged on its own significators and houses.` : slot.id.startsWith('timing.') ? 'This period is read through the condition of its lord.' : 'This planet is read in both of its charts in turn.');
  const FALLBACKS = [
    ' Its condition and the houses it governs decide how much it can carry in practice.',
    ' What it rules, and how well placed it is, shape the work it brings to the fore.',
    ' Its rulerships matter here more than any single placement.',
    ' The houses it governs show where its influence on daily work is felt first.',
  ];
  const anchor = slot.mustCite[0] ? ` Beside ${item(slot.mustCite[0]).label.toLowerCase()},` : '';
  const body = named.length ? `${anchor}${BODIES[n % BODIES.length](named.join(' and ')).replace(/^ (\w)/, (_m, c) => (anchor ? ` ${c.toLowerCase()}` : ` ${c}`))}` : FALLBACKS[n % FALLBACKS.length];
  const close = ` ${CLOSERS[(2 * n) % CLOSERS.length]} ${CLOSERS[(2 * n + 1) % CLOSERS.length]}`;
  return { text: `${opening}${body}${close}`, cites };
}

export function replyFor(e: CareerReportFacts, section: CareerSectionFacts, ids?: string[], counter = { n: 0 }): SectionReply {
  // Each slot's sentences are fixed by its place in the report, so a correction never borrows another slot's.
  const all = e.sections.flatMap((x) => x.slots.map((s) => s.id));
  void counter;
  const slots = Object.fromEntries(section.slots.filter((s) => !ids || ids.includes(s.id)).map((s) => [s.id, paragraphFor(e, s, all.indexOf(s.id))]));
  const strong = e.strongFields.map((f) => `F.${f}`);
  const fieldIds = e.synthesis.order.map((f) => `F.${f}`);
  const STEPS = [
    (f: string) => `Within the next month, list three specific roles in ${f} and note, for each, the skills you already have and the one you would need first.`,
    (f: string) => `Before committing further, speak with two people already working in ${f} about their ordinary week and what they wish they had known.`,
    (f: string) => `Over the coming quarter, take one short project or course connected to ${f} and judge it by what you finished, not by how it felt.`,
  ];
  const step = (id: string, i: number) => ({ cites: [id], text: STEPS[i % STEPS.length](e.ledger.byId.get(id)!.label.toLowerCase()) });
  const steps = section.steps && (!ids || ids.includes('steps')) ? Array.from(new Set([...(strong.length ? strong : fieldIds).slice(0, 2), ...fieldIds])).slice(0, 3).map(step) : [];
  return { slots, steps };
}

/** Which part a prompt is for, and the slots a correction asks for. */
export function promptTarget(e: CareerReportFacts, prompt: string): { section: CareerSectionFacts; correction?: string[] } {
  const lines = prompt.split('\nWRITE, in order')[1].split('\nRULES:')[0].split('\n').slice(1);
  const slotIds = lines.map((l) => l.match(/^([\w.]+?)(?::| \[)/)?.[1]).filter((x): x is string => !!x && x !== 'field.*' && x !== 'steps');
  const section = e.sections.find((s) => (slotIds.length ? s.slots.some((x) => x.id === slotIds[0]) : s.steps))!;
  const correction = prompt.includes('\nCORRECTION\n') ? Object.keys(JSON.parse(prompt.split('\nCORRECTION\n')[1].split('\n')[1])) : undefined;
  return { section, correction };
}

/** A mocked requester; `edit` mutates a reply to reproduce a failure. Usage is estimated from the text sizes (4 bytes ≈ 1 token). */
export function mockedRequester(e: CareerReportFacts, edit?: (reply: SectionReply, section: CareerSectionFacts, attempt: number) => void) {
  const attempts = new Map<string, number>();
  const counter = { n: 0 };
  return async (prompt: string): Promise<CareerCompletion> => {
    const { section, correction } = promptTarget(e, prompt);
    const attempt = (attempts.get(section.key) ?? 0) + 1; attempts.set(section.key, attempt);
    const reply = replyFor(e, section, correction, counter);
    edit?.(reply, section, attempt);
    const content = JSON.stringify(reply);
    return { choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: Math.ceil(Buffer.byteLength(prompt) / 4), completion_tokens: Math.ceil(Buffer.byteLength(content) / 4) } };
  };
}
