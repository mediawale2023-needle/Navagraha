import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Star, Users, MessageCircle, Phone, Sparkles, Video,
  Heart, TrendingUp, Shield, Clock, ChevronRight, ChevronLeft,
  CheckCircle2, Zap, Award, BookOpen, Gem, Sun, Moon,
  Flame, Eye, Hash, Calendar, Headphones, ArrowRight
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

const HERO_BANNERS = [
  {
    title: 'First Consultation FREE',
    subtitle: 'Chat with India\'s top astrologers. No credit card needed.',
    cta: 'Talk Now',
    gradient: 'from-orange-600 to-amber-500',
  },
  {
    title: 'Get Your Free Kundli',
    subtitle: 'Accurate Vedic birth chart with dasha, dosha & remedies.',
    cta: 'Generate Now',
    gradient: 'from-indigo-600 to-purple-500',
  },
  {
    title: 'Kundli Matching',
    subtitle: 'Check compatibility before you say yes — 36 Gunas matching.',
    cta: 'Match Now',
    gradient: 'from-rose-600 to-pink-500',
  },
];

const CATEGORIES = [
  { label: 'Chat with\nAstrologer', icon: MessageCircle, color: 'bg-orange-100 text-orange-600' },
  { label: 'Talk to\nAstrologer', icon: Phone, color: 'bg-green-100 text-green-600' },
  { label: 'Video\nCall', icon: Video, color: 'bg-blue-100 text-blue-600' },
  { label: 'Free\nKundli', icon: Sun, color: 'bg-amber-100 text-amber-600' },
  { label: 'Kundli\nMatching', icon: Heart, color: 'bg-rose-100 text-rose-600' },
  { label: 'Numerology', icon: Hash, color: 'bg-purple-100 text-purple-600' },
];

const GUIDANCE_TOPICS = [
  { label: 'Love & Relationship', emoji: '❤️', color: 'border-rose-200 bg-rose-50' },
  { label: 'Marriage', emoji: '💍', color: 'border-pink-200 bg-pink-50' },
  { label: 'Career & Business', emoji: '💼', color: 'border-blue-200 bg-blue-50' },
  { label: 'Finance & Wealth', emoji: '💰', color: 'border-amber-200 bg-amber-50' },
  { label: 'Health', emoji: '🌿', color: 'border-green-200 bg-green-50' },
  { label: 'Family & Children', emoji: '👨‍👩‍👧', color: 'border-orange-200 bg-orange-50' },
  { label: 'Education', emoji: '📚', color: 'border-indigo-200 bg-indigo-50' },
  { label: 'Property & Vastu', emoji: '🏠', color: 'border-teal-200 bg-teal-50' },
];

const STATS = [
  { value: '5 Cr+', label: 'Happy Customers', icon: Users },
  { value: '10K+', label: 'Expert Astrologers', icon: Star },
  { value: '50 Cr+', label: 'Minutes Consulted', icon: Clock },
  { value: '4.8', label: 'Avg Rating', icon: Award },
];

