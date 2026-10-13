/**
 * PR #104 shadow verdict comparison on the seed-99 sample (336 exact + 72 approximate charts).
 * Read only: computes the existing verdicts and the shadow reconciliation side by side and writes
 *   docs/reasoning/pr104-shadow-comparison.json   (machine-readable)
 *   docs/reasoning/PR104_SHADOW_COMPARISON.md     (summary)
 *
 *   npx tsx scripts/reasoning/shadow-comparison.ts
 */
import { mkdirSync, writeFileSync } from 'fs';
import { performance } from 'perf_hooks';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { functionalRoles } from '../../server/astroEngine/remedies';
import { reasoningInput } from '../../server/astroEngine/reasoning/index';
import { planetaryReasoningFrom } from '../../server/astroEngine/reasoning/planetary';
import { closure } from '../../server/astroEngine/reasoning/contradictions';
import { reconcileFrom } from '../../server/astroEngine/reasoning/reconciliation';
import { POLICIES, functionalRoleReview } from '../../server/astroEngine/reasoning/reconciliationPolicies';

const asOf = new Date('2026-10-13T06:00:00Z');
const PLACES: Array<[number, number]> = [[28.6139, 77.209], [19.076, 72.8777], [13.0827, 80.2707], [22.5726, 88.3639], [26.9124, 75.7873], [51.5074, -0.1278], [40.7128, -74.006], [-33.8688, 151.2093], [1.3521, 103.8198]];
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const pad = (n: number) => String(n).padStart(2, '0');
const inc = (o: Record<string, number>, k: string, n = 1) => { o[k] = (o[k] ?? 0) + n; };

/** LCG seed 99; 28 exact charts per ascendant (336) and every 4th as an approximate chart (72). */
function sample() {
  let seed = 99; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const perAsc = new Array(12).fill(0);
  const exact: any[] = [], approx: any[] = [];
  let i = 0;
  while (perAsc.some((n) => n < 28)) {
    const y = 1940 + Math.floor(rnd() * 70), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
    const hh = Math.floor(rnd() * 24), mm = Math.floor(rnd() * 60);
    const [lat, lng] = PLACES[i++ % PLACES.length];
    const input = { date: `${y}-${pad(m)}-${pad(d)}`, time: `${pad(hh)}:${pad(mm)}`, latitude: lat, longitude: lng };
    const c = computeCanonicalChart(resolveBirthWithCoordinates({ ...input, timeAccuracy: 'exact' }), { calculatedAt: asOf });
    if (perAsc[c.ascendant.signIndex] >= 28) continue;
    perAsc[c.ascendant.signIndex]++;
    exact.push({ input, chart: c });
    if (approx.length < 72 && exact.length % 4 === 0) approx.push({ input, chart: computeCanonicalChart(resolveBirthWithCoordinates({ ...input, time: '12:00', timeAccuracy: 'approximate' }), { calculatedAt: asOf }) });
  }
  return { exact, approx };
}

