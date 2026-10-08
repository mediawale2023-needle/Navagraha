import { describe, expect, it } from 'vitest';
import {
  PalmExtractSchema,
  buildPalmTeaser,
  PALM_UNLOCK_PRICE_INR,
} from '../../server/palmistryService';

function sampleExtract(overrides: Record<string, unknown> = {}) {
  const base = {
    hand: 'left',
    confidence: 0.82,
    quality: { lighting: 'good', blur: 'sharp', framing: 'full', notes: '' },
    lines: {
      life: {
        clarity: 'deep',
        length: 'long',
        breaks: false,
        forks: false,
        note: '',
        polyline: [{ x: 0.2, y: 0.8 }, { x: 0.35, y: 0.55 }, { x: 0.4, y: 0.3 }],
      },
      head: {
        clarity: 'clear',
        length: 'medium',
        breaks: false,
        forks: true,
        note: '',
        polyline: [{ x: 0.15, y: 0.45 }, { x: 0.5, y: 0.48 }, { x: 0.75, y: 0.5 }],
      },
      heart: {
        clarity: 'clear',
        length: 'long',
        breaks: false,
        forks: false,
        note: '',
        polyline: [{ x: 0.2, y: 0.28 }, { x: 0.55, y: 0.25 }, { x: 0.85, y: 0.3 }],
      },
      fate: {
        clarity: 'faint',
        length: 'medium',
        breaks: true,
        forks: false,
        note: '',
        polyline: [{ x: 0.5, y: 0.85 }, { x: 0.52, y: 0.5 }, { x: 0.55, y: 0.2 }],
      },
    },
    mounts: {
      venus: { development: 'prominent', note: '' },
      jupiter: { development: 'balanced', note: '' },
      saturn: { development: 'flat', note: '' },
      sun: { development: 'balanced', note: '' },
      mercury: { development: 'balanced', note: '' },
      moon: { development: 'prominent', note: '' },
      mars: { development: 'balanced', note: '' },
    },
    marks: [],
  };
  return PalmExtractSchema.parse({ ...base, ...overrides });
}

describe('palmistryService', () => {
  it('exposes the consumer unlock price', () => {
    expect(PALM_UNLOCK_PRICE_INR).toBe(199);
  });

  it('builds a free teaser plus locked private cards from extract', () => {
    const teaser = buildPalmTeaser(sampleExtract());
    expect(teaser.lineCount).toBe(4);
    expect(teaser.free.length).toBeGreaterThanOrEqual(2);
    expect(teaser.locked.length).toBeGreaterThanOrEqual(2);
    expect(teaser.free[0].area).toBeTruthy();
    expect(teaser.locked[0].hint).toBeTruthy();
  });

  it('rejects incomplete polylines via schema', () => {
    expect(() =>
      PalmExtractSchema.parse({
        ...sampleExtract(),
        lines: {
          ...sampleExtract().lines,
          life: { clarity: 'clear', length: 'short', breaks: false, forks: false, polyline: [{ x: 0.1, y: 0.1 }] },
        },
      }),
    ).toThrow();
  });
});
