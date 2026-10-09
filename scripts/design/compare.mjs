// Side-by-side fidelity check: the approved Direction 3 mockup (left) and the running app (right),
// at the mockup's own viewport.
//
//   BASE_URL=http://localhost:5000 OUT_DIR=./design-compare node scripts/design/compare.mjs [screen ...]
//
// It registers a throwaway user and saves the mockups' sample chart (15 Aug 1990, 06:30, Bengaluru),
// so point it at a local or staging database, never production. Screens default to all below.
// Uses the pinned playwright-core in scripts/acceptance; CHROMIUM_PATH overrides the browser.
import { chromium } from '../acceptance/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const OUT = process.env.OUT_DIR || './design-compare';
const REF = join(dirname(fileURLToPath(import.meta.url)), '../../docs/design/direction-3/reference');
mkdirSync(OUT, { recursive: true });

// path may contain {chart}, replaced by the saved sample chart's id.
const SCREENS = {
  'today-desktop': { path: '/', viewport: { width: 1440, height: 1040 } },
  'kundli-desktop': { path: '/kundli/{chart}', viewport: { width: 1440, height: 1040 } },
  // The Ask mockups show an answer to this question.
  'ask-desktop': { path: '/ai-astrologer?kundliId={chart}', viewport: { width: 1440, height: 1040 }, ask: 'How does my career look this year?' },
  'today-mobile': { path: '/', viewport: { width: 390, height: 844 } },
  'kundli-mobile': { path: '/kundli/{chart}', viewport: { width: 390, height: 844 } },
  'ask-mobile': { path: '/ai-astrologer?kundliId={chart}', viewport: { width: 390, height: 844 }, ask: 'How does my career look this year?' },
};
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCREENS);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// The forwarded-proto header lets a production build (secure session cookie) be compared over plain http.
const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } });
await ctx.addInitScript(() => { try { sessionStorage.setItem('hasSeenSplash', 'true'); } catch {} });
const page = await ctx.newPage();
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
const api = (method, path, body) => page.evaluate(async ([m, p, b]) => {
  const r = await fetch(p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined, credentials: 'include' });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}, [method, path, body]);

const reg = await api('POST', '/api/auth/register', { email: `design-${Date.now()}@example.test`, password: 'DesignCompare#2026', firstName: 'Ananya' });
if (reg.status >= 300) throw new Error(`register failed (${reg.status})`);
const chart = await api('POST', '/api/kundli', {
  name: 'Ananya', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', placeOfBirth: 'Bengaluru, Karnataka, India',
  latitude: 12.9716, longitude: 77.5946, gender: 'female',
});
if (!chart.json?.id) throw new Error(`saving the sample chart failed (${chart.status})`);

for (const name of wanted) {
  const s = SCREENS[name];
  if (!s) { console.log('unknown screen', name); continue; }
  await page.setViewportSize(s.viewport);
  await page.goto(BASE + s.path.replace('{chart}', chart.json.id), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (s.ask) {
    // Each screen starts its own thread; otherwise the previous screen's stored conversation is restored first.
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    const box = page.locator('#ask-input');
    await box.fill(s.ask);
    await box.press('Enter');
    await page.getByTestId('answer-card').last().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200); // let the page's own scroll-to-answer settle
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.waitForTimeout(500);
  const app = await page.screenshot({ fullPage: s.viewport.width > 600 });
  const ref = readFileSync(join(REF, `${name}.png`));
  const sheet = await browser.newPage({ viewport: { width: s.viewport.width * 2 + 48, height: 200 } });
  await sheet.setContent(`<body style="margin:0;background:#ddd;font:14px sans-serif;display:flex;gap:16px;padding:16px;align-items:flex-start">
    <figure style="margin:0"><figcaption>Approved mockup</figcaption><img style="display:block" src="data:image/png;base64,${ref.toString('base64')}"></figure>
    <figure style="margin:0"><figcaption>Implemented app</figcaption><img style="display:block" src="data:image/png;base64,${app.toString('base64')}"></figure></body>`);
  await sheet.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  await sheet.close();
  console.log('compared', name);
}
await browser.close();
