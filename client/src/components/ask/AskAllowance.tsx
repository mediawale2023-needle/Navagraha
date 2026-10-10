import { VerifyEmailNotice } from '@/components/account/VerifyEmailNotice';
import { AskPacks } from './AskPacks';

export interface AskAllowanceState {
  enforced: boolean;
  emailVerified?: boolean;
  freeQuestionsTotal: number;
  freeQuestionsUsed: number;
  freeQuestionsRemaining: number;
  paidQuestionsRemaining: number;
  followUpsRemaining: number | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What the signed-in user can still ask. Shown only while the allowance is enforced: until
 * then nobody is limited, so a count would be untrue.
 */
export function AskAllowanceLine({ allowance, onBuy }: { allowance: AskAllowanceState | null; onBuy?: () => void }) {
  if (!allowance?.enforced) return null;
  const parts: string[] = [];
  if (allowance.freeQuestionsTotal > 0) parts.push(`${plural(allowance.freeQuestionsRemaining, 'free question', 'free questions')} left`);
  if (allowance.paidQuestionsRemaining > 0) parts.push(`${allowance.paidQuestionsRemaining} bought`);
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 text-caption text-ink-muted tabular-nums" data-testid="ask-allowance">
      {parts.length ? parts.join(' · ') : 'No questions left'}
      {onBuy && <button type="button" onClick={onBuy} className="underline hover:text-amber-text">Get more</button>}
    </p>
  );
}

/** Under the latest answer: how many follow-ups this question still has. */
export function FollowUpHint({ allowance }: { allowance: AskAllowanceState | null }) {
  if (!allowance?.enforced || allowance.followUpsRemaining === null) return null;
  const left = allowance.followUpsRemaining;
  return (
    <p className="m-0 text-caption text-ink-muted" data-testid="ask-follow-ups">
      {left > 0 ? `${plural(left, 'follow-up', 'follow-ups')} left on this question` : 'Your next message starts a new question'}
    </p>
  );
}

/** Why a question was not answered (402), with the way forward; nothing was used. */
export function AskLimitPanel({ problem, packsEnabled, onPurchased }: { problem: string; packsEnabled: boolean; onPurchased: () => void }) {
  if (problem === 'email_verification_required') {
    return (
      <div className="flex flex-col gap-3 rounded-answer border border-line bg-surface p-[22px]" role="alert" data-testid="ask-limit-verify">
        <p className="m-0 text-base">Free questions are for accounts with a confirmed email. Your question has not been used.</p>
        <VerifyEmailNotice reason="Confirm your email to get 3 free questions, each with a follow-up." />
        {packsEnabled && <AskPacks onPurchased={onPurchased} />}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-answer border border-line bg-surface p-[22px]" role="alert" data-testid="ask-limit-exhausted">
      <p className="m-0 text-base">You have used your questions. Your last question has not been used; buy more and it will be asked straight away.</p>
      {packsEnabled ? <AskPacks onPurchased={onPurchased} /> : <p className="m-0 text-sm text-ink-muted">More questions will be available soon.</p>}
    </div>
  );
}
