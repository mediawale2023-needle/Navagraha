/**
 * Interpretation wording shared by every AI prompt (reports, Ask, Pro), so the models read
 * Ashtakavarga and Neecha Bhanga exactly as the evidence engine and the chart screens do.
 */
import { savReading, SAV_POLICY_TEXT, SAV_TOTAL } from '@shared/v3/ashtakavargaPolicy';

/** One line per house, each figure labelled by the shared policy. */
export function savHouseLine(savByHouse: number[]): string {
  return savByHouse.map((b, i) => `H${i + 1}:${b} (${savReading(b).label.toLowerCase()})`).join('  ');
}

/** The heading that introduces `savHouseLine` in a prompt. */
export const SAV_PROMPT_HEADING = `Sarvashtakavarga (SAV) bindus by house, total ${SAV_TOTAL}. Read them only on this scale: ${SAV_POLICY_TEXT} Quote only these figures and these labels.`;

/** How a cancelled debilitation may be described. */
export const NEECHA_BHANGA_RULE = 'Keep four things apart: debilitation (the sign placement); Neecha Bhanga (a cancellation of that debilitation, so the planet is not to be read as debilitated and under-delivering on that account); overall planetary strength (judged only from the other supplied facts: dignity, combustion, house and evidence items; a cancellation alone makes a planet neither strong nor weak); and Neecha Bhanga Raja Yoga (a promise like any yoga, which matures in its planet\'s periods and is not beneficial in every area). State Neecha Bhanga only for a planet the facts list with it.';