const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function run() {
  const { exact, approx } = sample();
  const report: any = { generatedFor: 'PR #104', asOf: asOf.toISOString(), sample: { exact: exact.length, approximate: approx.length }, sets: {}, changedVerdicts: [], duplication: {}, adversarial: {}, performance: {}, functionalRoleReview: [], policies: POLICIES };
  const timings: Record<string, { reasoning: number[]; findings: number[]; reconciliation: number[]; insights: number[] }> = {};
  // Warm-up so the timings measure steady state, not first-call compilation.
  for (const { chart } of exact.slice(0, 40)) { const r = reasoningInput(chart, asOf); reconcileFrom(r, planetaryReasoningFrom(r, chart)); buildInsights(chart, asOf); }

  for (const [set, tag] of [[exact, 'exact'], [approx, 'approximate']] as const) {
    const s: any = {
      verdicts: 0, originalMatchesProduction: 0, unchanged: 0, candidateChanges: 0, verdictChanged: 0, confidenceChanged: 0, confidenceOnly: 0,
      towards: {}, transitions: {}, byPolicy: {}, multiplePolicies: 0, openQuestionAreas: 0, verdictDependsOnProvisional: 0,
      diagnosticWhatIf: {}, diagnosticWouldChange: {}, inapplicablePolicies: {},
    };
    const dup: Record<string, number> = { '1 exact duplicate directional evidence': 0 };
    const timing = (timings[tag] = { reasoning: [], findings: [], reconciliation: [], insights: [] });
    for (const { chart, input } of set) {
      let t0 = performance.now();
      const r = reasoningInput(chart, asOf); const t1 = performance.now();
      const pr = planetaryReasoningFrom(r, chart); const t2 = performance.now();
      const rec = reconcileFrom(r, pr); const t3 = performance.now();
      const ins = buildInsights(chart, asOf); const t4 = performance.now();
      timing.reasoning.push(t1 - t0); timing.findings.push(t2 - t1); timing.reconciliation.push(t3 - t2); timing.insights.push(t4 - t3);
      for (const d of rec.domains) {
        s.verdicts++;
        const prod = ins.domains.find((x) => x.domain === d.domain)!;
        if (prod.verdict === d.original.verdict && prod.confidence === d.original.confidence) s.originalMatchesProduction++;
        for (const p of d.reliability.inapplicablePolicies) inc(s.inapplicablePolicies, p);
        if (d.openQuestions.length) s.openQuestionAreas++;
        if (d.diagnostics.some((g) => g.wouldChange)) s.verdictDependsOnProvisional++;
        for (const g of d.diagnostics) { inc(s.diagnosticWhatIf, g.policyId); if (g.wouldChange) inc(s.diagnosticWouldChange, g.policyId); }
        const policies = new Set([...d.treatments.map((x) => x.policyId), ...d.diagnostics.filter((g) => g.wouldChange).map((g) => g.policyId)]);
        if (policies.size > 1) s.multiplePolicies++;
        for (const p of new Set(d.treatments.map((x) => x.policyId))) inc(s.byPolicy, p);
        if (d.status === 'unchanged') { s.unchanged++; continue; }
        s.candidateChanges++;
        if (d.change!.verdict) s.verdictChanged++;
        if (d.change!.confidence) s.confidenceChanged++;
        if (!d.change!.verdict) s.confidenceOnly++;
        inc(s.towards, d.change!.towards);
        inc(s.transitions, `${d.original.verdict} (${d.original.confidence}) → ${d.proposed.verdict} (${d.proposed.confidence})`);
        report.changedVerdicts.push({
          set: tag, birth: input, ascendant: chart.ascendant.sign, domain: d.domain, original: d.original, proposed: d.proposed, change: d.change,
          treatments: d.treatments, remainingQuestions: d.openQuestions.map((q) => q.question),
          uncertain: d.openQuestions.length > 0 || d.diagnostics.some((g) => g.wouldChange),
        });
      }
      // Evidence duplication: every shared-dependency pair from the classifier, sorted into the brief's categories.
      const byId = new Map(r.evidence.map((a) => [a.item.id, a]));
      for (const c of pr.contradictions.filter((x) => x.code === 'repeated-fact')) {
        const [a, b] = c.evidenceIds.map((id) => byId.get(id)!);
        const family = (x: any) => (x.metadata.ruleId === 'house.lord-dignity' || x.metadata.ruleId === 'karaka.dignity' ? 'dignity-reading' : x.metadata.ruleId);
        const direct = (x: any) => Array.from(closure(r.facts, x)).filter(([, v]) => v === 'direct').map(([f]) => f).sort().join('|');
        // Facts both items read directly (a fact reached only through derivation is not a shared reading).
        const sharedDirect = c.factIds.filter((f) => Object.values(c.via!).every((m) => m[f] === 'direct'));
        const cat = a.metadata.ruleId === 'dasha.running-lord' || b.metadata.ruleId === 'dasha.running-lord' ? '6 natal vs timing activation'
          : a.metadata.role === 'yoga' || b.metadata.role === 'yoga' ? '7 yoga formation vs participant condition'
          : sharedDirect.length > 0 && direct(a) === direct(b) && family(a) === family(b) && a.item.direction === b.item.direction
            ? (a.item.house === b.item.house && a.metadata.ruleId === b.metadata.ruleId ? '1 exact duplicate directional evidence' : '3 same reading under independent roles (lord of two houses, lord and karaka)')
          : sharedDirect.length > 0 ? '2 different interpretations of the same calculated fact'
          : '5 derived dependency';
        inc(dup, cat);
      }
      inc(dup, '4 eligibility or exclusion gates (not counted as shared)', pr.stats.gateOnlyPairs);
      // Adversarial categories.
      if (tag === 'exact') {
        const adv = report.adversarial;
        const touched = new Set(rec.domains.flatMap((d) => d.treatments.map((x) => x.evidenceId)));
        const flag = (k: string, hit: boolean, changed: boolean) => { if (!hit) return; adv[k] ||= { charts: 0, chartsWithCandidateChange: 0 }; adv[k].charts++; if (changed) adv[k].chartsWithCandidateChange++; };
        const anyChange = rec.domains.some((d) => d.status === 'candidate-change');
        flag('strong but combust planet', pr.contradictions.some((x) => x.code === 'strong-dignity-combust'), anyChange);
        flag('debilitated with Neecha Bhanga', pr.contradictions.some((x) => x.code === 'neecha-bhanga-with-debilitation'), anyChange);
        flag('yogakaraka with challenging occupancy', pr.contradictions.some((x) => x.code === 'yogakaraka-negative-occupant'), pr.contradictions.some((x) => x.code === 'yogakaraka-negative-occupant' && x.evidenceIds.some((e) => touched.has(e))));
        flag('multiple yogas sharing a participant', pr.yogas.some((y, i) => pr.yogas.some((z, j) => j > i && y.participants.some((p) => z.participants.includes(p)))), anyChange);
        flag('natal-positive, period-negative', pr.relationships.some((x) => x.type === 'natal-vs-activation' && (x.status === 'legitimate-mixed' || x.status === 'unresolved') && byId.get(x.evidenceIds[0])!.item.direction === 'negative'), anyChange);
        flag('natal-negative, period-positive', pr.relationships.some((x) => x.type === 'natal-vs-activation' && (x.status === 'legitimate-mixed' || x.status === 'unresolved') && byId.get(x.evidenceIds[0])!.item.direction === 'positive'), anyChange);
        flag('planet holding two roles in one area (two lordships, or lord and karaka)', rec.domains.some((d) => d.diagnostics.some((g) => g.policyId === 'planet-dignity-once-per-area')), anyChange);
        // A validated treatment never rests on combustion, Neecha Bhanga, a yoga or a period.
        for (const d of rec.domains) for (const x of d.treatments) if (x.factIds.some((f) => /^(combustion|neecha-bhanga|yoga|dasha)/.test(f))) inc(adv, 'VIOLATION treatment rests on an unresolved fact');
      } else {
        report.adversarial['approximate birth time'] ||= { charts: 0, chartsWithCandidateChange: 0 };
        report.adversarial['approximate birth time'].charts++;
        if (rec.domains.some((d) => d.status === 'candidate-change')) report.adversarial['approximate birth time'].chartsWithCandidateChange++;
      }
    }
    report.sets[tag] = s;
    report.duplication[tag] = dup;
  }
  const stat = (xs: number[]) => ({ medianMs: +pct(xs, 0.5).toFixed(3), p95Ms: +pct(xs, 0.95).toFixed(3) });
  report.performance = Object.fromEntries(Object.entries(timings).map(([tag, t]) => [tag, {
    charts: t.reasoning.length,
    reasoningInput: stat(t.reasoning), findingsAndRelationships: stat(t.findings), reconciliation: stat(t.reconciliation),
    productionBuildInsightsForComparison: stat(t.insights),
  }]));
  // Functional-role review: existing remedy classification vs the provisional Laghu Parashari reading, all 12 ascendants.
  for (let asc = 0; asc < 12; asc++) {
    const hl = Array.from({ length: 12 }, (_, i) => ({ house: i + 1, lord: SIGN_LORDS[(asc + i) % 12] }));
    const existing = functionalRoles(hl); const proposed = functionalRoleReview(hl);
    for (const planet of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
      report.functionalRoleReview.push({ ascendant: SIGNS[asc], planet, owned: proposed[planet].owned, existing: existing[planet]?.role ?? 'no-lordship', proposed: proposed[planet].proposed, maraka: proposed[planet].maraka });
    }
  }
  mkdirSync('docs/reasoning', { recursive: true });
  writeFileSync('docs/reasoning/pr104-shadow-comparison.json', JSON.stringify(report, null, 1) + '\n');
  writeFileSync('docs/reasoning/PR104_SHADOW_COMPARISON.md', summary(report));
  console.log(JSON.stringify({ performance: report.performance }, null, 1));
}

