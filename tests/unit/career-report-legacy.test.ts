/**
 * The three-part Career & Profession Report that customers receive (the facts-first pipeline is for test accounts:
 * server/careerPipeline.ts). The deterministic career evidence, the career-only section checks and the remedy
 * safeguards, built for the defects found in the first production report (D10 barely used, generic claims,
 * Neecha Bhanga presented as a separate Raja Yoga, unjustified gemstones).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ respond: vi.fn<(prompt: string) => string>(), maxTokens: [] as number[] }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: async ({ messages, max_tokens }: any) => { ai.maxTokens.push(max_tokens); return { choices: [{ message: { content: ai.respond(messages[0].content) } }] }; } } };
  },
}));
import { getKundli } from '../../server/astroEngine';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { careerCorrectionNote, generateReport, MAX_CAREER_REGENERATIONS } from '../../server/aiAstrologerService';
import * as ref from '../../scripts/golden/reference';
import { CAREER_BATCHES, CAREER_SECTIONS, FIELDS, STRUCTURE_LABELS, careerBrief, careerDiagnostics, careerRuleCode, careerRemedies, careerReportProblems, careerSectionProblems, type CareerFacts } from '../../server/careerReport';

const ASOF = new Date('2026-10-14T06:00:00Z');
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const LORD = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
// An invented chart (19 Apr 1985, 11:20 IST, Pune city centre), chosen for the structure these tests need: three
// planets in the 10th (one a cancelled debilitation), a debilitated 10th lord without cancellation, a Pancha
// Mahapurusha yoga, Vipreeta Raja Yogas, weakly supported fields and a D10 Lagna within minutes of changing.
// The first test checks that structure against the independent reference pipeline (scripts/golden/reference.ts).
const BIRTH = { date: '1985-04-19', time: '11:20', lat: 18.5204, lng: 73.8567, utc: new Date('1985-04-19T05:50:00Z') };
const invented = async () => ({ ...(await getKundli(BIRTH.date, BIRTH.time, BIRTH.lat, BIRTH.lng)) as any, name: 'P', dateOfBirth: new Date(BIRTH.date), timeOfBirth: BIRTH.time, placeOfBirth: 'Pune' });
const refSign = (g: typeof ref.REF_BODIES[number]) => ref.signOf(ref.referenceSidereal(g, BIRTH.utc));
const refAsc = () => ref.referenceAngles(BIRTH.utc, BIRTH.lat, BIRTH.lng).ascendant;
const house = (sign: number, lagna: number) => ((sign - lagna + 12) % 12) + 1;
const headingsIn = (prompt: string): string[] => Array.from(prompt.matchAll(/^- "([^"]+)" \(about/gm)).map((m) => m[1]);
const FILL = 'The reading weighs these placements together with the other factors of the chart and describes tendencies rather than certainties, so the native can use the periods the chart marks as supportive and plan steadily for the ones it marks as demanding. ';

// Every sentence carries unique tokens, so no two paragraphs share a run of five words (the repetition check).
let uid = 0;
const u = () => `q${(uid++).toString(36)}z`;
const filler = (n: number) => {
  const out: string[] = [];
  for (let i = 0; i * 10 < n; i++) out.push(`Saturn ${u()} house ${u()} however ${u()} overall ${u()} chart ${u()}.${i % 5 === 4 ? '\n\n' : ''}`);
  return out.join(' ');
};

/** A section that meets its career requirements, built from the chart's own career facts. */
function careerBody(h: string, f: CareerFacts): string {
  const fields = (f.fields ?? []).map((x) => x.rating === 'weakly supported' ? `${x.label} is less indicated in this chart.` : `${x.label} draws on ${FIELDS[x.id].planets[0]} here.`).join(' ');
  const lead: Record<string, string> = {
    'Birth Chart Overview': 'The Lagna (the sign rising at birth) frames this chart.',
    'Tenth House & Its Lord (D1)': `The 10th house (the house of profession) is ${f.tenthSign}, and its lord ${f.tenthLord} shapes the working life.`,
    'Career Significators & Planetary Aspects': 'The career significators (karakas) are read here.',
    'Dasamsa (D10) Analysis': `The D10 (Dasamsa, the divisional chart of career) has its Lagna in ${f.d10LagnaSign}, ruled by ${f.d10LagnaLord}, and the D10 10th lord is ${f.d10TenthLord}. The D10 Lagna depends on an accurate birth time.`,
    'Comparing the D1 and D10': `The birth chart (D1) and the D10 differ for the 10th lord ${f.tenthLord}.`,
    'Career Yogas': (f.careerYogas ?? []).length ? `${(f.careerYogas ?? []).join(', ')} are the career yogas here.` : 'No detected yoga is linked to career.',
    'Suitable Professional Fields': fields,
    'Job vs Business': 'The 6th house and the 7th house and the 10th house are compared here.',
    'Career Timeline (Dasha Periods)': `The ${f.mahadasha} Mahadasha (the major period) runs with its ${f.antardasha} Antardasha (the sub-period), then ${f.nextAntardasha ?? 'the next period'}.`,
  };
  const def = CAREER_SECTIONS.find((x) => x.heading === h)!;
  return `${lead[h] ?? ''}\n\n${filler(def.words[0] + 40)}`;
}
const goodReply = (p: string, f: CareerFacts, override: (h: string) => string | undefined = () => undefined) => JSON.stringify({
  ...(p.includes('"summary":') ? { summary: `This career reading rests on the 10th lord ${f.tenthLord} and the D10 Lagna ${f.d10LagnaSign}. ${filler(20)}` } : {}),
  sections: headingsIn(p).map((h) => ({ heading: h, body: override(h) ?? careerBody(h, f) })),
  ...(p.includes('"remedies":') ? { remedies: ['Strengthen Saturn: wear a Blue Sapphire', 'Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the D10 Lagna'] } : {}),
});

