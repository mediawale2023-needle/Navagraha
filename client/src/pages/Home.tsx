import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ZodiacIcon } from '@/components/ZodiacIcon';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Link } from 'wouter';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sparkles, Star, Wallet, LogOut, User,
  Phone, MessageCircle, Heart, TrendingUp,
  Activity, CheckCircle2, ChevronRight,
  Sun, Moon, Calendar, ArrowRight, Video,
  Users, Scroll, Scale, Zap, Hash, BookOpen,
} from 'lucide-react';
import type { User as UserType, Astrologer, HomepageContent } from '@shared/schema';

/* ──────────────────────────────────────────────────────── */
/*  Icon name → component mapping (for CMS)                */
/* ──────────────────────────────────────────────────────── */
const ICON_MAP: Record<string, React.ElementType> = {
  MessageCircle, Phone, Calendar, Zap, Heart, Scale, Scroll, Sun,
  Moon, Star, Users, Video, Sparkles, Hash, Activity, TrendingUp,
  Wallet, BookOpen, ArrowRight, ChevronRight,
};

/* ──────────────────────────────────────────────────────── */
/*  CMS Types                                               */
/* ──────────────────────────────────────────────────────── */
interface CMSData {
  banners: HomepageContent[];
  services: HomepageContent[];
  freeServices: HomepageContent[];
}

/* ──────────────────────────────────────────────────────── */
/*  Fallback defaults (used if API hasn't returned yet)     */
/* ──────────────────────────────────────────────────────── */
const DEFAULT_BANNERS: HomepageContent[] = [
  { id: '1', section: 'banner', title: "Today's Insight", subtitle: "Venus guides you toward love and creative flow. Open yourself to positive energy.", icon: null, href: '/astrologers', gradient: 'bg-gradient-to-br from-[#8B2252] via-[#C0506A] to-[#D4847A]', cta: 'Read More', sortOrder: 0, enabled: true, createdAt: null, updatedAt: null },
  { id: '2', section: 'banner', title: "Premium Plan", subtitle: "Get unlimited AI insights, priority booking, and exclusive content.", icon: null, href: '/wallet', gradient: 'bg-gradient-to-br from-[#8B2252] via-[#C0506A] to-[#D4847A]', cta: 'Upgrade Plan', sortOrder: 1, enabled: true, createdAt: null, updatedAt: null },
  { id: '3', section: 'banner', title: "Your Birth Chart", subtitle: "Discover your exact planetary positions and dashas for accurate predictions.", icon: null, href: '/kundli/new', gradient: 'bg-gradient-to-br from-[#4A1A6B] via-[#6B3FA0] to-[#8B6CC1]', cta: 'Generate', sortOrder: 2, enabled: true, createdAt: null, updatedAt: null },
];

const DEFAULT_SERVICES: HomepageContent[] = [
  { id: '4', section: 'service', title: "Chat with\nAstrologer", subtitle: null, icon: 'MessageCircle', href: '/astrologers', gradient: 'from-pink-500/20 to-rose-500/10', cta: null, sortOrder: 0, enabled: true, createdAt: null, updatedAt: null },
  { id: '5', section: 'service', title: "Talk to\nAstrologer", subtitle: null, icon: 'Phone', href: '/astrologers', gradient: 'from-amber-500/20 to-yellow-500/10', cta: null, sortOrder: 1, enabled: true, createdAt: null, updatedAt: null },
  { id: '6', section: 'service', title: "Book\nAppointment", subtitle: null, icon: 'Calendar', href: '/schedule', gradient: 'from-violet-500/20 to-purple-500/10', cta: null, sortOrder: 2, enabled: true, createdAt: null, updatedAt: null },
  { id: '7', section: 'service', title: "Personalized\nAI Astrology", subtitle: null, icon: 'Zap', href: '/kundli/new', gradient: 'from-emerald-500/20 to-teal-500/10', cta: null, sortOrder: 3, enabled: true, createdAt: null, updatedAt: null },
];

