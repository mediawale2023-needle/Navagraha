/**
 * The one interpretation of a house's Sarvashtakavarga (SAV) bindus. The evidence engine,
 * the Kundli table, the report reader, the PDF, the glossary and every AI prompt read it
 * from here, so the same number never gets two labels.
 *
 * 337 bindus over 12 houses is about 28 a house. The bands are symmetric around that average
 * and are the engine's own (a derived rule, not a cited verse).
 */
export const SAV_AVERAGE = 28;
export const SAV_TOTAL = 337;

export type SavBand = 'strong-support' | 'support' | 'neutral' | 'strain' | 'strong-strain';

export interface SavReading {
  band: SavBand;
  /** Evidence direction and strength; null for the neutral band, which gives no evidence item. */
  direction: 'positive' | 'neutral' | 'negative';
  strength: 'strong' | 'moderate' | null;
  /** Sentence-case label for tables ("Above average"). */
  label: string;
}

const READINGS: Record<SavBand, SavReading> = {
  'strong-support': { band: 'strong-support', direction: 'positive', strength: 'strong', label: 'Well above average' },
  support: { band: 'support', direction: 'positive', strength: 'moderate', label: 'Above average' },
  neutral: { band: 'neutral', direction: 'neutral', strength: null, label: 'Average' },
  strain: { band: 'strain', direction: 'negative', strength: 'moderate', label: 'Below average' },
  'strong-strain': { band: 'strong-strain', direction: 'negative', strength: 'strong', label: 'Well below average' },
};

/** ≥36 strong support · 32–35 support · 25–31 neutral · 21–24 strain · ≤20 strong strain. */
export function savReading(bindus: number): SavReading {
  if (bindus >= 36) return READINGS['strong-support'];
  if (bindus >= 32) return READINGS.support;
  if (bindus <= 20) return READINGS['strong-strain'];
  if (bindus <= 24) return READINGS.strain;
  return READINGS.neutral;
}

/** The rule in words, as the evidence engine states it. */
export const SAV_RULE = 'Sarvashtakavarga averages about 28 bindus per house; 32 or more supports the house, 24 or fewer strains it.';

/** The full policy in one line, for glossaries, table notes and AI instructions. */
export const SAV_POLICY_TEXT = 'About 28 bindus a house is average: 36 or more is well above average (strongly supports the house), 32–35 above average (supports it), 25–31 average (neutral), 21–24 below average (strains it), 20 or fewer well below average (strongly strains it).';
