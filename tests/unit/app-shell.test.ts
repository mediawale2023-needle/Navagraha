// Direction 3 Stage 2: one application shell and one page header for every consumer page.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { PRIMARY_NAV, activeNav, isPortalPath, moreItems } from '../../client/src/components/shell/navigation';

const pagesDir = 'client/src/pages';
const read = (p: string) => readFileSync(p, 'utf8');

// Marketplace conversation screens (paused) and the portals keep their own full-screen chrome.
const OWN_CHROME = new Set(['Chat.tsx', 'CallRoom.tsx', 'LiveStream.tsx', 'LiveStudio.tsx', 'Landing.tsx', 'not-found.tsx',
  'AdminDashboard.tsx', 'AdminLogin.tsx', 'AstrologerDashboard.tsx', 'AstrologerLogin.tsx', 'AstrologerPro.tsx', 'PatternMatcher.tsx']);
const consumerPages = readdirSync(pagesDir).filter((f) => f.endsWith('.tsx') && !OWN_CHROME.has(f));

describe('primary navigation', () => {
  it('is the Direction 3 set, in order, with four mobile tabs', () => {
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual(['Today', 'Kundli', 'Ask', 'Dasha', 'Panchang', 'Reports']);
    expect(PRIMARY_NAV.filter((i) => i.tab).map((i) => i.label)).toEqual(['Today', 'Kundli', 'Ask', 'Dasha']);
  });

  it.each([
    ['/', '', 'today'],
    ['/kundli', '', 'kundli'],
    ['/kundli/new', '', 'kundli'],
    ['/kundli/abc', '?tab=chart', 'kundli'],
    ['/kundli/abc', '?tab=dashas', 'dasha'],
    ['/kundli', '?for=dasha', 'dasha'],
    ['/ai-astrologer', '?kundliId=1', 'ask'],
    ['/panchang', '', 'panchang'],
    ['/reports', '', 'reports'],
    ['/wallet', '', null],
  ])('%s%s is %s', (path, search, id) => {
    expect(activeNav(path, search)).toBe(id);
  });

  it('leaves the astrologer and admin portals to their own chrome, but not the astrologer list', () => {
    expect(isPortalPath('/astrologer/pro')).toBe(true);
    expect(isPortalPath('/admin/dashboard')).toBe(true);
    expect(isPortalPath('/astrologers')).toBe(false);
    expect(isPortalPath('/')).toBe(false);
  });

  it('never offers a paused marketplace page in the account menu', () => {
    const off = moreItems(false, false).map((m) => m.href);
    for (const href of ['/astrologers', '/live', '/store', '/pooja']) expect(off).not.toContain(href);
    expect(moreItems(true, false).map((m) => m.href)).toEqual(expect.arrayContaining(['/astrologers', '/store']));
  });

  it('does not repeat the desktop band in the desktop account menu', () => {
    const desktop = moreItems(false, true).map((m) => m.label);
    expect(desktop).not.toContain('Panchang');
    expect(desktop).not.toContain('Reports');
  });
});

describe('one shell, one header', () => {
  it('the splash screen and the old navigation components are gone', () => {
    for (const f of ['client/src/pages/Splash.tsx', 'client/src/components/TopNav.tsx', 'client/src/components/BottomNav.tsx']) {
      expect(existsSync(f)).toBe(false);
    }
    const app = read('client/src/App.tsx');
    expect(app).toContain('<AppShell>');
    expect(app).not.toMatch(/Splash|hasSeenSplash/);
  });

  it.each(consumerPages)('%s uses the shared PageHeader and draws no navigation or sticky header of its own', (f) => {
    const src = read(`${pagesDir}/${f}`);
    // Today's header is its Panchang hero, the navy band of the Today mockup.
    expect(src).toContain(f === 'Home.tsx' ? '<TodayHero' : '<PageHeader');
    expect(src).not.toMatch(/BottomNav|TopNav|sticky top-0|<header/);
  });
});

describe('one name for the feature', () => {
  it('is "Ask your Kundli" in every user-facing string', () => {
    const files = [...consumerPages.map((f) => `${pagesDir}/${f}`), 'client/src/pages/Landing.tsx',
      ...readdirSync('client/src/components').filter((f) => f.endsWith('.tsx')).map((f) => `client/src/components/${f}`),
      ...readdirSync('client/src/components/v3').map((f) => `client/src/components/v3/${f}`)];
    const offenders = files.filter((p) => read(p).split('\n')
      .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
      .some((l) => /Ask Your\s*\\?n?\s*Kundli|AI Astrologer|Jyotish AI/.test(l)));
    expect(offenders).toEqual([]);
  });
});
