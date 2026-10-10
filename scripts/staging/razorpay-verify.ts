/**
 * Release A — Razorpay TEST-MODE verification harness for a STAGING deployment.
 *
 * Talks to the staging app over HTTPS only (no database access). It refuses to run unless the
 * staging app reports a Razorpay TEST key (rzp_test_…), so it can never touch live payments.
 *
 *   npx tsx scripts/staging/razorpay-verify.ts <command> [--env <file>]
 *
 * Settings come from the environment or an env file (default .staging-verify.env, gitignored):
 *   STAGING_URL               https://<staging-service>.onrender.com
 *   STAGING_WEBHOOK_SECRET    the staging Razorpay test webhook secret
 *   STAGING_ADMIN_EMAIL       the staging ADMIN_EMAIL
 *   STAGING_ADMIN_PASSWORD    the staging ADMIN_PASSWORD
 *   STAGING_BUYER_EMAIL / STAGING_BUYER_PASSWORD   (written by `buyer`, used by `snapshot`)
 *
 * Commands:
 *   preflight   staging is up, uses a TEST key, and its webhook secret matches ours
 *   buyer       creates the test account you use for real test-mode checkouts in the browser
 *   snapshot    the buyer's wallet and recharge history (to check each real checkout)
 *   simulate    controlled failure scenarios on real Razorpay TEST orders, with webhooks
 *               signed by our test webhook secret (amount/currency mismatch, duplicates,
 *               concurrency, partial refund, second payment, failed/uncaptured, forgeries,
 *               invalid amounts, disabled BNPL, paused recharges when RECHARGES_PAUSED is set)
 *   reconcile   admin reconcile (dry run unless --apply) and the review list
 *   keycheck    Razorpay accepts staging's key pair (one ₹10 TEST order, never paid)
 *   ledger      the buyer's wallet against its completed transactions (credits − debits)
 *   packs       Release B question packs bought from the buyer's wallet (needs ≥ ₹327 and
 *               FEATURE_ASK_PACKS on staging): exact debits, entitlements, replay, overdraw
 *   reports     Release B report prices, stale-price refusal, failed-report refund, admin ₹0
 *
 * `packs` and `reports` spend the buyer's staging TEST wallet; nothing touches production.
 *
 * Secrets are never printed: output shows key prefixes, ids and amounts only.
 */
import crypto from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";

type Json = any;

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i > -1 ? argv[i + 1] : undefined; };
const envFile = opt("env") ?? ".staging-verify.env";

function loadEnvFile() {
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvFile();

const need = (name: string) => {
  const v = process.env[name];
  if (!v) { console.error(`Missing ${name} (environment or ${envFile}).`); process.exit(2); }
  return v;
};

const BASE = () => need("STAGING_URL").replace(/\/$/, "");

// ─── HTTP with a cookie jar per actor ────────────────────────────────────────

class Client {
  private cookies = new Map<string, string>();
  constructor(private ip: string) {}
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
    const res = await fetch(BASE() + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        "x-forwarded-for": this.ip,
        "x-forwarded-proto": "https",
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    let parsed: Json = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, body: parsed };
  }
}

async function login(email: string, password: string): Promise<Client> {
  const c = new Client(`198.51.100.${1 + Math.floor(Math.random() * 200)}`);
  const r = await c.req("POST", "/api/auth/login", { email, password });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status}`);
  return c;
}

async function newUser(label: string): Promise<{ client: Client; email: string; password: string }> {
  const client = new Client(`198.51.100.${1 + Math.floor(Math.random() * 200)}`);
  const email = `rz-${label}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@staging.test`;
  const password = crypto.randomBytes(18).toString("base64url");
  const r = await client.req("POST", "/api/auth/register", { email, password, firstName: label });
  if (r.status !== 201 && r.status !== 200) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { client, email, password };
}

// ─── Webhooks signed with the staging test webhook secret ────────────────────

function signedWebhook(entity: Json, event = "payment.captured") {
  const raw = JSON.stringify({ entity: "event", event, payload: { payment: { entity } }, created_at: Math.floor(Date.now() / 1000) });
  const sig = crypto.createHmac("sha256", need("STAGING_WEBHOOK_SECRET")).update(raw).digest("hex");
  return { raw, sig };
}

async function sendWebhook(raw: string, sig: string) {
  return new Client("203.0.113.9").req("POST", "/api/payment/razorpay/webhook", raw, { "x-razorpay-signature": sig, "content-type": "application/json" });
}

const fakePaymentId = () => `pay_SIM${crypto.randomBytes(7).toString("hex")}`;

// ─── Reporting ──────────────────────────────────────────────────────────────

type Result = { id: string; scenario: string; kind: "simulated" | "check"; pass: boolean; detail: string };
const results: Result[] = [];
function record(id: string, scenario: string, pass: boolean, detail: string, kind: Result["kind"] = "simulated") {
  results.push({ id, scenario, kind, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${scenario} — ${detail}`);
}

