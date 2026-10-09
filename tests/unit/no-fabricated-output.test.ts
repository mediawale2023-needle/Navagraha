// Audit Gate A: no hard-coded score, rating, experience, price, online status or audience
// claim stands in for real data anywhere in the client.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ratingLabel, experienceLabel, priceLabel } from '../../client/src/lib/astrologerDisplay';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

const FABRICATIONS: Array<[string, RegExp]> = [
  ['a default rating', /rating\s*(\|\||\?\?)\s*'?[1-9]/i],
  ['a default experience', /experience\s*(\|\||\?\?)\s*'?[1-9]/i],
  ['a default price', /pricePerMinute\s*(\|\||\?\?)\s*'?[1-9]/i],
  ['a default compatibility score', /Score\s*(\|\||\?\?)\s*[1-9]/],
  ['an audience claim', /thousands of|lakhs of|millions of/i],
  ['a fixed star rating', /stars:\s*[1-5]\b/],
];

describe('the client shows no invented figures', () => {
  const sources = files('client/src').map((p) => [p, readFileSync(p, 'utf8')] as const);
  it.each(FABRICATIONS)('no %s', (_label, pattern) => {
    const offenders = sources.filter(([, src]) => pattern.test(src)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('Matchmaking shows the calculated gunas out of 36, not a percentage or invented sub-scores', () => {
    const src = readFileSync('client/src/pages/Matchmaking.tsx', 'utf8');
    expect(src).toMatch(/result\.gunaScore/);
    expect(src).toMatch(/result\.details/);
    expect(src).not.toMatch(/mentalScore|physicalScore|emotionalScore|financialScore|Strong emotional connection/);
  });
});

describe('astrologer facts are shown only when they exist', () => {
  it('rating', () => {
    expect(ratingLabel('4.66')).toBe('4.7');
    expect(ratingLabel(null)).toBe('New');
    expect(ratingLabel('0')).toBe('New');
  });
  it('experience', () => {
    expect(experienceLabel(12)).toBe('12y exp');
    expect(experienceLabel(null)).toBeNull();
    expect(experienceLabel(0)).toBeNull();
  });
  it('price', () => {
    expect(priceLabel('25')).toBe('₹25');
    expect(priceLabel('12.5')).toBe('₹12.50');
    expect(priceLabel(undefined)).toBeNull();
  });
});
