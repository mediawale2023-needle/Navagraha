import { describe, expect, it } from 'vitest';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { buildCareerReportFacts, CAREER_HEADINGS, dateOf } from '../../server/careerReportEvidence';
import { ASOF, fixtureChart } from '../fixtures/career-chart';

const CHARTS = [['1985-03-22', '06:15', 28.6139, 77.209], ['1991-11-13', '12:30', 15.8497, 74.4977], ['2000-07-04', '18:45', 19.076, 72.8777]] as const;
const ORD = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

describe('Career facts are written by code from the canonical chart', () => {
  it.each(CHARTS)('every placement, house, lordship and date in the facts matches the engine (%s)', (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const c = k.chartData.canonical; const e = buildCareerReportFacts(k, ASOF);
    const text = e.sections.flatMap((s) => s.facts.map((f) => f.text)).join('\n');
    expect(e.sections.map((s) => s.heading)).toEqual(CAREER_HEADINGS);
    // "<Planet> is in <Sign> in your <N>th house" (D1)
    let d1 = 0;
    for (const m of Array.from(text.matchAll(/\b(?:the )?(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu),?[^.]{0,80}? is in (\w+) in your (\d+)\w\w house/gi))) {
      d1++; expect(c.planets.find((p) => p.name.toLowerCase() === m[1].toLowerCase())).toMatchObject({ sign: m[2], house: Number(m[3]) });
    }
    // "In the D10 it is in <Sign> in the <N>th house", following a sentence about one planet
    let d10 = 0;
    for (const m of Array.from(text.matchAll(/(?:^|\. )(?:Its lord, )?(?:the )?(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu)[^.]*\.(?: It rules [^.]*\.)? In the D10 it is in (\w+) in the (\d+)\w\w house/gim))) {
      d10++; expect(c.vargas.D10.placements.find((p) => p.planet.toLowerCase() === m[1].toLowerCase())).toMatchObject({ sign: m[2], house: Number(m[3]) });
    }
    expect(d1).toBeGreaterThan(4); expect(d10).toBeGreaterThanOrEqual(3);
    expect(text).toContain(`Your 10th house, the house of career and public standing, is ${c.houses[9].sign}.`);
    expect(text).toContain(`The lord of your 10th house, ${['Sun', 'Moon'].includes(c.houses[9].lord) ? 'the ' : ''}${c.houses[9].lord}, is in ${c.planets.find((p) => p.name === c.houses[9].lord)!.sign} in your ${ORD(c.planets.find((p) => p.name === c.houses[9].lord)!.house)} house`);
    expect(text).toContain(`the rising sign is ${['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'][c.vargas.D10.ascendantSignIndex]}.`);
    // Every date is a Vimshottari boundary.
    const boundaries = new Set(c.dashas.vimshottari.mahadashas.flatMap((m) => [m.start, m.end, ...m.antardashas.flatMap((a) => [a.start, a.end])]).map(dateOf));
    const dates = text.match(/\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g)!;
    expect(dates.length).toBeGreaterThan(4);
    for (const d of dates) expect(boundaries.has(d)).toBe(true);
  });
  it.each(CHARTS)('names the running Mahadasha and Antardasha with their engine dates (%s)', (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const c = k.chartData.canonical; const e = buildCareerReportFacts(k, ASOF);
    const now = (p: { start: string; end: string }) => Date.parse(p.start) <= +ASOF && +ASOF < Date.parse(p.end);
    const md = c.dashas.vimshottari.mahadashas.find(now)!; const ad = md.antardashas.find(now)!;
    const current = e.sections.find((s) => s.key === 'current')!.facts;
    expect(current.find((f) => f.id === 'current.mahadasha')!.text).toContain(`${md.lord} Mahadasha, the major period running from ${dateOf(md.start)} to ${dateOf(md.end)}`);
    expect(current.find((f) => f.id === 'current.antardasha')!.text).toContain(`${ad.lord} Antardasha (sub-period) runs from ${dateOf(ad.start)} to ${dateOf(ad.end)}`);
    expect(current.filter((f) => f.required).map((f) => f.id)).toEqual(['current.mahadasha', 'current.antardasha']);
  });
  it('covers every period overlapping the next four years, across a Mahadasha boundary', () => {
    const k = fixtureChart('2000-07-04', '18:45', 19.076, 72.8777); const e = buildCareerReportFacts(k, ASOF);
    const ids = e.sections.find((s) => s.key === 'periods')!.facts.map((f) => f.id);
    expect(ids).toEqual(['period.Mahadasha.Venus.2010-07-21', 'period.Antardasha.Mercury.2026-07-21', 'period.Antardasha.Ketu.2029-05-21', 'period.Mahadasha.Sun.2030-07-21', 'period.Antardasha.Sun.2030-07-21']);
  });
  it('derives the work style from the 6th and 7th houses and the business rating, and states it once in plain words', () => {
    for (const [date, time, lat, lon] of CHARTS) {
      const e = buildCareerReportFacts(fixtureChart(date, time, lat, lon), ASOF);
      expect(e.workStyle).toBe('mixed');
      expect(e.sections[0].facts[0].text).toContain(e.workStyleSentence);
    }
  });
  it('marks the essential interpretations required and weak fields optional', () => {
    const e = buildCareerReportFacts(fixtureChart(), ASOF);
    const required = Object.fromEntries(e.sections.map((s) => [s.key, s.facts.filter((f) => f.required).map((f) => f.id)]));
    expect(required.overview).toEqual(['overview.workStyle', 'overview.fields', 'overview.strength', 'overview.caution']);
    expect(required.chart).toEqual(['chart.tenth', 'chart.tenthLord', 'chart.d10Lagna', 'chart.d10Tenth']);
    expect(required.guidance).toEqual(['field.administration', 'field.government', 'field.business', 'field.finance', 'field.communication']);
    expect(e.weakFields).toEqual(['advisory']);
    expect(e.sections.find((s) => s.key === 'guidance')!.facts.find((f) => f.id === 'field.advisory')).toMatchObject({ required: false, explain: true });
  });
  it.each(CHARTS)('reads as report prose: no engine shorthand, instructions or yoga promises (%s)', (date, time, lat, lon) => {
    const e = buildCareerReportFacts(fixtureChart(date, time, lat, lon), ASOF);
    const text = e.sections.flatMap((s) => s.facts.map((f) => f.text)).join('\n');
    expect(text).not.toMatch(/\bbindus?\b|\bengine\b|\bdusthana\b|\bkendra\b|\btrikona\b|do not|never state|status and success|marked rise|financial gain|undefined|NaN/);
    expect(text).not.toMatch(/\b(?:Sun|Moon) (?:is|rules|sits|occupies)\b(?<!the (?:Sun|Moon) \w+)/);
  });
  it('refuses an approximate birth time and a stored chart that the engine does not reproduce', () => {
    const approximate = computeCanonicalChart(resolveBirthWithCoordinates({ date: '1991-11-13', time: '12:30', latitude: 15.8497, longitude: 74.4977, timeAccuracy: 'approximate' }));
    expect(() => buildCareerReportFacts({ chartData: { canonical: approximate } }, ASOF)).toThrow(/exact birth time/);
    const k: any = fixtureChart(); k.chartData.canonical = JSON.parse(JSON.stringify(k.chartData.canonical));
    k.chartData.canonical.planets.find((p: any) => p.name === 'Jupiter').sign = 'Aries';
    expect(() => buildCareerReportFacts(k, ASOF)).toThrow(/canonical verification failed: planets/);
  });
});