let k: any; let facts: CareerFacts;
beforeEach(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  ai.respond.mockReset();
  ai.maxTokens.length = 0;
  k = await invented();
  facts = careerBrief(k, new Date())!.facts;
});
afterEach(() => vi.unstubAllEnvs());

describe('career evidence (deterministic)', () => {
  it('the invented chart has the structure these tests rely on, by the independent reference pipeline', () => {
    const asc = ref.signOf(refAsc()), d10Asc = ref.d10(refAsc());
    expect([SIGNS[asc], SIGNS[(asc + 9) % 12], SIGNS[d10Asc], SIGNS[(d10Asc + 9) % 12]]).toEqual(['Gemini', 'Pisces', 'Capricorn', 'Libra']);
    // Moon, Mercury and Venus in the 10th; the 10th lord Jupiter in Capricorn (its debilitation sign), the 8th;
    // Venus exalted in Pisces; Saturn (lord of the 8th and 9th) in the 6th; Mars (lord of the 6th) in the 12th.
    expect((['Moon', 'Mercury', 'Venus', 'Jupiter', 'Saturn', 'Mars', 'Sun'] as const).map((g) => [g, SIGNS[refSign(g)], house(refSign(g), asc)])).toEqual([
      ['Moon', 'Pisces', 10], ['Mercury', 'Pisces', 10], ['Venus', 'Pisces', 10], ['Jupiter', 'Capricorn', 8], ['Saturn', 'Scorpio', 6], ['Mars', 'Taurus', 12], ['Sun', 'Aries', 11],
    ]);
    // D10: the Lagna lord Saturn in Leo (the D10 8th), the 10th lord Jupiter in Pisces (the D10 3rd).
    // The Moon in Revati (index 26), Mercury's nakshatra: the birth-star remedies are Mercury's.
    expect(ref.nakshatraOf(ref.referenceSidereal('Moon', BIRTH.utc))).toBe(26);
    expect([SIGNS[ref.d10(ref.referenceSidereal('Saturn', BIRTH.utc))], SIGNS[ref.d10(ref.referenceSidereal('Jupiter', BIRTH.utc))]]).toEqual(['Leo', 'Pisces']);
  });

  it('reads the 10th house, D10, periods and yogas from the engine, in agreement with the independent reference', async () => {
    const b = careerBrief(k, ASOF)!;
    const asc = ref.signOf(refAsc()), d10Asc = ref.d10(refAsc());
    expect(b.facts).toMatchObject({ tenthSign: SIGNS[(asc + 9) % 12], tenthLord: LORD[(asc + 9) % 12], d10LagnaSign: SIGNS[d10Asc], d10LagnaLord: LORD[d10Asc], d10TenthSign: SIGNS[(d10Asc + 9) % 12], d10TenthLord: LORD[(d10Asc + 9) % 12] });
    expect(b.facts).toMatchObject({ tenthSign: 'Pisces', tenthLord: 'Jupiter', d10LagnaSign: 'Capricorn', d10LagnaLord: 'Saturn', d10TenthSign: 'Libra', d10TenthLord: 'Venus', mahadasha: 'Moon', antardasha: 'Rahu' });
    expect(b.text).toMatch(/10th house: Pisces; its lord Jupiter: Capricorn, 8th house \(Debilitated, no cancellation of the debilitation\)/);
    expect(b.text).toMatch(/Planets in the 10th: Moon: Pisces, 10th house.*\| Mercury: Pisces, 10th house \(Debilitated, debilitation cancelled \(Neecha Bhanga\)\).*\| Venus: Pisces, 10th house \(Exalted/);
    const d10Saturn = ref.d10(ref.referenceSidereal('Saturn', BIRTH.utc));
    expect(b.text).toContain(`D10 Lagna: Capricorn; its lord Saturn is in D10 ${SIGNS[d10Saturn]}, the D10 ${house(d10Saturn, d10Asc)}th house`);
    // Every period date is the engine's own.
    const md = k.dashas.find((d: any) => d.planet === 'Moon');
    expect(b.text).toContain(`runs ${md.startDate} to ${md.endDate}`);
    const i = md.antardashas.findIndex((a: any) => a.startDate <= '2026-10-14' && '2026-10-14' < a.endDate);
    const [ad, next] = md.antardashas.slice(i);
    expect(b.text).toContain(`Current Antardasha: ${ad.planet} (${ad.startDate} to ${ad.endDate})`);
    expect(b.text).toContain(`Next Antardasha: ${next.planet} (${next.startDate} to ${next.endDate})`);
    expect([md.startDate, md.endDate, ad.planet, ad.endDate, next.planet, next.endDate]).toEqual(['2024-11-04', '2034-11-05', 'Rahu', '2027-10-06', 'Jupiter', '2029-02-04']);
    // Independently: the reference Moon gives the same Mahadasha, Antardasha and boundaries (to within a day).
    const day = 86_400_000;
    const refMd = ref.vimshottariBoundaries(ref.referenceSidereal('Moon', BIRTH.utc), BIRTH.utc.getTime()).find((m) => m.startMs <= ASOF.getTime() && ASOF.getTime() < m.endMs)!;
    const order = ref.NAKSHATRA_LORDS.slice(ref.NAKSHATRA_LORDS.indexOf(refMd.lord)).concat(ref.NAKSHATRA_LORDS.slice(0, ref.NAKSHATRA_LORDS.indexOf(refMd.lord)));
    let at = refMd.startMs;
    const refAds = order.map((lord) => { const s0 = at; at += (refMd.endMs - refMd.startMs) * ref.VIMSHOTTARI_YEARS[lord] / 120; return { lord, startMs: s0, endMs: at }; });
    const ri = refAds.findIndex((a) => a.startMs <= ASOF.getTime() && ASOF.getTime() < a.endMs);
    expect([refMd.lord, refAds[ri].lord, refAds[ri + 1].lord]).toEqual([md.planet, ad.planet, next.planet]);
    for (const [ms, d] of [[refMd.startMs, md.startDate], [refMd.endMs, md.endDate], [refAds[ri].endMs, ad.endDate], [refAds[ri + 1].endMs, next.endDate]] as const) expect(Math.abs(ms - Date.parse(d)), d).toBeLessThan(2 * day);
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
    expect(b.text).toMatch(/Malavya Yoga: rule — Pancha Mahapurusha.*Venus is exalted in Pisces, the 10th house/);
    expect(b.text).toMatch(/Neecha Bhanga Raja Yoga: rule — Neecha Bhanga \(cancellation of debilitation\).*Venus \(exalted in Pisces\) is in the 10th house, a kendra.*describe it as a cancelled debilitation \(Neecha Bhanga\), not as a separate Raja Yoga/);
    expect(b.text).toMatch(/Sarala Vipreeta Raja Yoga: rule — Vipreeta Raja Yoga.*Saturn, lord of the 8th and 9th, is in the 6th house/);
    expect(b.text).toMatch(/Harsha Vipreeta Raja Yoga: rule — Vipreeta Raja Yoga.*Mars, lord of the 6th and 11th, is in the 12th house.*do not present it as a career yoga/);
  });

  it('measures how much the birth time can move before the D10 Lagna changes, with the engine itself', () => {
    const b = careerBrief(k, ASOF)!;
    const m = b.text.match(/stays Capricorn for a birth up to (\d+) minute\(s\) earlier and (\d+) minute\(s\) later/)!;
    const d10Lagna = (time: string) => computeCanonicalChart(resolveBirthWithCoordinates({ date: BIRTH.date, time, latitude: BIRTH.lat, longitude: BIRTH.lng, timeAccuracy: 'exact' })).vargas.D10.ascendantSignIndex;
    const at = (min: number) => { const t = 11 * 60 + 20 + min; return d10Lagna(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`); };
    const [earlier, later] = [Number(m[1]), Number(m[2])];
    expect(at(-earlier)).toBe(9); expect(at(-(earlier + 1))).not.toBe(9);
    expect(at(later)).toBe(9); expect(at(later + 1)).not.toBe(9);
    expect(b.text).toMatch(/depends on an accurate birth time/);
  });

  it('is not built for an approximate birth time', async () => {
    const a = await getKundli(BIRTH.date, BIRTH.time, BIRTH.lat, BIRTH.lng, { timeAccuracy: 'approximate' });
    expect(careerBrief(a)).toBeNull();
  });

  it('uses canonical D10 placements and dashas when legacy projections conflict', () => {
    const stale = structuredClone(k);
    const d10 = stale.chartData.canonical.vargas.D10.placements;
    Object.assign(d10.find((p: any) => p.planet === 'Jupiter'), { sign: 'Leo', signIndex: 4 });
    Object.assign(d10.find((p: any) => p.planet === 'Venus'), { sign: 'Virgo', signIndex: 5 });
    stale.chartData.dasamsa = { planetaryPositions: [{ planet: 'Jupiter', sign: 'Capricorn', house: 1 }, { planet: 'Venus', sign: 'Leo', house: 2 }] };
    stale.dashas = structuredClone(k.dashas);
    // The legacy projection disagrees about when the next Antardasha (Jupiter) begins.
    stale.dashas.find((m: any) => m.planet === 'Moon').antardashas.find((a: any) => a.planet === 'Jupiter').startDate = '2029-01-01';
    const b = careerBrief(stale, ASOF)!;
    expect(b.text).toMatch(/Jupiter:.*in D10 Leo/);
    expect(b.text).toMatch(/Venus:.*in D10 Virgo/);
    expect(b.text).not.toContain('Jupiter: Capricorn, D10 1st house');
    expect(b.text).toContain('Next Antardasha: Jupiter (2027-10-06');
    expect(b.text).not.toContain('Jupiter (2029-01-01');
  });
});

describe('career section checks', () => {
  it('accept a section that meets its requirements, and reject a short one', () => {
    for (const x of CAREER_SECTIONS) expect(careerSectionProblems(x.heading, careerBody(x.heading, facts), facts), x.heading).toEqual([]);
    expect(careerSectionProblems('Tenth House & Its Lord (D1)', `The 10th house is ${facts.tenthSign} and its lord ${facts.tenthLord}. ${filler(80)}`, facts)).toEqual([expect.stringMatching(/too short: \d+ words/)]);
  });
  it('require each section to use its own evidence, including the D1–D10 comparison', () => {
    const long = filler(400);
    expect(careerSectionProblems('Tenth House & Its Lord (D1)', long, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/10th house/), expect.stringMatching(/10th lord, Jupiter/)]));
    expect(careerSectionProblems('Dasamsa (D10) Analysis', long, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/D10/), expect.stringMatching(/Capricorn/), expect.stringMatching(/birth time/)]));
    expect(careerSectionProblems('Comparing the D1 and D10', `The D10 matters. ${long}`, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/compare the D1 \(birth chart\) with the D10/), expect.stringMatching(/10th lord, Jupiter/), expect.stringMatching(/agree or differ/)]));
    expect(careerSectionProblems('Career Timeline (Dasha Periods)', long, { ...facts, nextAntardasha: 'Mercury' })).toEqual(expect.arrayContaining([expect.stringMatching(/Mahadasha lord, Moon/), expect.stringMatching(/Antardasha/), expect.stringMatching(/next Antardasha, Mercury/)]));
    expect(careerSectionProblems('Career Yogas', long, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/must explain Malavya Yoga/)]));
    // No career-linked yoga: a few sentences are enough, and nothing invites padding.
    expect(careerSectionProblems('Career Yogas', 'None of the yogas the engine detected is linked to the 10th house, its lord, the D10 or the career significators, so none is read as a career yoga here. The Dhana Yoga in this chart concerns wealth rather than work.', { ...facts, careerYogas: [], yogaNames: ['Dhana Yoga'] })).toEqual([]);
    // Hyphenated engine names are matched as written or with spaces.
    expect(careerSectionProblems('Career Yogas', `Chandra Mangala Yoga and Chandra-Mangala Yoga. ${long}`, { ...facts, yogaNames: [...facts.yogaNames, 'Chandra-Mangala Yoga'] }).join(' ')).not.toMatch(/Chandra.Mangala Yoga, which the engine did not detect/);
    expect(careerSectionProblems('Job vs Business', long, facts)).toEqual([expect.stringMatching(/6th, 7th and 10th/)]);
  });
  it('reject a recommendation the chart supports only weakly, and a field named without its facts', () => {
    expect(facts.fields!.find((x) => x.id === 'advisory')!.rating).toBe('weakly supported');
    const body = careerBody('Suitable Professional Fields', facts);
    expect(careerSectionProblems('Suitable Professional Fields', `${body}\n\nConsulting is an excellent path for you.`, facts)).toEqual([expect.stringMatching(/recommends advisory and consulting roles, which the chart supports only weakly/)]);
    expect(careerSectionProblems('Suitable Professional Fields', `${body}\n\nBanking suits you.`, facts)).toEqual([expect.stringMatching(/names finance and management without the chart facts/)]);
  });
  it('reject certainty, invented month dates, D10 degrees, undetected yogas, generic claims and mostly generic text', () => {
    const base = careerBody('Strengths, Challenges & Practical Guidance', facts);
    const one = (x: string) => careerSectionProblems('Strengths, Challenges & Practical Guidance', `${base} ${x}`, facts);
    expect(one('Saturn shows you will definitely be promoted.')).toEqual([expect.stringMatching(/outcome as certain/)]);
    expect(one('Saturn may help you gain recognition.')).toEqual([]);
    expect(one('A new role arrives in March 2028 for Saturn.')).toEqual([expect.stringMatching(/March 2028, which is not a period date/)]);
    expect(one('The Jupiter Antardasha begins in October 2027 with Saturn.')).toEqual([]);
    expect(one('Venus sits at 14° in the D10 chart.')).toEqual([expect.stringMatching(/D10 degree/)]);
    expect(one('The Gajakesari Yoga lifts the career.')).toEqual([expect.stringMatching(/Gajakesari Yoga, which the engine did not detect/)]);
    expect(one('You have leadership potential.')).toEqual([expect.stringMatching(/generic statement/)]);
    const generic = Array.from({ length: 40 }, (_, i) => `Good things come to those who wait ${u()} and stay ${u()} positive ${i}.`).join(' ');
    expect(careerSectionProblems('Strengths, Challenges & Practical Guidance', generic, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/mostly generic text/)]));
  });
});

describe('word-count tolerance (production failure: 287, 292 and 234 words against minimums of 300, 300 and 250)', () => {
  const count = (t: string) => (t.match(/[A-Za-z0-9'’-]+/g) ?? []).length;
  // The section's own required evidence, padded with unique filler to exactly n words.
  const sized = (h: string, n: number) => {
    const body = careerBody(h, facts).split(/(?<=\.)\s+/);
    while (count(body.join(' ')) > n) body.pop();
    let out = body.join(' ');
    while (count(out) < n) out += ` w${u()}`;
    return out.trim();
  };
  it('accepts a section up to 10% under its lower target, and rejects one further under', () => {
    for (const [h, n] of [['Dasamsa (D10) Analysis', 287], ['Career Timeline (Dasha Periods)', 292], ['Strengths, Challenges & Practical Guidance', 234], ['Dasamsa (D10) Analysis', 270]] as const) {
      const body = sized(h, n);
      expect(count(body)).toBe(n);
      expect(careerSectionProblems(h, body, facts).filter((p) => /too short/.test(p)), `${h} ${n}`).toEqual([]);
    }
    for (const [h, n] of [['Dasamsa (D10) Analysis', 269], ['Strengths, Challenges & Practical Guidance', 224]] as const) {
      expect(careerSectionProblems(h, sized(h, n), facts)).toContainEqual(expect.stringMatching(new RegExp(`too short: ${n} words.*about ${CAREER_SECTIONS.find((x) => x.heading === h)!.words[0]}–`)));
    }
  });
  it('generic statements are still rejected within the tolerance', () => {
    const body = `${sized('Career Timeline (Dasha Periods)', 292)}\n\nThis period brings great potential for growth.`;
    expect(careerSectionProblems('Career Timeline (Dasha Periods)', body, facts)).toContainEqual(expect.stringMatching(/generic statement with no chart evidence/));
  });
  it('the regeneration note lists the problems and asks for chart evidence in place of generic or thin text', () => {
    const note = careerCorrectionNote([{ heading: 'Career Timeline (Dasha Periods)', problems: ['too short: 250 words', 'generic statement with no chart evidence: "x"'] }]);
    expect(note).toContain('"Career Timeline (Dasha Periods)": too short: 250 words; generic statement with no chart evidence');
    expect(note).toMatch(/Remove every generic statement, or rewrite it so the same sentence names the chart fact/);
    expect(note).toMatch(/supporting indicators and the opposing or limiting indicators/);
    expect(note).toMatch(/End with a practical conclusion/);
    expect(note).toMatch(/add evidence the section has not used yet — never filler/);
  });
});

describe('PR #113 production failure: the prompt\'s structure labels and the validator agree', () => {
  const lines = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `The 10th lord ${facts.tenthLord} sits with the D10 Lagna ${facts.d10LagnaSign} ruled by ${facts.d10LagnaLord} and the D10 10th lord ${facts.d10TenthLord} ${tag}${i}${u()}.`).join(' ');
  // Only the labels carry the weighing and the conclusion: no "however", "but", "overall", "so" elsewhere.
  const labelled = (h: string) => `${STRUCTURE_LABELS[0]}: ${lines(12, 'a')} Mahadasha ${facts.mahadasha} Antardasha ${facts.antardasha} next ${facts.nextAntardasha} birth time 6th house 7th house 10th house.\n\n${STRUCTURE_LABELS[1]}: ${lines(10, 'b')}\n\n${STRUCTURE_LABELS[2]}: ${lines(6, 'c')}`;
  const WEIGH = /must weigh the indicators/;

  it('the prompt asks for exactly these labels', async () => {
    const prompts: string[] = [];
    ai.respond.mockImplementation((p) => { prompts.push(p); return goodReply(p, facts); });
    await generateReport('career', k);
    expect(prompts[0]).toContain(`"${STRUCTURE_LABELS[0]}", "${STRUCTURE_LABELS[1]}", then "${STRUCTURE_LABELS[2]}"`);
  });

  it('a core section written with the exact labels passes the for/against/conclusion rule, in all nine core sections', () => {
    const core = CAREER_SECTIONS.filter((x) => x.core);
    expect(core).toHaveLength(9);
    for (const s of core) expect(careerSectionProblems(s.heading, labelled(s.heading), facts).filter((p) => WEIGH.test(p)), s.heading).toEqual([]);
  });

  it('the rule still rejects a section with no opposing side or no conclusion', () => {
    const noOpposing = labelled('x').replace(`${STRUCTURE_LABELS[1]}:`, 'Further:');
    const noConclusion = labelled('x').replace(`${STRUCTURE_LABELS[2]}:`, 'Further:');
    for (const body of [noOpposing, noConclusion]) expect(careerSectionProblems('Job vs Business', body, facts)).toContainEqual(expect.stringMatching(WEIGH));
  });
});

describe('career evidence states the D1 foundations from the canonical chart', () => {
  it('D1 Lagna and its lord, Moon, Rahu and Ketu — matching the canonical placements, for several charts', async () => {
    for (const [d, t, lat, lng] of [[BIRTH.date, BIRTH.time, BIRTH.lat, BIRTH.lng], ['1968-03-02', '04:15', 40.7128, -74.006], ['2001-07-21', '19:40', -33.8688, 151.2093]] as const) {
      const kk: any = await getKundli(d, t, lat, lng);
      const c = kk.chartData.canonical;
      const text = careerBrief(kk, ASOF)!.text;
      const lord = LORD[c.ascendant.signIndex];
      const lp = c.planets.find((p: any) => p.name === lord);
      expect(text).toContain(`- D1 Lagna (the rising sign): ${c.ascendant.sign}; its lord ${lord}: ${lp.sign}, `);
      for (const g of ['Moon', 'Rahu', 'Ketu']) {
        const p = c.planets.find((x: any) => x.name === g);
        const d10 = c.vargas.D10.placements.find((x: any) => x.planet === g);
        expect(text).toMatch(new RegExp(`^- ${g}: ${p.sign}, ${p.house}(?:st|nd|rd|th) house.*; in D10 ${d10.sign}, D10 ${d10.house}(?:st|nd|rd|th) house`, 'm'));
      }
    }
  });

  it('the invented chart: Gemini Lagna ruled by Mercury, Mercury (cancelled debilitation) and the Moon in Pisces in the 10th', () => {
    const text = careerBrief(k, ASOF)!.text;
    expect(text).toMatch(/D1 Lagna \(the rising sign\): Gemini; its lord Mercury: Pisces, 10th house \(Debilitated, debilitation cancelled \(Neecha Bhanga\)\)/);
    expect(text).toMatch(/^- Moon: Pisces, 10th house/m);
  });
});

describe('diagnostic rule codes', () => {
  it('map each validation problem to its rule and never carry quoted text', () => {
    const cases: Array<[string, string]> = [
      ['too short: 120 words; explain …', 'too-short'], ['too short (40 characters)', 'too-short'], ['missing', 'missing'],
      ['must weigh the indicators for and against and end with a practical conclusion, not only state conclusions', 'for-against-conclusion'],
      ['generic statement with no chart evidence: "The native has great potential"', 'generic-statement'],
      ['mostly generic text: most sentences cite no chart fact', 'mostly-generic'],
      ['repeats a sentence already used in "Career Yogas": "x y z"', 'repeated-sentence'],
      ['a paragraph largely repeats one in "Job vs Business"; each section must add new information', 'repeated-paragraph'],
      ['uses Lagna without explaining it on first use; the reader is not an astrologer', 'unexplained-term'],
      ['names Gaja Kesari Yoga, which the engine did not detect', 'undetected-yoga'],
      ['names March 2031, which is not a period date from the engine', 'non-engine-date'],
      ['must say that the D10 Lagna depends on an accurate birth time (it changes within minutes)', 'd10-birth-time-caveat'],
      ['must name the D10 Lagna, Pisces', 'required-evidence'],
      ['Venus is in Virgo, not Leo', 'chart-accuracy'],
      ['not generated: AI provider error 429', 'not-generated'],
    ];
    for (const [p, code] of cases) expect(careerRuleCode(p), p).toBe(code);
    const d = careerDiagnostics(new Map([['Career Yogas', ['generic statement with no chart evidence: "The native has great potential"', 'too short: 100 words']], ['summary', ['too short (0 characters)']]]));
    expect(d).toBe('Career Yogas: generic-statement, too-short | summary: too-short');
  });
});

describe('whole-report checks', () => {
  const sections = () => CAREER_SECTIONS.map((x) => ({ heading: x.heading, body: careerBody(x.heading, facts) }));
  it('pass a report whose sections each add new information', () => {
    expect(Array.from(careerReportProblems(sections()))).toEqual([]);
  });
  it('flag a repeated sentence and a near-duplicate paragraph in the later section only', () => {
    const s = sections();
    const para = s[1].body.split('\n\n')[1];
    s[9].body += `\n\n${para}`;
    const p = careerReportProblems(s);
    expect(Array.from(p.keys())).toEqual(['Strengths, Challenges & Practical Guidance']);
    expect(p.get('Strengths, Challenges & Practical Guidance')!.join(' ')).toMatch(/repeats a sentence already used in "Tenth House & Its Lord \(D1\)".*largely repeats one in "Tenth House & Its Lord \(D1\)"/);
  });
  it('flag a section that contradicts the Job vs Business conclusion', () => {
    const s = sections();
    s[7].body += ' On balance the 6th house favours salaried employment here.';
    s[9].body += ' Saturn points towards entrepreneurship and self-employment.';
    expect(careerReportProblems(s).get('Strengths, Challenges & Practical Guidance')).toEqual([expect.stringMatching(/contradicts the Job vs Business conclusion \(employment\)/)]);
  });
  it('flag Sanskrit terms left unexplained on first use (three or more)', () => {
    const s = sections().map((x) => ({ ...x, body: x.body.replace(/\([^)]*\)/g, '') }));
    s[0].body += ' The Lagna sets it. The kendra matters. The dusthana weighs.';
    expect(Array.from(careerReportProblems(s).values()).flat().join(' ')).toMatch(/uses Lagna without explaining it/);
  });
});

describe('career remedies', () => {
  it('drop gemstones, planets outside the career set, unexplained practices and opposite instructions for one planet', () => {
    const out = careerRemedies([
      'Strengthen Saturn: wear a Blue Sapphire on the middle finger',
      'Wear a Diamond for Venus after consulting an astrologer',
      'Gemstone: Pearl — birth-star gemstone for Moon',
      'Chant Om Budhaya Namah 108 times on Wednesdays for Mercury',
      'Regular visits to sacred places',
      'Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the D10 Lagna',
      'Strengthen the Sun with Surya namaskar on Sundays',
      'Pacify the Sun by donating wheat on Sundays',
      'Offer yellow flowers to Jupiter on Thursdays, as Jupiter rules the 10th house',
    ], facts);
    expect(out).toEqual([
      'Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the D10 Lagna',
      'Offer yellow flowers to Jupiter on Thursdays, as Jupiter rules the 10th house',
    ]);
  });
});

describe('Career report generation (AI mocked): three parts, partial regeneration, fail closed', () => {
  it('writes three parts in parallel on one evidence block; each part asks only for its own sections', async () => {
    const prompts: string[] = [];
    ai.respond.mockImplementation((p) => { prompts.push(p); return goodReply(p, facts); });
    const content: any = await generateReport('career', k);
    expect(prompts).toHaveLength(3);
    expect(prompts.map(headingsIn)).toEqual(CAREER_BATCHES.map((b) => b.sections.map((x) => x.heading)));
    for (const p of prompts) {
      expect(p).toMatch(/CAREER EVIDENCE \(deterministic/);
      expect(p).toMatch(/what does the chart show, why does it show this .* what does it mean for this person's working life/);
      expect(p).toMatch(/word range is a guide to depth, not a quota/);
      expect(p).toMatch(/Use only the birth details and calculated chart data below/);
      expect(p).toMatch(/CAREER EVIDENCE as a closed fact list/);
      expect(p).toMatch(/never calculate, infer, combine or "correct" a placement/);
      expect(p).toMatch(/supporting indicator and one opposing or limiting indicator/);
      expect(p).toMatch(/Supporting indicators.*Opposing or limiting indicators.*Practical conclusion/);
      expect(p).toMatch(/Other parts, written separately, cover/);
      expect(p).not.toMatch(/include a gemstone/);
    }
    expect(content.sections.map((s: any) => s.heading)).toEqual(CAREER_SECTIONS.map((x) => x.heading));
    expect(content.summary).toContain(`10th lord ${facts.tenthLord}`);
    expect(content.remedies).toEqual(['Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the D10 Lagna']);
    expect(JSON.stringify(content.remedies)).not.toMatch(/Pearl|Sapphire|Diamond|gemstone/i);
  });

  it('regenerates only the failed section of the failed part, once', async () => {
    const prompts: string[] = [];
    let first = true;
    ai.respond.mockImplementation((p) => {
      prompts.push(p);
      if (first && headingsIn(p).includes('Comparing the D1 and D10')) { first = false; return goodReply(p, facts, (h) => (h === 'Comparing the D1 and D10' ? 'The D10 matters.' : undefined)); }
      return goodReply(p, facts);
    });
    const content: any = await generateReport('career', k);
    expect(prompts).toHaveLength(4);
    expect(headingsIn(prompts[3])).toEqual(['Comparing the D1 and D10']);
    expect(prompts[3]).toMatch(/"Comparing the D1 and D10": .*too short/);
    expect(prompts[3]).not.toMatch(/"summary":|"remedies":/);
    expect(content.sections).toHaveLength(CAREER_SECTIONS.length);
  });

  it('regenerates each failed section on its own call with only its own problems; passed sections are kept', async () => {
    const failing: Record<string, string> = {
      'Dasamsa (D10) Analysis': 'The D10 matters.',
      'Career Timeline (Dasha Periods)': `${careerBody('Career Timeline (Dasha Periods)', facts)}\n\nThis period brings great potential for growth.`,
      'Strengths, Challenges & Practical Guidance': 'Short.',
    };
    const prompts: string[] = [];
    ai.respond.mockImplementation((p) => {
      prompts.push(p);
      return goodReply(p, facts, (h) => (prompts.length <= 3 ? failing[h] : undefined));
    });
    const content: any = await generateReport('career', k);
    const retries = prompts.slice(3);
    expect(retries.map(headingsIn).sort()).toEqual(Object.keys(failing).map((h) => [h]).sort());
    for (const p of retries) {
      const [h] = headingsIn(p);
      for (const other of Object.keys(failing).filter((x) => x !== h)) expect(p).not.toContain(`- "${other}":`);
      expect(p).toContain(`- "${h}": `);
      expect(p).toMatch(/opposing or limiting indicators[\s\S]*practical conclusion/);
      expect(p).toMatch(/every listed rejection reason as a mandatory checklist/);
      expect(p).toMatch(/Remove any planet, sign, house, dignity, lordship, D10 placement or date that the evidence does not state/);
    }
    expect(retries.find((p) => headingsIn(p)[0] === 'Career Timeline (Dasha Periods)')).toMatch(/generic statement with no chart evidence/);
    expect(retries.find((p) => headingsIn(p)[0] === 'Dasamsa (D10) Analysis')).toMatch(/too short/);
    expect(retries.find((p) => headingsIn(p)[0] === 'Dasamsa (D10) Analysis')).toMatch(/D10 Lagna depends on an accurate birth time/);
    // Each regeneration has the part's full output allowance.
    expect(ai.maxTokens.slice(3)).toEqual(retries.map(() => 4000));
    expect(content.sections.map((x: any) => x.heading)).toEqual(CAREER_SECTIONS.map((x) => x.heading));
  });

  it('a section still failing after its own regeneration fails the order; others are regenerated once each', async () => {
    ai.respond.mockImplementation((p) => goodReply(p, facts, (h) => (h === 'Career Yogas' || h === 'Job vs Business' ? 'Too short.' : undefined)));
    await expect(generateReport('career', k)).rejects.toThrow(/Career Yogas: too short.*Job vs Business: too short|Job vs Business: too short.*Career Yogas: too short/);
    expect(ai.respond).toHaveBeenCalledTimes(5);
  });

  it('targets the production placement, timing, field and balance failures in seven calls', async () => {
    const prompts: string[] = [];
    ai.respond.mockImplementation((p) => {
      prompts.push(p);
      if (prompts.length > 3) return goodReply(p, facts);
      return goodReply(p, facts, (h) => {
        if (h === 'Dasamsa (D10) Analysis') return `${careerBody(h, facts)} In the D10, Jupiter is in Leo and Venus is in Leo.`;
        if (h === 'Suitable Professional Fields') return `${careerBody(h, facts)} Administration, government and institutional roles, business and entrepreneurship, finance and management, and communication and public-facing professions are recommended.`;
        if (h === 'Career Timeline (Dasha Periods)') return `${careerBody(h, facts)} Jupiter Antardasha begins in 2029.`;
        if (h === 'Strengths, Challenges & Practical Guidance') return `Saturn in the 6th house shapes work. ${Array.from({ length: 45 }, (_, i) => `Jupiter house ${i} shapes a career factor.`).join(' ')}`;
      });
    });
    await generateReport('career', k);
    expect(ai.respond).toHaveBeenCalledTimes(7);
    const retries = prompts.slice(3).join('\n');
    expect(retries).toMatch(/Jupiter is in .*D10, not Leo/);
    expect(retries).toMatch(/Jupiter Antardasha begins in .*not 2029/);
    expect(retries).toMatch(/without the chart facts|supports only weakly/);
    expect(retries).toMatch(/weigh the indicators for and against/);
  });

  it('a cap failure names each rejected section with rule codes only, in the error and one log line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ai.respond.mockImplementation((p) => goodReply(p, facts, (h) => (h === 'Birth Chart Overview' ? undefined : 'Too short.')));
    const err: any = await generateReport('career', k).catch((e) => e);
    expect(ai.respond).toHaveBeenCalledTimes(3);
    for (const h of CAREER_SECTIONS.filter((x) => x.core).map((x) => x.heading)) expect(err.message).toContain(`${h}: too-short`);
    expect(err.message).toMatch(new RegExp(`9 sections need regeneration \\(maximum ${MAX_CAREER_REGENERATIONS}\\): `));
    const logged = warn.mock.calls.map((c) => String(c[0])).filter((x) => x.startsWith('[reports] career quality'));
    expect(logged).toHaveLength(1);
    // No report text, birth details or name: section names and codes only.
    for (const text of [logged[0], err.message]) {
      expect(text).not.toMatch(/"|1985|11:20|Pune|\bP\b/);
    }
    warn.mockRestore();
  });

  it('fails before section retries when a draft exceeds the regeneration cap', async () => {
    ai.respond.mockImplementation((p) => goodReply(p, facts, () => 'Too short.'));
    await expect(generateReport('career', k)).rejects.toThrow(`maximum ${MAX_CAREER_REGENERATIONS}`);
    expect(ai.respond).toHaveBeenCalledTimes(3);
  });

  it('a repeated paragraph across parts regenerates only the later section', async () => {
    const prompts: string[] = [];
    const copied = careerBody('Tenth House & Its Lord (D1)', facts).split('\n\n')[1];
    let first = true;
    ai.respond.mockImplementation((p) => {
      prompts.push(p);
      if (first && headingsIn(p).includes('Strengths, Challenges & Practical Guidance')) { first = false; return goodReply(p, facts, (h) => (h === 'Strengths, Challenges & Practical Guidance' ? `${careerBody(h, facts)}\n\n${copied}` : undefined)); }
      if (headingsIn(p).includes('Tenth House & Its Lord (D1)')) return goodReply(p, facts, (h) => (h === 'Tenth House & Its Lord (D1)' ? `The 10th house (the house of profession) is ${facts.tenthSign}, and its lord ${facts.tenthLord} shapes the working life.\n\n${copied}\n\n${filler(250)}` : undefined));
      return goodReply(p, facts);
    });
    await generateReport('career', k);
    expect(prompts).toHaveLength(4);
    expect(headingsIn(prompts[3])).toEqual(['Strengths, Challenges & Practical Guidance']);
    expect(prompts[3]).toMatch(/largely repeats one in "Tenth House & Its Lord \(D1\)"/);
  });

  it('fails closed when a section still fails after its one regeneration', async () => {
    ai.respond.mockImplementation((p) => goodReply(p, facts, (h) => (h === 'Suitable Professional Fields' ? `${careerBody(h, facts)}\n\nConsulting is an excellent path for you.` : undefined)));
    await expect(generateReport('career', k)).rejects.toThrow(/Suitable Professional Fields: recommends advisory and consulting roles/);
    expect(ai.respond).toHaveBeenCalledTimes(4);
  });

  it('a part that returns invalid JSON is regenerated once, section by section', async () => {
    let bad = true;
    ai.respond.mockImplementation((p) => { if (bad && headingsIn(p).includes('Job vs Business')) { bad = false; return 'not json'; } return goodReply(p, facts); });
    const content: any = await generateReport('career', k);
    // Three first-pass parts, then one call for each of the failed part's three sections.
    expect(ai.respond).toHaveBeenCalledTimes(6);
    expect(ai.respond.mock.calls.slice(3).map(([p]) => headingsIn(p))).toEqual(CAREER_BATCHES.find((b) => b.id === 'decisions')!.sections.map((x) => [x.heading]));
    expect(content.sections.find((s: any) => s.heading === 'Job vs Business')).toBeTruthy();
  });

  it('blind personalisation: three different charts give different evidence, ratings and prompts', async () => {
    const charts = await Promise.all([
      invented(),
      getKundli('1968-03-02', '04:15', 40.7128, -74.006).then((x: any) => ({ ...x, name: 'B', dateOfBirth: new Date('1968-03-02'), timeOfBirth: '04:15', placeOfBirth: 'New York' })),
      getKundli('2001-07-21', '19:40', -33.8688, 151.2093).then((x: any) => ({ ...x, name: 'C', dateOfBirth: new Date('2001-07-21'), timeOfBirth: '19:40', placeOfBirth: 'Sydney' })),
    ]);
    const briefs = charts.map((c) => careerBrief(c, ASOF)!);
    const sig = (f: CareerFacts) => [f.tenthSign, f.tenthLord, f.d10LagnaSign, f.d10TenthLord, f.mahadasha, f.careerYogas!.join('/'), f.fields!.map((x) => x.rating).join('/')].join('|');
    expect(new Set(briefs.map((b) => sig(b.facts))).size).toBe(3);
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
      const fa = briefs[a].facts, fb = briefs[b].facts;
      const differing = [fa.tenthSign !== fb.tenthSign, fa.d10LagnaSign !== fb.d10LagnaSign, fa.mahadasha !== fb.mahadasha, fa.fields!.some((x, i) => x.rating !== fb.fields![i].rating), fa.careerYogas!.join() !== fb.careerYogas!.join()].filter(Boolean).length;
      expect(differing, `charts ${a} and ${b}`).toBeGreaterThanOrEqual(3);
    }
    // Each chart's prompts carry its own evidence block, built from its birth data alone.
    for (const [i, c] of charts.entries()) {
      const prompts: string[] = [];
      const f = briefs[i].facts;
      ai.respond.mockReset();
      ai.respond.mockImplementation((p) => { prompts.push(p); return goodReply(p, f); });
      await generateReport('career', c);
      for (const p of prompts) {
        expect(p).toContain(briefs[i].text.split('\n').find((l) => l.startsWith('- 10th house:'))!);
        for (const j of [0, 1, 2].filter((j) => j !== i)) expect(p).not.toContain(briefs[j].text.split('\n').find((l) => l.startsWith('- D10 Lagna:'))!);
      }
    }
  });

  it('generateReport runs the three-part report unless the facts-first pipeline is chosen explicitly', async () => {
    const prompts: string[] = [];
    ai.respond.mockImplementation((p) => { prompts.push(p); return goodReply(p, facts); });
    await generateReport('career', k);
    await generateReport('career', k, { careerPipeline: 'three-part' });
    expect(prompts).toHaveLength(6);
    for (const p of prompts) expect(p).toMatch(/CAREER EVIDENCE \(deterministic/);
    prompts.length = 0;
    await expect(generateReport('career', k, { careerPipeline: 'facts-first' })).rejects.toThrow();
    expect(prompts.length).toBeGreaterThanOrEqual(5);
    expect(prompts.slice(0, 5).map((p) => p.match(/part of "([^"]+)"/)?.[1]).sort()).toEqual(['Career Overview', 'Current Career Situation', 'Favourable & Difficult Periods', 'Personalised Guidance', 'Your Birth Chart']);
    for (const p of prompts) expect(p).not.toMatch(/CAREER EVIDENCE \(deterministic/);
  });

  it('other reports are unchanged: one call, no career evidence, gemstone guidance and chart remedies as before', async () => {
    let prompt = '';
    ai.respond.mockImplementation((p) => { prompt ||= p; return JSON.stringify({ title: 't', summary: FILL, sections: Array.from(p.matchAll(/\{"heading": "([^"]+)"/g)).map((m) => ({ heading: m[1], body: FILL.repeat(2) })), remedies: ['Keep a steady daily routine'] }); });
    const content: any = await generateReport('marriage', k);
    expect(ai.respond).toHaveBeenCalledTimes(1);
    expect(prompt).not.toMatch(/CAREER EVIDENCE|HOW TO WRITE/);
    expect(prompt).toMatch(/include a gemstone/);
    // The chart's own remedies, gemstone included (this chart's birth star is ruled by Mercury: Emerald).
    expect(content.remedies.some((r: string) => /Emerald/.test(r))).toBe(true);
  });
});
