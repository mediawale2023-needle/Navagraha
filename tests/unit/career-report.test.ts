/**
 * Career & Profession Report: the deterministic career evidence, the career-only section checks and the remedy
 * safeguards, built for the defects found in the first production report (D10 barely used, generic claims,
 * Neecha Bhanga presented as a separate Raja Yoga, unjustified gemstones).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ respond: vi.fn<(prompt: string) => string>() }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: async ({ messages }: any) => ({ choices: [{ message: { content: ai.respond(messages[0].content) } }] }) } };
  },
}));
import { getKundli } from '../../server/astroEngine';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { generateReport } from '../../server/aiAstrologerService';
import { careerBrief, careerRemedies, careerSectionProblems, type CareerFacts } from '../../server/careerReport';

const ASOF = new Date('2026-10-14T06:00:00Z');
// The production report's birth details: 13 Nov 1991, 12:30 IST, Belagavi.
const sanket = async () => ({ ...(await getKundli('1991-11-13', '12:30', 15.8497, 74.4977)) as any, name: 'S', dateOfBirth: new Date('1991-11-13'), timeOfBirth: '12:30', placeOfBirth: 'Belagavi' });
const headingsIn = (prompt: string): string[] => Array.from(prompt.matchAll(/\{"heading": "([^"]+)"/g)).map((m) => m[1]);
const FILL = 'The reading weighs these placements together with the other factors of the chart and describes tendencies rather than certainties, so the native can use the periods the chart marks as supportive and plan steadily for the ones it marks as demanding. ';

/** Section bodies that meet the career requirements, built from the chart's own career facts. */
function careerBody(h: string, f: CareerFacts): string {
  const bodies: Record<string, string> = {
    'Tenth House & Its Lord (D1)': `The 10th house is ${f.tenthSign} and its lord ${f.tenthLord} sets the tone of the profession. `,
    'Dasamsa (D10) Analysis': `In the D10 chart the Lagna is ${f.d10LagnaSign}, ruled by ${f.d10LagnaLord}, and the D10 10th lord is ${f.d10TenthLord}. `,
    'Growth Timing & Dashas': `The running ${f.mahadasha} Mahadasha with its ${f.antardasha} Antardasha frames the present career phase. `,
  };
  return (bodies[h] ?? '') + FILL.repeat(2);
}

let k: any; let facts: CareerFacts;
beforeEach(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  ai.respond.mockReset();
  k = await sanket();
  facts = careerBrief(k, new Date())!.facts;
});
afterEach(() => vi.unstubAllEnvs());

