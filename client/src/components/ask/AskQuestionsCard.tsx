import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AskPacks, type AskPacksInfo } from './AskPacks';

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * Bought Ask questions, shown as a count beside (never inside) the rupee balance, with what
 * each pack cost and how much of it is used.
 */
export function AskQuestionsCard() {
  const { data } = useQuery<AskPacksInfo>({ queryKey: ['/api/ask/packs'] });
  const [buying, setBuying] = useState(false);
  if (!data || (!data.enabled && data.history.length === 0)) return null;
  const remaining = data.allowance?.paidQuestionsRemaining ?? 0;

  return (
    <section aria-labelledby="ask-questions-h" className="mb-6 flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:p-[22px]" data-testid="ask-questions-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="ask-questions-h" className="m-0 font-display text-card-title font-semibold">Ask your Kundli questions</h2>
          <p className="m-0 text-sm text-ink-muted">Questions are separate from your wallet money. Each comes with its own follow-ups.</p>
        </div>
        <p className="m-0 font-display text-heading font-semibold tabular-nums" data-testid="text-questions-remaining">
          {remaining} <span className="text-base font-normal text-ink-muted">{remaining === 1 ? 'question' : 'questions'} left</span>
        </p>
      </div>

      {data.history.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0 text-sm tabular-nums" aria-label="Your question packs">
          {data.history.map((h) => (
            <li key={h.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-hairline py-2 last:border-0">
              <span>{h.quantity} {h.quantity === 1 ? 'question' : 'questions'}{h.price ? ` · ₹${Number(h.price).toFixed(0)}` : ''}{h.createdAt ? ` · ${date(h.createdAt)}` : ''}</span>
              <span className="text-ink-muted">{h.quantity - h.used} of {h.quantity} left</span>
            </li>
          ))}
        </ul>
      )}

      {data.enabled && (buying
        ? <AskPacks onPurchased={() => setBuying(false)} />
        : <Button variant="outline" className="self-start" onClick={() => setBuying(true)} data-testid="button-open-packs">Buy questions</Button>)}
    </section>
  );
}
