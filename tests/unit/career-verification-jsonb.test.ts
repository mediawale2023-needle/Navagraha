import { describe, expect, it } from 'vitest';
import { canonicalJson, verifiedCareerChart, buildCareerReportFacts } from '../../server/careerReportEvidence';
import { ASOF, fixtureChart } from '../fixtures/career-chart';

/** As Postgres JSONB returns an object: keys ordered shorter first, then bytewise (values untouched). */
const jsonbOrder = (v: any): any => Array.isArray(v) ? v.map(jsonbOrder)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map((k) => [k, jsonbOrder(v[k])])) : v;
const saved = (k: any) => JSON.parse(JSON.stringify(jsonbOrder(k)));

describe('Career canonical verification of a saved chart (production: "Career canonical verification failed: planets", 0 calls)', () => {
  it('reproduces the failure: a byte-wise comparison refuses an identical chart read back from JSONB', () => {
    const k = fixtureChart(); const stored = saved(k).chartData.canonical;
    expect(JSON.stringify(stored.planets)).not.toBe(JSON.stringify(k.chartData.canonical.planets));
    expect(canonicalJson(stored.planets)).toBe(canonicalJson(k.chartData.canonical.planets));
  });
  it('accepts a saved (JSONB-ordered) chart and builds the Career facts from it', () => {
    const k = saved(fixtureChart());
    expect(() => verifiedCareerChart(k)).not.toThrow();
    expect(buildCareerReportFacts(k, ASOF).sections).toHaveLength(5);
  });
  it('still refuses a saved chart whose planets differ from the engine, by any amount', () => {
    const k = saved(fixtureChart()); k.chartData.canonical.planets[0].longitude += 1e-9;
    expect(() => verifiedCareerChart(k)).toThrow(/verification failed: planets/);
    const j = saved(fixtureChart()); j.chartData.canonical.planets.reverse();
    expect(() => verifiedCareerChart(j)).toThrow(/verification failed: planets/);
  });
  it('still refuses an approximate birth time before any request', () => {
    const k = saved(fixtureChart()); k.chartData.canonical.birth.timeAccuracy = 'approximate';
    expect(() => verifiedCareerChart(k)).toThrow(/exact birth time/);
  });
});
