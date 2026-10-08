import { expect, it } from 'vitest';
import { BirthInputError, getKundli } from '../../server/astroEngine';

it.each(['', '6:30', '06junk:30', '06:60', '24:00', '06:30:60'])('rejects malformed or missing birth time %s', async time => {
  await expect(getKundli('1990-08-15', time, 12.97, 77.59)).rejects.toBeInstanceOf(BirthInputError);
});
it('preserves seconds in the birth instant and Julian day instead of silently truncating them', async () => {
  const withSeconds = (await getKundli('1990-08-15', '06:30:45', 12.97, 77.59)).chartData.canonical;
  const withoutSeconds = (await getKundli('1990-08-15', '06:30', 12.97, 77.59)).chartData.canonical;
  expect(withSeconds.birth.localTime).toBe('06:30:45');
  expect(withSeconds.birth.birthUTC).toBe('1990-08-15T01:00:45.000Z');
  expect((withSeconds.meta.julianDayUT - withoutSeconds.meta.julianDayUT) * 86400).toBeCloseTo(45, 3);
});