async function wallet(c: Client): Promise<number> {
  const r = await c.req("GET", "/api/wallet");
  return Number(r.body?.balance ?? 0);
}
async function recharges(c: Client): Promise<Json[]> {
  const r = await c.req("GET", "/api/transactions");
  return (Array.isArray(r.body) ? r.body : []).filter((t: Json) => t.type === "recharge");
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function preflight(): Promise<boolean> {
  const health = await new Client("203.0.113.1").req("GET", "/api/health");
  const ready = health.status === 200 && health.body?.ready === true;
  record("P1", "staging is up and migrated", ready, `health ${health.status} ${JSON.stringify(health.body)}`, "check");
  const config = await new Client("203.0.113.1").req("GET", "/api/config");
  const key = String(config.body?.razorpayKeyId ?? "");
  const testKey = key.startsWith("rzp_test_");
  record("P2", "staging uses a Razorpay TEST key", testKey, key ? `key ${key.slice(0, 9)}…` : "no key configured", "check");
  if (key.startsWith("rzp_live_")) {
    console.error("STOP: this deployment has a LIVE Razorpay key. Nothing else will run.");
    process.exit(3);
  }
  const unsigned = await sendWebhook(JSON.stringify({ event: "ping" }), "0".repeat(64));
  record("P3", "an unsigned webhook is rejected", unsigned.status === 400, `status ${unsigned.status}`, "check");
  const { raw, sig } = signedWebhook({ id: "pay_PING", order_id: "order_PING", amount: 100, currency: "INR", status: "failed" }, "payment.failed");
  const signed = await sendWebhook(raw, sig);
  record("P4", "our webhook secret matches staging's (signed event accepted)", signed.status === 200, `status ${signed.status}`, "check");
  return ready && testKey && signed.status === 200;
}

async function createOrder(c: Client, amount: number, extra: Json = {}) {
  return c.req("POST", "/api/payment/razorpay/order", { amount, ...extra });
}

async function simulate() {
  if (!(await preflight())) { console.error("Preflight failed; not simulating."); process.exit(1); }
  const paused = flag("expect-paused");

  // Invalid amounts are refused before any Razorpay order exists.
  const v = await newUser("validation");
  // While paused every order is refused before validation, so these run only when recharges are open.
  if (!paused) for (const [label, amount] of [["string \"5\"", "5"], ["fraction 10.5", 10.5], ["below minimum 9", 9], ["negative", -100]] as const) {
    const r = await createOrder(v.client, amount as any);
    record("S1", `order refused: ${label}`, r.status === 400, `status ${r.status}`);
  }
  if (!paused) {
    const packMismatch = await createOrder(v.client, 100, { packId: "pack_2000" });
    record("S1", "order refused: pack id with another amount", packMismatch.status === 400, `status ${packMismatch.status}`);
  }
  for (const path of ["/api/payment/snapmint/order", "/api/payment/lazypay/order", "/api/payment/snapmint/callback", "/api/payment/lazypay/callback"]) {
    const r = await v.client.req("POST", path, { amount: 500, status: "success", user_id: "x", order_id: "x" });
    record("S2", `direct BNPL disabled: ${path}`, r.status === 503, `status ${r.status}`);
  }

  if (paused) {
    const r = await createOrder(v.client, 100);
    record("S12", "RECHARGES_PAUSED refuses new orders", r.status === 503 && r.body?.code === "recharges_paused", `status ${r.status} ${r.body?.code ?? ""}`);
    return;
  }

  // Each scenario uses its own user, so wallets and order limits never interfere.
  const scenario = async (label: string) => {
    const u = await newUser(label);
    const o = await createOrder(u.client, 100);
    if (o.status !== 200) throw new Error(`order for ${label} failed: ${o.status} ${JSON.stringify(o.body)}`);
    return { ...u, orderId: String(o.body.orderId), paise: Number(o.body.amount) };
  };
  const entity = (orderId: string, over: Json = {}) => ({ id: fakePaymentId(), order_id: orderId, amount: 10000, currency: "INR", status: "captured", amount_refunded: 0, ...over });

  {
    const s = await scenario("amount");
    const { raw, sig } = signedWebhook(entity(s.orderId, { amount: 500 }));
    await sendWebhook(raw, sig);
    const t = (await recharges(s.client))[0];
    record("S4", "amount mismatch (₹5 paid on a ₹100 order) is held for review, not credited",
      (await wallet(s.client)) === 0 && t?.status === "review", `wallet ₹${await wallet(s.client)}, status ${t?.status}, reason ${t?.reviewReason ?? "-"}`);
  }
  {
    const s = await scenario("currency");
    const { raw, sig } = signedWebhook(entity(s.orderId, { currency: "USD" }));
    await sendWebhook(raw, sig);
    const t = (await recharges(s.client))[0];
    record("S5", "currency mismatch (USD) is held for review, not credited",
      (await wallet(s.client)) === 0 && t?.status === "review", `wallet ₹${await wallet(s.client)}, status ${t?.status}`);
  }
  {
    const s = await scenario("duplicate");
    const { raw, sig } = signedWebhook(entity(s.orderId));
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await sendWebhook(raw, sig)).status);
    record("S6", "the same webhook delivered 5 times credits once",
      (await wallet(s.client)) === 100 && (await recharges(s.client)).filter((t) => t.status === "completed").length === 1,
      `wallet ₹${await wallet(s.client)}, deliveries ${statuses.join(",")}`);
  }
  {
    const s = await scenario("concurrent");
    const { raw, sig } = signedWebhook(entity(s.orderId));
    const statuses = await Promise.all(Array.from({ length: 10 }, () => sendWebhook(raw, sig).then((r) => r.status)));
    record("S8", "10 concurrent deliveries of one payment credit once",
      (await wallet(s.client)) === 100, `wallet ₹${await wallet(s.client)}, statuses ${[...new Set(statuses)].join(",")}`);
  }
  {
    const s = await scenario("second-payment");
    const first = signedWebhook(entity(s.orderId));
    await sendWebhook(first.raw, first.sig);
    const second = signedWebhook(entity(s.orderId));
    await sendWebhook(second.raw, second.sig);
    const rows = await recharges(s.client);
    record("S8b", "a second payment on an already-credited order is held for review, never credited",
      (await wallet(s.client)) === 100 && rows.some((t) => t.status === "review"), `wallet ₹${await wallet(s.client)}, statuses ${rows.map((t) => t.status).join(",")}`);
  }
  {
    const s = await scenario("refunded");
    const { raw, sig } = signedWebhook(entity(s.orderId, { amount_refunded: 5000 }));
    await sendWebhook(raw, sig);
    record("S9", "a partly refunded payment is held for review, not credited",
      (await wallet(s.client)) === 0 && (await recharges(s.client))[0]?.status === "review", `wallet ₹${await wallet(s.client)}`);
  }
  {
    const s = await scenario("failed");
    const failed = signedWebhook(entity(s.orderId, { status: "failed" }), "payment.failed");
    await sendWebhook(failed.raw, failed.sig);
    const authorized = signedWebhook(entity(s.orderId, { status: "authorized" }));
    await sendWebhook(authorized.raw, authorized.sig);
    record("S3", "failed and authorised-only payments credit nothing (recharge stays pending)",
      (await wallet(s.client)) === 0 && (await recharges(s.client))[0]?.status === "pending", `wallet ₹${await wallet(s.client)}, status ${(await recharges(s.client))[0]?.status}`);
  }
  {
    const s = await scenario("forged");
    const { raw } = signedWebhook(entity(s.orderId));
    const forgedHook = await sendWebhook(raw, crypto.createHmac("sha256", "not-the-secret").update(raw).digest("hex"));
    const forgedVerify = await s.client.req("POST", "/api/payment/razorpay/verify", { orderId: s.orderId, paymentId: fakePaymentId(), signature: "0".repeat(64) });
    record("S10", "forged webhook and forged verify are rejected",
      forgedHook.status === 400 && forgedVerify.status === 400 && (await wallet(s.client)) === 0, `webhook ${forgedHook.status}, verify ${forgedVerify.status}`);
  }
}

