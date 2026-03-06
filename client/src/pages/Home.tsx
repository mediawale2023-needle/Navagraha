import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ZodiacIcon } from '@/components/ZodiacIcon';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BottomNav } from '@/components/BottomNav';
import { Link } from 'wouter';
import {
  Sparkles, Star, Wallet, LogOut, User,
  Users, Phone, MessageCircle, Heart, TrendingUp,
  Activity, CheckCircle2, ChevronRight, Clock, Zap
} from 'lucide-react';
import type { User as UserType, Astrologer } from '@shared/schema';

const zodiacSigns = [
  'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

const CATEGORIES = [
  { label: 'Love', emoji: '❤️' },
  { label: 'Career', emoji: '💼' },
  { label: 'Finance', emoji: '💰' },
  { label: 'Health', emoji: '🌿' },
  { label: 'Marriage', emoji: '💍' },
  { label: 'Family', emoji: '👨‍👩‍👧' },
];

export default function Home() {
  const [selectedSign, setSelectedSign] = useState('aries');

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

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <LoadingSpinner />
      </div>
    );
  }

  const onlineCount = astrologers?.filter(a => a.isOnline || a.availability === 'available').length || 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-[#FFCF23] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#1A1A1A]" />
              <span className="font-bold text-lg text-[#1A1A1A]">Navagraha</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/wallet">
                <button className="flex items-center gap-1.5 bg-[#1A1A1A] text-[#FFCF23] rounded-full px-3 py-1.5 text-sm font-bold" data-testid="nav-link-wallet">
                  <Wallet className="w-3.5 h-3.5" />
                  ₹{wallet?.balance || '0'}
                </button>
              </Link>
              <Link href="/profile">
                <Avatar className="w-8 h-8 cursor-pointer border-2 border-[#1A1A1A]" data-testid="nav-link-profile">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-[#1A1A1A] text-[#FFCF23] text-xs font-bold">
                    {user?.firstName?.charAt(0) || <User className="w-3.5 h-3.5" />}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <button
                onClick={() => window.location.href = '/api/logout'}
                className="p-1.5 rounded-full hover:bg-[#1A1A1A]/10"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 text-[#1A1A1A]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Welcome Banner */}
        <div className="pt-6 pb-4">
          <div className="bg-gradient-to-r from-[#FFCF23] to-[#FFD93D] rounded-2xl p-5">
            <p className="text-[#1A1A1A]/60 text-sm font-medium">Welcome back,</p>
            <h2 className="font-bold text-2xl text-[#1A1A1A] mb-1">{user?.firstName || 'Seeker'} 👋</h2>
            <div className="flex items-center gap-1.5 mb-4">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
              <span className="text-sm text-[#1A1A1A]/70 font-medium">{onlineCount} astrologers online</span>
            </div>
            <div className="flex gap-2">
              <Link href="/astrologers">
                <Button size="sm" className="bg-[#1A1A1A] text-[#FFCF23] hover:bg-[#333] font-bold rounded-xl" data-testid="button-hero-astrologers">
                  <Users className="w-3.5 h-3.5 mr-1" /> Talk to Astrologer
                </Button>
              </Link>
              <Link href="/kundli/new">
                <Button size="sm" variant="outline" className="border-[#1A1A1A] text-[#1A1A1A] bg-transparent hover:bg-[#1A1A1A]/10 font-semibold rounded-xl" data-testid="button-hero-kundli">
                  <Sparkles className="w-3.5 h-3.5 mr-1" /> Free Kundli
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="mb-6">
          <h3 className="font-bold text-[#1A1A1A] mb-3">I want guidance on...</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {CATEGORIES.map(({ label, emoji }) => (
              <Link key={label} href="/astrologers">
                <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white border border-gray-100 hover:border-[#FFCF23] hover:bg-[#FFFBEA] transition-all cursor-pointer shadow-sm">
                  <span className="text-2xl">{emoji}</span>
                  <span className="text-xs font-semibold text-[#1A1A1A] text-center leading-tight">{label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/kundli/new">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-[#FFCF23] hover:shadow-md transition-all cursor-pointer" data-testid="card-quick-kundli">
              <div className="w-10 h-10 bg-[#FFCF23] rounded-xl flex items-center justify-center mb-2">
                <Sparkles className="w-5 h-5 text-[#1A1A1A]" />
              </div>
              <h4 className="font-bold text-sm text-[#1A1A1A]">Birth Chart</h4>
              <p className="text-xs text-gray-500 mt-0.5">Generate free kundli</p>
            </div>
          </Link>
          <Link href="/kundli/matchmaking">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-[#FFCF23] hover:shadow-md transition-all cursor-pointer" data-testid="card-quick-matchmaking">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center mb-2">
                <Heart className="w-5 h-5 text-red-500" />
              </div>
              <h4 className="font-bold text-sm text-[#1A1A1A]">Kundli Milan</h4>
              <p className="text-xs text-gray-500 mt-0.5">Match compatibility</p>
            </div>
          </Link>
          <Link href="/schedule">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-[#FFCF23] hover:shadow-md transition-all cursor-pointer">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <h4 className="font-bold text-sm text-[#1A1A1A]">Schedule</h4>
              <p className="text-xs text-gray-500 mt-0.5">Book appointment</p>
            </div>
          </Link>
          <Link href="/numerology">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-[#FFCF23] hover:shadow-md transition-all cursor-pointer" data-testid="card-quick-numerology">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-2">
                <span className="text-purple-600 font-black text-lg">#</span>
              </div>
              <h4 className="font-bold text-sm text-[#1A1A1A]">Numerology</h4>
              <p className="text-xs text-gray-500 mt-0.5">Life path &amp; numbers</p>
            </div>
          </Link>
        </div>

        {/* Daily Horoscope */}
        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-bold text-lg text-[#1A1A1A]">Daily Horoscope</h3>
            <span className="text-xs text-gray-400 font-medium">Select your sign</span>
          </div>
          <div className="px-5 pb-3">
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
              {zodiacSigns.map((sign) => (
                <button
                  key={sign}
                  onClick={() => setSelectedSign(sign)}
                  className={`p-2 rounded-xl transition-all ${
                    selectedSign === sign
                      ? 'bg-[#FFCF23] shadow-sm'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  data-testid={`zodiac-${sign}`}
                  title={sign.charAt(0).toUpperCase() + sign.slice(1)}
                >
                  <ZodiacIcon sign={sign} className="w-5 h-5 mx-auto" />
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 pb-5">
            {horoscopeLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <div className="bg-[#FFFBEA] rounded-xl p-4">
                <h4 className="font-bold text-[#1A1A1A] capitalize mb-2">{selectedSign}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {horoscope?.prediction || "Today brings new opportunities for growth and self-discovery. The cosmic energies are aligned in your favor, encouraging you to trust your intuition and embrace positive changes."}
                </p>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[
                    { icon: Heart, label: 'Love', stars: 4, color: 'text-red-400' },
                    { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-blue-400' },
                    { icon: Activity, label: 'Health', stars: 4, color: 'text-green-400' },
                  ].map(({ icon: Icon, label, stars, color }) => (
                    <div key={label} className="bg-white rounded-lg p-2.5 text-center">
                      <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                      <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
                      <div className="flex gap-0.5 justify-center">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-2.5 h-2.5 ${i < stars ? 'fill-[#FFCF23] text-[#FFCF23]' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Featured Astrologers */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-[#1A1A1A]">Top Astrologers</h3>
            <Link href="/astrologers">
              <Button variant="ghost" size="sm" className="text-[#1A1A1A] font-semibold gap-0.5" data-testid="link-see-all-astrologers">
                View All <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {astrologersLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {astrologers?.slice(0, 3).map((astrologer) => (
                <div
                  key={astrologer.id}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="relative">
                      <Avatar className="w-14 h-14">
                        <AvatarImage src={astrologer.profileImageUrl || undefined} />
                        <AvatarFallback className="bg-[#FFCF23] text-[#1A1A1A] font-bold text-lg">
                          {astrologer.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {(astrologer.isOnline || astrologer.availability === 'available') && (
                        <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h4 className="font-bold text-[#1A1A1A] truncate">{astrologer.name}</h4>
                        {astrologer.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {astrologer.specializations?.slice(0, 2).join(' • ') || 'Vedic Astrology'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-[#FFCF23] text-[#FFCF23]" />
                          <span className="text-xs font-bold">{astrologer.rating || '4.9'}</span>
                        </div>
                        <span className="text-xs text-gray-400">{astrologer.experience || 10}yr exp</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-[#1A1A1A]">₹{astrologer.pricePerMinute || '25'}</div>
                      <div className="text-xs text-gray-400">/min</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/chat/${astrologer.id}`}>
                      <Button size="sm" className="w-full bg-[#FFCF23] text-[#1A1A1A] hover:bg-[#F5C500] font-bold rounded-xl" data-testid={`button-chat-${astrologer.id}`}>
                        <MessageCircle className="w-3.5 h-3.5 mr-1" /> Chat
                      </Button>
                    </Link>
                    <Link href={`/call/${astrologer.id}?type=voice`}>
                      <Button size="sm" variant="outline" className="w-full border-gray-200 text-[#1A1A1A] hover:bg-gray-50 font-semibold rounded-xl" data-testid={`button-call-${astrologer.id}`}>
                        <Phone className="w-3.5 h-3.5 mr-1" /> Call
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Desktop nav links */}
      <div className="hidden md:block fixed right-4 top-1/2 -translate-y-1/2 z-40">
        {/* noop — desktop uses the top header */}
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
