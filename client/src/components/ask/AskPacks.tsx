import { useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { isApiError } from '@/lib/apiError';
import { cn } from '@/lib/utils';

export interface AskPackOffer { id: string; questions: number; price: number; followUpsEach: number }
export interface AskPacksInfo {
  enabled: boolean;
  packs: AskPackOffer[];
  balance: string;
  allowance: { paidQuestionsRemaining: number } | null;
  history: Array<{ id: string; quantity: number; used: number; followUpsEach: number; source: string; price: string | null; createdAt: string | null }>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Question packs, paid from the wallet. Prices come from the server; a purchase is sent with
 * a request id made when the pack is chosen, so a retried tap buys once.
 */
export function AskPacks({ onPurchased, className }: { onPurchased?: () => void; className?: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery<AskPacksInfo>({ queryKey: ['/api/ask/packs'] });
  const [choice, setChoice] = useState<{ packId: string; requestId: string } | null>(null);
  const [problem, setProblem] = useState<{ kind: 'balance'; required: number } | { kind: 'other'; text: string } | null>(null);

  const buy = useMutation({
    mutationFn: (c: { packId: string; requestId: string }) => apiRequest('POST', '/api/ask/packs/purchase', c),
    onSuccess: () => {
      setProblem(null);
      setChoice(null);
      queryClient.invalidateQueries({ queryKey: ['/api/ask/packs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/question-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      onPurchased?.();
    },
    onError: (err) => {
      if (isApiError(err) && err.status === 402) {
        setProblem({ kind: 'balance', required: Number((err.body as { required?: number })?.required) || 0 });
        return;
      }
      setProblem({ kind: 'other', text: isApiError(err) ? err.message : 'Purchase failed. Please try again.' });
    },
  });

  if (!data?.enabled || data.packs.length === 0) return null;
  const balance = Number(data.balance) || 0;
  const selected = data.packs.find((p) => p.id === choice?.packId) ?? null;
  const select = (id: string) => {
    if (choice?.packId !== id) setChoice({ packId: id, requestId: crypto.randomUUID() });
    setProblem(null);
  };

  return (
    <section className={cn('flex flex-col gap-4', className)} aria-labelledby="ask-packs-h" data-testid="ask-packs">
      <div className="flex flex-col gap-1">
        <h2 id="ask-packs-h" className="m-0 font-display text-card-title font-semibold">Ask more questions</h2>
        <p className="m-0 text-sm text-ink-muted">Each question includes {plural(data.packs[0].followUpsEach, 'follow-up', 'follow-ups')} on the same chart. Questions don't expire.</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Question packs">
        {data.packs.map((p) => {
          const on = choice?.packId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => select(p.id)}
              className={cn('grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 rounded-md px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex sm:flex-col sm:gap-1 sm:py-3.5',
                on ? 'border-[1.5px] border-ink bg-surface' : 'border border-line bg-surface hover:bg-highlight')}
              data-testid={`pack-${p.id}`}
            >
              <span className="font-display text-subhead font-semibold tabular-nums">{plural(p.questions, 'question', 'questions')}</span>
              <span className="text-base font-semibold tabular-nums">₹{p.price}</span>
              <span className="text-caption text-ink-muted tabular-nums">₹{(p.price / p.questions).toFixed(p.price % p.questions ? 1 : 0)} a question</span>
            </button>
          );
        })}
      </div>

      <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
        <div className="flex gap-1.5"><dt className="text-ink-muted">Wallet balance</dt><dd className="m-0 font-semibold">₹{balance.toFixed(2)}</dd></div>
        {data.allowance && <div className="flex gap-1.5"><dt className="text-ink-muted">Questions you've bought, unused</dt><dd className="m-0 font-semibold">{data.allowance.paidQuestionsRemaining}</dd></div>}
      </dl>

      {problem?.kind === 'balance' && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-highlight px-4 py-3 text-sm" role="alert" data-testid="ask-packs-balance">
          <span className="flex-1">Your wallet has ₹{balance.toFixed(2)}; this pack is ₹{problem.required}. Add ₹{Math.max(0, problem.required - balance).toFixed(2)} or more to buy it.</span>
          <Link href="/wallet"><Button size="sm" variant="outline">Open wallet</Button></Link>
        </div>
      )}
      {problem?.kind === 'other' && <p role="alert" className="m-0 text-sm text-negative">{problem.text}</p>}

      <Button
        onClick={() => choice && buy.mutate(choice)}
        disabled={!selected || buy.isPending}
        className="self-start"
        data-testid="button-buy-pack"
      >
        {buy.isPending ? 'Buying…' : selected ? `Pay ₹${selected.price} from wallet` : 'Choose a pack'}
      </Button>
    </section>
  );
}
