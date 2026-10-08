import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { natalEvidence, dashaEvidence, runningPeriod, dashaTimingStable, DOMAIN_SPECS } from '../../server/astroEngine/evidence/engine';
import { resolveDomain } from '../../server/astroEngine/evidence/resolution';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { buildTimeline } from '../../server/astroEngine/evidence/timeline';
import { LIFE_DOMAINS, type EvidenceItem } from '../../shared/v3/evidence';

const AS_OF = new Date('2026-10-07T00:00:00Z');
const chartOf = async (date: string, time: string, lat: number, lng: number, approx = false) =>
  (await getKundli(date, time, lat, lng, { timeAccuracy: approx ? 'approximate' : 'exact' })).chartData.canonical;

const item = (over: Partial<EvidenceItem>): EvidenceItem => ({
  id: Math.random().toString(36), domain: 'career', factor: 'f', direction: 'positive', strength: 'moderate', source: 'D1',
  provenance: 'classical-principle', rule: 'r', explanation: 'e', requiresBirthTime: false, usable: true, tier: 'core', ...over,
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
  // Spec change (launch sprint): too little evidence is reported as such, not as "Mixed".
  it('never claims a verdict from too little evidence', () => {
    const r = resolveDomain('children', [item({ strength: 'strong' })], { approximate: false });
    expect(r.verdict).toBe('Insufficient evidence');
    expect(r.confidence).toBe('Low');
  });
  it('experimental items are shown but never decide the verdict', () => {
    const exp = ['Jaimini', 'Shadbala', 'Yoga', 'D1'].map((source) => item({ source: source as any, tier: 'experimental', strength: 'strong' }));
    const r = resolveDomain('career', [...exp, item({ direction: 'negative' }), item({ direction: 'negative', source: 'D9' }), item({ direction: 'negative', source: 'Ashtakavarga' }), item({})], { approximate: false });
    expect(r.experimental).toHaveLength(4);
    expect(r.verdict).toBe('Challenging');
    expect(r.supporting.every((e) => e.tier === 'core')).toBe(true);
  });
  it('weak indicators add weight but never count as independent confirmation', () => {
    const weak = ['D1', 'D9', 'D10', 'Yoga', 'Ashtakavarga'].map((source) => item({ source: source as any, strength: 'weak' }));
    const r = resolveDomain('career', [...weak, item({ strength: 'moderate' })], { approximate: false });
    expect(r.confirmedBy).toEqual(['D1']);
    expect(r.verdict).toBe('Strong');
  });
  it('positive and negative extremes use mirror-image thresholds', () => {
    const mk = (direction: 'positive' | 'negative') => ['D1', 'D9', 'Ashtakavarga'].map((source) => item({ source: source as any, direction, strength: 'strong' }));
    expect(resolveDomain('career', [...mk('positive'), item({})], { approximate: false }).verdict).toBe('Very Strong');
    expect(resolveDomain('career', [...mk('negative'), item({ direction: 'negative' })], { approximate: false }).verdict).toBe('Very Challenging');
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

describe('evidence tiers and approximate birth time', () => {
  it('Jaimini, partial Shadbala, modern conventions and common yogas are experimental', async () => {
    for (const [d, t, lat, lng] of [['1990-08-15', '06:30', 12.9716, 77.5946], ['1975-03-21', '14:20', 19.076, 72.8777], ['1969-01-20', '05:00', 40.7128, -74.006]] as const) {
      const chart = await chartOf(d, t, lat, lng);
      for (const dom of LIFE_DOMAINS) for (const e of natalEvidence(chart, dom)) {
        if (e.source === 'Jaimini' || e.source === 'Shadbala' || e.provenance === 'modern-convention') expect(e.tier, e.id).toBe('experimental');
        if (/^(Raja|Budha-Aditya|Gajakesari)$|Vipreeta Raja/.test(e.factor.replace(/ Yoga$/, ''))) expect(e.tier, e.id).toBe('experimental');
      }
    }
  });
  it('with an approximate time, a dasha period is used only when every birth moment that day gives the same period', async () => {
    const chart = await chartOf('1988-02-14', '06:00', 12.9716, 77.5946, true);
    const stable = dashaTimingStable(chart, AS_OF);
    for (const d of LIFE_DOMAINS) for (const e of dashaEvidence(chart, d, AS_OF)) {
      if (e.factor === 'Running Mahadasha' && !stable.mahadasha) expect(e.usable).toBe(false);
      if (e.factor === 'Running Antardasha' && !stable.antardasha) expect(e.usable).toBe(false);
    }
    // Exact times are always stable; an approximate time's antardasha cannot be more stable than its mahadasha.
    expect(dashaTimingStable(await chartOf('1988-02-14', '06:00', 12.9716, 77.5946), AS_OF)).toEqual({ mahadasha: true, antardasha: true });
    if (!stable.mahadasha) expect(stable.antardasha).toBe(false);
  });
  it('a whole-day time window usually moves the running periods: those dates are not used as fact', async () => {
    // Values below were computed by this engine; they follow from the Moon's ~13°/day motion.
    expect(dashaTimingStable(await chartOf('1988-02-14', '06:00', 12.9716, 77.5946, true), AS_OF)).toEqual({ mahadasha: false, antardasha: false });
    expect(dashaTimingStable(await chartOf('1990-08-15', '06:30', 12.9716, 77.5946, true), AS_OF)).toEqual({ mahadasha: true, antardasha: false });
    const ins = buildInsights(await chartOf('1988-02-14', '06:00', 12.9716, 77.5946, true), AS_OF);
    expect(ins.timing).toMatchObject({ mahadashaReliable: false, antardashaReliable: false });
    expect(ins.timing.note).toMatch(/approximate/);
    expect(buildInsights(await chartOf('1990-08-15', '06:30', 12.9716, 77.5946), AS_OF).timing).toEqual({ mahadashaReliable: true, antardashaReliable: true, note: null });
  });
});

describe('calibration over the 44 golden charts', () => {
  it('stays within the launch guardrails (no manufactured extremes, no one-sided domain)', async () => {
    const { verdictDistribution } = await import('../../scripts/calibration/distribution');
    const { byDomain, total } = await verdictDistribution();
    const n = 44;
    expect(total.Exceptional).toBe(0);
    expect(total['Very Strong']).toBeLessThanOrEqual(0.06 * n * 9);
    const positive = total.Exceptional + total['Very Strong'] + total.Strong;
    const negative = total.Challenging + total['Very Challenging'];
    expect(positive / (n * 9)).toBeLessThan(0.5);
    expect(negative).toBeGreaterThan(0.1 * n * 9);
    for (const d of LIFE_DOMAINS) {
      const v = byDomain[d];
      const pos = v.Exceptional + v['Very Strong'] + v.Strong;
      const neg = v.Challenging + v['Very Challenging'];
      expect(pos / n, `${d} positive share`).toBeLessThanOrEqual(0.7);
      expect(neg / n, `${d} negative share`).toBeLessThanOrEqual(0.7);
      expect(v['Insufficient evidence'] / n, `${d} insufficient share`).toBeLessThanOrEqual(0.35);
    }
  }, 120_000);
});
