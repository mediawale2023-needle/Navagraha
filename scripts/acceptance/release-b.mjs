// Browser acceptance for Release B (email verification, Ask allowance and packs, report prices),
// run against a build started with every Release B flag on and a disposable local database:
//
//   FEATURE_ASK_METERING_ENFORCE=true FEATURE_ASK_PACKS=true FEATURE_EMAIL_VERIFICATION=true \
//   FEATURE_RELEASE_B_PRICING=true SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=x SMTP_PASSWORD=x \
//   APP_URL=http://127.0.0.1:5000 node dist/index.js
//
//   cd scripts/acceptance && BASE_URL=http://127.0.0.1:5000 DATABASE_URL=<same disposable db> OUT_DIR=./out-b node release-b.mjs
//
// DATABASE_URL (with psql on PATH) is used only to set up states a browser cannot reach on its
// own: a wallet balance, a verified email, used free questions. Never point it at production.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const OUT = process.env.OUT_DIR || './out-b';
const DB = process.env.DATABASE_URL;
if (!DB) throw new Error('DATABASE_URL (a disposable database) is required');
mkdirSync(OUT, { recursive: true });

const sql = (q) => execFileSync('psql', [DB, '-Atqc', q], { encoding: 'utf8' }).trim();
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.log(`FAIL ${name} — ${e.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  // A production build sets its session cookie only over HTTPS; locally that is announced by header.
  const page = await browser.newPage({ viewport, extraHTTPHeaders: { 'x-forwarded-proto': 'https' } });
  // Only the app itself: external hosts (fonts, maps, analytics) are not part of these checks.
  await page.route((url) => !url.href.startsWith(BASE), (route) => route.abort());
  const goto = page.goto.bind(page);
  page.goto = (url, opts) => goto(url, { waitUntil: 'domcontentloaded', ...opts });
  const shot = (n) => page.screenshot({ path: join(OUT, `${label}-${n}.png`), fullPage: true });
  const email = `rb-${label}-${Date.now()}@example.com`;

  await page.goto(BASE);
  const reg = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Release-B#2026', firstName: 'Asha' }) });
    return { status: r.status, body: await r.json() };
  }, email);
  const userId = reg.body.id;
  await check(`[${label}] registration returns no password hash`, async () => {
    assert(reg.status === 201 && userId, `status ${reg.status}`);
    assert(!('passwordHash' in reg.body), 'passwordHash present');
  });
  const kundli = await page.evaluate(async () => {
    const r = await fetch('/api/kundli', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Asha', gender: 'female', dateOfBirth: '1990-05-15', timeOfBirth: '14:30', placeOfBirth: 'New Delhi, India', latitude: 28.6139, longitude: 77.209 }) });
    return r.json();
  });

  await check(`[${label}] Account asks an unverified user to confirm their email`, async () => {
    await page.goto(`${BASE}/profile`);
    await page.getByTestId('verify-email-notice').waitFor();
    assert(await page.getByText('not confirmed').count() > 0, 'no "not confirmed" status');
    await shot('01-account-unverified');
  });

  await check(`[${label}] an unverified user's question is refused with the confirm-email panel, nothing used`, async () => {
    await page.goto(`${BASE}/ai-astrologer?kundliId=${kundli.id}`);
    await page.locator('#ask-input').fill('How is my career?');
    await page.locator('#ask-input').press('Enter');
    await page.getByTestId('ask-limit-verify').waitFor();
    assert(sql(`SELECT count(*) FROM ask_usage WHERE user_id = '${userId}'`) === '0', 'a question was recorded');
    await shot('02-ask-verify-required');
  });

  sql(`UPDATE users SET email_verified_at = now() WHERE id = '${userId}'`);
  sql(`UPDATE wallets SET balance = 150 WHERE user_id = '${userId}'`);
  for (let i = 0; i < 3; i++) {
    sql(`INSERT INTO ask_usage (user_id, chart_key, session_id, kind, entitlement, follow_ups_allowed, status, idempotency_key) VALUES ('${userId}', 'kundli:${kundli.id}', 'seed${i}', 'question', 'free', 1, 'consumed', 'seed_${label}_${i}')`);
  }

  await check(`[${label}] with the free questions used, the limit panel offers packs at server prices`, async () => {
    await page.goto(`${BASE}/ai-astrologer?kundliId=${kundli.id}`);
    await page.getByTestId('ask-allowance').waitFor();
    assert((await page.getByTestId('ask-allowance').innerText()).includes('0 free questions left'), 'allowance line');
    await page.locator('#ask-input').fill('When will my career rise?');
    await page.locator('#ask-input').press('Enter');
    await page.getByTestId('ask-limit-exhausted').waitFor();
    const packs = await page.getByTestId('ask-packs').innerText();
    for (const t of ['₹29', '₹99', '₹199', '1 question', '5 questions', '12 questions', '2 follow-ups']) assert(packs.includes(t), `missing ${t}`);
    await shot('03-ask-exhausted-packs');
  });

  await check(`[${label}] a pack beyond the balance shows the shortfall and charges nothing`, async () => {
    await page.getByTestId('pack-ask_12').click();
    await page.getByTestId('button-buy-pack').click();
    await page.getByTestId('ask-packs-balance').waitFor();
    assert(sql(`SELECT balance FROM wallets WHERE user_id = '${userId}'`) === '150.00', 'balance changed');
    await shot('04-ask-pack-shortfall');
  });

  await check(`[${label}] buying the 5-question pack debits ₹99 once and asks the waiting question`, async () => {
    await page.getByTestId('pack-ask_5').click();
    await page.getByTestId('button-buy-pack').dblclick();
    await page.getByTestId('ask-limit-exhausted').waitFor({ state: 'detached', timeout: 20000 });
    assert(sql(`SELECT balance FROM wallets WHERE user_id = '${userId}'`) === '51.00', 'balance is not 51.00');
    assert(sql(`SELECT count(*) FROM entitlements WHERE user_id = '${userId}'`) === '1', 'not exactly one pack');
    await page.waitForTimeout(1500);
    await shot('05-ask-after-purchase');
  });

  await check(`[${label}] Wallet shows bought questions apart from money, with the pack history`, async () => {
    await page.goto(`${BASE}/wallet`);
    await page.getByTestId('ask-questions-card').waitFor();
    const card = await page.getByTestId('ask-questions-card').innerText();
    assert(/questions? left/.test(card) && card.includes('₹99'), card);
    await shot('06-wallet-questions');
  });

  await check(`[${label}] report prices are the Release B prices`, async () => {
    await page.goto(`${BASE}/reports`);
    await page.getByText('Complete Life Report').first().waitFor();
    const text = await page.locator('main, body').first().innerText();
    assert(text.includes('999') && !text.includes('1499') && !text.includes('349'), 'unexpected prices');
    await shot('07-reports-prices');
  });

  for (const status of ['verified', 'expired', 'invalid']) {
    await check(`[${label}] /verify-email?status=${status}`, async () => {
      await page.goto(`${BASE}/verify-email?status=${status}`);
      await page.getByTestId(`verify-status-${status}`).waitFor();
      await shot(`08-verify-${status}`);
    });
  }
  await page.close();
}
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exit(failures ? 1 : 0);
