// Release A: a wallet is credited only by verified settlement, a referral reward or a report
// refund. Any new path that writes a wallet, or a revived unverified settlement (the direct
// Snapmint/LazyPay callbacks credited the amount their callback claimed), fails here.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});
const server = files('server').map((f) => ({ f, src: readFileSync(f, 'utf8') }));

/** The storage method enclosing a character offset (the nearest `async name(` above it). */
const enclosingMethod = (src: string, index: number) => {
  const before = src.slice(0, index);
  const matches = [...before.matchAll(/\n  (?:private )?async (\w+)\(/g)];
  return matches.at(-1)?.[1];
};

describe('wallet credit paths', () => {
  it('creditWallet is called only by verified settlement, referral rewards and report refunds', () => {
    const callers = new Set<string>();
    for (const { f, src } of server) {
      for (const m of src.matchAll(/\.creditWallet\(/g)) {
        callers.add(`${f}#${enclosingMethod(src, m.index!) ?? '?'}`);
      }
    }
    expect([...callers].sort()).toEqual([
      'server/storage.ts#refundReportOrder',
      'server/storage.ts#rewardReferral',
      'server/storage.ts#settleRechargeOrder',
    ]);
  });

  it('wallet rows are written only by the atomic helpers in storage.ts', () => {
    const writers: string[] = [];
    for (const { f, src } of server) {
      for (const m of src.matchAll(/(update|insert)\(wallets\)|UPDATE wallets|INSERT INTO wallets/g)) {
        writers.push(`${f}#${enclosingMethod(src, m.index!) ?? '?'}`);
      }
    }
    expect([...new Set(writers)].sort()).toEqual([
      'server/storage.ts#createWallet',
      'server/storage.ts#creditWallet',
      'server/storage.ts#tryDebitBalance',
    ]);
  });

  it('there is no unverified external settlement or absolute balance setter', () => {
    for (const { src } of server) {
      expect(src).not.toMatch(/settleExternalRecharge|updateWalletBalance/);
    }
  });

  it('completed recharges are written only by settlement (never inserted as completed elsewhere)', () => {
    const offenders: string[] = [];
    for (const { f, src } of server) {
      for (const m of src.matchAll(/type:\s*["']recharge["'][^}]*status:\s*["']completed["']/g)) {
        offenders.push(`${f}#${enclosingMethod(src, m.index!) ?? '?'}`);
      }
    }
    // Referral bonuses are recorded as completed "recharge" rows without a gateway order.
    expect([...new Set(offenders)]).toEqual(['server/storage.ts#rewardReferral']);
  });
});
