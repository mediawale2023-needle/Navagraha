/**
 * Reconciliation policies (shadow mode, internal only): each names an interpretation question the
 * reasoning layer found, the rule the engine applies today, a proposed reading and its support.
 * Nothing here changes the production engine, and nothing here can be switched on from here.
 *
 * Three separate statuses, never collapsed into one:
 * - technical: `validated` when the treatment is implemented and reproduced by tests;
 *   `not-implemented` when no treatment is computable without inventing a rule.
 * - classical: `validated` only with a verified primary text or qualified expert review (none yet);
 *   `provisional` with secondary support or internal consistency only; `unresolved` without a basis.
 * - production eligibility: always `not-approved`. Activation needs primary-text validation or
 *   qualified expert review and an explicit decision outside this module.
 *
 * The shadow role says what a policy may do in the comparison: `provisional-candidate` (shapes the
 * proposed shadow verdict — only a technically validated policy that resolves a contradiction between
 * two registered engine rules), `what-if` (a diagnostic verdict, reported apart), `diagnostic`
 * (reported, no verdict) or `flag-only`.
 *
 * Sources: the primary texts (BPHS, Laghu Parashari) could not be consulted verse by verse while this
 * was written. No verse, chapter number or quotation is claimed; secondary commentary is named as such.
 */
export type TechnicalStatus = 'validated' | 'not-implemented';
export type ClassicalStatus = 'validated' | 'provisional' | 'unresolved';
export type ProductionEligibility = 'not-approved';
export type ShadowRole = 'provisional-candidate' | 'what-if' | 'diagnostic' | 'flag-only';
export type PolicyArea = 'functional-roles' | 'planetary-condition' | 'yoga' | 'dasha' | 'evidence-duplication';

export type PolicySource = Readonly<{
  kind: 'engine-rule' | 'secondary-commentary' | 'tradition-unverified' | 'resolver-semantics';
  reference: string;
}>;

export type ReconciliationPolicy = Readonly<{
  id: string;
  title: string;
  area: PolicyArea;
  technicalStatus: TechnicalStatus;
  classicalStatus: ClassicalStatus;
  productionEligibility: ProductionEligibility;
  shadowRole: ShadowRole;
  /** Why the policy has its shadow role. */
  shadowRoleReason: string;
  /** What must happen before it could be considered for production. */
  activationRequires: string;
  existingRule: string;
  proposedInterpretation: string;
  sources: readonly PolicySource[];
  exceptions: readonly string[];
  /** Whether applying it could change a verdict, or only remedies/diagnostics. */
  affects: 'verdicts' | 'remedies-only' | 'diagnostic-only';
  /** The shadow treatment it implies; 'none' when no treatment is computable without new rules. */
  treatment: 'neutralize-item' | 'count-once' | 'none';
  /** Confidence in the classical reading (not in the code, which tests cover). */
  confidence: 'high' | 'medium' | 'low';
  traditionsDisagree: boolean;
  /** Fact categories it needs; with an approximate time a policy needing withheld facts is inapplicable. */
  requires: readonly string[];
}>;

const p = (x: ReconciliationPolicy): ReconciliationPolicy => Object.freeze({ ...x, sources: Object.freeze(x.sources.map((s) => Object.freeze(s))), exceptions: Object.freeze(x.exceptions), requires: Object.freeze(x.requires) });

