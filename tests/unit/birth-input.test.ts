import { expect, it } from 'vitest';
import { BirthInputError, getKundli } from '../../server/astroEngine';
import { julianDay } from '../../server/astroEngine/core';

it.each(['', '6:30', '06junk:30', '06:60', '24:00', '06:30:60'])('rejects malformed or missing birth time %s', async time => {
  await expect(getKundli('1990-08-15', time, 12.97, 77.59)).rejects.toBeInstanceOf(BirthInputError);
});
it('preserves seconds in the real birth Julian day instead of silently truncating them', async () => {
  const chart = await getKundli('1990-08-15', '06:30:45', 12.97, 77.59);
  expect(chart.chartData.calculationInputs!.julianDay).toBe(julianDay(new Date('1990-08-15T01:00:45Z')));
});