const DEFAULT_FREE_SERVICES: HomepageContent[] = [
  { id: '8', section: 'free_service', title: 'Compatibility', subtitle: 'Check your match score', icon: 'Scale', href: '/kundli/matchmaking', gradient: null, cta: null, sortOrder: 0, enabled: true, createdAt: null, updatedAt: null },
  { id: '9', section: 'free_service', title: 'Kundli Match Making', subtitle: 'Vedic matching', icon: 'Heart', href: '/kundli/matchmaking', gradient: null, cta: null, sortOrder: 1, enabled: true, createdAt: null, updatedAt: null },
  { id: '10', section: 'free_service', title: 'Free Kundli', subtitle: 'Generate birth chart', icon: 'Scroll', href: '/kundli/new', gradient: null, cta: null, sortOrder: 2, enabled: true, createdAt: null, updatedAt: null },
  { id: '11', section: 'free_service', title: "Today's Horoscope", subtitle: 'Daily predictions', icon: 'Sun', href: '#horoscope', gradient: null, cta: null, sortOrder: 3, enabled: true, createdAt: null, updatedAt: null },
];

const NAV_TABS = [
  { label: 'Free Kundli', href: '/kundli/new' },
  { label: 'Matchmaking', href: '/kundli/matchmaking' },
  { label: 'Compatibility', href: '/kundli/matchmaking' },
  { label: 'Horoscope', anchor: 'horoscope' },
];

