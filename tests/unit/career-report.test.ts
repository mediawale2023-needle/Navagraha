/**
 * Career & Profession Report: the deterministic career evidence, the career-only section checks and the remedy
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
import { careerCorrectionNote, generateReport } from '../../server/aiAstrologerService';
import { CAREER_BATCHES, CAREER_SECTIONS, FIELDS, careerBrief, careerRemedies, careerReportProblems, careerSectionProblems, type CareerFacts } from '../../server/careerReport';

const ASOF = new Date('2026-10-14T06:00:00Z');
// The production report's birth details: 13 Nov 1991, 12:30 IST, Belagavi.
const sanket = async () => ({ ...(await getKundli('1991-11-13', '12:30', 15.8497, 74.4977)) as any, name: 'S', dateOfBirth: new Date('1991-11-13'), timeOfBirth: '12:30', placeOfBirth: 'Belagavi' });
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
  ...(p.includes('"remedies":') ? { remedies: ['Strengthen Saturn: wear a Blue Sapphire', 'Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the Lagna and aspects the 10th house'] } : {}),
});

let k: any; let facts: CareerFacts;
beforeEach(async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  ai.respond.mockReset();
  ai.maxTokens.length = 0;
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
  it('accept a section that meets its requirements, and reject a short one', () => {
    for (const x of CAREER_SECTIONS) expect(careerSectionProblems(x.heading, careerBody(x.heading, facts), facts), x.heading).toEqual([]);
    expect(careerSectionProblems('Tenth House & Its Lord (D1)', `The 10th house is Libra and its lord Venus. ${filler(80)}`, facts)).toEqual([expect.stringMatching(/too short: \d+ words/)]);
  });
  it('require each section to use its own evidence, including the D1–D10 comparison', () => {
    const long = filler(400);
    expect(careerSectionProblems('Tenth House & Its Lord (D1)', long, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/10th house/), expect.stringMatching(/10th lord, Venus/)]));
    expect(careerSectionProblems('Dasamsa (D10) Analysis', long, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/D10/), expect.stringMatching(/Pisces/), expect.stringMatching(/birth time/)]));
    expect(careerSectionProblems('Comparing the D1 and D10', `The D10 matters. ${long}`, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/compare the D1 \(birth chart\) with the D10/), expect.stringMatching(/10th lord, Venus/), expect.stringMatching(/agree or differ/)]));
    expect(careerSectionProblems('Career Timeline (Dasha Periods)', long, { ...facts, nextAntardasha: 'Mercury' })).toEqual(expect.arrayContaining([expect.stringMatching(/Mahadasha lord, Jupiter/), expect.stringMatching(/Antardasha/), expect.stringMatching(/next Antardasha, Mercury/)]));
    expect(careerSectionProblems('Career Yogas', long, facts)).toEqual(expect.arrayContaining([expect.stringMatching(/must explain Sasa Yoga/)]));
    // No career-linked yoga: a few sentences are enough, and nothing invites padding.
    expect(careerSectionProblems('Career Yogas', 'None of the yogas the engine detected is linked to the 10th house, its lord, the D10 or the career significators, so none is read as a career yoga here. The Dhana Yoga in this chart concerns wealth rather than work.', { ...facts, careerYogas: [], yogaNames: ['Dhana Yoga'] })).toEqual([]);
    // Hyphenated engine names are matched as written or with spaces.
    expect(careerSectionProblems('Career Yogas', `Chandra Mangala Yoga and Chandra-Mangala Yoga. ${long}`, { ...facts, yogaNames: [...facts.yogaNames, 'Chandra-Mangala Yoga'] }).join(' ')).not.toMatch(/Chandra.Mangala Yoga, which the engine did not detect/);
    expect(careerSectionProblems('Job vs Business', long, facts)).toEqual([expect.stringMatching(/6th, 7th and 10th/)]);
  });
  it('reject a recommendation the chart supports only weakly, and a field named without its facts', () => {
    const weak = facts.fields!.find((x) => x.rating === 'weakly supported')!;
    expect(weak.id).toBe('advisory');
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
    expect(one('The Saturn Antardasha begins in January 2027 with Saturn.')).toEqual([]);
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
      expect(p).toMatch(/Other parts, written separately, cover/);
      expect(p).not.toMatch(/include a gemstone/);
    }
    expect(content.sections.map((s: any) => s.heading)).toEqual(CAREER_SECTIONS.map((x) => x.heading));
    expect(content.summary).toMatch(/10th lord Venus/);
    expect(content.remedies).toEqual(['Recite the Saturn mantra 108 times on Saturdays, since Saturn rules the Lagna and aspects the 10th house']);
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

  it('a repeated paragraph across parts regenerates only the later section', async () => {
    const prompts: string[] = [];
    const copied = careerBody('Tenth House & Its Lord (D1)', facts).split('\n\n')[1];
    let first = true;
    ai.respond.mockImplementation((p) => {
      prompts.push(p);
      if (first && headingsIn(p).includes('Strengths, Challenges & Practical Guidance')) { first = false; return goodReply(p, facts, (h) => (h === 'Strengths, Challenges & Practical Guidance' ? `${careerBody(h, facts)}\n\n${copied}` : undefined)); }
      if (headingsIn(p).includes('Tenth House & Its Lord (D1)')) return goodReply(p, facts, (h) => (h === 'Tenth House & Its Lord (D1)' ? `The 10th house (the house of profession) is Libra, and its lord Venus shapes the working life.\n\n${copied}\n\n${filler(250)}` : undefined));
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
      sanket(),
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

  it('other reports are unchanged: one call, no career evidence, gemstone guidance and chart remedies as before', async () => {
    let prompt = '';
    ai.respond.mockImplementation((p) => { prompt ||= p; return JSON.stringify({ title: 't', summary: FILL, sections: Array.from(p.matchAll(/\{"heading": "([^"]+)"/g)).map((m) => ({ heading: m[1], body: FILL.repeat(2) })), remedies: ['Keep a steady daily routine'] }); });
    const content: any = await generateReport('marriage', k);
    expect(ai.respond).toHaveBeenCalledTimes(1);
    expect(prompt).not.toMatch(/CAREER EVIDENCE|HOW TO WRITE/);
    expect(prompt).toMatch(/include a gemstone/);
    expect(content.remedies.some((r: string) => /Pearl/.test(r))).toBe(true);
  });
});