function summary(r: any): string {
  const e = r.sets.exact, a = r.sets.approximate;
  const rows = (o: Record<string, number>) => Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const fr = r.functionalRoleReview.filter((x: any) => x.existing !== x.proposed && !(x.existing === 'functional-benefic' && x.proposed === 'benefic') && !(x.existing === 'functional-malefic' && x.proposed === 'malefic'));
  return `# PR #104 — shadow verdict comparison (seed 99)

Generated by \`npx tsx scripts/reasoning/shadow-comparison.ts\`; machine-readable data in \`pr104-shadow-comparison.json\`.
Shadow only: no production code reads any of this. Only **validated** policies shape a proposed verdict;
provisional policies are what-if diagnostics. A verdict moving up or down is a change of direction, not
evidence of better prediction — no predictive accuracy is claimed.

## Verdicts

| | Exact | Approximate |
|---|---|---|
| Life-area verdicts compared | ${e.verdicts} | ${a.verdicts} |
| Original verdict and confidence equal production | ${e.originalMatchesProduction} | ${a.originalMatchesProduction} |
| Unchanged | ${e.unchanged} | ${a.unchanged} |
| Candidate changes (validated policies) | ${e.candidateChanges} | ${a.candidateChanges} |
| – verdict classification changes | ${e.verdictChanged} | ${a.verdictChanged} |
| – confidence changes | ${e.confidenceChanged} | ${a.confidenceChanged} |
| – confidence only | ${e.confidenceOnly} | ${a.confidenceOnly} |
| More favourable verdict | ${e.towards['more-favourable'] ?? 0} | ${a.towards['more-favourable'] ?? 0} |
| Less favourable verdict | ${e.towards['less-favourable'] ?? 0} | ${a.towards['less-favourable'] ?? 0} |
| Same verdict (confidence, or to/from Insufficient evidence) | ${e.towards['same-verdict'] ?? 0} | ${a.towards['same-verdict'] ?? 0} |
| Areas whose verdict a provisional what-if would change (unresolved) | ${e.verdictDependsOnProvisional} | ${a.verdictDependsOnProvisional} |
| Areas with an open classical question in their evidence | ${e.openQuestionAreas} | ${a.openQuestionAreas} |
| Areas touched by more than one policy | ${e.multiplePolicies} | ${a.multiplePolicies} |

Transitions (exact):

| Original → proposed | Areas |
|---|---|
${rows(e.transitions)}

Areas affected per policy — validated (candidate): ${JSON.stringify(e.byPolicy)}; provisional what-if present: ${JSON.stringify(e.diagnosticWhatIf)}; what-if would change the verdict: ${JSON.stringify(e.diagnosticWouldChange)}.
Approximate charts: inapplicable policies (facts withheld): ${JSON.stringify(a.inapplicablePolicies)}.

## Evidence duplication (shared-dependency pairs by category)

| Category (exact) | Pairs |
|---|---|
${rows(r.duplication.exact)}

| Category (approximate) | Pairs |
|---|---|
${rows(r.duplication.approximate)}

## Adversarial cases (exact unless stated)

| Case | Charts | Charts with any candidate change (all from the own-house policy) |
|---|---|---|
${Object.entries(r.adversarial).filter(([k]) => !k.startsWith('VIOLATION')).map(([k, v]: any) => `| ${k} | ${v.charts} | ${v.chartsWithCandidateChange} |`).join('\n')}

Validated treatments resting on combustion, Neecha Bhanga, a yoga or a period: ${r.adversarial['VIOLATION treatment rests on an unresolved fact'] ?? 0}.

## Functional roles: existing remedy classification vs provisional Laghu Parashari reading (differences only)

| Ascendant | Planet | Owns | Existing | Proposed | Maraka |
|---|---|---|---|---|---|
${fr.map((x: any) => `| ${x.ascendant} | ${x.planet} | ${x.owned.join(', ')} | ${x.existing} | ${x.proposed} | ${x.maraka ? 'yes' : ''} |`).join('\n')}

## Performance (per chart, after warm-up)

| Set | Step | Median ms | p95 ms |
|---|---|---|---|
${Object.entries(r.performance).flatMap(([tag, v]: any) => Object.entries(v).filter(([k]) => k !== 'charts').map(([k, x]: any) => `| ${tag} (${v.charts}) | ${k} | ${x.medianMs} | ${x.p95Ms} |`)).join('\n')}

Reconciliation is the increment PR #104 adds; it reuses the FactIndex, evidence and findings and recalculates no chart.
For approximate charts the cost of reasoningInput and buildInsights is dominated by the existing birth-day stability checks.
No production request invokes any of it.
`;
}

run();