const zodiacSigns = [
  'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

/* ──────────────────────────────────────────────────────── */
/*  Component                                               */
/* ──────────────────────────────────────────────────────── */

export default function Home() {
  const [selectedSign, setSelectedSign] = useState('aries');
  const [bannerIdx, setBannerIdx] = useState(0);
  const horoscopeRef = useRef<HTMLDivElement>(null);

  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const { data: cmsData } = useQuery<CMSData>({
    queryKey: ['/api/homepage-content'],
  });

  // Resolve CMS content with fallbacks
  const banners = cmsData?.banners?.length ? cmsData.banners : DEFAULT_BANNERS;
  const services = cmsData?.services?.length ? cmsData.services : DEFAULT_SERVICES;
  const freeServices = cmsData?.freeServices?.length ? cmsData.freeServices : DEFAULT_FREE_SERVICES;

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
    const len = banners.length || 1;
    const t = setInterval(() => setBannerIdx(prev => (prev + 1) % len), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  const featuredAstrologer = astrologers?.find(a => a.isOnline || a.availability === 'available') || astrologers?.[0];



  const scrollToHoroscope = () => {
    horoscopeRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">

      {/* ─── Ambient Glows ─── */}
      <div className="fixed top-0 left-0 w-[45vw] h-[45vw] rounded-full bg-[var(--rose)]/[0.04] blur-[100px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[45vw] h-[45vw] rounded-full bg-[var(--gold)]/[0.03] blur-[100px] pointer-events-none" />
      <div className="fixed inset-0 celestial-mesh opacity-20 pointer-events-none" />

      {/* ═══════════════════════════════════════════════════════
          HEADER: Logo │ Nav Tabs │ Wallet │ Profile Dropdown
         ═══════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 header-glass">
        <div className="max-w-7xl mx-auto flex items-center h-14 px-4 sm:px-6 lg:px-8 gap-3">

          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2 shrink-0 cursor-pointer">
              <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-base tracking-tight hidden sm:inline">Navagraha</span>
            </div>
          </Link>

          {/* Nav Tabs — scrollable */}
          <nav className="flex-1 overflow-x-auto scrollbar-hide mx-2">
            <div className="flex items-center gap-1">
              {NAV_TABS.map(tab => (
                tab.anchor ? (
                  <button
                    key={tab.label}
                    onClick={scrollToHoroscope}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors whitespace-nowrap"
                  >
                    {tab.label}
                  </button>
                ) : (
                  <Link key={tab.label} href={tab.href!}>
                    <button className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors whitespace-nowrap">
                      {tab.label}
                    </button>
                  </Link>
                )
              ))}
            </div>
          </nav>

          {/* Right: Wallet + Profile Avatar Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/wallet">
              <button className="flex items-center gap-1.5 glass-pill px-3 py-1.5 hover:bg-foreground/5 transition-colors" data-testid="nav-link-wallet">
                <Wallet className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span className="font-bold text-foreground text-xs">₹{wallet?.balance || '0'}</span>
              </button>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus:outline-none">
                  <Avatar className="w-9 h-9 cursor-pointer avatar-glow transition-transform hover:scale-105" data-testid="nav-link-profile">
                    <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover" />
                    <AvatarFallback className="gradient-primary text-white text-xs font-bold">
                      {user?.firstName?.charAt(0) || <User className="w-3.5 h-3.5" />}
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
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 relative z-10">

        {/* ═══════════════════════════════════════════════════════
            BANNER CAROUSEL (solid gradient + zodiac wheel)
           ═══════════════════════════════════════════════════════ */}
        {banners.length > 0 && (
          <div className="mb-8 relative">
            <Link href={banners[bannerIdx % banners.length]?.href || '#'}>
              <div className={`relative overflow-hidden rounded-3xl cursor-pointer transition-all duration-500 hover:-translate-y-0.5 min-h-[190px] flex flex-col justify-center p-7 sm:p-8 ${banners[bannerIdx % banners.length]?.gradient || 'bg-gradient-to-br from-[#8B2252] via-[#C0506A] to-[#D4847A]'}`}>
                {/* Zodiac Wheel */}
                <svg className="absolute right-[-30px] sm:right-[-10px] top-1/2 -translate-y-1/2 w-[220px] h-[220px] sm:w-[260px] sm:h-[260px] text-white/[0.12]" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.5">
                  <circle cx="100" cy="100" r="95" /><circle cx="100" cy="100" r="80" /><circle cx="100" cy="100" r="55" /><circle cx="100" cy="100" r="30" />
                  <line x1="100" y1="5" x2="100" y2="195" /><line x1="5" y1="100" x2="195" y2="100" />
                  <line x1="30" y1="30" x2="170" y2="170" /><line x1="170" y1="30" x2="30" y2="170" />
                  <line x1="147" y1="13" x2="53" y2="187" /><line x1="187" y1="53" x2="13" y2="147" />
                  <line x1="187" y1="147" x2="13" y2="53" /><line x1="147" y1="187" x2="53" y2="13" />
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
                  <circle cx="120" cy="60" r="1.5" fill="currentColor" opacity="0.5" />
                  <circle cx="140" cy="75" r="1" fill="currentColor" opacity="0.4" />
                  <circle cx="155" cy="90" r="1.5" fill="currentColor" opacity="0.4" />
                  <circle cx="160" cy="130" r="1.5" fill="currentColor" opacity="0.5" />
                  <polyline points="120,60 140,75 155,90" strokeWidth="0.3" opacity="0.3" />
                  <polyline points="155,90 160,130" strokeWidth="0.3" opacity="0.3" />
                </svg>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/[0.04] rounded-full blur-[50px]" />
                <div className="relative z-10 max-w-[65%] sm:max-w-[60%]">
                  <h3 className="text-white font-bold text-2xl sm:text-3xl mb-2.5 tracking-tight leading-tight">{banners[bannerIdx % banners.length]?.title}</h3>
                  {banners[bannerIdx % banners.length]?.subtitle && <p className="text-white/75 text-sm leading-relaxed font-medium mb-5">{banners[bannerIdx % banners.length]?.subtitle}</p>}
                  {banners[bannerIdx % banners.length]?.cta && (
                    <button className="bg-[#1a1a1a]/80 hover:bg-[#1a1a1a] text-white font-bold text-sm rounded-full px-6 py-2.5 transition-all hover:scale-105 shadow-lg">
                      {banners[bannerIdx % banners.length]?.cta}
                    </button>
                  )}
                </div>
              </div>
            </Link>

            <div className="flex justify-center gap-2 mt-4">
              {banners.map((_, i) => (
                <button key={i} onClick={() => setBannerIdx(i)}
                  className={`h-1 rounded-full transition-all duration-300 ${i === (bannerIdx % banners.length) ? 'bg-white/80 w-6' : 'bg-white/15 w-1.5'}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            FEATURED ASTROLOGER
           ═══════════════════════════════════════════════════════ */}
        {featuredAstrologer && (
          <div className="mb-8">
            <h3 className="font-bold text-lg text-foreground tracking-tight mb-4 px-1">Featured Astrologer</h3>
            <div className="astronex-card p-6 flex flex-col sm:flex-row items-center gap-5">
              {/* Large Photo */}
              <div className="relative shrink-0">
                <Avatar className="w-24 h-24 sm:w-28 sm:h-28 avatar-glow">
                  <AvatarImage src={featuredAstrologer.profileImageUrl || undefined} className="object-cover" />
                  <AvatarFallback className="gradient-primary text-white font-bold text-3xl">
                    {featuredAstrologer.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                {(featuredAstrologer.isOnline || featuredAstrologer.availability === 'available') && (
                  <div className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 rounded-full border-[3px] border-background" />
                )}
              </div>

              {/* Info + Actions */}
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <h4 className="font-bold text-xl text-foreground">{featuredAstrologer.name}</h4>
                  {featuredAstrologer.isVerified && <CheckCircle2 className="w-4 h-4 text-[var(--turmeric)]" />}
                </div>
                <p className="text-xs text-foreground/50 font-medium mb-1">
                  {featuredAstrologer.specializations?.slice(0, 3).join(', ') || 'Vedic, Numerology, Tarot'}
                </p>
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-[var(--turmeric)] text-[var(--turmeric)]" />
                    <span className="text-sm font-bold text-foreground/80">{featuredAstrologer.rating || '4.9'}</span>
                  </div>
                  <span className="text-foreground/15">&bull;</span>
                  <span className="text-xs text-foreground/50">{featuredAstrologer.experience || 10}y exp</span>
                  <span className="text-foreground/15">&bull;</span>
                  <span className="text-sm font-bold text-[var(--turmeric)]">₹{featuredAstrologer.pricePerMinute || '25'}<span className="text-xs text-foreground/40 font-medium">/min</span></span>
                </div>

                <div className="flex items-center gap-3 justify-center sm:justify-start">
                  <Link href={`/call/${featuredAstrologer.id}?type=voice`}>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full px-5 h-9 text-sm gap-2 hover:scale-105 transition-transform" data-testid={`button-call-featured`}>
                      <Phone className="w-4 h-4" /> Call Now
                    </Button>
                  </Link>
                  <Link href={`/chat/${featuredAstrologer.id}`}>
                    <Button className="glass-pill-active text-white font-bold rounded-full px-5 h-9 text-sm gap-2 hover:scale-105 transition-transform" data-testid={`button-chat-featured`}>
                      <MessageCircle className="w-4 h-4" /> Chat Now
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            ASTROLOGY SERVICES (2×2 Grid)
           ═══════════════════════════════════════════════════════ */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="font-bold text-lg text-foreground tracking-tight">Astrology Services</h3>
            <Link href="/astrologers">
              <button className="text-xs font-semibold text-[var(--turmeric)] hover:text-foreground transition-colors flex items-center gap-1">
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {services.map(({ id, href, icon, title, gradient }) => {
              const IconComp = icon && ICON_MAP[icon] ? ICON_MAP[icon] : Sparkles;
              return (
                <Link key={id} href={href || '#'}>
                  <div className="astronex-card p-5 flex flex-col items-start gap-3 cursor-pointer group hover:-translate-y-0.5 transition-transform duration-300 min-h-[120px]">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient || 'from-foreground/10 to-foreground/5'} flex items-center justify-center`}>
                      <IconComp className="w-5 h-5 text-foreground/80" />
                    </div>
                    <span className="text-sm font-bold text-foreground/80 leading-tight whitespace-pre-line group-hover:text-foreground transition-colors">
                      {title}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            FREE ASTROLOGY SERVICES
           ═══════════════════════════════════════════════════════ */}
        <div className="mb-8">
          <h3 className="font-bold text-lg text-foreground tracking-tight mb-4 px-1">
            <span className="text-primary">FREE</span> Astrology Services
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {freeServices.map(({ id, href, icon, title, subtitle }) => {
              const IconComp = icon && ICON_MAP[icon] ? ICON_MAP[icon] : Sparkles;
              const isAnchor = href?.startsWith('#');
              const content = (
                <div className="astronex-card p-4 flex flex-col items-center text-center gap-2.5 cursor-pointer group hover:-translate-y-0.5 transition-transform duration-300 h-full">
                  <div className="w-12 h-12 rounded-full glass flex items-center justify-center group-hover:bg-[var(--magenta)]/10 transition-colors shrink-0">
                    <IconComp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground/80 leading-tight group-hover:text-foreground transition-colors">{title}</p>
                    {subtitle && <p className="text-[10px] text-foreground/50 mt-0.5">{subtitle}</p>}
                  </div>
                </div>
              );

              return isAnchor ? (
                <button
                  key={id}
                  onClick={scrollToHoroscope}
                  className="w-full text-left focus:outline-none"
                >
                  {content}
                </button>
              ) : (
                <Link key={id} href={href || '#'}>
                  {content}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            TODAY'S HOROSCOPE
           ═══════════════════════════════════════════════════════ */}
        <div ref={horoscopeRef} id="horoscope" className="mb-10 astronex-card overflow-hidden scroll-mt-20">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-foreground/[0.05]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--turmeric)]/10 flex items-center justify-center">
                <Sun className="w-4 h-4 text-[var(--turmeric)]" />
              </div>
              <h3 className="font-bold text-lg text-foreground tracking-tight">Today's Horoscope</h3>
            </div>
            <span className="text-[11px] text-foreground/50 font-medium bg-foreground/[0.03] px-3 py-1 rounded-full">Select Sign</span>
          </div>

          <div className="px-6 py-4 overflow-x-auto scrollbar-hide flex gap-2">
            {zodiacSigns.map((sign) => (
              <button
                key={sign}
                onClick={() => setSelectedSign(sign)}
                className={`shrink-0 p-3 w-[68px] rounded-2xl transition-all flex flex-col items-center gap-2 ${selectedSign === sign
                  ? 'gradient-primary text-white shadow-lg glow-pink scale-105'
                  : 'glass hover:bg-foreground/[0.03] text-foreground/60'
                  }`}
                data-testid={`zodiac-${sign}`}
                title={sign.charAt(0).toUpperCase() + sign.slice(1)}
              >
                <ZodiacIcon sign={sign} className={`w-5 h-5 ${selectedSign === sign ? 'text-white' : 'text-[var(--turmeric)]'}`} />
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
                <div className="absolute -top-10 -right-10 w-28 h-28 bg-[var(--magenta)]/[0.04] rounded-full blur-2xl" />
                <h4 className="font-bold text-foreground capitalize mb-4 text-base flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--magenta)]" />
                  {selectedSign} Insights
                </h4>
                <p className="text-sm text-foreground/70 leading-relaxed font-medium mb-6">
                  {horoscope?.prediction || "Today brings new opportunities for growth. The cosmic energies encourage you to trust your intuition and embrace positive changes."}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Heart, label: 'Love', stars: 4, color: 'text-[var(--magenta)]' },
                    { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-[var(--turmeric)]' },
                    { icon: Activity, label: 'Health', stars: 4, color: 'text-primary' },
                  ].map(({ icon: Icon, label, stars, color }) => (
                    <div key={label} className="bg-foreground/[0.02] rounded-xl p-3 text-center border border-foreground/[0.03]">
                      <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                      <p className="text-[11px] font-semibold text-foreground/50 mb-2">{label}</p>
                      <div className="flex gap-0.5 justify-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-2.5 h-2.5 ${i < stars ? 'fill-[var(--turmeric)] text-[var(--turmeric)]' : 'text-foreground/10'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
