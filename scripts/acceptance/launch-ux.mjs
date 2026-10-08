// Browser acceptance checks for the launch UX fixes (audit F01–F40), run against a
// running build. Every check asserts behaviour; screenshots of each affected screen
// are written for review. Exits 1 if any check fails.
//
//   cd scripts/acceptance && npm ci
//   BASE_URL=http://127.0.0.1:5000 OUT_DIR=./out node launch-ux.mjs
//
// Optional environment:
//   CHROMIUM_PATH          Chromium executable (default: the one playwright-core 1.56.1 installs)
//   FORWARDED_PROTO=https  send X-Forwarded-Proto, for a production build served over plain HTTP locally
//   ADMIN_EMAIL/ADMIN_PASSWORD  an admin (free access) account, to check that admins can still order reports
//   DATABASE_URL           with psql on PATH, inserts a pre-V3 chart without coordinates for the legacy checks
//   FONTS_VIA_CURL=1       fetch Google font files with curl (for sandboxes whose proxy strips CORS headers)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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

/** Same rule as client/src/lib/astrologerPresence.ts. */
const available = (a) => Boolean(a.isOnline) || a.availability === 'available' || a.availability === 'online';

function contrast(rgbA, rgbB) {
  const parse = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(parse(rgbA)), lum(parse(rgbB))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

async function newContext(browser, viewport) {
  const ctx = await browser.newContext({
    viewport,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
    extraHTTPHeaders: process.env.FORWARDED_PROTO ? { 'X-Forwarded-Proto': process.env.FORWARDED_PROTO } : {},
  });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('hasSeenSplash', 'true'); } catch {} });
  if (process.env.FONTS_VIA_CURL) {
    const cacheDir = join(OUT, '.fontcache');
    mkdirSync(cacheDir, { recursive: true });
    await ctx.route('https://fonts.gstatic.com/**', async (route) => {
      const url = route.request().url();
      const file = join(cacheDir, Buffer.from(url).toString('base64url').slice(-80));
      if (!existsSync(file)) execFileSync('curl', ['-sS', '-m', '30', '-o', file, url]);
      await route.fulfill({ status: 200, body: readFileSync(file), headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'font/woff2' } });
    });
  }
  return ctx;
}

/** JSON request from inside the page, so the session cookie behaves exactly as in the app. */
const api = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const res = await fetch(p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined, credentials: 'include' });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}, [method, path, body]);

