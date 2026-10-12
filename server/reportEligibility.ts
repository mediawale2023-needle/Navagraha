/**
 * Which paid reports an approximate birth time can honestly support. A report whose advertised
 * purpose rests on the houses, house lords, divisional charts or dasha dates cannot be delivered
 * without the exact time, so it is refused before any charge. The Life Reading stands on planet
 * signs, the Moon and natural significations, and is prepared in an approximate-time mode.
 */
const CHARGE_NOTE = "Add the exact birth time to the chart to order it. You have not been charged.";

const NEEDS_EXACT_TIME: Record<string, string> = {
  career: `The Career report reads the 10th house, its lord, the D10 chart and the dasha periods that time career growth. All of these change with the birth time, so it cannot be prepared from an approximate time. ${CHARGE_NOTE}`,
  marriage: `The Marriage report reads the 7th house, its lord, the Navamsa (D9) and the dasha periods that time marriage. All of these change with the birth time, so it cannot be prepared from an approximate time. ${CHARGE_NOTE}`,
  finance: `The Wealth report reads the 2nd and 11th houses, their lords and the dasha periods that mark investment windows. All of these change with the birth time, so it cannot be prepared from an approximate time. ${CHARGE_NOTE}`,
  year_ahead: `The Year Ahead report predicts month by month from the running dasha periods, whose dates move with the birth time, so it cannot be prepared from an approximate time. ${CHARGE_NOTE}`,
  life_complete: "The Complete Life Report reads every house, so it needs an exact birth time. You have not been charged.",
};

/** Why a report cannot be prepared from an approximate birth time, or null when it can. */
export function exactTimeRequiredReason(category: string | null | undefined): string | null {
  return NEEDS_EXACT_TIME[category ?? "life"] ?? null;
}
