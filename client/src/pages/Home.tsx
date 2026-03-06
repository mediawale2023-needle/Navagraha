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
  Sun, Moon, Calendar, ArrowRight, BookOpen
} from 'lucide-react';
import type { User as UserType, Astrologer } from '@shared/schema';

const zodiacSigns = [
  'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

const QUICK_ACTIONS = [
  { href: '/astrologers', icon: MessageCircle, label: 'Chat with\nAstrologer', color: 'bg-orange-500', iconColor: 'text-white' },
  { href: '/astrologers', icon: Phone, label: 'Talk to\nAstrologer', color: 'bg-green-500', iconColor: 'text-white' },
  { href: '/kundli/new', icon: Sun, label: 'Free\nKundli', color: 'bg-amber-500', iconColor: 'text-white' },
  { href: '/kundli/matchmaking', icon: Heart, label: 'Kundli\nMatching', color: 'bg-rose-500', iconColor: 'text-white' },
  { href: '/schedule', icon: Calendar, label: 'Book\nAppointment', color: 'bg-blue-500', iconColor: 'text-white' },
  { href: '/numerology', icon: Hash, label: 'Numerology', color: 'bg-purple-500', iconColor: 'text-white' },
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
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0]">
        <LoadingSpinner />
      </div>
    );
  }

  const onlineCount = astrologers?.filter(a => a.isOnline || a.availability === 'available').length || 0;

  const banners = [
    { title: 'Talk to Expert Astrologers', subtitle: 'Get answers about love, career & more', gradient: 'from-orange-600 to-amber-500', cta: 'Consult Now', href: '/astrologers' },
    { title: 'Free Kundli Report', subtitle: 'Detailed birth chart with dashas & doshas', gradient: 'from-indigo-600 to-purple-500', cta: 'Generate', href: '/kundli/new' },
    { title: 'Kundli Matching', subtitle: '36 Gunas Ashtakoot compatibility', gradient: 'from-rose-500 to-pink-500', cta: 'Match Now', href: '/kundli/matchmaking' },
  ];

  return (
    <div className="min-h-screen bg-[#FFF8F0] pb-20 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-orange-600 to-orange-500 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg text-white font-serif">Navagraha</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/wallet">
                <button className="flex items-center gap-1.5 bg-white/20 text-white rounded-full px-3 py-1.5 text-sm font-bold backdrop-blur-sm" data-testid="nav-link-wallet">
                  <Wallet className="w-3.5 h-3.5" />
                  ₹{wallet?.balance || '0'}
                </button>
              </Link>
              <Link href="/profile">
                <Avatar className="w-8 h-8 cursor-pointer ring-2 ring-white/30" data-testid="nav-link-profile">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-white/20 text-white text-xs font-bold">
                    {user?.firstName?.charAt(0) || <User className="w-3.5 h-3.5" />}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <button
                onClick={() => window.location.href = '/api/logout'}
                className="p-1.5 rounded-full hover:bg-white/10"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 text-white/80" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Welcome + Banner */}
        <div className="pt-4 pb-3">
          <p className="text-gray-500 text-sm font-medium">Welcome back,</p>
          <h2 className="font-bold text-xl text-gray-900">{user?.firstName || 'Seeker'} 👋</h2>
        </div>

        {/* Banner Carousel */}
        <div className="mb-4 relative">
          <Link href={banners[bannerIdx].href}>
            <div className={`bg-gradient-to-r ${banners[bannerIdx].gradient} rounded-2xl p-5 cursor-pointer transition-all duration-500`}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-white/80 text-xs font-medium">{onlineCount} astrologers online</span>
              </div>
              <h3 className="text-white font-bold text-xl mb-1">{banners[bannerIdx].title}</h3>
              <p className="text-white/70 text-sm mb-3">{banners[bannerIdx].subtitle}</p>
              <Button size="sm" className="bg-white text-gray-900 hover:bg-gray-100 font-bold rounded-full px-5 shadow">
                {banners[bannerIdx].cta} <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </Link>
          <div className="flex justify-center gap-1.5 mt-2">
            {banners.map((_, i) => (
              <button key={i} onClick={() => setBannerIdx(i)}
                className={`h-1.5 rounded-full transition-all ${i === bannerIdx ? 'bg-orange-500 w-4' : 'bg-gray-300 w-1.5'}`}
              />
            ))}
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="mb-5">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {QUICK_ACTIONS.map(({ href, icon: Icon, label, color }) => (
              <Link key={label} href={href}>
                <div className="flex flex-col items-center gap-1.5 py-3 cursor-pointer group" data-testid={`card-quick-${label.toLowerCase().replace(/\s/g, '-')}`}>
                  <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight whitespace-pre-line">
                    {label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Daily Horoscope */}
        <div className="mb-5 bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-orange-500" />
              <h3 className="font-bold text-base text-gray-900">Daily Horoscope</h3>
            </div>
            <span className="text-[10px] text-gray-400 font-medium">Tap your sign</span>
          </div>
          <div className="px-4 pb-2">
            <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
              {zodiacSigns.map((sign) => (
                <button
                  key={sign}
                  onClick={() => setSelectedSign(sign)}
                  className={`p-1.5 rounded-xl transition-all flex flex-col items-center gap-0.5 ${
                    selectedSign === sign
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-gray-50 hover:bg-orange-50 text-gray-600'
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
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                <h4 className="font-bold text-gray-900 capitalize mb-1.5 text-sm">{selectedSign}</h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {horoscope?.prediction || "Today brings new opportunities for growth. The cosmic energies encourage you to trust your intuition and embrace positive changes."}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {[
                    { icon: Heart, label: 'Love', stars: 4, color: 'text-rose-500' },
                    { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-blue-500' },
                    { icon: Activity, label: 'Health', stars: 4, color: 'text-green-500' },
                  ].map(({ icon: Icon, label, stars, color }) => (
                    <div key={label} className="bg-white rounded-lg p-2 text-center">
                      <Icon className={`w-3.5 h-3.5 ${color} mx-auto mb-0.5`} />
                      <p className="text-[10px] font-semibold text-gray-600 mb-0.5">{label}</p>
                      <div className="flex gap-0.5 justify-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-2 h-2 ${i < stars ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Online Astrologers */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base text-gray-900">Online Astrologers</h3>
            <Link href="/astrologers">
              <Button variant="ghost" size="sm" className="text-orange-600 font-semibold gap-0.5 h-7 text-xs" data-testid="link-see-all-astrologers">
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
                  className="bg-white rounded-xl p-3 border border-gray-100 hover:shadow-md transition-shadow"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="flex gap-3">
                    <div className="relative flex-shrink-0">
                      <Avatar className="w-13 h-13 ring-2 ring-orange-100">
                        <AvatarImage src={astrologer.profileImageUrl || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-orange-400 to-amber-300 text-white font-bold text-lg">
                          {astrologer.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {(astrologer.isOnline || astrologer.availability === 'available') && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h4 className="font-bold text-sm text-gray-900 truncate">{astrologer.name}</h4>
                        {astrologer.isVerified && <CheckCircle2 className="w-3 h-3 text-blue-500 flex-shrink-0" />}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {astrologer.specializations?.slice(0, 2).join(', ') || 'Vedic, Numerology'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-xs font-bold text-gray-700">{astrologer.rating || '4.9'}</span>
                        <span className="text-gray-300 text-xs">&bull;</span>
                        <span className="text-[11px] text-gray-500">{astrologer.experience || 10}yr</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-gray-900">₹{astrologer.pricePerMinute || '25'}</div>
                      <div className="text-[10px] text-gray-400">/min</div>
                    </div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                    <Link href={`/chat/${astrologer.id}`}>
                      <Button size="sm" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg h-7 text-xs" data-testid={`button-chat-${astrologer.id}`}>
                        <MessageCircle className="w-3 h-3 mr-1" /> Chat
                      </Button>
                    </Link>
                    <Link href={`/call/${astrologer.id}?type=voice`}>
                      <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg h-7 text-xs" data-testid={`button-call-${astrologer.id}`}>
                        <Phone className="w-3 h-3 mr-1" /> Call
                      </Button>
                    </Link>
                    <Link href={`/call/${astrologer.id}?type=video`}>
                      <Button size="sm" variant="outline" className="w-full border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-semibold rounded-lg h-7 text-xs">
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

      <BottomNav />
    </div>
  );
}
