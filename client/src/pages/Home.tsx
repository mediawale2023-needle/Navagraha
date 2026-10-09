import { isAstrologerAvailable } from '@/lib/astrologerPresence';
import { useQuery } from '@tanstack/react-query';
import { type LucideIcon, Phone, MessageCircle, Calendar, Sparkles, User, Wallet, LogOut, ArrowRight, Radio, ShoppingBag, FileText, Flame, CalendarDays } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { isMarketplacePath, useMarketplace } from '@/lib/marketplace';
import { QuickActionCard } from '@/components/QuickActionCard';
import { HeroBanner } from '@/components/HeroBanner';
import { SectionHeader } from '@/components/SectionHeader';
import { GreetingCard } from '@/components/GreetingCard';
import { ActiveInfluences } from '@/components/v3/ActiveInfluences';
import { RunningPeriodCard } from '@/components/v3/RunningPeriodCard';
import { AstrologerCard } from '@/components/astrologer-card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { User as UserType, Astrologer, HomepageContent } from '@shared/schema';

// Icon name → component lookup for CMS-driven quick actions
const ICON_MAP: Record<string, LucideIcon> = { Phone, MessageCircle, Sparkles, Calendar };
const COLOR_CYCLE = ['purple', 'green', 'orange', 'navy'] as const;

interface CmsHomepageContent {
  banners: HomepageContent[];
  services: HomepageContent[];
  freeServices: HomepageContent[];
}

