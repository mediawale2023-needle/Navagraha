// Browser acceptance for the Generate Kundli birth-place field, run against a running
// build. Google Maps is replaced by a deterministic Places API (New) double, so the
// checks run anywhere; the coordinates it returns were recorded from the live API.
// Exits 1 if any check fails; screenshots and results.json go to OUT_DIR.
//
//   cd scripts/acceptance && npm ci
//   BASE_URL=http://127.0.0.1:5000 OUT_DIR=./out node birthplace.mjs
//
// Optional: CHROMIUM_PATH, FORWARDED_PROTO=https (see README.md).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const OUT = process.env.OUT_DIR || './out';
mkdirSync(OUT, { recursive: true });

const results = [];
const record = (viewport, id, name, status, detail = '') => {
  results.push({ viewport, id, name, status, detail });
  console.log(`${status.padEnd(4)} [${viewport}] ${id} ${name}${detail ? ` — ${detail}` : ''}`);
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const PLACES = [
  { placeId: 'p-varanasi', main: 'Varanasi', secondary: 'Uttar Pradesh, India', address: 'Varanasi, Uttar Pradesh, India', lat: 25.317645199999998, lng: 82.9739144 },
  { placeId: 'p-gangapur', main: 'Gangapur', secondary: 'Varanasi, Uttar Pradesh, India', address: 'Gangapur, Uttar Pradesh, India', lat: 25.2357, lng: 82.8506 },
  { placeId: 'p-valencia', main: 'Valencia', secondary: 'Spain', address: 'Valencia, Spain', lat: 39.4699075, lng: -0.3762881 },
];

/** Stand-in for maps/api/js?libraries=places: AutocompleteSuggestion + Place.fetchFields only. */
const fakeMapsJs = (callback) => `(() => {
  const PLACES = ${JSON.stringify(PLACES)};
  window.__places = { mode: 'ok', calls: [] };
  const text = (s) => ({ toString: () => s });
  class AutocompleteSessionToken {}
  const AutocompleteSuggestion = {
    async fetchAutocompleteSuggestions(req) {
      window.__places.calls.push(req.input);
      await new Promise((r) => setTimeout(r, 120));
      if (window.__places.mode === 'error') throw new Error('PLACES_UNAVAILABLE');
      const q = req.input.toLowerCase();
      const hits = window.__places.mode === 'empty' ? [] : PLACES.filter((p) => (p.main + ' ' + p.secondary).toLowerCase().includes(q));
      return { suggestions: hits.map((p) => ({ placePrediction: {
        placeId: p.placeId, text: text(p.main + ', ' + p.secondary), mainText: text(p.main), secondaryText: text(p.secondary),
        toPlace() {
          const place = { async fetchFields() { await new Promise((r) => setTimeout(r, 80)); place.formattedAddress = p.address; place.location = { lat: () => p.lat, lng: () => p.lng }; } };
          return place;
        },
      } })) };
    },
  };
  window.google = { maps: { version: 'test', places: { AutocompleteSuggestion, AutocompleteSessionToken } } };
  window[${JSON.stringify(callback)}]?.();
})();`;

async function newPage(browser, viewport, { mapsScript = 'fake' } = {}) {
  const ctx = await browser.newContext({
    viewport,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
    extraHTTPHeaders: process.env.FORWARDED_PROTO ? { 'X-Forwarded-Proto': process.env.FORWARDED_PROTO } : {},
  });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('hasSeenSplash', 'true'); } catch {} });
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await ctx.route(`${BASE}/api/config`, async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    await route.fulfill({ response: res, json: { ...json, googleMapsApiKey: 'acceptance-test-key' } });
  });
  await ctx.route('https://maps.googleapis.com/**', (route) => {
    if (mapsScript === 'fail') return route.abort();
    const cb = new URL(route.request().url()).searchParams.get('callback');
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: fakeMapsJs(cb) });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return { ctx, page };
}

const state = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="input-place"]');
  return { value: el.value, focused: document.activeElement === el, disabled: el.disabled, gm: [...el.classList].some((c) => c.startsWith('gm')), placeholder: el.placeholder };
});

async function openForm(page) {
  await page.goto(`${BASE}/kundli/new`, { waitUntil: 'networkidle' });
  await page.locator('input[name="name"]').fill('Acceptance Person');
  await page.locator('input[type="date"]').fill('1990-05-15');
  await page.locator('input[type="time"]').fill('10:30');
  const input = page.getByTestId('input-place');
  await input.waitFor();
  return input;
}

