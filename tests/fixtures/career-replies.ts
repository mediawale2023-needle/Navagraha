/**
 * Model replies written the way GPT-4o writes for the facts-first prompt: plain second-person prose that
 * explains a fact without restating it. Each slot gets distinct wording, as a real reply does, so the
 * report-wide repetition check sees no copied sentences. Tests mutate these to reproduce failures seen live.
 */
import { namesIn, type CareerReportFacts, type CareerSectionFacts } from '../../server/careerReportEvidence';
import type { CareerCompletion } from '../../server/careerReportGeneration';

const THEMES = [
  'decisions carry visible responsibility', 'steady effort is noticed over several years', 'you can shape a process rather than only follow it',
  'clear standards make it easy to show results', 'practical judgement matters more than titles', 'you can build trust with a small group first',
  'reliability is rewarded with wider scope', 'planning ahead protects you from rushed choices', 'quiet competence earns room to lead',
  'your own initiative can sit beside an organisation', 'structured routines free your energy for harder problems', 'feedback arrives early and often',
  'credit follows careful preparation', 'you can take on more as confidence grows', 'patience with slow beginnings pays back later',
  'your strengths are used daily rather than occasionally', 'small experiments show what fits before big moves', 'mentors who value rigour can guide you',
  'concrete targets keep momentum through slower phases', 'you can balance independence with a dependable base', 'methodical work is valued over quick wins',
  'responsibility grows in measured steps', 'you have space to recover from setbacks without losing ground', 'a clear role helps you avoid scattered effort',
  'long-term relationships with colleagues matter', 'your output can be measured and improved', 'hands-on problem solving is part of the job',
  'consistency outweighs occasional brilliance', 'you can test a direction without staking everything on it', 'skills compound rather than reset with each move',
  'well-defined duties leave room for your own projects', 'you can choose when to step forward', 'your reputation builds through finished work',
  'an organised setting supports your focus', 'you can turn early difficulty into lasting skill', 'regular review keeps your direction honest',
  'you can earn autonomy by delivering on smaller commitments', 'careful records make your contribution easy to see', 'you work alongside people who share your pace',
  'deadlines are realistic and agreed in advance', 'you can specialise without becoming isolated', 'thoughtful preparation is part of the culture',
  'your judgement is trusted on practical matters', 'you can grow a niche over time', 'steady improvement is valued over dramatic change',
  'the scope of the role widens as you prove yourself', 'clear handovers keep work from piling up', 'you can learn from experienced colleagues',
];
const ADVICE = [
  'test it through a real project before committing', 'compare it honestly with what your experience already shows', 'use it as a lens, not a verdict',
  'note where it matches your past choices', 'let your actual results decide how far to lean on it', 'weigh it beside your skills and finances',
];

const SYNTHESES: Record<CareerSectionFacts['key'], string> = {
  overview: 'Put simply, your chart describes someone whose working life is built from several strands rather than a single track. The stronger factors show where effort is most likely to be rewarded, and the weaker ones mark where you should move deliberately and build skill before taking on more. Use this overview to choose what to test first, and let the detailed sections that follow show you why each point holds and how far to rely on it. Read the remaining sections with this outline in mind.',
  periods: 'Across these years the emphasis shifts from one kind of effort to another. The more demanding stretches are times to consolidate, finish what you have started and strengthen your position, while the more supportive ones are better for visible moves and new commitments. None of this fixes what happens: it suggests when to push and when to prepare, so plan larger decisions around these phases and keep your own circumstances at the centre of every choice. Note the dates now so the shifts do not take you by surprise.',
  chart: 'Read as a whole, the structure of your chart shows what your career rests on and where it is exposed. The well-placed factors describe the qualities you can lean on at work, while the weaker ones point to habits and conditions you will need to manage. The divisional chart adds a professional angle but depends on an accurate birth time, so give the birth chart more weight wherever the two seem to pull in different directions. These are the foundations the later sections build on.',
  current: 'At present, the running periods set the tone for how your work feels day to day. They colour which responsibilities come easily and which take more effort, and they suggest where your energy is best spent before the next change. Use this phase to strengthen what the stronger factors support, and handle the weaker areas with patience and preparation rather than forcing quick results that the timing does not favour. Check back when the sub-period changes, because the emphasis moves with it.',
  guidance: 'Overall, the clearest opportunities lie in the fields with the strongest support, approached in a way that matches the balance of your chart. Start with small, low-risk steps that let you test a direction, keep the fields with mixed support as options to develop rather than first choices, and treat weaker areas with caution. Review your progress at each change of period, and let your real results and skills carry more weight than any single indication. Small, steady moves will tell you more than any single bold step.',
};

export function replyFor(evidence: CareerReportFacts, section: CareerSectionFacts, ids?: string[], counter = { n: 0 }) {
  const explain = section.facts.filter((f) => f.explain && (!ids || ids.includes(f.id)));
  const prose = (planets: string[]) => {
    const i = counter.n++;
    const who = planets.length ? `${planets[0] === 'Sun' || planets[0] === 'Moon' ? `The ${planets[0]}` : planets[0]} is the thread here. ` : '';
    return `${who}In practical terms, this points you towards work where ${THEMES[i % THEMES.length]}. Treat it as a tendency rather than a fixed outcome, and ${ADVICE[i % ADVICE.length]}, looking for settings where ${THEMES[(i * 5 + 11) % THEMES.length]}.`;
  };
  const explanations = Object.fromEntries(explain.map((f) => [f.id, prose(namesIn(f.text).planets)]));
  const synthesis = SYNTHESES[section.key];
  const timing = section.facts.find((f) => f.id === 'guidance.timing');
  const fields = section.facts.filter((f) => f.id.startsWith('field.') && f.required);
  const steps = section.steps ? [
    { factIds: [fields[0].id], text: 'Pick one role or project in this field and spend a month doing it alongside your current work, then judge it by the results and how the work feels.' },
    { factIds: [fields[1 % fields.length].id], text: 'Talk to two people already working in this field about their daily tasks, and list the skills you would need to build before moving.' },
    { factIds: [timing!.id], text: 'Use the current sub-period to build skills and savings, and plan any larger change for when the next sub-period begins rather than rushing it.' },
  ] : undefined;
  return { explanations, synthesis: !ids || ids.includes('synthesis') ? synthesis : undefined, steps: !ids || ids.includes('steps') ? steps : undefined };
}

/** The section a prompt asks for, and (in a correction) the slots it asks for. */
export function promptTarget(evidence: CareerReportFacts, prompt: string) {
  const section = evidence.sections.find((s) => prompt.includes(`part of "${s.heading}"`))!;
  const correction = prompt.includes('\nCORRECTION\n') ? Object.keys(JSON.parse(prompt.split('\nCORRECTION\n')[1].split('\n').slice(1).join('\n'))) : undefined;
  return { section, correction };
}

/** A requester that answers every prompt with a realistic reply; `edit` changes a reply before it is sent. */
export function realisticRequester(evidence: CareerReportFacts, edit?: (reply: any, section: CareerSectionFacts, attempt: number) => void) {
  const attempts = new Map<string, number>(); const counter = { n: 0 };
  return async (prompt: string): Promise<CareerCompletion> => {
    const { section, correction } = promptTarget(evidence, prompt);
    const attempt = (attempts.get(section.key) ?? 0) + 1; attempts.set(section.key, attempt);
    const reply = replyFor(evidence, section, correction, counter);
    edit?.(reply, section, attempt);
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 1500, completion_tokens: 900 } };
  };
}