export default function Home() {
  const [, setLocation] = useLocation();

  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const marketplace = useMarketplace();
  const { data: astrologers, isLoading: astrologersLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
    enabled: marketplace,
  });

  const { data: wallet } = useQuery<{ balance: number }>({
    queryKey: ['/api/wallet'],
  });

  const { data: cmsContent } = useQuery<CmsHomepageContent>({
    queryKey: ['/api/homepage-content'],
  });

  const { data: kundlis } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/kundli'],
  });
  const latestChart = kundlis?.[0];

  // CMS content may point into the marketplace; while it is paused those entries are skipped.
  const visible = <T extends { href?: string | null }>(items: T[] = []) => (marketplace ? items : items.filter((i) => !isMarketplacePath(i.href)));
  const cmsBanner = visible(cmsContent?.banners)[0];
  const cmsServices = visible(cmsContent?.services);
  const balance = Number(wallet?.balance || 0);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="yantra-shell min-h-screen font-sans relative overflow-x-hidden">
      <div className="relative mx-auto w-full max-w-7xl pb-24 md:pb-8">
        <header className="px-4 pb-3 pt-5 md:px-8 lg:px-12">
          <div className="mb-5 flex items-center justify-between">
            <div className="md:hidden">
              <h1 className="font-display text-2xl text-foreground tracking-tight">
                Navagraha
              </h1>
              <div className="flex items-center gap-1.5 text-[var(--primary-border)] font-medium text-xs">
                <Sparkles className="w-3 h-3" />
                <span>Nine Celestial Powers</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-border bg-card transition-colors hover:bg-muted">
                    <User className="w-5 h-5 text-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">{user?.firstName || 'Seeker'}</p>
                    <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-border" />
                  <Link href="/profile">
                    <DropdownMenuItem className="cursor-pointer">
                      <User className="w-4 h-4 mr-2" /> My Profile
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/wallet">
                    <DropdownMenuItem className="cursor-pointer">
                      <Wallet className="w-4 h-4 mr-2" /> Wallet
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    className="text-negative cursor-pointer"
                    onClick={() => window.location.href = '/api/logout'}
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_320px] lg:items-stretch">
            <GreetingCard
              userName={user?.firstName ? user.firstName.split(' ')[0] : 'Seeker'}
              subtitle="See what your chart says, and why."
              className="h-full"
            />
            <div className="yantra-card h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="yantra-eyebrow">Wallet</p>
                  <p className="font-display mt-2 text-3xl text-foreground">₹{balance.toFixed(0)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{marketplace ? 'Ready for chats, calls, and reports' : 'Ready for reports'}</p>
                </div>
                <div className="rounded-[8px] bg-primary/20 p-3">
                  <Wallet className="w-5 h-5 text-[var(--primary-border)]" />
                </div>
              </div>
              <button
                onClick={() => setLocation('/wallet')}
                className="mt-4 inline-flex items-center gap-2 border-b border-foreground pb-0.5 text-sm font-semibold text-foreground"
              >
                Add money
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="px-4 md:px-8 lg:px-12">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.9fr)]">
            <HeroBanner
              title={cmsBanner?.title || 'Your cosmic blueprint awaits.'}
              subtitle={cmsBanner?.subtitle ?? (marketplace ? 'Kundli, personalised guidance, and expert consultations.' : 'Kundli and personalised guidance from your own chart.')}
              cta={cmsBanner?.cta ?? 'Generate kundli'}
              href={cmsBanner?.href ?? undefined}
              className="h-full"
            />
            <RunningPeriodCard />
          </div>
        </div>

        {/* Quick Actions - 2x2 Grid */}
        <section className="mb-7 pt-1">
          <div className="px-4 md:px-8 lg:px-12">
            <SectionHeader title="Connect" showViewAll={false} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-8 lg:px-12 xl:grid-cols-4">
            {marketplace && cmsServices.length > 0 ? (
              cmsServices.map((svc, i) => (
                <QuickActionCard
                  key={svc.id}
                  title={svc.title}
                  icon={ICON_MAP[svc.icon ?? ''] ?? Sparkles}
                  color={COLOR_CYCLE[i % COLOR_CYCLE.length]}
                  onClick={() => setLocation(svc.href || '/')}
                />
              ))
            ) : !marketplace ? (
              <>
                <QuickActionCard title="Ask Your Kundli" icon={Sparkles} color="orange" onClick={() => setLocation('/ai-astrologer')} />
                <QuickActionCard title="My Charts" icon={User} color="purple" onClick={() => setLocation('/kundli')} />
                <QuickActionCard title="Reports" icon={FileText} color="green" onClick={() => setLocation('/reports')} />
                <QuickActionCard title="Panchang" icon={CalendarDays} color="navy" onClick={() => setLocation('/panchang')} />
              </>
            ) : (
              <>
                <QuickActionCard
                  title="Talk to Astrologer"
                  icon={Phone}
                  color="purple"
                  onClick={() => setLocation('/astrologers')}
                />
                <QuickActionCard
                  title="Chat with Astrologer"
                  icon={MessageCircle}
                  color="green"
                  onClick={() => setLocation('/astrologers')}
                />
                <QuickActionCard
                  title="AI Astrologer"
                  icon={Sparkles}
                  color="orange"
                  onClick={() => setLocation('/ai-astrologer')}
                />
                <QuickActionCard
                  title="Book Appointment"
                  icon={Calendar}
                  color="navy"
                  onClick={() => setLocation('/schedule')}
                />
              </>
            )}
          </div>
        </section>

        {/* Explore — marketplace services; the paused Connect row above covers the rest */}
        {marketplace && (
        <section className="mb-7 pt-1">
          <div className="px-4 md:px-8 lg:px-12">
            <SectionHeader title="Explore" showViewAll={false} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-4 md:px-8 lg:px-12">
            <QuickActionCard title="Live" icon={Radio} color="purple" onClick={() => setLocation('/live')} />
            <QuickActionCard title="Astromall" icon={ShoppingBag} color="orange" onClick={() => setLocation('/store')} />
            <QuickActionCard title="Reports" icon={FileText} color="green" onClick={() => setLocation('/reports')} />
            <QuickActionCard title="Book a Pooja" icon={Flame} color="navy" onClick={() => setLocation('/pooja')} />
            <QuickActionCard title="Panchang" icon={CalendarDays} color="purple" onClick={() => setLocation('/panchang')} />
          </div>
        </section>
        )}

        {/* Active Influences */}
        <section className="mb-7 px-4 md:px-8 lg:px-12">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <div>
              <SectionHeader
                title="Active Influences"
                subtitle="Current planetary periods in your chart"
                viewAllLink="/kundli"
              />
              <div className="space-y-3">
                <ActiveInfluences />
              </div>
            </div>
            <div className="yantra-card p-6">
              <p className="yantra-eyebrow">Today&apos;s Guidance</p>
              <h3 className="font-display mt-2 text-xl text-foreground">Guidance from your own chart</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                {latestChart
                  ? `See the evidence behind each area of ${latestChart.name}'s chart, and ask about it.`
                  : marketplace
                    ? 'Generate your kundli to unlock chart-specific guidance, stronger remedies, and better astrologer matching.'
                    : 'Generate your kundli to unlock chart-specific guidance and remedies.'}
              </p>
              <button
                onClick={() => setLocation(latestChart ? `/kundli/${latestChart.id}` : '/kundli/new')}
                className="mt-5 inline-flex items-center gap-2 rounded-[9px] bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
              >
                {latestChart ? 'Open Your Chart' : 'Create Your Chart'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Online Astrologers */}
        {marketplace && (
        <section className="mb-7 relative">
          <div className="px-4 md:px-8 lg:px-12">
            <SectionHeader
              title="Online Astrologers"
              subtitle="Trusted experts, vetted and verified"
              viewAllLink="/astrologers"
            />
          </div>
          <div className="flex md:grid md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto md:overflow-visible px-4 md:px-8 lg:px-12 pb-4 pt-2 scrollbar-hide snap-x snap-mandatory md:snap-none">
            {astrologersLoading && <LoadingSpinner />}
            {(astrologers || []).slice(0, 5).map((astrologer) => (
              <AstrologerCard
                key={astrologer.id}
                id={astrologer.id}
                name={astrologer.name}
                image={astrologer.profileImageUrl || ''}
                rating={astrologer.rating}
                experience={astrologer.experience}
                price={astrologer.pricePerMinute}
                specialization={astrologer.specializations?.[0] || 'Vedic Astrology'}
                isVerified={Boolean(astrologer.isVerified)}
                isOnline={isAstrologerAvailable(astrologer)}
              />
            ))}
          </div>
        </section>
        )}

      </div>
    </div>
  );
}
