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
  Users, Phone, MessageCircle, Heart, TrendingUp,
  Activity, CheckCircle2, ChevronRight, Clock, Hash,
  Sun, Moon, Calendar, ArrowRight
} from 'lucide-react';
import type { User as UserType, Astrologer } from '@shared/schema';

const zodiacSigns = [
  'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

const QUICK_ACTIONS = [
  { href: '/astrologers', icon: MessageCircle, label: 'Chat with\nAstrologer' },
  { href: '/astrologers', icon: Phone, label: 'Talk to\nAstrologer' },
  { href: '/kundli/new', icon: Sun, label: 'Free\nKundli' },
  { href: '/kundli/matchmaking', icon: Heart, label: 'Kundli\nMatching' },
  { href: '/schedule', icon: Calendar, label: 'Book\nAppointment' },
  { href: '/numerology', icon: Hash, label: 'Numerology' },
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
    const t = setInterval(() => setBannerIdx(prev => (prev + 1) % 3), 4000);
    return () => clearInterval(t);
  }, []);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D]">
        <LoadingSpinner />
      </div>
    );
  }

  const onlineCount = astrologers?.filter(a => a.isOnline || a.availability === 'available').length || 0;

  const banners = [
    { title: 'Talk to Expert Astrologers', subtitle: 'Get answers about love, career & more', cta: 'Consult Now', href: '/astrologers' },
    { title: 'Free Kundli Report', subtitle: 'Detailed birth chart with dashas & doshas', cta: 'Generate', href: '/kundli/new' },
    { title: 'Kundli Matching', subtitle: '36 Gunas Ashtakoot compatibility', cta: 'Match Now', href: '/kundli/matchmaking' },
  ];

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white pb-20 md:pb-0">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(13,13,13,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg text-white">Navagraha</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/wallet">
                <button className="flex items-center gap-1.5 glass text-white rounded-full px-3 py-1.5 text-sm font-semibold" data-testid="nav-link-wallet">
                  <Wallet className="w-3.5 h-3.5 text-[#D4A853]" />
                  ₹{wallet?.balance || '0'}
                </button>
              </Link>
              <Link href="/profile">
                <Avatar className="w-8 h-8 cursor-pointer avatar-glow" data-testid="nav-link-profile">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="gradient-primary text-white text-xs font-semibold">
                    {user?.firstName?.charAt(0) || <User className="w-3.5 h-3.5" />}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <button
                onClick={() => window.location.href = '/api/logout'}
                className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Welcome ──────────────────────────────────────── */}
        <div className="pt-5 pb-4">
          <p className="text-gray-500 text-sm font-medium">Welcome back,</p>
          <h2 className="font-semibold text-xl text-white">{user?.firstName || 'Seeker'} 👋</h2>
        </div>

        {/* ─── Banner Carousel ──────────────────────────────── */}
        <div className="mb-5 relative">
          <Link href={banners[bannerIdx].href}>
            <div className="astronex-card overflow-hidden relative p-5 cursor-pointer transition-all duration-500">
              <div className="absolute inset-0 celestial-bg opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#E91E8C]/15 to-[#7B2FBE]/15" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-gray-400 text-xs font-medium">{onlineCount} astrologers online</span>
                </div>
                <h3 className="text-white font-semibold text-xl mb-1">{banners[bannerIdx].title}</h3>
                <p className="text-gray-400 text-sm mb-4">{banners[bannerIdx].subtitle}</p>
                <Button size="sm" className="gradient-primary hover:opacity-90 text-white font-semibold rounded-full px-5 shadow-lg">
                  {banners[bannerIdx].cta} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </Link>
          <div className="flex justify-center gap-2 mt-3">
            {banners.map((_, i) => (
              <button key={i} onClick={() => setBannerIdx(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === bannerIdx ? 'gradient-primary w-5' : 'bg-white/15 w-1.5'}`}
              />
            ))}
          </div>
        </div>

        {/* ─── Quick Actions ────────────────────────────────── */}
        <div className="mb-6">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {QUICK_ACTIONS.map(({ href, icon: Icon, label }) => (
              <Link key={label} href={href}>
                <div className="flex flex-col items-center gap-2 py-3 cursor-pointer group" data-testid={`card-quick-${label.toLowerCase().replace(/\s/g, '-')}`}>
                  <div className="w-13 h-13 glass rounded-2xl flex items-center justify-center group-hover:glow-pink transition-all duration-300">
                    <Icon className="w-5 h-5 text-[#E91E8C]" />
                  </div>
                  <span className="text-[11px] font-medium text-gray-400 text-center leading-tight whitespace-pre-line group-hover:text-white transition-colors">
                    {label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ─── Daily Horoscope ──────────────────────────────── */}
        <div className="mb-6 astronex-card overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-[#D4A853]" />
              <h3 className="font-semibold text-base text-white">Daily Horoscope</h3>
            </div>
            <span className="text-[10px] text-gray-600 font-medium">Tap your sign</span>
          </div>
          <div className="px-4 pb-2">
            <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
              {zodiacSigns.map((sign) => (
                <button
                  key={sign}
                  onClick={() => setSelectedSign(sign)}
                  className={`p-1.5 rounded-xl transition-all flex flex-col items-center gap-0.5 ${selectedSign === sign
                      ? 'gradient-primary text-white shadow-lg glow-pink'
                      : 'bg-white/5 hover:bg-white/8 text-gray-400'
                    }`}
                  data-testid={`zodiac-${sign}`}
                  title={sign.charAt(0).toUpperCase() + sign.slice(1)}
                >
                  <ZodiacIcon sign={sign} className="w-4 h-4 mx-auto" />
                  <span className="text-[8px] font-semibold capitalize leading-none">{sign.slice(0, 3)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 pb-4">
            {horoscopeLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <div className="glass rounded-xl p-4">
                <h4 className="font-semibold text-white capitalize mb-1.5 text-sm">{selectedSign}</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {horoscope?.prediction || "Today brings new opportunities for growth. The cosmic energies encourage you to trust your intuition and embrace positive changes."}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {[
                    { icon: Heart, label: 'Love', stars: 4, color: 'text-[#E91E8C]' },
                    { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-[#7B2FBE]' },
                    { icon: Activity, label: 'Health', stars: 4, color: 'text-green-400' },
                  ].map(({ icon: Icon, label, stars, color }) => (
                    <div key={label} className="bg-white/5 rounded-lg p-2 text-center">
                      <Icon className={`w-3.5 h-3.5 ${color} mx-auto mb-0.5`} />
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">{label}</p>
                      <div className="flex gap-0.5 justify-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-2 h-2 ${i < stars ? 'fill-[#D4A853] text-[#D4A853]' : 'text-gray-700'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Online Astrologers ───────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-base text-white">Online Astrologers</h3>
            <Link href="/astrologers">
              <Button variant="ghost" size="sm" className="text-[#E91E8C] hover:text-[#F23D9E] hover:bg-white/5 font-semibold gap-0.5 h-7 text-xs" data-testid="link-see-all-astrologers">
                See All <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          {astrologersLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {astrologers?.slice(0, 6).map((astrologer) => (
                <div
                  key={astrologer.id}
                  className="astronex-card p-4 hover:border-[#E91E8C]/20 transition-all duration-300"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="flex gap-3">
                    <div className="relative flex-shrink-0">
                      <Avatar className="w-13 h-13 avatar-glow">
                        <AvatarImage src={astrologer.profileImageUrl || undefined} />
                        <AvatarFallback className="gradient-primary text-white font-semibold text-lg">
                          {astrologer.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {(astrologer.isOnline || astrologer.availability === 'available') && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[#0D0D0D]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h4 className="font-semibold text-sm text-white truncate">{astrologer.name}</h4>
                        {astrologer.isVerified && <CheckCircle2 className="w-3 h-3 text-[#E91E8C] flex-shrink-0" />}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {astrologer.specializations?.slice(0, 2).join(', ') || 'Vedic, Numerology'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Star className="w-3 h-3 fill-[#D4A853] text-[#D4A853]" />
                        <span className="text-xs font-semibold text-gray-300">{astrologer.rating || '4.9'}</span>
                        <span className="text-gray-600 text-xs">&bull;</span>
                        <span className="text-[11px] text-gray-500">{astrologer.experience || 10}yr</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-[#D4A853]">₹{astrologer.pricePerMinute || '25'}</div>
                      <div className="text-[10px] text-gray-600">/min</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Link href={`/chat/${astrologer.id}`}>
                      <Button size="sm" className="w-full gradient-primary hover:opacity-90 text-white font-medium rounded-xl h-7 text-xs" data-testid={`button-chat-${astrologer.id}`}>
                        <MessageCircle className="w-3 h-3 mr-1" /> Chat
                      </Button>
                    </Link>
                    <Link href={`/call/${astrologer.id}?type=voice`}>
                      <Button size="sm" className="w-full bg-green-600/20 hover:bg-green-600/30 text-green-400 font-medium rounded-xl h-7 text-xs border border-green-600/20" data-testid={`button-call-${astrologer.id}`}>
                        <Phone className="w-3 h-3 mr-1" /> Call
                      </Button>
                    </Link>
                    <Link href={`/call/${astrologer.id}?type=video`}>
                      <Button size="sm" className="w-full glass text-gray-300 hover:text-white font-medium rounded-xl h-7 text-xs">
                        <Video className="w-3 h-3 mr-1" /> Video
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
