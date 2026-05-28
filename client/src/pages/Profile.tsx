import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ArrowLeft, User, Mail, Phone, Calendar,
  MapPin, Clock, Sparkles, Gift, Copy, Check
} from 'lucide-react';
import type { User as UserType, Kundli } from '@shared/schema';

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
    <Card className="yantra-card mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display">
          <Gift className="w-4 h-4 text-[var(--primary-border)]" /> Refer &amp; Earn
        </CardTitle>
        <CardDescription>
          Invite friends — they get ₹{referral?.refereeReward ?? 25} on their first recharge and you earn ₹{referral?.referrerReward ?? 75}.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {referral?.code && (
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-[10px] border-2 border-dashed border-primary/60 bg-primary/10 px-4 py-3 text-center font-mono font-bold tracking-widest text-foreground" data-testid="text-referral-code">
              {referral.code}
            </div>
            <Button variant="outline" size="icon" onClick={copyCode} className="rounded-xl h-12 w-12" data-testid="button-copy-code">
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button onClick={share} className="h-12 rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-share-code">
              Share
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-foreground">{referral?.totalInvited ?? 0}</div>
            <div className="text-[10px] text-muted-foreground">Invited</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-foreground">{referral?.totalRewarded ?? 0}</div>
            <div className="text-[10px] text-muted-foreground">Joined</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold text-emerald-600">₹{referral?.totalEarned ?? 0}</div>
            <div className="text-[10px] text-muted-foreground">Earned</div>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Have a referral code? Apply it before your first recharge.</p>
          <div className="flex gap-2">
            <Input
              placeholder="Enter referral code"
              value={applyCode}
              onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl uppercase"
              data-testid="input-apply-referral"
            />
            <Button
              variant="outline"
              onClick={() => applyMutation.mutate(applyCode.trim())}
              disabled={!applyCode.trim() || applyMutation.isPending}
              className="rounded-xl px-6"
              data-testid="button-apply-referral"
            >
              Apply
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Profile() {
  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const { data: kundlis, isLoading: kundlisLoading } = useQuery<Kundli[]>({
    queryKey: ['/api/kundli'],
  });

  if (userLoading) {
    return <LoadingSpinner />;
  }

  return (
      <div className="yantra-shell min-h-screen pb-24 md:pb-8">
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card hover:bg-muted" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <h1 className="font-display text-xl text-foreground">My Profile</h1>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6">

        {/* Profile Info Card */}
        <Card className="mb-6 overflow-hidden border-[var(--primary-border)] bg-primary">
          <CardContent className="p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-20 h-20 rounded-[8px] border-4 border-background bg-card">
                <Avatar className="h-full w-full rounded-[6px]">
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || 'User'} className="object-cover" />
                  <AvatarFallback className="bg-nava-navy font-display text-2xl text-primary">
                    {user?.firstName?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="flex-1">
                <h2 className="font-display text-2xl text-foreground mb-1">
                  {user?.firstName || user?.lastName
                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                    : 'Anonymous User'}
                </h2>
                {user?.email && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{user.email}</span>
                  </div>
                )}
              </div>
            </div>

            <Button variant="secondary" className="w-full rounded-[9px] bg-nava-navy text-primary hover:bg-nava-navy/95" data-testid="button-edit-profile">
              Edit Profile
            </Button>
          </CardContent>
        </Card>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="yantra-card rounded-[12px] p-4 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-[6px] bg-primary/20">
              <Sparkles className="w-5 h-5 text-[var(--primary-border)]" />
            </div>
            <div className="text-2xl font-bold text-foreground">{kundlis?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Kundlis</div>
          </div>

          <div className="yantra-card rounded-[12px] p-4 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-[6px] bg-nava-magenta/10">
              <User className="w-5 h-5 text-nava-magenta" />
            </div>
            <div className="text-2xl font-bold text-foreground">0</div>
            <div className="text-xs text-muted-foreground">Consults</div>
          </div>

          <div className="yantra-card rounded-[12px] p-4 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-[6px] bg-primary/15">
              <Calendar className="w-5 h-5 text-[var(--primary-border)]" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {user?.createdAt
                ? new Date(user.createdAt).getFullYear()
                : new Date().getFullYear()}
            </div>
            <div className="text-xs text-muted-foreground">Member</div>
          </div>
        </div>

        {/* Refer & Earn */}
        <ReferralCard />

        {/* Birth Details Card */}
        {(user?.dateOfBirth || user?.timeOfBirth || user?.placeOfBirth) && (
          <Card className="yantra-card mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base">Birth Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {user.dateOfBirth && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-primary/15">
                      <Calendar className="w-4 h-4 text-[var(--primary-border)]" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Date of Birth</div>
                      <div className="text-sm font-medium text-foreground">
                        {new Date(user.dateOfBirth).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )}

                {user.timeOfBirth && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-primary/15">
                      <Clock className="w-4 h-4 text-[var(--primary-border)]" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Time of Birth</div>
                      <div className="text-sm font-medium text-foreground">{user.timeOfBirth}</div>
                    </div>
                  </div>
                )}

                {user.placeOfBirth && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-nava-magenta/10">
                      <MapPin className="w-4 h-4 text-nava-magenta" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Place of Birth</div>
                      <div className="text-sm font-medium text-foreground">{user.placeOfBirth}</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Saved Kundlis */}
        <Card className="yantra-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-base">My Kundlis</CardTitle>
              <Link href="/kundli/new">
                <Button size="sm" className="rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-new-kundli">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Generate New
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {kundlisLoading ? (
              <LoadingSpinner size="sm" />
            ) : kundlis && kundlis.length > 0 ? (
              <div className="space-y-3">
                {kundlis.map((kundli) => {
                  const birthDate = new Date(kundli.dateOfBirth);

                  return (
                    <Link key={kundli.id} href={`/kundli/${kundli.id}`}>
                      <div
                        className="cursor-pointer rounded-[10px] bg-background p-4 transition-colors hover:bg-muted"
                        data-testid={`kundli-${kundli.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="font-display mb-1.5 text-base text-foreground">
                              {kundli.name}
                            </h3>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>{birthDate.toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{kundli.timeOfBirth}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {kundli.zodiacSign && (
                              <Badge className="border-0 bg-primary/15 text-[var(--primary-border)] text-xs">{kundli.zodiacSign}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[8px] bg-primary/20">
                  <Sparkles className="w-7 h-7 text-[var(--primary-border)]" />
                </div>
                <p className="text-muted-foreground text-sm mb-1">No kundlis generated yet</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Generate your first birth chart to get started
                </p>
                <Link href="/kundli/new">
                  <Button className="rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Kundli
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
