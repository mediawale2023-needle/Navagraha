import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { natalEvidence, dashaEvidence, runningPeriod, DOMAIN_SPECS } from '../../server/astroEngine/evidence/engine';
import { resolveDomain } from '../../server/astroEngine/evidence/resolution';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { buildTimeline } from '../../server/astroEngine/evidence/timeline';
import { LIFE_DOMAINS, type EvidenceItem } from '../../shared/v3/evidence';

const AS_OF = new Date('2026-10-07T00:00:00Z');
const chartOf = async (date: string, time: string, lat: number, lng: number, approx = false) =>
  (await getKundli(date, time, lat, lng, { timeAccuracy: approx ? 'approximate' : 'exact' })).chartData.canonical;

const item = (over: Partial<EvidenceItem>): EvidenceItem => ({
  id: Math.random().toString(36), domain: 'career', factor: 'f', direction: 'positive', strength: 'moderate', source: 'D1',
  provenance: 'classical-principle', rule: 'r', explanation: 'e', requiresBirthTime: false, usable: true, ...over,
});

describe('resolution engine', () => {
  it('needs broad, independent confirmation for Very Strong', () => {
    const many = ['D1', 'D10', 'Yoga', 'Ashtakavarga'].map((source) => item({ source: source as any }));
    expect(resolveDomain('career', [...many, item({ direction: 'negative', strength: 'weak' })], { approximate: false }).verdict).toBe('Very Strong');
    // Same weight from a single source is only Strong.
    const oneSource = Array.from({ length: 4 }, () => item({ source: 'D1' }));
    expect(resolveDomain('career', [...oneSource, item({ direction: 'negative', strength: 'weak' })], { approximate: false }).verdict).toBe('Strong');
  });
  it('keeps contradictions visible and reports Mixed when they balance', () => {
    const r = resolveDomain('wealth', [item({}), item({ source: 'Yoga' }), item({ direction: 'negative' }), item({ direction: 'negative', source: 'Ashtakavarga' })], { approximate: false });
    expect(r.verdict).toBe('Mixed');
    expect(r.confidence).toBe('Low');
    expect(r.conflicting).toHaveLength(2);
    expect(r.contradictedBy).toEqual(['D1', 'Ashtakavarga']);
  });
  it('reports challenging verdicts symmetrically', () => {
    const neg = ['D1', 'D10', 'Yoga', 'Ashtakavarga'].map((source) => item({ source: source as any, direction: 'negative', strength: 'strong' }));
    expect(resolveDomain('career', neg, { approximate: false }).verdict).toBe('Very Challenging');
  });
  it('excludes birth-time-dependent evidence when the time is approximate and lowers confidence', () => {
    const r = resolveDomain('career', [
      item({ requiresBirthTime: true, usable: false }), item({ requiresBirthTime: true, usable: false }), item({ source: 'Yoga' }),
      item({ source: 'Jaimini' }), item({ source: 'Dasha' }), item({ source: 'D9' }), item({ source: 'D10' }), item({ source: 'Shadbala' }),
    ], { approximate: true });
    expect(r.excluded).toHaveLength(2);
    expect(r.supporting).toHaveLength(6);
    expect(r.confidence).toBe('Low');
    expect(r.notes.join(' ')).toMatch(/approximate/);
  });
  it('never claims a verdict from too little evidence', () => {
    const r = resolveDomain('children', [item({ strength: 'strong' })], { approximate: false });
    expect(r.verdict).toBe('Mixed');
    expect(r.confidence).toBe('Low');
  });
});

