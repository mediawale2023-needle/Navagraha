// Direction 3 Stage 3: Today is assembled only from engine output, and matches the approved mockup
// wherever the mockup's sample chart (Ananya, Taurus Moon in Rohini) and day (9 Oct 2026) apply.
import { describe, expect, it } from 'vitest';
import { heroTitle, gocharaCells, gocharaSentence, suggestedQuestion, elapsedShare, type GocharaReading, type PanchangToday } from '../../client/src/lib/today';
import { segmentPath } from '../../client/src/lib/nakshatraRing';
import { NAKSHATRA_ORDER, nakshatraHi, tithiHi, tithiName, yogaHi, karanaHi } from '../../client/src/lib/jyotishNames';
import { NAKSHATRAS } from '../../server/astroEngine/vedic';
import { TITHI_NAMES, YOGA_NAMES } from '../../server/astroEngine/panchang';
import { signHoroscope } from '../../server/astroEngine/gochara';

const panchang = (over: Partial<PanchangToday['tithi']> = {}): PanchangToday => ({
  date: '2026-10-09', vara: 'Friday',
  tithi: { name: 'Chaturdashi', paksha: 'Krishna', number: 29, ...over },
  nakshatra: { name: 'Uttara Phalguni', lord: 'Sun' }, yoga: 'Brahma', karana: 'Vishti',
  location: { place: null, isDefault: true, timezone: 'Asia/Kolkata' },
});

// The mockup's Gochara: Taurus Moon; Mars and Jupiter 3rd, Ketu 4th, Moon and Sun 5th, Mercury and Venus 6th, Rahu 10th, Saturn 11th.
const mockupReading: GocharaReading = {
  highlights: [
    { planet: 'Moon', sign: 'Virgo', houseFromMoon: 5, favourable: false, theme: 'creativity, children and learning' },
    { planet: 'Sun', sign: 'Virgo', houseFromMoon: 5, favourable: false, theme: 'creativity, children and learning' },
    { planet: 'Mercury', sign: 'Libra', houseFromMoon: 6, favourable: true, theme: 'competition, debts and daily work' },
    { planet: 'Venus', sign: 'Libra', houseFromMoon: 6, favourable: false, theme: 'competition, debts and daily work' },
    { planet: 'Mars', sign: 'Cancer', houseFromMoon: 3, favourable: true, theme: 'courage, effort and short trips' },
    { planet: 'Jupiter', sign: 'Cancer', houseFromMoon: 3, favourable: false, theme: 'courage, effort and short trips' },
    { planet: 'Saturn', sign: 'Pisces', houseFromMoon: 11, favourable: true, theme: 'gains, friends and wishes' },
    { planet: 'Rahu', sign: 'Aquarius', houseFromMoon: 10, favourable: false, theme: 'career and public standing' },
    { planet: 'Ketu', sign: 'Leo', houseFromMoon: 4, favourable: false, theme: 'home, comfort and peace of mind' },
  ],
  sadeSati: { active: false, phase: null },
};
const text = (segs: Array<{ text: string }>) => segs.map((s) => s.text).join('');

