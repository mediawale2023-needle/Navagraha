import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion } from 'framer-motion';
import {
  Star, Users, MessageCircle, Phone, Sparkles, Video,
  Heart, TrendingUp, Shield, Clock, ChevronRight,
  CheckCircle2, Zap, Award, Sun, Moon,
  Hash, ArrowRight
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

const HERO_BANNERS = [
  {
    title: 'Personal, clear, and intuitive astrology.',
    subtitle: 'Step into the world of AstroNex. Daily insights, guided clarity, and premium consultations all in one beautiful place.',
    cta: 'Start Your Journey',
  },
];

const CATEGORIES = [
  { label: 'Chat\nConsult', icon: MessageCircle, href: '/astrologers' },
  { label: 'Voice\nCall', icon: Phone, href: '/astrologers' },
  { label: 'Deep\nReading', icon: Video, href: '/astrologers' },
  { label: 'Birth\nChart', icon: Sun, href: '/kundli/new' },
  { label: 'Match\nMaking', icon: Heart, href: '/kundli/matchmaking' },
  { label: 'Life\nPath', icon: Hash, href: '/numerology' },
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

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-[#E27689]/30">

      {/* ─── Global Ambient Glows (True AstroNex Style) ─── */}
      <div className="fixed top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#E27689]/10 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#A24268]/15 blur-[120px] pointer-events-none" />
      <div className="fixed top-[40%] left-[60%] w-[30vw] h-[30vw] rounded-full bg-[#D4A853]/5 blur-[100px] pointer-events-none" />
      <div className="fixed inset-0 celestial-mesh opacity-30 pointer-events-none mix-blend-screen" />

      {/* ─── Header ────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 lg:px-8 pt-4 pb-4"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center glow-image">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white drop-shadow-md">Navagraha</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/astrologer/login">
              <Button variant="ghost" className="text-gray-300 hover:text-white glass-pill border-transparent hover:bg-white/10 hidden sm:flex">
                Astrologer Portal
              </Button>
            </Link>
            <Button
              className="gradient-primary text-white font-bold rounded-full px-6 h-10 glow-image transition-transform hover:scale-105"
              onClick={() => window.location.href = '/api/auth/google'}
            >
              Sign In
            </Button>
          </div>
        </div>
      </motion.header>

      {/* ─── Hero Section (Massive Typography & Floating Elements) ─── */}
      <div className="relative pt-32 pb-20 px-4 min-h-[90vh] flex flex-col justify-center items-center">
        <div className="max-w-5xl mx-auto w-full relative z-10 text-center flex flex-col items-center">

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 glass-pill px-4 py-2">
              <div className="w-2 h-2 bg-[#E27689] rounded-full animate-pulse shadow-[0_0_10px_#E27689]" />
              <span className="text-sm font-medium text-gray-200">{liveCount} premium astrologers online</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-[1.1]"
          >
            {HERO_BANNERS[0].title.split(', ').map((text, i) => (
              <span key={i} className="block">
                {text}{i !== 2 ? ',' : ''}
              </span>
            ))}
            <span className="gradient-text-accent block mt-2">with Navagraha.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed font-light"
          >
            {HERO_BANNERS[0].subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <Button
              size="lg"
              className="gradient-primary text-white text-lg font-bold h-14 px-10 rounded-full glow-image hover:scale-[1.02] transition-transform"
              onClick={() => window.location.href = '/api/auth/google'}
              data-testid="button-login"
            >
              {HERO_BANNERS[0].cta}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
        </div>

        {/* Floating Mockup Elements */}
        <motion.div
          className="absolute left-[5%] top-[20%] w-64 h-80 astronex-card hidden lg:flex flex-col p-6 animate-float opacity-80 rotate-[-5deg]"
          style={{ animationDelay: '0s' }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full gradient-primary" />
            <div>
              <div className="h-3 w-20 bg-white/20 rounded mb-2" />
              <div className="h-2 w-12 bg-white/10 rounded" />
            </div>
          </div>
          <div className="w-full h-32 rounded-2xl glass-pill mb-4 border border-white/10" />
          <div className="w-3/4 h-8 rounded-full gradient-primary opacity-80" />
        </motion.div>

        <motion.div
          className="absolute right-[5%] top-[30%] w-60 h-80 sm:w-72 sm:h-96 astronex-card hidden lg:flex flex-col p-6 animate-float opacity-80 rotate-[5deg]"
          style={{ animationDelay: '-3s' }}
        >
          <div className="flex justify-between items-center mb-6">
            <div className="h-4 w-24 bg-white/20 rounded" />
            <Moon className="w-6 h-6 text-[#D4A853]" />
          </div>
          <div className="flex-1 w-full rounded-3xl md:rounded-[2rem] border border-[#D4A853]/20 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[#D4A853]/5" />
            <div className="w-24 h-24 rounded-full border border-[#D4A853]/30" />
            <div className="w-16 h-16 rounded-full border border-[#D4A853]/50 absolute" />
          </div>
        </motion.div>
      </div>

      {/* ─── Premium Services Grid ───────────────────────────────── */}
      <div className="py-24 px-4 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Daily insights, guided clarity.</h2>
            <p className="text-gray-400 text-lg">Smart readings for growth, balance, and awareness.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-6">
            {CATEGORIES.map(({ label, icon: Icon, href }, idx) => (
              <Link key={label} href={href}>
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="w-32 sm:w-40 aspect-square astronex-card flex flex-col items-center justify-center gap-4 group hover:-translate-y-2 transition-transform duration-500 rounded-3xl md:rounded-[2rem]"
                >
                  <div className="w-16 h-16 rounded-[1.5rem] glass-pill flex items-center justify-center group-hover:bg-[#E27689]/20 group-hover:border-[#E27689]/40 transition-colors duration-500">
                    <Icon className="w-8 h-8 text-[#E27689] group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <span className="text-sm font-medium text-gray-300 text-center leading-tight whitespace-pre-line group-hover:text-white">
                    {label}
                  </span>
                </motion.button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Premium Astrologers Matrix ────────────────────────── */}
      <div className="py-24 px-4 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div>
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Elite Masters.</h2>
              <p className="text-gray-400 text-lg">Consult top-tier, highly-verified astrologers instantly.</p>
            </div>
            <Link href="/astrologers">
              <Button variant="ghost" className="glass-pill text-[#E27689] hover:text-white px-6 h-12 text-base shrink-0">
                View All Astrologers <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(astrologers?.slice(0, 6) || Array.from({ length: 6 })).map((astrologer: any, idx) => (
              <motion.div
                key={astrologer?.id || idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                className="astronex-card p-6 flex flex-col group hover:-translate-y-1 transition-transform duration-500"
              >
                <div className="flex gap-4">
                  <div className="relative shrink-0">
                    <Avatar className="w-20 h-20 rounded-[1.5rem] avatar-glow">
                      <AvatarImage src={astrologer?.profileImageUrl || undefined} className="object-cover" />
                      <AvatarFallback className="gradient-primary text-white font-bold text-2xl">
                        {astrologer?.name?.charAt(0) || 'A'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-[3px] border-[#1A1A1A]" />
                  </div>

                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg text-white">{astrologer?.name || 'Astrologer Name'}</h3>
                      {astrologer?.isVerified && <CheckCircle2 className="w-4 h-4 text-[#D4A853]" />}
                    </div>
                    <p className="text-sm text-gray-400 mb-2 font-medium">
                      {astrologer?.specializations?.slice(0, 2).join(', ') || 'Vedic, Numerology'}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <Star className="w-4 h-4 fill-[#D4A853] text-[#D4A853]" />
                      <span className="font-bold text-gray-200">{astrologer?.rating || '4.9'}</span>
                      <span className="text-gray-600">&bull;</span>
                      <span className="text-gray-400 font-medium">{astrologer?.experience || '8'}y exp</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-2xl text-[#D4A853]">₹{astrologer?.pricePerMinute || '25'}</span>
                    <span className="text-sm text-gray-500 font-medium">/min</span>
                  </div>
                  <Link href={`/chat/${astrologer?.id}`}>
                    <Button
                      className="glass-pill-active text-white font-bold h-10 px-6 hover:scale-105 transition-transform"
                    >
                      Connect
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Footer with Huge Type ─────────────────────────────── */}
      <footer className="border-t border-white/5 pt-20 pb-10 px-4 relative z-10 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10 mb-20">
            <div>
              <h2 className="text-4xl md:text-7xl font-bold tracking-tight mb-6">
                Ready to<br />explore?
              </h2>
              <Button
                size="lg"
                className="gradient-primary text-white text-lg font-bold h-14 px-10 rounded-full glow-image hover:scale-105 transition-transform"
                onClick={() => window.location.href = '/api/auth/google'}
              >
                Join Navagraha Today
              </Button>
            </div>

            <div className="flex flex-col gap-4 text-gray-400 text-lg font-medium">
              <Link href="/astrologers" className="hover:text-white transition-colors">Our Masters</Link>
              <Link href="/astrologer/login" className="hover:text-white transition-colors">Partner with Us</Link>
              <Link href="/kundli/matchmaking" className="hover:text-white transition-colors">Free Chart</Link>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-8 border-t border-white/5 text-gray-500 font-medium">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white">Navagraha © {new Date().getFullYear()}</span>
            </div>
            <div className="flex gap-8">
              <span className="hover:text-gray-300 cursor-pointer transition-colors">Privacy</span>
              <span className="hover:text-gray-300 cursor-pointer transition-colors">Terms</span>
              <span className="hover:text-gray-300 cursor-pointer transition-colors">Support</span>
            </div>
          </div>
        </div>

        {/* Massive backdrop text */}
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 text-[15vw] font-black tracking-tighter text-white/[0.02] pointer-events-none whitespace-nowrap select-none">
          NAVAGRAHA
        </div>
      </footer>
    </div>
  );
}