export default function Landing() {
  const [liveCount, setLiveCount] = useState(342);
  const [bannerIdx, setBannerIdx] = useState(0);

  const { data: astrologers } = useQuery<Astrologer[]>({ queryKey: ['/api/astrologers'] });

  useEffect(() => {
    const t = setInterval(() => {
      setLiveCount(prev => prev + Math.floor(Math.random() * 3) - 1);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setBannerIdx(prev => (prev + 1) % HERO_BANNERS.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const onlineAstrologers = astrologers?.filter(a => a.isOnline || a.availability === 'available') || [];

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-orange-600 to-orange-500 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl text-white tracking-tight font-serif">Navagraha</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/astrologer/login">
                <Button variant="ghost" size="sm" className="text-white/90 hover:text-white hover:bg-white/10 font-medium text-xs">
                  Astrologer Login
                </Button>
              </Link>
              <Button
                size="sm"
                className="bg-white text-orange-600 hover:bg-orange-50 font-bold shadow-sm"
                onClick={() => window.location.href = '/api/auth/google'}
              >
                Sign In with Google
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Live count ticker */}
      <div className="bg-green-600 text-white text-center py-1.5 text-xs sm:text-sm font-semibold tracking-wide flex items-center justify-center gap-2">
        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
        {liveCount} astrologers online &bull; First consultation FREE for new users
      </div>

      {/* Hero Banner Carousel */}
      <div className="relative">
        <div className={`bg-gradient-to-r ${HERO_BANNERS[bannerIdx].gradient} py-10 px-4 transition-all duration-500`}>
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="font-bold text-3xl md:text-5xl text-white mb-3 leading-tight">
              {HERO_BANNERS[bannerIdx].title}
            </h1>
            <p className="text-white/80 text-base md:text-lg mb-6 max-w-xl mx-auto">
              {HERO_BANNERS[bannerIdx].subtitle}
            </p>
            <Button
              size="lg"
              className="bg-white text-gray-900 hover:bg-gray-100 font-bold h-12 px-8 rounded-full shadow-lg"
              onClick={() => window.location.href = '/api/auth/google'}
              data-testid="button-login"
            >
              {HERO_BANNERS[bannerIdx].cta}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
        {/* Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {HERO_BANNERS.map((_, i) => (
            <button
              key={i}
              onClick={() => setBannerIdx(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === bannerIdx ? 'bg-white w-5' : 'bg-white/50'}`}
            />
          ))}
        </div>
      </div>

      {/* Category Icons Row */}
      <div className="bg-white py-5 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-6 gap-2">
            {CATEGORIES.map(({ label, icon: Icon, color }) => (
              <button
                key={label}
                onClick={() => window.location.href = '/api/auth/google'}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div className={`w-12 h-12 md:w-14 md:h-14 rounded-full ${color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <span className="text-[10px] md:text-xs font-semibold text-gray-700 text-center leading-tight whitespace-pre-line">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Guidance Topics */}
      <div className="py-6 bg-[#FFF8F0]">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-lg font-bold text-gray-900 mb-4">What do you seek guidance on?</h2>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {GUIDANCE_TOPICS.map(({ label, emoji, color }) => (
              <button
                key={label}
                onClick={() => window.location.href = '/api/auth/google'}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full border ${color} whitespace-nowrap hover:shadow-sm transition-shadow`}
              >
                <span className="text-lg">{emoji}</span>
                <span className="text-xs font-semibold text-gray-700">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Online Astrologers */}
      <div className="py-6 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Online Astrologers</h2>
              <p className="text-xs text-gray-500">Connect instantly &bull; Available now</p>
            </div>
            <Link href="/astrologers">
              <Button variant="ghost" size="sm" className="text-orange-600 font-semibold gap-1">
                See All <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(astrologers?.slice(0, 6) || Array.from({ length: 6 })).map((astrologer: any, idx) => (
              <div
                key={astrologer?.id || idx}
                className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-md transition-shadow"
              >
                <div className="flex gap-3">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-14 h-14 ring-2 ring-orange-100">
                      <AvatarImage src={astrologer?.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-orange-400 to-amber-300 text-white font-bold text-lg">
                        {astrologer?.name?.charAt(0) || 'A'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="font-bold text-sm text-gray-900 truncate">{astrologer?.name || 'Astrologer'}</h3>
                      {astrologer?.isVerified && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      {astrologer?.specializations?.slice(0, 2).join(', ') || 'Vedic, Numerology'}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {astrologer?.languages?.join(', ') || 'Hindi, English'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-xs font-bold text-gray-700">{astrologer?.rating || '4.9'}</span>
                      </div>
                      <span className="text-gray-300 text-xs">&bull;</span>
                      <span className="text-[11px] text-gray-500">
                        {astrologer?.experience || '8'}yr exp
                      </span>
                      <span className="text-gray-300 text-xs">&bull;</span>
                      <span className="text-[11px] text-gray-500">
                        {astrologer?.totalConsultations || '2.5K'} orders
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-gray-900">₹{astrologer?.pricePerMinute || '25'}</div>
                    <div className="text-[10px] text-gray-400">/min</div>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  <Button
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg h-8 text-xs"
                    onClick={() => window.location.href = '/api/auth/google'}
                    data-testid={`button-chat-${astrologer?.id}`}
                  >
                    <MessageCircle className="w-3 h-3 mr-1" /> Chat
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg h-8 text-xs"
                    onClick={() => window.location.href = '/api/auth/google'}
                    data-testid={`button-call-${astrologer?.id}`}
                  >
                    <Phone className="w-3 h-3 mr-1" /> Call
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-indigo-300 text-indigo-600 hover:bg-indigo-50 font-semibold rounded-lg h-8 text-xs"
                    onClick={() => window.location.href = '/api/auth/google'}
                  >
                    <Video className="w-3 h-3 mr-1" /> Video
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Free Kundli Banner */}
      <div className="py-4 px-4 bg-[#FFF8F0]">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-1">Free Kundli Report</h3>
              <p className="text-indigo-100 text-sm">Get your detailed birth chart with planetary positions, dashas, doshas & remedies.</p>
            </div>
            <Link href="/kundli/matchmaking">
              <Button className="bg-white text-indigo-600 hover:bg-indigo-50 font-bold rounded-full px-6 shadow">
                Generate Free Kundli <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Kundli Matching Banner */}
      <div className="py-4 px-4 bg-[#FFF8F0]">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-rose-500 to-pink-500 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-1">Kundli Matching</h3>
              <p className="text-rose-100 text-sm">Find your compatibility score with 36 Gunas Ashtakoot matching.</p>
            </div>
            <Link href="/kundli/matchmaking">
              <Button className="bg-white text-rose-600 hover:bg-rose-50 font-bold rounded-full px-6 shadow">
                Match Kundli <Heart className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="py-8 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div key={label} className="text-center p-4 rounded-xl bg-orange-50 border border-orange-100">
                <Icon className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500 font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why Navagraha */}
      <div className="py-10 bg-[#FFF8F0]">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-xl font-bold text-center text-gray-900 mb-6">Why Millions Trust Navagraha</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: 'Verified Experts', desc: 'Every astrologer undergoes rigorous verification for quality and authenticity.', color: 'bg-blue-50 border-blue-100', iconColor: 'bg-blue-500' },
              { icon: Zap, title: 'Instant Connection', desc: 'Connect with an available astrologer within seconds — no waiting needed.', color: 'bg-green-50 border-green-100', iconColor: 'bg-green-500' },
              { icon: Award, title: 'Accurate Predictions', desc: 'Traditional Vedic methods with modern tools for precise readings.', color: 'bg-purple-50 border-purple-100', iconColor: 'bg-purple-500' },
            ].map(({ icon: Icon, title, desc, color, iconColor }) => (
              <div key={title} className={`p-5 rounded-xl border ${color}`}>
                <div className={`w-10 h-10 ${iconColor} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-base text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Big CTA */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-500 py-14">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Start Your Cosmic Journey
          </h2>
          <p className="text-white/80 text-base mb-8 max-w-md mx-auto">
            Join 5 crore+ users who trust Navagraha for life's important decisions
          </p>
          <Button
            size="lg"
            className="bg-white text-orange-600 hover:bg-orange-50 text-lg font-bold h-14 px-10 rounded-full shadow-xl"
            onClick={() => window.location.href = '/api/auth/google'}
            data-testid="button-cta-login"
          >
            Get FREE First Consultation
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white font-serif">Navagraha</span>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-gray-400">
              <Link href="/astrologers" className="hover:text-white transition-colors">Astrologers</Link>
              <Link href="/astrologer/login" className="hover:text-white transition-colors">For Astrologers</Link>
              <Link href="/kundli/matchmaking" className="hover:text-white transition-colors">Free Kundli</Link>
              <Link href="/numerology" className="hover:text-white transition-colors">Numerology</Link>
            </div>
            <div className="text-sm text-gray-600">
              &copy; {new Date().getFullYear()} Navagraha
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
