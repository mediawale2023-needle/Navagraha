/**
 * Panchang — the five limbs of the Vedic almanac for a given day:
 * Tithi, Nakshatra, Yoga, Karana and Vara (weekday), computed from the
 * sidereal Sun and Moon longitudes (Lahiri ayanamsa). Also provides the
 * standard weekday-based Rahu Kaal / Gulika / Yamaganda windows.
 *
 * Panchang elements are conventionally reported at sunrise; we evaluate at
 * ~06:00 local time for the requested timezone (IST by default).
 */

import { julianDay, toSidereal, normalize360 } from "./core";
import { sunPosition, moonLongitude } from "./planets";
import { NAKSHATRAS, NAKSHATRA_SPAN } from "./vedic";

const TITHI_NAMES = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
  "Trayodashi", "Chaturdashi", "Purnima/Amavasya",
];

const YOGA_NAMES = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
  "Sukarma", "Dhriti", "Shoola", "Ganda", "Vriddhi", "Dhruva", "Vyaghata",
  "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana", "Parigha", "Shiva",
  "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];

// Karana cycle: 7 movable karanas repeat, plus 4 fixed ones.
const MOVABLE_KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti"];
const FIXED_KARANAS = ["Shakuni", "Chatushpada", "Naga", "Kimstughna"];

const VARA_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Rahu Kaal occupies the Nth 1/8 segment of daytime, by weekday (Sun..Sat).
const RAHU_SEGMENT = [8, 2, 7, 5, 6, 4, 3];
const GULIKA_SEGMENT = [7, 6, 5, 4, 3, 2, 1];
const YAMA_SEGMENT = [5, 4, 3, 2, 1, 7, 6];

function karanaName(index: number): string {
  // 60 half-tithis per lunar month → karana cycle
  const i = index % 60;
  if (i === 0) return FIXED_KARANAS[3]; // Kimstughna (first half of Shukla Pratipada)
  if (i >= 57) return FIXED_KARANAS[i - 57]; // last three: Shakuni, Chatushpada, Naga
  return MOVABLE_KARANAS[(i - 1) % 7];
}

function fmtTime(d: Date, tzOffsetMin: number): string {
  const local = new Date(d.getTime() + tzOffsetMin * 60000);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export interface Panchang {
  date: string;
  vara: string;
  tithi: { name: string; paksha: string; number: number };
  nakshatra: { name: string; lord: string };
  yoga: string;
  karana: string;
  sunrise: string;
  sunset: string;
  rahuKaal: { start: string; end: string };
  gulikaKaal: { start: string; end: string };
  yamaganda: { start: string; end: string };
}

export function computePanchang(dateInput?: string | Date, tzOffsetMin = 330): Panchang {
  // Resolve the local calendar date, then evaluate at ~06:00 local (sunrise).
  const base = dateInput ? new Date(dateInput) : new Date();
  const localMidnightUtcMs = Math.floor((base.getTime() + tzOffsetMin * 60000) / 86400000) * 86400000 - tzOffsetMin * 60000;
  const sunriseMin = 6 * 60; // 06:00 local
  const sunsetMin = 18 * 60; // 18:00 local
  const evalDate = new Date(localMidnightUtcMs + sunriseMin * 60000);

  const jd = julianDay(evalDate);
  const sunSid = toSidereal(sunPosition(jd).lon, jd);
  const moonSid = toSidereal(moonLongitude(jd), jd);

  const diff = normalize360(moonSid - sunSid);

  // Tithi (1..30)
  const tithiIdx = Math.floor(diff / 12); // 0..29
  const paksha = tithiIdx < 15 ? "Shukla" : "Krishna";
  const tithiInPaksha = tithiIdx % 15; // 0..14
  const tithiName = TITHI_NAMES[tithiInPaksha];

  // Nakshatra
  const nakIdx = Math.floor(normalize360(moonSid) / NAKSHATRA_SPAN) % 27;
  const nak = NAKSHATRAS[nakIdx];

  // Yoga (sum of sidereal longitudes)
  const yogaIdx = Math.floor(normalize360(sunSid + moonSid) / (360 / 27)) % 27;

  // Karana (half-tithi)
  const karanaIdx = Math.floor(diff / 6);

  const weekday = new Date(localMidnightUtcMs + tzOffsetMin * 60000).getUTCDay();

  // Day length divided into 8 segments
  const dayLenMin = sunsetMin - sunriseMin;
  const seg = dayLenMin / 8;
  const segmentWindow = (n: number) => {
    const startMin = sunriseMin + (n - 1) * seg;
    const start = new Date(localMidnightUtcMs + startMin * 60000 - tzOffsetMin * 60000);
    const end = new Date(localMidnightUtcMs + (startMin + seg) * 60000 - tzOffsetMin * 60000);
    return { start: fmtTime(start, tzOffsetMin), end: fmtTime(end, tzOffsetMin) };
  };

  const sunriseDate = new Date(localMidnightUtcMs + sunriseMin * 60000 - tzOffsetMin * 60000);
  const sunsetDate = new Date(localMidnightUtcMs + sunsetMin * 60000 - tzOffsetMin * 60000);

  return {
    date: new Date(localMidnightUtcMs + tzOffsetMin * 60000).toISOString().split("T")[0],
    vara: VARA_NAMES[weekday],
    tithi: { name: tithiName, paksha, number: tithiIdx + 1 },
    nakshatra: { name: nak.name, lord: nak.lord },
    yoga: YOGA_NAMES[yogaIdx],
    karana: karanaName(karanaIdx),
    sunrise: fmtTime(sunriseDate, tzOffsetMin),
    sunset: fmtTime(sunsetDate, tzOffsetMin),
    rahuKaal: segmentWindow(RAHU_SEGMENT[weekday]),
    gulikaKaal: segmentWindow(GULIKA_SEGMENT[weekday]),
    yamaganda: segmentWindow(YAMA_SEGMENT[weekday]),
  };
}
