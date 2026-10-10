// Browser acceptance for the report order dialog: saved-chart selection and the birth-place
// field. Runs against a local build started with a dummy OPENAI_API_KEY (orders are accepted,
// generation fails, the order is refunded) and a disposable database:
//
//   NODE_ENV=production PORT=5055 DATABASE_URL=<disposable db> SESSION_SECRET=x \
//   OPENAI_API_KEY=sk-local-dummy FEATURE_RELEASE_B_PRICING=true node dist/index.js
//
//   cd scripts/acceptance && BASE_URL=http://127.0.0.1:5055 DATABASE_URL=<same db> OUT_DIR=./out-ro node report-order.mjs
//
// Google Maps is replaced by a Places API (New) double, as in birthplace.mjs. DATABASE_URL (psql
// on PATH) only sets a wallet balance and inserts a chart without coordinates. Never point it
// at production.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5055').replace(/\/$/, '');
const OUT = process.env.OUT_DIR || './out-ro';
const DB = process.env.DATABASE_URL;
if (!DB) throw new Error('DATABASE_URL (a disposable database) is required');
mkdirSync(OUT, { recursive: true });

const sql = (q) => execFileSync('psql', [DB, '-Atqc', q], { encoding: 'utf8' }).trim();
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.log(`FAIL ${name} — ${String(e.message).split('\n')[0]}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

// Approximate public coordinates for the test double (the double, not Google, returns them).
const PLACES = [
  { placeId: 'p-khamgaon', main: 'Khamgaon', secondary: 'Maharashtra, India', address: 'Khamgaon, Maharashtra, India', lat: 20.7085, lng: 76.5647 },
  { placeId: 'p-khammam', main: 'Khammam', secondary: 'Telangana, India', address: 'Khammam, Telangana, India', lat: 17.2473, lng: 80.1514 },
];
const fakeMapsJs = (callback) => `(() => {
  const PLACES = ${JSON.stringify(PLACES)};
  const text = (s) => ({ toString: () => s });
  class AutocompleteSessionToken {}
  const AutocompleteSuggestion = {
    async fetchAutocompleteSuggestions(req) {
      const q = req.input.toLowerCase();
      return { suggestions: PLACES.filter((p) => (p.main + ' ' + p.secondary).toLowerCase().includes(q)).map((p) => ({ placePrediction: {
        placeId: p.placeId, text: text(p.main + ', ' + p.secondary), mainText: text(p.main), secondaryText: text(p.secondary),
        toPlace() { const place = { async fetchFields() { place.formattedAddress = p.address; place.location = { lat: () => p.lat, lng: () => p.lng }; } }; return place; },
      } })) };
    },
  };
  window.google = { maps: { version: 'test', places: { AutocompleteSuggestion, AutocompleteSessionToken } } };
  window[${JSON.stringify(callback)}]?.();
})();`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });

async function session(viewport, { mapsKey = true } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, extraHTTPHeaders: { 'x-forwarded-proto': 'https' } });
  await ctx.route((url) => !url.href.startsWith(BASE) && !url.href.startsWith('https://maps.googleapis.com/'), (r) => r.abort());
  if (mapsKey) {
    await ctx.route(`${BASE}/api/config`, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...(await res.json()), googleMapsApiKey: 'acceptance-test-key' } });
    });
    await ctx.route('https://maps.googleapis.com/**', (route) => route.fulfill({
      status: 200, contentType: 'text/javascript', body: fakeMapsJs(new URL(route.request().url()).searchParams.get('callback')),
    }));
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}
const api = (page, method, url, body) => page.evaluate(async ([method, url, body]) => {
  const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}, [method, url, body]);
const register = async (page, label) => {
  const email = `ro-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const r = await api(page, 'POST', '/api/auth/register', { email, password: 'Report-Order#2026', firstName: 'Shivani' });
  assert(r.status === 201, `register ${r.status}`);
  sql(`UPDATE wallets SET balance = 1000 WHERE user_id = '${r.json.id}'`);
  return r.json.id;
};
const balance = (userId) => sql(`SELECT balance FROM wallets WHERE user_id = '${userId}'`);
const openCareer = async (page) => {
  await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('button-order-career-report').click();
  await page.getByTestId('button-confirm-order').waitFor();
};
const orderRequest = (page) => page.waitForRequest((r) => r.url().endsWith('/api/reports/order') && r.method() === 'POST');

