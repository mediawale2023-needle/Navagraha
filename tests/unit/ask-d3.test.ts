// Direction 3 Stage 5: the Ask answer card is built from the evidence packet, and its glossary
// defines vocabulary only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { buildEvidencePacket, packetSummary, routeQuestion } from '../../server/agents/askKundli';
import { GLOSSARY, termsIn, DOMAIN_BHAVA, SOURCE_LABEL } from '../../client/src/lib/glossary';
import type { CanonicalChart } from '../../shared/v3/canonical';

const AS_OF = new Date('2026-10-09T00:00:00Z');

describe('answer card evidence', () => {
  it('carries the verdict’s own core, usable items: the strongest for, then against', async () => {
    const chart = (await getKundli('1990-08-15', '06:30', 12.9716, 77.5946)).chartData.canonical as CanonicalChart;
    const packet = buildEvidencePacket(chart, routeQuestion('How does my career look this year?'), AS_OF);
    const summary = packetSummary(packet);
    const career = summary.domains.find((d) => d.domain === 'career')!;
    expect(career.items.length).toBeGreaterThan(0);
    expect(career.items.length).toBeLessThanOrEqual(4);
    const resolution = packet.resolutions.find((r) => r.domain === 'career')!;
    const allowed = new Set([...resolution.supporting, ...resolution.conflicting].filter((e) => e.tier === 'core' && e.usable).map((e) => e.explanation));
    for (const item of career.items) expect(allowed.has(item.explanation)).toBe(true);
    // For-items come first.
    const firstAgainst = career.items.findIndex((i) => i.direction === 'negative');
    if (firstAgainst >= 0) expect(career.items.slice(firstAgainst).every((i) => i.direction === 'negative')).toBe(true);
    for (const item of career.items) expect(SOURCE_LABEL[item.source]).toBeTruthy();
  });
});

describe('glossary', () => {
  it('gives every term a Devanagari name and a definition', () => {
    for (const g of GLOSSARY) {
      expect(g.hi).toMatch(/[ऀ-ॿ]/);
      expect(g.definition.length).toBeGreaterThan(20);
    }
  });
  it('finds terms in the order they appear ("bindus" names Ashtakavarga first)', () => {
    const found = termsIn('Your 10th house has 41 bindus in Sarvashtakavarga, and its lord is in its own sign in the Dasamsa, a dusthana elsewhere.').map((t) => t.term);
    expect(found.slice(0, 2)).toEqual(['Ashtakavarga', 'Sarvashtakavarga']);
    expect(found).toEqual(expect.arrayContaining(['Dasamsa · D10', 'Own sign', 'Dusthana']));
  });
  it('labels the career answer with the bhava, as the mockup does', () => {
    expect(DOMAIN_BHAVA.career).toBe('कर्म भाव');
  });
});

describe('Ask page', () => {
  const ask = readFileSync(new URL('../../client/src/pages/AIAstrologer.tsx', import.meta.url), 'utf8');
  it('offers no health question (health is outside the evidence engine)', () => {
    expect(ask).not.toMatch(/label: 'Health'/);
  });
  it('keeps the composer above the mobile tab bar and the answer card on the evidence packet', () => {
    expect(ask).toContain('bottom-[var(--tabbar-height)]');
    expect(ask).toContain('evidence={msg.evidence}');
  });
});
