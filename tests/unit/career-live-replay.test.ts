/**
 * Offline replay of the three live evaluations of f729c61 (report code 6397e0b) against the current validators:
 * every recorded model reply is served again, in order, to the unchanged facts-first pipeline. A request the live
 * run never made (a different correction) cannot be answered offline and ends the replay with UNRECORDED.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateDeterministicCareer, type CareerCompletion, type CareerSectionAttempt } from '../../server/careerReportGeneration';
import { fixtureChart } from '../fixtures/career-chart';

const CHARTS = { delhi: ['1985-03-22', '06:15', 28.6139, 77.209], mumbai: ['2000-07-04', '18:45', 19.076, 72.8777] } as const;
// The runs were made on 2026-10-15 (IST afternoon); every period boundary is months away from this instant.
const ASOF = new Date('2026-10-15T11:00:00Z');

export async function replay(name: keyof typeof CHARTS) {
  const { attempts } = JSON.parse(readFileSync(new URL(`../fixtures/career-live-f729c61/${name}.json`, import.meta.url), 'utf8')) as { attempts: Array<{ heading: string; correcting: boolean; content: string }> };
  const served = new Map<string, number>();
  const log: CareerSectionAttempt[] = []; let metrics: any; const unrecorded: string[] = [];
  const request = async (prompt: string): Promise<CareerCompletion> => {
    const heading = prompt.match(/part of "([^"]+)"/)![1];
    const n = served.get(heading) ?? 0; served.set(heading, n + 1);
    const recorded = attempts.filter((a) => a.heading === heading)[n];
    if (!recorded) { unrecorded.push(heading); throw Object.assign(new Error(`UNRECORDED ${heading}`), { status: 400 }); } // 400: not retryable, so the replay stops here
    return { choices: [{ finish_reason: 'stop', message: { content: recorded.content } }], usage: { prompt_tokens: 1500, completion_tokens: 900 } };
  };
  try {
    const report = await generateDeterministicCareer(fixtureChart(...CHARTS[name]), ASOF, request, { onSection: (a) => log.push(a), onMetrics: (m) => { metrics = m; } });
    return { report, log, metrics, unrecorded, error: null as string | null };
  } catch (err) {
    return { report: null, log, metrics, unrecorded, error: String((err as Error).message) };
  }
}

describe('offline replay of the f729c61 live evaluations', () => {
  it.each(Object.keys(CHARTS) as Array<keyof typeof CHARTS>)('%s', async (name) => {
    const r = await replay(name);
    // Printed for the review: what each recorded reply would now get.
    console.log(`REPLAY ${name}: ${r.report ? 'REPORT PASSES' : r.unrecorded.length ? `NEEDS A CORRECTION THE LIVE RUN NEVER MADE (${r.unrecorded.join(', ')})` : `FAILS: ${r.error}`} | ${JSON.stringify(r.metrics)}`);
    for (const a of r.log) for (const p of [...a.problems.map((x) => `REQUIRED ${x}`), ...a.dropped.map((x) => `DROPPED ${x}`), ...a.advisories.map((x) => `ADVISORY ${x}`)]) console.log(`REPLAY ${name} [${a.heading}${a.correcting ? ' corr' : ''}] ${p}`);
    expect(r.log.length).toBeGreaterThan(0);
  });
});

describe('recorded sentences from the f729c61 runs, judged by the current checks', () => {
  const load = (name: string) => (JSON.parse(readFileSync(new URL(`../fixtures/career-live-f729c61/${name}.json`, import.meta.url), 'utf8')).attempts as Array<{ heading: string; correcting: boolean; content: string }>).map((a) => ({ ...a, reply: JSON.parse(a.content) }));
  it('Delhi now yields a complete report; Mumbai stops only for its real timing error', async () => {
    expect((await replay('delhi')).report?.sections).toHaveLength(6);
    const mumbai = await replay('mumbai');
    expect(mumbai.report).toBeNull(); expect(mumbai.unrecorded).toEqual(['Favourable & Difficult Periods']);
    expect(mumbai.log.find((a) => a.heading === 'Favourable & Difficult Periods')!.problems).toEqual(['synthesis: calls the Mercury Antardasha upcoming, but it is running now']);
  });
  it('still refuses the real errors: a running period called upcoming, a debilitated Sun called well placed, a debilitated Mercury called strong', async () => {
    const { buildCareerReportFacts } = await import('../../server/careerReportEvidence');
    const { slotProblems } = await import('../../server/careerReportRendering');
    const delhi = buildCareerReportFacts(fixtureChart(...CHARTS.delhi), ASOF), invented = buildCareerReportFacts(fixtureChart(), ASOF);
    const facts = (e: typeof delhi, key: string) => e.sections.find((s) => s.key === key)!.facts;
    const upcoming = load('delhi').find((a) => a.heading === 'Current Career Situation' && a.correcting)!.reply.synthesis;
    expect(upcoming).toContain('The upcoming Saturn period');
    expect(slotProblems(upcoming, 'synthesis', facts(delhi, 'current'), delhi).join(' ')).toMatch(/calls the Saturn Antardasha upcoming, but it is running now/);
    // The Sun error was recorded on a chart that is no longer in the repository; this sentence is written in the
    // same form for the invented default chart, whose Sun is debilitated in Libra.
    const sun = 'Your chart suggests a strong alignment with administrative roles. With the Sun well-placed in your chart, these positions are positively supported, indicating your capacity to handle organizational tasks effectively.';
    expect(fixtureChart().chartData.canonical.strength.dignities.find((d) => d.planet === 'Sun')!.dignity).toBe('Debilitated');
    expect(slotProblems(sun, 'explanation', facts(invented, 'guidance').filter((f) => f.id === 'field.administration'), invented)).toEqual(["overstates Sun's strength (debilitated in the birth chart)"]);
    const mercury = load('delhi').find((a) => a.heading === 'Personalised Guidance' && !a.correcting)!.reply.steps[0];
    expect(slotProblems(mercury.text, 'step', facts(delhi, 'guidance'), delhi).join(' ')).toMatch(/overstates Mercury's strength/);
  });
});

describe('a running period in a list is not upcoming either', () => {
  it('refuses "Upcoming Mercury and Ketu sub-periods" while the Mercury Antardasha runs (recorded Mumbai synthesis)', async () => {
    const { buildCareerReportFacts } = await import('../../server/careerReportEvidence');
    const { slotProblems } = await import('../../server/careerReportRendering');
    const mumbai = buildCareerReportFacts(fixtureChart(...CHARTS.mumbai), ASOF);
    const synthesis = (JSON.parse(readFileSync(new URL('../fixtures/career-live-f729c61/mumbai.json', import.meta.url), 'utf8')).attempts as any[])
      .map((a) => JSON.parse(a.content)).find((r) => /Upcoming Mercury and Ketu/.test(r.synthesis ?? '')).synthesis;
    expect(slotProblems(synthesis, 'synthesis', mumbai.sections.find((s) => s.key === 'periods')!.facts, mumbai).join(' ')).toMatch(/calls the Mercury Antardasha upcoming, but it is running now/);
    // The next period really is upcoming.
    expect(slotProblems('The upcoming Ketu sub-period may favour quieter, research-led work, so use the months before it to finish what is in progress and document your results clearly.', 'explanation', mumbai.sections.find((s) => s.key === 'periods')!.facts, mumbai).join(' ')).not.toMatch(/upcoming/);
  });
});
