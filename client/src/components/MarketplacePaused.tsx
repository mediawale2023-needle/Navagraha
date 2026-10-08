import { Link } from 'wouter';
import { Sparkles } from 'lucide-react';

/** Shown in place of a marketplace page while astrologer services are paused. */
export function MarketplacePaused() {
  return (
    <div className="yantra-shell min-h-screen px-4 py-12" data-testid="marketplace-paused">
      <div className="yantra-card mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] bg-primary/20">
          <Sparkles className="h-6 w-6 text-[var(--primary-border)]" />
        </div>
        <h1 className="font-display text-2xl text-foreground">Astrologer services are paused</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Consultations, live sessions, Pooja and Astromall are not available right now. Your Kundli,
          Ask Your Kundli and reports work as usual, and your past orders and wallet are safe.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/ai-astrologer" className="rounded-[9px] bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Ask Your Kundli
          </Link>
          <Link href="/kundli" className="rounded-[9px] border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
            My Charts
          </Link>
        </div>
      </div>
    </div>
  );
}
