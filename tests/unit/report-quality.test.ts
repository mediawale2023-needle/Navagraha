// Paid reports are sold only as AI-written, chart-consistent readings. Without the AI service,
// or when a draft fails the quality check twice, generation fails (the order is then refunded);
// no templated text is ever delivered in its place. Health and longevity are not predicted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ respond: vi.fn<(prompt: string) => string>() }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: async ({ messages }: any) => ({ choices: [{ message: { content: ai.respond(messages[0].content) } }] }) } };
  },
}));
import { getKundli } from '../../server/astroEngine';
import { generateReport, generateLifeReport, reportWindow, LIFE_REPORT_MIN_SECTIONS, LIFE_REPORT_SECTION_COUNT } from '../../server/aiAstrologerService';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { ReportGenerationError, checkSections, textProblems, MIN_SECTION_CHARS } from '../../server/reportQuality';
import { buildInterpretationContext } from '../../server/astroEngine/reasoning/interpretationContext';
import { buildExplanations, groundingBlock, sectionGroundingBlock } from '../../server/astroEngine/reasoning/explanations';

const NEUTRAL = 'This part of the reading draws together the tendencies shown by the calculated chart and turns them into practical, gentle guidance. It describes patterns rather than certainties, points to the periods the chart marks as supportive, and suggests steady habits that help in any season. Free will and effort matter as much as any configuration. ';
const headingsIn = (prompt: string): string[] => {
  const life = prompt.match(/in this order: (\[.*?\])/);
  if (life) return JSON.parse(life[1]);
  return Array.from(prompt.matchAll(/\{"heading": "([^"]+)"/g)).map((m) => m[1]);
};
const reply = (prompt: string, body: (h: string) => string = () => NEUTRAL) => JSON.stringify({
  title: 'Career & Profession Report',
  summary: NEUTRAL,
  sections: headingsIn(prompt).map((heading) => ({ heading, body: body(heading) })),
  remedies: ['Keep a steady daily routine'],
});

let exact: any; let approx: any;
beforeEach(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  ai.respond.mockReset();
  const e = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946);
  exact = { ...e, name: 'E', dateOfBirth: new Date('1990-08-15'), timeOfBirth: '06:30', placeOfBirth: 'Bengaluru' };
  const a = await getKundli('1988-02-14', '06:00', 12.9716, 77.5946, { timeAccuracy: 'approximate' });
  approx = { ...a, name: 'A', dateOfBirth: new Date('1988-02-14'), timeOfBirth: '06:00', placeOfBirth: 'Bengaluru' };
});
afterEach(() => vi.unstubAllEnvs());

