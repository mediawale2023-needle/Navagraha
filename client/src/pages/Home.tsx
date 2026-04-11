import { useQuery } from '@tanstack/react-query';
import { type LucideIcon, Phone, MessageCircle, Calendar, Sparkles, User, Wallet, LogOut } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { QuickActionCard } from '@/components/QuickActionCard';
import { HeroBanner } from '@/components/HeroBanner';
import { SectionHeader } from '@/components/SectionHeader';
import { GreetingCard } from '@/components/GreetingCard';
import { ActiveInfluenceCard } from '@/components/ActiveInfluenceCard';
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
        <header className="pt-6 pb-4 px-4 md:px-8 lg:px-12">
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

          {/* Greeting Card */}
          <GreetingCard
            userName={user?.firstName ? user.firstName.split(' ')[0] : 'Seeker'}
            subtitle="How can the stars guide you today?"
          />
        </header>

        <div className="px-4 md:px-8 lg:px-12">
          <HeroBanner
            title={cmsBanner?.title}
            subtitle={cmsBanner?.subtitle ?? undefined}
            cta={cmsBanner?.cta ?? undefined}
            href={cmsBanner?.href ?? undefined}
          />
        </div>

        {/* Quick Actions - 2x2 Grid */}
        <section className="mb-8">
          <SectionHeader title="Quick Actions" showViewAll={false} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-8 lg:px-12">
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
                  onClick={() => setLocation('/chat/ai-astrologer')}
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

        {/* Active Influences */}
        <section className="mb-8 px-4 md:px-8 lg:px-12">
          <SectionHeader
            title="Active Influences"
            subtitle="Current planetary periods affecting you"
            viewAllLink="/dashas"
          />
          <div className="space-y-3">
            <ActiveInfluenceCard
              title="Mars Mahadasha"
              description="High energy period. Focus on career and ambition. Watch for impulsiveness."
              type="dasha"
              severity="medium"
              endDate="Mar 2027"
              linkTo="/dashas"
            />
            <ActiveInfluenceCard
              title="Saturn Transit 12th House"
              description="Time for rest and spiritual growth. Avoid major decisions."
              type="transit"
              severity="low"
              endDate="Jan 2026"
              linkTo="/transits"
            />
          </div>
        </section>

        {/* Online Astrologers */}
        <section className="mb-8 relative">
          <SectionHeader
            title="Online Astrologers"
            subtitle="Connect instantly with experts"
            viewAllLink="/astrologers"
          />
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

        {/* Daily Guidance Placeholder */}
        <section className="mb-8 px-4 md:px-8 lg:px-12">
          <SectionHeader
            title="Today's Guidance"
            subtitle="Cosmic weather for your chart"
            showViewAll={false}
          />
          <div className="bg-nava-lavender/30 border border-nava-royal-purple/20 rounded-xl p-8 text-center">
            <p className="text-muted-foreground text-sm">
              Generate your Kundli to see personalized daily guidance
            </p>
            <button
              onClick={() => setLocation('/kundli/new')}
              className="mt-3 text-nava-royal-purple text-sm font-medium hover:underline"
            >
              Create Your Chart →
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}

// Keep existing AstrologerCard import
export { AstrologerCard } from '@/components/astrologer-card';
