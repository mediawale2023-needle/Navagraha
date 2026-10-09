// Ring geometry in a 240-unit viewBox: 27 segments clockwise from the top, 360/27 degrees each.

export const R_OUT = 112;
export const R_IN = 86;
const STEP = 360 / 27;

const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(120 + r * Math.sin(a)).toFixed(1)} ${(120 - r * Math.cos(a)).toFixed(1)}`;
};

/** The annular sector for nakshatra `i` (0-based). */
export function segmentPath(i: number): string {
  const a0 = i * STEP;
  const a1 = (i + 1) * STEP;
  return `M${pt(R_OUT, a0)} A${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, a1)} L${pt(R_IN, a1)} A${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, a0)} Z`;
}

export const TICKS = Array.from({ length: 27 }, (_, i) => `M${pt(R_IN, i * STEP)}L${pt(R_OUT, i * STEP)}`).join(' ');