for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const shot = (page, n) => page.screenshot({ path: join(OUT, `${label}-${n}.png`), fullPage: true });

  // ── An account without saved charts ────────────────────────────────────────
  {
    const { ctx, page } = await session(viewport);
    const userId = await register(page, `${label}-new`);
    await check(`[${label}] no saved charts: Saved chart stays selectable and explains the way forward`, async () => {
      await openCareer(page);
      assert(await page.getByTestId('mode-saved').isEnabled(), 'Saved chart is disabled');
      await page.getByTestId('mode-saved').click();
      await page.getByTestId('no-saved-charts').waitFor();
      assert(await page.getByTestId('button-confirm-order').isDisabled(), 'order enabled with no chart');
      await shot(page, '01-no-saved-charts');
      await page.getByTestId('no-saved-charts').getByRole('button', { name: 'Enter birth details' }).click();
      await page.getByTestId('input-bd-name').waitFor();
    });
    await check(`[${label}] "khamgaon" suggests Khamgaon, Maharashtra; typed text alone cannot be ordered`, async () => {
      await page.getByTestId('input-bd-name').fill('Shivani');
      await page.getByTestId('input-bd-date').fill('1995-11-02');
      await page.getByTestId('input-bd-time').fill('08:15');
      await page.getByTestId('input-place').click();
      await page.keyboard.type('khamgaon', { delay: 40 });
      const option = page.getByTestId('input-place-option').filter({ hasText: 'Khamgaon' });
      await option.first().waitFor();
      assert((await option.first().innerText()).includes('Maharashtra, India'), 'suggestion lacks state/country');
      assert(await page.getByTestId('button-confirm-order').isDisabled(), 'order enabled with unresolved text');
      assert((await page.getByTestId('place-hint').innerText()).includes('Pick the town from the suggestions'), 'no hint');
      await shot(page, '02-khamgaon-suggestions');
      await option.first().click();
      await page.waitForFunction(() => document.querySelector('[data-testid="input-place"]').value === 'Khamgaon, Maharashtra, India');
      assert(await page.getByTestId('button-confirm-order').isEnabled(), 'order disabled after picking');
    });
    await check(`[${label}] editing the place after a pick disables ordering until a new pick`, async () => {
      await page.getByTestId('input-place').press('End');
      await page.keyboard.type(' town');
      assert(await page.getByTestId('button-confirm-order').isDisabled(), 'stale coordinates kept');
      await page.getByTestId('input-place').fill('');
      await page.keyboard.type('khamg', { delay: 40 });
      await page.getByTestId('input-place-option').filter({ hasText: 'Khamgaon' }).first().click();
      await page.waitForFunction(() => document.querySelector('[data-testid="input-place"]').value === 'Khamgaon, Maharashtra, India');
    });
    await check(`[${label}] the order sends the picked coordinates; the server charges the shown price, then refunds the failed report`, async () => {
      const before = balance(userId);
      const [req, res] = await Promise.all([
        orderRequest(page),
        page.waitForResponse((r) => r.url().endsWith('/api/reports/order')),
        page.getByTestId('button-confirm-order').click(),
      ]);
      const body = JSON.parse(req.postData());
      assert(body.birthDetails.latitude === 20.7085 && body.birthDetails.longitude === 76.5647, `coords ${body.birthDetails.latitude},${body.birthDetails.longitude}`);
      assert(body.birthDetails.placeOfBirth === 'Khamgaon, Maharashtra, India' && !body.kundliId, 'body');
      assert(res.status() === 201, `order ${res.status()}`);
      const orderId = (await res.json()).orderId;
      let refunded = '';
      for (let i = 0; i < 40 && !refunded; i++) { await page.waitForTimeout(500); refunded = sql(`SELECT coalesce(refunded_at::text,'') FROM report_orders WHERE id = '${orderId}'`); }
      assert(refunded, 'not refunded');
      assert(balance(userId) === before, `balance ${before} → ${balance(userId)}`);
      assert(sql(`SELECT charged_amount FROM report_orders WHERE id = '${orderId}'`) === '299.00', 'charged amount');
      await shot(page, '03-ordered-from-details');
    });
    await ctx.close();
  }

  // ── An account with saved charts, one of them limited ─────────────────────
  {
    const { ctx, page } = await session(viewport);
    const userId = await register(page, `${label}-charts`);
    const limitedId = sql(`INSERT INTO kundlis (user_id,name,gender,date_of_birth,time_of_birth,place_of_birth,zodiac_sign,moon_sign,ascendant,chart_data,created_at) VALUES ('${userId}','Old chart','female','1985-03-10','09:00','Pune','Pisces','Leo','Gemini','{"planetaryPositions":[],"houses":[]}', now() + interval '1 hour') RETURNING id`).split('\n')[0];
    const own = (await api(page, 'POST', '/api/kundli', { name: 'Shivani', gender: 'female', dateOfBirth: '1995-11-02', timeOfBirth: '08:15', placeOfBirth: 'Khamgaon, Maharashtra, India', latitude: 20.7085, longitude: 76.5647 })).json;
    await api(page, 'POST', '/api/kundli', { name: 'Rohan', gender: 'male', dateOfBirth: '1992-01-20', timeOfBirth: '21:40', placeOfBirth: 'Pune, Maharashtra, India', latitude: 18.5204, longitude: 73.8567 });
    await check(`[${label}] saved charts list name, date, time and place; a limited chart cannot be picked`, async () => {
      await openCareer(page);
      await page.getByTestId('saved-charts').waitFor();
      const row = await page.getByTestId(`saved-chart-${own.id}`).innerText();
      for (const t of ['Shivani', '2 Nov 1995', '08:15', 'Khamgaon, Maharashtra, India']) assert(row.includes(t), `row lacks ${t}: ${row}`);
      assert(await page.getByTestId(`saved-chart-${limitedId}`).locator('input').isDisabled(), 'limited chart selectable');
      assert(!(await page.getByTestId(`saved-chart-${limitedId}`).locator('input').isChecked()), 'limited chart preselected');
      assert(await page.getByTestId('button-confirm-order').isEnabled(), 'no chart preselected');
      await shot(page, '04-saved-charts');
    });
    await check(`[${label}] ordering with a picked saved chart sends only its id; nothing re-entered`, async () => {
      await page.getByTestId(`saved-chart-${own.id}`).click();
      const before = balance(userId);
      const [req, res] = await Promise.all([
        orderRequest(page),
        page.waitForResponse((r) => r.url().endsWith('/api/reports/order')),
        page.getByTestId('button-confirm-order').click(),
      ]);
      const body = JSON.parse(req.postData());
      assert(body.kundliId === own.id && !body.birthDetails, `body ${req.postData()}`);
      assert(res.status() === 201, `order ${res.status()}`);
      const orderId = (await res.json()).orderId;
      let refunded = '';
      for (let i = 0; i < 40 && !refunded; i++) { await page.waitForTimeout(500); refunded = sql(`SELECT coalesce(refunded_at::text,'') FROM report_orders WHERE id = '${orderId}'`); }
      assert(refunded && balance(userId) === before, `refunded ${Boolean(refunded)}, balance ${before} → ${balance(userId)}`);
    });
    await check(`[${label}] another account's chart id is refused before any charge`, async () => {
      const { ctx: other, page: p2 } = await session(viewport);
      const otherId = await register(p2, `${label}-other`);
      const types = (await api(p2, 'GET', '/api/reports/types')).json;
      const career = types.find((t) => t.slug === 'career-report');
      const r = await api(p2, 'POST', '/api/reports/order', { reportTypeId: career.id, kundliId: own.id, expectedPrice: 299 });
      assert(r.status === 404 && balance(otherId) === '1000.00', `status ${r.status}, balance ${balance(otherId)}`);
      assert(sql(`SELECT count(*) FROM report_orders WHERE user_id = '${otherId}'`) === '0', 'order created');
      await other.close();
    });
    await ctx.close();
  }

  // ── A site without a Maps key ──────────────────────────────────────────────
  {
    const { ctx, page } = await session(viewport, { mapsKey: false });
    await register(page, `${label}-nokey`);
    await check(`[${label}] without a Maps key the place field says suggestions are unavailable; ordering stays off`, async () => {
      await openCareer(page);
      await page.getByTestId('input-bd-name').fill('Shivani');
      await page.getByTestId('input-bd-date').fill('1995-11-02');
      await page.getByTestId('input-bd-time').fill('08:15');
      await page.getByTestId('input-place').click();
      await page.keyboard.type('khamgaon', { delay: 20 });
      const status = await page.getByTestId('input-place-status').innerText();
      assert(status.includes('not available'), `status "${status}"`);
      assert(await page.getByTestId('button-confirm-order').isDisabled(), 'order enabled');
      await shot(page, '05-no-maps-key');
    });
    await ctx.close();
  }
}
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exit(failures ? 1 : 0);