describe('standard reports', () => {
  it('fail closed without the AI service: no templated report exists', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(generateReport('career', exact)).rejects.toBeInstanceOf(ReportGenerationError);
    expect(ai.respond).not.toHaveBeenCalled();
  });

  it('deliver every planned section when the draft passes', async () => {
    ai.respond.mockImplementation((p) => reply(p));
    const content: any = await generateReport('career', exact);
    expect(content.sections.map((s: any) => s.heading)).toEqual(['Birth Chart Overview', 'Key Planetary Influences', 'Career Overview', 'Strengths & Ideal Fields', 'Job vs Business', 'Growth Timing & Dashas', 'Challenges to Watch', 'Dasha Periods & Timing']);
    expect(content.birthDetails.ascendant).toBe(exact.ascendant);
    expect(content.dashaTimeline.length).toBeGreaterThan(0);
    expect(content.disclosure).toBeUndefined();
    expect(JSON.stringify(content)).not.toMatch(/Analysis of .* based on your ascendant/);
  });

  it('regenerate once with the problems listed when a section is thin, then deliver', async () => {
    ai.respond
      .mockImplementationOnce((p) => reply(p, (h) => (h === 'Job vs Business' ? 'Short.' : NEUTRAL)))
      .mockImplementationOnce((p) => { expect(p).toMatch(/"Job vs Business": too short/); return reply(p); });
    const content: any = await generateReport('career', exact);
    expect(content.sections).toHaveLength(8);
    expect(ai.respond).toHaveBeenCalledTimes(2);
  });

  it('fail when the model keeps contradicting the chart', async () => {
    const wrong = ['Aries', 'Taurus'].find((s) => s !== exact.ascendant)!;
    ai.respond.mockImplementation((p) => reply(p, (h) => (h === 'Career Overview' ? `Your Lagna is ${wrong}. ${NEUTRAL}` : NEUTRAL)));
    await expect(generateReport('career', exact)).rejects.toThrow(/Lagna is/);
    expect(ai.respond).toHaveBeenCalledTimes(2);
  });

  it('fail when the model returns nothing usable', async () => {
    ai.respond.mockReturnValue('{}');
    await expect(generateReport('career', exact)).rejects.toThrow(/quality check/);
  });

  it('no Health report is offered', async () => {
    await expect(generateReport('health', exact)).rejects.toThrow(/no report is offered/);
  });

  it('an approximate birth time withholds the Lagna, houses, Lagna-based charts and dasha dates, and says why', async () => {
    ai.respond.mockImplementation((p) => reply(p));
    const content: any = await generateReport('life', approx);
    expect(content.birthDetails.ascendant).toBeUndefined();
    expect(content.birthDetails.timeAccuracy).toBe('approximate');
    expect(content.planetaryPositions.length).toBe(9);
    for (const p of content.planetaryPositions) expect(p.house).toBeUndefined();
    expect(content.chartData).toEqual({});
    expect(content.dashaTimeline).toEqual([]);
    expect(content.disclosure).toMatch(/approximate/);
    for (const p of content.planetaryPositions) expect(p.degree).toBeUndefined();
  });

  it('an approximate birth time rejects a section that names a house', async () => {
    ai.respond.mockImplementation((p) => reply(p, (h) => (h === 'Life Overview' ? `Your 10th house shapes your work. ${NEUTRAL}` : NEUTRAL)));
    await expect(generateReport('life', approx)).rejects.toThrow(/approximate/);
  });

  it('an approximate-time report promises no timing and is told not to build on houses or dates', async () => {
    let prompt = '';
    ai.respond.mockImplementation((p) => { prompt ||= p; return reply(p); });
    const content: any = await generateReport('life', approx);
    expect(content.sections.map((s: any) => s.heading)).not.toContain('Dasha Periods & Timing');
    expect(prompt).not.toContain('Dasha Periods & Timing');
    expect(prompt).not.toMatch(/Use the EXACT planetary positions/);
    expect(prompt).toMatch(/birth time is APPROXIMATE/);
    expect(prompt).not.toMatch(/Give realistic timing windows/);
    expect(prompt).toMatch(/no gemstone/);
  });

  it.each(['career', 'marriage', 'finance', 'year_ahead'])('a %s report is never generated from an approximate birth time', async (category) => {
    ai.respond.mockImplementation((p) => reply(p));
    await expect(generateReport(category, approx)).rejects.toThrow(/needs an exact birth time/);
    expect(ai.respond).not.toHaveBeenCalled();
  });

  it('an exact-time report keeps its timing section and exact-data brief', async () => {
    let prompt = '';
    ai.respond.mockImplementation((p) => { prompt ||= p; return reply(p); });
    const content: any = await generateReport('career', exact);
    expect(content.sections.map((s: any) => s.heading)).toContain('Dasha Periods & Timing');
    expect(prompt).toMatch(/Use the EXACT planetary positions/);
  });
});

