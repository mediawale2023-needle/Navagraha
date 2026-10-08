/**
 * Evidence Engine — deterministic, rule-encoded evidence per life domain,
 * built ONLY from CanonicalChart facts. No LLM is involved; the AI later
 * explains these items but cannot add to them.
 *
 * Every item states the general rule, the chart-specific fact, its source
 * (D1/D9/D10/…), its provenance class, and whether it depends on an exact
 * birth time. Rules are textbook principles described in plain words —
 * no chapter/verse citations are claimed.
 */
import type { CanonicalChart, Graha, SevenGraha } from '@shared/v3/canonical';
import {
  DOMAIN_LABELS, LIFE_DOMAINS, type EvidenceItem, type EvidenceDirection, type EvidenceProvenance,
  type EvidenceSource, type EvidenceStrength, type EvidenceTier, type LifeDomain,
} from '@shared/v3/evidence';
import { signDignity } from '../dignity.js';
import { vimshottariDasha } from '../dasha.js';

export const KENDRA = [1, 4, 7, 10];
export const TRIKONA = [1, 5, 9];
export const DUSTHANA = [6, 8, 12];
export const UPACHAYA = [3, 6, 10, 11];

export interface DomainSpec {
  houses: number[];
  karakas: Graha[];
  varga?: 'D4' | 'D7' | 'D9' | 'D10';
  jaimini?: { karaka: string; label: string };
  themes: string[];
}

export const DOMAIN_SPECS: Record<LifeDomain, DomainSpec> = {
  career: { houses: [10], karakas: ['Saturn', 'Sun'], varga: 'D10', jaimini: { karaka: 'Amatyakaraka', label: 'Amatyakaraka (career significator)' }, themes: ['work and responsibility', 'professional reputation'] },
  wealth: { houses: [2, 11], karakas: ['Jupiter', 'Venus'], themes: ['income and savings', 'material gains'] },
  relationships: { houses: [7], karakas: ['Venus'], varga: 'D9', jaimini: { karaka: 'Daarakaraka', label: 'Daarakaraka (spouse significator)' }, themes: ['partnership and marriage', 'close relationships'] },
  leadership: { houses: [10, 1], karakas: ['Sun', 'Mars'], varga: 'D10', themes: ['authority and status', 'self-assertion'] },
  property: { houses: [4], karakas: ['Mars', 'Moon'], varga: 'D4', themes: ['home and property', 'domestic stability'] },
  foreign: { houses: [12, 9], karakas: ['Rahu'], themes: ['travel and life abroad', 'distant connections'] },
  education: { houses: [4, 5], karakas: ['Mercury', 'Jupiter'], themes: ['learning and study', 'intellect'] },
  children: { houses: [5], karakas: ['Jupiter'], varga: 'D7', jaimini: { karaka: 'Putrakaraka', label: 'Putrakaraka (children significator)' }, themes: ['children and creativity'] },
  spirituality: { houses: [9, 12], karakas: ['Jupiter', 'Ketu'], jaimini: { karaka: 'Atmakaraka', label: 'Atmakaraka (soul significator)' }, themes: ['spiritual practice', 'inner growth'] },
};

const ORD = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const STRONG_DIGNITIES = ['Exalted', 'Own sign', 'Moolatrikona'];

export interface ChartIndex {
  chart: CanonicalChart;
  planet: (g: Graha) => CanonicalChart['planets'][number];
  lordOf: (house: number) => SevenGraha;
  houseSign: (house: number) => string;
  dignity: (g: Graha) => CanonicalChart['strength']['dignities'][number] | undefined;
  isBenefic: (g: Graha) => boolean;
  approximate: boolean;
  moonTimeSensitive: boolean;
}

export function indexChart(chart: CanonicalChart): ChartIndex {
  const byName = new Map(chart.planets.map((p) => [p.name, p]));
  const sun = byName.get('Sun')!.longitude;
  const moon = byName.get('Moon')!.longitude;
  const waxing = ((moon - sun + 360) % 360) < 180;
  const approximate = chart.birth.timeAccuracy === 'approximate';
  return {
    chart,
    planet: (g) => byName.get(g)!,
    lordOf: (h) => chart.houses[h - 1].lord,
    houseSign: (h) => chart.houses[h - 1].sign,
    dignity: (g) => chart.strength.dignities.find((d) => d.planet === g),
    // Natural benefics: Jupiter, Venus, Mercury, and the waxing Moon.
    isBenefic: (g) => g === 'Jupiter' || g === 'Venus' || g === 'Mercury' || (g === 'Moon' && waxing),
    approximate,
    moonTimeSensitive: approximate && !chart.uncertainty.moonSignStableAcrossBirthDate,
  };
}