export const POLICIES: readonly ReconciliationPolicy[] = Object.freeze([
  p({
    id: 'own-house-lord-not-malefic-occupant',
    title: 'A planet occupying the house it rules is not read as a malefic occupant of that house',
    area: 'planetary-condition',
    technicalStatus: 'validated', classicalStatus: 'provisional', productionEligibility: 'not-approved', shadowRole: 'provisional-candidate',
    shadowRoleReason: 'Technically validated and it resolves a contradiction between two registered engine rules on one fact and house; its classical support is secondary only.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: 'house.lord-placement.own-house reads the lord in its own house as protecting it (positive), while house.occupant.malefic reads the same planet in the same house as friction (negative): two registered rules make opposite claims from one fact about one house (121 incompatible claims on seed 99).',
    proposedInterpretation: 'Where the occupant rules the house it occupies, the more specific own-house rule governs; the generic malefic-occupant item is treated as neutral (no harm counted). Its positive own-house item is unchanged and no new weight is added.',
    sources: [
      { kind: 'engine-rule', reference: "house.lord-placement.own-house: 'A house lord occupying its own house protects and strengthens that house.'" },
      { kind: 'resolver-semantics', reference: 'Rule specificity: a rule about the house\'s own lord is narrower than the generic natural-malefic rule for the same fact and house.' },
      { kind: 'secondary-commentary', reference: "BPHS-based commentary and a Tajika text (Hillaya Deepika) describe a house as strengthened by its own lord's presence or aspect; the 'even when malefic' case is not confirmed in a primary edition." },
    ],
    exceptions: ['Applies only to the house the occupant rules; a malefic occupying another house of the area is unchanged.', 'Rahu and Ketu own no house and are never covered.', 'The upachaya branch (already positive) is unchanged.'],
    affects: 'verdicts', treatment: 'neutralize-item', confidence: 'medium', traditionsDisagree: false,
    requires: ['house.lord', 'planet.house'],
  }),
  p({
    id: 'lord-aspect-on-own-house',
    title: "Saturn's or Mars's aspect on a house it rules is not read as pressure",
    area: 'planetary-condition',
    technicalStatus: 'validated', classicalStatus: 'provisional', productionEligibility: 'not-approved', shadowRole: 'what-if',
    shadowRoleReason: 'Technically validated, but no registered engine rule contradicts the aspect rule; secondary support only.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: "house.aspect.saturn-mars reads Saturn's or Mars's aspect on any non-upachaya house as pressure, including a house the aspecting planet rules.",
    proposedInterpretation: 'Treat the aspect as neutral when the aspecting planet rules the aspected house (diagnostic what-if only).',
    sources: [
      { kind: 'secondary-commentary', reference: "Commentary on BPHS bhava strength names the strength of a house's own lord among its supports; a Tajika text holds a house strong when aspected by its own lord." },
      { kind: 'tradition-unverified', reference: 'Whether a natural malefic lord\'s aspect protects without also pressuring is not confirmed in a primary edition.' },
    ],
    exceptions: ['Only the house the aspecting planet rules.'],
    affects: 'verdicts', treatment: 'neutralize-item', confidence: 'medium', traditionsDisagree: true,
    requires: ['house.lord', 'aspect', 'planet.house'],
  }),
  p({
    id: 'planet-dignity-once-per-area',
    title: "One planet's dignity counted once per life area",
    area: 'evidence-duplication',
    technicalStatus: 'validated', classicalStatus: 'provisional', productionEligibility: 'not-approved', shadowRole: 'what-if',
    shadowRoleReason: 'Technically validated, but classically the house, its lord and its karaka are separate factors; whether one planet in two roles counts once is not settled.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: "house.lord-dignity and karaka.dignity both apply dignityDirection to the same dignity fact; a planet that rules two houses of an area, or rules an area house and signifies the area, has that one reading counted two or three times.",
    proposedInterpretation: "Count the planet's dignity reading once per area (the strongest item), the rest neutral (diagnostic what-if only).",
    sources: [
      { kind: 'engine-rule', reference: "yoga.domain: 'One item per yoga name per domain: repeated formations confirm, they do not multiply.'" },
      { kind: 'resolver-semantics', reference: 'resolveDomain counts confirmations by independent source (confirmedBy), not by item.' },
      { kind: 'tradition-unverified', reference: 'Bhava analysis judges the house, its lord and its karaka as separate factors; whether one planet holding two of these roles counts once or twice is not settled.' },
    ],
    exceptions: ['A period lord\'s condition (timing) is not a natal dignity reading and is never merged.', 'Different planets are never merged.'],
    affects: 'verdicts', treatment: 'count-once', confidence: 'medium', traditionsDisagree: true,
    requires: ['dignity'],
  }),
  p({
    id: 'combust-strong-dignity',
    title: 'Combustion of a planet in exaltation, own sign or moolatrikona',
    area: 'planetary-condition',
    technicalStatus: 'not-implemented', classicalStatus: 'unresolved', productionEligibility: 'not-approved', shadowRole: 'flag-only',
    shadowRoleReason: 'No treatment is computable without a documented basis; flagged only.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: 'dignityDirection ignores combustion below a strong dignity (positive); planetCondition subtracts one for combustion (period capacity). The engine reads the same pair two ways.',
    proposedInterpretation: 'None proposed: neither the size nor the direction of the effect has a documented basis.',
    sources: [{ kind: 'tradition-unverified', reference: 'Combustion is widely held to weaken a planet; how it interacts with exaltation or own sign is not settled across sources.' }],
    exceptions: [], affects: 'verdicts', treatment: 'none', confidence: 'low', traditionsDisagree: true, requires: ['dignity', 'combustion'],
  }),
  p({
    id: 'neecha-bhanga-raja-yoga',
    title: 'A cancelled debilitation: neutral strength, or a Raja Yoga',
    area: 'yoga',
    technicalStatus: 'not-implemented', classicalStatus: 'unresolved', productionEligibility: 'not-approved', shadowRole: 'flag-only',
    shadowRoleReason: 'No treatment is computable without a documented basis; flagged only.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: 'Lord/karaka dignity reads a cancelled debilitation as neutral; the Neecha Bhanga Raja Yoga item counts it as a strong positive yoga in career and leadership.',
    proposedInterpretation: 'None proposed; the two readings answer different questions (strength restored vs yoga formed).',
    sources: [{ kind: 'tradition-unverified', reference: 'Texts differ on which cancellation conditions form a Raja Yoga and for which areas.' }],
    exceptions: [], affects: 'verdicts', treatment: 'none', confidence: 'low', traditionsDisagree: true, requires: ['dignity', 'neecha-bhanga'],
  }),
  p({
    id: 'weak-yoga-participant',
    title: 'A debilitated or combust participant and the yoga it forms',
    area: 'yoga',
    technicalStatus: 'not-implemented', classicalStatus: 'unresolved', productionEligibility: 'not-approved', shadowRole: 'flag-only',
    shadowRoleReason: 'No treatment is computable without a documented basis; flagged only.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: 'Yoga items do not read participant dignity or combustion (only dusthana placement weakens them).',
    proposedInterpretation: 'None proposed: no documented rule says by how much a weak participant reduces a yoga.',
    sources: [{ kind: 'tradition-unverified', reference: 'Formation is not taken to guarantee results; the reduction for a weak participant is not quantified in a verified source.' }],
    exceptions: [], affects: 'verdicts', treatment: 'none', confidence: 'low', traditionsDisagree: true, requires: ['yoga', 'dignity', 'combustion'],
  }),
  p({
    id: 'shared-period-direction',
    title: 'One period capacity applied to every linked area',
    area: 'dasha',
    technicalStatus: 'not-implemented', classicalStatus: 'unresolved', productionEligibility: 'not-approved', shadowRole: 'flag-only',
    shadowRoleReason: 'No treatment is computable without a documented basis; flagged only.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: 'dasha.running-lord gives every linked area the same direction (planetCondition), whether the lord rules, occupies or signifies the area.',
    proposedInterpretation: 'None proposed: an area-specific period rule would be a new formula.',
    sources: [{ kind: 'tradition-unverified', reference: 'Period results are classically read through the lord\'s houses, placement and dignity together; no verified area-by-area formula is encoded.' }],
    exceptions: [], affects: 'verdicts', treatment: 'none', confidence: 'low', traditionsDisagree: true, requires: ['dasha.running'],
  }),
  p({
    id: 'rahu-ketu-kendra-trikona',
    title: 'Rahu or Ketu in a kendra or trikona: malefic occupant vs well-placed period lord',
    area: 'dasha',
    technicalStatus: 'not-implemented', classicalStatus: 'unresolved', productionEligibility: 'not-approved', shadowRole: 'flag-only',
    shadowRoleReason: 'No treatment is computable without a documented basis; flagged only.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: 'The occupant rule reads Rahu/Ketu in a non-upachaya house as friction; planetCondition gives the period lord +1 for a kendra/trikona house.',
    proposedInterpretation: 'None proposed; the natal and timing readings answer different questions and both are kept.',
    sources: [{ kind: 'tradition-unverified', reference: 'Commentaries credit nodes in kendras/trikonas with good period results in some traditions; not verified.' }],
    exceptions: [], affects: 'verdicts', treatment: 'none', confidence: 'low', traditionsDisagree: true, requires: ['planet.house', 'dasha.running'],
  }),
  p({
    id: 'functional-roles-laghu-parashari',
    title: 'Functional roles by lordship (yogakaraka, Lagna lord, 3/6/11, 8th, 2/12, Kendradhipati, maraka)',
    area: 'functional-roles',
    technicalStatus: 'validated', classicalStatus: 'provisional', productionEligibility: 'not-approved', shadowRole: 'diagnostic',
    shadowRoleReason: 'The review is computed and tested; no verdict uses functional role and remedies keep the existing logic.',
    activationRequires: 'Primary-text validation (BPHS / Laghu Parashari) or qualified expert review, then an explicit production decision.',
    existingRule: 'remedies.ts functionalRoles: trikona (1,5,9) vs dusthana (6,8,12) lordship; yogakaraka = first planet owning a trikona and a kendra (so a Lagna lord owning a kendra qualifies); 3rd/11th, Kendradhipati, Sun/Moon 8th exemption and marakas ignored.',
    proposedInterpretation: 'Lagna lord benefic; yogakaraka only for a planet owning a kendra (4,7,10) and a trikona (5,9); 3rd/6th/11th lords malefic; 8th lord malefic except as Lagna lord or when the Sun or Moon; 2nd/12th lords neutral (by association); kendra-only lords neutral (Kendradhipati); 2nd/7th lords marakas. See functionalRoleReview().',
    sources: [
      { kind: 'secondary-commentary', reference: 'Commentaries on Laghu Parashari (e.g. the O. P. Verma English commentary\'s sections on the 8th lord, Kendradhipatya dosha and the Sun and Moon as 8th lords): Sun and Moon exempt from the 8th-lordship blemish; Lagna lord exempt from Kendradhipati; 2nd/12th lords give results by their other sign and associations.' },
      { kind: 'tradition-unverified', reference: 'The verses themselves were not checked in a primary edition.' },
    ],
    exceptions: ['Rahu and Ketu own no sign here.', 'Natural nature of the Moon depends on paksha; of Mercury on association.'],
    affects: 'remedies-only', treatment: 'none', confidence: 'medium', traditionsDisagree: true, requires: ['house.lord'],
  }),
]);

