// Phase B2: every LLM output a user sees is checked against the calculated chart. Non-English
// answers are checked in English and then translated; a translation that changes a number is
// dropped. The daily card and the chart interpretation never predict health and never fall
// back to templated personal astrology; Pro readings carry a visible chart-check note.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ respond: vi.fn<(messages: any[]) => string>() }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: async ({ messages }: any) => ({ choices: [{ message: { content: ai.respond(messages) } }] }) } };
  },
}));
import { getKundli } from '../../server/astroEngine';
import { generateDailyHoroscope, interpretKundli, varaFor, InterpretationUnavailableError } from '../../server/aiAstrologerService';
import { localise, translationKeepsFacts } from '../../server/agents/localise';
import { answerSimple, buildEvidencePacket, routeQuestion } from '../../server/agents/askKundli';
import { chartCheckNote } from '../../server/jyotishAiService';

const NEUTRAL = 'Today favours steady, deliberate effort and honest conversations; patience brings better results than haste.';
let exact: any;
beforeEach(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  ai.respond.mockReset();
  const e = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946);
  exact = { ...e, name: 'E', dateOfBirth: new Date('1990-08-15'), timeOfBirth: '06:30', placeOfBirth: 'Bengaluru' };
});
afterEach(() => vi.unstubAllEnvs());

const wrongLagna = () => ['Aries', 'Taurus'].find((s) => s !== exact.ascendant)!;

describe('translation after checking', () => {
  it('keeps the checked English when a translation changes a number', async () => {
    expect(translationKeepsFacts('Saturn period from 2027 to 2030', 'शनि की अवधि 2027 से 2030')).toBe(true);
    expect(translationKeepsFacts('from 2027 to 2030', 'से 2028 तक 2030')).toBe(false);
    ai.respond.mockReturnValue('अवधि 2031 से');
    expect(await localise('The period runs from 2027.', 'Hindi')).toBe('The period runs from 2027.');
  });
  it('returns the translation when every number is kept, and English untouched', async () => {
    ai.respond.mockReturnValue('अवधि 2027 से');
    expect(await localise('The period runs from 2027.', 'Hindi')).toBe('अवधि 2027 से');
    expect(await localise('Hello', 'English')).toBe('Hello');
  });
  it('Ask always drafts in English so the guard can read it', async () => {
    let system = '';
    ai.respond.mockImplementation((messages) => { system = messages[0].content; return NEUTRAL; });
    const packet = buildEvidencePacket(exact.chartData.canonical, routeQuestion('How is my career?'));
    await answerSimple(packet, 'How is my career?', { language: 'Hindi' } as any);
    expect(system).not.toMatch(/Hindi/);
  });
});

describe('the daily card', () => {
  const card = (over: Record<string, string> = {}) => JSON.stringify({ headline: 'A steady day', overall: NEUTRAL, career: NEUTRAL, love: NEUTRAL, finance: NEUTRAL, advice: 'Plan before acting.', ...over });

  it('is checked, carries no health or rating, and takes colour and number from the weekday lord', async () => {
    ai.respond.mockReturnValue(card());
    const c: any = await generateDailyHoroscope(exact, '2026-10-08');
    expect(c).toMatchObject({ headline: 'A steady day', dayLord: 'Jupiter', luckyColor: 'Yellow', luckyNumber: 3 });
    expect(c).not.toHaveProperty('health');
    expect(c).not.toHaveProperty('rating');
    expect(varaFor('2026-10-11').lord).toBe('Sun');
  });

  it('is regenerated once when it contradicts the chart, then withheld rather than templated', async () => {
    ai.respond.mockReturnValue(card({ overall: `Your Lagna is ${wrongLagna()}. ${NEUTRAL}` }));
    expect(await generateDailyHoroscope(exact, '2026-10-08')).toBeNull();
    expect(ai.respond).toHaveBeenCalledTimes(2);
  });

  it('does not exist without the AI service', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(await generateDailyHoroscope(exact, '2026-10-08')).toBeNull();
  });

  it('is given today\'s transits', async () => {
    let prompt = '';
    ai.respond.mockImplementation((m) => { prompt = m[0].content; return card(); });
    await generateDailyHoroscope(exact, '2026-10-08');
    expect(prompt).toMatch(/Today's transits/);
    expect(prompt).toMatch(/Never mention health/);
  });
});

describe('the chart interpretation', () => {
  const reading = (over: Record<string, string> = {}) => JSON.stringify({ overview: NEUTRAL, personality: NEUTRAL, career: NEUTRAL, relationships: NEUTRAL, currentPeriods: NEUTRAL, doshaAnalysis: NEUTRAL, ...over });

  it('has no health section and keeps only paragraphs that pass the chart check', async () => {
    ai.respond.mockReturnValue(reading({ career: `Your Lagna is ${wrongLagna()}. ${NEUTRAL}` }));
    const r: any = await interpretKundli(exact);
    expect(r.overview).toBe(NEUTRAL);
    expect(r.career).toBeUndefined();
    expect(r).not.toHaveProperty('health');
    expect(r).not.toHaveProperty('luckyFactors');
  });

  it('is unavailable without a passing overview, or for a chart without a V3 calculation', async () => {
    ai.respond.mockReturnValue(reading({ overview: 'Short.' }));
    await expect(interpretKundli(exact)).rejects.toBeInstanceOf(InterpretationUnavailableError);
    await expect(interpretKundli({ ...exact, chartData: { planetaryPositions: [] } })).rejects.toBeInstanceOf(InterpretationUnavailableError);
  });
});

describe('Pro readings', () => {
  it('get a visible chart-check note listing contradictions, and none when consistent', () => {
    const chartData = exact.chartData;
    expect(chartCheckNote(`Your Lagna is ${wrongLagna()}.`, chartData, '')).toMatch(/Chart check: 1 statement .* disagrees/);
    expect(chartCheckNote(NEUTRAL, chartData, '')).toBe('');
    expect(chartCheckNote('लग्न', chartData, '', 'Hindi')).toMatch(/English only/);
  });
});
