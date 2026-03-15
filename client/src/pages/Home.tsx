import { useQuery } from '@tanstack/react-query';
import { Phone, MessageCircle, Sparkles, Flame, User, Wallet, LogOut } from 'lucide-react';
import { Link, useLocation } from 'wouter';
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
      <div className="relative pb-24 max-w-lg mx-auto">
        {/* Header */}
        <header className="pt-6 pb-4 px-4">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="font-bold text-2xl text-foreground tracking-tight">
                Navagraha
              </h1>
              <div className="flex items-center gap-1.5 text-nava-teal font-medium text-xs">
                <Sparkles className="w-3 h-3 fill-nava-amber text-nava-amber" />
                <span>Nine Celestial Powers</span>
              </div>
            </div>

            {/* Profile Saturn Icon */}
            <div className="flex items-center gap-3">
              <Link href="/wallet">
                <button className="flex items-center gap-1.5 bg-card rounded-full px-3 py-1.5 hover:bg-card/80 transition-colors shadow-sm border border-border/50">
                  <Wallet className="w-3.5 h-3.5 text-nava-amber" />
                  <span className="font-bold text-foreground text-xs">₹{wallet?.balance || '0'}</span>
                </button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-10 h-10 rounded-full bg-nava-amber/20 flex items-center justify-center hover:bg-nava-amber/30 transition-colors">
                    <img 
                      src="https://em-content.zobj.net/source/apple/391/ringed-planet_1fa90.png" 
                      alt="Saturn" 
                      className="w-6 h-6"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                  <div className="px-3 py-2">
                    <p className="text-sm font-bold text-foreground">{user?.firstName || 'Seeker'}</p>
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
                    className="text-destructive cursor-pointer"
                    onClick={() => window.location.href = '/api/logout'}
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Greeting Card */}
          <div className="bg-card rounded-2xl p-4 shadow-sm border border-border/50">
            <h2 className="font-bold text-xl text-foreground mb-1">
              Namaste, {user?.firstName ? user.firstName.split(' ')[0] : 'Seeker'} 🙏
            </h2>
            <p className="text-muted-foreground text-sm">
              How can the stars guide you today?
            </p>
          </div>
        </header>

        <div className="px-4">
          <HeroBanner />
        </div>

        {/* Quick Actions - 2x2 Grid */}
        <section className="mb-8">
          <SectionHeader title="Quick Actions" showViewAll={false} />
          <div className="grid grid-cols-2 gap-3 px-4">
            <QuickActionCard
              title="Talk to Astrologer"
              icon={Phone}
              color="teal"
              onClick={() => setLocation('/astrologers')}
            />
            <QuickActionCard
              title="Chat with Astrologer"
              icon={MessageCircle}
              color="magenta"
              onClick={() => setLocation('/astrologers')}
            />
            <QuickActionCard
              title="AI Astrologer"
              icon={Sparkles}
              color="amber"
              onClick={() => setLocation('/ai-astrologer')}
            />
            <QuickActionCard
              title="Book A Pooja"
              icon={Flame}
              color="navy"
              onClick={() => setLocation('/store')}
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
          <div className="flex gap-4 overflow-x-auto px-4 pb-4 pt-10 scrollbar-hide snap-x snap-mandatory">
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
