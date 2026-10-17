/**
 * Model replies written the way GPT-4o writes for the facts-first prompt: plain second-person prose that
 * explains a fact without restating it. Each slot gets distinct wording, as a real reply does, so the
 * report-wide repetition check sees no copied sentences. Tests mutate these to reproduce failures seen live.
 */
import { namesIn, type CareerReportFacts, type CareerSectionFacts } from '../../server/careerReportEvidence';
import type { CareerCompletion } from '../../server/careerReportGeneration';

const WORK_SETTINGS = [
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

const SYNTHESES: Record<CareerSectionFacts['key'], string> = {
  overview: 'Put simply, your chart describes someone whose working life is built from several strands rather than a single track. The stronger factors show where effort is most likely to be rewarded, and the weaker ones mark where you should move deliberately and build skill before taking on more. Use this overview to choose what to test first, and let the detailed sections that follow show you why each point holds and how far to rely on it. Read the remaining sections with this outline in mind.',
  periods: 'Across these years the emphasis shifts from one kind of effort to another. The more demanding stretches are times to consolidate, finish what you have started and strengthen your position, while the more supportive ones are better for visible moves and new commitments. None of this fixes what happens: it suggests when to push and when to prepare, so plan larger decisions around these phases and keep your own circumstances at the centre of every choice. Note the dates now so the shifts do not take you by surprise.',
  chart: 'Read as a whole, the structure of your chart shows what your career rests on and where it is exposed. The well-placed factors describe the qualities you can lean on at work, while the weaker ones point to habits and conditions you will need to manage. The divisional chart adds a professional angle but depends on an accurate birth time, so give the birth chart more weight wherever the two seem to pull in different directions. These are the foundations the later sections build on.',
  current: 'At present, the running periods set the tone for how your work feels day to day. They colour which responsibilities come easily and which take more effort, and they suggest where your energy is best spent before the next change. Use this phase to strengthen what the stronger factors support, and handle the weaker areas with patience and preparation rather than forcing quick results that the timing does not favour. Check back when the sub-period changes, because the emphasis moves with it.',
  guidance: 'Overall, the clearest opportunities lie in the fields with the strongest support, approached in a way that matches the balance of your chart. Start with small, low-risk steps that let you test a direction, keep the fields with mixed support as options to develop rather than first choices, and treat weaker areas with caution. Review your progress at each change of period, and let your real results and skills carry more weight than any single indication. Small, steady moves tell you more than any single bold step.',
};

export function replyFor(evidence: CareerReportFacts, section: CareerSectionFacts, ids?: string[], counter = { n: 0 }) {
  const explain = section.facts.filter((f) => f.explain && (!ids || ids.includes(f.id)));
  const prose = (fact: CareerSectionFacts['facts'][number]) => {
    const i = counter.n++;
    const setting = WORK_SETTINGS[i % WORK_SETTINGS.length];
    const test = WORK_SETTINGS[(i * 5 + 11) % WORK_SETTINGS.length];
    const planet = namesIn(fact.text).planets[0];
    const periodLord = fact.id.match(/^period\.(?:Mahadasha|Antardasha)\.([^.]+)/)?.[1] ?? planet;
    const field = fact.text.match(/^([^:]+): (?:well|mixed|weakly)/)?.[1];
    if (field && fact.id === 'field.administration') return `For administration, the support balance matters because it tests whether structured responsibility is consistently backed by the chart. Look for process-heavy roles where ${setting}, and compare the daily duties through a limited assignment before committing.`;
    if (field && fact.id === 'field.government') return `Government and institutional work has mixed evidence, so the supporting factors should be weighed against the stated constraint rather than read as a blanket recommendation. Investigate organisations where ${setting}, using conversations with practitioners to test the fit.`;
    if (field && fact.id === 'field.business') return `Business and entrepreneurship earns attention because several stated indicators support initiative, while the contrary evidence shows where a venture may need safeguards. Test a small commercial project in conditions where ${setting}, and measure the result before expanding it.`;
    if (field && fact.id === 'field.advisory') return `The evidence for advisory and consulting roles combines useful support with a clear limitation. That balance suggests trying defined, expertise-led assignments where ${setting}, while client feedback and completed outcomes determine whether the profession deserves a larger commitment.`;
    if (field && fact.id === 'field.finance') return `Finance and management has enough support to merit a practical trial because its favourable indicators outweigh, but do not erase, the stated weaknesses. Compare roles where ${setting}, paying close attention to accuracy, controls and the quality of decisions.`;
    if (field) return `Communication and public-facing professions are supported by several factors, but the listed counterweights make role selection important. This suggests testing work where ${setting}, then using audience response and measurable output to decide which communication duties fit in practice.`;
    if (fact.id === 'overview.workStyle') return `The comparison of service, trade and business support matters because no single arrangement clearly outweighs the others. A blended working pattern is therefore more credible than an all-or-nothing choice: keep a dependable base while testing responsibilities where ${setting}.`;
    if (fact.id === 'overview.fields') return `The support pattern across the assessed professions narrows the useful options because it distinguishes consistent evidence from a single attractive indicator. Begin with work where ${setting}, then compare the shortlisted fields against your skills, finances and actual results.`;
    if (fact.id === 'overview.strength') return `${planet ? `${planet}'s stated condition` : 'The stated strength'} is relevant because a comparatively supported career factor can describe the kind of responsibility that may be easier to sustain. Look for roles where ${setting}, while treating performance in real assignments as the deciding evidence.`;
    if (fact.id === 'overview.caution') return `${planet ? `${planet}'s stated weakness` : 'The stated weakness'} matters because a pressured career factor can make some professional conditions harder to sustain consistently. Favour settings where ${setting}, and use a limited trial to see whether ${test}.`;
    if (fact.id.startsWith('period.')) {
      const periodVariants = [
        `Because ${periodLord ?? 'the period lord'} carries both supporting and difficult conditions, this period is better used as a planning climate than treated as a verdict. Favour work where ${setting}, and increase commitment only after checking whether ${test}.`,
        `The timing evidence for ${periodLord ?? 'this phase'} mixes opportunity with pressure; that combination suggests consolidating what is dependable while testing work where ${setting}. Let actual progress show whether ${test} before making a larger move.`,
        `${periodLord ?? 'This period'} connects to career timing through the stated condition of its lord, so its value lies in pacing decisions rather than predicting events. Use it to examine roles where ${setting}, with ${test} as a checkpoint.`,
        `This phase carries the verified strengths and constraints of ${periodLord ?? 'its lord'}, which means it can guide the sequence of career choices without forecasting an event. Complete work where ${setting}, and record whether ${test}.`,
        `Read ${periodLord ?? 'the period lord'} as the period context for these dates: the stated support and pressure indicate what deserves preparation, not what must happen. Keep career commitments measured while ${setting}, and reassess when ${test}.`,
      ];
      return periodVariants[i % periodVariants.length];
    }
    if (fact.id === 'current.mahadasha') return `The active Mahadasha provides the long background for present career decisions because its lord's stated condition colours which demands are easier to sustain. Concentrate on responsibilities where ${setting}, while checking progress against completed work.`;
    if (fact.id === 'current.antardasha') return `Within that longer cycle, the running Antardasha describes the immediate pressure on day-to-day work. Its mixed condition suggests prioritising duties where ${setting}, then reviewing whether ${test} before taking on more.`;
    if (fact.id === 'current.next') return `The next sub-period changes the timing emphasis through the condition described for ${planet ?? 'its lord'}, so preparation matters more than prediction. Strengthen work routines where ${setting}, and use the transition to assess whether ${test}.`;
    if (fact.id.includes('tenthLord')) return `The 10th lord's rulership and condition connect career direction with the way responsibility is carried. Because that evidence has both supportive and limiting features, choose work where ${setting}, then judge the reading by whether ${test}.`;
    if (fact.id === 'chart.d10Tenth') return `Because the D10's 10th-house structure describes the organisation of professional duties, it can distinguish work that looks attractive from work that is sustainable. Compare roles where ${setting}, while checking whether ${test}.`;
    if (fact.id.includes('tenth')) return `The 10th-house structure is relevant because that house frames public responsibility and the way professional contribution becomes visible. It supports a broad preference for work where ${setting}, but does not by itself identify one occupation.`;
    if (fact.id === 'chart.d10Lagna') return `The D10 Lagna and its rulership matter because they describe the stance taken in professional life. Use that structure to compare environments where ${setting}, but rely on actual duties and results to decide whether ${test}.`;
    if (fact.id.includes('lagna')) return `The shared rulership is meaningful because it links self-presentation with the chart's career structure. That connection may favour work where ${setting}; it remains a broad tendency, so test it where ${test}.`;
    if (fact.id.includes('yoga')) {
      if (/Neecha|debilitation/i.test(fact.text)) return `Because the weakness is softened, the stated career factor need not be read only through its limitation, although the difficulty still matters. Compare professional roles where ${setting}, without treating the cancellation as a promise.`;
      if (fact.id.endsWith('.1')) return `The combination is career-relevant because its members connect a personal capacity with the verified professional indicator. It may be useful in work where ${setting}, but only completed work can show how much weight to give it.`;
      if (fact.id.endsWith('.2')) return `This Yoga joins the stated chart areas, which suggests that professional work where ${setting} may be easier to develop. Treat the combination as supporting context and verify it through practice.`;
      if (fact.id.endsWith('.3')) return `By linking the verified factors, this Yoga suggests a possible advantage in work where ${setting}. Its scope is limited to that connection, so judge its relevance through sustained duties rather than the name of the combination.`;
      return `This combination has professional relevance because it includes the career factor identified in the evidence. That link may help in roles where ${setting}, but it remains secondary to demonstrated skills and completed results.`;
    }
    if (fact.id.includes('d10') || /D10/.test(fact.text)) {
      const d10Variants = [
        'The D10 placement shows how the stated factor may operate at work, so it is useful for comparing environments rather than naming an occupation. Prefer settings with clear standards, then check the reading against completed duties.',
        'Because the D10 evidence concerns professional expression, it adds a work-specific lens to the birth-chart factor without overruling it. Give more weight to roles with measurable responsibilities and regular review.',
        'The contrast between the birth chart and D10 matters because a quality may be easier to express in some workplaces than others. Test defined responsibilities and observe whether careful preparation improves delivery.',
        'This D10 condition supports only a broad reading of professional style. Use it to compare structured and flexible environments, but let actual skills and results identify the better job.',
      ];
      return d10Variants[i % d10Variants.length];
    }
    return `This evidence supports only a broad tendency and does not by itself identify a specific profession. Use it to compare work where ${setting}, and rely on your actual results to decide whether ${test}.`;
  };
  const explanations = Object.fromEntries(explain.map((f) => [f.id, prose(f)]));
  const synthesis = SYNTHESES[section.key];
  const timing = section.facts.find((f) => f.id === 'guidance.timing');
  // Steps act on the best-supported fields first, as the prompt asks.
  const fields = section.facts.filter((f) => f.id.startsWith('field.') && f.required).sort((a, b) => Number(/: well supported\./.test(b.text)) - Number(/: well supported\./.test(a.text)));
  const fieldName = (fact: typeof fields[number]) => fact.text.split(':', 1)[0];
  const steps = section.steps ? [
    { factIds: [fields[0].id], text: `Test ${fieldName(fields[0]).toLowerCase()} through one small role or project alongside your current work for a month, then judge the option by its results and daily demands.` },
    { factIds: [fields[1 % fields.length].id], text: `Talk to two people working in ${fieldName(fields[1 % fields.length]).toLowerCase()} about their daily tasks, then list the specific skills and entry requirements you would need before moving.` },
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