class Collector {
  items: EvidenceItem[] = [];
  constructor(private ix: ChartIndex, private domain: LifeDomain) {}
  add(e: {
    factor: string; planet?: Graha; house?: number; direction: EvidenceDirection; strength: EvidenceStrength;
    source: EvidenceSource; provenance: EvidenceProvenance; rule: string; explanation: string; requiresBirthTime: boolean;
    tier?: EvidenceTier;
  }) {
    const id = `${this.domain}:${e.source}:${e.factor}:${e.planet ?? ''}:${e.house ?? ''}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-');
    if (this.items.some((i) => i.id === id)) return;
    // Second-system (Jaimini), partial-calculation (Shadbala) and convention-based items never decide a verdict.
    const tier: EvidenceTier = e.tier ?? (e.source === 'Jaimini' || e.source === 'Shadbala' || e.provenance === 'modern-convention' ? 'experimental' : 'core');
    this.items.push({ ...e, tier, id, domain: this.domain, usable: !(e.requiresBirthTime && this.ix.approximate) });
  }
}

function dignityDirection(d?: { dignity: string; combust: boolean; neechaBhanga?: boolean }): { direction: EvidenceDirection; strength: EvidenceStrength; text: string } | null {
  if (!d) return null;
  if (STRONG_DIGNITIES.includes(d.dignity)) return { direction: 'positive', strength: d.dignity === 'Exalted' ? 'strong' : 'moderate', text: d.dignity.toLowerCase() };
  if (d.dignity === 'Debilitated') {
    return d.neechaBhanga
      ? { direction: 'neutral', strength: 'moderate', text: 'debilitated, with the debilitation cancelled (Neecha Bhanga)' }
      : { direction: 'negative', strength: 'strong', text: 'debilitated' };
  }
  if (d.combust) return { direction: 'negative', strength: 'moderate', text: `in ${d.dignity.toLowerCase()} but combust (too close to the Sun)` };
  if (d.dignity === "Friend's sign") return { direction: 'positive', strength: 'weak', text: "in a friend's sign" };
  if (d.dignity === "Enemy's sign") return { direction: 'negative', strength: 'weak', text: "in an enemy's sign" };
  return null;
}

function houseRules(c: Collector, ix: ChartIndex, domain: LifeDomain, h: number) {
  const { chart } = ix;
  const sign = ix.houseSign(h);
  const lord = ix.lordOf(h);
  const lordPos = ix.planet(lord);
  const lordHouse = lordPos.house;

  // 1. Lord placement (kendra/trikona/11th strengthen; 6th/8th/12th weaken).
  if (lordHouse === h) {
    c.add({ factor: `${ORD(h)} lord placement`, planet: lord, house: h, direction: 'positive', strength: 'moderate', source: 'D1', provenance: 'classical-principle',
      rule: 'A house lord occupying its own house protects and strengthens that house.',
      explanation: `The ${ORD(h)} house (${sign}) is ruled by ${lord}, which sits in the ${ORD(h)} house itself.`, requiresBirthTime: true });
  } else if (KENDRA.includes(lordHouse) || TRIKONA.includes(lordHouse)) {
    c.add({ factor: `${ORD(h)} lord placement`, planet: lord, house: h, direction: 'positive', strength: 'weak', source: 'D1', provenance: 'classical-principle',
      rule: 'A house lord placed in a kendra (1, 4, 7, 10) or trikona (1, 5, 9) supports the house it rules.',
      explanation: `${lord}, lord of the ${ORD(h)} house (${sign}), sits in the ${ORD(lordHouse)} house, a ${KENDRA.includes(lordHouse) ? 'kendra' : 'trikona'}.`, requiresBirthTime: true });
  } else if (lordHouse === 11) {
    c.add({ factor: `${ORD(h)} lord placement`, planet: lord, house: h, direction: 'positive', strength: 'weak', source: 'D1', provenance: 'classical-principle',
      rule: 'A house lord in the 11th (house of gains) tends to bring results through gains and networks.',
      explanation: `${lord}, lord of the ${ORD(h)} house, sits in the 11th house.`, requiresBirthTime: true });
  } else if (DUSTHANA.includes(lordHouse) && !DUSTHANA.includes(h)) {
    const foreignLink = domain === 'foreign' && lordHouse === 12;
    c.add({ factor: `${ORD(h)} lord placement`, planet: lord, house: h, direction: foreignLink ? 'positive' : 'negative', strength: 'moderate', source: 'D1',
      provenance: foreignLink ? 'derived-rule' : 'classical-principle', tier: foreignLink ? 'experimental' : 'core',
      rule: foreignLink ? 'A link between the 9th/12th lords and the 12th house is read as a link to distant places.'
        : 'A house lord placed in a dusthana (6, 8, 12) tends to weaken or delay the house it rules.',
      explanation: `${lord}, lord of the ${ORD(h)} house (${sign}), sits in the ${ORD(lordHouse)} house.`, requiresBirthTime: true });
  }

  // 2. Lord dignity.
  const dd = dignityDirection(ix.dignity(lord));
  if (dd) {
    c.add({ factor: `${ORD(h)} lord dignity`, planet: lord, house: h, direction: dd.direction, strength: dd.strength, source: 'D1', provenance: 'classical-principle',
      rule: 'A house lord in exaltation or its own sign delivers its house well; debilitation or combustion weakens it.',
      explanation: `${lord}, lord of the ${ORD(h)} house, is ${dd.text} in ${lordPos.sign}.`, requiresBirthTime: true });
  }

  // 3. Occupants.
  for (const occ of chart.houses[h - 1].occupants) {
    const benefic = ix.isBenefic(occ);
    const dig = ix.dignity(occ);
    const weakened = dig?.dignity === 'Debilitated' && !dig.neechaBhanga;
    if (domain === 'foreign' && (h === 12 || h === 9) && (occ === 'Rahu' || occ === 'Moon')) {
      c.add({ factor: `${occ} in the ${ORD(h)}`, planet: occ, house: h, direction: 'positive', strength: 'moderate', source: 'D1', provenance: 'modern-convention',
        rule: 'Rahu or the Moon in the 9th or 12th house is commonly read as an inclination towards foreign lands and travel.',
        explanation: `${occ} occupies the ${ORD(h)} house (${ix.houseSign(h)}).`, requiresBirthTime: true });
      continue;
    }
    if (domain === 'spirituality' && h === 12 && occ === 'Ketu') {
      c.add({ factor: 'Ketu in the 12th', planet: occ, house: h, direction: 'positive', strength: 'moderate', source: 'D1', provenance: 'derived-rule', tier: 'experimental',
        rule: 'Ketu, the significator of detachment, in the 12th house of release is read as spiritual inclination.',
        explanation: `Ketu occupies the 12th house (${ix.houseSign(h)}).`, requiresBirthTime: true });
      continue;
    }
    if (weakened) {
      c.add({ factor: `${occ} in the ${ORD(h)}`, planet: occ, house: h, direction: 'negative', strength: 'weak', source: 'D1', provenance: 'classical-principle',
        rule: 'A debilitated planet (without cancellation) occupying a house cannot deliver its support there.',
        explanation: `${occ} occupies the ${ORD(h)} house (${ix.houseSign(h)}) and is debilitated.`, requiresBirthTime: true });
    } else if (benefic) {
      c.add({ factor: `${occ} in the ${ORD(h)}`, planet: occ, house: h, direction: 'positive', strength: dig && STRONG_DIGNITIES.includes(dig.dignity) ? 'strong' : 'moderate', source: 'D1', provenance: 'classical-principle',
        rule: 'Natural benefics (Jupiter, Venus, Mercury, waxing Moon) occupying a house support its significations.',
        explanation: `${occ} occupies the ${ORD(h)} house (${ix.houseSign(h)}).`, requiresBirthTime: true });
    } else if (UPACHAYA.includes(h)) {
      // Weak: growth through effort over time, not ease — and it applies to every malefic in these houses.
      c.add({ factor: `${occ} in the ${ORD(h)}`, planet: occ, house: h, direction: 'positive', strength: 'weak', source: 'D1', provenance: 'classical-principle',
        rule: 'Natural malefics do well in upachaya houses (3, 6, 10, 11), where they give drive and growth over time, through effort.',
        explanation: `${occ} occupies the ${ORD(h)} house (${ix.houseSign(h)}), an upachaya house.`, requiresBirthTime: true });
    } else {
      c.add({ factor: `${occ} in the ${ORD(h)}`, planet: occ, house: h, direction: 'negative', strength: 'moderate', source: 'D1', provenance: 'classical-principle',
        rule: 'Natural malefics (Sun, Mars, Saturn, Rahu, Ketu, waning Moon) in a non-upachaya house tend to create friction or delay in its matters.',
        explanation: `${occ} occupies the ${ORD(h)} house (${ix.houseSign(h)}).`, requiresBirthTime: true });
    }
  }

  // 4. Aspects onto the house (Jupiter/Venus support; Saturn/Mars strain outside upachayas).
  for (const a of chart.aspects) {
    if (!a.aspectsHouses.includes(h) || chart.houses[h - 1].occupants.includes(a.planet)) continue;
    if (a.planet === 'Jupiter') {
      c.add({ factor: `Jupiter's aspect on the ${ORD(h)}`, planet: 'Jupiter', house: h, direction: 'positive', strength: 'weak', source: 'D1', provenance: 'classical-principle',
        rule: "Jupiter's aspect protects and expands the house it falls on.", explanation: `Jupiter (in the ${ORD(ix.planet('Jupiter').house)}) aspects the ${ORD(h)} house.`, requiresBirthTime: true });
    } else if ((a.planet === 'Saturn' || a.planet === 'Mars') && !UPACHAYA.includes(h)) {
      c.add({ factor: `${a.planet}'s aspect on the ${ORD(h)}`, planet: a.planet, house: h, direction: 'negative', strength: 'weak', source: 'D1', provenance: 'classical-principle',
        rule: `${a.planet}'s aspect on a non-upachaya house tends to add ${a.planet === 'Saturn' ? 'delay and pressure' : 'friction and haste'}.`,
        explanation: `${a.planet} (in the ${ORD(ix.planet(a.planet).house)}) aspects the ${ORD(h)} house.`, requiresBirthTime: true });
    }
  }

  // 5. Sarvashtakavarga bindus of the house (average ≈ 28 = 337/12).
  const sav = chart.strength.ashtakavarga.savByHouse[h - 1];
  const savItem = (direction: EvidenceDirection, strength: EvidenceStrength, verdict: string) => c.add({
    factor: `${ORD(h)} house Sarvashtakavarga`, house: h, direction, strength, source: 'Ashtakavarga', provenance: 'derived-rule',
    rule: 'Sarvashtakavarga averages about 28 bindus per house; 32 or more supports the house, 24 or fewer strains it.',
    explanation: `The ${ORD(h)} house (${ix.houseSign(h)}) has ${sav} bindus — ${verdict}.`, requiresBirthTime: true,
  });
  // Symmetric bands around the ~28 average.
  if (sav >= 36) savItem('positive', 'strong', 'well above average');
  else if (sav >= 32) savItem('positive', 'moderate', 'above average');
  else if (sav <= 20) savItem('negative', 'strong', 'well below average');
  else if (sav <= 24) savItem('negative', 'moderate', 'below average');

  // 6. Directional strength of the house lord (partial Shadbala).
  const sb = chart.strength.shadbala.planets.find((p) => p.planet === lord);
  if (sb && sb.dig >= 45) {
    c.add({ factor: `${ORD(h)} lord Dig Bala`, planet: lord, house: h, direction: 'positive', strength: 'weak', source: 'Shadbala', provenance: 'classical-principle',
      rule: 'Dig Bala (directional strength, one Shadbala component) near its maximum adds strength to the planet.',
      explanation: `${lord}, lord of the ${ORD(h)}, has ${sb.dig.toFixed(1)} of 60 virupas of Dig Bala.`, requiresBirthTime: true });
  } else if (sb && sb.dig <= 15) {
    c.add({ factor: `${ORD(h)} lord Dig Bala`, planet: lord, house: h, direction: 'negative', strength: 'weak', source: 'Shadbala', provenance: 'classical-principle',
      rule: 'Dig Bala (directional strength, one Shadbala component) near zero leaves the planet directionally weak.',
      explanation: `${lord}, lord of the ${ORD(h)}, has only ${sb.dig.toFixed(1)} of 60 virupas of Dig Bala.`, requiresBirthTime: true });
  }
}

