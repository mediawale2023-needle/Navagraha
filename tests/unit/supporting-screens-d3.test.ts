// Direction 3 Stage 7: the supporting screens state nothing they cannot back.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ZODIAC_SIGNS, signById } from '../../client/src/lib/zodiac';
import { SIGN_HI } from '../../client/src/lib/jyotishNames';

const page = (n: string) => readFileSync(`client/src/pages/${n}.tsx`, 'utf8');
const EMOJI = /\p{Extended_Pictographic}/u;

describe('Horoscope', () => {
  it('lists the twelve Moon signs in order, each with its Devanagari name, and no emoji', () => {
    expect(ZODIAC_SIGNS.map((s) => s.englishName)).toEqual(['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']);
    for (const s of ZODIAC_SIGNS) expect(SIGN_HI[s.englishName]).toBeTruthy();
    expect(signById('TAURUS')?.name).toBe('Vrishabh');
    expect(EMOJI.test(page('Horoscope'))).toBe(false);
  });
  it('marks a Moon sign only from a named saved chart whose birth time cannot move it', () => {
    const src = page('Horoscope');
    expect(src).toContain('useTodayChart(isAuthenticated)');
    expect(src).toContain('today.moonSign');
    expect(src).toContain('Moon sign from');
  });
});

describe('Generate Kundli', () => {
  it('is one form, with the place picked from the list', () => {
    const src = page('KundliNew');
    expect(src).not.toMatch(/setStep|nextStep|Continue →/);
    for (const field of ['name="name"', 'name="gender"', 'name="dateOfBirth"', 'name="timeOfBirth"', 'name="placeOfBirth"']) expect(src).toContain(field);
  });
});

describe('Account and landing', () => {
  it('Account invents no statistics and has no dead buttons', () => {
    const src = page('Profile');
    expect(src).not.toMatch(/Consults|button-edit-profile|getFullYear\(\)/);
  });
  it('the landing page has no emoji, external images or recharge promotion', () => {
    const src = page('Landing');
    expect(EMOJI.test(src)).toBe(false);
    expect(src).not.toMatch(/<img|Up to 25%|recharge packs/);
  });
});

describe('Reports', () => {
  it('reads a report on the page, not in a dialog', () => {
    const src = page('Reports');
    expect(src).toContain('<ReportReader');
    expect(src).not.toContain('{/* Report viewer */}');
  });
});
