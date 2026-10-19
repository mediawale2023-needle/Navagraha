import type { CanonicalChart } from '@shared/v3/canonical';
import { siderealPositions } from '../astroEngine/canonical/compute';
import { GOCHARA_FAVOURABLE, HOUSE_THEME } from '../astroEngine/gochara';
import { lonOf } from '../astroEngine/lon';
import { SIGNS } from '../astroEngine/vedic';
import type { BlueprintEvidence } from './types';

const DAY = 86_400_000;
const WINDOW_DAYS = 365;
// The planets slow enough for a sign change to mark a month; the Sun, Moon, Mercury and Venus change too often.
const DATED_PLANETS = ['Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu'] as const;
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const day = (d: Date) => d.toISOString().slice(0, 10);
const signOf = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30) % 12;

/**
 * Month-level evidence for the twelve months from `asOf`: each slower planet's sign change, read from the Moon sign by
 * the same classical Gochara rule as the Horoscope page, and each Antardasha change at the engine's dates. Nothing is
 * produced from a Moon sign the birth time cannot fix, or from a period the birth time cannot place.
 */
export function datedChanges(chart: CanonicalChart, asOf: Date, opts: { moonSignCertain: boolean; antardashaReliable: boolean }): BlueprintEvidence[] {
  const end = asOf.getTime() + WINDOW_DAYS * DAY;
  const out: BlueprintEvidence[] = [];
  if (opts.moonSignCertain) {
    const moon = chart.planets.find((p) => p.name === 'Moon')!;
    const moonIdx = SIGNS.indexOf(moon.sign as (typeof SIGNS)[number]);
    const signsAt = (t: number) => {
      const lons = Object.fromEntries(Object.entries(siderealPositions(new Date(t)).bodies).map(([n, b]) => [n, b.longitude]));
      return Object.fromEntries(DATED_PLANETS.map((p) => [p, signOf(lonOf(lons, p))])) as Record<(typeof DATED_PLANETS)[number], number>;
    };
    let prev = signsAt(asOf.getTime());
    for (let t = asOf.getTime() + DAY; t <= end; t += DAY) {
      const now = signsAt(t);
      for (const p of DATED_PLANETS) {
        if (now[p] === prev[p]) continue;
        const house = ((now[p] - moonIdx + 12) % 12) + 1;
        const favourable = GOCHARA_FAVOURABLE[p].includes(house);
        out.push({
          id: `dated-transit:${p}:${day(new Date(t))}`,
          text: `Around ${day(new Date(t))}, ${p} moves into ${SIGNS[now[p]]}, the ${ord(house)} from the Moon sign; by the classical Gochara rule this is ${favourable ? 'supportive' : 'demanding'} for ${HOUSE_THEME[house]}.`,
          direction: favourable ? 'supporting' : 'challenging', source: 'dated-transit', domains: [], planets: [p],
        });
      }
      prev = now;
    }
  }
  if (opts.antardashaReliable) {
    for (const md of chart.dashas.vimshottari.mahadashas) for (const ad of md.antardashas) {
      const start = Date.parse(ad.start);
      if (start <= asOf.getTime() || start > end) continue;
      out.push({
        id: `dated-period:${md.lord}-${ad.lord}:${day(new Date(start))}`,
        text: `On ${day(new Date(start))} the ${md.lord} Mahadasha moves into its ${ad.lord} Antardasha (sub-period), which runs to ${day(new Date(Date.parse(ad.end)))}.`,
        direction: 'neutral', source: 'dated-period', domains: [], planets: [md.lord, ad.lord],
      });
    }
  }
  return out;
}
