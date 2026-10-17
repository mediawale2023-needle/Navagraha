/**
 * Builds the independent-review package for the three live Career reports of 3fcfea4 from saved data only (no
 * API calls): for each synthetic chart, the birth details, D1/D10, Vimshottari timeline, the field and work-style
 * assessments the report used, and the report annotated to show what the code wrote and what the model wrote.
 *   npx tsx scripts/career-review-package.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { computeCanonicalChart } from '../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../server/astroEngine/birthResolver';
import { signDignity } from '../server/astroEngine/dignity';
import { buildCareerReportFacts, dateOf } from '../server/careerReportEvidence';

const DIR = 'docs/career-evaluations/3fcfea4';
const CHARTS = {
  delhi: { label: 'Delhi', date: '1985-03-22', time: '06:15', latitude: 28.6139, longitude: 77.209 },
  mumbai: { label: 'Mumbai', date: '2000-07-04', time: '18:45', latitude: 19.076, longitude: 72.8777 },
} as const;
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const table = (head: string[], rows: Array<Array<string | number>>) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

mkdirSync(`${DIR}/review`, { recursive: true });
for (const [key, c] of Object.entries(CHARTS)) {
  const saved = JSON.parse(readFileSync(`${DIR}/${key}.json`, 'utf8'));
  const report = saved.report;
  const asOf = new Date(report.generatedAt);
  const kundli = { chartData: { canonical: computeCanonicalChart(resolveBirthWithCoordinates({ date: c.date, time: c.time, latitude: c.latitude, longitude: c.longitude, timeAccuracy: 'exact' })) } };
  const chart = kundli.chartData.canonical;
  const facts = buildCareerReportFacts(kundli, asOf);
  // The report's own chart table must be this calculation, or the package would describe a different chart.
  for (const p of report.planetaryPositions) {
    const e = chart.planets.find((x) => x.name === p.planet)!;
    if (e.sign !== p.sign || e.house !== p.house) throw new Error(`${key}: ${p.planet} differs between the report and the engine`);
  }
  const dig = (g: string) => chart.strength.dignities.find((d) => d.planet === g);
  const sav = chart.strength.ashtakavarga.savByHouse;
  const running = (p: { start: string; end: string }) => Date.parse(p.start) <= +asOf && +asOf < Date.parse(p.end);
  const windowEnd = new Date(asOf); windowEnd.setUTCFullYear(windowEnd.getUTCFullYear() + 4);
  const inWindow = (p: { start: string; end: string }) => Date.parse(p.end) > +asOf && Date.parse(p.start) < +windowEnd;

  const chartMd = [
    `# ${c.label} synthetic chart: calculated data`,
    '',
    'Synthetic test chart (not a person). Calculated by the app\'s canonical engine: Swiss Ephemeris (Moshier), Lahiri ayanamsa, mean node, whole-sign houses. Vimshottari dates are the engine\'s UTC instants, shown as calendar dates.',
    '',
    '## Birth details',
    table(['Field', 'Value'], [
      ['Date / time (local)', `${chart.birth.localDate} ${chart.birth.localTime}`], ['Time zone', chart.birth.timezone], ['Birth instant (UTC)', chart.birth.birthUTC],
      ['Latitude / longitude', `${c.latitude}, ${c.longitude}`], ['Birth-time accuracy', chart.birth.timeAccuracy], ['Report evaluation date (asOf)', report.generatedAt],
    ]),
    '',
    `## D1 (birth chart): Lagna ${chart.ascendant.sign}`,
    table(['Planet', 'Sign', 'House', 'Degree in sign', 'Dignity', 'Neecha Bhanga', 'Combust', 'Retrograde'], chart.planets.map((p) => {
      const d = dig(p.name);
      return [p.name, p.sign, p.house, p.degreeInSign.toFixed(2), d?.dignity ?? '—', d?.neechaBhanga ? 'yes' : '', d?.combust ? 'yes' : '', p.retrograde ? 'yes' : ''];
    })),
    '',
    '### Houses',
    table(['House', 'Sign', 'Lord', 'Lord in house', 'Occupants', 'Sarvashtakavarga'], chart.houses.map((h) => [h.house, h.sign, h.lord, h.lordHouse, h.occupants.join(', ') || '—', sav[h.house - 1]])),
    '',
    `Planets aspecting the 10th house: ${chart.aspects.filter((a) => a.aspectsHouses.includes(10)).map((a) => a.planet).join(', ') || 'none'}.`,
    '',
    `## D10 (Dasamsa): Lagna ${['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'][chart.vargas.D10.ascendantSignIndex]}`,
    'Signs and houses only: the engine does not calculate D10 degrees.',
    '',
    table(['Planet', 'D10 sign', 'D10 house', 'Sign dignity in D10'], chart.vargas.D10.placements.map((p) => [p.planet, p.sign, p.house, signDignity(p.planet, p.signIndex) ?? '—'])),
    '',
    facts.sections.find((s) => s.key === 'chart')!.facts.find((f) => f.id === 'chart.caveat')!.text,
    '',
    '## Yogas detected by the engine',
    table(['Yoga', 'Planets', 'Engine description', 'Cancelled'], chart.yogas.map((y) => [y.name, y.planets.join(', '), y.description.replace(/\|/g, '/'), y.cancelled ? 'yes' : ''])),
    '',
    'The report includes only yogas with a link to the 10th house, its lord, the D10 Lagna or 10th lord, or the career significators (Sun, Saturn), at most four, and never the engine\'s one-line promise.',
    '',
    '## Vimshottari timeline',
    table(['Mahadasha', 'Start', 'End', ''], chart.dashas.vimshottari.mahadashas.map((m) => [m.lord, dateOf(m.start), dateOf(m.end), running(m) ? 'running at asOf' : inWindow(m) ? 'in the 4-year window' : ''])),
    '',
    ...chart.dashas.vimshottari.mahadashas.filter(inWindow).flatMap((m) => [`### Antardashas of the ${m.lord} Mahadasha`, table(['Antardasha', 'Start', 'End', ''], m.antardashas.map((a) => [a.lord, dateOf(a.start), dateOf(a.end), running(a) ? 'running at asOf' : inWindow(a) ? 'in the 4-year window' : ''])), '']),
    '## Assessments the report used (application conventions, not classical rules)',
    `Work style: **${facts.workStyle}**, from the 6th house (service, ${sav[5]} points) against the 7th (trade, ${sav[6]} points) and the business field rating.`,
    '',
    table(['Field', 'Rating', 'For', 'Against'], facts.brief.fields.map((f) => [f.label, f.rating, f.plus.join('; ') || '—', f.minus.join('; ') || '—'])),
  ].join('\n');
  writeFileSync(`${DIR}/review/${key}-chart.md`, chartMd + '\n');

  // Annotated report: each paragraph that begins with a fact the code wrote is split into [Chart fact] and [AI].
  const allFacts = facts.sections.flatMap((s) => s.facts.map((f) => f.text));
  const annotated = [`# ${c.label}: report annotated for review`, '', '**[Chart fact]**: written by the application from the calculation. **[AI]**: written by gpt-4o and checked by the validators. Other text (headings, "What this means for you", next steps, glossary) is labelled where it occurs.', '', '## Summary (application)', '', report.summary];
  for (const s of report.sections) {
    annotated.push('', `## ${s.heading}`);
    for (const para of s.body.split('\n\n')) {
      const f = allFacts.find((t) => para.startsWith(t));
      if (f) { annotated.push('', `**[Chart fact]** ${f}`); const rest = para.slice(f.length).trim(); if (rest) annotated.push('', `**[AI]** ${rest}`); }
      else if (para.startsWith('What this means for you')) annotated.push('', `**[AI synthesis]** ${para.replace('What this means for you\n', '')}`);
      else if (para.startsWith('Next steps')) annotated.push('', '**[AI next steps]**', '', para.replace('Next steps\n', ''));
      else if (s.heading === 'Glossary') annotated.push('', `**[Glossary, application]** ${para.split('\n').join(' ')}`);
      else if (para.startsWith('Terms used in this section')) annotated.push('', `**[Glossary, application]** ${para.replace('Terms used in this section\n', '').split('\n').join(' ')}`);
      else annotated.push('', `**[Unclassified]** ${para}`);
    }
  }
  writeFileSync(`${DIR}/review/${key}-report-annotated.md`, annotated.join('\n') + '\n');
  console.info(`${key}: chart data and annotated report written`);
}
