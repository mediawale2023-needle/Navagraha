import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../client/src/${p}`, import.meta.url), 'utf8');

describe('report checkout handles payment problems in the dialog', () => {
  const reports = read('pages/Reports.tsx');
  it('maps 402 to the shortfall panel with a recharge path instead of a raw toast', () => {
    expect(reports).toContain('err.status === 402');
    expect(reports).toContain("setOrderProblem({ kind: 'balance' })");
    expect(reports).toContain('<BalanceShortfall balance={walletBalance} required={parseFloat(selected.price)} />');
    // An unknown balance is never shown as ₹0 with the full price as the top-up.
    expect(reports).not.toContain('walletBalance ?? 0');
    expect(reports).toContain('data-testid="order-balance-unavailable"');
    expect(reports).toContain('data-testid="button-recharge-wallet"');
  });
  it('maps 409 (chart needs recreating) to a link to the chart', () => {
    expect(reports).toContain('err.status === 409');
    expect(reports).toContain('Open the chart to recreate it');
  });
  it('shows the wallet balance before paying, and never blocks payment on the client', () => {
    expect(reports).toContain('balance ₹${walletBalance.toFixed(2)}');
    // Admin free access is decided by the server; the client must not pre-block on balance.
    const button = reports.slice(reports.indexOf('data-testid="button-confirm-order"') - 400, reports.indexOf('data-testid="button-confirm-order"'));
    expect(button).not.toMatch(/walletBalance/);
  });
  it('the PDF and report flows share one shortfall panel', () => {
    expect(read('pages/KundliView.tsx')).toContain('<BalanceShortfall balance={balance} required={PDF_PRICE} />');
    expect(read('components/BalanceShortfall.tsx')).toContain('Math.max(0, required - balance)');
  });
});
