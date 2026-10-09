import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { isAstrologerAvailable } from '@/lib/astrologerPresence';
import { priceLabel } from '@/lib/astrologerDisplay';
import { useMarketplace } from '@/lib/marketplace';
import type { Astrologer } from '@shared/schema';

// What a signed-in user gets, described without any personal astrology.
const FEATURES = [
  { title: 'Your Kundli', hi: 'कुण्डली', body: 'Swiss Ephemeris positions with Lahiri ayanamsa, drawn as a North or South Indian chart, with each graha’s dignity and nakshatra.' },
  { title: 'Ask your Kundli', hi: 'प्रश्न', body: 'Ask about career, marriage or money. Every answer shows the chart factors for and against it, and is checked against your chart.' },
  { title: 'Dasha timeline', hi: 'दशा', body: 'Your Vimshottari periods to scale from birth, with what each one engages in your chart.' },
];

const GUEST_LINKS = [
  { label: 'Today’s Panchang', href: '/panchang' },
  { label: 'Moon-sign horoscope', href: '/horoscope' },
  { label: 'Kundli Milan', href: '/kundli/matchmaking' },
];

export default function Landing() {
  const marketplace = useMarketplace();
  const { data: astrologers } = useQuery<Astrologer[]>({ queryKey: ['/api/astrologers'], enabled: marketplace });
  const { data: config } = useQuery<{ freeChatMinutes?: number }>({ queryKey: ['/api/config'] });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const { toast } = useToast();

  const onlineCount = astrologers?.filter(isAstrologerAvailable).length;
  const freeChatMinutes = config?.freeChatMinutes;
  const featuredAstrologers = astrologers?.slice(0, 4) || [];

  const authMutation = useMutation({
    mutationFn: async () => {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login' ? { email, password } : { email, password, firstName };
      return await apiRequest('POST', endpoint, body);
    },
    onSuccess: () => { window.location.href = '/'; },
    onError: (err: any) => {
      toast({ title: authMode === 'login' ? 'Could not sign in' : 'Could not create the account', description: err?.message || 'Please try again.', variant: 'destructive' });
    },
  });
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (email && password) authMutation.mutate(); };

  return (
    <div className="flex flex-col">
      <section className="bg-ink text-on-navy" aria-labelledby="landing-h">
        <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-4 py-8 md:grid-cols-[minmax(0,1.2fr)_minmax(320px,400px)] md:gap-14 md:px-10 md:py-14">
          <div className="flex flex-col justify-center gap-4">
            <p lang="hi" className="font-display text-card-title text-amber">नवग्रह</p>
            <h1 id="landing-h" className="m-0 font-display text-title font-semibold leading-[1.1] text-balance md:text-hero">Your Kundli, explained from the chart itself</h1>
            <p className="max-w-[56ch] text-lead text-on-navy-2">
              Navagraha calculates your birth chart with the Swiss Ephemeris and answers your questions from it, showing the evidence for and against each answer.
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm">
              {GUEST_LINKS.map((l) => <li key={l.href}><Link href={l.href} className="text-on-navy underline hover:text-amber">{l.label}</Link></li>)}
            </ul>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg bg-surface p-4 text-ink md:p-[22px]" aria-labelledby="auth-h" data-testid="landing-auth">
            <h2 id="auth-h" className="m-0 font-display text-card-title font-semibold">{authMode === 'login' ? 'Sign in' : 'Create your account'}</h2>
            {authMode === 'register' && (
              <Input placeholder="First name" aria-label="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            )}
            <Input type="email" placeholder="Email address" aria-label="Email address" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Password" aria-label="Password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" disabled={authMutation.isPending || !email || !password}>
              {authMutation.isPending ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
            <div className="flex items-center gap-3 text-caption text-ink-muted" aria-hidden="true">
              <span className="flex-1 border-t border-hairline" />or<span className="flex-1 border-t border-hairline" />
            </div>
            <Button type="button" variant="outline" onClick={() => { window.location.href = '/api/auth/google'; }}>Continue with Google</Button>
            <p className="text-center text-sm text-ink-muted">
              {authMode === 'login' ? 'New here? ' : 'Already have an account? '}
              <button type="button" className="font-semibold text-ink underline" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                {authMode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
          </form>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-10 px-4 py-8 md:px-10 md:py-12">
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3" aria-label="What you get">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
              <h2 className="m-0 font-display text-card-title font-semibold md:text-heading">{f.title} <span lang="hi" className="text-base font-normal text-ink-muted">{f.hi}</span></h2>
              <p className="text-base">{f.body}</p>
            </li>
          ))}
        </ul>

        {marketplace && (
          <section aria-labelledby="experts-h" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="experts-h" className="m-0 font-display text-card-title font-semibold">Talk to an astrologer</h2>
              <Link href="/astrologers" className="text-sm underline">Browse astrologers</Link>
            </div>
            <p className="text-sm" data-testid="landing-free-chat-terms">
              {freeChatMinutes ? `The first ${freeChatMinutes} minutes of your first chat are free.` : 'Verified astrologers, by chat or call.'}
              {typeof onlineCount === 'number' && <> <span data-testid="landing-online-count">{onlineCount}</span> {onlineCount === 1 ? 'astrologer is' : 'astrologers are'} available now.</>}
            </p>
            <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
              {featuredAstrologers.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 border-t border-hairline py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.name}{a.isVerified ? ' · verified' : ''}</span>
                    <span className="block truncate text-sm text-ink-muted">{a.specializations?.[0] || 'Vedic astrology'}</span>
                  </span>
                  {priceLabel(a.pricePerMinute) && <span className="shrink-0 text-sm tabular-nums">{priceLabel(a.pricePerMinute)}/min</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-caption text-ink-muted">
          Jyotish describes tendencies, not certainties. <Link href="/astrologer/login" className="underline">Astrologer portal</Link>
        </p>
      </div>
    </div>
  );
}
