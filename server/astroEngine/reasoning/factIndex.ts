/**
 * FactIndex: a read-only index of the CanonicalChart's calculated values, under stable fact ids.
 * Nothing is recalculated: every value is read from the chart, and reliability for an approximate
 * birth time comes from the PR #98 birth-day stability check (birthDayStability, dashaTimingStable),
 * not from a second uncertainty model.
 */
import type { CanonicalChart, Graha } from '@shared/v3/canonical';
import { birthDayStability, yogaTimeStable } from '../canonical/birthDay.js';
import { dashaTimingStable, runningPeriod } from '../evidence/engine.js';
import { asOfKey, fact, type FactCategory, type FactId } from './facts.js';

/**
 * exact-birth-time: the birth time is exact, so the chart's value is the fact.
 * stable-across-birth-date: approximate time, but the value is the same at every moment of the birth date.
 * varies-across-birth-date: approximate time, and the value changes during the birth date.
 * requires-exact-birth-time: approximate time, and the value rests on the Lagna, a degree or a date the time moves.
 */
export type ReliabilityBasis = 'exact-birth-time' | 'stable-across-birth-date' | 'varies-across-birth-date' | 'requires-exact-birth-time';

interface FactBase {
  readonly id: FactId;
  readonly category: FactCategory;
  readonly subject: string;
  /** Where in the CanonicalChart the value is read from ('canonical'), or the read-out it applies ('derived-from-canonical'). */
  readonly provenance: { readonly kind: 'canonical' | 'derived-from-canonical'; readonly path: string };
  readonly reliable: boolean;
  readonly reliability: ReliabilityBasis;
  /** Facts this one is calculated from (a dignity from the sign, an aspect from the house): one fact, not two independent ones. */
  readonly derivedFrom: readonly FactId[];
}
/**
 * A fact the birth time cannot support keeps its identity (so dependencies still resolve) but not its
 * value: `withheld: true` and no `value` property, which tells it apart from a value that is undefined.
 * With an approximate time the set of identities is the same at every moment of the birth date: a fact
 * that exists only under a condition (a Neecha Bhanga for a debilitated planet, a detected yoga) gets
 * its own identity only when that condition is stable; time-dependent yogas share one category identity.
 */
export type Fact = FactBase & ({ readonly withheld: false; readonly value: unknown } | { readonly withheld: true });

/** A read-only view of the facts: lookups and iteration only (no set/delete/clear, and no access to the store). */
export interface ReadonlyFacts extends Iterable<[FactId, Fact]> {
  readonly size: number;
  get(id: FactId): Fact | undefined;
  has(id: FactId): boolean;
  keys(): IterableIterator<FactId>;
  values(): IterableIterator<Fact>;
  entries(): IterableIterator<[FactId, Fact]>;
}

export interface FactIndex {
  readonly asOf: string;
  readonly approximate: boolean;
  readonly facts: ReadonlyFacts;
  get(id: FactId): Fact | undefined;
}

/** A frozen deep copy, so a fact never shares (or freezes) an array or object of the CanonicalChart. */
function frozenCopy<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  const copy: any = Array.isArray(v) ? v.map(frozenCopy) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, frozenCopy(x)]));
  return Object.freeze(copy);
}

function readonlyFacts(store: Map<FactId, Fact>): ReadonlyFacts {
  return Object.freeze({
    get size() { return store.size; },
    get: (id: FactId) => store.get(id),
    has: (id: FactId) => store.has(id),
    keys: () => store.keys(),
    values: () => store.values(),
    entries: () => store.entries(),
    [Symbol.iterator]: () => store.entries(),
  });
}

