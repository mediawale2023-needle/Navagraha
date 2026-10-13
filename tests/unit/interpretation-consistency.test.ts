// Interpretation consistency (PR #99). One Sarvashtakavarga policy for every surface, guard checks
// for SAV figures, Neecha Bhanga and flat verdict reversals, and timeline confidence that needs
// agreeing reasons. Evidence, verdicts and Ashtakavarga values are unchanged.
import { readFileSync } from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({ default: class { chat = { completions: { create } }; } }));
import { savReading, SAV_POLICY_TEXT, SAV_RULE } from '../../shared/v3/ashtakavargaPolicy';
import { DOMAIN_LABELS, LIFE_DOMAINS } from '../../shared/v3/evidence';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { getKundli } from '../../server/astroEngine/index';
import { computeJyotishChart } from '../../server/astroEngine/jyotishEngine';
import { indexChart, natalEvidence } from '../../server/astroEngine/evidence/engine';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { buildEvidencePacket, deterministicAnswer, routeQuestion } from '../../server/agents/askKundli';
import { validateAnswer } from '../../server/agents/answerGuard';
import { AGENT_PROMPTS } from '../../server/agents/prompts';
import { chartSummary } from '../../server/aiAstrologerService';
import { savHouseLine } from '../../server/interpretationPolicy';
import { streamTraditionReading } from '../../server/jyotishAiService';
import { GLOSSARY } from '../../client/src/lib/glossary';
import { dignityLabel } from '../../client/src/lib/timeStability';
import { grahaCards } from '../../client/src/components/kundli/GrahaGrid';

afterEach(() => { vi.unstubAllEnvs(); create.mockReset(); });

const asOf = new Date('2026-10-13T06:00:00Z');
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ORD = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

async function chart(date: string, time: string, lat = 28.6139, lng = 77.209, timeAccuracy: 'exact' | 'approximate' = 'exact') {
  const nk: any = await getKundli(date, time, lat, lng, { timeAccuracy });
  return { row: { name: 'Test', dateOfBirth: date, timeOfBirth: time, placeOfBirth: 'Delhi', zodiacSign: nk.zodiacSign, moonSign: nk.moonSign, ascendant: nk.ascendant, chartData: { ...nk.chartData, isBirthTimeApproximate: timeAccuracy === 'approximate' }, dashas: nk.dashas, doshas: nk.doshas } as any, canonical: nk.chartData.canonical as CanonicalChart };
}

/** Exact charts spread over the zodiac, enough to meet every case below. */
async function sample(n = 24) {
  const out: CanonicalChart[] = [];
  for (let i = 0; i < n; i++) out.push((await chart(`19${50 + i * 2}-${String(1 + (i % 12)).padStart(2, '0')}-${String(3 + i).padStart(2, '0')}`, `${String((i * 5) % 24).padStart(2, '0')}:20`)).canonical);
  return out;
}