function vargaRules(c: Collector, ix: ChartIndex, h: number, varga: NonNullable<DomainSpec['varga']>) {
  const lord = ix.lordOf(h);
  const v = ix.chart.vargas[varga];
  const placement = v.placements.find((p) => p.planet === lord)!;
  const d = signDignity(lord, placement.signIndex);
  const name = `${varga} (${v.name})`;
  if (d === 'Exalted' || d === 'Own sign') {
    c.add({ factor: `${ORD(h)} lord in ${varga}`, planet: lord, house: h, direction: 'positive', strength: d === 'Exalted' ? 'strong' : 'moderate', source: varga, provenance: 'classical-principle',
      rule: `A house lord that is also strong in the relevant divisional chart confirms the promise of that house.`,
      explanation: `${lord}, lord of the ${ORD(h)}, is ${d.toLowerCase()} in the ${name} (${placement.sign}).`, requiresBirthTime: true });
  } else if (d === 'Debilitated') {
    c.add({ factor: `${ORD(h)} lord in ${varga}`, planet: lord, house: h, direction: 'negative', strength: 'moderate', source: varga, provenance: 'classical-principle',
      rule: `A house lord debilitated in the relevant divisional chart weakens the promise of that house.`,
      explanation: `${lord}, lord of the ${ORD(h)}, is debilitated in the ${name} (${placement.sign}).`, requiresBirthTime: true });
  }
  if (varga === 'D9' || varga === 'D10') {
    const d1Sign = ix.planet(lord).signIndex;
    if (ix.chart.vargas.D9.placements.find((p) => p.planet === lord)!.signIndex === d1Sign) {
      c.add({ factor: `${ORD(h)} lord vargottama`, planet: lord, house: h, direction: 'positive', strength: 'moderate', source: 'D9', provenance: 'classical-principle',
        rule: 'A planet occupying the same sign in the Rasi and Navamsa (vargottama) is considered strengthened.',
        explanation: `${lord}, lord of the ${ORD(h)}, is vargottama in ${ix.planet(lord).sign}.`, requiresBirthTime: true });
    }
  }
}

