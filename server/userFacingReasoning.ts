/**
 * USER_FACING_REASONING_V1 (default off): the one place every surface asks for chart explanations.
 * Off, or if anything fails, it returns nothing and the caller carries on exactly as before. It never
 * changes a verdict, an evidence item, a price or an eligibility decision.
 */
import { isCurrentCanonicalChart, type CanonicalChart } from '@shared/v3/canonical';
import type { KundliInsights, LifeDomain } from '@shared/v3/evidence';
import type { ChartExplanations } from '@shared/v3/explanations';
import { features } from './features';
import { buildInterpretationContext } from './astroEngine/reasoning/interpretationContext.js';
import { buildExplanations, groundingBlock } from './astroEngine/reasoning/explanations.js';

export const reasoningEnabled = (): boolean => features.userFacingReasoning();

/** Explanations for a chart, or null when the flag is off or they cannot be built. */
export function explanationsFor(chart: CanonicalChart, asOf: Date, insights?: KundliInsights): ChartExplanations | null {
  if (!reasoningEnabled()) return null;
  try {
    return buildExplanations(buildInterpretationContext(chart, asOf, insights));
  } catch (err) {
    // No chart details in the log: the error kind only.
    console.error('[reasoning] explanations unavailable:', (err as Error)?.name ?? 'error');
    return null;
  }
}

/** The AI grounding block (leading blank line included), or '' when off or unavailable. */
export function groundingFor(chart: CanonicalChart, asOf: Date, focus: { domains?: LifeDomain[]; planets?: string[]; allYogas?: boolean; evidenceLines?: boolean } = {}): string {
  const ex = explanationsFor(chart, asOf);
  return ex ? `\n\n${groundingBlock(ex, focus)}` : '';
}

/** The report grounding block for a stored chart, or '' (flag off, not a V3 chart, or unavailable). */
export function reportGroundingFor(kundli: unknown, asOf = new Date()): string {
  const chart = (kundli as { chartData?: { canonical?: unknown } })?.chartData?.canonical;
  if (!reasoningEnabled() || !isCurrentCanonicalChart(chart)) return '';
  return groundingFor(chart as CanonicalChart, asOf);
}
