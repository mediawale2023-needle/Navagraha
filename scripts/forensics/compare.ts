// Pure comparison for recharge forensics (no I/O): which completed recharges were credited
// more than their captured payment plus the bonuses that payment could justify.
import { packBonusFor } from "../../server/paymentService";

export interface CreditedRecharge {
  transactionId: string;
  userId: string;
  credited: number;
  couponBonusStaged: number;
  gatewayPaymentId: string | null;
  createdAt: string;
}

export interface CapturedPayment {
  id: string;
  amountPaise: number;
  currency: string;
  status: string;
  refundedPaise: number;
}

export type Finding =
  | "over_credited"
  | "under_credited"
  | "string_amount_pattern"
  | "duplicate_payment_credit"
  | "payment_not_in_export"
  | "no_payment_id"
  | "not_inr"
  | "not_captured"
  | "refunded";

export interface ForensicRow extends CreditedRecharge {
  capturedRupees: number | null;
  justifiedRupees: number | null;
  excessRupees: number | null;
  findings: Finding[];
}

/** "X" + 0 + 0 stored as "X00", and "X" + 0 + B as "X0B" (finding 1). */
function looksLikeStringAmount(credited: number, capturedRupees: number, couponBonus: number): boolean {
  if (!Number.isInteger(capturedRupees) || credited <= capturedRupees) return false;
  const text = String(Math.round(credited * 100) / 100);
  const base = String(capturedRupees);
  return text === `${base}00` || (couponBonus > 0 && text === `${base}0${couponBonus}`);
}

export function compareRecharges(recharges: CreditedRecharge[], payments: Map<string, CapturedPayment>): ForensicRow[] {
  const creditsPerPayment = new Map<string, number>();
  for (const r of recharges) if (r.gatewayPaymentId) creditsPerPayment.set(r.gatewayPaymentId, (creditsPerPayment.get(r.gatewayPaymentId) ?? 0) + 1);
  return recharges.map((r) => {
    const findings: Finding[] = [];
    if (!r.gatewayPaymentId) return { ...r, capturedRupees: null, justifiedRupees: null, excessRupees: null, findings: ["no_payment_id"] };
    if ((creditsPerPayment.get(r.gatewayPaymentId) ?? 0) > 1) findings.push("duplicate_payment_credit");
    const p = payments.get(r.gatewayPaymentId);
    if (!p) return { ...r, capturedRupees: null, justifiedRupees: null, excessRupees: null, findings: [...findings, "payment_not_in_export"] };
    if (p.currency !== "INR") findings.push("not_inr");
    if (p.status !== "captured" && p.status !== "refunded") findings.push("not_captured");
    if (p.refundedPaise > 0 || p.status === "refunded") findings.push("refunded");
    const captured = p.amountPaise / 100;
    const justified = Math.round((captured + packBonusFor(captured) + r.couponBonusStaged) * 100) / 100;
    const excess = Math.round((r.credited - justified) * 100) / 100;
    if (excess > 0) findings.push("over_credited");
    if (r.credited < captured) findings.push("under_credited");
    if (looksLikeStringAmount(r.credited, captured, r.couponBonusStaged)) findings.push("string_amount_pattern");
    return { ...r, capturedRupees: captured, justifiedRupees: justified, excessRupees: excess, findings };
  });
}

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v !== "")) rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** Razorpay payments export rows → payments by id. `unit` is the export's amount unit. */
export function paymentsFromExport(rows: Array<Record<string, string>>, unit: "rupees" | "paise"): Map<string, CapturedPayment> {
  const toPaise = (v: string) => {
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(unit === "paise" ? n : n * 100) : NaN;
  };
  const out = new Map<string, CapturedPayment>();
  for (const r of rows) {
    if (!r.id) continue;
    out.set(r.id, {
      id: r.id,
      amountPaise: toPaise(r.amount),
      currency: (r.currency || "").toUpperCase(),
      status: (r.status || "").toLowerCase(),
      refundedPaise: r.amount_refunded ? toPaise(r.amount_refunded) || 0 : 0,
    });
  }
  return out;
}
