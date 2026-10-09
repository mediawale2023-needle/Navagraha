/**
 * Ashtakoota golden cases. Every expected value is worked by hand from the
 * classical tables (Varna by sign element, Tara counted both ways mod 9, the
 * 14-yoni table, natural planetary friendships, Bhakoot 2/12-5/9-6/8, Nadi by
 * nakshatra), not taken from the engine. Gana follows this engine's table,
 * which schools differ on.
 */
import { describe, expect, it } from 'vitest';
import { ashtakootMatch } from '../../server/astroEngine/matching';
import { matchRoles } from '../../server/astroEngine';

const NAK = 360 / 27;
const mid = (nakIdx: number) => nakIdx * NAK + NAK / 2;
const ASHWINI = mid(0), ROHINI = mid(3), ARDRA = mid(5), PUSHYA = mid(7), MAGHA = mid(9);
const ANURADHA = mid(16), MULA = mid(18), PURVA_ASHADHA = mid(19);
const PUNARVASU_GEMINI = 83, KRITTIKA_ARIES = 28, KRITTIKA_TAURUS = 32;

const kootas = (r: ReturnType<typeof ashtakootMatch>) => Object.fromEntries(r.details.map((d) => [d.koot, d.score]));

describe('Ashtakoota golden cases', () => {
  it('bride Ashwini (Aries), groom Rohini (Taurus)', () => {
    const r = ashtakootMatch(ASHWINI, ROHINI);
    expect(kootas(r)).toEqual({ Varna: 0, Vashya: 2, Tara: 1.5, Yoni: 3, 'Graha Maitri': 3, Gana: 5, Bhakoot: 0, Nadi: 8 });
    expect(r.score).toBe(22.5);
    expect(r.doshas).toEqual([{ type: 'Bhakoot Dosha', cancelled: false, cancellation: null }]);
    expect(r.dosha).toMatchObject({ hasDosha: true, type: 'Bhakoot Dosha' });
  });

  it('swapping bride and groom changes the asymmetric kootas', () => {
    const r = ashtakootMatch(ROHINI, ASHWINI);
    expect(kootas(r)).toEqual({ Varna: 1, Vashya: 2, Tara: 1.5, Yoni: 3, 'Graha Maitri': 3, Gana: 5, Bhakoot: 0, Nadi: 8 });
    expect(r.score).toBe(23.5);
  });

  it('Graha Maitri uses the natural friendships', () => {
    expect(kootas(ashtakootMatch(MAGHA, ARDRA))['Graha Maitri']).toBe(4);    // Sun→Mercury neutral, Mercury→Sun friend
    expect(kootas(ashtakootMatch(PUSHYA, ROHINI))['Graha Maitri']).toBe(0.5); // Moon→Venus neutral, Venus→Moon enemy
    expect(kootas(ashtakootMatch(ASHWINI, ANURADHA))['Graha Maitri']).toBe(5); // both Mars
  });

  it('Yoni uses the 14-yoni table', () => {
    expect(kootas(ashtakootMatch(KRITTIKA_ARIES, PURVA_ASHADHA)).Yoni).toBe(0); // Sheep–Monkey, sworn enemies
    expect(kootas(ashtakootMatch(KRITTIKA_ARIES, ARDRA)).Yoni).toBe(1);         // Sheep–Dog
    expect(kootas(ashtakootMatch(ANURADHA, MULA)).Yoni).toBe(0);                // Deer–Dog, sworn enemies
    expect(kootas(ashtakootMatch(ASHWINI, ASHWINI)).Yoni).toBe(4);
  });

  it('Nadi Dosha is cancelled for the same sign in different nakshatras', () => {
    const r = ashtakootMatch(ARDRA, PUNARVASU_GEMINI);
    expect(kootas(r).Nadi).toBe(0);
    expect(kootas(r).Bhakoot).toBe(7);
    expect(r.doshas).toEqual([{ type: 'Nadi Dosha', cancelled: true, cancellation: 'both Moons are in Gemini but in different nakshatras' }]);
    expect(r.dosha.hasDosha).toBe(false);
  });

  it('Nadi Dosha is cancelled for the same nakshatra in different signs; Bhakoot can still stand', () => {
    const r = ashtakootMatch(KRITTIKA_ARIES, KRITTIKA_TAURUS);
    expect(r.doshas).toEqual([
      { type: 'Nadi Dosha', cancelled: true, cancellation: 'both Moons are in Krittika but in different signs' },
      { type: 'Bhakoot Dosha', cancelled: false, cancellation: null },
    ]);
    expect(r.dosha).toMatchObject({ hasDosha: true, type: 'Bhakoot Dosha' });
  });

  it('Nadi Dosha stands for the same nakshatra in the same sign', () => {
    const r = ashtakootMatch(ROHINI, ROHINI);
    expect(r.doshas).toEqual([{ type: 'Nadi Dosha', cancelled: false, cancellation: null }]);
  });

  it('Bhakoot Dosha is cancelled when the sign lords are the same or mutual friends', () => {
    const friends = ashtakootMatch(MAGHA, MULA); // Leo/Sagittarius 5/9; Sun and Jupiter are mutual friends
    expect(kootas(friends).Bhakoot).toBe(0);
    expect(friends.doshas).toEqual([{ type: 'Bhakoot Dosha', cancelled: true, cancellation: 'the Moon-sign lords Sun and Jupiter are mutual friends' }]);
    const sameLord = ashtakootMatch(ASHWINI, ANURADHA); // Aries/Scorpio 6/8, both Mars
    expect(sameLord.doshas.find((d) => d.type === 'Bhakoot Dosha')).toEqual({ type: 'Bhakoot Dosha', cancelled: true, cancellation: 'both Moon signs are ruled by Mars' });
  });
});

describe('bride and groom roles', () => {
  const p = (gender?: string) => ({ dateOfBirth: '1990-01-01', timeOfBirth: '10:00', latitude: 19, longitude: 72, gender });
  it('the woman is scored as the bride whichever form slot she is in', () => {
    expect(matchRoles(p('male'), p('female'))).toEqual({ bride: 'person2', assumed: false });
    expect(matchRoles(p('female'), p('male'))).toEqual({ bride: 'person1', assumed: false });
  });
  it('any other pair scores person 1 as the bride and says so', () => {
    expect(matchRoles(p('male'), p('male'))).toEqual({ bride: 'person1', assumed: true });
    expect(matchRoles(p('other'), p('female'))).toEqual({ bride: 'person1', assumed: true });
    expect(matchRoles(p(), p())).toEqual({ bride: 'person1', assumed: true });
  });
});
