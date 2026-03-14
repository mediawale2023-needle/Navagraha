import { useQuery } from '@tanstack/react-query';
import { Phone, MessageCircle, Sparkles, Flame, User, Wallet, LogOut, Star, ArrowRight } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { User as UserType, Astrologer } from '@shared/schema';

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

      {/* ── Mobile Header (hidden on desktop — Navbar handles it) ── */}
      <header className="relative pt-6 pb-4 px-4 md:hidden">
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

        {/* Mobile Greeting */}
        <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-foreground/5">
          <h2 className="font-bold text-2xl text-foreground mb-1">
            Namaste, {user?.firstName ? user.firstName.split(' ')[0] : 'Seeker'} 🙏
          </h2>
          <p className="text-foreground/70 text-sm font-medium">
            How can the stars guide you today?
          </p>
        </div>
      </header>

      {/* ── Desktop Greeting Banner (hidden on mobile) ── */}
      <div className="hidden md:block relative px-6 lg:px-8 pt-8 pb-2 max-w-7xl mx-auto">
        <div className="astronex-card px-8 py-6 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-3xl text-foreground mb-1">
              Namaste, {user?.firstName ? user.firstName.split(' ')[0] : 'Seeker'} 🙏
            </h2>
            <p className="text-foreground/60 text-base font-medium">
              How can the stars guide you today?
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/wallet">
              <button className="flex items-center gap-2 glass-pill px-5 py-2.5 hover:bg-foreground/10 transition-colors cursor-pointer">
                <Wallet className="w-4 h-4 text-[var(--turmeric)]" />
                <span className="font-bold text-foreground text-sm">₹{wallet?.balance ?? 0}</span>
              </button>
            </Link>
            <Link href="/schedule">
              <Button className="gradient-primary text-white font-bold rounded-full px-5 h-10 text-sm glow-image hover:scale-105 transition-transform">
                Schedule Reading
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="relative max-w-7xl mx-auto">

        {/* Hero Banner */}
        <div className="px-4 md:px-6 lg:px-8 mt-4">
          <HeroBanner />
        </div>

        {/* ── Desktop Two-Column Layout ── */}
        <div className="md:grid md:grid-cols-3 md:gap-8 px-4 md:px-6 lg:px-8 mt-6">

          {/* Left Column — Quick Actions & Remedies */}
          <div className="md:col-span-1 space-y-6">

            {/* Quick Actions */}
            <section>
              <SectionHeader title="Quick Actions" showViewAll={false} />
              <div className="grid grid-cols-2 gap-3">
                <QuickActionCard title="Talk to Astrologer" icon={Phone} color="teal" />
                <QuickActionCard title="Chat with Astrologer" icon={MessageCircle} color="magenta" />
                <QuickActionCard title="AI Astrologer" icon={Sparkles} color="yellow" />
                <QuickActionCard title="Book Pooja" icon={Flame} color="navy" />
              </div>
            </section>

            {/* Remedies — vertical list on desktop */}
            <section className="hidden md:block">
              <SectionHeader
                title="Spiritual Remedies"
                subtitle="Sacred items for your well-being"
                viewAllLink="/store"
              />
              <div className="grid grid-cols-2 gap-3">
                {remedies.map((remedy, index) => (
                  <RemedyCard key={index} {...remedy} />
                ))}
              </div>
            </section>
          </div>

          {/* Right Column — Astrologers & Horoscope */}
          <div className="md:col-span-2 space-y-6 mt-6 md:mt-0">

            {/* Online Astrologers */}
            <section>
              <SectionHeader
                title="Online Astrologers"
                subtitle="Connect instantly with experts"
                viewAllLink="/astrologers"
              />
              {/* Mobile: horizontal scroll */}
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory md:hidden">
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
              {/* Desktop: grid */}
              <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-5 pt-6">
                {astrologersLoading && <LoadingSpinner />}
                {(astrologers || []).slice(0, 6).map((astrologer) => (
                  <Link key={astrologer.id} href={`/astrologers/${astrologer.id}`}>
                    <div className="astronex-card p-4 flex flex-col group hover:-translate-y-1 transition-all cursor-pointer">
                      <div className="flex gap-3 items-center mb-3">
                        <div className="relative shrink-0">
                          <Avatar className="w-14 h-14 rounded-2xl avatar-glow">
                            <AvatarFallback className="gradient-primary text-white font-bold text-xl rounded-2xl">
                              {astrologer.name?.charAt(0) || 'A'}
                            </AvatarFallback>
                            {astrologer.profileImageUrl && (
                              <img
                                src={astrologer.profileImageUrl}
                                alt={astrologer.name}
                                className="absolute inset-0 w-full h-full object-cover rounded-2xl"
                              />
                            )}
                          </Avatar>
                          {(astrologer.isOnline || astrologer.availability === 'available') && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-background" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm text-foreground truncate group-hover:text-[var(--primary)] transition-colors">
                            {astrologer.name}
                          </h3>
                          <p className="text-[11px] text-[var(--teal)] font-medium truncate">
                            {astrologer.specializations?.slice(0, 2).join(', ') || 'Vedic Astrology'}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-foreground/50 mt-0.5">
                            <Star className="w-3 h-3 fill-[var(--turmeric)] text-[var(--turmeric)]" />
                            <span className="font-semibold">{astrologer.rating || '4.9'}</span>
                            <span className="text-foreground/20">·</span>
                            <span>{astrologer.experience || 8}y exp</span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-foreground/5 flex items-center justify-between">
                        <span className="font-bold text-[var(--turmeric)] text-sm">
                          ₹{astrologer.pricePerMinute || 25}<span className="text-foreground/40 font-normal text-xs">/min</span>
                        </span>
                        <Link href={`/chat/${astrologer.id}`}>
                          <Button
                            size="sm"
                            className="glass-pill-active text-[var(--magenta)] font-bold h-8 px-4 text-xs hover:scale-105 transition-transform"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Connect
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {/* View all link on desktop */}
              <div className="hidden md:flex justify-center mt-4">
                <Link href="/astrologers">
                  <Button variant="ghost" className="glass-pill text-[var(--magenta)] hover:text-foreground px-6 h-10 text-sm">
                    View All Astrologers <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </section>

            {/* Daily Horoscope */}
            <section>
              <SectionHeader
                title="Daily Horoscope"
                subtitle="Know your Rashi predictions"
                showViewAll={false}
              />
              <ZodiacWheel />
            </section>

          </div>
        </div>

        {/* Remedies — mobile horizontal scroll (hidden on desktop) */}
        <section className="mb-8 md:hidden">
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

        {/* Bottom spacing on desktop */}
        <div className="h-10 hidden md:block" />
      </div>
    </div>
  );
}