describe('realistic drafts', () => {
  it('a Year Ahead report may name the months of next year it covers', async () => {
    const next = new Date().getUTCFullYear() + 1;
    ai.respond.mockImplementation((p) => {
      expect(p).toContain(reportWindow(new Date()).slice(0, 30));
      return reply(p, (h) => (h === 'Best & Cautious Months' ? `March ${next} looks steadier for decisions. ${NEUTRAL}` : NEUTRAL));
    });
    const content: any = await generateReport('year_ahead', exact);
    expect(content.sections.some((s: any) => s.body.includes(String(next)))).toBe(true);
  });

  it('a year the chart facts never mention is rejected; one they mention is accepted', () => {
    const guard = { chart: exact.chartData.canonical, factsText: 'Mahadasha until 2031.', asOf: new Date() };
    expect(textProblems(`A turning point arrives in 2093. ${NEUTRAL}`, guard, 0)).toContain('the year 2093 is not in the calculated timing');
    expect(textProblems(`The period closes in 2031. ${NEUTRAL}`, guard, 0)).toEqual([]);
  });

  it('the model is never told a running period the birth time cannot support', async () => {
    const timing = buildInsights(approx.chartData.canonical).timing;
    let prompt = '';
    ai.respond.mockImplementation((p) => { prompt ||= p; return reply(p); });
    await generateReport('life', approx);
    const running = prompt.split('\n').find((l) => l.startsWith('Running period TODAY')) ?? '';
    if (!timing.mahadashaReliable) expect(running).toMatch(/UNCERTAIN/);
    else if (!timing.antardashaReliable) expect(running).toMatch(/do not name it/);
    else expect(running).toMatch(/Antardasha/);
  });
});

describe('Complete Life Report', () => {
  it('needs an exact birth time', async () => {
    ai.respond.mockImplementation((p) => reply(p));
    await expect(generateLifeReport(approx)).rejects.toThrow(/exact birth time/);
    expect(ai.respond).not.toHaveBeenCalled();
  });

  it('is not delivered without a passing Executive Summary', async () => {
    ai.respond.mockImplementation((p) => reply(p, (h) => (h === 'Executive Summary' ? 'Short.' : NEUTRAL)));
    await expect(generateLifeReport(exact)).rejects.toThrow(/Executive Summary/);
  });

  it('has no health or longevity sections and delivers when every batch passes', async () => {
    ai.respond.mockImplementation((p) => reply(p));
    const content: any = await generateLifeReport(exact);
    expect(content.sections).toHaveLength(LIFE_REPORT_SECTION_COUNT);
    expect(content.sections.map((s: any) => s.heading).join('|')).not.toMatch(/health|longevity|constitution/i);
  });

  it('leaves out a section that fails twice but delivers above the minimum', async () => {
    ai.respond.mockImplementation((p) => reply(p, (h) => (h === 'Mantras & Japa' ? 'Too short.' : NEUTRAL)));
    const content: any = await generateLifeReport(exact);
    expect(content.sections).toHaveLength(LIFE_REPORT_SECTION_COUNT - 1);
    expect(content.sections.map((s: any) => s.heading)).not.toContain('Mantras & Japa');
  });

  it(`is not delivered below ${LIFE_REPORT_MIN_SECTIONS} good sections`, async () => {
    ai.respond.mockImplementation((p) => (/houses (1 to 6|7 to 12)/.test(p) ? '{}' : reply(p)));
    await expect(generateLifeReport(exact)).rejects.toThrow(/sections passed the quality check/);
  });

  it('fails closed without the AI service', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(generateLifeReport(exact)).rejects.toBeInstanceOf(ReportGenerationError);
  });
});