function karakaRules(c: Collector, ix: ChartIndex, spec: DomainSpec) {
  for (const k of spec.karakas) {
    if (k === 'Rahu' || k === 'Ketu') continue;
    const dd = dignityDirection(ix.dignity(k));
    if (!dd) continue;
    c.add({ factor: `${k} as significator`, planet: k, direction: dd.direction, strength: dd.strength === 'strong' ? 'moderate' : 'weak', source: 'D1', provenance: 'classical-principle',
      rule: `${k} is a natural significator (karaka) of this area; its strength colours the results.`,
      explanation: `${k} is ${dd.text} in ${ix.planet(k).sign}.`, requiresBirthTime: k === 'Moon' && ix.moonTimeSensitive });
  }
}

function jaiminiRule(c: Collector, ix: ChartIndex, spec: DomainSpec) {
  if (!spec.jaimini) return;
  const kar = ix.chart.jaimini.charaKarakas.find((k) => k.karaka === spec.jaimini!.karaka);
  if (!kar || kar.planet === 'Rahu' || kar.planet === 'Ketu') return;
  const dd = dignityDirection(ix.dignity(kar.planet));
  if (!dd || dd.direction === 'neutral') return;
  c.add({ factor: spec.jaimini.label, planet: kar.planet, direction: dd.direction, strength: 'weak', source: 'Jaimini', provenance: 'derived-rule',
    rule: 'The Jaimini chara karaka for this area, judged by its sign dignity, adds a second-system view.',
    explanation: `${kar.planet} is the ${spec.jaimini.label} and is ${dd.text} in ${ix.planet(kar.planet).sign}.`,
    requiresBirthTime: ix.approximate && kar.planet === 'Moon' });
}