export function policyById(id: string): ReconciliationPolicy | undefined { return POLICIES.find((x) => x.id === id); }

// Fail at load if the registry ever lets an untested or unimplemented policy shape a verdict.
for (const x of POLICIES) {
  if (x.shadowRole === 'provisional-candidate' && x.technicalStatus !== 'validated') throw new Error(`policy ${x.id}: a candidate must be technically validated`);
  if ((x.shadowRole === 'provisional-candidate' || x.shadowRole === 'what-if') && x.treatment === 'none') throw new Error(`policy ${x.id}: no treatment to apply`);
  if (x.productionEligibility !== 'not-approved') throw new Error(`policy ${x.id}: production approval is not granted here`);
}

// ── Functional-role review (diagnostic only; nothing calls it outside the reasoning layer) ──

export type ProposedRole = 'lagna-lord-benefic' | 'yogakaraka' | 'benefic' | 'mixed' | 'malefic' | 'neutral-8th-exempt' | 'neutral-kendradhipati' | 'neutral-by-association' | 'no-lordship';

/**
 * The provisional Laghu Parashari reading of each planet's functional role, for review beside the
 * remedy logic's functionalRoles. Diagnostic only: it changes no remedy and no verdict.
 */
export function functionalRoleReview(houseLords: ReadonlyArray<{ house: number; lord: string }>): Record<string, { owned: number[]; proposed: ProposedRole; maraka: boolean }> {
  const owned: Record<string, number[]> = {};
  for (const h of houseLords) (owned[h.lord] ||= []).push(h.house);
  const out: Record<string, { owned: number[]; proposed: ProposedRole; maraka: boolean }> = {};
  for (const planet of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']) {
    const H = owned[planet] ?? [];
    const has = (xs: number[]) => H.some((x) => xs.includes(x));
    const maraka = has([2, 7]);
    let proposed: ProposedRole;
    if (!H.length) proposed = 'no-lordship';
    else if (H.includes(1)) proposed = 'lagna-lord-benefic';
    else if (has([4, 7, 10]) && has([5, 9])) proposed = 'yogakaraka';
    else if (has([5, 9])) proposed = has([3, 6, 8, 11]) ? 'mixed' : 'benefic';
    else if (has([3, 6, 11])) proposed = 'malefic';
    else if (H.includes(8)) proposed = planet === 'Sun' || planet === 'Moon' ? 'neutral-8th-exempt' : 'malefic';
    else if (has([4, 7, 10])) proposed = 'neutral-kendradhipati';
    else proposed = 'neutral-by-association';
    out[planet] = { owned: H, proposed, maraka };
  }
  return out;
}
