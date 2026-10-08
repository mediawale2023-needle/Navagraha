/**
 * Panchang — the five limbs of the Vedic almanac for a local civil date at a
 * place: Tithi, Nakshatra, Yoga, Karana and Vara, from the sidereal Sun and
 * Moon (Swiss Ephemeris, Lahiri) at that place's actual sunrise (udaya), plus
 * the weekday-based Rahu Kaal / Gulika / Yamaganda windows, which divide the
 * real sunrise→sunset day into eighths. Times are reported in the place's
 * IANA time zone (historical rules and DST included).
 */
import { siderealPositions, julianDayUT, nextSunEvent, jdToDate, CalculationError } from './canonical/compute.js';
import { NAKSHATRAS, NAKSHATRA_SPAN } from './vedic.js';
import { BirthInputError } from './errors.js';
import { isValidTimeZone, offsetSecondsAt, formatOffset, timeZoneForCoordinates } from './birthResolver.js';
import { validCoordinates } from '../geocode.js';

const normalize360 = (deg: number) => ((deg % 360) + 360) % 360;

export const TITHI_NAMES = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
  "Trayodashi", "Chaturdashi", "Purnima/Amavasya",
];

export const YOGA_NAMES = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
  "Sukarma", "Dhriti", "Shoola", "Ganda", "Vriddhi", "Dhruva", "Vyaghata",
  "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana", "Parigha", "Shiva",
  "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];

// Karana cycle: 7 movable karanas repeat, plus 4 fixed ones.
const MOVABLE_KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti"];
const FIXED_KARANAS = ["Shakuni", "Chatushpada", "Naga", "Kimstughna"];

export const VARA_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Rahu Kaal occupies the Nth 1/8 segment of daytime, by weekday (Sun..Sat).
const RAHU_SEGMENT = [8, 2, 7, 5, 6, 4, 3];
const GULIKA_SEGMENT = [7, 6, 5, 4, 3, 2, 1];
const YAMA_SEGMENT = [5, 4, 3, 2, 1, 7, 6];

export function karanaName(index: number): string {
  // 60 half-tithis per lunar month → karana cycle
  const i = index % 60;
  if (i === 0) return FIXED_KARANAS[3]; // Kimstughna (first half of Shukla Pratipada)
  if (i >= 57) return FIXED_KARANAS[i - 57]; // last three: Shakuni, Chatushpada, Naga
  return MOVABLE_KARANAS[(i - 1) % 7];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local civil date (YYYY-MM-DD) of an instant in a time zone. */
export function civilDateIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function fmtTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(at);
}

interface TimeWindow { start: string; end: string; startUTC: string; endUTC: string }

export interface Panchang {
  date: string;
  vara: string;
  tithi: { name: string; paksha: string; number: number };
  nakshatra: { name: string; lord: string };
  yoga: string;
  karana: string;
  sunrise: string;
  sunset: string;
  sunriseUTC: string;
  sunsetUTC: string;
  rahuKaal: TimeWindow;
  gulikaKaal: TimeWindow;
  yamaganda: TimeWindow;
  location: { latitude: number; longitude: number; timezone: string; utcOffset: string; place: string | null; isDefault: boolean };
  basis: string;
}

export interface PanchangInput {
  /** Local civil date at the place (YYYY-MM-DD); defaults to today there. */
  date?: string;
  latitude: unknown;
  longitude: unknown;
  /** IANA zone; derived from the coordinates when absent. */
  timezone?: string | null;
  place?: string | null;
  isDefaultLocation?: boolean;
  now?: Date;
}