// `common`: combinations present in roughly a third or more of charts (measured over the 44 golden
// charts: Raja 68%, Budha-Aditya 52%, Vipreeta 43%, Gajakesari 36%) cannot discriminate, so they
// are shown as experimental context but never decide a verdict.
const YOGA_DOMAINS: Array<{ match: RegExp; domains: LifeDomain[]; lagnaDependent: boolean; common?: boolean }> = [
  { match: /^Raja Yoga$/, domains: ['career', 'leadership'], lagnaDependent: true, common: true },
  { match: /Neecha Bhanga Raja Yoga/, domains: ['career', 'leadership'], lagnaDependent: true },
  { match: /Vipreeta Raja Yoga/, domains: ['career'], lagnaDependent: true, common: true },
  { match: /^Dhana Yoga$/, domains: ['wealth'], lagnaDependent: true },
  { match: /^Ruchaka Yoga$/, domains: ['leadership', 'property'], lagnaDependent: true },
  { match: /^Bhadra Yoga$/, domains: ['education', 'career'], lagnaDependent: true },
  { match: /^Hamsa Yoga$/, domains: ['spirituality', 'education', 'children'], lagnaDependent: true },
  { match: /^Malavya Yoga$/, domains: ['relationships', 'wealth'], lagnaDependent: true },
  { match: /^Sasa Yoga$/, domains: ['leadership', 'career'], lagnaDependent: true },
  { match: /^Gajakesari Yoga$/, domains: ['wealth', 'leadership', 'education'], lagnaDependent: false, common: true },
  { match: /^Budha-Aditya Yoga$/, domains: ['education', 'career'], lagnaDependent: false, common: true },
  { match: /^Chandra-Mangala Yoga$/, domains: ['wealth'], lagnaDependent: false },
];

