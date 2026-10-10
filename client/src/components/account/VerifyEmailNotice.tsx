import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { isApiError } from '@/lib/apiError';
import { useAppFeatures } from '@/lib/appConfig';
import { cn } from '@/lib/utils';

interface Me { email?: string | null; emailVerifiedAt?: string | null }

/**
 * Asks an unverified account to confirm its email (verified accounts get the free Ask
 * questions). Shown only when the server can send verification email.
 */
export function VerifyEmailNotice({ reason = 'Confirm your email to get 3 free questions to ask your Kundli.', className }: { reason?: string; className?: string }) {
  const { emailVerification } = useAppFeatures();
  const queryClient = useQueryClient();
  const { data: me } = useQuery<Me | null>({ queryKey: ['/api/auth/user'] });
  const [state, setState] = useState<{ tone: 'ok' | 'problem'; text: string } | null>(null);

  const resend = useMutation({
    mutationFn: () => apiRequest('POST', '/api/auth/verify-email/resend'),
    onSuccess: (data: { alreadyVerified?: boolean }) => {
      if (data?.alreadyVerified) {
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        return;
      }
      setState({ tone: 'ok', text: `We sent a link to ${me?.email}. It works once and expires in 24 hours.` });
    },
    onError: (err) => {
      if (isApiError(err) && err.status === 429) {
        const wait = Number((err.body as { retryAfter?: number })?.retryAfter) || 60;
        const text = wait > 3600 ? 'You have asked for several links today. Please try again tomorrow.' : `Please wait ${Math.ceil(wait / 60)} min before asking for another link.`;
        setState({ tone: 'problem', text });
        return;
      }
      setState({ tone: 'problem', text: isApiError(err) ? err.message : 'Could not send the link. Please try again.' });
    },
  });

  if (!emailVerification || !me?.email || me.emailVerifiedAt) return null;

  return (
    <section className={cn('flex flex-col gap-2 rounded-lg border border-line bg-highlight px-4 py-3', className)} aria-label="Confirm your email" data-testid="verify-email-notice">
      <p className="m-0 text-sm text-ink">{reason}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => resend.mutate()} disabled={resend.isPending} data-testid="button-resend-verification">
          {resend.isPending ? 'Sending…' : state?.tone === 'ok' ? 'Send again' : 'Send confirmation link'}
        </Button>
        {state && <p role="status" className={cn('m-0 text-caption', state.tone === 'ok' ? 'text-positive' : 'text-negative')}>{state.text}</p>}
      </div>
    </section>
  );
}
