import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ZodiacIcon } from '@/components/ZodiacIcon';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Link } from 'wouter';
import {
  Sparkles, Star, Wallet, LogOut, User, Video,
  Phone, MessageCircle, Heart, TrendingUp,
  Activity, CheckCircle2, ChevronRight, Hash,
  Sun, Moon, Calendar, ArrowRight
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
    queryKey: ['/api/horoscope/daily', selectedSign],
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

  const banners = [
    { title: "Today's Insight", subtitle: "Venus guides you toward love and creative flow. Open yourself to positive energy.", cta: 'Read More', href: '/astrologers' },
    { title: "Premium Plan", subtitle: "Get unlimited AI insights, priority booking, and exclusive content.", cta: 'Upgrade Plan', href: '/wallet' },
    { title: "Your Birth Chart", subtitle: "Discover your exact planetary positions and dashas for accurate predictions.", cta: 'Generate', href: '/kundli/new' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">

      {/* ─── Ambient Glows ─── */}
      <div className="fixed top-0 left-0 w-[45vw] h-[45vw] rounded-full bg-[var(--rose)]/[0.04] blur-[100px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[45vw] h-[45vw] rounded-full bg-[var(--gold)]/[0.03] blur-[100px] pointer-events-none" />
      <div className="fixed inset-0 celestial-mesh opacity-20 pointer-events-none" />

      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 header-glass">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14 px-4 sm:px-6 lg:px-8">
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
              <h2 className="font-bold text-white text-[15px] leading-tight flex items-center gap-1.5">
                {user?.firstName || 'Seeker'} <Sparkles className="w-3.5 h-3.5 text-[var(--gold)]" />
              </h2>
              <p className="text-[11px] text-white/40 font-medium">Welcome Back ✨</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/wallet">
              <button className="flex items-center gap-2 glass-pill px-4 py-2 hover:bg-white/10 transition-colors" data-testid="nav-link-wallet">
                <div className="w-5 h-5 rounded-full bg-[var(--gold)]/20 flex items-center justify-center">
                  <Wallet className="w-3 h-3 text-[var(--gold)]" />
                </div>
                <span className="font-bold text-white text-sm">₹{wallet?.balance || '0'}</span>
              </button>
            </Link>
            <button
              onClick={() => window.location.href = '/api/logout'}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 text-white/30" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 relative z-10">

        {/* ─── Banner Carousel ─── */}
        <div className="mb-8 relative">
          <Link href={banners[bannerIdx].href}>
            <div className={`relative overflow-hidden rounded-3xl cursor-pointer transition-all duration-500 hover:-translate-y-0.5 min-h-[190px] flex flex-col justify-center p-7 sm:p-8 ${bannerIdx === 0 ? 'bg-gradient-to-br from-[#8B2252] via-[#C0506A] to-[#D4847A]'
                : bannerIdx === 1 ? 'bg-gradient-to-br from-[#8B2252] via-[#C0506A] to-[#D4847A]'
                  : 'bg-gradient-to-br from-[#4A1A6B] via-[#6B3FA0] to-[#8B6CC1]'
              }`}>

              {/* Zodiac Wheel Illustration */}
              <svg
                className="absolute right-[-30px] sm:right-[-10px] top-1/2 -translate-y-1/2 w-[220px] h-[220px] sm:w-[260px] sm:h-[260px] text-white/[0.12]"
                viewBox="0 0 200 200"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
              >
                {/* Outer ring */}
                <circle cx="100" cy="100" r="95" />
                <circle cx="100" cy="100" r="80" />
                <circle cx="100" cy="100" r="55" />
                <circle cx="100" cy="100" r="30" />
                {/* Cross lines */}
                <line x1="100" y1="5" x2="100" y2="195" />
                <line x1="5" y1="100" x2="195" y2="100" />
                {/* Diagonal lines */}
                <line x1="30" y1="30" x2="170" y2="170" />
                <line x1="170" y1="30" x2="30" y2="170" />
                {/* 30° segment lines */}
                <line x1="100" y1="5" x2="100" y2="195" />
                <line x1="147" y1="13" x2="53" y2="187" />
                <line x1="187" y1="53" x2="13" y2="147" />
                <line x1="195" y1="100" x2="5" y2="100" />
                <line x1="187" y1="147" x2="13" y2="53" />
                <line x1="147" y1="187" x2="53" y2="13" />
                {/* Zodiac symbols (simplified as text) */}
                <text x="97" y="22" fontSize="9" fill="currentColor" fontFamily="serif">♈</text>
                <text x="130" y="32" fontSize="9" fill="currentColor" fontFamily="serif">♉</text>
                <text x="172" y="62" fontSize="9" fill="currentColor" fontFamily="serif">♊</text>
                <text x="182" y="103" fontSize="9" fill="currentColor" fontFamily="serif">♋</text>
                <text x="172" y="145" fontSize="9" fill="currentColor" fontFamily="serif">♌</text>
                <text x="130" y="178" fontSize="9" fill="currentColor" fontFamily="serif">♍</text>
                <text x="93" y="190" fontSize="9" fill="currentColor" fontFamily="serif">♎</text>
                <text x="58" y="178" fontSize="9" fill="currentColor" fontFamily="serif">♏</text>
                <text x="17" y="145" fontSize="9" fill="currentColor" fontFamily="serif">♐</text>
                <text x="7" y="103" fontSize="9" fill="currentColor" fontFamily="serif">♑</text>
                <text x="17" y="62" fontSize="9" fill="currentColor" fontFamily="serif">♒</text>
                <text x="58" y="32" fontSize="9" fill="currentColor" fontFamily="serif">♓</text>
                {/* Constellation dots */}
                <circle cx="120" cy="60" r="1.5" fill="currentColor" opacity="0.5" />
                <circle cx="140" cy="75" r="1" fill="currentColor" opacity="0.4" />
                <circle cx="130" cy="50" r="1" fill="currentColor" opacity="0.3" />
                <circle cx="155" cy="90" r="1.5" fill="currentColor" opacity="0.4" />
                <circle cx="145" cy="110" r="1" fill="currentColor" opacity="0.3" />
                <circle cx="160" cy="130" r="1.5" fill="currentColor" opacity="0.5" />
                <circle cx="135" cy="145" r="1" fill="currentColor" opacity="0.4" />
                {/* Connect constellation dots */}
                <polyline points="120,60 140,75 155,90 145,110" strokeWidth="0.3" opacity="0.3" />
                <polyline points="130,50 120,60 140,75" strokeWidth="0.3" opacity="0.3" />
                <polyline points="155,90 160,130 135,145" strokeWidth="0.3" opacity="0.3" />
              </svg>

              {/* Soft glow overlay at bottom-left */}
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/[0.04] rounded-full blur-[50px]" />

              <div className="relative z-10 max-w-[65%] sm:max-w-[60%]">
                <h3 className="text-white font-bold text-2xl sm:text-3xl mb-2.5 tracking-tight leading-tight">{banners[bannerIdx].title}</h3>
                <p className="text-white/75 text-sm leading-relaxed font-medium mb-5">{banners[bannerIdx].subtitle}</p>
                <button className="bg-[#1a1a1a]/80 hover:bg-[#1a1a1a] text-white font-bold text-sm rounded-full px-6 py-2.5 transition-all hover:scale-105 shadow-lg">
                  {banners[bannerIdx].cta}
                </button>
              </div>
            </div>
          </Link>

          <div className="flex justify-center gap-2 mt-4">
            {banners.map((_, i) => (
              <button key={i} onClick={() => setBannerIdx(i)}
                className={`h-1 rounded-full transition-all duration-300 ${i === bannerIdx ? 'bg-white/80 w-6' : 'bg-white/15 w-1.5'}`}
              />
            ))}
          </div>
        </div>

        {/* ─── Quick Actions Grid ─── */}
        <div className="mb-10">
          <h3 className="font-bold text-lg text-white tracking-tight mb-4 px-1">Daily Cosmic Influence</h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
            {QUICK_ACTIONS.map(({ href, icon: Icon, label }) => (
              <Link key={label} href={href}>
                <div className="flex flex-col items-center gap-2.5 cursor-pointer group" data-testid={`card-quick-${label.toLowerCase().replace(/\s/g, '-')}`}>
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl glass flex items-center justify-center group-hover:bg-[var(--rose)]/10 group-hover:border-[var(--rose)]/20 transition-all duration-300 group-hover:-translate-y-1">
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--rose)]" />
                  </div>
                  <span className="text-[11px] font-semibold text-white/40 text-center leading-tight group-hover:text-white/70 transition-colors">
                    {label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ─── Daily Horoscope ─── */}
        <div className="mb-10 astronex-card overflow-hidden">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--gold)]/10 flex items-center justify-center">
                <Sun className="w-4 h-4 text-[var(--gold)]" />
              </div>
              <h3 className="font-bold text-lg text-white tracking-tight">Today</h3>
            </div>
            <span className="text-[11px] text-white/30 font-medium bg-white/[0.03] px-3 py-1 rounded-full">Select Sign</span>
          </div>

          <div className="px-6 py-4 overflow-x-auto scrollbar-hide flex gap-2">
            {zodiacSigns.map((sign) => (
              <button
                key={sign}
                onClick={() => setSelectedSign(sign)}
                className={`shrink-0 p-3 w-[68px] rounded-2xl transition-all flex flex-col items-center gap-2 ${selectedSign === sign
                  ? 'gradient-primary text-white shadow-lg glow-pink scale-105'
                  : 'glass hover:bg-white/[0.06] text-white/45'
                  }`}
                data-testid={`zodiac-${sign}`}
                title={sign.charAt(0).toUpperCase() + sign.slice(1)}
              >
                <ZodiacIcon sign={sign} className={`w-5 h-5 ${selectedSign === sign ? 'text-white' : 'text-[var(--gold)]'}`} />
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
              <div className="glass rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-28 h-28 bg-[var(--rose)]/[0.04] rounded-full blur-2xl" />
                <h4 className="font-bold text-white capitalize mb-4 text-base flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--rose)]" />
                  {selectedSign} Insights
                </h4>
                <p className="text-sm text-white/60 leading-relaxed font-medium mb-6">
                  {horoscope?.prediction || "Today brings new opportunities for growth. The cosmic energies encourage you to trust your intuition and embrace positive changes."}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Heart, label: 'Love', stars: 4, color: 'text-[var(--rose)]' },
                    { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-[var(--gold)]' },
                    { icon: Activity, label: 'Health', stars: 4, color: 'text-emerald-400' },
                  ].map(({ icon: Icon, label, stars, color }) => (
                    <div key={label} className="bg-white/[0.02] rounded-xl p-3 text-center border border-white/[0.03]">
                      <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                      <p className="text-[11px] font-semibold text-white/35 mb-2">{label}</p>
                      <div className="flex gap-0.5 justify-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-2.5 h-2.5 ${i < stars ? 'fill-[var(--gold)] text-[var(--gold)]' : 'text-white/10'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Popular Astrologers ─── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-5 px-1">
            <div>
              <h3 className="font-bold text-lg text-white tracking-tight">Popular Astrologers</h3>
              <p className="text-xs text-white/30 font-medium mt-0.5">Connect with top-tier verified guides</p>
            </div>
            <Link href="/astrologers">
              <Button variant="ghost" className="text-[var(--gold)] hover:text-[var(--gold)] hover:bg-white/5 font-bold gap-1 px-4 rounded-full text-sm">
                See all <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {astrologersLoading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {astrologers?.slice(0, 6).map((astrologer) => (
                <div
                  key={astrologer.id}
                  className="astronex-card p-5 group hover:-translate-y-0.5 transition-transform duration-500"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="flex gap-4">
                    <div className="relative shrink-0">
                      <Avatar className="w-14 h-14 rounded-2xl avatar-glow">
                        <AvatarImage src={astrologer.profileImageUrl || undefined} className="object-cover" />
                        <AvatarFallback className="gradient-primary text-white font-bold text-lg">
                          {astrologer.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {(astrologer.isOnline || astrologer.availability === 'available') && (
                        <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <h4 className="font-bold text-sm text-white truncate">{astrologer.name}</h4>
                        {astrologer.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--gold)] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-white/40 font-medium truncate mb-2">
                        {astrologer.specializations?.slice(0, 2).join(', ') || 'Vedic, Numerology'}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-[var(--gold)] text-[var(--gold)]" />
                          <span className="text-xs font-bold text-white/80">{astrologer.rating || '4.9'}</span>
                        </div>
                        <span className="text-white/15 text-xs">&bull;</span>
                        <span className="text-[11px] font-medium text-white/40">{astrologer.experience || 10}y exp</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-bold text-[var(--gold)]">₹{astrologer.pricePerMinute || '25'}</span>
                      <span className="text-[11px] text-white/30 font-medium">/min</span>
                    </div>
                    <Link href={`/chat/${astrologer.id}`}>
                      <Button className="glass-pill-active text-white font-bold h-8 px-5 text-xs hover:scale-105 transition-transform" data-testid={`button-chat-${astrologer.id}`}>
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
    </div>
  );
}