function yogaRules(c: Collector, ix: ChartIndex, domain: LifeDomain) {
  const seen = new Set<string>();
  for (const y of ix.chart.yogas) {
    if (y.name === 'Kemadruma Yoga') {
      if (domain === 'relationships' && !y.cancelled) {
        c.add({ factor: 'Kemadruma Yoga', planet: 'Moon', direction: 'negative', strength: 'weak', source: 'Yoga', provenance: 'classical-principle',
          rule: 'An isolated Moon (Kemadruma, uncancelled) is traditionally read as needing steadier emotional support.',
          explanation: y.description, requiresBirthTime: ix.moonTimeSensitive });
      }
      continue;
    }
    const map = YOGA_DOMAINS.find((m) => m.match.test(y.name));
    // One item per yoga name per domain: repeated formations confirm, they do not multiply.
    const family = y.name.replace(/^(Harsha|Sarala|Vimala) /, '');
    if (!map || !map.domains.includes(domain) || y.cancelled || seen.has(family)) continue;
    seen.add(family);
    const primary = map.domains[0] === domain;
    // A yoga formed wholly in dusthanas (other than Vipreeta, which is defined there) gives diminished results.
    const inDusthana = !/Vipreeta/.test(y.name) && y.planets.length > 0 && y.planets.every((p) => DUSTHANA.includes(ix.planet(p as Graha).house));
    // Lord-union yogas (Raja/Dhana) are frequent; full strength only when they form in a kendra or trikona.
    const unionHouse = /^(Raja|Dhana) Yoga$/.test(y.name) ? ix.planet(y.planets[0] as Graha).house : null;
    const angular = unionHouse === null || KENDRA.includes(unionHouse) || TRIKONA.includes(unionHouse);
    const strength: EvidenceStrength = inDusthana || map.common ? 'weak' : primary && angular ? 'strong' : 'moderate';
    const others = ix.chart.yogas.filter((o) => o.name.replace(/^(Harsha|Sarala|Vimala) /, '') === family && !o.cancelled).length;
    c.add({ factor: y.name, planet: y.planets[0] as Graha | undefined, direction: 'positive', strength, source: 'Yoga',
      provenance: primary ? 'classical-principle' : 'derived-rule', tier: map.common ? 'experimental' : 'core',
      rule: `${y.name} is a recognised combination; it is a promise that matures when its planets' periods run${inDusthana ? ', and it is weakened when formed in the 6th, 8th or 12th house' : ''}.`,
      explanation: `${y.description}${others > 1 ? ` (${others} such combinations are present.)` : ''}`, requiresBirthTime: map.lagnaDependent || ix.moonTimeSensitive });
  }
}

