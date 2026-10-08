/**
 * Prashna (horary) chart for the moment a question is asked, on the same
 * Swiss Ephemeris/Lahiri astronomy as natal charts (replaces the Rust
 * /prashna, which used a mean-longitude Moon and a fixed 24° ayanamsa).
 *
 * Deterministic astronomy: Moon/Sun positions, the sidereal Prashna Lagna,
 * local sunrise/sunset (Swiss rise_trans) for the Vedic weekday and the
 * planetary hora. Arudha Lagna follows the standard Jaimini counting rule.
 *
 * The yes/no indicator and timing window are Navagraha's modern conventions
 * (carried over from the previous engine) and are labelled as such — they are
 * not presented as classical rules.
 */
import { SIGN_NAMES } from '@shared/v3/canonical';
import { siderealPositions, siderealAngles, nextSunEvent, jdToDate } from './canonical/compute.js';
import { NAKSHATRAS, NAKSHATRA_SPAN, SIGN_LORDS } from './vedic.js';
import { TITHI_NAMES, YOGA_NAMES, VARA_NAMES, karanaName } from './panchang.js';

const norm = (x: number) => ((x % 360) + 360) % 360;
const DAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];
const BENEFIC_NAKSHATRAS = [0, 3, 6, 7, 9, 11, 13, 16, 20, 21, 25, 26];
const BENEFIC_HORAS = ['Jupiter', 'Venus', 'Mercury', 'Moon'];

export type PrashnaCategory = 'career' | 'marriage' | 'health' | 'finance' | 'travel' | 'general';
const SIGNIFICATOR: Record<PrashnaCategory, string> = {
  career: 'Sun/Mercury (10th house karaka, ambition and intellect)',
  marriage: 'Venus/Jupiter (7th house karaka, relationships)',
  health: 'Sun/Moon/Mars (vitality, body, energy)',
  finance: 'Jupiter/Venus (2nd and 11th house karakas, wealth and gains)',
  travel: 'Moon/Mercury/Rahu (movement, journeys, foreign connections)',
  general: 'Moon (Prashna Chandra rules spontaneous questions)',
};
const TIMING: Record<string, string> = {
  Moon: 'Within 1–3 days', Mercury: 'Within 1–3 weeks', Venus: 'Within 1–2 months', Sun: 'Within 1–3 months',
  Mars: 'Within 2–3 months, with friction', Jupiter: 'Within 6–12 months', Saturn: 'Within 1–2 years, with patience',
};

/** Arudha Lagna: count Lagna→its lord, count the same again from the lord; 1st/7th from Lagna → take the 10th from there. */
export function arudhaLagna(lagnaSign: number, lordSign: number): number {
  const n = (lordSign - lagnaSign + 12) % 12;
  let al = (lordSign + n) % 12;
  const fromLagna = (al - lagnaSign + 12) % 12;
  if (fromLagna === 0 || fromLagna === 6) al = (al + 9) % 12;
  return al;
}

