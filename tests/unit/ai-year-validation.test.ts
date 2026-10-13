// AI year and period-boundary validation (PR #100). A calendar year is accepted when it lies inside a
// timing range the facts state; a stated Mahadasha/Antardasha start or end is checked against the
// calculated Vimshottari dates. Approximate-time charts keep every PR #98 refusal.
import { describe, expect, it } from 'vitest';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { getKundli, transitsForChart, transitSummary } from '../../server/astroEngine/index';
import { buildEvidencePacket, routeQuestion } from '../../server/agents/askKundli';
import { validateAnswer, type GuardContext } from '../../server/agents/answerGuard';
import { chartSummary, reportWindow } from '../../server/aiAstrologerService';
import { textProblems } from '../../server/reportQuality';

const asOf = new Date('2026-10-13T06:00:00Z');
const years = (text: string) => new Set(Array.from(text.matchAll(/\b(?:19|20|21)\d{2}\b/g)).map((m) => Number(m[0])));

async function load(date: string, time: string, timeAccuracy: 'exact' | 'approximate' = 'exact', lat = 28.6139, lng = 77.209) {
  const nk: any = await getKundli(date, time, lat, lng, { timeAccuracy });
  const row: any = { name: 'Test', dateOfBirth: date, timeOfBirth: time, placeOfBirth: 'Delhi', zodiacSign: nk.zodiacSign, moonSign: nk.moonSign, ascendant: nk.ascendant, chartData: { ...nk.chartData, isBirthTimeApproximate: timeAccuracy === 'approximate' }, dashas: nk.dashas, doshas: nk.doshas };
  const chart = nk.chartData.canonical as CanonicalChart;
  const transits = transitSummary(transitsForChart(chart, nk.chartData.ashtakavarga?.sav, asOf));
  const t = asOf.getTime();
  const mds = chart.dashas.vimshottari.mahadashas;
  const i = mds.findIndex((m) => Date.parse(m.start) <= t && t < Date.parse(m.end));
  const md = mds[i], next = mds[i + 1];
  const ad = md.antardashas.find((a) => Date.parse(a.start) <= t && t < Date.parse(a.end))!;
  return { row, chart, transits, md, next, ad };
}
const ask = (chart: CanonicalChart, q: string, transits?: string) => buildEvidencePacket(chart, routeQuestion(q), asOf, transits).guard;
const ok = (s: string, g: GuardContext) => expect(validateAnswer(s, g), s).toEqual([]);
const refused = (s: string, g: GuardContext) => expect(validateAnswer(s, g), s).not.toEqual([]);

describe('calendar years', () => {
  it('Ask: a year inside the supplied Mahadasha range is accepted; one outside every range is refused', async () => {
    // Mercury Mahadasha 2025-03-11 → 2042-03-11 is supplied; 2030 and 2035 appear nowhere as text.
    const { chart, transits, md } = await load('2001-03-24', '08:43');
    const g = ask(chart, 'How will my career go?', transits);
    expect([md.lord, md.start.slice(0, 4), md.end.slice(0, 4)]).toEqual(['Mercury', '2025', '2042']);
    expect(years(g.packetText).has(2030)).toBe(false);
    ok('In 2030, your career is challenging.', g);
    ok('By 2035 your finances should feel steadier.', g);
    refused('In 2050, your career will peak.', g);
    refused('In 2090, your career will peak.', g);
  });

  it('reports, Year Ahead and the daily card accept years inside the dasha periods they list', async () => {
    const { row, chart, transits } = await load('1984-06-24', '21:28', 'exact', 13.0827, 80.2707);
    const summary = chartSummary(row);
    const [, from, to] = summary.match(/\b(\d{4})-\d{2} – (\d{4})-\d{2}\b/)!;
    const inside = Array.from({ length: Number(to) - Number(from) + 1 }, (_, k) => Number(from) + k).find((y) => !years(summary).has(y));
    expect(inside).toBeDefined();
    for (const factsText of [summary, `${summary}\n${reportWindow(asOf)}`, `${summary}\nToday: ${asOf.toISOString().slice(0, 10)}.`]) {
      const guard = { chart, factsText, transits, asOf };
      expect(textProblems(`In ${inside}, your career asks for patience.`, guard, 0)).toEqual([]);
      expect(textProblems('In 2099, your career will peak.', guard, 0).join()).toContain('the year 2099');
    }
    // The Year Ahead window names both of its years.
    const ya = { chart, factsText: `${summary}\n${reportWindow(asOf)}`, asOf };
    expect(textProblems('From October 2026 to October 2027, career matters move slowly.', ya, 0)).toEqual([]);
  });

  it('only the app\'s own range formats count; a range in other prose does not', async () => {
    const { chart } = await load('2001-03-24', '08:43');
    const g: GuardContext = { chart, packetText: 'Some prose mentions 1990 to 2090 and 2000-2099.', asOf, running: null, timing: { mahadashaReliable: true, antardashaReliable: true } };
    refused('In 2050, your career will peak.', g);
  });
});