function domainSpecificRules(c: Collector, ix: ChartIndex, domain: LifeDomain) {
  const { chart } = ix;
  if (domain === 'foreign') {
    const l9 = ix.lordOf(9), l12 = ix.lordOf(12);
    const h9 = ix.planet(l9).house, h12 = ix.planet(l12).house;
    if (h12 === 9 || h9 === 12 || (h9 === h12 && l9 !== l12)) {
      c.add({ factor: '9th–12th lord link', planet: l12, direction: 'positive', strength: 'moderate', source: 'D1', provenance: 'derived-rule', tier: 'experimental',
        rule: 'A connection between the 9th (long journeys) and 12th (distant lands) lords is read as foreign travel or residence.',
        explanation: `The 9th lord ${l9} is in the ${ORD(h9)} and the 12th lord ${l12} is in the ${ORD(h12)}.`, requiresBirthTime: true });
    }
  }
  if (domain === 'wealth') {
    const sav = chart.strength.ashtakavarga.savByHouse;
    const [s11, s12] = [sav[10], sav[11]];
    c.add({ factor: '11th vs 12th bindus', direction: s11 > s12 ? 'positive' : s11 < s12 ? 'negative' : 'neutral', strength: 'weak', source: 'Ashtakavarga', provenance: 'derived-rule', tier: 'experimental',
      rule: 'In Ashtakavarga, more bindus in the 11th (gains) than the 12th (expenses) is read as income exceeding outgo.',
      explanation: `The 11th house has ${s11} bindus and the 12th has ${s12}.`, requiresBirthTime: true });
  }
  if (domain === 'relationships') {
    const mangal = chart.doshas.find((d) => d.id === 'mangal');
    if (mangal?.present) {
      c.add({ factor: 'Mangal Dosha (house rule)', planet: 'Mars', direction: 'negative', strength: 'weak', source: 'D1', provenance: 'modern-convention',
        rule: 'Mars in houses 1, 2, 4, 7, 8 or 12 is conventionally flagged for partnership compatibility; cancellation conditions are not evaluated here, so this is a mild, unconfirmed indicator.',
        explanation: mangal.rule, requiresBirthTime: true });
    }
  }
  if (domain === 'children') {
    const jupFromMoon = ((ix.planet('Jupiter').signIndex - ix.planet('Moon').signIndex + 12) % 12) + 1;
    if ([1, 5, 9].includes(jupFromMoon)) {
      c.add({ factor: 'Jupiter in trine from the Moon', planet: 'Jupiter', direction: 'positive', strength: 'weak', source: 'D1', provenance: 'derived-rule', tier: 'experimental',
        rule: 'Jupiter, significator of children, in a trine from the Moon supports this area when judged from the Moon as well as the Lagna.',
        explanation: `Jupiter is ${ORD(jupFromMoon)} from the Moon.`, requiresBirthTime: ix.moonTimeSensitive });
    }
  }
}

/** Natal evidence for one domain (time-independent of "today"). */
export function natalEvidence(chart: CanonicalChart, domain: LifeDomain, ix = indexChart(chart)): EvidenceItem[] {
  const spec = DOMAIN_SPECS[domain];
  const c = new Collector(ix, domain);
  for (const h of spec.houses) houseRules(c, ix, domain, h);
  if (spec.varga) vargaRules(c, ix, spec.houses[0], spec.varga);
  karakaRules(c, ix, spec);
  jaiminiRule(c, ix, spec);
  yogaRules(c, ix, domain);
  domainSpecificRules(c, ix, domain);
  return c.items;
}

/** Domains a planet activates when its dasha runs: houses it rules or occupies, or its natural significations. */
export function planetDomainLinks(ix: ChartIndex, planet: Graha): Array<{ domain: LifeDomain; reasons: string[]; requiresBirthTime: boolean }> {
  const out: Array<{ domain: LifeDomain; reasons: string[]; requiresBirthTime: boolean }> = [];
  const pos = ix.planet(planet);
  for (const d of LIFE_DOMAINS) {
    const spec = DOMAIN_SPECS[d];
    const reasons: string[] = [];
    let timeDependent = false;
    for (const h of spec.houses) {
      if (ix.lordOf(h) === planet) { reasons.push(`${planet} rules the ${ORD(h)} house`); timeDependent = true; }
      if (pos.house === h) { reasons.push(`${planet} occupies the ${ORD(h)} house`); timeDependent = true; }
    }
    if (spec.karakas.includes(planet)) reasons.push(`${planet} is a natural significator of ${DOMAIN_LABELS[d].toLowerCase()}`);
    if (reasons.length) out.push({ domain: d, reasons, requiresBirthTime: timeDependent && reasons.every((r) => !r.includes('significator')) });
  }
  return out;
}

