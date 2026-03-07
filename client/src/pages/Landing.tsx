import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Star, Users, MessageCircle, Phone, Sparkles, Video,
  Heart, TrendingUp, Shield, Clock, ChevronRight,
  CheckCircle2, Zap, Award, Sun, Moon,
  Hash, ArrowRight
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

const HERO_BANNERS = [
  {
    title: 'Your Cosmic Blueprint Awaits',
    subtitle: 'Discover your destiny with AI-powered Vedic astrology insights.',
    cta: 'Start Free Reading',
  },
  {
    title: 'Free Kundli Report',
    subtitle: 'Accurate birth chart with dasha, dosha & personalized remedies.',
    cta: 'Generate Now',
  },
  {
    title: 'Kundli Matching',
    subtitle: 'Check compatibility — 36 Gunas Ashtakoot matching.',
    cta: 'Match Now',
  },
];

const CATEGORIES = [
  { label: 'Chat with\nAstrologer', icon: MessageCircle },
  { label: 'Talk to\nAstrologer', icon: Phone },
  { label: 'Video\nCall', icon: Video },
  { label: 'Free\nKundli', icon: Sun },
  { label: 'Kundli\nMatching', icon: Heart },
  { label: 'Numerology', icon: Hash },
];

const GUIDANCE_TOPICS = [
  { label: 'Love & Relationship', emoji: '❤️' },
  { label: 'Marriage', emoji: '💍' },
  { label: 'Career & Business', emoji: '💼' },
  { label: 'Finance & Wealth', emoji: '💰' },
  { label: 'Health', emoji: '🌿' },
  { label: 'Family & Children', emoji: '👨‍👩‍👧' },
  { label: 'Education', emoji: '📚' },
  { label: 'Property & Vastu', emoji: '🏠' },
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
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      {/* ─── Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(13,13,13,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center glow-pink">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-xl tracking-tight">Navagraha</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/astrologer/login">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-white/5 font-medium text-xs">
                  Astrologer Login
                </Button>
              </Link>
              <Button
                size="sm"
                className="gradient-primary hover:opacity-90 text-white font-semibold shadow-lg rounded-full px-5"
                onClick={() => window.location.href = '/api/auth/google'}
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Live Count Ticker ─────────────────────────────────── */}
      <div className="bg-[#1A1A2E] border-b border-white/5 text-center py-2 text-xs sm:text-sm font-medium tracking-wide flex items-center justify-center gap-2">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <span className="text-gray-300">{liveCount} astrologers online</span>
        <span className="text-gray-600">&bull;</span>
        <span className="text-gradient font-semibold">First consultation FREE</span>
      </div>

      {/* ─── Hero Banner Carousel ─────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Celestial background effect */}
        <div className="absolute inset-0 celestial-bg" />
        <div className="relative py-16 sm:py-20 px-4 transition-all duration-500">
          <div className="max-w-7xl mx-auto text-center">
            {/* Decorative zodiac ring */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full border border-[#D4A853]/30 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border border-[#D4A853]/50 flex items-center justify-center">
                <Moon className="w-7 h-7 text-[#D4A853]" />
              </div>
            </div>
            <h1 className="font-semibold text-3xl md:text-5xl text-white mb-4 leading-tight">
              {HERO_BANNERS[bannerIdx].title}
            </h1>
            <p className="text-gray-400 text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
              {HERO_BANNERS[bannerIdx].subtitle}
            </p>
            <Button
              size="lg"
              className="gradient-primary hover:opacity-90 text-white font-semibold h-13 px-8 rounded-full shadow-lg glow-pink transition-all"
              onClick={() => window.location.href = '/api/auth/google'}
              data-testid="button-login"
            >
              {HERO_BANNERS[bannerIdx].cta}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
        {/* Dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {HERO_BANNERS.map((_, i) => (
            <button
              key={i}
              onClick={() => setBannerIdx(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === bannerIdx ? 'w-6 gradient-primary' : 'w-1.5 bg-white/20'}`}
            />
          ))}
        </div>
      </div>

      {/* ─── Category Icons ────────────────────────────────────── */}
      <div className="py-6 border-t border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-6 gap-3">
            {CATEGORIES.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => window.location.href = '/api/auth/google'}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-13 h-13 md:w-14 md:h-14 rounded-2xl glass flex items-center justify-center group-hover:glow-pink transition-all duration-300">
                  <Icon className="w-5 h-5 md:w-6 md:h-6 text-[#E91E8C]" />
                </div>
                <span className="text-[10px] md:text-xs font-medium text-gray-400 text-center leading-tight whitespace-pre-line group-hover:text-white transition-colors">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Guidance Topics ───────────────────────────────────── */}
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-lg font-semibold text-white mb-4">What do you seek guidance on?</h2>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
            {GUIDANCE_TOPICS.map(({ label, emoji }) => (
              <button
                key={label}
                onClick={() => window.location.href = '/api/auth/google'}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full glass hover:bg-white/8 whitespace-nowrap transition-all"
              >
                <span className="text-lg">{emoji}</span>
                <span className="text-xs font-medium text-gray-300">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Online Astrologers ────────────────────────────────── */}
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Online Astrologers</h2>
              <p className="text-xs text-gray-500">Connect instantly &bull; Available now</p>
            </div>
            <Link href="/astrologers">
              <Button variant="ghost" size="sm" className="text-[#E91E8C] hover:text-[#F23D9E] hover:bg-white/5 font-semibold gap-1">
                See All <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(astrologers?.slice(0, 6) || Array.from({ length: 6 })).map((astrologer: any, idx) => (
              <div
                key={astrologer?.id || idx}
                className="astronex-card p-4 hover:border-[#E91E8C]/20 transition-all duration-300"
              >
                <div className="flex gap-3">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-14 h-14 avatar-glow">
                      <AvatarImage src={astrologer?.profileImageUrl || undefined} />
                      <AvatarFallback className="gradient-primary text-white font-semibold text-lg">
                        {astrologer?.name?.charAt(0) || 'A'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-[#0D0D0D]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="font-semibold text-sm text-white truncate">{astrologer?.name || 'Astrologer'}</h3>
                      {astrologer?.isVerified && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#E91E8C] flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      {astrologer?.specializations?.slice(0, 2).join(', ') || 'Vedic, Numerology'}
                    </p>
                    <p className="text-[11px] text-gray-600 truncate">
                      {astrologer?.languages?.join(', ') || 'Hindi, English'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-[#D4A853] text-[#D4A853]" />
                        <span className="text-xs font-semibold text-gray-300">{astrologer?.rating || '4.9'}</span>
                      </div>
                      <span className="text-gray-600 text-xs">&bull;</span>
                      <span className="text-[11px] text-gray-500">
                        {astrologer?.experience || '8'}yr exp
                      </span>
                      <span className="text-gray-600 text-xs">&bull;</span>
                      <span className="text-[11px] text-gray-500">
                        {astrologer?.totalConsultations || '2.5K'} orders
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-[#D4A853]">₹{astrologer?.pricePerMinute || '25'}</div>
                    <div className="text-[10px] text-gray-600">/min</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    className="gradient-primary hover:opacity-90 text-white font-medium rounded-xl h-8 text-xs"
                    onClick={() => window.location.href = '/api/auth/google'}
                    data-testid={`button-chat-${astrologer?.id}`}
                  >
                    <MessageCircle className="w-3 h-3 mr-1" /> Chat
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600/20 hover:bg-green-600/30 text-green-400 font-medium rounded-xl h-8 text-xs border border-green-600/20"
                    onClick={() => window.location.href = '/api/auth/google'}
                    data-testid={`button-call-${astrologer?.id}`}
                  >
                    <Phone className="w-3 h-3 mr-1" /> Call
                  </Button>
                  <Button
                    size="sm"
                    className="glass text-gray-300 hover:text-white font-medium rounded-xl h-8 text-xs"
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

      {/* ─── Free Kundli Banner ────────────────────────────────── */}
      <div className="py-4 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="astronex-card overflow-hidden relative p-6 flex flex-col md:flex-row items-center gap-4">
            <div className="absolute inset-0 bg-gradient-to-r from-[#7B2FBE]/20 to-[#E91E8C]/10" />
            <div className="relative flex-1">
              <h3 className="text-xl font-semibold text-white mb-1">Free Kundli Report</h3>
              <p className="text-gray-400 text-sm">Get your detailed birth chart with planetary positions, dashas, doshas & remedies.</p>
            </div>
            <Link href="/kundli/matchmaking">
              <Button className="relative gradient-primary hover:opacity-90 text-white font-semibold rounded-full px-6 shadow-lg">
                Generate Free Kundli <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Kundli Matching Banner ────────────────────────────── */}
      <div className="py-4 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="astronex-card overflow-hidden relative p-6 flex flex-col md:flex-row items-center gap-4">
            <div className="absolute inset-0 bg-gradient-to-r from-[#D4A853]/10 to-[#E91E8C]/10" />
            <div className="relative flex-1">
              <h3 className="text-xl font-semibold text-white mb-1">Kundli Matching</h3>
              <p className="text-gray-400 text-sm">Find your compatibility score with 36 Gunas Ashtakoot matching.</p>
            </div>
            <Link href="/kundli/matchmaking">
              <Button className="relative gradient-primary hover:opacity-90 text-white font-semibold rounded-full px-6 shadow-lg">
                Match Kundli <Heart className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Stats ─────────────────────────────────────────────── */}
      <div className="py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div key={label} className="text-center p-5 astronex-card">
                <Icon className="w-6 h-6 text-[#E91E8C] mx-auto mb-2" />
                <div className="text-2xl font-semibold text-white">{value}</div>
                <div className="text-xs text-gray-500 font-medium mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Why Navagraha ─────────────────────────────────────── */}
      <div className="py-10">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-xl font-semibold text-center text-white mb-6">Why Millions Trust Navagraha</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: 'Verified Experts', desc: 'Every astrologer undergoes rigorous verification for quality and authenticity.', gradient: 'from-[#7B2FBE] to-[#5B1F8E]' },
              { icon: Zap, title: 'Instant Connection', desc: 'Connect with an available astrologer within seconds — no waiting needed.', gradient: 'from-[#E91E8C] to-[#C0156E]' },
              { icon: Award, title: 'Accurate Predictions', desc: 'Traditional Vedic methods with modern AI tools for precise readings.', gradient: 'from-[#D4A853] to-[#A88340]' },
            ].map(({ icon: Icon, title, desc, gradient }) => (
              <div key={title} className="astronex-card p-5">
                <div className={`w-11 h-11 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-base text-white mb-1">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Big CTA ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden py-16">
        <div className="absolute inset-0 celestial-bg" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(233,30,140,0.12) 0%, transparent 70%)' }} />
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-5 glow-pink">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-white mb-3">
            Start Your Cosmic Journey
          </h2>
          <p className="text-gray-400 text-base mb-8 max-w-md mx-auto">
            Join 5 crore+ users who trust Navagraha for life's important decisions
          </p>
          <Button
            size="lg"
            className="gradient-primary hover:opacity-90 text-white text-lg font-semibold h-14 px-10 rounded-full shadow-xl glow-pink"
            onClick={() => window.location.href = '/api/auth/google'}
            data-testid="button-cta-login"
          >
            Get FREE First Consultation
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>

      {/* ─── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Navagraha</span>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-gray-500">
              <Link href="/astrologers" className="hover:text-[#E91E8C] transition-colors">Astrologers</Link>
              <Link href="/astrologer/login" className="hover:text-[#E91E8C] transition-colors">For Astrologers</Link>
              <Link href="/kundli/matchmaking" className="hover:text-[#E91E8C] transition-colors">Free Kundli</Link>
              <Link href="/numerology" className="hover:text-[#E91E8C] transition-colors">Numerology</Link>
            </div>
            <div className="text-sm text-gray-700">
              &copy; {new Date().getFullYear()} Navagraha
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
