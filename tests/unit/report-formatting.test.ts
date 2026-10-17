import { describe, expect, it } from 'vitest';
import { formatDashaPeriod, formatPlanetDegree } from '../../client/src/lib/reportFormatting';
import { careerMetadata } from '../../server/careerReportRendering';
import { buildCareerReportFacts } from '../../server/careerReportEvidence';
import { ASOF, fixtureChart } from '../fixtures/career-chart';

describe('Career report display formatting', () => {
  it('renders engine-derived past, current and upcoming Mahadasha dates', () => {
    const kundli = fixtureChart();
    const metadata = careerMetadata(buildCareerReportFacts(kundli, ASOF), kundli);
    for (const status of ['past', 'current', 'upcoming'] as const) {
      const period = metadata.dashaTimeline.find((item) => item.status === status)!;
      expect(period).toBeDefined();
      expect(formatDashaPeriod(period)).toBe(`${period.startDate} – ${period.endDate}`);
      expect(formatDashaPeriod(period)).not.toBe('—');
    }
    const current = metadata.dashaTimeline.find((item) => item.status === 'current')!;
    expect(current.currentAntardasha).not.toBeNull();
    expect(formatDashaPeriod(current.currentAntardasha!)).toBe(`${current.currentAntardasha!.startDate} – ${current.currentAntardasha!.endDate}`);
  });

  it('rounds display degrees to minutes without mutating the source precision', () => {
    const source = 26.64995954099811;
    expect(formatPlanetDegree(source)).toBe('26°39′');
    expect(source).toBe(26.64995954099811);
    expect(formatPlanetDegree(29.9999)).toBe('29°59′');
    expect(formatPlanetDegree(undefined)).toBe('—');
  });
});
