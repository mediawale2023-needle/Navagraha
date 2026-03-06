/**
 * Payment Service
 *
 * Supports three payment methods:
 * 1. Razorpay — primary gateway (cards, UPI, netbanking, wallets)
 *    - Snapmint EMI is available natively within Razorpay Checkout
 *      (enable in Razorpay Dashboard → Settings → Payment Methods → Snapmint)
 *    - LazyPay is available natively within Razorpay Checkout as well
 * 2. Snapmint Direct — standalone EMI via Snapmint merchant API
 *    (Merchant ID, Key, Token required — apply at snapmintbusiness.com)
 * 3. LazyPay/PayU — BNPL via PayU merchant account
 *    (Requires PayU merchant account — apply at payu.in)
 *
 * IMPORTANT: Snapmint and LazyPay are also available WITHIN Razorpay Checkout
 * as payment options — no separate integration needed if you use Razorpay.
 * The standalone integrations below are provided for direct checkout flows.
 */

import Razorpay from "razorpay";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────
// RAZORPAY
// ─────────────────────────────────────────────────────────────

function getRazorpayInstance(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export interface RazorpayOrderOptions {
  amount: number; // in paise (₹1 = 100 paise)
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

/**
 * Create a Razorpay order. Returns the order object with `id` to pass to frontend.
 * Snapmint EMI and LazyPay BNPL will automatically appear in the Razorpay Checkout
 * modal if enabled in your Razorpay Dashboard.
 */
export async function createRazorpayOrder(opts: RazorpayOrderOptions) {
  const rz = getRazorpayInstance();
  const order = await rz.orders.create({
    amount: Math.round(opts.amount * 100), // convert ₹ to paise
    currency: opts.currency || "INR",
    receipt: opts.receipt || `rcpt_${Date.now()}`,
    notes: opts.notes || {},
  });
  return order;
}

/**
 * Verify Razorpay payment signature (HMAC SHA256).
 * Must be called server-side after frontend payment success.
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");
  return expected === signature;
}

/**
 * Verify Razorpay webhook signature.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

// ─────────────────────────────────────────────────────────────
// SNAPMINT DIRECT (standalone integration)
// Merchant credentials required: SNAPMINT_MERCHANT_ID, SNAPMINT_API_KEY, SNAPMINT_TOKEN
//
// NOTE: If you use Razorpay, Snapmint EMI appears automatically in checkout.
// This standalone integration is for custom checkout pages.
// Apply for merchant account at: https://snapmintbusiness.com/connect
// ─────────────────────────────────────────────────────────────

export interface SnapmintOrderOptions {
  amount: number; // in rupees
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
}

/**
 * Create a Snapmint EMI order.
 * Returns redirect URL for the customer to complete EMI setup.
 */
export async function createSnapmintOrder(opts: SnapmintOrderOptions) {
  const merchantId = process.env.SNAPMINT_MERCHANT_ID;
  const apiKey = process.env.SNAPMINT_API_KEY;
  const token = process.env.SNAPMINT_TOKEN;

  if (!merchantId || !apiKey || !token) {
    throw new Error(
      "Snapmint credentials not configured. Set SNAPMINT_MERCHANT_ID, SNAPMINT_API_KEY, SNAPMINT_TOKEN"
    );
  }

  const payload = {
    merchant_id: merchantId,
    order_id: opts.orderId,
    amount: opts.amount,
    customer_name: opts.customerName,
    customer_email: opts.customerEmail,
    customer_phone: opts.customerPhone,
    return_url: opts.returnUrl,
    timestamp: Date.now(),
  };

  // Generate checksum (HMAC SHA256 of key=value pairs sorted alphabetically)
  const checksum = generateSnapmintChecksum(payload, apiKey);

  const response = await fetch("https://pay.snapmint.com/api/v1/create_order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...payload, checksum }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Snapmint API error: ${response.status} ${text}`);
  }

  return await response.json();
}

function generateSnapmintChecksum(
  payload: Record<string, unknown>,
  apiKey: string
): string {
  const sortedKeys = Object.keys(payload).sort();
  const str = sortedKeys.map((k) => `${k}=${payload[k]}`).join("&");
  return crypto.createHmac("sha256", apiKey).update(str).digest("hex");
}

/**
 * Verify Snapmint callback/webhook signature.
 */
export function verifySnapmintCallback(
  params: Record<string, string>,
  receivedChecksum: string
): boolean {
  const apiKey = process.env.SNAPMINT_API_KEY;
  if (!apiKey) return false;
  const { checksum: _removed, ...rest } = params;
  const expected = generateSnapmintChecksum(rest, apiKey);
  return expected === receivedChecksum;
}

// ─────────────────────────────────────────────────────────────
// LAZYPAY / PAYU BNPL
// Requires PayU merchant account with LazyPay enabled.
// Apply at: https://onboarding.payu.in
// API docs: https://docs.payu.in/docs/collect-payments-with-bnpl-using-link-and-pay
//
// LazyPay is also available natively within Razorpay Checkout — no separate
// integration needed if you use Razorpay.
// ─────────────────────────────────────────────────────────────

export interface LazyPayOrderOptions {
  amount: number;
  txnId: string;
  productInfo: string;
  firstName: string;
  email: string;
  phone: string;
  returnUrl: string;
}

/**
 * Generate PayU/LazyPay payment hash.
 * Formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 */
function generatePayUHash(params: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  salt: string;
}): string {
  const hashString = [
    params.key,
    params.txnid,
    params.amount,
    params.productinfo,
    params.firstname,
    params.email,
    "", "", "", "", "", // udf1-5 empty
    "", "", "", "", "", // udf6-10 empty
    params.salt,
  ].join("|");
  return crypto.createHash("sha512").update(hashString).digest("hex");
}

/**
 * Create LazyPay/PayU BNPL checkout params.
 * These params are posted to PayU's payment URL from the frontend.
 */
export function createLazyPayOrder(opts: LazyPayOrderOptions) {
  const key = process.env.PAYU_MERCHANT_KEY;
  const salt = process.env.PAYU_MERCHANT_SALT;

  if (!key || !salt) {
    throw new Error(
      "PayU credentials not configured. Set PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT. " +
        "Apply for a PayU merchant account at https://onboarding.payu.in"
    );
  }

  const amount = opts.amount.toFixed(2);
  const hash = generatePayUHash({
    key,
    txnid: opts.txnId,
    amount,
    productinfo: opts.productInfo,
    firstname: opts.firstName,
    email: opts.email,
    salt,
  });

  return {
    key,
    txnid: opts.txnId,
    amount,
    productinfo: opts.productInfo,
    firstname: opts.firstName,
    email: opts.email,
    phone: opts.phone,
    surl: opts.returnUrl,
    furl: opts.returnUrl,
    hash,
    // txn_s2s_flow=4 enables OneClick LazyPay BNPL checkout
    txn_s2s_flow: 4,
    paymentUrl:
      process.env.NODE_ENV === "production"
        ? "https://secure.payu.in/_payment"
        : "https://test.payu.in/_payment",
  };
}

/**
 * Verify PayU response hash.
 * Formula: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export function verifyPayUResponseHash(params: Record<string, string>): boolean {
  const salt = process.env.PAYU_MERCHANT_SALT;
  if (!salt) return false;

  const hashString = [
    salt,
    params.status,
    "", "", "", "", "",
    params.udf5 || "",
    params.udf4 || "",
    params.udf3 || "",
    params.udf2 || "",
    params.udf1 || "",
    params.email,
    params.firstname,
    params.productinfo,
    params.amount,
    params.txnid,
    params.key,
  ].join("|");

  const expected = crypto.createHash("sha512").update(hashString).digest("hex");
  return expected === params.hash;
}

// ─────────────────────────────────────────────────────────────
// RECHARGE PACK DEFINITIONS
// ─────────────────────────────────────────────────────────────

export const RECHARGE_PACKS = [
  { id: "pack_100", amount: 100, bonus: 0, label: "₹100", popular: false },
  { id: "pack_300", amount: 300, bonus: 30, label: "₹300 + ₹30 bonus", popular: false },
  { id: "pack_500", amount: 500, bonus: 75, label: "₹500 + ₹75 bonus", popular: true },
  { id: "pack_1000", amount: 1000, bonus: 200, label: "₹1000 + ₹200 bonus", popular: false },
  { id: "pack_2000", amount: 2000, bonus: 500, label: "₹2000 + ₹500 bonus", popular: false },
];

// Platform takes 25% of each consultation
export const PLATFORM_FEE_PERCENTAGE = 25;
