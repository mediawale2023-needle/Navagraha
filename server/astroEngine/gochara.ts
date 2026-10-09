/**
 * Rashi (Moon-sign) horoscope from Gochara: where each planet is transiting,
 * counted from the Moon sign, read against the classical favourable houses
 * (Phaladeepika ch. 26). Deterministic and computed from the ephemeris; no
 * text is invented beyond the rule each line states. Vedha (obstruction) is
 * not evaluated, and a Rashi reading is general to everyone with that Moon
 * sign — a personal chart refines it.
 */
import { SIGNS, type Sign } from './vedic.js';
import { siderealPositions } from './canonical/compute.js';
import { lonOf } from './lon.js';

export type HoroscopePeriod = 'today' | 'tomorrow' | 'weekly' | 'monthly';
export const HOROSCOPE_PERIODS: HoroscopePeriod[] = ['today', 'tomorrow', 'weekly', 'monthly'];

const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const;
type Planet = typeof PLANETS[number];

/** Houses from the Moon in which each planet's transit is classically favourable. */
export const GOCHARA_FAVOURABLE: Record<Planet, number[]> = {
  Sun: [3, 6, 10, 11],
  Moon: [1, 3, 6, 7, 10, 11],
  Mars: [3, 6, 11],
  Mercury: [2, 4, 6, 8, 10, 11],
  Jupiter: [2, 5, 7, 9, 11],
  Venus: [1, 2, 3, 4, 5, 8, 9, 11, 12],
  Saturn: [3, 6, 11],
  Rahu: [3, 6, 11],
  Ketu: [3, 6, 11],
};

const HOUSE_THEME: Record<number, string> = {
  1: 'personal energy and new starts',
  2: 'money, speech and family',
  3: 'courage, effort and short trips',
  4: 'home, comfort and peace of mind',
  5: 'creativity, children and learning',
  6: 'competition, debts and daily work',
  7: 'partnerships and dealings with others',
  8: 'sudden changes and shared resources',
  9: 'fortune, mentors and long journeys',
  10: 'career and public standing',
  11: 'gains, friends and wishes',
  12: 'expenses, rest and distant places',
};

const RASHI: Record<Sign, string> = {
  Aries: 'Mesha', Taurus: 'Vrishabha', Gemini: 'Mithuna', Cancer: 'Karka', Leo: 'Simha', Virgo: 'Kanya',
  Libra: 'Tula', Scorpio: 'Vrishchika', Sagittarius: 'Dhanu', Capricorn: 'Makara', Aquarius: 'Kumbha', Pisces: 'Meena',
};

const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const DAY = 86_400_000;
const signIdx = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30) % 12;

export interface GocharaItem {
  planet: Planet;
  sign: Sign;
  houseFromMoon: number;
  favourable: boolean;
  theme: string;
  /** Set when the planet changes sign inside the period. */
  changesTo?: { sign: Sign; houseFromMoon: number; favourable: boolean; on: string };
}

export interface SignHoroscope {
  sign: string;
  rashi: string;
  period: HoroscopePeriod;
  from: string;
  to: string;
  headline: string;
  prediction: string;
  highlights: GocharaItem[];
  sadeSati: { active: boolean; phase: string | null };
  basis: string;
}

export function resolveSign(input: string): Sign | null {
  const s = input.trim().toLowerCase();
  const english = SIGNS.find((x) => x.toLowerCase() === s);
  if (english) return english;
  return (Object.entries(RASHI).find(([, r]) => r.toLowerCase() === s)?.[0] as Sign | undefined) ?? null;
}

function signsOn(instant: Date): Record<Planet, number> {
  const { bodies } = siderealPositions(instant);
  const lons = Object.fromEntries(Object.entries(bodies).map(([n, b]) => [n, b.longitude]));
  return Object.fromEntries(PLANETS.map((p) => [p, signIdx(lonOf(lons, p))])) as Record<Planet, number>;
}