export function computePrashna(at: Date, latitude: number, longitude: number, category: PrashnaCategory) {
  const { jdUT, bodies } = siderealPositions(at);
  const { ascendant } = siderealAngles(jdUT, latitude, longitude);
  const moon = bodies.Moon.longitude;
  const sun = bodies.Sun.longitude;

  const elong = norm(moon - sun);
  const tithiIdx = Math.floor(elong / 12);
  const nakIdx = Math.floor(norm(moon) / NAKSHATRA_SPAN) % 27;
  const yogaIdx = Math.floor(norm(sun + moon) / NAKSHATRA_SPAN) % 27;

  // The Vedic day runs sunrise to sunrise; the hora sequence starts at sunrise with the day lord.
  // Most recent sunrise at or before the question: step forward from ~1.2 days earlier.
  let lastSunrise = nextSunEvent(jdUT - 1.2, latitude, longitude, 'rise');
  for (let next = nextSunEvent(lastSunrise + 0.01, latitude, longitude, 'rise'); next <= jdUT; next = nextSunEvent(next + 0.01, latitude, longitude, 'rise')) {
    lastSunrise = next;
  }
  const sunset = nextSunEvent(lastSunrise, latitude, longitude, 'set');
  const nextSunrise = nextSunEvent(lastSunrise + 0.01, latitude, longitude, 'rise');
  // The Vedic weekday is the day on which this sunrise fell, in local mean solar time
  // (longitude/15 h from UT) — no civil time zone is needed, so border locations work.
  const sunriseLocalMean = new Date(jdToDate(lastSunrise).getTime() + (longitude / 15) * 3_600_000);
  const weekday = sunriseLocalMean.getUTCDay();
  const isDay = jdUT < sunset;
  const span = isDay ? (sunset - lastSunrise) / 12 : (nextSunrise - sunset) / 12;
  const horaInPart = Math.min(11, Math.floor((jdUT - (isDay ? lastSunrise : sunset)) / span));
  const horaNumber = (isDay ? 0 : 12) + horaInPart;
  const horaLord = CHALDEAN[(CHALDEAN.indexOf(DAY_LORDS[weekday]) + horaNumber) % 7];

  const lagnaSign = Math.floor(ascendant / 30);
  const lord = SIGN_LORDS[SIGN_NAMES[lagnaSign]];
  const lordSign = Math.floor(bodies[lord as keyof typeof bodies].longitude / 30);
  const al = arudhaLagna(lagnaSign, lordSign);

  const nakOk = BENEFIC_NAKSHATRAS.includes(nakIdx);
  const horaOk = BENEFIC_HORAS.includes(horaLord);
  const answer = nakOk && horaOk ? 'YES — Both the Nakshatra and the Hora are favourable.'
    : nakOk ? 'CONDITIONAL — The Nakshatra favours it but the Hora adds friction; expect delay.'
    : horaOk ? 'NOT_NOW — The Hora is supportive but the Nakshatra indicates obstacles; wait.'
    : 'NO — Neither the Nakshatra nor the Hora is favourable at this moment.';
  const nak = NAKSHATRAS[nakIdx];

  return {
    panchang: {
      tithi: `${tithiIdx < 15 ? 'Shukla' : 'Krishna'} ${TITHI_NAMES[tithiIdx % 15]}`,
      vara: `${VARA_NAMES[weekday]} (${DAY_LORDS[weekday]})`,
      nakshatra: nak.name,
      nakshatra_deity: nak.deity,
      karana: karanaName(Math.floor(elong / 6)),
      yoga: YOGA_NAMES[yogaIdx],
      hora_lord: horaLord,
    },
    prashna_ascendant_sign: lagnaSign + 1,
    arudha_lagna_sign: al + 1,
    answer_indicator: answer,
    timing_window: `${TIMING[horaLord]} (from the hora lord)`,
    key_significator: SIGNIFICATOR[category],
    prashna_analysis: [
      `Prashna Lagna (rising sign at the question moment): ${SIGN_NAMES[lagnaSign]} ${(ascendant % 30).toFixed(1)}°`,
      `Lagna lord ${lord} in ${SIGN_NAMES[lordSign]}; Arudha Lagna: ${SIGN_NAMES[al]}`,
      `Hora of ${horaLord} (${isDay ? 'day' : 'night'} hora ${horaInPart + 1} of 12, counted from local ${isDay ? 'sunrise' : 'sunset'}); Vedic weekday ${VARA_NAMES[weekday]}`,
      `Moon in ${nak.name} (deity ${nak.deity})`,
      `Panchang: ${tithiIdx < 15 ? 'Shukla' : 'Krishna'} ${TITHI_NAMES[tithiIdx % 15]} tithi, ${YOGA_NAMES[yogaIdx]} yoga`,
      `Significator for ${category} questions: ${SIGNIFICATOR[category]}`,
      'The yes/no indicator and timing window are Navagraha conventions (favourable-nakshatra and benefic-hora pairing), not a classical verdict.',
    ],
    calculatedAt: at.toISOString(),
    astronomy: { engine: 'Swiss Ephemeris (Moshier), Lahiri', moonLongitude: moon, sunLongitude: sun, ascendantLongitude: ascendant },
  };
}

export const PRASHNA_CATEGORIES = Object.keys(SIGNIFICATOR) as PrashnaCategory[];