export function computePanchang(input: PanchangInput): Panchang {
  const coords = validCoordinates(input.latitude, input.longitude);
  if (!coords) throw new BirthInputError('latitude and longitude must be valid coordinates');
  const { lat, lng } = coords;

  let timeZone: string;
  if (input.timezone) {
    if (!isValidTimeZone(input.timezone)) throw new BirthInputError(`Unknown time zone ${input.timezone}`);
    timeZone = input.timezone;
  } else {
    timeZone = timeZoneForCoordinates(lat, lng, (input.now ?? new Date()).getTime());
  }

  const date = input.date ?? civilDateIn(timeZone, input.now ?? new Date());
  const m = DATE_RE.exec(date);
  const wallMidnight = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || new Date(wallMidnight).toISOString().slice(0, 10) !== date) throw new BirthInputError('date must be a valid YYYY-MM-DD date');
  const year = Number(m[1]);
  if (year < 1800 || year > 2400) throw new BirthInputError('date must be between 1800 and 2400');

  // Search from local midnight (offset read at that instant; a midnight DST shift only moves the start).
  const startMs = wallMidnight - offsetSecondsAt(timeZone, wallMidnight) * 1000;
  const sunriseJd = nextSunEvent(julianDayUT(new Date(startMs)), lat, lng, 'rise');
  const sunriseAt = jdToDate(sunriseJd);
  if (civilDateIn(timeZone, sunriseAt) !== date) {
    throw new CalculationError('The Sun does not rise at this place on this date, so a sunrise Panchang cannot be given.');
  }
  const sunsetJd = nextSunEvent(sunriseJd, lat, lng, 'set');
  const sunsetAt = jdToDate(sunsetJd);
  if (civilDateIn(timeZone, sunsetAt) !== date) {
    throw new CalculationError('The Sun does not set at this place on this date, so the day cannot be divided for Rahu Kaal.');
  }

  // Limbs at sunrise, from the same Swiss/Lahiri positions as every natal chart.
  const { bodies } = siderealPositions(sunriseAt);
  const sunSid = bodies.Sun.longitude;
  const moonSid = bodies.Moon.longitude;
  const diff = normalize360(moonSid - sunSid);
  const tithiIdx = Math.floor(diff / 12); // 0..29
  const nak = NAKSHATRAS[Math.floor(normalize360(moonSid) / NAKSHATRA_SPAN) % 27];
  const yogaIdx = Math.floor(normalize360(sunSid + moonSid) / (360 / 27)) % 27;

  // The Vedic day begins at this sunrise, which falls on the requested civil date.
  const weekday = new Date(wallMidnight).getUTCDay();

  const seg = (sunsetAt.getTime() - sunriseAt.getTime()) / 8;
  const segmentWindow = (n: number): TimeWindow => {
    const s = new Date(sunriseAt.getTime() + (n - 1) * seg);
    const e = new Date(s.getTime() + seg);
    return { start: fmtTime(s, timeZone), end: fmtTime(e, timeZone), startUTC: s.toISOString(), endUTC: e.toISOString() };
  };

  return {
    date,
    vara: VARA_NAMES[weekday],
    tithi: { name: TITHI_NAMES[tithiIdx % 15], paksha: tithiIdx < 15 ? "Shukla" : "Krishna", number: tithiIdx + 1 },
    nakshatra: { name: nak.name, lord: nak.lord },
    yoga: YOGA_NAMES[yogaIdx],
    karana: karanaName(Math.floor(diff / 6)),
    sunrise: fmtTime(sunriseAt, timeZone),
    sunset: fmtTime(sunsetAt, timeZone),
    sunriseUTC: sunriseAt.toISOString(),
    sunsetUTC: sunsetAt.toISOString(),
    rahuKaal: segmentWindow(RAHU_SEGMENT[weekday]),
    gulikaKaal: segmentWindow(GULIKA_SEGMENT[weekday]),
    yamaganda: segmentWindow(YAMA_SEGMENT[weekday]),
    location: {
      latitude: lat, longitude: lng, timezone: timeZone,
      utcOffset: formatOffset(offsetSecondsAt(timeZone, sunriseAt.getTime())),
      place: input.place ?? null, isDefault: input.isDefaultLocation === true,
    },
    basis: 'Limbs at local sunrise; sunrise/sunset from Swiss Ephemeris (Sun disc centre, standard refraction); Lahiri ayanamsa.',
  };
}
