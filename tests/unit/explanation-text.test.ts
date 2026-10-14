/**
 * Language regressions found while preparing the Jyotish validation package: a linked but neutral
 * running period called "not linked", a cancelled yoga's cancellation said twice, "but combust" where
 * nothing contrasts, and planet names lower-cased inside a verdict's conclusion.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { DOMAIN_LABELS } from '../../shared/v3/evidence';
import { getKundli } from '../../server/astroEngine/index';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { dignityDirection } from '../../server/astroEngine/evidence/engine';
import { buildInterpretationContext } from '../../server/astroEngine/reasoning/interpretationContext';
import { buildExplanations } from '../../server/astroEngine/reasoning/explanations';

const asOf = new Date('2026-10-14T06:00:00Z');
const GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const chart = async (date: string, time: string, lat: number, lng: number, timeAccuracy: 'exact' | 'approximate' = 'exact') =>
  ((await getKundli(date, time, lat, lng, { timeAccuracy })) as any).chartData.canonical as CanonicalChart;

const PLACES: Array<[number, number]> = [[28.6139, 77.209], [19.076, 72.8777], [13.0827, 80.2707], [51.5074, -0.1278], [40.7128, -74.006], [27.7172, 85.324]];
async function sample(n: number, timeAccuracy: 'exact' | 'approximate' = 'exact'): Promise<CanonicalChart[]> {
  const out: CanonicalChart[] = [];
  for (let i = 0; i < n; i++) {
    const [lat, lng] = PLACES[i % PLACES.length];
    const date = `${1935 + ((i * 11) % 80)}-${String(1 + ((i * 7) % 12)).padStart(2, '0')}-${String(1 + ((i * 3) % 28)).padStart(2, '0')}`;
    const time = timeAccuracy === 'approximate' ? '12:00' : `${String((i * 5) % 24).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}`;
    out.push(await chart(date, time, lat, lng, timeAccuracy));
  }
  return out;
}

describe('running period: linked to an area vs counting in it', () => {
  it('JV-01 (1983-08-27 05:28 Kathmandu): the neutral Venus Mahadasha names the areas it bears on', async () => {
    const c = await chart('1983-08-27', '05:28', 27.7172, 85.324);
    const ctx = buildInterpretationContext(c, asOf);
    const md = ctx.periods.find((p) => p.level === 'mahadasha' && p.status === 'known')!;
    expect(md.lord).toBe('Venus');
    expect(md.direction).toBe('neutral');
    expect(md.areas).toEqual([]);
    expect(md.linkedAreas.length).toBeGreaterThan(0);
    const text = buildExplanations(ctx).periods.find((p) => p.id === md.id)!.text;
    expect(text).not.toMatch(/not linked/);
    for (const d of md.linkedAreas) expect(text).toContain(DOMAIN_LABELS[d].toLowerCase());
    expect(text).toMatch(/Because this reading is neutral, it counts neither for nor against/);
  });

  it('"not linked" only when no area shows the period\'s evidence; "bears on" names exactly the linked areas', async () => {
    let neutralLinked = 0;
    for (const c of [...await sample(60), ...await sample(12, 'approximate')]) {
      const ins = buildInsights(c, asOf);
      const ctx = buildInterpretationContext(c, asOf, ins);
      const ex = buildExplanations(ctx);
      for (const p of ctx.periods.filter((x) => x.status === 'known')) {
        // The evidence the engine shows for this lord's running period, area by area.
        const shown = ins.domains.filter((d) => [...d.supporting, ...d.conflicting, ...d.neutral]
          .some((e) => e.source === 'Dasha' && e.factor === `Running ${p.level === "mahadasha" ? "Mahadasha" : "Antardasha"}` && e.planet === p.lord)).map((d) => d.domain);
        if (!(p.level === 'antardasha' && p.sameLordAsMahadasha)) expect([...p.linkedAreas].sort()).toEqual([...shown].sort());
        expect(p.areas.every((d) => p.linkedAreas.includes(d))).toBe(true);
        const e = ex.periods.find((x) => x.id === p.id);
        if (!e) continue;
        if (p.linkedAreas.length) expect(e.text, e.text).not.toMatch(/not linked/);
        else expect(e.text).toMatch(/not linked/);
        if (!p.areas.length && p.linkedAreas.length) {
          neutralLinked++;
          expect(p.direction).toBe('neutral');
          expect(e.text).toMatch(/counts neither for nor against/);
        }
      }
    }
    expect(neutralLinked).toBeGreaterThan(0);
  });
});

describe('cancelled yoga', () => {
  it('states formation, cancellation and non-contribution once each', async () => {
    let cancelled = 0;
    for (const c of await sample(60)) {
      const ctx = buildInterpretationContext(c, asOf);
      for (const y of buildExplanations(ctx).yogas) {
        const all = `${y.formation} ${y.contribution} ${y.effectiveness}`;
        expect((all.match(/cancel/gi) ?? []).length, all).toBeLessThanOrEqual(ctx.yogas.find((x) => x.id === y.id)!.cancelled ? 2 : 0);
        if (!ctx.yogas.find((x) => x.id === y.id)!.cancelled) continue;
        cancelled++;
        expect(y.formation).toMatch(/^.+ is formed( by .+)?, and a condition that cancels it is also present in this chart\.$/);
        expect(y.contribution).toBe('Because it is cancelled, it does not count in any assessment.');
        expect(y.effectiveness).not.toMatch(/cancel/i);
        expect(all).not.toMatch(/cancelled in this chart/);
      }
    }
    expect(cancelled).toBeGreaterThan(0);
  });
});

describe('combustion wording', () => {
  it('"but combust" only where the sign favours the planet', () => {
    expect(dignityDirection({ dignity: "Friend's sign", combust: true })!.text).toBe("in a friend's sign but combust (too close to the Sun)");
    expect(dignityDirection({ dignity: "Enemy's sign", combust: true })!.text).toBe("in an enemy's sign and combust (too close to the Sun)");
    expect(dignityDirection({ dignity: 'Neutral sign', combust: true })!.text).toBe('in a neutral sign and combust (too close to the Sun)');
    // Direction and strength are unchanged by the wording.
    for (const dignity of ["Friend's sign", "Enemy's sign", 'Neutral sign']) {
      expect(dignityDirection({ dignity, combust: true })).toMatchObject({ direction: 'negative', strength: 'moderate' });
    }
  });

  it('no evidence explanation pairs a non-favourable sign with "but combust"', async () => {
    let combust = 0;
    for (const c of await sample(60)) {
      for (const d of buildInsights(c, asOf).domains) {
        for (const e of [...d.supporting, ...d.conflicting, ...d.neutral, ...d.experimental, ...d.excluded]) {
          if (/combust/.test(e.explanation)) combust++;
          expect(e.explanation).not.toMatch(/(enemy's|neutral) sign but combust/i);
        }
      }
    }
    expect(combust).toBeGreaterThan(0);
  });
});

describe('verdict conclusions', () => {
  it('keep planet names capitalised; the generic "Running …" factor reads lower case', async () => {
    let planetLed = 0;
    for (const c of await sample(60)) {
      for (const d of buildInsights(c, asOf).domains) {
        for (const g of GRAHAS) expect(d.conclusion).not.toMatch(new RegExp(`\\b${g.toLowerCase()}\\b`));
        expect(d.conclusion).not.toMatch(/is Running /);
        if (d.verdict === "Insufficient evidence") continue;
        for (const e of [d.supporting[0], d.conflicting[0]].filter(Boolean)) {
          if (GRAHAS.some((g) => e.factor.startsWith(g))) { planetLed++; expect(d.conclusion).toContain(e.factor); }
        }
      }
    }
    expect(planetLed).toBeGreaterThan(0);
  });
});
