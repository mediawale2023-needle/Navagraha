/**
 * Fact identifiers for the reasoning layer. A fact id names one calculated value of the
 * CanonicalChart (or one value read directly from it); the same id always names the same fact.
 * Pure string builders, so the evidence engine can declare its inputs without importing the index.
 */
export type FactCategory =
  | 'planet.sign' | 'planet.house' | 'dignity' | 'combustion' | 'neecha-bhanga' | 'moon.paksha'
  | 'house.lord' | 'aspect' | 'sav.house' | 'varga.sign' | 'shadbala.dig' | 'jaimini.karaka'
  | 'yoga' | 'dosha' | 'dasha.running';
export type FactId = `${FactCategory}:${string}`;

/** The one date normalisation for time-bound facts: the instant in UTC, to the millisecond (periods can change within a day). */
export const asOfKey = (asOf: Date): string => asOf.toISOString();

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const fact = {
  sign: (planet: string): FactId => `planet.sign:${planet}`,
  house: (planet: string): FactId => `planet.house:${planet}`,
  dignity: (planet: string): FactId => `dignity:${planet}`,
  combust: (planet: string): FactId => `combustion:${planet}`,
  neechaBhanga: (planet: string): FactId => `neecha-bhanga:${planet}`,
  paksha: (): FactId => 'moon.paksha:Moon',
  lord: (house: number): FactId => `house.lord:${house}`,
  aspect: (planet: string): FactId => `aspect:${planet}`,
  sav: (house: number): FactId => `sav.house:${house}`,
  varga: (division: string, planet: string): FactId => `varga.sign:${division}:${planet}`,
  digBala: (planet: string): FactId => `shadbala.dig:${planet}`,
  charaKaraka: (karaka: string): FactId => `jaimini.karaka:${karaka}`,
  /** One detected yoga: its name and the planets that form it (the same name can form more than once). */
  yoga: (name: string, planets: string[]): FactId => `yoga:${slug(name)}:${planets.map(slug).join('-')}`,
  /**
   * With an approximate birth time, every yoga the birth date can form or dissolve shares this one
   * identity: a per-yoga id would itself say which yogas the placeholder time happened to form.
   */
  timeDependentYogas: (): FactId => 'yoga:time-dependent',
  dosha: (id: string): FactId => `dosha:${id}`,
  /** The period running at one instant. The instant is part of the id (asOfKey), so a timing fact never matches another date. */
  running: (level: 'mahadasha' | 'antardasha', asOf: Date): FactId => `dasha.running:${level}@${asOfKey(asOf)}`,
};

/**
 * How an evidence item depends on a fact.
 * - direct: the fact decides the item's direction (the lord's dignity, the house's bindus, the occupant's house).
 * - derived: the fact enters through a combination of facts (a yoga's defining conditions, a period lord's overall condition).
 * - gate: the fact decides only whether, or how strongly, the rule applies — never which way it points
 *   (an occupant's dignity read to rule debilitation out; the houses that weaken a yoga formed in dusthanas).
 * - role: the fact only makes the planet or house relevant (it is the 10th lord, the Amatyakaraka, it occupies the house).
 * - timing: the fact says the item is active now (the running Mahadasha or Antardasha).
 */
export type DependencyType = 'direct' | 'derived' | 'gate' | 'role' | 'timing';

export type EvidenceRole =
  | 'house-lord' | 'occupant' | 'aspecting-planet' | 'house-bindus' | 'divisional-lord' | 'karaka'
  | 'chara-karaka' | 'yoga' | 'domain-combination' | 'period-lord';