async function buyer() {
  const u = await newUser("buyer");
  appendFileSync(envFile, `STAGING_BUYER_EMAIL=${u.email}\nSTAGING_BUYER_PASSWORD=${u.password}\n`);
  console.log(`Created the staging test buyer and saved its login to ${envFile} (not printed here).`);
}

async function snapshot() {
  const c = await login(need("STAGING_BUYER_EMAIL"), need("STAGING_BUYER_PASSWORD"));
  console.log(`wallet balance: ₹${await wallet(c)}`);
  for (const t of await recharges(c)) {
    console.log([t.createdAt, t.status, `₹${t.amount}`, `paid ${t.gatewayAmountPaise ?? "-"} paise`, `pack ${t.packBonus ?? "-"}`, `coupon ${t.couponBonus ?? "-"}`,
      t.gatewayOrderId, t.gatewayPaymentId ?? "-", t.reviewReason ?? ""].join("  "));
  }
}

async function reconcile() {
  const admin = await login(need("STAGING_ADMIN_EMAIL"), need("STAGING_ADMIN_PASSWORD"));
  const r = await admin.req("POST", `/api/admin/payments/reconcile?days=2${flag("apply") ? "&apply=1" : ""}`);
  console.log(`reconcile (${flag("apply") ? "APPLIED" : "dry run"}):`, r.status, JSON.stringify(r.body));
  const review = await admin.req("GET", "/api/admin/payments/review");
  console.log(`held for review: ${Array.isArray(review.body) ? review.body.length : review.status}`);
  for (const t of Array.isArray(review.body) ? review.body : []) console.log(`  ${t.gatewayOrderId}  ${t.gatewayPaymentId}  ${t.reviewReason}`);
}

