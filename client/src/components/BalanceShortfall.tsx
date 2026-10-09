/** Balance, price and the minimum top-up, for a wallet purchase the balance does not cover. */
export function BalanceShortfall({ balance, required }: { balance: number; required: number }) {
  const shortfall = Math.max(0, required - balance);
  return (
    <div className="rounded-lg bg-muted px-4 py-3 text-sm space-y-1" data-testid="balance-shortfall">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Your balance</span>
        <span className="font-medium text-negative">₹{balance.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Required</span>
        <span className="font-medium">₹{required}</span>
      </div>
      <div className="border-t border-border pt-1 flex justify-between">
        <span className="text-muted-foreground">Add at least</span>
        <span className="font-semibold">₹{shortfall.toFixed(2)}</span>
      </div>
    </div>
  );
}
