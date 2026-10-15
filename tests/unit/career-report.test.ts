import { describe, expect, it } from 'vitest';
import { buildCareerEvidence } from '../../server/careerReportEvidence';
import { careerBrief, careerRemedies, careerSectionProblems } from '../../server/careerReport';
import { validateAnswer } from '../../server/agents/answerGuard';
import { careerDraftPrompt, countCareerWords, renderCareerSection, validateCareerDraft } from '../../server/careerReportRendering';
import { ASOF, fixtureChart, fixtureDraft } from '../fixtures/career-chart';

describe('Career evidence and realistic section contracts', () => {
  it('reproduces production D1/D10 placements and exact period boundaries', () => {
    const e = buildCareerEvidence(fixtureChart(), ASOF);
    expect(e.chart.planets.find((p) => p.name === 'Jupiter')).toMatchObject({ sign: 'Leo', house: 8 });
    expect(e.chart.vargas.D10.placements.find((p) => p.planet === 'Jupiter')).toMatchObject({ sign: 'Capricorn', house: 11 });
    expect(e.chart.planets.find((p) => p.name === 'Venus')).toMatchObject({ sign: 'Virgo', house: 9 });
    expect(e.chart.vargas.D10.placements.find((p) => p.planet === 'Venus')).toMatchObject({ sign: 'Leo', house: 6 });
    expect(e.packets[8].facts.find((f) => f.id.startsWith('Vimshottari.Antardasha.Saturn'))?.value).toMatchObject({ start: '2027-01-21T14:50:53.445Z', end: '2029-08-03T22:02:53.445Z' });
    expect(e.packets[3].facts.some((f) => f.id === 'D10.caveat' && /accurate birth time/.test(f.text))).toBe(true);
  });
  it.each([
    ['1991-11-13', '12:30', 15.8497, 74.4977], ['1985-03-22', '06:15', 28.6139, 77.2090], ['2000-07-04', '18:45', 19.0760, 72.8777],
  ] as const)('all ten realistic sections satisfy first-pass contracts for %s', (date, time, lat, lon) => {
    const e = buildCareerEvidence(fixtureChart(date, time, lat, lon), ASOF);
    expect(e.packets).toHaveLength(10);
    for (const p of e.packets) {
      const checked = validateCareerDraft(p, fixtureDraft(p));
      expect(checked.problems, p.heading).toEqual([]);
      const body = renderCareerSection(p, checked.draft!);
      expect(countCareerWords(body)).toBeGreaterThanOrEqual(p.minimumWords);
      for (const f of p.facts) expect(body).toContain(f.text);
      expect(careerDraftPrompt(p)).not.toMatch(/1991-11-13|latitude|longitude|birthUTC/);
    }
  });
  it('rejects changed canonical facts before generation', () => {
    for (const mutate of [
      (c: any) => { c.vargas.D10.placements.find((p: any) => p.planet === 'Jupiter').sign = 'Leo'; },
      (c: any) => { c.planets.find((p: any) => p.name === 'Venus').sign = 'Leo'; },
      (c: any) => { c.dashas.vimshottari.mahadashas[0].start = '2029-01-01T00:00:00.000Z'; },
    ]) { const k = fixtureChart(); mutate(k.chartData.canonical); expect(() => buildCareerEvidence(k, ASOF)).toThrow(/verification failed|complete canonical/); }
  });
  it('ignores stale legacy projections', () => {
    const k: any = fixtureChart(); k.dashas = [{ planet: 'Saturn', startDate: '2029-01-01' }]; k.chartData.dasamsa = { planetaryPositions: [{ planet: 'Jupiter', sign: 'Leo' }] };
    expect(buildCareerEvidence(k, ASOF).packets[3].facts.find((f) => f.id === 'D10.planet.Jupiter')?.text).toContain('Capricorn');
  });
  it('rejects incorrect contexts, missing balance, thin prose and invented claims', () => {
    const p = buildCareerEvidence(fixtureChart(), ASOF).packets[3];
    for (const mutate of [
      (d: any) => { d.supporting.contexts = ['D1']; }, (d: any) => { d.supporting.factIds = ['D1.planet.Jupiter']; },
      (d: any) => { delete d.limiting; }, (d: any) => { d.supporting.text = 'A short observation.'; },
      (d: any) => { d.supporting.text += ' Jupiter is in Leo in D10.'; }, (d: any) => { d.supporting.text += ' Saturn Antardasha begins in 2029.'; },
      (d: any) => { d.conclusion.text += ' You will become wealthy.'; }, (d: any) => { d.conclusion.text += ' You have a bright future.'; },
      (d: any) => { d.conclusion.text += ' You should pursue government and finance roles.'; },
    ]) { const d = fixtureDraft(p); mutate(d); expect(validateCareerDraft(p, d).problems.length).toBeGreaterThan(0); }
  });
  it('accepts ordinary astrological terminology without inventing chart facts', () => {
    const packet = buildCareerEvidence(fixtureChart(), ASOF).packets[3];
    const draft = fixtureDraft(packet);

    draft.supporting.text += ' The planetary influences described in the verified evidence can be interpreted as competing professional tendencies, rather than a fixed professional outcome.';

    expect(validateCareerDraft(packet, draft).problems).toEqual([]);
  });

  it('accepts a correctly cited planetary placement in interpretation', () => {
    const packet = buildCareerEvidence(fixtureChart(), ASOF).packets[3];
    const draft = fixtureDraft(packet);

    draft.supporting.factIds = [...new Set([...draft.supporting.factIds, 'D10.planet.Jupiter'])];
    draft.supporting.contexts = [...new Set([
      ...draft.supporting.factIds.flatMap(id =>
        packet.facts.find(f => f.id === id)?.contexts ?? []
      )
    ])] as typeof draft.supporting.contexts;

    draft.supporting.text += ' Jupiter occupies Capricorn in the D10 chart, which is relevant to interpreting professional responsibilities.';

    expect(validateCareerDraft(packet, draft).problems).toEqual([]);
  });

  it('preserves strict shared accuracy checks', () => {
    const e = buildCareerEvidence(fixtureChart(), ASOF);
    const ctx = { chart: e.chart, packetText: e.brief.text, running: { mahadasha: 'Jupiter' as const, antardasha: 'Jupiter' as const }, timing: { mahadashaReliable: true, antardashaReliable: true }, asOf: ASOF };
    expect(validateAnswer('In D1 Jupiter is in Leo. In D10 Jupiter is in Capricorn. In D1 Venus is in Virgo. In D10 Venus is in Leo.', ctx)).toEqual([]);
    expect(validateAnswer('In D10 Jupiter is in Leo. In D1 Venus is in Leo.', ctx)).toHaveLength(2);
    expect(validateAnswer('Saturn Antardasha begins in 2029.', ctx).join(' ')).toMatch(/not 2029/);
    expect(validateAnswer('Saturn Antardasha begins in 2027.', ctx)).toEqual([]);
  });
  it('rejects incorrect D10 placements expressed using occupies', () => {
    const e = buildCareerEvidence(fixtureChart(), ASOF);
    const ctx = {
      chart: e.chart,
      packetText: e.brief.text,
      running: { mahadasha: 'Jupiter' as const, antardasha: 'Jupiter' as const },
      timing: { mahadashaReliable: true, antardashaReliable: true },
      asOf: ASOF,
    };

    expect(validateAnswer('Jupiter occupies Leo in the D10 chart.', ctx).length).toBeGreaterThan(0);
    expect(validateAnswer('Jupiter occupies Capricorn in the D10 chart.', ctx)).toEqual([]);
  });

  it('resolves cancellation-name contradiction without authorising invented yogas', () => {
    const f = careerBrief(fixtureChart(), ASOF)!.facts;
    expect(careerSectionProblems('Career Yogas', 'Neecha Bhanga is a cancellation of debilitation.', { ...f, careerYogas: ['Neecha Bhanga Raja Yoga'] }).join(' ')).not.toContain('must explain Neecha');
    expect(careerSectionProblems('Career Yogas', 'Lakshmi Yoga confers wealth.', f).join(' ')).toContain('engine did not detect');
  });
  it('retains weak-field distinctions and remedy safety', () => {
    const e = buildCareerEvidence(fixtureChart(), ASOF);
    for (const f of e.packets[6].facts) {
      const v = f.value as any;
      if (v.rating === 'weakly supported') expect(f.text).toContain('less indicated, not recommended');
      for (const indicator of [...v.plus, ...v.minus]) expect(indicator).toMatch(/^D1:|^D10:/);
    }
    expect(careerRemedies(['Wear a blue sapphire for Saturn', 'Recite a prayer without naming a planet'], e.brief.facts)).toEqual([]);
  });
});