describe('one Sarvashtakavarga policy', () => {
  it('labels every value from 15 to 45 by the engine bands', () => {
    for (let b = 15; b <= 45; b++) {
      const r = savReading(b);
      const expected = b >= 36 ? ['positive', 'strong', 'Well above average'] : b >= 32 ? ['positive', 'moderate', 'Above average']
        : b <= 20 ? ['negative', 'strong', 'Well below average'] : b <= 24 ? ['negative', 'moderate', 'Below average'] : ['neutral', null, 'Average'];
      expect([r.direction, r.strength, r.label], `SAV ${b}`).toEqual(expected);
    }
  });

  it('the evidence engine emits exactly the policy for every house it reads', async () => {
    for (const c of await sample(12)) {
      const ix = indexChart(c);
      for (const d of LIFE_DOMAINS) {
        for (const e of natalEvidence(c, d, ix).filter((x) => x.source === 'Ashtakavarga' && /house Sarvashtakavarga$/.test(x.factor))) {
          const b = c.strength.ashtakavarga.savByHouse[e.house! - 1];
          const r = savReading(b);
          expect([e.direction, e.strength, e.rule]).toEqual([r.direction, r.strength, SAV_RULE]);
          expect(e.explanation).toContain(`has ${b} bindus — ${r.label.toLowerCase()}.`);
        }
        const houses = new Set(natalEvidence(c, d, ix).filter((x) => /house Sarvashtakavarga$/.test(x.factor)).map((x) => x.house));
        // The neutral band (25–31) gives no item.
        for (const h of houses) expect(savReading(c.strength.ashtakavarga.savByHouse[h! - 1]).strength).not.toBeNull();
      }
    }
  });

  it('every client surface reads the shared policy and none keeps its own thresholds', () => {
    for (const f of ['client/src/pages/KundliView.tsx', 'client/src/components/reports/ReportReader.tsx', 'client/src/lib/reportPdf.ts']) {
      const src = read(f);
      expect(src, f).toMatch(/savReading\(/);
      expect(src, f).not.toMatch(/\b[bv]\s*>=\s*30\b|\b[bv]\s*<\s*25\b|30 or more|Higher bindus/);
    }
    expect(GLOSSARY.find((g) => g.term === 'Sarvashtakavarga')!.definition).toContain(SAV_POLICY_TEXT);
  });

  it('the AI context labels each house with the same policy (exact time only)', async () => {
    const { row, canonical } = await chart('1984-06-24', '21:28', 13.0827, 80.2707);
    const text = chartSummary(row);
    expect(text).not.toMatch(/>30 strong|<25 weak/);
    expect(text).toContain(SAV_POLICY_TEXT);
    expect(text).toContain(savHouseLine(canonical.strength.ashtakavarga.savByHouse));
    canonical.strength.ashtakavarga.savByHouse.forEach((b, i) => expect(text).toContain(`H${i + 1}:${b} (${savReading(b).label.toLowerCase()})`));
    const approx = chartSummary((await chart('1984-06-24', '12:00', 13.0827, 80.2707, 'approximate')).row);
    expect(approx).not.toMatch(/H\d+:\d+/);
  });

  it('the Ashtakavarga agent may quote only supplied figures', () => {
    expect(AGENT_PROMPTS.ashtakavarga).toMatch(/quote a bindu figure only if an evidence item in the context states it/);
    expect(AGENT_PROMPTS.ashtakavarga).toMatch(/Never estimate, infer or compute a figure/);
  });
});

describe('answer guard: exact-time facts', () => {
  it('accepts the chart\'s own SAV figures and rejects any other figure for that house', async () => {
    for (const c of await sample(8)) {
      const g = buildEvidencePacket(c, routeQuestion('Will my career grow?'), asOf).guard;
      c.strength.ashtakavarga.savByHouse.forEach((b, i) => {
        expect(validateAnswer(`Your ${ORD(i + 1)} house has ${b} bindus.`, g)).toEqual([]);
        expect(validateAnswer(`H${i + 1} (${b} bindus) is ${savReading(b).label.toLowerCase()}.`, g)).toEqual([]);
        expect(validateAnswer(`Your ${ORD(i + 1)} house has ${b + 3} bindus.`, g).join()).toContain(`has ${b} Sarvashtakavarga bindus, not ${b + 3}`);
        expect(validateAnswer(`There are ${b - 2} bindus in the ${ORD(i + 1)} house.`, g)).not.toEqual([]);
      });
    }
  });

  it('does not treat the scale itself, or a house counted from the Moon, as a chart figure', async () => {
    const [c] = await sample(1);
    const g = buildEvidencePacket(c, routeQuestion('Will my career grow?'), asOf).guard;
    for (const s of [
      'The 10th house needs 32 or more bindus to be counted as supportive.',
      'About 28 bindus a house is average; 24 or fewer strains a house.',
      'Houses with fewer than 25 bindus need more effort.',
      'Saturn transits the 4th house from the Moon, a sign with 19 bindus.',
    ]) expect(validateAnswer(s, g), s).toEqual([]);
  });

  it('accepts true Neecha Bhanga statements and rejects false ones', async () => {
    let withNb = 0, debilitatedWithout = 0;
    for (const c of await sample(24)) {
      const g = buildEvidencePacket(c, routeQuestion('Will my career grow?'), asOf).guard;
      for (const d of c.strength.dignities) {
        if (d.dignity === 'Debilitated' && d.neechaBhanga) {
          withNb++;
          expect(validateAnswer(`${d.planet}'s debilitation is cancelled (Neecha Bhanga).`, g)).toEqual([]);
          expect(validateAnswer(`${d.planet} has no Neecha Bhanga.`, g)).not.toEqual([]);
        } else {
          expect(validateAnswer(`${d.planet}'s debilitation is cancelled by Neecha Bhanga.`, g)).not.toEqual([]);
          if (d.dignity === 'Debilitated') { debilitatedWithout++; expect(validateAnswer(`${d.planet} is debilitated and has no Neecha Bhanga.`, g)).toEqual([]); }
        }
      }
      expect(validateAnswer('Neecha Bhanga means the cancellation of a debilitation; it does not make a planet strong on its own.', g)).toEqual([]);
    }
    expect(withNb).toBeGreaterThan(0);
    expect(debilitatedWithout).toBeGreaterThan(0);
  });

  it('rejects a flat reversal of a life-area verdict and nothing nuanced', async () => {
    const NOUN: Record<string, string> = { career: 'career', wealth: 'wealth', relationships: 'marriage', leadership: 'leadership', property: 'property', foreign: 'foreign travel', education: 'education', children: 'children', spirituality: 'spirituality' };
    let reversals = 0;
    for (const c of await sample(16)) {
      const g = buildEvidencePacket(c, routeQuestion('Will my career grow?'), asOf).guard;
      for (const r of buildInsights(c, asOf).domains) {
        expect(validateAnswer(`**${DOMAIN_LABELS[r.domain]}: ${r.verdict}**`, g)).toEqual([]);
        if (['Exceptional', 'Very Strong', 'Strong'].includes(r.verdict)) { reversals++; expect(validateAnswer(`Your ${NOUN[r.domain]} is challenging.`, g).join()).toContain(`is ${r.verdict}`); }
        if (['Challenging', 'Very Challenging'].includes(r.verdict)) { reversals++; expect(validateAnswer(`Your ${NOUN[r.domain]} is very strong.`, g)).not.toEqual([]); }
        if (r.verdict === 'Mixed') expect(validateAnswer(`Your ${NOUN[r.domain]} is strong.`, g)).toEqual([]);
        for (const s of [
          `Your ${NOUN[r.domain]} can be challenging at times, but the overall picture is supportive.`,
          `Your ${NOUN[r.domain]} is strong in the long run, though the current period asks for patience.`,
          `Your ${NOUN[r.domain]} is a strong suit.`,
          `${NOUN[r.domain]} may feel difficult during the Saturn period.`,
        ]) expect(validateAnswer(s, g), s).toEqual([]);
      }
      // The deterministic fallback answer always passes.
      for (const q of ['How is my career?', 'Will I marry?', 'How is my money?']) {
        const p = buildEvidencePacket(c, routeQuestion(q), asOf);
        expect(validateAnswer(deterministicAnswer(p), p.guard)).toEqual([]);
      }
    }
    expect(reversals).toBeGreaterThan(0);
  });

  it('checks only a whole-sentence overall verdict: time-bound, conditional and technique-specific readings pass', async () => {
    const NOUN: Record<string, string> = { career: 'career', wealth: 'finances', relationships: 'marriage', leadership: 'leadership', property: 'property', foreign: 'foreign travel', education: 'education', children: 'children', spirituality: 'spirituality' };
    // Every form here is legitimate whatever the overall verdict.
    const QUALIFIED_FORMS = [
      (n: string, w: string) => `Right now, your ${n} is ${w}.`,
      (n: string, w: string) => `Currently your ${n} is ${w}.`,
      (n: string, w: string) => `This year your ${n} is ${w}.`,
      (n: string, w: string) => `In 2027 your ${n} is ${w}.`,
      (n: string, w: string) => `Under the present Antardasha, your ${n} is ${w}.`,
      (n: string, w: string) => `With effort, your ${n} is ${w}.`,
      (n: string, w: string) => `Is your ${n} ${w}?`,
      (n: string, w: string) => `Your ${n} is ${w} this year.`,
      (n: string, w: string) => `Your ${n} would be ${w} without the 8th-lord placement.`,
      (n: string) => `Your ${n} is stronger than it looks.`,
      (n: string, w: string) => `For now, ${n} is ${w}.`,
      (n: string, w: string) => `Transiting Saturn means your ${n} is ${w}.`,
      (n: string, w: string) => `On the D10 alone, your ${n} is ${w}.`,
      (n: string, w: string) => `As Jupiter transits your 10th, your ${n} is ${w}.`,
    ];
    let positive = 0, negative = 0;
    for (const c of await sample(16)) {
      // The year in one form is allowed, as when the packet supplies it; years are checked by their own rule.
      const g = { ...buildEvidencePacket(c, routeQuestion('Will my career grow?'), asOf).guard, packetText: '2027' };
      for (const r of buildInsights(c, asOf).domains) {
        const n = NOUN[r.domain];
        const opposite = ['Exceptional', 'Very Strong', 'Strong'].includes(r.verdict) ? 'challenging' : ['Challenging', 'Very Challenging'].includes(r.verdict) ? 'very strong' : null;
        if (!opposite) continue;
        opposite === 'challenging' ? positive++ : negative++;
        for (const form of QUALIFIED_FORMS) expect(validateAnswer(form(n, opposite), g), form(n, opposite)).toEqual([]);
        expect(validateAnswer(`Although your ${n} is strong overall, this period may be difficult.`, g)).toEqual([]);
        // The flat, explicit forms are still refused.
        const flat = opposite === 'challenging'
          ? [`Your ${n} is challenging.`, `${DOMAIN_LABELS[r.domain]}: Challenging`, `Your ${n} is difficult.`, `Overall, your ${n} is challenging.`, `**${DOMAIN_LABELS[r.domain]}: Very Challenging**`]
          : [`Your ${n} is very strong.`, `${DOMAIN_LABELS[r.domain]}: Strong`, `Overall, your ${n} is very strong.`, `Your ${n} looks excellent overall.`];
        for (const s of flat) expect(validateAnswer(s, g), s).not.toEqual([]);
      }
    }
    expect(positive).toBeGreaterThan(0);
    expect(negative).toBeGreaterThan(0);
  });

  it('refuses the four example reversals', async () => {
    for (const c of await sample(24)) {
      const v = new Map(buildInsights(c, asOf).domains.map((d) => [d.domain, d.verdict]));
      if (!['Strong', 'Very Strong', 'Exceptional'].includes(v.get('career')!) || !['Challenging', 'Very Challenging'].includes(v.get('relationships')!) || !['Strong', 'Very Strong', 'Exceptional'].includes(v.get('wealth')!)) continue;
      const g = buildEvidencePacket(c, routeQuestion('Will my career grow?'), asOf).guard;
      for (const s of ['Your career is challenging.', 'Career: Challenging', 'Overall, your marriage is very strong.', 'Your finances are difficult.']) expect(validateAnswer(s, g), s).not.toEqual([]);
      return;
    }
    throw new Error('no chart in the sample with Strong career and wealth and Challenging relationships');
  });

  it('keeps PR #98: an approximate chart still refuses bindu figures and Neecha Bhanga', async () => {
    const { canonical } = await chart('1958-04-28', '06:00', 22.5726, 88.3639, 'approximate');
    const g = buildEvidencePacket(canonical, routeQuestion('Will my career grow?'), asOf).guard;
    expect(validateAnswer(`Your 10th house has ${canonical.strength.ashtakavarga.savByHouse[9]} bindus.`, g)).not.toEqual([]);
    expect(validateAnswer('Saturn has Neecha Bhanga.', g).join()).toContain('approximate');
  });
});

describe('Neecha Bhanga is named as a cancellation', () => {
  it('labels a cancelled debilitation distinctly, never for an approximate time', () => {
    expect(dignityLabel({ dignity: 'Debilitated', neechaBhanga: true }, false)).toBe('Debilitated, cancelled (Neecha Bhanga)');
    expect(dignityLabel({ dignity: 'Debilitated', neechaBhanga: true }, true)).toBe('Debilitated');
    expect(dignityLabel({ dignity: 'Debilitated' }, false)).toBe('Debilitated');
    expect(read('client/src/pages/KundliView.tsx')).toMatch(/p\.dignity === 'Debilitated' && !\(p\.neechaBhanga && !approx\) \? 'text-negative'/);
  });

  it('the graha cards carry the cancellation label', async () => {
    for (const c of await sample(24)) {
      const cards = grahaCards(c, { lagnaKnown: true, moonSignKnown: true, nakshatraKnown: true });
      for (const d of c.strength.dignities.filter((x) => x.dignity === 'Debilitated')) {
        expect(cards.find((x) => x.planet === d.planet)!.dignity).toBe(d.neechaBhanga ? 'Debilitated, cancelled (Neecha Bhanga)' : 'Debilitated');
      }
    }
  });

  it('report and Pro instructions keep debilitation, cancellation, strength and the yoga apart', async () => {
    const { row } = await chart('1984-06-24', '21:28', 13.0827, 80.2707);
    expect(chartSummary(row)).not.toContain('under-delivers; note Neecha');
    for (const src of [read('server/aiAstrologerService.ts'), read('server/jyotishAiService.ts')]) {
      expect(src).toContain('${NEECHA_BHANGA_RULE}');
      expect(src).not.toMatch(/weak\/debilitated\/combust planet under-delivers/);
    }
  });
});

describe('Pro context carries the data its cross-checks need', () => {
  const pro = async (timeAccuracy: 'exact' | 'approximate') => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    create.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: 'ok' } }] }; })());
    const chart = computeJyotishChart('1990-08-15', '06:30', 12.9716, 77.5946, { timeAccuracy });
    await streamTraditionReading('parashar', { name: 'C', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru' }, chart.chartData, () => {});
    return { chart, messages: create.mock.calls[0][0].messages as Array<{ content: string }> };
  };

  it('exact time: dignities and SAV by house with the policy labels', async () => {
    const { chart, messages } = await pro('exact');
    const user = messages[1].content;
    expect(user).toContain(savHouseLine(chart.chartData.ashtakavarga.savByHouse));
    expect(user).toContain(SAV_POLICY_TEXT);
    for (const d of chart.chartData.dignities) expect(user).toContain(`- ${d.planet}: ${d.dignity}`);
  });

  it('approximate time: no house bindus and only dignities that hold all day', async () => {
    const { messages } = await pro('approximate');
    const user = messages[1].content;
    expect(user).not.toMatch(/H\d+:\d+ \(/);
    expect(user).toContain('Do not quote bindu figures');
    expect(user).not.toContain('debilitation cancelled by Neecha Bhanga');
  });
});