describe('period boundaries (exact time)', () => {
  it('accepts the calculated Mahadasha and Antardasha starts and ends, in year, month and range forms', async () => {
    const { chart, transits, md, next, ad } = await load('2001-03-24', '08:43');
    const g = ask(chart, 'When will my career improve?', transits);
    const month = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    ok(`Your ${next.lord} Mahadasha begins in ${next.start.slice(0, 4)}.`, g);
    ok(`Your ${next.lord} Mahadasha begins in ${month(next.start)} ${next.start.slice(0, 4)}.`, g);
    ok(`Your ${md.lord} Mahadasha ends in ${md.end.slice(0, 4)}.`, g);
    ok(`The ${next.lord} Mahadasha (${next.start.slice(0, 4)}–${next.end.slice(0, 4)}) follows.`, g);
    ok(`The ${ad.lord} Antardasha lasts until ${ad.end.slice(0, 4)}.`, g);
    const following = md.antardashas[md.antardashas.indexOf(ad) + 1];
    ok(`Your ${following.lord} Antardasha starts in ${following.start.slice(0, 4)}.`, g);
    ok(`The ${following.lord} Antardasha of the ${md.lord} Mahadasha begins in ${following.start.slice(0, 4)}.`, g);
  });

  it('refuses a wrong boundary, even when the stated year appears elsewhere in the facts', async () => {
    const { chart, transits, md, next, ad } = await load('2001-03-24', '08:43');
    const g = ask(chart, 'When will my career improve?', transits);
    // 2027 is in the facts (Sade Sati ends ~Jun 2027) but no Mahadasha ends then.
    expect(years(g.packetText).has(2027)).toBe(true);
    expect(validateAnswer(`Your ${md.lord} Mahadasha ends in 2027.`, g).join()).toContain(`ends in ${md.end.slice(0, 4)}, not 2027`);
    refused(`Your ${next.lord} Mahadasha begins in ${Number(next.start.slice(0, 4)) + 2}.`, g);
    refused(`Your ${md.lord} Mahadasha ends in ${Number(md.end.slice(0, 4)) - 1}.`, g);
    refused(`The ${ad.lord} Antardasha lasts until ${Number(ad.end.slice(0, 4)) + 3}.`, g);
    refused(`The ${next.lord} Mahadasha (${next.start.slice(0, 4)}–${Number(next.end.slice(0, 4)) + 4}) follows.`, g);
    const wrongMonth = new Date(next.start).getUTCMonth() + 6;
    refused(`Your ${next.lord} Mahadasha begins in ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][wrongMonth % 12]} ${next.start.slice(0, 4)}.`, g);
  });

  it('keeps a calendar-year statement apart from a boundary claim', async () => {
    const { chart, transits, md } = await load('2001-03-24', '08:43');
    const g = ask(chart, 'How will my career go?', transits);
    // Naming a year inside the running period is not a claim that the period changes then.
    ok(`In 2031, during your ${md.lord} Mahadasha, career matters deepen.`, g);
    ok(`Your ${md.lord} Mahadasha does not end in 2031.`, g);
  });
});