describe('evidence engine on real canonical charts', () => {
  it('every item is traceable to the chart and carries rule, explanation, source and provenance', async () => {
    const chart = await chartOf('1990-08-15', '06:30', 12.9716, 77.5946);
    for (const d of LIFE_DOMAINS) {
      const items = [...natalEvidence(chart, d), ...dashaEvidence(chart, d, AS_OF)];
      expect(items.length, d).toBeGreaterThan(0);
      for (const e of items) {
        expect(e.rule.length).toBeGreaterThan(10);
        expect(e.explanation.length).toBeGreaterThan(10);
        expect(['classical-principle', 'derived-rule', 'modern-convention']).toContain(e.provenance);
        if (e.planet) expect(chart.planets.map((p) => p.name)).toContain(e.planet);
        if (e.house) expect(e.house).toBeGreaterThanOrEqual(1);
      }
      // House-lord evidence names the actual lord of that house in this chart.
      for (const e of items.filter((x) => /lord (placement|dignity)$/.test(x.factor))) {
        expect(e.planet).toBe(chart.houses[e.house! - 1].lord);
      }
    }
  });
  it('the 10th-lord evidence follows the real 10th lord', async () => {
    const chart = await chartOf('1975-03-21', '14:20', 19.076, 72.8777);
    const lord = chart.houses[9].lord;
    const lordItems = natalEvidence(chart, 'career').filter((e) => e.factor.startsWith('10th lord'));
    expect(lordItems.length).toBeGreaterThan(0);
    expect(new Set(lordItems.map((e) => e.planet))).toEqual(new Set([lord]));
    expect(DOMAIN_SPECS.career.houses).toEqual([10]);
  });
  it('different charts produce different evidence (no hard-coded claims)', async () => {
    const a = buildInsights(await chartOf('1990-08-15', '06:30', 12.9716, 77.5946), AS_OF);
    const b = buildInsights(await chartOf('1969-01-20', '05:00', 40.7128, -74.006), AS_OF);
    const sig = (x: typeof a) => x.domains.map((d) => d.supporting.map((e) => e.explanation).join('|')).join('#');
    expect(sig(a)).not.toBe(sig(b));
  });
  it('is deterministic', async () => {
    const chart = await chartOf('1990-08-15', '06:30', 12.9716, 77.5946);
    expect(buildInsights(chart, AS_OF)).toEqual(buildInsights(chart, AS_OF));
  });
  it('marks every Lagna-dependent item unusable when the birth time is approximate', async () => {
    const chart = await chartOf('1988-02-14', '06:00', 12.9716, 77.5946, true);
    const ins = buildInsights(chart, AS_OF);
    expect(ins.headline.lagna).toBeNull();
    for (const d of ins.domains) {
      for (const e of [...d.supporting, ...d.conflicting, ...d.neutral]) expect(e.requiresBirthTime).toBe(false);
      expect(d.confidence).toBe('Low');
    }
    expect(ins.domains.some((d) => d.excluded.length > 0)).toBe(true);
  });
});

describe('timing evidence and life timeline', () => {
  it('uses the period actually running on the asOf date', async () => {
    const chart = await chartOf('1990-08-15', '06:30', 12.9716, 77.5946);
    const rp = runningPeriod(chart, AS_OF)!;
    const maha = chart.dashas.vimshottari.mahadashas.find((m) => m.lord === rp.mahadasha)!;
    expect(Date.parse(maha.start)).toBeLessThanOrEqual(AS_OF.getTime());
    expect(Date.parse(maha.end)).toBeGreaterThan(AS_OF.getTime());
    for (const d of LIFE_DOMAINS) for (const e of dashaEvidence(chart, d, AS_OF)) expect([rp.mahadasha, rp.antardasha]).toContain(e.planet);
  });
  it('timeline periods are the canonical Vimshottari periods, contiguous, with exactly one current', async () => {
    const chart = await chartOf('1990-08-15', '06:30', 12.9716, 77.5946);
    const tl = buildTimeline(chart, AS_OF);
    expect(tl.map((p) => p.lord)).toEqual(chart.dashas.vimshottari.mahadashas.map((m) => m.lord));
    expect(tl[0].start).toBe(chart.birth.birthUTC);
    for (let i = 1; i < tl.length; i++) expect(tl[i].start).toBe(tl[i - 1].end);
    expect(tl.filter((p) => p.status === 'current')).toHaveLength(1);
    const current = tl.find((p) => p.status === 'current')!;
    expect(current.antardashas!.filter((a) => a.status === 'current')).toHaveLength(1);
    for (const p of tl) expect(p.whyItMatters).toContain(p.lord);
  });
  it('never lists the same reason as both supporting and conflicting', async () => {
    for (const [d, t, lat, lng] of [['1990-08-15', '06:30', 12.9716, 77.5946], ['1975-03-21', '14:20', 19.076, 72.8777], ['1969-01-20', '05:00', 40.7128, -74.006]] as const) {
      const tl = buildTimeline(await chartOf(d, t, lat, lng), AS_OF);
      for (const p of [...tl, ...tl.flatMap((x) => x.antardashas ?? [])]) {
        expect(p.supporting.filter((r) => p.conflicting.includes(r))).toEqual([]);
      }
    }
  });
});