/** Types like a person: one key at a time, asserting the field stays focused, enabled and complete after each. */
async function typeContinuously(page, input, text, delay = 60) {
  await input.click();
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i]);
    await page.waitForTimeout(delay);
    const s = await state(page);
    assert(s.focused, `lost focus after "${text.slice(0, i + 1)}"`);
    assert(!s.disabled && !s.gm, `field disabled/taken over after "${text.slice(0, i + 1)}"`);
    assert(s.value === text.slice(0, i + 1), `value "${s.value}" after typing "${text.slice(0, i + 1)}"`);
  }
}

async function submitAndCapture(page) {
  const [req, res] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith('/api/kundli') && r.method() === 'POST'),
    page.waitForResponse((r) => r.url().endsWith('/api/kundli') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /Generate Kundli/ }).click(),
  ]);
  return { body: JSON.parse(req.postData()), status: res.status(), json: await res.json().catch(() => null) };
}

async function check(viewport, id, name, browser, fn, opts) {
  const { ctx, page } = await newPage(browser, viewport.size, opts);
  const shot = (n) => page.screenshot({ path: join(OUT, `${viewport.label}-${n}.png`) });
  try {
    await fn(page, shot);
    record(viewport.label, id, name, 'PASS');
  } catch (e) {
    record(viewport.label, id, name, 'FAIL', String(e.message).split('\n')[0].slice(0, 200));
    await shot(`FAIL-${id}`).catch(() => {});
  } finally {
    await ctx.close();
  }
}

