// Pure helpers for the Today screen: every word is assembled from engine output, nothing is invented.
import { GRAHA_ABBR, GRAHA_SHORT, SIGN_ORDER, ordinal, signAbbr, tithiName } from './jyotishNames';

export interface PanchangToday {
  date: string;
  vara: string;
  tithi: { name: string; paksha: 'Shukla' | 'Krishna' | string; number: number };
  nakshatra: { name: string; lord: string };
  yoga: string;
  karana: string;
  location: { place: string | null; isDefault: boolean; timezone: string };
}

/** "Chaturdashi of the waning Moon, in Uttara Phalguni" (desktop) / "Krishna Chaturdashi in Uttara Phalguni" (mobile). */
export function heroTitle(p: PanchangToday, form: 'long' | 'short'): string {
  const tithi = tithiName(p.tithi.name, p.tithi.number);
  const nak = p.nakshatra.name;
  if (tithi === 'Purnima') return form === 'long' ? `Purnima, the full Moon, in ${nak}` : `Purnima in ${nak}`;
  if (tithi === 'Amavasya') return form === 'long' ? `Amavasya, the new Moon, in ${nak}` : `Amavasya in ${nak}`;
  const waxing = p.tithi.paksha === 'Shukla';
  return form === 'long'
    ? `${tithi} of the ${waxing ? 'waxing' : 'waning'} Moon, in ${nak}`
    : `${p.tithi.paksha} ${tithi} in ${nak}`;
}

export interface GocharaItem { planet: string; sign: string; houseFromMoon: number; favourable: boolean; theme: string }
export interface GocharaReading { highlights: GocharaItem[]; sadeSati: { active: boolean; phase: string | null } }

export interface GocharaCell {
  house: number;
  sign: string;
  /** The Moon is transiting this house today. */
  moonHere: boolean;
  grahas: Array<{ planet: string; short: string; abbr: string; favourable: boolean }>;
}

/** Twelve houses counted from the natal Moon sign, with today's transits in each. */
export function gocharaCells(natalMoonSign: string, reading: GocharaReading): GocharaCell[] {
  const start = SIGN_ORDER.indexOf(natalMoonSign as typeof SIGN_ORDER[number]);
  if (start < 0) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const house = i + 1;
    const here = reading.highlights.filter((h) => h.houseFromMoon === house);
    return {
      house,
      sign: signAbbr(SIGN_ORDER[(start + i) % 12]),
      moonHere: here.some((h) => h.planet === 'Moon'),
      grahas: here.map((h) => ({ planet: h.planet, short: GRAHA_SHORT[h.planet] ?? h.planet, abbr: GRAHA_ABBR[h.planet] ?? h.planet, favourable: h.favourable })),
    };
  });
}

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * The day's Gochara in one or two sentences: where the Moon (and anything with it) is passing,
 * whether that house is classically supportive for the Moon, and what Saturn says about Sade Sati.
 * Returns segments so the house numbers can be set in bold.
 */
export function gocharaSentence(reading: GocharaReading, form: 'long' | 'short'): Array<{ text: string; bold?: boolean }> {
  const moon = reading.highlights.find((h) => h.planet === 'Moon');
  const saturn = reading.highlights.find((h) => h.planet === 'Saturn');
  if (!moon || !saturn) return [];
  const withMoon = reading.highlights.filter((h) => h.houseFromMoon === moon.houseFromMoon && h.planet !== 'Moon').map((h) => h.planet);
  const out: Array<{ text: string; bold?: boolean }> = [];
  const house = ordinal(moon.houseFromMoon);
  if (form === 'long') {
    const who = withMoon.length ? `The Moon and ${list(withMoon)} pass` : 'The Moon passes';
    out.push({ text: `${who} your ` }, { text: house, bold: true });
    out.push({ text: ` today — traditionally ${moon.favourable ? `a supportive day for ${moon.theme}` : `a day to go carefully with ${moon.theme}`}. Saturn in your ` });
    out.push({ text: ordinal(saturn.houseFromMoon), bold: true });
    out.push({ text: reading.sadeSati.active
      ? ` means Sade Sati is running (${reading.sadeSati.phase}).`
      : reading.sadeSati.phase ? ` is ${reading.sadeSati.phase.replace(/ \(.*\)$/, '')}; Sade Sati is not running.` : ' means Sade Sati is not running.' });
  } else {
    const who = withMoon.length ? `Moon and ${list(withMoon)} in your ` : 'Moon in your ';
    out.push({ text: who }, { text: house, bold: true });
    out.push({ text: `: ${moon.favourable ? `a good day for ${moon.theme}` : `go carefully with ${moon.theme}`}. ` });
    out.push({ text: reading.sadeSati.active ? `Sade Sati (${reading.sadeSati.phase}).` : 'No Sade Sati.' });
  }
  return out;
}

/** A question to offer in the Ask box, drawn from today's Moon transit. */
export function suggestedQuestion(reading: GocharaReading | null | undefined): string {
  const moon = reading?.highlights.find((h) => h.planet === 'Moon');
  if (!moon) return 'What does today hold for me?';
  return moon.favourable
    ? `What does today's ${ordinal(moon.houseFromMoon)} house transit support?`
    : `Why is the ${ordinal(moon.houseFromMoon)} house transit demanding?`;
}

/** Share of a period elapsed at `now`, clamped to 0..1. */
export function elapsedShare(start: string, end: string, now = new Date()): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!(e > s)) return 0;
  return Math.min(1, Math.max(0, (now.getTime() - s) / (e - s)));
}