export function buildFactIndex(chart: CanonicalChart, asOf: Date): FactIndex {
  const approximate = chart.birth.timeAccuracy === 'approximate';
  const st = birthDayStability(chart);
  const facts = new Map<FactId, Fact>();
  const exact = (stable: boolean): ReliabilityBasis => (!approximate ? 'exact-birth-time' : stable ? 'stable-across-birth-date' : 'varies-across-birth-date');
  const lagnaBound: ReliabilityBasis = approximate ? 'requires-exact-birth-time' : 'exact-birth-time';
  const add = (id: FactId, category: FactCategory, subject: string, value: unknown, path: string, reliability: ReliabilityBasis, kind: Fact['provenance']['kind'] = 'canonical', derivedFrom: FactId[] = []) => {
    const reliable = reliability === 'exact-birth-time' || reliability === 'stable-across-birth-date';
    const base = { id, category, subject, provenance: Object.freeze({ kind, path }), reliable, reliability, derivedFrom: Object.freeze(derivedFrom) };
    // An unreliable fact's value is the placeholder-time value, so it is never handed out.
    facts.set(id, Object.freeze(reliable ? { ...base, withheld: false as const, value: frozenCopy(value) } : { ...base, withheld: true as const }));
  };

  for (const p of chart.planets) {
    const s = st.planets[p.name as Graha];
    add(fact.sign(p.name), 'planet.sign', p.name, p.sign, `planets[${p.name}].sign`, exact(s.sign));
    add(fact.house(p.name), 'planet.house', p.name, p.house, `planets[${p.name}].house`, lagnaBound);
  }
  for (const d of chart.strength.dignities) {
    const s = st.planets[d.planet];
    const dignityStable = s.sign && s.dignity;
    add(fact.dignity(d.planet), 'dignity', d.planet, d.dignity, `strength.dignities[${d.planet}].dignity`, exact(dignityStable), 'canonical', [fact.sign(d.planet)]);
    add(fact.combust(d.planet), 'combustion', d.planet, d.combust, `strength.dignities[${d.planet}].combust`, exact(s.combust));
    // Neecha Bhanga is judged from the Lagna; it exists only for a debilitated planet. Its presence
    // would say the planet is debilitated, so with an approximate time it exists only when that is stable.
    if (d.dignity === 'Debilitated' && (!approximate || dignityStable)) {
      add(fact.neechaBhanga(d.planet), 'neecha-bhanga', d.planet, !!d.neechaBhanga, `strength.dignities[${d.planet}].neechaBhanga`, lagnaBound, 'canonical', [fact.dignity(d.planet)]);
    }
  }
  // The Moon's paksha, read from the Sun and Moon longitudes exactly as the evidence engine reads it.
  const sun = chart.planets.find((p) => p.name === 'Sun')!.longitude;
  const moon = chart.planets.find((p) => p.name === 'Moon')!.longitude;
  // Not part of the birth-day stability check, so not claimed as stable for an approximate time.
  add(fact.paksha(), 'moon.paksha', 'Moon', ((moon - sun + 360) % 360) < 180 ? 'waxing' : 'waning', '(planets[Moon].longitude - planets[Sun].longitude) mod 360 < 180', lagnaBound, 'derived-from-canonical');
  for (const h of chart.houses) add(fact.lord(h.house), 'house.lord', String(h.house), h.lord, `houses[${h.house}].lord`, lagnaBound);
  for (const a of chart.aspects) add(fact.aspect(a.planet), 'aspect', a.planet, a.aspectsHouses, `aspects[${a.planet}].aspectsHouses`, lagnaBound, 'canonical', [fact.house(a.planet)]);
  chart.strength.ashtakavarga.savByHouse.forEach((b, i) => add(fact.sav(i + 1), 'sav.house', String(i + 1), b, `strength.ashtakavarga.savByHouse[${i}]`, lagnaBound));
  for (const [division, v] of Object.entries(chart.vargas)) {
    for (const p of v.placements) add(fact.varga(division, p.planet), 'varga.sign', `${division}:${p.planet}`, p.sign, `vargas.${division}.placements[${p.planet}].sign`, lagnaBound);
  }
  for (const p of chart.strength.shadbala.planets) add(fact.digBala(p.planet), 'shadbala.dig', p.planet, p.dig, `strength.shadbala.planets[${p.planet}].dig`, lagnaBound);
  // Chara karakas are ranked by degree, which moves through the birth date.
  for (const k of chart.jaimini.charaKarakas) add(fact.charaKaraka(k.karaka), 'jaimini.karaka', k.karaka, k.planet, `jaimini.charaKarakas[${k.karaka}].planet`, lagnaBound);
  for (const y of chart.yogas) {
    // A yoga the birth date can form or dissolve gets no identity of its own (see below).
    if (approximate && !yogaTimeStable(y.name, st)) continue;
    add(fact.yoga(y.name, y.planets), 'yoga', y.name, { planets: y.planets, cancelled: !!y.cancelled }, `yogas[${y.name}:${y.planets.join(',')}]`, exact(yogaTimeStable(y.name, st)));
  }
  // Present for every approximate chart, whatever the placeholder time formed, so its presence says nothing.
  if (approximate) add(fact.timeDependentYogas(), 'yoga', 'time-dependent', null, 'yogas[formed from the Lagna, houses, lords or signs the birth date moves]', 'requires-exact-birth-time');
  for (const d of chart.doshas) {
    const stable = d.id === 'kaalSarp' ? st.doshas.kaalSarp : d.id === 'pitru' ? st.doshas.pitru : d.id === 'vishaYoga' ? st.doshas.vishaYoga : false;
    add(fact.dosha(d.id), 'dosha', d.id, { present: d.present, cancelledBy: d.cancelledBy ?? [] }, `doshas[${d.id}]`, d.id === 'mangal' ? lagnaBound : exact(stable));
  }
  const rp = runningPeriod(chart, asOf);
  if (rp) {
    const stable = dashaTimingStable(chart, asOf);
    add(fact.running('mahadasha', asOf), 'dasha.running', 'mahadasha', rp.mahadasha, `dashas.vimshottari.mahadashas[as of ${asOf.toISOString()}].lord`, exact(stable.mahadasha), 'derived-from-canonical');
    if (rp.antardasha) add(fact.running('antardasha', asOf), 'dasha.running', 'antardasha', rp.antardasha, `dashas.vimshottari.mahadashas[…].antardashas[as of ${asOf.toISOString()}].lord`, exact(stable.antardasha), 'derived-from-canonical');
  }
  return Object.freeze({ asOf: asOfKey(asOf), approximate, facts: readonlyFacts(facts), get: (id: FactId) => facts.get(id) });
}
