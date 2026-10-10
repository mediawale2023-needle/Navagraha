// Release A: the pre-deploy forensics comparison flags recharges credited more than the
// payment Razorpay captured plus the bonuses it could justify (the string-amount defect).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareRecharges, parseCsv, paymentsFromExport } from '../../scripts/forensics/compare';

const row = (over: object) => ({ transactionId: 't', userId: 'u', credited: 0, couponBonusStaged: 0, gatewayPaymentId: 'pay_1', createdAt: '2026-10-01T00:00:00Z', ...over });
const pay = (over: object = {}) => ({ id: 'pay_1', amountPaise: 50000, currency: 'INR', status: 'captured', refundedPaise: 0, ...over });

describe('recharge forensics', () => {
  it('flags "5" credited as ₹500 for a ₹5 payment, and not a legitimate pack with its bonus', () => {
    const payments = new Map([['pay_x', pay({ id: 'pay_x', amountPaise: 500 })], ['pay_1', pay()]]);
    const [exploit, pack] = compareRecharges([
      row({ transactionId: 'x', credited: 500, gatewayPaymentId: 'pay_x' }),
      row({ transactionId: 'p', credited: 575 }),
    ], payments);
    expect(exploit).toMatchObject({ capturedRupees: 5, excessRupees: 495, findings: ['over_credited', 'string_amount_pattern'] });
    expect(pack.findings).toEqual([]);
  });

  it('a staged coupon bonus counts as justified; anything above it is flagged', () => {
    const payments = new Map([['pay_1', pay({ amountPaise: 20000 })]]);
    expect(compareRecharges([row({ credited: 250, couponBonusStaged: 50 })], payments)[0].findings).toEqual([]);
    expect(compareRecharges([row({ credited: 300, couponBonusStaged: 50 })], payments)[0]).toMatchObject({ excessRupees: 50, findings: ['over_credited'] });
  });

  it('the coupon variant of the string pattern, duplicate credits and under-credits are flagged', () => {
    const payments = new Map([['pay_1', pay({ amountPaise: 500 })], ['pay_2', pay({ id: 'pay_2', amountPaise: 30000 })]]);
    expect(compareRecharges([row({ credited: 5050, couponBonusStaged: 50 })], payments)[0].findings).toEqual(['over_credited', 'string_amount_pattern']);
    const dup = compareRecharges([row({ transactionId: 'a', credited: 5 }), row({ transactionId: 'b', credited: 5 })], payments);
    expect(dup.map((d) => d.findings)).toEqual([['duplicate_payment_credit'], ['duplicate_payment_credit']]);
    expect(compareRecharges([row({ gatewayPaymentId: 'pay_2', credited: 200 })], payments)[0].findings).toEqual(['under_credited']);
  });

  it('unmatched, foreign-currency, uncaptured and refunded payments are flagged', () => {
    const payments = new Map([['pay_1', pay({ currency: 'USD', status: 'authorized', refundedPaise: 100 })]]);
    expect(compareRecharges([row({ credited: 500 })], payments)[0].findings).toEqual(['not_inr', 'not_captured', 'refunded']);
    expect(compareRecharges([row({ gatewayPaymentId: 'pay_missing' })], payments)[0].findings).toEqual(['payment_not_in_export']);
    expect(compareRecharges([row({ gatewayPaymentId: null })], payments)[0].findings).toEqual(['no_payment_id']);
  });

  it('reads a Razorpay export in rupees or paise, with quoted fields', () => {
    const csv = 'id,amount,currency,status,amount_refunded\r\n"pay_1","1,000.00",INR,captured,0\npay_2,5,inr,Captured,\n';
    expect(paymentsFromExport(parseCsv(csv), 'rupees').get('pay_1')).toMatchObject({ amountPaise: 100000, currency: 'INR', status: 'captured' });
    expect(paymentsFromExport(parseCsv(csv), 'paise').get('pay_2')).toMatchObject({ amountPaise: 5, refundedPaise: 0 });
  });

  it.each(['recharge-forensics.sql', 'wallet-consistency-checks.sql'])('%s is a read-only, rolled-back transaction that writes nothing', (file) => {
    const sql = readFileSync(`scripts/forensics/${file}`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sql).toMatch(/BEGIN TRANSACTION[^;]*READ ONLY;/);
    expect(sql.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|COPY|CALL|DO)\b/i);
    const script = readFileSync('scripts/forensics/recharge-forensics.ts', 'utf8');
    expect(script).toMatch(/SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY/);
    expect(script).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
});
