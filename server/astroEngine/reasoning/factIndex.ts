/**
 * FactIndex: a read-only index of the CanonicalChart's calculated values, under stable fact ids.
 * Nothing is recalculated: every value is read from the chart, and reliability for an approximate
 * birth time comes from the PR #98 birth-day stability check (birthDayStability, dashaTimingStable),
 * not from a second uncertainty model.
 */
import type { CanonicalChart, Graha } from '@shared/v3/canonical';
import { birthDayStability, yogaTimeStable } from '../canonical/birthDay.js';
import { dashaTimingStable, runningPeriod } from '../evidence/engine.js';
import { fact, type FactCategory, type FactId } from './facts.js';

/**
 * exact-birth-time: the birth time is exact, so the chart's value is the fact.
 * stable-across-birth-date: approximate time, but the value is the same at every moment of the birth date.
 * varies-across-birth-date: approximate time, and the value changes during the birth date.
 * requires-exact-birth-time: approximate time, and the value rests on the Lagna, a degree or a date the time moves.
 */
export type ReliabilityBasis = 'exact-birth-time' | 'stable-across-birth-date' | 'varies-across-birth-date' | 'requires-exact-birth-time';

export interface Fact {
  id: FactId;
  category: FactCategory;
  subject: string;
  value: unknown;
  /** Where in the CanonicalChart the value is read from ('canonical'), or the read-out it applies ('derived-from-canonical'). */
  provenance: { kind: 'canonical' | 'derived-from-canonical'; path: string };
  reliable: boolean;
  reliability: ReliabilityBasis;
}

export interface FactIndex {
  asOf: string;
  approximate: boolean;
  facts: ReadonlyMap<FactId, Readonly<Fact>>;
  get(id: FactId): Readonly<Fact> | undefined;
}

export function buildFactIndex(chart: CanonicalChart, asOf: Date): FactIndex {
  const approximate = chart.birth.timeAccuracy === 'approximate';
  const st = birthDayStability(chart);
  const facts = new Map<FactId, Fact>();
  const exact = (stable: boolean): ReliabilityBasis => (!approximate ? 'exact-birth-time' : stable ? 'stable-across-birth-date' : 'varies-across-birth-date');
  const lagnaBound: ReliabilityBasis = approximate ? 'requires-exact-birth-time' : 'exact-birth-time';
  const add = (id: FactId, category: FactCategory, subject: string, value: unknown, path: string, reliability: ReliabilityBasis, kind: Fact['provenance']['kind'] = 'canonical') =>
    facts.set(id, Object.freeze({ id, category, subject, value, provenance: { kind, path }, reliable: reliability === 'exact-birth-time' || reliability === 'stable-across-birth-date', reliability }));

  for (const p of chart.planets) {
    const s = st.planets[p.name as Graha];
    add(fact.sign(p.name), 'planet.sign', p.name, p.sign, `planets[${p.name}].sign`, exact(s.sign));
    add(fact.house(p.name), 'planet.house', p.name, p.house, `planets[${p.name}].house`, lagnaBound);
  }
  for (const d of chart.strength.dignities) {
    const s = st.planets[d.planet];
    add(fact.dignity(d.planet), 'dignity', d.planet, d.dignity, `strength.dignities[${d.planet}].dignity`, exact(s.sign && s.dignity));
    add(fact.combust(d.planet), 'combustion', d.planet, d.combust, `strength.dignities[${d.planet}].combust`, exact(s.combust));
    // Neecha Bhanga is judged from the Lagna; it exists only for a debilitated planet.
    if (d.dignity === 'Debilitated') add(fact.neechaBhanga(d.planet), 'neecha-bhanga', d.planet, !!d.neechaBhanga, `strength.dignities[${d.planet}].neechaBhanga`, lagnaBound);
  }
  // The Moon's paksha, read from the Sun and Moon longitudes exactly as the evidence engine reads it.
  const sun = chart.planets.find((p) => p.name === 'Sun')!.longitude;
  const moon = chart.planets.find((p) => p.name === 'Moon')!.longitude;
  // Not part of the birth-day stability check, so not claimed as stable for an approximate time.
  add(fact.paksha(), 'moon.paksha', 'Moon', ((moon - sun + 360) % 360) < 180 ? 'waxing' : 'waning', '(planets[Moon].longitude - planets[Sun].longitude) mod 360 < 180', lagnaBound, 'derived-from-canonical');
  for (const h of chart.houses) add(fact.lord(h.house), 'house.lord', String(h.house), h.lord, `houses[${h.house}].lord`, lagnaBound);
  for (const a of chart.aspects) add(fact.aspect(a.planet), 'aspect', a.planet, a.aspectsHouses, `aspects[${a.planet}].aspectsHouses`, lagnaBound);
  chart.strength.ashtakavarga.savByHouse.forEach((b, i) => add(fact.sav(i + 1), 'sav.house', String(i + 1), b, `strength.ashtakavarga.savByHouse[${i}]`, lagnaBound));
  for (const [division, v] of Object.entries(chart.vargas)) {
    for (const p of v.placements) add(fact.varga(division, p.planet), 'varga.sign', `${division}:${p.planet}`, p.sign, `vargas.${division}.placements[${p.planet}].sign`, lagnaBound);
  }
  for (const p of chart.strength.shadbala.planets) add(fact.digBala(p.planet), 'shadbala.dig', p.planet, p.dig, `strength.shadbala.planets[${p.planet}].dig`, lagnaBound);
  // Chara karakas are ranked by degree, which moves through the birth date.
  for (const k of chart.jaimini.charaKarakas) add(fact.charaKaraka(k.karaka), 'jaimini.karaka', k.karaka, k.planet, `jaimini.charaKarakas[${k.karaka}].planet`, lagnaBound);
  for (const y of chart.yogas) {
    add(fact.yoga(y.name, y.planets), 'yoga', y.name, { planets: y.planets, cancelled: !!y.cancelled }, `yogas[${y.name}:${y.planets.join(',')}]`, exact(yogaTimeStable(y.name, st)));
  }
  for (const d of chart.doshas) {
    const stable = d.id === 'kaalSarp' ? st.doshas.kaalSarp : d.id === 'pitru' ? st.doshas.pitru : d.id === 'vishaYoga' ? st.doshas.vishaYoga : false;
    add(fact.dosha(d.id), 'dosha', d.id, { present: d.present, cancelledBy: d.cancelledBy ?? [] }, `doshas[${d.id}]`, d.id === 'mangal' ? lagnaBound : exact(stable));
  }
  const rp = runningPeriod(chart, asOf);
  if (rp) {
    const stable = dashaTimingStable(chart, asOf);
    add(fact.running('mahadasha'), 'dasha.running', 'mahadasha', rp.mahadasha, `dashas.vimshottari.mahadashas[as of ${asOf.toISOString()}].lord`, exact(stable.mahadasha), 'derived-from-canonical');
    if (rp.antardasha) add(fact.running('antardasha'), 'dasha.running', 'antardasha', rp.antardasha, `dashas.vimshottari.mahadashas[…].antardashas[as of ${asOf.toISOString()}].lord`, exact(stable.antardasha), 'derived-from-canonical');
  }
  return { asOf: asOf.toISOString(), approximate, facts, get: (id) => facts.get(id) };
}
