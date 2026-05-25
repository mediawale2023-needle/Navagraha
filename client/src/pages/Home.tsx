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
    <div className="min-h-screen bg-background font-sans relative overflow-x-hidden">
      {/* Content */}
      <div className="relative pb-24 md:pb-8 w-full max-w-7xl mx-auto">
        {/* Header */}
        <header className="pt-5 pb-3 px-4 md:px-8 lg:px-12">
          <div className="flex items-center justify-between mb-5">
            <div className="md:hidden">
              <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                Navagraha
              </h1>
              <div className="flex items-center gap-1.5 text-nava-royal-purple font-medium text-xs">
                <Sparkles className="w-3 h-3" />
                <span>Ancient Wisdom, Clear Guidance</span>
              </div>
            </div>

            {/* Profile Dropdown */}
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-10 h-10 rounded-full bg-nava-lavender flex items-center justify-center hover:bg-nava-lavender/80 transition-colors">
                    <User className="w-5 h-5 text-nava-royal-purple" />
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
              subtitle="How can the stars guide you today?"
              className="h-full rounded-2xl p-5"
            />
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Wallet</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">₹{balance.toFixed(0)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Ready for chats, calls, and reports</p>
                </div>
                <div className="rounded-2xl bg-nava-lavender p-3">
                  <Wallet className="w-5 h-5 text-nava-royal-purple" />
                </div>
              </div>
              <button
                onClick={() => setLocation('/wallet')}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-nava-royal-purple"
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
              title={cmsBanner?.title}
              subtitle={cmsBanner?.subtitle ?? undefined}
              cta={cmsBanner?.cta ?? undefined}
              href={cmsBanner?.href ?? undefined}
              className="h-full rounded-[1.75rem] p-6"
            />
            <div className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Today</p>
              <h2 className="mt-2 text-xl font-bold text-foreground">Move with clarity</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your strongest next step is a quick reading, a fresh chart, or a scheduled expert session.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setLocation('/kundli/new')}
                  className="rounded-2xl bg-muted px-4 py-4 text-left transition-colors hover:bg-accent"
                >
                  <p className="text-sm font-semibold text-foreground">Create chart</p>
                  <p className="mt-1 text-xs text-muted-foreground">Get your kundli</p>
                </button>
                <button
                  onClick={() => setLocation('/astrologers')}
                  className="rounded-2xl bg-muted px-4 py-4 text-left transition-colors hover:bg-accent"
                >
                  <p className="text-sm font-semibold text-foreground">Talk live</p>
                  <p className="mt-1 text-xs text-muted-foreground">Browse astrologers</p>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions - 2x2 Grid */}
        <section className="mb-7 pt-1">
          <div className="px-4 md:px-8 lg:px-12">
            <SectionHeader title="Quick Actions" showViewAll={false} />
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
            <div className="rounded-[1.75rem] border border-nava-royal-purple/15 bg-gradient-to-br from-card via-card to-nava-lavender/35 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Today&apos;s Guidance</p>
              <h3 className="mt-2 text-xl font-bold text-foreground">A grounded day for action</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Generate your kundli to unlock chart-specific guidance, stronger remedies, and better astrologer matching.
              </p>
              <button
                onClick={() => setLocation('/kundli/new')}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-nava-royal-purple px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-nava-royal-purple/90"
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
              subtitle="Connect instantly with experts"
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