/** How well a period lord can deliver: its dignity and house placement. */
export function planetCondition(ix: ChartIndex, planet: Graha): { direction: EvidenceDirection; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const dig = ix.dignity(planet);
  if (dig) {
    if (STRONG_DIGNITIES.includes(dig.dignity)) { score += 2; reasons.push(`${planet} is ${dig.dignity.toLowerCase()}`); }
    else if (dig.dignity === 'Debilitated' && !dig.neechaBhanga) { score -= 2; reasons.push(`${planet} is debilitated`); }
    if (dig.combust) { score -= 1; reasons.push(`${planet} is combust`); }
  }
  const h = ix.planet(planet).house;
  if (!ix.approximate) {
    if (KENDRA.includes(h) || TRIKONA.includes(h)) { score += 1; reasons.push(`${planet} sits in the ${ORD(h)} house`); }
    else if (DUSTHANA.includes(h)) { score -= 1; reasons.push(`${planet} sits in the ${ORD(h)} house (a dusthana)`); }
  }
  return { direction: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral', reasons };
}

export interface RunningPeriod { mahadasha: Graha; antardasha: Graha | null; mahaStart: string; mahaEnd: string; antarStart?: string; antarEnd?: string }

export function runningPeriod(chart: CanonicalChart, asOf: Date): RunningPeriod | null {
  const t = asOf.getTime();
  const maha = chart.dashas.vimshottari.mahadashas.find((m) => Date.parse(m.start) <= t && t < Date.parse(m.end));
  if (!maha) return null;
  const antar = maha.antardashas.find((a) => Date.parse(a.start) <= t && t < Date.parse(a.end)) ?? null;
  return { mahadasha: maha.lord, antardasha: antar?.lord ?? null, mahaStart: maha.start, mahaEnd: maha.end, antarStart: antar?.start, antarEnd: antar?.end };
}

/**
 * With an approximate birth time, is the period running on `asOf` the same for every
 * possible birth moment on the birth date? Moon longitude is advanced linearly at its
 * birth speed (error < 0.1° within a day) and the Vimshottari calendar recomputed.
 */
export function dashaTimingStable(chart: CanonicalChart, asOf: Date): { mahadasha: boolean; antardasha: boolean } {
  if (chart.birth.timeAccuracy !== 'approximate') return { mahadasha: true, antardasha: true };
  const moon = chart.planets.find((p) => p.name === 'Moon')!;
  const birthMs = Date.parse(chart.birth.birthUTC);
  const [hh, mm, ss] = chart.birth.localTime.split(':').map(Number);
  const sinceMidnightH = hh + mm / 60 + ss / 3600;
  const t = asOf.getTime();
  const running = (deltaH: number) => {
    const v = vimshottariDasha(moon.longitude + moon.speed * deltaH / 24, new Date(birthMs + deltaH * 3_600_000));
    const maha = v.mahadashas.find((m) => Date.parse(m.start) <= t && t < Date.parse(m.end));
    const antar = maha?.antardashas.find((a) => Date.parse(a.start) <= t && t < Date.parse(a.end));
    return { maha: maha?.lord ?? null, antar: antar?.lord ?? null };
  };
  const nominal = running(0);
  let mahadasha = true, antardasha = true;
  // Every hour across the local birth date, plus its two ends.
  const offsets = [-sinceMidnightH, 24 - sinceMidnightH - 1 / 3600];
  for (let h = Math.ceil(-sinceMidnightH); h < 24 - sinceMidnightH; h++) offsets.push(h);
  for (const d of offsets) {
    const r = running(d);
    if (r.maha !== nominal.maha) mahadasha = false;
    if (r.maha !== nominal.maha || r.antar !== nominal.antar) antardasha = false;
  }
  return { mahadasha, antardasha };
}

/** Timing evidence: how the running Mahadasha/Antardasha lords engage a domain as of `asOf`. */
export function dashaEvidence(chart: CanonicalChart, domain: LifeDomain, asOf: Date, ix = indexChart(chart)): EvidenceItem[] {
  const rp = runningPeriod(chart, asOf);
  if (!rp) return [];
  const c = new Collector(ix, domain);
  // With an approximate time, a period is used only if it is running whatever the actual birth moment was.
  const stable = dashaTimingStable(chart, asOf);
  const lords: Array<[Graha, 'Mahadasha' | 'Antardasha', EvidenceStrength, boolean]> = [[rp.mahadasha, 'Mahadasha', 'moderate', !stable.mahadasha]];
  if (rp.antardasha && rp.antardasha !== rp.mahadasha) lords.push([rp.antardasha, 'Antardasha', 'weak', !stable.antardasha]);
  for (const [lord, level, strength, timeSensitive] of lords) {
    const link = planetDomainLinks(ix, lord).find((l) => l.domain === domain);
    if (!link) continue;
    const cond = planetCondition(ix, lord);
    c.add({ factor: `Running ${level}`, planet: lord, direction: cond.direction, strength, source: 'Dasha', provenance: 'classical-principle',
      rule: 'A planet brings forward the houses it rules and occupies, and its own significations, during its Vimshottari period; how well depends on its strength.',
      explanation: `The ${lord} ${level} is running. ${link.reasons.join('; ')}.${cond.reasons.length ? ` ${cond.reasons.join('; ')}.` : ''}`,
      requiresBirthTime: link.requiresBirthTime || timeSensitive });
  }
  return c.items;
}
