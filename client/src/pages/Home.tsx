import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ZodiacIcon } from '@/components/ZodiacIcon';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BottomNav } from '@/components/BottomNav';
import { Link } from 'wouter';
import {
  Sparkles, Star, Wallet, LogOut, User, Video,
  Phone, MessageCircle, Heart, TrendingUp,
  Activity, CheckCircle2, ChevronRight, Hash,
  Sun, Moon, Calendar, ArrowRight, X
} from 'lucide-react';
import type { User as UserType, Astrologer } from '@shared/schema';

const zodiacSigns = [
  'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

const QUICK_ACTIONS = [
  { href: '/astrologers', icon: MessageCircle, label: 'Chat' },
  { href: '/astrologers', icon: Phone, label: 'Call' },
  { href: '/kundli/new', icon: Sun, label: 'Kundli' },
  { href: '/kundli/matchmaking', icon: Heart, label: 'Match' },
  { href: '/schedule', icon: Calendar, label: 'Book' },
  { href: '/numerology', icon: Hash, label: 'Numbers' },
];

export default function Home() {
  const [selectedSign, setSelectedSign] = useState('aries');
  const [bannerIdx, setBannerIdx] = useState(0);

  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const { data: horoscope, isLoading: horoscopeLoading } = useQuery<{ prediction: string }>({
    queryKey: ['/api/horoscope', selectedSign],
  });

  const { data: astrologers, isLoading: astrologersLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
  });

  const { data: wallet } = useQuery<{ balance: number }>({
    queryKey: ['/api/wallet'],
  });

  useEffect(() => {
    const t = setInterval(() => setBannerIdx(prev => (prev + 1) % 3), 5000);
    return () => clearInterval(t);
  }, []);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  const onlineCount = astrologers?.filter(a => a.isOnline || a.availability === 'available').length || 0;

  const banners = [
    { title: "Today's Insight", subtitle: "Venus guides you toward love and creative flow. Open yourself to positive energy.", cta: 'Read More', href: '/astrologers' },
    { title: "Premium Plan", subtitle: "Get unlimited AI insights, priority booking, and exclusive content.", cta: 'Upgrade Plan', href: '/wallet' },
    { title: "Your Birth Chart", subtitle: "Discover your exact planetary positions and dashas for accurate predictions.", cta: 'Generate', href: '/kundli/new' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 md:pb-0 font-sans selection:bg-[#E27689]/30">

      {/* ─── Global Ambient Glows ─── */}
      <div className="fixed top-0 left-0 w-[50vw] h-[50vw] rounded-full bg-[#E27689]/5 blur-[100px] pointer-events-none mix-blend-screen" />
      <div className="fixed bottom-0 right-0 w-[50vw] h-[50vw] rounded-full bg-[#D4A853]/5 blur-[100px] pointer-events-none mix-blend-screen" />
      <div className="fixed inset-0 celestial-mesh opacity-30 pointer-events-none mix-blend-screen" />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 pt-2 pb-2 px-4 sm:px-6 lg:px-8 border-b border-white/[0.02]" style={{ background: 'rgba(10, 6, 15, 0.7)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link href="/profile">
              <Avatar className="w-10 h-10 cursor-pointer avatar-glow transition-transform hover:scale-105" data-testid="nav-link-profile">
                <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover" />
                <AvatarFallback className="gradient-primary text-white text-sm font-bold">
                  {user?.firstName?.charAt(0) || <User className="w-4 h-4" />}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div>
              <h2 className="font-bold text-white text-[15px] leading-tight flex items-center gap-1">
                {user?.firstName || 'Seeker'} <Sparkles className="w-3.5 h-3.5 text-[#D4A853]" />
              </h2>
              <p className="text-[11px] text-gray-400 font-medium">Welcome Back✨</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/wallet">
              <button className="flex items-center gap-2 glass-pill px-4 py-2 hover:bg-white/10 transition-colors" data-testid="nav-link-wallet">
                <div className="w-5 h-5 rounded-full bg-[#D4A853]/20 flex items-center justify-center">
                  <Wallet className="w-3 h-3 text-[#D4A853]" />
                </div>
                <span className="font-bold text-white text-sm">₹{wallet?.balance || '0'}</span>
              </button>
            </Link>
            <button
              onClick={() => window.location.href = '/api/logout'}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 relative z-10">

        {/* ─── Banner Carousel (True AstroNex Style) ────────────── */}
        <div className="mb-8 relative group">
          <Link href={banners[bannerIdx].href}>
            <div className="astronex-card overflow-hidden relative p-8 cursor-pointer transition-transform duration-500 hover:-translate-y-1 min-h-[220px] flex flex-col justify-end">
              {/* Dynamic Banner Backgrounds */}
              {bannerIdx === 0 && (
                <>
                  <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-[#E27689]/20 rounded-full blur-[60px]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-0" />
                  <Moon className="absolute top-6 right-6 w-24 h-24 text-[#E27689]/10" />
                </>
              )}
              {bannerIdx === 1 && (
                <>
                  <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-[#D4A853]/20 rounded-full blur-[60px]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-0" />
                  <Star className="absolute top-6 right-6 w-24 h-24 text-[#D4A853]/10" />
                </>
              )}
              {bannerIdx === 2 && (
                <>
                  <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-[#7B2FBE]/30 rounded-full blur-[60px]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-0" />
                  <Sun className="absolute w-64 h-64 top-[-20px] right-[-50px] opacity-10" />
                </>
              )}

              <div className="relative z-10 w-full mb-auto mt-4">
                <h3 className="text-white font-bold text-3xl mb-3 tracking-tight">{banners[bannerIdx].title}</h3>
                <p className="text-gray-300 text-sm max-w-[80%] leading-relaxed font-medium mb-6">{banners[bannerIdx].subtitle}</p>

                <div className="flex items-center justify-between">
                  <Button size="sm" className="gradient-primary text-white font-bold rounded-full px-6 h-10 shadow-lg glow-image hover:scale-105 transition-transform">
                    {banners[bannerIdx].cta}
                  </Button>

                  {bannerIdx === 0 && (
                    <div className="flex gap-2">
                      <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-xs">Aries</div>
                      <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-xs">Leo</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Link>

          <div className="flex justify-center gap-2 mt-4">
            {banners.map((_, i) => (
              <button key={i} onClick={() => setBannerIdx(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === bannerIdx ? 'bg-white w-6' : 'bg-white/20 w-1.5'}`}
              />
            ))}
          </div>
        </div>

        {/* ─── Popular Features Grid ───────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="font-bold text-xl text-white tracking-tight">Daily Cosmic Influence</h3>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
            {QUICK_ACTIONS.map(({ href, icon: Icon, label }) => (
              <Link key={label} href={href}>
                <div className="flex flex-col items-center gap-3 cursor-pointer group" data-testid={`card-quick-${label.toLowerCase().replace(/\s/g, '-')}`}>
                  <div className="w-16 h-16 rounded-[1.2rem] glass flex items-center justify-center group-hover:bg-[#E27689]/10 group-hover:border-[#E27689]/30 transition-all duration-300 group-hover:-translate-y-1">
                    <Icon className="w-6 h-6 text-[#E27689]" />
                  </div>
                  <span className="text-xs font-bold text-gray-400 text-center leading-tight group-hover:text-white transition-colors">
                    {label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ─── Daily Horoscope (Deep Dark Glass) ──────────────── */}
        <div className="mb-10 astronex-card overflow-hidden">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#D4A853]/10 flex items-center justify-center">
                <Sun className="w-4 h-4 text-[#D4A853]" />
              </div>
              <h3 className="font-bold text-xl text-white tracking-tight">Today</h3>
            </div>
            <span className="text-xs text-gray-500 font-medium bg-white/5 px-3 py-1 rounded-full">Select Sign</span>
          </div>

          <div className="px-6 py-4 overflow-x-auto scrollbar-hide flex gap-2">
            {zodiacSigns.map((sign) => (
              <button
                key={sign}
                onClick={() => setSelectedSign(sign)}
                className={`shrink-0 p-3 w-[72px] rounded-2xl transition-all flex flex-col items-center gap-2 ${selectedSign === sign
                    ? 'gradient-primary text-white shadow-lg glow-pink scale-105'
                    : 'glass hover:bg-white/10 text-gray-400'
                  }`}
                data-testid={`zodiac-${sign}`}
                title={sign.charAt(0).toUpperCase() + sign.slice(1)}
              >
                <ZodiacIcon sign={sign} className={`w-6 h-6 ${selectedSign === sign ? 'text-white' : 'text-[#D4A853]'}`} />
                <span className="text-[10px] font-bold capitalize leading-none tracking-wide">{sign.slice(0, 3)}</span>
              </button>
            ))}
          </div>

          <div className="px-6 pb-6">
            {horoscopeLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <div className="glass rounded-[1.5rem] p-6 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#E27689]/5 rounded-full blur-2xl" />
                <h4 className="font-bold text-white capitalize mb-4 text-lg flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#E27689]" />
                  {selectedSign} Insights
                </h4>
                <p className="text-[15px] text-gray-300 leading-relaxed font-medium mb-6">
                  {horoscope?.prediction || "Today brings new opportunities for growth. The cosmic energies encourage you to trust your intuition and embrace positive changes."}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Heart, label: 'Love', stars: 4, color: 'text-[#E27689]' },
                    { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-[#D4A853]' },
                    { icon: Activity, label: 'Health', stars: 4, color: 'text-green-400' },
                  ].map(({ icon: Icon, label, stars, color }) => (
                    <div key={label} className="bg-white/[0.02] rounded-[1rem] p-3 text-center border border-white/[0.02]">
                      <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                      <p className="text-xs font-bold text-gray-400 mb-2">{label}</p>
                      <div className="flex gap-1 justify-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-2 h-2 ${i < stars ? 'fill-[#D4A853] text-[#D4A853]' : 'text-white/10'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Popular Astrologers ───────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4 px-2">
            <div>
              <h3 className="font-bold text-xl text-white tracking-tight">Popular Astrologers</h3>
              <p className="text-sm text-gray-500 font-medium">Connect with top-tier verified guides</p>
            </div>
            <Link href="/astrologers">
              <Button variant="ghost" className="text-[#D4A853] hover:text-[#FFD375] hover:bg-white/5 font-bold gap-1 px-4 rounded-full">
                See all <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {astrologersLoading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {astrologers?.slice(0, 6).map((astrologer) => (
                <div
                  key={astrologer.id}
                  className="astronex-card p-5 group hover:-translate-y-1 transition-transform duration-500"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="flex gap-4">
                    <div className="relative shrink-0">
                      <Avatar className="w-16 h-16 rounded-2xl avatar-glow">
                        <AvatarImage src={astrologer.profileImageUrl || undefined} className="object-cover" />
                        <AvatarFallback className="gradient-primary text-white font-bold text-xl">
                          {astrologer.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {(astrologer.isOnline || astrologer.availability === 'available') && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#1A1A1A]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <h4 className="font-bold text-base text-white truncate">{astrologer.name}</h4>
                        {astrologer.isVerified && <CheckCircle2 className="w-4 h-4 text-[#D4A853] shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 font-medium truncate mb-2">
                        {astrologer.specializations?.slice(0, 2).join(', ') || 'Vedic, Numerology'}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-[#D4A853] text-[#D4A853]" />
                          <span className="text-xs font-bold text-gray-200">{astrologer.rating || '4.9'}</span>
                        </div>
                        <span className="text-gray-600 text-xs">&bull;</span>
                        <span className="text-xs font-medium text-gray-400">{astrologer.experience || 10}y exp</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-5 border-t border-white/[0.03] flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-[#D4A853]">₹{astrologer.pricePerMinute || '25'}</span>
                      <span className="text-xs text-gray-500 font-medium">/min</span>
                    </div>
                    <Link href={`/chat/${astrologer.id}`}>
                      <Button className="glass-pill-active text-white font-bold h-9 px-5 hover:scale-105 transition-transform" data-testid={`button-chat-${astrologer.id}`}>
                        Connect
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Spacing for bottom nav */}
      <div className="h-20" />
      <BottomNav />
    </div>
  );
}
