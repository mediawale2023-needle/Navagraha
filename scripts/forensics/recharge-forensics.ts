/**
 * Release A recharge forensics (read only). Lists completed Razorpay recharges credited more
 * than their captured payment plus the bonuses it could justify — the signature of the
 * string-amount defect (finding 1) — and payments that cannot be matched.
 *
 *   DATABASE_URL=<read-only role> npx tsx scripts/forensics/recharge-forensics.ts \
 *     --payments razorpay-payments.csv [--amount-unit rupees|paise] [--out findings.csv]
 *
 * The payments file is a Razorpay dashboard export (columns: id, amount, currency, status,
 * amount_refunded). The database is read in a READ ONLY transaction that is rolled back, with
 * the session also set read-only; nothing is written. No Razorpay API is called.
 * Acting on the findings (any wallet change) needs separate authorisation.
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { compareRecharges, parseCsv, paymentsFromExport, type CreditedRecharge } from "./compare";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const QUERY = readFileSync(new URL("./recharge-forensics.sql", import.meta.url), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .replace(/BEGIN TRANSACTION[^;]*;/i, "").replace(/ROLLBACK;/i, "").trim();

async function main() {
  const paymentsFile = arg("payments");
  const unit = (arg("amount-unit") ?? "rupees") as "rupees" | "paise";
  if (!process.env.DATABASE_URL || !paymentsFile || !["rupees", "paise"].includes(unit)) {
    console.error("Usage: DATABASE_URL=… npx tsx scripts/forensics/recharge-forensics.ts --payments <export.csv> [--amount-unit rupees|paise] [--out <file>]");
    process.exit(2);
  }
  const payments = paymentsFromExport(parseCsv(readFileSync(paymentsFile, "utf8")), unit);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let rows: any[];
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    rows = (await client.query(QUERY.replace(/;\s*$/, ""))).rows;
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }

  const recharges: CreditedRecharge[] = rows.map((r) => ({
    transactionId: r.transaction_id, userId: r.user_id, credited: Number(r.credited),
    couponBonusStaged: Number(r.coupon_bonus_staged ?? 0), gatewayPaymentId: r.gateway_payment_id,
    createdAt: new Date(r.created_at).toISOString(),
  }));
  const results = compareRecharges(recharges, payments);
  const flagged = results.filter((r) => r.findings.length);

  const header = "transaction_id,user_id,created_at,gateway_payment_id,credited,captured,justified,excess,findings";
  const lines = flagged.map((r) => [r.transactionId, r.userId, r.createdAt, r.gatewayPaymentId ?? "", r.credited, r.capturedRupees ?? "", r.justifiedRupees ?? "", r.excessRupees ?? "", r.findings.join("|")].join(","));
  const csv = [header, ...lines].join("\n") + "\n";
  const out = arg("out");
  if (out) writeFileSync(out, csv);
  else process.stdout.write(csv);

  const over = flagged.filter((r) => r.findings.includes("over_credited"));
  console.error(`[forensics] ${results.length} completed Razorpay recharges checked; ${flagged.length} flagged; ${over.length} over-credited by ₹${over.reduce((n, r) => n + (r.excessRupees ?? 0), 0).toFixed(2)} in total.`);
}

main().catch((err) => {
  console.error("[forensics] failed:", err?.message ?? err);
  process.exit(1);
});
