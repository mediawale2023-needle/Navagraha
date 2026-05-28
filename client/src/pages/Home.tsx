import { useQuery } from '@tanstack/react-query';
import { type LucideIcon, Phone, MessageCircle, Calendar, Sparkles, User, Wallet, LogOut, ArrowRight, Radio, ShoppingBag, FileText, Flame, CalendarDays } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { QuickActionCard } from '@/components/QuickActionCard';
import { HeroBanner } from '@/components/HeroBanner';
import { SectionHeader } from '@/components/SectionHeader';
import { GreetingCard } from '@/components/GreetingCard';
import { ActiveInfluenceCard } from '@/components/ActiveInfluenceCard';
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

  const { data: astrologers, isLoading: astrologersLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
  });

  const { data: wallet } = useQuery<{ balance: number }>({
    queryKey: ['/api/wallet'],
  });

  const { data: cmsContent } = useQuery<CmsHomepageContent>({
    queryKey: ['/api/homepage-content'],
  });

  const cmsBanner = cmsContent?.banners?.[0];
  const cmsServices = cmsContent?.services ?? [];
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
                    className="text-nava-burgundy cursor-pointer"
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
              subtitle="Saturn turns benefic on Thursday. Move on the conversation you&apos;ve been postponing."
              className="h-full"
            />
            <div className="yantra-card h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="yantra-eyebrow">Wallet</p>
                  <p className="font-display mt-2 text-3xl text-foreground">₹{balance.toFixed(0)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Ready for chats, calls, and reports</p>
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
              subtitle={cmsBanner?.subtitle ?? 'Kundli, personalised guidance, and expert consultations.'}
              cta={cmsBanner?.cta ?? 'Generate kundli'}
              href={cmsBanner?.href ?? undefined}
              className="h-full"
            />
            <div className="yantra-card-dark p-5">
              <p className="yantra-eyebrow text-primary/75">Today&apos;s dasha</p>
              <h2 className="font-display mt-2 text-2xl text-primary">Mars</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Mahadasha in motion. Good for courage, work, and clear action. Avoid impulsive decisions.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setLocation('/kundli/new')}
                  className="rounded-[9px] bg-primary px-4 py-4 text-left text-primary-foreground transition-colors hover:opacity-90"
                >
                  <p className="font-display text-sm">Create chart</p>
                  <p className="mt-1 text-xs text-primary-foreground/75">Get your kundli</p>
                </button>
                <button
                  onClick={() => setLocation('/astrologers')}
                  className="rounded-[9px] border border-primary/40 bg-transparent px-4 py-4 text-left transition-colors hover:bg-white/5"
                >
                  <p className="font-display text-sm text-primary">Talk live</p>
                  <p className="mt-1 text-xs text-primary/70">Browse astrologers</p>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions - 2x2 Grid */}
        <section className="mb-7 pt-1">
          <div className="px-4 md:px-8 lg:px-12">
            <SectionHeader title="Connect" showViewAll={false} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-8 lg:px-12 xl:grid-cols-4">
            {cmsServices.length > 0 ? (
              cmsServices.map((svc, i) => (
                <QuickActionCard
                  key={svc.id}
                  title={svc.title}
                  icon={ICON_MAP[svc.icon ?? ''] ?? Sparkles}
                  color={COLOR_CYCLE[i % COLOR_CYCLE.length]}
                  onClick={() => setLocation(svc.href || '/')}
                />
              ))
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

        {/* Explore */}
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

        {/* Active Influences */}
        <section className="mb-7 px-4 md:px-8 lg:px-12">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <div>
              <SectionHeader
                title="Active Influences"
                subtitle="Current planetary periods affecting you"
                viewAllLink="/kundli/new"
              />
              <div className="space-y-3">
                <ActiveInfluenceCard
                  title="Mars Mahadasha"
                  description="High energy period. Focus on career and ambition. Watch for impulsiveness."
                  type="dasha"
                  severity="medium"
                  endDate="Mar 2027"
                  linkTo="/kundli/new"
                />
                <ActiveInfluenceCard
                  title="Saturn Transit 12th House"
                  description="Time for rest and spiritual growth. Avoid major decisions."
                  type="transit"
                  severity="low"
                  endDate="Jan 2026"
                  linkTo="/kundli/new"
                />
              </div>
            </div>
            <div className="yantra-card p-6">
              <p className="yantra-eyebrow">Today&apos;s Guidance</p>
              <h3 className="font-display mt-2 text-xl text-foreground">A grounded day for action</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Generate your kundli to unlock chart-specific guidance, stronger remedies, and better astrologer matching.
              </p>
              <button
                onClick={() => setLocation('/kundli/new')}
                className="mt-5 inline-flex items-center gap-2 rounded-[9px] bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
              >
                Create Your Chart
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Online Astrologers */}
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
                rating={astrologer.rating ? Number(astrologer.rating) : 4.9}
                experience={astrologer.experience || 10}
                price={astrologer.pricePerMinute ? Number(astrologer.pricePerMinute) : 25}
                specialization={astrologer.specializations?.[0] || 'Vedic Astrology'}
                isOnline={astrologer.isOnline || astrologer.availability === 'available'}
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