describe('timeline confidence needs agreeing reasons', () => {
  it('never rates a period High when its reasons pull both ways; verdicts are untouched', async () => {
    let mixed = 0;
    for (const c of await sample(24)) {
      for (const p of buildInsights(c, asOf).timeline.flatMap((x) => [x, ...(x.antardashas ?? [])])) {
        if (p.supporting.length && p.conflicting.length) { mixed++; expect(p.confidence).not.toBe('High'); }
        if (p.confidence === 'High') expect(p.supporting.length + p.conflicting.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(mixed).toBeGreaterThan(0);
  });
});

describe('Neecha Bhanga claims name the right planet', () => {
  it('a planet named as the cause of a cancellation is not read as having one', async () => {
    for (const c of await sample(24)) {
      const nb = c.strength.dignities.find((d) => d.dignity === 'Debilitated' && d.neechaBhanga);
      if (!nb) continue;
      const other = c.strength.dignities.find((d) => d.planet !== nb.planet && d.dignity !== 'Debilitated')!;
      const g = buildEvidencePacket(c, routeQuestion('Will my career grow?'), asOf).guard;
      expect(validateAnswer(`${nb.planet}'s debilitation is cancelled because ${other.planet} sits in a kendra (Neecha Bhanga).`, g)).toEqual([]);
      expect(validateAnswer(`${other.planet} has Neecha Bhanga.`, g)).not.toEqual([]);
      return;
    }
    throw new Error('no chart with Neecha Bhanga in the sample');
  });
});
