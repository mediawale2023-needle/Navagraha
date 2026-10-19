import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { reportEvidenceEligibility } from '../../server/reportEligibility';

const AS_OF = new Date('2026-10-19T00:00:00Z');

async function chart(date: string, time: string, latitude: number, longitude: number) {
  return getKundli(date, time, latitude, longitude, { timeAccuracy: 'exact' });
}

describe('Marriage report evidence eligibility', () => {
  it('refuses only when most required sections would be inconclusive', async () => {
    const kundli = await chart('1981-11-26', '01:59', 28.61, 77.21);
    const decision = reportEvidenceEligibility('marriage', kundli as any, AS_OF);

    expect(decision).toMatchObject({
      eligible: false,
      code: 'insufficient_marriage_evidence',
      inconclusiveSections: 5,
      requiredSections: 8,
    });
    expect(decision.message).toMatch(/not a difficult or negative relationship result/i);
    expect(decision.message).toMatch(/No payment will be taken/);
  });

  it.each([
    ['Challenging', '1990-09-25', '19:50', 51.51, -0.13],
    ['Very Challenging', '1984-05-17', '05:05', 22.57, 88.36],
  ])('keeps a %s relationship chart eligible', async (_verdict, date, time, latitude, longitude) => {
    const kundli = await chart(date, time, latitude as number, longitude as number);
    expect(reportEvidenceEligibility('marriage', kundli as any, AS_OF)).toMatchObject({
      eligible: true,
      code: 'eligible',
      inconclusiveSections: 0,
      requiredSections: 8,
    });
  });

  it('does not apply Marriage evidence policy to another product', async () => {
    const kundli = await chart('1981-11-26', '01:59', 28.61, 77.21);
    expect(reportEvidenceEligibility('finance', kundli as any, AS_OF)).toMatchObject({ eligible: true, code: 'eligible' });
  });
});