const bodyText = (page) => page.evaluate(() => document.body.innerText);
const noRawJsonToast = async (page) => {
  const text = await bodyText(page);
  assert(!/\b\d{3}: \{/.test(text) && !text.includes('{"message"'), 'a raw "<status>: {json}" error is on screen');
};

async function run(browser, label, viewport) {
  const ctx = await newContext(browser, viewport);
  const page = await ctx.newPage();
  const shot = async (name, opts = {}) => { await page.waitForTimeout(500); await page.screenshot({ path: join(OUT, `${label}-${name}.png`), fullPage: opts.full ?? false }); };
  const check = async (id, name, fn) => {
    try { const r = await fn(); if (r === 'SKIP') return; record(label, id, name, 'PASS'); }
    catch (e) { record(label, id, name, 'FAIL', String(e.message || e).split('\n')[0].slice(0, 240)); await shot(`FAIL-${id}`).catch(() => {}); }
  };
  const skip = (id, name, why) => { record(label, id, name, 'SKIP', why); return 'SKIP'; };

  // ── Logged out: landing claims ─────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await check('F05', 'landing shows a real online count and the true free-chat terms', async () => {
    await page.waitForTimeout(800);
    const astrologers = (await api(page, 'GET', '/api/astrologers')).json ?? [];
    const config = (await api(page, 'GET', '/api/config')).json ?? {};
    const text = await bodyText(page);
    assert(!text.includes('24+'), 'made-up "24+" count');
    const shown = await page.getByTestId('landing-online-count').textContent();
    assert(Number(shown) === astrologers.filter(available).length, `count ${shown} ≠ ${astrologers.filter(available).length} available`);
    const terms = await page.getByTestId('landing-free-chat-terms').textContent();
    assert(terms.includes(`first ${config.freeChatMinutes} minutes of your first chat`), `free-chat terms: "${terms}"`);
    assert(!text.includes('First Consultation Free') && !text.includes('On your first wallet recharge'), 'old claims still shown');
    await shot('landing');
  });

  // ── A user with an exact chart, two approximate charts and (optionally) a legacy chart ─
  const email = `acceptance-${label}-${Date.now()}@example.test`;
  const reg = await api(page, 'POST', '/api/auth/register', { email, password: 'Acceptance#2026', firstName: 'Ananya' });
  assert(reg.status === 201 || reg.status === 200, `register failed (${reg.status})`);
  const bengaluru = { placeOfBirth: 'Bengaluru', latitude: 12.9716, longitude: 77.5946 };
  // Approximate, Moon sign stable across the birth date (Chandra Lagna) and with withheld periods.
  const approx = (await api(page, 'POST', '/api/kundli', { name: 'Rahul (approx.)', gender: 'male', dateOfBirth: '1988-02-14', timeOfBirth: '06:00', isBirthTimeApproximate: true, ...bengaluru })).json;
  // Approximate, Moon changes sign during the birth date: found from the engine's own uncertainty
  // flag, computed as a logged-out guest so nothing is saved while searching.
  const guestCtx = await newContext(browser, viewport);
  const guest = await guestCtx.newPage();
  await guest.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  let unstableDate = null;
  for (let d = 1; d <= 31 && !unstableDate; d++) {
    const date = `1990-01-${String(d).padStart(2, '0')}`;
    const k = (await api(guest, 'POST', '/api/kundli', { name: 'probe', gender: 'female', dateOfBirth: date, timeOfBirth: '12:00', isBirthTimeApproximate: true, ...bengaluru })).json;
    if (k?.id == null && k?.chartData?.canonical?.uncertainty?.moonSignStableAcrossBirthDate === false) unstableDate = date;
  }
  await guestCtx.close();
  const unstableChart = unstableDate
    ? (await api(page, 'POST', '/api/kundli', { name: 'Moon sign uncertain', gender: 'female', dateOfBirth: unstableDate, timeOfBirth: '12:00', isBirthTimeApproximate: true, ...bengaluru })).json
    : null;
  await page.waitForTimeout(1100);
  const exact = (await api(page, 'POST', '/api/kundli', { name: 'Ananya', gender: 'female', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', ...bengaluru })).json;
  assert(exact?.id && approx?.id, 'could not create charts');

  let legacyId = null;
  if (process.env.DATABASE_URL) {
    try {
      const sql = (q) => execFileSync('psql', [process.env.DATABASE_URL, '-tAc', q]).toString().trim();
      const uid = sql(`select id from users where email='${email}'`);
      legacyId = sql(`insert into kundlis (user_id,name,gender,date_of_birth,time_of_birth,place_of_birth,zodiac_sign,moon_sign,ascendant,chart_data) values ('${uid}','Old chart (no birthplace)','female','1985-03-10','09:00','Pune','Pisces','Leo','Gemini','{"planetaryPositions":[],"houses":[]}') returning id`).split('\n')[0];
      // Keep the exact chart the most recent, so Home and Active Influences read it.
      sql(`update kundlis set created_at = now() + interval '1 minute' where id='${exact.id}'`);
    } catch (e) { console.log(`legacy chart setup failed: ${String(e.message).slice(0, 120)}`); legacyId = null; }
  }

  // ── Home ────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await check('F01', 'Home shows the running period of the latest chart, as Active Influences does', async () => {
    const list = (await api(page, 'GET', '/api/kundli')).json;
    const insights = (await api(page, 'GET', `/api/kundli/${list[0].id}/insights`)).json;
    const maha = insights.timing?.mahadashaReliable === false ? null : insights.timeline.find((p) => p.status === 'current');
    const title = (await page.getByTestId('running-period-title').textContent()).trim();
    assert(maha && title === `${maha.lord} Mahadasha`, `card says "${title}", chart says ${maha ? maha.lord : 'none'}`);
    assert((await bodyText(page)).includes(`${maha.lord} Mahadasha`), 'Active Influences disagrees');
    await page.getByTestId('running-period-card').scrollIntoViewIfNeeded();
    await shot('home-running-period');
  });
  await check('F02', 'hero CTA text is visible at AA contrast', async () => {
    const cta = page.getByTestId('hero-banner-cta');
    await cta.scrollIntoViewIfNeeded();
    const { color, bg, text } = await cta.evaluate((el) => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor, text: el.innerText.trim() }));
    assert(text.length > 0, 'CTA has no text');
    const ratio = contrast(color, bg);
    assert(ratio >= 4.5, `contrast ${ratio.toFixed(2)}:1`);
    await shot('home-hero');
  });

  // ── Kundli creation: inline place error ──────────────────────────────────────
  await page.goto(`${BASE}/kundli/new`, { waitUntil: 'networkidle' });
  await check('F08a', 'unpicked birth place is reported on the field, not as raw JSON', async () => {
    await page.getByPlaceholder(/full name/i).fill('Acceptance Person');
    await page.getByRole('button', { name: /continue/i }).first().click();
    await page.locator('input[type="date"]').fill('1992-05-13');
    await page.locator('input[type="time"]').fill('06:30');
    await page.getByRole('button', { name: /continue/i }).first().click();
    await page.getByPlaceholder(/city|place|location/i).first().fill('Pune');
    await page.getByRole('button', { name: /generate|create/i }).last().click();
    await page.getByText(/pick your exact birth place/i).first().waitFor({ timeout: 8000 });
    await noRawJsonToast(page);
    await shot('kundli-new-place-error');
  });

  // ── Matchmaking: inline place errors ─────────────────────────────────────────
  await page.goto(`${BASE}/kundli/matchmaking`, { waitUntil: 'networkidle' });
  await check('F08b', 'matchmaking reports the unresolved birth place on the field', async () => {
    const names = page.getByPlaceholder(/full name/i);
    await names.nth(0).fill('Asha'); await names.nth(1).fill('Ravi');
    const dates = page.locator('input[type="date"]'); await dates.nth(0).fill('1992-05-13'); await dates.nth(1).fill('1990-02-02');
    const times = page.locator('input[type="time"]'); await times.nth(0).fill('06:30'); await times.nth(1).fill('10:00');
    const places = page.getByPlaceholder(/city/i); await places.nth(0).fill('Nowhere Town'); await places.nth(1).fill('Nowhere City');
    const response = page.waitForResponse((r) => r.url().includes('/api/matchmaking'));
    await page.getByRole('button', { name: /calculate/i }).last().click();
    if ((await response).ok()) {
      return skip('F08b', 'matchmaking reports the unresolved birth place on the field', 'server geocoded the typed text (Google key present)');
    }
    await page.waitForTimeout(800);
    await noRawJsonToast(page); // toasts auto-dismiss, so check before waiting any longer
    const err = page.getByText(/pick this birth place from the suggestions/i).first();
    await err.waitFor({ timeout: 5000 });
    await noRawJsonToast(page);
    await err.scrollIntoViewIfNeeded();
    await shot('matchmaking-place-error');
  });

  // ── My Charts ───────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/kundli`, { waitUntil: 'networkidle' });
  await check('F11', 'My Charts states no Ascendant for approximate or unverified charts', async () => {
    await page.getByTestId(`chart-approx-${approx.id}`).waitFor({ timeout: 8000 });
    const approxCard = await page.getByTestId(`chart-${approx.id}`).innerText();
    assert(!approxCard.includes('Asc:'), `approximate card shows "${approxCard.match(/Asc:\s*\w+/)?.[0]}"`);
    assert((await page.getByTestId(`chart-${exact.id}`).innerText()).includes('Asc: Leo'), 'exact chart lost its Ascendant');
    if (unstableChart?.id) {
      const uncertainCard = await page.getByTestId(`chart-${unstableChart.id}`).innerText();
      assert(!/Moon:|Asc:/.test(uncertainCard), `uncertain-Moon card: "${uncertainCard.replace(/\s+/g, ' ')}"`);
    }
    if (legacyId) {
      const legacyCard = await page.getByTestId(`chart-${legacyId}`).innerText();
      assert(/Older chart/.test(legacyCard) && !/Sun:|Moon:|Asc:/.test(legacyCard), `legacy card: "${legacyCard.replace(/\s+/g, ' ')}"`);
    }
    await shot('my-charts', { full: true });
  });

  // ── Approximate chart: Overview and Chart tab ───────────────────────────────
  await page.goto(`${BASE}/kundli/${approx.id}`, { waitUntil: 'networkidle' });
  await check('F12', 'approximate chart Overview says the Ascendant is unknown', async () => {
    const asc = page.getByTestId('overview-ascendant');
    await asc.waitFor({ timeout: 8000 });
    assert((await asc.textContent()).includes('Unknown — birth time approximate'), `Ascendant row: "${await asc.textContent()}"`);
    await asc.scrollIntoViewIfNeeded();
    await shot('approx-overview');
  });
  await page.goto(`${BASE}/kundli/${approx.id}?tab=chart`, { waitUntil: 'networkidle' });
  await check('F39a', 'approximate chart (stable Moon sign) draws a Chandra Lagna chart, no Lagna, no vargas', async () => {
    await page.getByTestId('chandra-lagna-note').waitFor({ timeout: 8000 });
    const svgText = await page.locator('svg.chart-container').first().textContent();
    assert(!svgText.includes('Asc'), 'chart still shows Asc');
    await page.getByTestId('vargas-withheld').waitFor();
    assert(!(await bodyText(page)).includes('Navamsa (D9)'), 'D9 still drawn');
    await page.locator('svg.chart-container').first().scrollIntoViewIfNeeded();
    await shot('approx-chart-chandra');
  });
  if (unstableChart?.id) {
    await page.goto(`${BASE}/kundli/${unstableChart.id}?tab=chart`, { waitUntil: 'networkidle' });
    await check('F39b', 'approximate chart (Moon changes sign that day) shows a sign-only table and no house chart', async () => {
      await page.getByTestId('approximate-planet-table').waitFor({ timeout: 8000 });
      assert(await page.locator('svg.chart-container').count() === 0, 'a house chart is still drawn');
      assert((await bodyText(page)).includes('Moon sign uncertain'), 'headline still states a Moon sign');
      await shot('approx-chart-table', { full: true });
    });
  } else record(label, 'F39b', 'approximate chart with an unstable Moon sign', 'SKIP', 'no unstable-Moon date found');

  // ── Legacy chart ────────────────────────────────────────────────────────────
  if (legacyId) {
    await page.goto(`${BASE}/kundli/${legacyId}`, { waitUntil: 'networkidle' });
    await check('F13', 'limited legacy chart hides unverified placements and offers a prefilled recreation', async () => {
      await page.getByTestId('limited-chart-notice').waitFor({ timeout: 8000 });
      const text = await bodyText(page);
      assert(!/Gemini|Moon: Leo|Astrological Overview|Calculated\b/.test(text), 'stale placements or a "Calculated" badge are shown');
      await shot('legacy-chart');
      await page.getByTestId('button-recreate-chart').click();
      await page.waitForURL(/\/kundli\/new\?/);
      assert((await page.getByPlaceholder(/full name/i).inputValue()) === 'Old chart (no birthplace)', 'name not prefilled');
      await shot('legacy-recreate-prefilled');
    });
  } else record(label, 'F13', 'limited legacy chart', 'SKIP', 'DATABASE_URL not set');

  // ── Exact chart: labels, remedies, evidence ─────────────────────────────────
  await page.goto(`${BASE}/kundli/${exact.id}?tab=chart`, { waitUntil: 'networkidle' });
  await check('F14', 'chart labels are legible, use ℞, and are keyboard reachable', async () => {
    const svg = page.locator('svg.chart-container').first();
    await svg.waitFor({ timeout: 8000 });
    await svg.scrollIntoViewIfNeeded();
    const labels = await svg.evaluate((el) => [...el.querySelectorAll('text[role=button]')].map((t) => ({ text: t.textContent, h: t.getBoundingClientRect().height, tab: t.getAttribute('tabindex') })));
    assert(labels.length >= 10, `only ${labels.length} planet labels`);
    assert(labels.every((l) => !l.text.includes('®') && !l.text.includes('°')), 'old label format');
    const min = Math.min(...labels.map((l) => l.h));
    assert(min >= 13, `smallest label renders ${min.toFixed(1)}px`);
    assert(labels.every((l) => l.tab === '0'), 'planets not focusable');
    await shot('exact-chart-labels');
  });
  await page.goto(`${BASE}/kundli/${exact.id}?tab=remedies`, { waitUntil: 'networkidle' });
  await check('F16', 'no gemstone for a planet the functional rules say to pacify (Pearl, Leo Lagna)', async () => {
    await page.waitForTimeout(800);
    const text = await bodyText(page);
    assert(text.includes('Recommended Remedies'), 'remedies tab did not render');
    assert(!/Gemstone\s*\n?\s*Pearl/.test(text), 'Pearl is still recommended');
    await shot('exact-remedies');
  });
  await page.goto(`${BASE}/kundli/${exact.id}`, { waitUntil: 'networkidle' });
  await check('F19', 'the evidence sheet shows the experimental indicators its note mentions', async () => {
    const insights = (await api(page, 'GET', `/api/kundli/${exact.id}/insights`)).json;
    const domain = insights.domains.find((d) => d.experimental?.length > 0);
    if (!domain) return skip('F19', 'experimental indicators', 'no domain with experimental evidence for this chart');
    await page.getByTestId(`glance-${domain.domain}`).click();
    await page.getByTestId('evidence-sheet').waitFor({ timeout: 8000 });
    const exp = page.getByTestId('experimental-evidence');
    await exp.scrollIntoViewIfNeeded();
    await exp.locator('summary').click();
    assert((await exp.locator('li').count()) === domain.experimental.length, 'experimental rows missing');
    await shot('evidence-experimental');
    await page.keyboard.press('Escape');
  });

  // ── Ask ─────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/ai-astrologer?kundliId=${exact.id}`, { waitUntil: 'networkidle' });
  await check('F21', 'each answer is labelled by its real source; no blanket "Powered by AI"', async () => {
    const box = page.getByRole('textbox').last();
    await box.fill('How is my career?');
    await box.press('Enter');
    const src = page.getByTestId('answer-source').first();
    await src.waitFor({ timeout: 45000 });
    const label = (await src.textContent()).trim();
    assert(label === "From your chart's evidence" || label === 'AI explanation · checked against your chart', `label "${label}"`);
    assert(!(await bodyText(page)).includes('Powered by AI'), '"Powered by AI" still shown');
    await src.scrollIntoViewIfNeeded();
    await shot('ask-answer-source');
  });
  await page.goto(`${BASE}/ai-astrologer?kundliId=${approx.id}`, { waitUntil: 'networkidle' });
  await check('F40', 'Ask withholds periods an approximate birth time could move', async () => {
    const insights = (await api(page, 'GET', `/api/kundli/${approx.id}/insights`)).json;
    if (insights.timing?.mahadashaReliable !== false) return skip('F40', 'withheld periods', 'Mahadasha reliable for this chart');
    await page.getByTestId('ask-periods-withheld').waitFor({ timeout: 8000 });
    assert(!/MAHADASHA\s*\n?\s*\w+\s*\n?\s*\d{4}-\d{2}/i.test(await bodyText(page)), 'a dated Mahadasha is still shown');
    await shot('ask-approx-periods');
  });

  // ── Reports: payment with too little balance ────────────────────────────────
  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
  await check('F29a', 'too little balance shows the shortfall and a recharge path, not a raw 402', async () => {
    await page.getByRole('button', { name: /get report/i }).first().click();
    await page.getByTestId('order-wallet-balance').waitFor({ timeout: 8000 });
    assert(/balance ₹0\.00/.test(await page.getByTestId('order-wallet-balance').textContent()), 'balance not shown');
    await page.getByTestId('button-confirm-order').click();
    await page.getByTestId('order-insufficient-balance').waitFor({ timeout: 8000 });
    await page.getByTestId('button-recharge-wallet').waitFor();
    await noRawJsonToast(page);
    await shot('reports-insufficient');
    await page.keyboard.press('Escape');
  });
  await ctx.close();

  // ── Admin (free access) can still order ─────────────────────────────────────
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const actx = await newContext(browser, viewport);
    const apage = await actx.newPage();
    await apage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    try {
      const login = await api(apage, 'POST', '/api/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
      assert(login.status === 200, `admin login ${login.status}`);
      await api(apage, 'POST', '/api/kundli', { name: 'Admin Test', gender: 'male', dateOfBirth: '1990-08-15', timeOfBirth: '06:30', ...bengaluru });
      await apage.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
      await apage.getByRole('button', { name: /get report/i }).nth(1).click();
      await apage.getByTestId('button-confirm-order').click();
      await apage.getByText('Report ordered').first().waitFor({ timeout: 15000 });
      record(label, 'F29b', 'admin free access still orders without a balance', 'PASS');
    } catch (e) { record(label, 'F29b', 'admin free access still orders without a balance', 'FAIL', String(e.message).slice(0, 200)); }
    await actx.close();
  } else record(label, 'F29b', 'admin free access', 'SKIP', 'ADMIN_EMAIL/ADMIN_PASSWORD not set');
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await run(browser, 'mobile', { width: 390, height: 844 });
  await run(browser, 'desktop', { width: 1366, height: 900 });
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => r.status === 'FAIL');
const counts = ['PASS', 'FAIL', 'SKIP'].map((s) => `${s} ${results.filter((r) => r.status === s).length}`).join(' · ');
console.log(`\n${counts}`);
process.exit(failed.length ? 1 : 0);