async function run(browser, viewport) {
  await check(viewport, 'BP1', 'continuous typing keeps focus and every character; suggestions appear', browser, async (page, shot) => {
    const input = await openForm(page);
    await typeContinuously(page, input, 'Varanasi, Uttar');
    await page.getByTestId('input-place-option').first().waitFor({ timeout: 5000 });
    assert((await state(page)).focused, 'focus lost when suggestions opened');
    const calls = await page.evaluate(() => window.__places.calls);
    assert(calls.at(-1) === 'Varanasi, Uttar', `last search was "${calls.at(-1)}"`);
    assert(calls.length < 'Varanasi, Uttar'.length - 1, `not debounced: ${calls.length} searches`);
    await shot('bp1-suggestions');
  });

  await check(viewport, 'BP2', 'mouse/touch selection fills the place and sends its exact coordinates; server resolves the time zone', browser, async (page, shot) => {
    const input = await openForm(page);
    await typeContinuously(page, input, 'Vara');
    const option = page.getByTestId('input-place-option').filter({ hasText: 'Varanasi' }).first();
    await option.waitFor({ timeout: 5000 });
    if (viewport.size.width < 600) await option.tap(); else await option.click();
    await page.getByTestId('input-place-panel').waitFor({ state: 'detached', timeout: 5000 });
    const s = await state(page);
    assert(s.value === 'Varanasi, Uttar Pradesh, India', `value after select: "${s.value}"`);
    await shot('bp2-selected');
    const { body, status, json } = await submitAndCapture(page);
    assert(body.latitude === 25.317645199999998 && body.longitude === 82.9739144, `payload coords ${body.latitude},${body.longitude}`);
    assert(body.placeOfBirth === 'Varanasi, Uttar Pradesh, India', `payload place ${body.placeOfBirth}`);
    assert(status === 200 || status === 201, `POST /api/kundli ${status}`);
    const birth = json?.chartData?.canonical?.birth;
    assert(birth?.timezone === 'Asia/Kolkata' && birth?.utcOffset === '+05:30', `timezone ${birth?.timezone} ${birth?.utcOffset}`);
    assert(birth?.coordinateSource === 'supplied', `coordinateSource ${birth?.coordinateSource}`);
  });

  await check(viewport, 'BP3', 'keyboard: arrows move, Enter selects, Escape closes; western longitude keeps its sign', browser, async (page) => {
    const input = await openForm(page);
    await typeContinuously(page, input, 'Va');
    await page.getByTestId('input-place-option').nth(2).waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('input-place-suggestions').waitFor({ state: 'detached', timeout: 2000 });
    await page.keyboard.press('ArrowDown');
    await page.getByTestId('input-place-suggestions').waitFor({ timeout: 2000 });
    await page.keyboard.press('ArrowUp');
    const selected = await page.locator('[role="option"][aria-selected="true"]').innerText();
    assert(selected.startsWith('Valencia'), `ArrowUp wrapped to "${selected}"`);
    const activedescendant = await input.getAttribute('aria-activedescendant');
    assert(activedescendant, 'combobox has no aria-activedescendant');
    await page.keyboard.press('Enter');
    await page.getByTestId('input-place-panel').waitFor({ state: 'detached', timeout: 5000 });
    const s = await state(page);
    assert(s.value === 'Valencia, Spain' && s.focused, `after Enter: "${s.value}" focused=${s.focused}`);
    const { body } = await submitAndCapture(page);
    assert(body.latitude === 39.4699075 && body.longitude === -0.3762881, `payload coords ${body.latitude},${body.longitude}`);
  });

  await check(viewport, 'BP4', 'editing after selecting drops the coordinates (never a stale location)', browser, async (page) => {
    const input = await openForm(page);
    await typeContinuously(page, input, 'Vara');
    await page.getByTestId('input-place-option').first().waitFor({ timeout: 5000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.getByTestId('input-place-panel').waitFor({ state: 'detached', timeout: 5000 });
    await page.keyboard.type(' city');
    await page.keyboard.press('Escape');
    const { body, status } = await submitAndCapture(page);
    assert(body.latitude === undefined && body.longitude === undefined, `stale coords sent: ${body.latitude},${body.longitude}`);
    if (status === 400) {
      await page.getByText(/pick your exact birth place/i).first().waitFor({ timeout: 5000 });
    }
  });

  await check(viewport, 'BP5', 'no matches: a clear empty state, field stays usable', browser, async (page, shot) => {
    const input = await openForm(page);
    await page.evaluate(() => { window.__places.mode = 'empty'; });
    await typeContinuously(page, input, 'Qzxw');
    await page.getByTestId('input-place-status').filter({ hasText: /No matching places/ }).waitFor({ timeout: 5000 });
    await shot('bp5-empty');
    await page.keyboard.type('v');
    const s = await state(page);
    assert(s.focused && s.value === 'Qzxwv', `after empty state: ${JSON.stringify(s)}`);
  });

  await check(viewport, 'BP6', 'search API error: message shown, typing continues, recovers when the API does', browser, async (page, shot) => {
    const input = await openForm(page);
    await page.evaluate(() => { window.__places.mode = 'error'; });
    await typeContinuously(page, input, 'Mumbai');
    await page.getByTestId('input-place-status').filter({ hasText: /not responding/ }).waitFor({ timeout: 5000 });
    await shot('bp6-error');
    const s = await state(page);
    assert(s.focused && !s.disabled && s.placeholder === 'City, State, Country', `after error: ${JSON.stringify(s)}`);
    await page.evaluate(() => { window.__places.mode = 'ok'; });
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Valen');
    await page.getByTestId('input-place-option').first().waitFor({ timeout: 5000 });
  });

  await check(viewport, 'BP7', 'Maps script fails to load: field still types freely and says suggestions are unavailable', browser, async (page, shot) => {
    const input = await openForm(page);
    await typeContinuously(page, input, 'Varanasi');
    await page.getByTestId('input-place-status').filter({ hasText: /could not load/ }).waitFor({ timeout: 5000 });
    await shot('bp7-unavailable');
  }, { mapsScript: 'fail' });

  await check(viewport, 'BP8', 'layout: pin icon, text and spinner do not overlap', browser, async (page, shot) => {
    const input = await openForm(page);
    await typeContinuously(page, input, 'Varanasi');
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="input-place"]');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const icons = [...el.parentElement.querySelectorAll(':scope > svg')].map((s) => s.getBoundingClientRect());
      return { left: r.left, right: r.right, padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight), bg: cs.backgroundImage, icons: icons.map((i) => ({ left: i.left, right: i.right })) };
    });
    const textStart = box.left + box.padL;
    const textEnd = box.right - box.padR;
    const [pin, ...rest] = box.icons;
    assert(pin && pin.right <= textStart, `pin (right ${pin?.right}) overlaps text start ${textStart}`);
    for (const i of rest) assert(i.left >= textEnd, `trailing icon (left ${i.left}) overlaps text end ${textEnd}`);
    assert(box.bg === 'none', `input has a background image: ${box.bg}`);
    await shot('bp8-layout');
  });
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await run(browser, { label: 'mobile', size: { width: 390, height: 844 } });
  await run(browser, { label: 'desktop', size: { width: 1366, height: 900 } });
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'birthplace-results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => r.status === 'FAIL');
const counts = ['PASS', 'FAIL', 'SKIP'].map((s) => `${s} ${results.filter((r) => r.status === s).length}`).join(' · ');
console.log(`\n${counts}`);
process.exit(failed.length ? 1 : 0);