describe('complete life report: explanation context per batch (USER_FACING_REASONING_V1)', () => {
  const HEADER = 'INTERPRETATION CONTEXT';
  const promptsFor = async (flag: boolean) => {
    vi.stubEnv('USER_FACING_REASONING_V1', flag ? 'true' : '');
    const prompts: string[] = [];
    ai.respond.mockImplementation((p) => { prompts.push(p); return reply(p); });
    await generateLifeReport(exact);
    return prompts;
  };
  const batch = (prompts: string[], focus: RegExp) => prompts.find((p) => focus.test(p))!;

  it('off: no batch prompt carries any explanation context', async () => {
    const prompts = await promptsFor(false);
    expect(prompts).toHaveLength(11);
    for (const p of prompts) expect(p).not.toContain(HEADER);
  });

  it('on: each batch gets the part of the explanations its sections read, and nothing it would not use', async () => {
    const prompts = await promptsFor(true);
    expect(prompts).toHaveLength(11);
    const ex = buildExplanations(buildInterpretationContext(exact.chartData.canonical, new Date()));
    const whole = groundingBlock(ex);
    // The overview, the twelve houses and the life domains read every life area.
    for (const f of [/core identity/, /houses 1 to 6/, /houses 7 to 12/, /major life domains/]) expect(batch(prompts, f)).toContain(whole);
    // Planet batches: their planets in full, the yogas those planets form and their running periods.
    for (const [f, planets] of [[/the Sun, Moon and Mars/, ['Sun', 'Moon', 'Mars']], [/Mercury, Jupiter and Venus/, ['Mercury', 'Jupiter', 'Venus']], [/Saturn, Rahu and Ketu/, ['Saturn', 'Rahu', 'Ketu']]] as const) {
      const p = batch(prompts, f);
      expect(p).toContain(sectionGroundingBlock(ex, { kind: 'planets', planets }));
      for (const x of ex.planets) expect(p.includes(x.summary), x.planet).toBe((planets as readonly string[]).includes(x.planet));
      for (const y of ex.yogas.filter((y) => planets.some((n) => y.formation.includes(n)))) expect(p).toContain(y.formation);
      for (const per of ex.periods.filter((x) => x.lord && (planets as readonly string[]).includes(x.lord))) expect(p).toContain(per.text);
    }
    const yogas = batch(prompts, /the yogas \(planetary combinations\)/);
    for (const y of ex.yogas) expect(yogas).toContain(`${y.formation} ${y.contribution} ${y.effectiveness}`);
    const dasha = batch(prompts, /dasha life-map/);
    for (const per of ex.periods) expect(dasha).toContain(per.text);
    for (const a of ex.areas) if (a.period) expect(dasha).toContain(a.period);
    const remedies = batch(prompts, /practical remedies/);
    for (const per of ex.periods) expect(remedies).toContain(per.text);
    // Doshas and transits: the block holds nothing on them, so the batch keeps only the grounding rules.
    const doshas = batch(prompts, /doshas and afflictions/);
    expect(doshas).toContain(sectionGroundingBlock(ex, { kind: 'rules' }));
    expect(doshas).not.toContain('- Your running');
    // Every batch keeps the grounding rules; together they carry far less than eleven copies of the whole block.
    for (const p of prompts) expect(p).toContain('Grounding rules:');
    const added = prompts.reduce((n, p) => n + (p.length - p.indexOf(HEADER)), 0);
    expect(added).toBeLessThan(whole.length * 11 * 0.75);
  });
});

describe('checkSections', () => {
  it('matches by heading, then by an unclaimed position, and rejects missing or thin sections', async () => {
    const guard = { chart: exact.chartData.canonical, factsText: '', asOf: new Date() };
    const { accepted, rejected } = checkSections(['A', 'B', 'C', 'D'], [{ heading: 'b', body: NEUTRAL }, { heading: 'x', body: NEUTRAL }, { heading: 'y', body: 'y'.repeat(MIN_SECTION_CHARS - 1) }], guard);
    expect(accepted.map((s) => s.heading)).toEqual(['B']);
    expect(rejected).toEqual([
      { heading: 'A', problems: ['missing'] }, // position 0 is B's section, never reused under A
      { heading: 'C', problems: [`too short (${MIN_SECTION_CHARS - 1} characters)`] },
      { heading: 'D', problems: ['missing'] },
    ]);
  });
});
