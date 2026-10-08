import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source guards: consumer screens must not show pre-written personal astrology claims.
const src = (path: string) => readFileSync(new URL(`../../client/src/${path}`, import.meta.url), 'utf8');

describe('no hard-coded personal astrology on consumer screens', () => {
  it('Home shows the user’s real periods, not fixed ones', () => {
    const home = src('pages/Home.tsx');
    expect(home).not.toMatch(/Mars Mahadasha|Saturn Transit 12th House|Saturn turns benefic/);
    expect(home).toContain('<ActiveInfluences />');
  });
  it('Remedies never manufactures a dosha or pushes a gemstone for everyone', () => {
    const remedies = src('pages/Remedies.tsx');
    expect(remedies).not.toMatch(/Mangal Dosha Shanti|malefic effects of Mars in your chart|Red Coral/);
    expect(remedies).not.toMatch(/priority: 'high',/);
    expect(remedies).toContain('remediesFromChart');
  });
  it('the evidence UI explains, it does not invent', () => {
    const glance = src('components/v3/ChartGlance.tsx');
    const timeline = src('components/v3/LifeTimeline.tsx');
    expect(glance).toContain('d.verdict');
    expect(timeline).toContain('p.whyItMatters');
  });
});
