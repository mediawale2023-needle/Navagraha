import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Copy, Check } from 'lucide-react';
import type { User as UserType, Kundli } from '@shared/schema';
import { PageHeader, PageBody } from '@/components/shell/PageHeader';

interface ReferralInfo {
  code: string;
  referrerReward: number;
  refereeReward: number;
  totalInvited: number;
  totalRewarded: number;
  totalEarned: number;
}

function ReferralCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [applyCode, setApplyCode] = useState('');

  const { data: referral } = useQuery<ReferralInfo>({
    queryKey: ['/api/referral'],
  });

  const applyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest('POST', '/api/referral/apply', { code });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: 'Referral Applied', description: data.message });
        setApplyCode('');
        queryClient.invalidateQueries({ queryKey: ['/api/referral'] });
      } else {
        toast({ title: 'Could not apply', description: data.message, variant: 'destructive' });
      }
    },
    onError: (err: any) => {
      toast({ title: 'Could not apply', description: err?.message || 'Invalid referral code', variant: 'destructive' });
    },
  });

  const copyCode = () => {
    if (!referral?.code) return;
    navigator.clipboard?.writeText(referral.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: 'Copied!', description: 'Referral code copied to clipboard.' });
  };

  const share = () => {
    if (!referral?.code) return;
    const text = `Join me on Navagraha for Vedic astrology consultations! Use my code ${referral.code} and get ₹${referral.refereeReward} on your first recharge.`;
    if (navigator.share) {
      navigator.share({ title: 'Navagraha', text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
      toast({ title: 'Copied invite', description: 'Invite message copied to clipboard.' });
    }
  };

  return (
    <section aria-labelledby="refer-h" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
      <div className="flex flex-col gap-1">
        <h2 id="refer-h" className="m-0 font-display text-card-title font-semibold">Refer a friend</h2>
        {referral && <p className="text-sm text-ink-muted">They get ₹{referral.refereeReward} on their first recharge and you get ₹{referral.referrerReward}.</p>}
      </div>
      {referral?.code && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 rounded-md border border-line bg-sunken px-4 py-2.5 text-center font-mono text-lead font-semibold tracking-widest" data-testid="text-referral-code">{referral.code}</span>
          <Button variant="outline" onClick={copyCode} className="gap-1.5" data-testid="button-copy-code">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy
          </Button>
          <Button onClick={share} data-testid="button-share-code">Share</Button>
        </div>
      )}
      <dl className="m-0 grid grid-cols-3 gap-2 text-center tabular-nums">
        {[['Invited', referral?.totalInvited ?? 0], ['Joined', referral?.totalRewarded ?? 0], ['Earned', `₹${referral?.totalEarned ?? 0}`]].map(([k, v]) => (
          <div key={k} className="flex flex-col rounded-md border border-hairline py-2">
            <dd className="m-0 font-display text-card-title font-semibold">{v}</dd>
            <dt className="text-caption text-ink-muted">{k}</dt>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <label htmlFor="apply-referral" className="text-sm text-ink-muted">Have a referral code? Apply it before your first recharge.</label>
        <div className="flex gap-2">
          <Input
            id="apply-referral"
            placeholder="Referral code"
            value={applyCode}
            onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
            className="flex-1 uppercase"
            data-testid="input-apply-referral"
          />
          <Button
            variant="outline"
            onClick={() => applyMutation.mutate(applyCode.trim())}
            disabled={!applyCode.trim() || applyMutation.isPending}
            data-testid="button-apply-referral"
          >
            Apply
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function Profile() {
  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });
  const { data: kundlis } = useQuery<Kundli[]>({
    queryKey: ['/api/kundli'],
  });

  if (userLoading) return <LoadingSpinner />;

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const rows: Array<[string, string]> = [
    ['Name', name || 'Not set'],
    ['Email', user?.email ?? 'Not set'],
    ...(user?.createdAt ? [['Member since', new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })] as [string, string]] : []),
  ];

  return (
    <div>
      <PageHeader title="Account" sub={user?.email ?? undefined} back={{ href: "/", label: "Today" }} width="max-w-3xl" />
      <PageBody width="max-w-3xl" className="flex flex-col gap-5">
        <section aria-labelledby="account-h" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
          <h2 id="account-h" className="m-0 font-display text-card-title font-semibold">Your details</h2>
          <dl className="m-0 flex flex-col">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-hairline py-2.5 last:border-0">
                <dt className="text-sm text-ink-muted">{k}</dt>
                <dd className="m-0 min-w-0 break-words text-base">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="charts-h" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
          <div className="flex flex-col gap-1">
            <h2 id="charts-h" className="m-0 font-display text-card-title font-semibold">Saved charts</h2>
            <p className="text-sm text-ink-muted tabular-nums">{kundlis ? `${kundlis.length} ${kundlis.length === 1 ? 'chart' : 'charts'}` : '…'}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/kundli"><Button variant="outline">Open</Button></Link>
            <Link href="/kundli/new"><Button data-testid="button-new-kundli">New Kundli</Button></Link>
          </div>
        </section>

        <ReferralCard />

        <a href="/api/logout" className="self-start text-sm underline hover:text-amber-text">Sign out</a>
      </PageBody>
    </div>
  );
}
