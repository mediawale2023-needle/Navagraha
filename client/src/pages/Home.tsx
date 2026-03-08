import { useQuery } from '@tanstack/react-query';
import { Phone, MessageCircle, Sparkles, Flame, User, Wallet, LogOut } from 'lucide-react';
import { Link } from 'wouter';
import { MandalaBg, TextilePattern } from '@/components/decorative-patterns';
import { AstrologerCard } from '@/components/astrologer-card';
import { QuickActionCard } from '@/components/quick-action-card';
import { ZodiacWheel } from '@/components/zodiac-wheel';
import { RemedyCard } from '@/components/remedy-card';
import { HeroBanner } from '@/components/hero-banner';
import { SectionHeader } from '@/components/section-header';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { User as UserType, Astrologer } from '@shared/schema';

// Static remedies mock since we don't have a commerce endpoint yet
const remedies = [
  {
    title: "Gemstones",
    image: "https://images.unsplash.com/photo-1599643478524-fb66f70d00f7?w=500&auto=format&fit=crop&q=60&h=500",
    price: "₹999"
  },
  {
    title: "Rudraksha",
    image: "https://images.unsplash.com/photo-1605330838128-444743ec9801?w=500&auto=format&fit=crop&q=60&h=500",
    price: "₹499"
  },
  {
    title: "Yantra",
    image: "https://images.unsplash.com/photo-1601331792622-c3f25c7e19fc?w=500&auto=format&fit=crop&q=60&h=500",
    price: "₹799"
  },
  {
    title: "Pooja Services",
    image: "https://images.unsplash.com/photo-1594191370252-09d6c757c24f?w=500&auto=format&fit=crop&q=60&h=500",
    price: "₹1499"
  }
];

export default function Home() {
  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const { data: astrologers, isLoading: astrologersLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
  });

  const { data: wallet } = useQuery<{ balance: number }>({
    queryKey: ['/api/wallet'],
  });

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans relative overflow-x-hidden">
      {/* Background Patterns */}
      <MandalaBg className="absolute top-0 left-0 w-full h-[400px]" />
      <TextilePattern className="absolute top-[400px] left-0 w-full h-full" />

      {/* Content */}
      <div className="relative pb-20 max-w-7xl mx-auto">
        {/* Header */}
        <header className="pt-6 pb-4 px-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-bold text-3xl text-foreground mb-1 tracking-tight">
                Navagraha
              </h1>
              <div className="flex items-center gap-1.5 text-[var(--teal)] font-semibold text-xs tracking-wider uppercase">
                <Sparkles className="w-3.5 h-3.5 fill-[var(--turmeric)] text-[var(--turmeric)]" />
                <span>Nine Celestial Powers</span>
              </div>
            </div>

            {/* Wallet & Profile Controls inline with the header layout */}
            <div className="flex items-center gap-3">
              <Link href="/wallet">
                <button className="flex items-center gap-1.5 bg-foreground/5 rounded-full px-3 py-1.5 hover:bg-foreground/10 transition-colors">
                  <Wallet className="w-3.5 h-3.5 text-[var(--turmeric)]" />
                  <span className="font-bold text-foreground text-xs">₹{wallet?.balance || '0'}</span>
                </button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="focus:outline-none rounded-full overflow-hidden border-2 border-[var(--turmeric)]/30 hover:border-[var(--turmeric)] transition-colors">
                    <Avatar className="w-10 h-10 bg-gradient-to-br from-[var(--teal)] to-[var(--magenta)] text-white shadow-lg">
                      <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover" />
                      <AvatarFallback className="bg-transparent text-white font-bold text-lg">
                        {user?.firstName?.charAt(0) || <User className="w-4 h-4" />}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-foreground/10">
                  <div className="px-3 py-2">
                    <p className="text-sm font-bold text-foreground">{user?.firstName || 'Seeker'}</p>
                    <p className="text-xs text-foreground/40">{user?.email || ''}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-foreground/5" />
                  <Link href="/profile">
                    <DropdownMenuItem className="text-foreground/70 hover:text-foreground cursor-pointer">
                      <User className="w-4 h-4 mr-2" /> My Profile
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/wallet">
                    <DropdownMenuItem className="text-foreground/70 hover:text-foreground cursor-pointer">
                      <Wallet className="w-4 h-4 mr-2" /> Wallet
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator className="bg-foreground/5" />
                  <DropdownMenuItem
                    className="text-red-500 hover:text-red-600 cursor-pointer"
                    onClick={() => window.location.href = '/api/logout'}
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Greeting */}
          <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-foreground/5">
            <h2 className="font-bold text-2xl text-foreground mb-1">
              Namaste, {user?.firstName ? user.firstName.split(' ')[0] : 'Seeker'} 🙏
            </h2>
            <p className="text-foreground/70 text-sm font-medium">
              How can the stars guide you today?
            </p>
          </div>
        </header>

        <div className="px-4">
          <HeroBanner />
        </div>

        {/* Quick Actions */}
        <section className="mb-8">
          <SectionHeader title="Quick Actions" showViewAll={false} />
          <div className="grid grid-cols-2 gap-3 px-4">
            <QuickActionCard
              title="Talk to Astrologer"
              icon={Phone}
              color="teal"
            />
            <QuickActionCard
              title="Chat with Astrologer"
              icon={MessageCircle}
              color="magenta"
            />
            <QuickActionCard
              title="AI Astrologer"
              icon={Sparkles}
              color="yellow"
            />
            <QuickActionCard
              title="Book Pooja"
              icon={Flame}
              color="navy"
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
          <div className="flex gap-4 overflow-x-auto px-4 pb-4 scrollbar-hide snap-x snap-mandatory">
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

        {/* Daily Horoscope */}
        <section className="mb-8">
          <SectionHeader
            title="Daily Horoscope"
            subtitle="Know your Rashi predictions"
            showViewAll={false}
          />
          <ZodiacWheel />
        </section>

        {/* Remedies Marketplace */}
        <section className="mb-8">
          <SectionHeader
            title="Spiritual Remedies"
            subtitle="Sacred items for your well-being"
            viewAllLink="/store"
          />
          <div className="flex gap-4 overflow-x-auto px-4 pb-4 scrollbar-hide snap-x snap-mandatory">
            {remedies.map((remedy, index) => (
              <RemedyCard key={index} {...remedy} />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
