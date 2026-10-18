/**
 * Diagnostic only (changes nothing): which evidence source decides how often each field reaches the top tier?
 * Recomputes every field's verdict over 300 seeded random synthetic charts with one source left out at a time.
 *   npx tsx scripts/career-field-attribution.ts
 */
import { fixtureChart, ASOF } from '../tests/fixtures/career-chart';
import { buildCareerLedger, engineItems } from '../server/careerLedger';
import { synthesiseCareer } from '../server/careerSynthesis';
import { resolveDomain } from '../server/astroEngine/evidence/resolution';
import { VERDICTS } from '@shared/v3/evidence';
let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); const pad = (n: number) => String(n).padStart(2, '0');
const VARIANTS: Record<string, (rule: string) => boolean> = {
  'as built': () => true,
  'without house bindus (house.sav)': (r) => r !== 'house.sav',
  'without significator dignity': (r) => r !== 'karaka.dignity' && r !== 'career.significator-dignity',
  'without D10 items': (r) => !r.startsWith('career.d10') && r !== 'varga.lord-dignity',
  'without lord placement': (r) => !r.startsWith('house.lord-placement'),
};
const N = 300; const top: Record<string, Record<string, number>> = {};
const charts = Array.from({ length: N }, () => fixtureChart(`${1950 + Math.floor(rnd() * 55)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`, `${pad(Math.floor(rnd() * 24))}:${pad(Math.floor(rnd() * 60))}`, 8 + rnd() * 24, 70 + rnd() * 18).chartData.canonical);
for (const c of charts) {
  const L = buildCareerLedger(c, ASOF); const s = synthesiseCareer(L, ASOF);
  for (const [name, keep] of Object.entries(VARIANTS)) {
    const v = s.fields.map((f) => ({ id: f.id, verdict: resolveDomain('career', engineItems(L, f.counted.filter((id) => keep(L.byId.get(id)!.engineRule ?? L.byId.get(id)!.ruleId))), { approximate: false }).verdict }));
    const best = Math.min(...v.map((x) => VERDICTS.indexOf(x.verdict)));
    for (const x of v) if (VERDICTS.indexOf(x.verdict) === best) ((top[name] ??= {})[x.id] = (top[name][x.id] ?? 0) + 1);
  }
}
for (const [name, t] of Object.entries(top)) console.log(name.padEnd(36), Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${Math.round(100 * n / N)}%`).join('  '));
