// Closing Razorpay Checkout after a failed attempt is a failure, not a cancellation.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkoutClosedMessage } from '../../client/src/lib/checkoutOutcome';

describe('checkoutClosedMessage', () => {
  it('closing without any attempt is a cancellation', () => {
    expect(checkoutClosedMessage(null)).toEqual({ title: 'Payment cancelled', description: 'No payment was made and your wallet is unchanged.' });
  });

  it('closing after a failed attempt says the payment failed, with the gateway reason', () => {
    const m = checkoutClosedMessage({ error: { description: 'Your payment was declined by the bank.', reason: 'payment_failed' } });
    expect(m.title).toBe('Payment failed');
    expect(m.description).toContain('Your payment was declined by the bank.');
    expect(m.description).toContain('Nothing was added to your wallet');
    expect(m.title).not.toMatch(/cancel/i);
  });

  it('never shows a reason that is missing, too long or looks like markup', () => {
    for (const description of [undefined, 42, 'x'.repeat(161), '<b>bad</b>', '{"raw":1}']) {
      const m = checkoutClosedMessage({ error: { description } });
      expect(m.title).toBe('Payment failed');
      expect(m.description.startsWith('Nothing was added')).toBe(true);
    }
  });

  it('the Wallet listens for payment.failed and a successful retry clears it', () => {
    const wallet = readFileSync('client/src/pages/Wallet.tsx', 'utf8');
    expect(wallet).toMatch(/rzp\.on\?\.\('payment\.failed'/);
    expect(wallet).toMatch(/handler: async \(response: any\) => \{\s*lastFailure = null;/);
    expect(wallet).not.toContain("'Payment Cancelled'");
  });
});
