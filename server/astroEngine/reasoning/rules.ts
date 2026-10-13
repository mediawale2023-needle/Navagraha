/**
 * Registry of the evidence engine's rules. Every evidence item names the rule that produced it.
 * The registry describes the rules as they are coded in evidence/engine.ts; it does not change them.
 *
 * validation: no rule has a documented classical validation yet (the engine's rules are stated as
 * textbook principles without verse citations), so every rule is 'unvalidated' until one is recorded.
 */
import type { EvidenceProvenance } from '@shared/v3/evidence';

export type RuleValidation = 'unvalidated' | 'documented';

export interface RuleDefinition {
  id: string;
  version: number;
  /** The provenance class the rule uses by default (an item may carry a narrower one). */
  provenance: EvidenceProvenance;
  validation: RuleValidation;
  /** Where the validation is documented, when it is. */
  reference?: string;
  description: string;
}

const rule = (id: string, provenance: EvidenceProvenance, description: string): RuleDefinition =>
  Object.freeze({ id, version: 1, provenance, validation: 'unvalidated', description });

/** Frozen, entries included: the registry is shared by every request. */
export const RULES: readonly Readonly<RuleDefinition>[] = Object.freeze([
  rule('house.lord-placement.own-house', 'classical-principle', 'A house lord in its own house strengthens that house.'),
  rule('house.lord-placement.kendra-trikona', 'classical-principle', 'A house lord in a kendra or trikona supports the house it rules.'),
  rule('house.lord-placement.eleventh', 'classical-principle', 'A house lord in the 11th brings results through gains.'),
  rule('house.lord-placement.dusthana', 'classical-principle', 'A house lord in a dusthana weakens or delays the house it rules.'),
  rule('house.lord-placement.foreign-twelfth', 'derived-rule', 'For foreign matters, a 9th/12th-related lord in the 12th is read as a link to distant places.'),
  rule('house.lord-dignity', 'classical-principle', "A house lord's dignity (and combustion, or a cancelled debilitation) colours the house it rules."),
  rule('house.occupant.foreign-rahu-moon', 'modern-convention', 'Rahu or the Moon in the 9th or 12th is read as an inclination towards foreign lands.'),
  rule('house.occupant.spiritual-ketu', 'derived-rule', 'Ketu in the 12th is read as spiritual inclination.'),
  rule('house.occupant.debilitated', 'classical-principle', 'A debilitated occupant without cancellation cannot support the house.'),
  rule('house.occupant.natural-benefic', 'classical-principle', 'A natural benefic occupant supports the house.'),
  rule('house.occupant.malefic-upachaya', 'classical-principle', 'A natural malefic in an upachaya house gives growth through effort.'),
  rule('house.occupant.malefic', 'classical-principle', 'A natural malefic outside the upachaya houses brings friction or delay.'),
  rule('house.aspect.jupiter', 'classical-principle', "Jupiter's aspect protects the house it falls on."),
  rule('house.aspect.saturn-mars', 'classical-principle', "Saturn's or Mars's aspect on a non-upachaya house adds pressure or friction."),
  rule('house.sav', 'derived-rule', 'Sarvashtakavarga bindus of the house, read by the shared policy (shared/v3/ashtakavargaPolicy.ts).'),
  rule('house.lord-dig-bala', 'classical-principle', "The house lord's Dig Bala (one Shadbala component) near its maximum or zero."),
  rule('varga.lord-dignity', 'classical-principle', 'A house lord exalted, in its own sign or debilitated in the divisional chart for the area.'),
  rule('varga.vargottama', 'classical-principle', 'A house lord in the same sign in the Rasi and the Navamsa.'),
  rule('karaka.dignity', 'classical-principle', "A natural significator's dignity colours the area."),
  rule('jaimini.karaka-dignity', 'derived-rule', "The Jaimini chara karaka for the area, judged by its sign dignity (a second system; never decides)."),
  rule('yoga.kemadruma', 'classical-principle', 'An uncancelled Kemadruma Yoga is read as a need for steadier emotional support.'),
  rule('yoga.domain', 'classical-principle', 'A recognised yoga mapped to the areas it promises (common yogas are context only).'),
  rule('domain.foreign.ninth-twelfth-link', 'derived-rule', 'A link between the 9th and 12th lords is read as travel or residence abroad.'),
  rule('domain.wealth.eleventh-twelfth-bindus', 'derived-rule', 'More bindus in the 11th than the 12th is read as income exceeding outgo.'),
  rule('domain.relationships.mangal-dosha', 'modern-convention', 'An uncancelled Mangal Dosha is a mild partnership indicator.'),
  rule('domain.children.jupiter-trine-moon', 'derived-rule', 'Jupiter in a trine from the Moon supports children.'),
  rule('dasha.running-lord', 'classical-principle', 'A running Mahadasha or Antardasha lord brings forward the areas it rules, occupies or signifies; how well depends on its condition.'),
]);

const BY_ID = new Map(RULES.map((r) => [r.id, r]));
export function ruleById(id: string): Readonly<RuleDefinition> | undefined { return BY_ID.get(id); }