describe('career evidence (deterministic)', () => {
  it('reads the 10th house, D10, periods and yogas from the engine for the production chart', async () => {
    const b = careerBrief(k, ASOF)!;
    expect(b.facts).toMatchObject({ tenthSign: 'Libra', tenthLord: 'Venus', d10LagnaSign: 'Pisces', d10LagnaLord: 'Jupiter', d10TenthSign: 'Sagittarius', d10TenthLord: 'Jupiter', mahadasha: 'Jupiter', antardasha: 'Jupiter' });
    expect(b.text).toMatch(/10th house: Libra; its lord Venus: Virgo, 9th house \(Debilitated, no cancellation of the debilitation\)/);
    expect(b.text).toMatch(/Planets in the 10th: Sun: Libra, 10th house \(Debilitated, debilitation cancelled \(Neecha Bhanga\)\).*\| Mars: Libra, 10th house/);
    expect(b.text).toMatch(/D10 Lagna: Pisces; its lord Jupiter is in D10 Capricorn, the D10 11th house/);
    // Every period date is the engine's own.
    const md = k.dashas.find((d: any) => d.planet === 'Jupiter');
    expect(b.text).toContain(`runs ${md.startDate} to ${md.endDate}`);
    const [ad, next] = md.antardashas;
    expect(b.text).toContain(`Current Antardasha: ${ad.planet} (${ad.startDate} to ${ad.endDate})`);
    expect(b.text).toContain(`Next Antardasha: ${next.planet} (${next.startDate} to ${next.endDate})`);
    expect([md.startDate, md.endDate, ad.endDate, next.endDate]).toEqual(['2024-12-03', '2040-12-03', '2027-01-21', '2029-08-03']);
    const dates = b.text.match(/\d{4}-\d{2}-\d{2}/g)!;
    const engineDates = new Set(k.dashas.flatMap((d: any) => [d.startDate, d.endDate, ...(d.antardashas ?? []).flatMap((a: any) => [a.startDate, a.endDate])]));
    for (const d of dates) expect(engineDates.has(d), d).toBe(true);
    // No D10 degree anywhere.
    expect(b.text.split('\n').filter((l) => /D10/.test(l)).join('\n')).not.toMatch(/\d°/);
  });

  it('states each engine yoga with its rule and limits, and no other; Neecha Bhanga is a cancelled debilitation', () => {
    const b = careerBrief(k, ASOF)!;
    expect(b.facts.yogaNames).toEqual(k.chartData.canonical.yogas.map((y: any) => y.name));
    const yogaLines = b.text.split('\n').filter((l) => /^- .*Yoga.*: rule — /.test(l));
    expect(yogaLines).toHaveLength(k.chartData.canonical.yogas.length);
    expect(b.text).toMatch(/Sasa Yoga: rule — Pancha Mahapurusha.*Saturn is in its own sign in Capricorn, the 1st house/);
    expect(b.text).toMatch(/Neecha Bhanga Raja Yoga: rule — Neecha Bhanga \(cancellation of debilitation\).*Saturn \(exalted in Libra\) is in the 1st house, a kendra.*describe it as a cancelled debilitation \(Neecha Bhanga\), not as a separate Raja Yoga/);
    expect(b.text).toMatch(/Vimala Vipreeta Raja Yoga: rule — Vipreeta Raja Yoga.*Jupiter, lord of the 3rd and 12th, is in the 8th house/);
  });

  it('measures how much the birth time can move before the D10 Lagna changes, with the engine itself', () => {
    const b = careerBrief(k, ASOF)!;
    const m = b.text.match(/stays Pisces for a birth up to (\d+) minute\(s\) earlier and (\d+) minute\(s\) later/)!;
    const d10Lagna = (time: string) => computeCanonicalChart(resolveBirthWithCoordinates({ date: '1991-11-13', time, latitude: 15.8497, longitude: 74.4977, timeAccuracy: 'exact' })).vargas.D10.ascendantSignIndex;
    const at = (min: number) => { const t = 12 * 60 + 30 + min; return d10Lagna(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`); };
    const [earlier, later] = [Number(m[1]), Number(m[2])];
    expect(at(-earlier)).toBe(11); expect(at(-(earlier + 1))).not.toBe(11);
    expect(at(later)).toBe(11); expect(at(later + 1)).not.toBe(11);
    expect(b.text).toMatch(/depends on an accurate birth time/);
  });

  it('is not built for an approximate birth time', async () => {
    const a = await getKundli('1991-11-13', '12:30', 15.8497, 74.4977, { timeAccuracy: 'approximate' });
    expect(careerBrief(a)).toBeNull();
  });
});

describe('career section checks', () => {
  it('require each core section to use its own evidence', () => {
    expect(careerSectionProblems('Tenth House & Its Lord (D1)', 'Your career looks fine.', facts)).toEqual(expect.arrayContaining([expect.stringMatching(/10th house/), expect.stringMatching(/10th lord, Venus/)]));
    expect(careerSectionProblems('Dasamsa (D10) Analysis', 'Your career looks fine.', facts)).toEqual(expect.arrayContaining([expect.stringMatching(/D10/), expect.stringMatching(/Pisces/), expect.stringMatching(/Jupiter/)]));
    expect(careerSectionProblems('Growth Timing & Dashas', 'Good times ahead.', facts)).toEqual(expect.arrayContaining([expect.stringMatching(/Mahadasha lord, Jupiter/), expect.stringMatching(/Antardasha/)]));
    for (const h of ['Tenth House & Its Lord (D1)', 'Dasamsa (D10) Analysis', 'Growth Timing & Dashas']) expect(careerSectionProblems(h, careerBody(h, facts), facts)).toEqual([]);
  });
  it('reject generic claims with no chart fact, D10 degrees and yogas the engine did not detect', () => {
    expect(careerSectionProblems('Strengths & Ideal Fields', 'You have leadership potential.', facts)).toEqual([expect.stringMatching(/generic statement/)]);
    expect(careerSectionProblems('Strengths & Ideal Fields', 'Saturn in its own sign in the 1st house gives leadership potential in structured work.', facts)).toEqual([]);
    expect(careerSectionProblems('Strengths & Ideal Fields', 'Networking will bring opportunities.', facts)).toEqual([expect.stringMatching(/generic statement/)]);
    expect(careerSectionProblems('Challenges to Watch', 'Venus sits at 14° in the D10 chart.', facts)).toEqual([expect.stringMatching(/D10 degree/)]);
    expect(careerSectionProblems('Challenges to Watch', 'A Gajakesari Yoga lifts the career.', facts)).toEqual([expect.stringMatching(/Gajakesari Yoga, which the engine did not detect/)]);
    expect(careerSectionProblems('Challenges to Watch', 'This Yoga needs care; the Sasa Yoga is formed by Saturn.', facts)).toEqual([]);
    expect(careerSectionProblems('Challenges to Watch', 'The Gajakesari Yoga lifts the career.', facts)).toEqual([expect.stringMatching(/Gajakesari Yoga, which the engine did not detect/)]);
    expect(careerSectionProblems('Challenges to Watch', 'Saturn forms Sasa Yoga, a Pancha Mahapurusha Yoga, and the Vipreeta Raja Yoga of Jupiter sits apart.', facts)).toEqual([]);
    // "Raja Yoga" alone matches only a detected yoga of that name (this chart has one: Moon and Saturn).
    expect(careerSectionProblems('Challenges to Watch', 'The Neecha Bhanga Raja Yoga of the Sun and the Raja Yoga of the Moon and Saturn.', facts)).toEqual([]);
    expect(careerSectionProblems('Challenges to Watch', 'A Dhana Yoga is present.', facts)).toEqual([expect.stringMatching(/Dhana Yoga/)]);
  });
});

describe('career remedies', () => {
  it('drop gemstones, planets outside the career set, unexplained practices and opposite instructions for one planet', () => {
    const out = careerRemedies([
      'Strengthen Saturn: wear a Blue Sapphire on the middle finger',
      'Wear a Diamond for Venus after consulting an astrologer',
      'Gemstone: Pearl — birth-star gemstone for Moon',
      'Chant Om Chandraya Namah 108 times on Mondays for the Moon',
      'Regular visits to sacred places',
      'Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the Lagna and aspects the 10th house',
      'Strengthen the Sun with Surya namaskar on Sundays',
      'Pacify the Sun by donating wheat on Sundays',
      'Offer yellow flowers to Jupiter on Thursdays, as Jupiter rules the D10 Lagna and runs the current Mahadasha',
    ], facts);
    expect(out).toEqual([
      'Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the Lagna and aspects the 10th house',
      'Offer yellow flowers to Jupiter on Thursdays, as Jupiter rules the D10 Lagna and runs the current Mahadasha',
    ]);
  });
});

describe('Career report generation (AI mocked)', () => {
  it('the prompt carries the career evidence and rules, with the D10 and 10th-house sections', async () => {
    let prompt = '';
    ai.respond.mockImplementation((p) => { prompt ||= p; return JSON.stringify({ title: 't', summary: FILL, sections: headingsIn(p).map((h) => ({ heading: h, body: careerBody(h, facts) })), remedies: [] }); });
    await generateReport('career', k);
    expect(prompt).toMatch(/CAREER REPORT RULES/);
    expect(prompt).toMatch(/CAREER EVIDENCE \(deterministic/);
    expect(headingsIn(prompt)).toEqual(['Birth Chart Overview', 'Key Planetary Influences', 'Tenth House & Its Lord (D1)', 'Dasamsa (D10) Analysis', 'Strengths & Ideal Fields', 'Job vs Business', 'Growth Timing & Dashas', 'Challenges to Watch', 'Dasha Periods & Timing']);
    expect(prompt).not.toMatch(/include a gemstone/);
  });

  it('delivers only career-justified remedies: no gemstone and no birth-star remedy', async () => {
    ai.respond.mockImplementation((p) => JSON.stringify({ title: 't', summary: FILL, sections: headingsIn(p).map((h) => ({ heading: h, body: careerBody(h, facts) })), remedies: [
      'Strengthen Saturn: wear a Blue Sapphire', 'Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the Lagna and aspects the 10th house',
    ] }));
    const content: any = await generateReport('career', k);
    expect(content.remedies).toEqual(['Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the Lagna and aspects the 10th house']);
    expect(JSON.stringify(content.remedies)).not.toMatch(/Pearl|Sapphire|Diamond|gemstone/i);
  });

  it('regenerates once when a section ignores the D10 or speaks generically, then fails rather than deliver it', async () => {
    const weak = (p: string) => JSON.stringify({ title: 't', summary: FILL, sections: headingsIn(p).map((h) => ({ heading: h, body: h === 'Dasamsa (D10) Analysis' ? `You have leadership potential. ${FILL.repeat(2)}` : careerBody(h, facts) })), remedies: [] });
    ai.respond.mockImplementationOnce(weak).mockImplementationOnce((p) => { expect(p).toMatch(/"Dasamsa \(D10\) Analysis": .*must discuss the D10/); return weak(p); });
    await expect(generateReport('career', k)).rejects.toThrow(/Dasamsa \(D10\) Analysis.*generic statement/);
    expect(ai.respond).toHaveBeenCalledTimes(2);
    ai.respond.mockReset();
    ai.respond.mockImplementationOnce(weak).mockImplementationOnce((p) => JSON.stringify({ title: 't', summary: FILL, sections: headingsIn(p).map((h) => ({ heading: h, body: careerBody(h, facts) })), remedies: [] }));
    const content: any = await generateReport('career', k);
    expect(content.sections.find((s: any) => s.heading === 'Dasamsa (D10) Analysis').body).toMatch(/Lagna is Pisces/);
  });

  it('other reports are unchanged: no career evidence, gemstone guidance and chart remedies as before', async () => {
    let prompt = '';
    ai.respond.mockImplementation((p) => { prompt ||= p; return JSON.stringify({ title: 't', summary: FILL, sections: headingsIn(p).map((h) => ({ heading: h, body: FILL.repeat(2) })), remedies: ['Keep a steady daily routine'] }); });
    const content: any = await generateReport('marriage', k);
    expect(prompt).not.toMatch(/CAREER EVIDENCE|CAREER REPORT RULES/);
    expect(prompt).toMatch(/include a gemstone/);
    expect(content.remedies.some((r: string) => /Pearl/.test(r))).toBe(true);
  });
});

