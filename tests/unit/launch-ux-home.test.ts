import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { KundliInsights } from '../../shared/v3/evidence';
import { selectRunningPeriods } from '../../client/src/lib/runningPeriods';
import { isAstrologerAvailable } from '../../client/src/lib/astrologerPresence';
import { FREE_CHAT_MINUTES } from '../../server/paymentService';

vi.mock('../../server/db', () => ({ pool: { query: vi.fn() }, db: {} }));
vi.mock('../../server/storage', () => ({ storage: {} }));
const { FREE_CHAT_BANNER, HOMEPAGE_COPY_FIXES } = await import('../../server/migrate');

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const period = (lord: string, status: 'past' | 'current' | 'upcoming', antardashas?: any[]) =>
  ({ lord, status, start: '2020-09-01T00:00:00Z', end: '2036-09-01T00:00:00Z', themes: ['growth'], whyItMatters: `${lord} matters.`, antardashas });
const insights = (over: Partial<KundliInsights> = {}): KundliInsights => ({
  headline: { timeAccuracy: 'exact' },
  timeline: [period('Rahu', 'past'), period('Jupiter', 'current', [period('Saturn', 'past'), period('Mercury', 'current')])],
  timing: { mahadashaReliable: true, antardashaReliable: true, note: null },
  ...over,
} as any);

describe('selectRunningPeriods', () => {
  it('returns the running Mahadasha and Antardasha with dates for an exact time', () => {
    const r = selectRunningPeriods(insights());
    expect(r.maha?.lord).toBe('Jupiter');
    expect(r.antar?.lord).toBe('Mercury');
    expect(r.showDates).toBe(true);
  });
  it('withholds periods the approximate birth time could move, and all dates', () => {
    const r = selectRunningPeriods(insights({ headline: { timeAccuracy: 'approximate' } as any, timing: { mahadashaReliable: true, antardashaReliable: false, note: 'Sub-period boundaries may shift.' } }));
    expect(r.maha?.lord).toBe('Jupiter');
    expect(r.antar).toBeUndefined();
    expect(r.showDates).toBe(false);
    expect(r.note).toBe('Sub-period boundaries may shift.');
    expect(selectRunningPeriods(insights({ timing: { mahadashaReliable: false, antardashaReliable: false, note: 'x' } })).maha).toBeUndefined();
  });
  it('returns nothing when no period is current', () => {
    expect(selectRunningPeriods(insights({ timeline: [period('Rahu', 'past')] as any })).maha).toBeUndefined();
  });
});

describe('Home shows the user\'s own running period', () => {
  it('has no hard-coded dasha and shares the selector with Active Influences', () => {
    const home = read('client/src/pages/Home.tsx');
    expect(home).not.toMatch(/>\s*Mars\s*</);
    expect(home).not.toContain('Mahadasha in motion');
    expect(home).toContain('<RunningPeriodCard />');
    expect(read('client/src/components/v3/RunningPeriodCard.tsx')).toContain('selectRunningPeriods(insights)');
    expect(read('client/src/components/v3/ActiveInfluences.tsx')).toContain('selectRunningPeriods(insights)');
  });
});

/** WCAG relative-luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const token = (css: string, name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1];

describe('hero banner CTA is readable', () => {
  const hero = read('client/src/components/HeroBanner.tsx');
  const css = read('client/src/index.css');
  it('uses saffron text on the navy pill, at AA contrast or better', () => {
    const cta = hero.slice(hero.indexOf('data-testid="hero-banner-cta"') - 220, hero.indexOf('data-testid="hero-banner-cta"'));
    expect(cta).toContain('bg-[var(--nava-navy)]');
    expect(cta).toContain('text-primary"');
    expect(cta).not.toContain('text-primary-foreground');
    expect(contrast(token(css, 'primary'), token(css, 'nava-navy'))).toBeGreaterThanOrEqual(4.5);
    // The old pairing really was invisible.
    expect(contrast(token(css, 'primary-foreground'), token(css, 'nava-navy'))).toBeLessThan(1.1);
  });
  it('has a keyboard focus ring and no hard-coded promotional eyebrow', () => {
    expect(hero).toContain('focus-visible:ring-2');
    expect(hero).not.toContain('First chat free');
  });
});

describe('homepage claims match what the product does', () => {
  it('the free-chat copy states the real entitlement from the billing constant', () => {
    expect(FREE_CHAT_BANNER.subtitle).toContain(`first ${FREE_CHAT_MINUTES} minutes of your first chat`);
    const index = read('server/index.ts');
    expect(index).toContain('freeChatMinutes: FREE_CHAT_MINUTES');
    const landing = read('client/src/pages/Landing.tsx');
    expect(landing).not.toContain('First Consultation Free');
    expect(landing).toContain('minutes of your first chat are free');
    expect(landing).not.toContain('On your first wallet recharge');
  });
  it('the guarded fixes only touch rows still holding the original seed text', () => {
    const [insight, premium] = HOMEPAGE_COPY_FIXES;
    expect(insight.text).toContain("title = 'Today''s Insight'");
    expect(insight.text).toContain("subtitle = 'Venus guides you toward love and creative flow. Open yourself to positive energy.'");
    expect(insight.text).toContain("cta = 'Read More'");
    expect(insight.values).toEqual([FREE_CHAT_BANNER.title, FREE_CHAT_BANNER.subtitle, FREE_CHAT_BANNER.cta]);
    expect(premium.text).toContain("title = 'Premium Plan'");
    expect(premium.text).toContain('SET enabled = false');
    expect(premium.text).toContain('AND enabled = true');
  });
  it('fresh databases are seeded without the misleading banners', () => {
    const migrate = read('server/migrate.ts');
    const seed = migrate.slice(migrate.indexOf('const SEED_HOMEPAGE_SQL'));
    expect(seed.slice(0, seed.indexOf('`;'))).not.toMatch(/Venus guides|Premium Plan/);
  });
  it('the landing count never invents a number and uses the directory\'s availability rule', () => {
    const landing = read('client/src/pages/Landing.tsx');
    expect(landing).not.toContain("'24+'");
    expect(landing).toContain('astrologers?.filter(isAstrologerAvailable)');
    expect(read('client/src/pages/Astrologers.tsx')).toContain('isAstrologerAvailable(a) || onlineAstrologers.has(a.id)');
    expect(isAstrologerAvailable({ availability: 'available' })).toBe(true);
    expect(isAstrologerAvailable({ availability: 'busy', isOnline: false })).toBe(false);
    expect(isAstrologerAvailable({ isOnline: true })).toBe(true);
  });
});