describe('approximate birth time (PR #98)', () => {
  it('gains no dasha-date permission from the range logic', async () => {
    const { chart, transits, next, ad } = await load('2001-03-24', '12:00', 'approximate');
    const g = ask(chart, 'When will my career improve?', transits);
    refused(`Your ${next.lord} Mahadasha begins in ${next.start.slice(0, 4)}.`, g);
    refused(`The ${ad.lord} Antardasha lasts until ${ad.end.slice(0, 4)}.`, g);
    refused('In 2033, your career will peak.', g);
    // A dasha-format range placed in an approximate chart's facts is ignored.
    refused('In 2030, your career is challenging.', { ...g, packetText: `${g.packetText}\n  - Mercury Mahadasha 2025-03-11 → 2042-03-11 (current)` });
  });
});

describe('a Mahadasha named only to place an Antardasha', () => {
  it('is not read as a boundary claim, but a Mahadasha claim after "during your" still is', async () => {
    const { chart, transits, md } = await load('2001-03-24', '08:43');
    const g = ask(chart, 'When will my career improve?', transits);
    refused(`During your ${md.lord} Mahadasha, which ends in 2027, career matters deepen.`, g);
    ok(`During your ${md.lord} Mahadasha, which ends in ${md.end.slice(0, 4)}, career matters deepen.`, g);
  });
});

describe('range and paraphrase boundary claims', () => {
  it('checks both ends of a stated range, whatever the verb', async () => {
    const { chart, transits, next } = await load('2001-03-24', '08:43');
    const g = ask(chart, 'When will my career improve?', transits);
    const [S, E] = [next.start.slice(0, 4), next.end.slice(0, 4)];
    for (const verb of ['runs from', 'lasts from', 'spans from', 'runs between']) {
      const sep = verb.endsWith('between') ? 'and' : 'to';
      ok(`${next.lord} Mahadasha ${verb} ${S} ${sep} ${E}.`, g);
      refused(`${next.lord} Mahadasha ${verb} ${S} ${sep} ${Number(E) + 3}.`, g);
      refused(`${next.lord} Mahadasha ${verb} ${Number(S) - 2} ${sep} ${E}.`, g);
    }
  });

  it('reads "major/main period", "minor period/sub-period" and "takes over" as period claims', async () => {
    const { chart, transits, md, next, ad } = await load('2001-03-24', '08:43');
    const g = ask(chart, 'When will my career improve?', transits);
    const following = md.antardashas[md.antardashas.indexOf(ad) + 1];
    ok(`${next.lord}'s major period begins in ${next.start.slice(0, 4)}.`, g);
    refused(`${next.lord}'s major period begins in ${Number(next.start.slice(0, 4)) + 1}.`, g);
    ok(`${md.lord}'s main period concludes in ${md.end.slice(0, 4)}.`, g);
    refused(`${md.lord}'s main period concludes in 2027.`, g);
    ok(`The ${ad.lord} minor period ends in ${ad.end.slice(0, 4)}.`, g);
    refused(`The ${ad.lord} minor period ends in ${Number(ad.end.slice(0, 4)) + 4}.`, g);
    ok(`The ${following.lord} sub-period starts in ${following.start.slice(0, 4)}.`, g);
    ok(`${next.lord} takes over in ${next.start.slice(0, 4)}.`, g);
    refused(`${next.lord} takes over in ${Number(next.start.slice(0, 4)) - 3}.`, g);
    ok(`Your ${next.lord} period begins in ${next.start.slice(0, 4)}.`, g);
    refused(`Your ${next.lord} period begins in ${Number(next.start.slice(0, 4)) + 2}.`, g);
    // Talk about a period without a boundary stays allowed.
    ok(`During the ${md.lord} period, communication and study come forward.`, g);
  });

  it('approximate time: these paraphrases cannot state a date either, but plain mentions still pass', async () => {
    const { chart, transits, next } = await load('2001-03-24', '12:00', 'approximate');
    const g = ask(chart, 'When will my career improve?', transits);
    refused(`${next.lord} takes over in 2027.`, g);
    refused(`Your ${next.lord} period begins in 2027.`, g);
    refused(`${next.lord}'s major period runs from 2027 to 2033.`, g);
    ok('Wealth may feel difficult during the Saturn period.', g);
  });
});
