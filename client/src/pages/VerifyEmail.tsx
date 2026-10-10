import { useEffect } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PageHeader, PageBody } from '@/components/shell/PageHeader';
import { VerifyEmailNotice } from '@/components/account/VerifyEmailNotice';

const OUTCOMES: Record<string, { title: string; body: string; ok: boolean }> = {
  verified: { title: 'Email confirmed', body: 'Your email is confirmed. Your free questions are ready in Ask your Kundli.', ok: true },
  already: { title: 'Already confirmed', body: 'This email was already confirmed. Nothing more to do.', ok: true },
  expired: { title: 'This link has expired', body: 'Links work for 24 hours, and a newer link replaces an older one. Send yourself a new one below.', ok: false },
  invalid: { title: 'This link is not valid', body: 'It may have been used already or copied incompletely. Send yourself a new one below.', ok: false },
  conflict: { title: 'This email is confirmed on another account', body: 'Sign in with the account that already uses this address, or contact support.', ok: false },
  error: { title: 'Something went wrong', body: 'We could not check this link just now. Please open it again in a minute.', ok: false },
};

/** Where a verification link lands (the server has already checked it and passes the outcome). */
export default function VerifyEmail() {
  const status = new URLSearchParams(window.location.search).get('status') ?? 'invalid';
  const outcome = OUTCOMES[status] ?? OUTCOMES.invalid;
  const queryClient = useQueryClient();
  const { data: me } = useQuery<{ id: string } | null>({ queryKey: ['/api/auth/user'], retry: false });

  useEffect(() => {
    if (outcome.ok) {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/question-count'] });
    }
  }, [outcome.ok, queryClient]);

  return (
    <div>
      <PageHeader title="Confirm email" back={{ href: '/', label: 'Today' }} width="max-w-xl" />
      <PageBody width="max-w-xl" className="flex flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5" aria-live="polite" data-testid={`verify-status-${status}`}>
          <h2 className="m-0 font-display text-subhead font-semibold">{outcome.title}</h2>
          <p className="m-0 text-base text-ink-muted">{outcome.body}</p>
          {outcome.ok && <Link href="/ai-astrologer"><Button className="mt-2 self-start">Ask your Kundli</Button></Link>}
        </section>
        {!outcome.ok && status !== 'conflict' && (me
          ? <VerifyEmailNotice reason="Send a new confirmation link to your email." />
          : <p className="text-sm text-ink-muted">Sign in, then open your Account page to send a new link. <Link href="/"><span className="underline hover:text-amber-text">Sign in</span></Link></p>)}
      </PageBody>
    </div>
  );
}