describe('Panchang hero', () => {
  it('words the tithi as the mockup does, on desktop and mobile', () => {
    expect(heroTitle(panchang(), 'long')).toBe('Chaturdashi of the waning Moon, in Uttara Phalguni');
    expect(heroTitle(panchang(), 'short')).toBe('Krishna Chaturdashi in Uttara Phalguni');
    expect(heroTitle(panchang({ paksha: 'Shukla', name: 'Panchami', number: 5 }), 'long')).toBe('Panchami of the waxing Moon, in Uttara Phalguni');
  });
  it('tells Purnima from Amavasya by the tithi number', () => {
    expect(heroTitle(panchang({ name: 'Purnima/Amavasya', paksha: 'Shukla', number: 15 }), 'long')).toBe('Purnima, the full Moon, in Uttara Phalguni');
    expect(heroTitle(panchang({ name: 'Purnima/Amavasya', paksha: 'Krishna', number: 30 }), 'short')).toBe('Amavasya in Uttara Phalguni');
    expect(tithiName('Purnima/Amavasya', 30)).toBe('Amavasya');
  });
  it('has a Devanagari name for every tithi, nakshatra, yoga and karana the engine can return', () => {
    expect([...NAKSHATRA_ORDER]).toEqual(NAKSHATRAS.map((n) => n.name));
    for (const n of NAKSHATRAS) expect(nakshatraHi(n.name)).toBeTruthy();
    for (const t of TITHI_NAMES.filter((t) => t.includes('/') === false)) expect(tithiHi(t)).toBeTruthy();
    expect(tithiHi('Purnima')).toBe('पूर्णिमा');
    expect(tithiHi('Amavasya')).toBe('अमावस्या');
    for (const y of YOGA_NAMES) expect(yogaHi(y)).toBeTruthy();
    for (const k of ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti', 'Shakuni', 'Chatushpada', 'Naga', 'Kimstughna']) expect(karanaHi(k)).toBeTruthy();
    expect(nakshatraHi('Uttara Phalguni')).toBe('उत्तर फाल्गुनी');
  });
});

describe('nakshatra ring', () => {
  it('draws the same segments as the mockup: today Uttara Phalguni, birth Rohini', () => {
    expect(segmentPath(11)).toBe('M181.5 213.6 A112 112 0 0 1 158.3 225.2 L149.4 200.8 A86 86 0 0 0 167.3 191.9 Z');
    expect(segmentPath(3)).toBe('M192.0 34.2 A112 112 0 0 1 209.8 53.1 L189.0 68.6 A86 86 0 0 0 175.3 54.1 Z');
  });
});

describe('Gochara strip', () => {
  it('counts twelve houses from the natal Moon and places each graha once', () => {
    const cells = gocharaCells('Taurus', mockupReading);
    expect(cells.map((c) => `${c.house} · ${c.sign}`)).toEqual(['1 · Tau', '2 · Gem', '3 · Can', '4 · Leo', '5 · Vir', '6 · Lib', '7 · Sco', '8 · Sag', '9 · Cap', '10 · Aqu', '11 · Pis', '12 · Ari']);
    expect(cells[2].grahas.map((g) => [g.short, g.favourable])).toEqual([['Mars', true], ['Jup', false]]);
    expect(cells[4].moonHere).toBe(true);
    expect(cells[4].grahas.map((g) => g.abbr)).toEqual(['Mo', 'Su']);
    expect(cells.flatMap((c) => c.grahas)).toHaveLength(9);
  });
  it('writes the mockup sentences from the reading', () => {
    expect(text(gocharaSentence(mockupReading, 'long'))).toBe('The Moon and Sun pass your 5th today — traditionally a day to go carefully with creativity, children and learning. Saturn in your 11th means Sade Sati is not running.');
    expect(text(gocharaSentence(mockupReading, 'short'))).toBe('Moon and Sun in your 5th: go carefully with creativity, children and learning. No Sade Sati.');
    expect(suggestedQuestion(mockupReading)).toBe('Why is the 5th house transit demanding?');
  });
  it('states a running Sade Sati with its phase', () => {
    const r = { ...mockupReading, sadeSati: { active: true, phase: 'peak phase' } };
    expect(text(gocharaSentence(r, 'long'))).toContain('means Sade Sati is running (peak phase).');
    expect(text(gocharaSentence(r, 'short'))).toContain('Sade Sati (peak phase).');
  });
  it('works on the engine’s own Gochara reading', () => {
    const live = signHoroscope('taurus', 'today', new Date('2026-10-09T06:00:00Z'));
    const cells = gocharaCells('Taurus', live);
    expect(cells.flatMap((c) => c.grahas)).toHaveLength(9);
    expect(cells.filter((c) => c.moonHere)).toHaveLength(1);
    expect(text(gocharaSentence(live, 'long'))).toMatch(/^The Moon .* your \d+(st|nd|rd|th) today — traditionally .*Saturn in your \d+/);
  });
});

describe('Vimshottari card', () => {
  it('fills the bar with the share of the Mahadasha elapsed', () => {
    expect(elapsedShare('2020-09-01', '2036-09-01', new Date('2028-09-01'))).toBeCloseTo(0.5, 2);
    expect(elapsedShare('2020-09-01', '2036-09-01', new Date('2040-01-01'))).toBe(1);
    expect(elapsedShare('2036-09-01', '2020-09-01')).toBe(0);
  });
});
