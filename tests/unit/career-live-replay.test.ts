/**
 * Sentences GPT-4o actually wrote in the f729c61 live evaluations (synthetic charts), judged by the current checks.
 * The whole-report offline replay was retired with the plan-driven prompts: those replies answer a prompt this
 * pipeline no longer sends. The errors they recorded must still be refused.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCareerReportFacts, factsOf, type CareerReportFacts } from '../../server/careerReportEvidence';
import { slotProblems } from '../../server/careerReportRendering';
import { fixtureChart, SYNTHETIC_CHARTS } from '../fixtures/career-chart';

// The runs were made on 2026-10-15 (IST afternoon); every period boundary is months away from this instant.
const ASOF = new Date('2026-10-15T11:00:00Z');
const load = (name: string) => (JSON.parse(readFileSync(new URL(`../fixtures/career-live-f729c61/${name}.json`, import.meta.url), 'utf8')).attempts as Array<{ heading: string; correcting: boolean; content: string }>).map((a) => ({ ...a, reply: JSON.parse(a.content) }));
/** The evidence a timing paragraph may draw on, and a strategy step. */
const timing = (e: CareerReportFacts) => factsOf(e, e.sections.find((s) => s.key === 'timing')!.slots.flatMap((s) => s.scope));
const strategy = (e: CareerReportFacts) => factsOf(e, e.sections.find((s) => s.key === 'strategy')!.stepScope.flatMap((id) => [id, ...(e.ledger.byId.get(id)!.derivedFrom ?? [])]));

describe('recorded sentences from the f729c61 runs, judged by the current checks', () => {
  it('still refuses the real errors: a running period called upcoming, a debilitated Sun called well placed, a debilitated Mercury called strong', () => {
    const delhi = buildCareerReportFacts(fixtureChart(...SYNTHETIC_CHARTS.delhi), ASOF), invented = buildCareerReportFacts(fixtureChart(), ASOF);
    const upcoming = load('delhi').find((a) => a.heading === 'Current Career Situation' && a.correcting)!.reply.synthesis;
    expect(upcoming).toContain('The upcoming Saturn period');
    expect(slotProblems(upcoming, 'synthesis', timing(delhi), delhi).join(' ')).toMatch(/calls the Saturn Antardasha upcoming, but it is running now/);
    // Written in the recorded form for the invented default chart, whose Sun is debilitated in Libra.
    const sun = 'Your chart suggests a strong alignment with administrative roles. With the Sun well-placed in your chart, these positions are positively supported, indicating your capacity to handle organizational tasks effectively.';
    expect(fixtureChart().chartData.canonical.strength.dignities.find((d) => d.planet === 'Sun')!.dignity).toBe('Debilitated');
    expect(slotProblems(sun, 'paragraph', factsOf(invented, ['F.administration', ...invented.ledger.byId.get('F.administration')!.derivedFrom!]), invented).join(' ')).toMatch(/overstates Sun's strength/);
    const mercury = load('delhi').find((a) => a.heading === 'Personalised Guidance' && !a.correcting)!.reply.steps[0];
    expect(slotProblems(mercury.text, 'step', strategy(delhi), delhi).join(' ')).toMatch(/overstates Mercury's strength/);
  });

  it('refuses "Upcoming Mercury and Ketu sub-periods" while the Mercury Antardasha runs (recorded Mumbai synthesis)', () => {
    const mumbai = buildCareerReportFacts(fixtureChart(...SYNTHETIC_CHARTS.mumbai), ASOF);
    const synthesis = load('mumbai').map((a) => a.reply).find((r) => /Upcoming Mercury and Ketu/.test(r.synthesis ?? '')).synthesis;
    expect(slotProblems(synthesis, 'synthesis', timing(mumbai), mumbai).join(' ')).toMatch(/calls the Mercury Antardasha upcoming, but it is running now/);
    // The next period really is upcoming.
    expect(slotProblems('The upcoming Ketu sub-period may favour quieter, research-led work, so use the months before it to finish what is in progress and document your results clearly.', 'paragraph', timing(mumbai), mumbai).join(' ')).not.toMatch(/upcoming/);
  });
});