async function keycheck() {
  if (!(await preflight())) process.exit(1);
  const u = await newUser("keycheck");
  const r = await createOrder(u.client, 10);
  record("K1", "Razorpay accepted staging's key id + secret (a TEST order was created)",
    r.status === 200 && /^order_/.test(String(r.body?.orderId)) && Number(r.body?.amount) === 1000, `status ${r.status}, order ${String(r.body?.orderId ?? "-").slice(0, 10)}…, ${r.body?.amount} paise`, "check");
}

async function allTransactions(c: Client): Promise<Json[]> {
  const r = await c.req("GET", "/api/transactions");
  return Array.isArray(r.body) ? r.body : [];
}

/** Completed credits minus debits, the way the wallet should add up (whatever sign debits are stored with). */
function ledgerBalance(rows: Json[]): number {
  let sum = 0;
  for (const t of rows) {
    if (t.status !== "completed") continue;
    const a = Math.abs(Number(t.amount) || 0);
    if (t.type === "recharge" || t.type === "refund" || t.type === "credit") sum += a;
    else if (t.type === "debit" || t.type === "deduction") sum -= a;
  }
  return Math.round(sum * 100) / 100;
}

async function ledger() {
  const c = await login(need("STAGING_BUYER_EMAIL"), need("STAGING_BUYER_PASSWORD"));
  const rows = await allTransactions(c);
  const w = await wallet(c);
  const l = ledgerBalance(rows);
  for (const t of rows) console.log([t.createdAt, t.type, t.status, `₹${t.amount}`, t.description ?? "", t.gatewayPaymentId ?? ""].join("  "));
  record("L1", "buyer wallet equals completed credits − debits", Math.abs(w - l) < 0.005, `wallet ₹${w.toFixed(2)}, ledger ₹${l.toFixed(2)}, ${rows.length} transactions`, "check");
  record("L2", "no negative balance", w >= 0, `₹${w.toFixed(2)}`, "check");
}

