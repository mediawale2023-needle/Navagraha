import { describe, expect, it } from 'vitest';
import { calculateYoginiDasha, calculateDashas } from '../../server/astroEngine/dasha';

describe('Yogini Dasha', () => {
  const periods = calculateYoginiDasha(45.5, new Date('1992-05-13T02:04:00Z'));

  it('produces a sequence with valid status and 1..8 year lengths', () => {
    expect(periods.length).toBeGreaterThan(8);
    for (const p of periods) {
      expect(['Mangala', 'Pingala', 'Dhanya', 'Bhramari', 'Bhadrika', 'Ulka', 'Siddha', 'Sankata']).toContain(p.yogini);
      expect(['past', 'current', 'upcoming']).toContain(p.status);
    }
  });

  it('has exactly one current period', () => {
    expect(periods.filter((p) => p.status === 'current').length).toBe(1);
  });
});

describe('Pratyantardasha', () => {
  it('attaches pratyantardashas only to the running antardasha', () => {
    const dashas = calculateDashas(45.5, new Date('1992-05-13T02:04:00Z'));
    const curMd = dashas.find((d) => d.status === 'current');
    const curAd = curMd?.antardashas.find((a) => a.status === 'current');
    expect(curAd?.pratyantardashas?.length).toBe(9);
    // a non-current antardasha should not carry pratyantardashas
    const otherAd = curMd?.antardashas.find((a) => a.status !== 'current');
    expect(otherAd?.pratyantardashas).toBeUndefined();
  });
});
