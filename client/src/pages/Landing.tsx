import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Star, Users, MessageCircle, Phone, Sparkles,
  Heart, TrendingUp, Shield, Clock, ChevronRight,
  CheckCircle2, Zap, Award
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

const CATEGORIES = [
  { label: 'Love & Relationship', emoji: '❤️' },
  { label: 'Marriage', emoji: '💍' },
  { label: 'Career & Business', emoji: '💼' },
  { label: 'Finance', emoji: '💰' },
  { label: 'Health', emoji: '🌿' },
  { label: 'Family', emoji: '👨‍👩‍👧' },
];

const STATS = [
  { value: '5 Cr+', label: 'Customers' },
  { value: '10K+', label: 'Astrologers' },
  { value: '50 Cr+', label: 'Minutes of Consultation' },
  { value: '4.8★', label: 'Avg Rating' },
];

export default function Landing() {
  const [liveCount, setLiveCount] = useState(342);

  const { data: astrologers } = useQuery<Astrologer[]>({ queryKey: ['/api/astrologers'] });

  useEffect(() => {
    const t = setInterval(() => {
      setLiveCount(prev => prev + Math.floor(Math.random() * 3) - 1);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const onlineAstrologers = astrologers?.filter(a => a.isOnline || a.availability === 'available') || [];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FFCF23] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[#1A1A1A]" />
              <span className="font-bold text-xl text-[#1A1A1A] tracking-tight">Navagraha</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/astrologer/login">
                <Button variant="ghost" size="sm" className="text-[#1A1A1A] hover:bg-[#1A1A1A]/10 font-medium">
                  Astrologer Login
                </Button>
              </Link>
              <Button
                size="sm"
                className="bg-[#1A1A1A] text-[#FFCF23] hover:bg-[#333] font-semibold"
                onClick={() => window.location.href = '/api/auth/google'}
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Free consultation banner */}
      <div className="bg-green-500 text-white text-center py-2 text-sm font-semibold tracking-wide">
        🎉 First consultation FREE for new users — No credit card required!
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[#FFCF23] via-[#FFD93D] to-[#FFF0A0] pt-12 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-[#1A1A1A]/10 rounded-full px-4 py-1.5 mb-6">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-semibold text-[#1A1A1A]">
                {liveCount} Astrologers Online Right Now
              </span>
            </div>

            <h1 className="font-bold text-4xl md:text-6xl text-[#1A1A1A] mb-4 leading-tight">
              India's #1 Vedic<br />Astrology Platform
            </h1>
            <p className="text-lg md:text-xl text-[#1A1A1A]/70 mb-8 max-w-xl mx-auto">
              Talk to expert astrologers via chat or call. Get guidance on love, career, marriage & more.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                className="bg-[#1A1A1A] text-[#FFCF23] hover:bg-[#333] text-lg font-bold h-14 px-8 rounded-xl"
                onClick={() => window.location.href = '/api/auth/google'}
                data-testid="button-login"
              >
                Talk to Astrologer
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
              <Link href="/astrologers">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-[#1A1A1A] text-[#1A1A1A] bg-transparent hover:bg-[#1A1A1A]/10 text-lg font-semibold h-14 px-8 rounded-xl"
                  data-testid="button-explore-guest"
                >
                  Browse Astrologers
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {STATS.map(({ value, label }) => (
              <div key={label} className="bg-white/70 backdrop-blur rounded-2xl p-4 text-center shadow-sm">
                <div className="text-2xl font-bold text-[#1A1A1A]">{value}</div>
                <div className="text-xs text-[#1A1A1A]/60 font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="py-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-5">What do you seek guidance on?</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {CATEGORIES.map(({ label, emoji }) => (
              <button
                key={label}
                onClick={() => window.location.href = '/api/auth/google'}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-gray-100 hover:border-[#FFCF23] hover:bg-[#FFFBEA] transition-all group cursor-pointer"
              >
                <span className="text-3xl">{emoji}</span>
                <span className="text-xs font-semibold text-[#1A1A1A] text-center leading-tight group-hover:text-[#1A1A1A]">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Astrologers */}
      <div className="py-10 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-[#1A1A1A]">Top Astrologers Online</h2>
              <p className="text-sm text-gray-500 mt-0.5">Consult now — Available immediately</p>
            </div>
            <Link href="/astrologers">
              <Button variant="ghost" className="text-[#1A1A1A] font-semibold gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(astrologers?.slice(0, 6) || Array.from({ length: 3 })).map((astrologer: any, idx) => (
              <div
                key={astrologer?.id || idx}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={astrologer?.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-[#FFCF23] text-[#1A1A1A] font-bold text-xl">
                        {astrologer?.name?.charAt(0) || 'A'}
                      </AvatarFallback>
                    </Avatar>
                    {(astrologer?.isOnline || astrologer?.availability === 'available') && (
                      <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-[#1A1A1A] truncate">{astrologer?.name || 'Astrologer'}</h3>
                      {astrologer?.isVerified && (
                        <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {astrologer?.specializations?.slice(0, 2).join(' • ') || 'Vedic Astrology'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-0.5">
                        <Star className="w-3.5 h-3.5 fill-[#FFCF23] text-[#FFCF23]" />
                        <span className="text-xs font-bold">{astrologer?.rating || '4.9'}</span>
                      </div>
                      <span className="text-gray-300">•</span>
                      <span className="text-xs text-gray-500">{astrologer?.totalConsultations || '1.2K'}+ consultations</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-green-500" />
                      <span className="text-xs text-green-600 font-medium">Responds in ~2 min</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-[#1A1A1A]">₹{astrologer?.pricePerMinute || '25'}</div>
                    <div className="text-xs text-gray-400">/min</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    className="bg-[#FFCF23] text-[#1A1A1A] hover:bg-[#F5C500] font-semibold rounded-xl"
                    onClick={() => window.location.href = '/api/auth/google'}
                    data-testid={`button-chat-${astrologer?.id}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5 mr-1" /> Chat
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#1A1A1A] text-[#1A1A1A] hover:bg-gray-50 font-semibold rounded-xl"
                    onClick={() => window.location.href = '/api/auth/google'}
                    data-testid={`button-call-${astrologer?.id}`}
                  >
                    <Phone className="w-3.5 h-3.5 mr-1" /> Call
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why Navagraha */}
      <div className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center text-[#1A1A1A] mb-8">Why Millions Trust Navagraha</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Shield, title: 'Verified Experts', desc: 'Every astrologer goes through a rigorous verification process to ensure quality and authenticity.' },
              { icon: Zap, title: 'Instant Connection', desc: 'Connect with an available astrologer within seconds — no waiting, no scheduling needed.' },
              { icon: Award, title: 'Accurate Predictions', desc: 'Our astrologers use traditional Vedic methods combined with modern tools for precise readings.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center p-6 rounded-2xl bg-[#FFFBEA] border border-[#FFCF23]/30">
                <div className="w-14 h-14 bg-[#FFCF23] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-7 h-7 text-[#1A1A1A]" />
                </div>
                <h3 className="font-bold text-lg text-[#1A1A1A] mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Big CTA */}
      <div className="bg-[#1A1A1A] py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Sparkles className="w-12 h-12 text-[#FFCF23] mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Start Your Cosmic Journey Today
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            Join 5 crore+ users who trust Navagraha for life's important decisions
          </p>
          <Button
            size="lg"
            className="bg-[#FFCF23] text-[#1A1A1A] hover:bg-[#F5C500] text-lg font-bold h-14 px-10 rounded-xl"
            onClick={() => window.location.href = '/api/auth/google'}
            data-testid="button-cta-login"
          >
            Get FREE First Consultation
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#111] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#FFCF23]" />
              <span className="font-bold text-white">Navagraha</span>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-gray-500">
              <Link href="/astrologers" className="hover:text-white transition-colors">Astrologers</Link>
              <Link href="/astrologer/login" className="hover:text-white transition-colors">For Astrologers</Link>
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
            <div className="text-sm text-gray-600">
              © {new Date().getFullYear()} Navagraha
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