async function packs() {
  const c = await login(need("STAGING_BUYER_EMAIL"), need("STAGING_BUYER_PASSWORD"));
  const list = await c.req("GET", "/api/ask/packs");
  const offered = (list.body?.packs ?? []).map((p: Json) => `${p.id}:${p.questions}:${p.price}:${p.followUpsEach}`).join(",");
  record("B1", "catalogue: ₹29/1, ₹99/5, ₹199/12, two follow-ups each", list.body?.enabled === true && offered === "ask_1:1:29:2,ask_5:5:99:2,ask_12:12:199:2", offered || `status ${list.status}`, "check");
  if (list.body?.enabled !== true) return;
  const start = await wallet(c);
  if (start < 327) { console.error(`Buyer wallet is ₹${start}; top it up to at least ₹327 with a real test checkout first.`); process.exit(1); }
  const paid0 = Number(list.body?.allowance?.paidQuestionsRemaining ?? 0);
  const rid = () => `req_${crypto.randomBytes(8).toString("hex")}`;
  const buy = (packId: string, requestId: string, extra: Json = {}) => c.req("POST", "/api/ask/packs/purchase", { packId, requestId, ...extra });

  const r1 = rid();
  const a = await buy("ask_1", r1, { price: 1, questions: 500 });
  record("B2", "₹29 pack: debits exactly ₹29 (client price ignored)", a.status === 201 && (await wallet(c)) === start - 29 && a.body?.questions === 1 && a.body?.followUpsEach === 2, `status ${a.status}, wallet ₹${start} → ₹${await wallet(c)}`, "check");
  const replay = await Promise.all(Array.from({ length: 5 }, () => buy("ask_1", r1)));
  record("B3", "the same request sent 5 more times (concurrently) charges nothing more", replay.every((r) => r.status === 200 && r.body?.replayed === true) && (await wallet(c)) === start - 29, `statuses ${[...new Set(replay.map((r) => r.status))].join(",")}, wallet ₹${await wallet(c)}`, "check");
  const conflict = await buy("ask_12", r1);
  record("B4", "a request id reused for another pack is refused, not charged", conflict.status === 409 && (await wallet(c)) === start - 29, `status ${conflict.status}`, "check");
  const b = await buy("ask_5", rid());
  const d = await buy("ask_12", rid());
  const afterThree = await wallet(c);
  record("B5", "₹99 and ₹199 packs debit exactly", b.status === 201 && d.status === 201 && afterThree === start - 327, `wallet ₹${start} → ₹${afterThree}`, "check");
  const after = await c.req("GET", "/api/ask/packs");
  const paid = Number(after.body?.allowance?.paidQuestionsRemaining ?? 0);
  record("B6", "18 questions allocated (1 + 5 + 12), each with 2 follow-ups", paid - paid0 === 18 && (after.body?.history ?? []).slice(0, 3).every((h: Json) => h.followUpsEach === 2), `bought questions ${paid0} → ${paid}`, "check");
  const prices = (after.body?.history ?? []).slice(0, 3).map((h: Json) => h.price).sort().join(",");
  record("B7", "pack history shows what each pack cost", prices === "199.00,29.00,99.00", prices, "check");

  // Overdraw: as many concurrent ₹199 purchases as would need twice the balance; never below zero.
  const bal = await wallet(c);
  const n = Math.floor(bal / 199) + 3;
  const burst = await Promise.all(Array.from({ length: n }, () => buy("ask_12", rid())));
  const ok = burst.filter((r) => r.status === 201).length;
  const end = await wallet(c);
  record("B8", `${n} concurrent ₹199 purchases on ₹${bal}: only what the balance covers, never negative`, ok === Math.floor(bal / 199) && end >= 0 && Math.abs(end - (bal - ok * 199)) < 0.005 && burst.filter((r) => r.status === 402).length === n - ok, `${ok} bought, ${burst.filter((r) => r.status === 402).length} refused 402, wallet ₹${end}`, "check");
  const debits = (await allTransactions(c)).filter((t) => t.type === "debit" && String(t.description ?? "").startsWith("Ask your Kundli"));
  record("B9", "one wallet debit per pack bought", debits.length === 3 + ok, `${debits.length} pack debits for ${3 + ok} packs`, "check");

  const admin = await login(need("STAGING_ADMIN_EMAIL"), need("STAGING_ADMIN_PASSWORD"));
  const adminBuy = await admin.req("POST", "/api/ask/packs/purchase", { packId: "ask_1", requestId: rid() });
  record("B10", "admin (free access) is refused a pack, nothing charged", adminBuy.status === 409 && adminBuy.body?.code === "free_access_unlimited", `status ${adminBuy.status}`, "check");
}