const dateIn = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Rashi horoscope for `period`, starting at `now`; dates are labelled in `timeZone`. */
export function signHoroscope(input: string, period: HoroscopePeriod, now: Date = new Date(), timeZone = 'Asia/Kolkata'): SignHoroscope {
  const moonSign = resolveSign(input);
  if (!moonSign) throw new RangeError(`Unknown sign "${input}"`);
  const moonIdx = SIGNS.indexOf(moonSign);
  const house = (s: number) => ((s - moonIdx + 12) % 12) + 1;

  const start = period === 'tomorrow' ? new Date(now.getTime() + DAY) : now;
  const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 1;
  const end = new Date(start.getTime() + (days - 1) * DAY);
  const at = signsOn(start);

  // Sign changes inside the window, at 6-hour resolution.
  const changes: Partial<Record<Planet, { sign: number; on: Date }>> = {};
  if (days > 1) {
    for (let t = start.getTime() + 6 * 3_600_000; t <= end.getTime() + DAY - 1; t += 6 * 3_600_000) {
      const s = signsOn(new Date(t));
      for (const p of PLANETS) if (p !== 'Moon' && !changes[p] && s[p] !== at[p]) changes[p] = { sign: s[p], on: new Date(t) };
    }
  }

  const item = (p: Planet): GocharaItem => {
    const h = house(at[p]);
    const it: GocharaItem = { planet: p, sign: SIGNS[at[p]], houseFromMoon: h, favourable: GOCHARA_FAVOURABLE[p].includes(h), theme: HOUSE_THEME[h] };
    const c = changes[p];
    if (c) {
      const h2 = house(c.sign);
      it.changesTo = { sign: SIGNS[c.sign], houseFromMoon: h2, favourable: GOCHARA_FAVOURABLE[p].includes(h2), on: dateIn(c.on, timeZone) };
    }
    return it;
  };

  const daily = days === 1;
  const fast: Planet[] = daily ? ['Moon', 'Sun', 'Mercury', 'Venus', 'Mars'] : ['Sun', 'Mercury', 'Venus', 'Mars'];
  const slow: Planet[] = ['Jupiter', 'Saturn', 'Rahu', 'Ketu'];
  const highlights = [...fast, ...slow].map(item);

  const line = (i: GocharaItem) => {
    const base = `${i.planet} in ${i.sign}, the ${ord(i.houseFromMoon)} from ${moonSign}, is traditionally ${i.favourable ? 'supportive' : 'demanding'} for ${i.theme}.`;
    if (!i.changesTo) return base;
    const c = i.changesTo;
    return `${base} On ${c.on} it moves into ${c.sign} (the ${ord(c.houseFromMoon)}), which is ${c.favourable ? 'supportive' : 'demanding'} for ${HOUSE_THEME[c.houseFromMoon]}.`;
  };

  const satH = house(at.Saturn);
  const sadeSati = satH === 12 || satH === 1 || satH === 2
    ? { active: true, phase: satH === 12 ? 'rising phase' : satH === 1 ? 'peak phase' : 'setting phase' }
    : { active: false, phase: satH === 4 ? 'Kantaka Shani (Saturn 4th from the Moon)' : satH === 8 ? 'Ashtama Shani (Saturn 8th from the Moon)' : null };

  const fastItems = highlights.filter((i) => fast.includes(i.planet));
  const supportive = fastItems.filter((i) => i.favourable).length;
  const lead = daily ? highlights[0] : null;
  const headline = lead
    ? `Moon in the ${ord(lead.houseFromMoon)}: ${lead.favourable ? 'a supportive day' : 'a day to go carefully'} for ${lead.theme}`
    : `${supportive} of ${fastItems.length} faster planets are well placed from ${moonSign} this ${period === 'weekly' ? 'week' : 'month'}`;

  const moonWeek = period === 'weekly' ? moonJourney(start, moonIdx, timeZone) : '';
  const prediction = [
    ...fastItems.map(line),
    moonWeek,
    `Backdrop: ${highlights.filter((i) => slow.includes(i.planet)).map(line).join(' ')}`,
    sadeSati.active
      ? `Saturn is ${ord(satH)} from ${moonSign}: Sade Sati (${sadeSati.phase}) is running for this Moon sign.`
      : sadeSati.phase ? `Saturn is ${ord(satH)} from ${moonSign}: ${sadeSati.phase}.` : '',
  ].filter(Boolean).join('\n\n');

  return {
    sign: moonSign.toLowerCase(),
    rashi: RASHI[moonSign],
    period,
    from: dateIn(start, timeZone),
    to: dateIn(end, timeZone),
    headline,
    prediction,
    highlights,
    sadeSati,
    basis: `Gochara: each planet's sidereal (Lahiri) transit counted from ${moonSign} as the Moon sign, read against the classical favourable houses. Vedha is not evaluated, and this is general to everyone with a ${moonSign} Moon; your own chart's dashas refine it.`,
  };
}

/** The Moon's sign changes through a week, as houses from the Moon sign. */
function moonJourney(start: Date, moonIdx: number, timeZone: string): string {
  const steps: string[] = [];
  let last = -1;
  for (let t = start.getTime(); t < start.getTime() + 7 * DAY; t += 6 * 3_600_000) {
    const s = signsOn(new Date(t)).Moon;
    if (s !== last) {
      const h = ((s - moonIdx + 12) % 12) + 1;
      steps.push(`${dateIn(new Date(t), timeZone)}: ${SIGNS[s]} (${ord(h)}, ${GOCHARA_FAVOURABLE.Moon.includes(h) ? 'supportive' : 'demanding'} for ${HOUSE_THEME[h]})`);
      last = s;
    }
  }
  return `The Moon this week — ${steps.join('; ')}.`;
}
