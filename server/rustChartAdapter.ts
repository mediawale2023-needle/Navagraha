import { z } from 'zod';
import type { ChartRequest } from './astroEngineClient';
import { SIGNS } from './astroEngine/vedic';

const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const longitude = z.number().finite().min(0).lt(360);
const house = z.number().int().min(1).max(12);
const chartSchema = z.object({
  calculationInputs: z.object({
    julianDay: z.number().finite().positive(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    ascendantLongitude: longitude,
    ayanamsa: z.number().finite(),
    tropicalLongitudes: z.record(longitude),
  }),
  planetaryPositions: z.array(z.object({
    planet: z.string(), sign: z.string(), degree: z.number().finite().min(0).max(30),
    house, isRetrograde: z.boolean(),
  })),
  bhava: z.object({ chalit: z.array(z.object({ planet: z.string(), chalitHouse: house })) }),
});

export type RustChartInput =
  | { available: true; request: ChartRequest }
  | { available: false; reason: string };

/** Legacy charts lack exact calculation inputs. Do not reconstruct precision
 * from rounded display degrees or invent coordinates/time for those charts. */
export function buildRustChartRequest(kundli: { chartData: unknown } | null | undefined): RustChartInput {
  const parsed = chartSchema.safeParse(kundli?.chartData);
  if (!parsed.success) return {
    available: false,
    reason: `Missing or invalid stored chart inputs: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`,
  };
  const { calculationInputs: inputs, planetaryPositions, bhava } = parsed.data;
  const planets: ChartRequest['planets'] = [];
  for (const name of PLANETS) {
    const positions = planetaryPositions.filter(p => p.planet === name);
    const houses = bhava.chalit.filter(p => p.planet === name);
    const tropical = inputs.tropicalLongitudes[name];
    if (positions.length !== 1 || houses.length !== 1 || tropical === undefined) {
      return { available: false, reason: `Missing or duplicate deterministic planet input: ${name}` };
    }
    const p = positions[0];
    const sidereal = ((tropical - inputs.ayanamsa) % 360 + 360) % 360;
    const sign = SIGNS.findIndex(sign => sign === p.sign);
    const ascSidereal = ((inputs.ascendantLongitude - inputs.ayanamsa) % 360 + 360) % 360;
    const chalitHouse = Math.floor(((sidereal - ascSidereal + 360) % 360) / 30) + 1;
    if (sign < 0 || sign !== Math.floor(sidereal / 30) ||
        Math.abs(p.degree - (sidereal % 30)) > 0.0051 ||
        p.house !== ((sign - Math.floor(ascSidereal / 30) + 12) % 12) + 1 ||
        houses[0].chalitHouse !== chalitHouse) {
      return { available: false, reason: `Invalid or inconsistent planetary placement: ${name}` };
    }
    planets.push({
      name, longitude: tropical, sign: sign + 1, house: houses[0].chalitHouse,
      is_retrograde: p.isRetrograde,
      // Rust's contract uses the global pada index, 1–108 (not 1–4).
      nakshatra_pada: Math.floor(sidereal / (360 / 108)) + 1,
    });
  }
  return { available: true, request: {
    planets, ascendant_longitude: inputs.ascendantLongitude,
    latitude: inputs.latitude, julian_day: inputs.julianDay,
  } };
}