async function reports() {
  const c = await login(need("STAGING_BUYER_EMAIL"), need("STAGING_BUYER_PASSWORD"));
  const types = await c.req("GET", "/api/reports/types");
  const price = Object.fromEntries((Array.isArray(types.body) ? types.body : []).map((t: Json) => [t.slug, t.price]));
  record("R1", "Release B prices listed (Career/Marriage/Finance ₹299, Year Ahead ₹499, Life ₹999)",
    price["career-report"] === "299.00" && price["marriage-report"] === "299.00" && price["finance-report"] === "299.00" && price["year-ahead-report"] === "499.00" && price["complete-life-report"] === "999.00",
    JSON.stringify(price), "check");
  const career = (types.body as Json[]).find((t) => t.slug === "career-report");
  const chart = await c.req("POST", "/api/kundli", { name: "Staging Buyer", gender: "female", dateOfBirth: "1990-05-15", timeOfBirth: "14:30", placeOfBirth: "New Delhi, India", latitude: 28.6139, longitude: 77.209 });
  const kundliId = chart.body?.id;
  const before = await wallet(c);
  const stale = await c.req("POST", "/api/reports/order", { reportTypeId: career.id, kundliId, expectedPrice: 349 });
  record("R2", "an order showing a stale price is refused before any charge", stale.status === 409 && stale.body?.code === "price_changed" && (await wallet(c)) === before, `status ${stale.status}, wallet ₹${await wallet(c)}`, "check");
  const order = await c.req("POST", "/api/reports/order", { reportTypeId: career.id, kundliId, expectedPrice: 299 });
  const charged = await wallet(c);
  record("R3", "Career report charges ₹299", order.status === 201 && Math.abs(before - charged - 299) < 0.005, `status ${order.status} ${order.body?.code ?? ""}, wallet ₹${before} → ₹${charged}`, "check");
  if (order.status === 201) {
    // Staging has no working OpenAI key, so generation fails and the order must be refunded once.
    let refunded = false;
    for (let i = 0; i < 20 && !refunded; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const o = await c.req("GET", `/api/reports/orders/${order.body.orderId}`);
      refunded = Boolean(o.body?.refundedAt);
    }
    const after = await wallet(c);
    const refunds = (await allTransactions(c)).filter((t) => t.type === "refund");
    record("R4", "a failed report is refunded once, in full", refunded && Math.abs(after - before) < 0.005, `refunded ${refunded}, wallet ₹${after}, refund rows ${refunds.length}`, "check");
  }
  const admin = await login(need("STAGING_ADMIN_EMAIL"), need("STAGING_ADMIN_PASSWORD"));
  const aChart = await admin.req("POST", "/api/kundli", { name: "Staging Admin", gender: "male", dateOfBirth: "1988-11-02", timeOfBirth: "06:10", placeOfBirth: "Mumbai, India", latitude: 19.076, longitude: 72.8777 });
  const aOrder = await admin.req("POST", "/api/reports/order", { reportTypeId: career.id, kundliId: aChart.body?.id, expectedPrice: 299 });
  record("R5", "admin report order is free (₹0 charged)", aOrder.status === 201 && Number(aOrder.body?.newBalance) >= 0 && (await admin.req("GET", `/api/reports/orders/${aOrder.body?.orderId}`)).body?.chargedAmount === "0.00", `status ${aOrder.status} ${aOrder.body?.code ?? ""}`, "check");
}

const commands: Record<string, () => Promise<unknown>> = { preflight, simulate, buyer, snapshot, reconcile, keycheck, ledger, packs, reports };
if (!commands[command]) {
  console.error("Usage: npx tsx scripts/staging/razorpay-verify.ts <preflight|keycheck|buyer|snapshot|ledger|simulate|reconcile|packs|reports> [--env file] [--apply] [--expect-paused]");
  process.exit(2);
}
commands[command]()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    if (results.length) console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((err) => { console.error("error:", err?.message ?? err, err?.cause?.code ?? err?.cause?.message ?? ""); process.exit(1); });
