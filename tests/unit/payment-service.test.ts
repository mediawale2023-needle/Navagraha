import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  verifyPayUResponseHash,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from '../../server/paymentService';

describe('paymentService', () => {
  it('verifies Razorpay checkout signatures with the server secret', () => {
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';
    const orderId = 'order_123';
    const paymentId = 'pay_456';
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(verifyRazorpaySignature(orderId, paymentId, signature)).toBe(true);
    expect(verifyRazorpaySignature(orderId, paymentId, 'bad_signature')).toBe(false);
  });

  it('verifies Razorpay webhook signatures with the webhook secret', () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret';
    const rawBody = JSON.stringify({ event: 'payment.captured' });
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    expect(verifyRazorpayWebhookSignature(rawBody, signature)).toBe(true);
    expect(verifyRazorpayWebhookSignature(rawBody, 'bad_signature')).toBe(false);
  });

  it('verifies PayU callback hashes with the configured salt', () => {
    process.env.PAYU_MERCHANT_SALT = 'payu_salt';
    const params = {
      status: 'success',
      udf5: '',
      udf4: '',
      udf3: '',
      udf2: '',
      udf1: '',
      email: 'user@example.com',
      firstname: 'User',
      productinfo: 'Navagraha Wallet Recharge',
      amount: '299.00',
      txnid: 'lp_user_123',
      key: 'merchant_key',
      hash: '',
    };

    params.hash = crypto
      .createHash('sha512')
      .update([
        process.env.PAYU_MERCHANT_SALT,
        params.status,
        '',
        '',
        '',
        '',
        '',
        params.udf5,
        params.udf4,
        params.udf3,
        params.udf2,
        params.udf1,
        params.email,
        params.firstname,
        params.productinfo,
        params.amount,
        params.txnid,
        params.key,
      ].join('|'))
      .digest('hex');

    expect(verifyPayUResponseHash(params)).toBe(true);
  });
});
