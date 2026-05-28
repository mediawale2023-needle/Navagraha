import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import {
  Star, MessageCircle, Phone, Sparkles,
  Heart, ChevronRight,
  CheckCircle2, Sun, ArrowRight, Calendar, Mail, Lock, User, Gift
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Astrologer } from '@shared/schema';

const CATEGORIES = [
  { label: 'Talk to\nAstrologer', icon: Phone, href: '/astrologers', color: 'bg-nava-teal' },
  { label: 'Chat with\nAstrologer', icon: MessageCircle, href: '/astrologers', color: 'bg-nava-magenta' },
  { label: 'Daily\nHoroscope', icon: Sparkles, href: '/horoscope', color: 'bg-nava-amber' },
  { label: 'Book\nAppointment', icon: Calendar, href: '/schedule', color: 'bg-nava-navy' },
  { label: 'Birth\nChart', icon: Sun, href: '/kundli/new', color: 'bg-nava-teal' },
  { label: 'Match\nMaking', icon: Heart, href: '/kundli/matchmaking', color: 'bg-nava-magenta' },
];

export default function Landing() {
  const { data: astrologers } = useQuery<Astrologer[]>({ queryKey: ['/api/astrologers'] });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const { toast } = useToast();

  const onlineCount = astrologers?.filter((a: Astrologer) => a.availability === 'online').length ?? 0;
  const featuredAstrologers = astrologers?.slice(0, 4) || [];

  const authMutation = useMutation({
    mutationFn: async () => {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login'
        ? { email, password }
        : { email, password, firstName };
      // apiRequest throws on non-2xx and returns parsed JSON
      return await apiRequest('POST', endpoint, body);
    },
    onSuccess: () => { window.location.href = '/'; },
    onError: (err: any) => {
      // Strip the leading "4xx: " prefix from throwIfResNotOk errors
      const msg = err.message?.replace(/^\d{3}:\s*/, '') || 'Authentication failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  return (
    <div className="yantra-shell min-h-screen overflow-hidden text-foreground font-sans">

      {/* ─── Header ────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/80 px-4 pt-4 pb-3 backdrop-blur-md"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary/20">
              <Sparkles className="w-5 h-5 text-[var(--primary-border)]" />
            </div>
            <span className="font-display text-lg text-foreground">Navagraha</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-9 rounded-[9px] bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={() => setAuthOpen(true)}
            >
              Sign In
            </Button>
          </div>
        </div>
      </motion.header>

      {/* ─── Hero Section ─── */}
      <div className="relative pt-24 pb-8 px-4 md:px-6">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] lg:items-start">
          <div>
          {/* Branding */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex items-center justify-between mb-4"
          >
            <div>
              <h1 className="font-display text-3xl text-foreground">Navagraha</h1>
              <div className="flex items-center gap-1.5 text-[var(--primary-border)] font-medium text-xs">
                <Sparkles className="w-3 h-3 text-[var(--primary-border)]" />
                <span>Nine Celestial Powers</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-primary/20">
              <img 
                src="https://em-content.zobj.net/source/apple/391/ringed-planet_1fa90.png" 
                alt="Saturn" 
                className="w-8 h-8"
              />
            </div>
          </motion.div>

          {/* Greeting Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="yantra-card mb-5 p-5"
          >
            <h2 className="font-display text-[1.9rem] leading-[1.05] text-foreground mb-1">
              Seeker,
              <br />
              the stars are listening.
            </h2>
            <p className="text-muted-foreground text-sm">
              How can the stars guide you today?
            </p>
          </motion.div>

          {/* Promotional Banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="gradient-spiritual relative mb-5 cursor-pointer overflow-hidden rounded-[12px] border border-[var(--primary-border)] p-6 shadow-md"
            onClick={() => setAuthOpen(true)}
          >
            <svg aria-hidden="true" className="absolute -right-6 -top-6 h-36 w-36 opacity-25" viewBox="0 0 160 160" fill="none">
              <rect x="10" y="10" width="140" height="140" transform="rotate(45 80 80)" stroke="currentColor" strokeWidth="1.4" />
              <rect x="34" y="34" width="92" height="92" transform="rotate(45 80 80)" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="80" cy="80" r="18" stroke="currentColor" strokeWidth="1.4" />
            </svg>

            <div className="relative z-10 text-center flex flex-col items-center">
              <div className="flex gap-2 justify-center mb-3">
                <Sparkles className="w-4 h-4 text-white/70" />
                <Sparkles className="w-5 h-5 text-white" />
                <Sparkles className="w-4 h-4 text-white/70" />
              </div>
              
              <h3 className="font-display text-[var(--nava-navy)] text-2xl mb-2">First Consultation Free</h3>
              <p className="text-[var(--nava-navy)]/80 text-sm font-medium mb-4">Connect with expert astrologers</p>
              
              <button className="rounded-[9px] bg-nava-navy px-6 py-2.5 font-bold text-primary transition-all hover:scale-105 shadow-md">
                Talk to Astrologer
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid grid-cols-2 gap-3"
          >
            <div className="yantra-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xl font-bold text-foreground">{onlineCount || '24+'}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Astrologers available right now</p>
            </div>
            <div
              className="yantra-card cursor-pointer border-primary/30 bg-primary/10 p-4 transition-colors hover:bg-primary/15"
              onClick={() => setAuthOpen(true)}
            >
              <div className="flex items-center gap-2 text-[var(--primary-border)]">
                <Gift className="w-4 h-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">Bonus</p>
              </div>
              <p className="mt-2 font-display text-lg text-foreground">Up to 25% extra</p>
              <p className="mt-1 text-sm text-muted-foreground">On your first wallet recharge</p>
            </div>
          </motion.div>
          </div>

          <motion.aside
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="space-y-4"
          >
            <div className="yantra-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Start Here</p>
                  <h3 className="mt-2 text-xl font-bold text-foreground">Get answers in minutes</h3>
                </div>
                <div className="rounded-[8px] bg-primary/20 p-3">
                  <Sparkles className="w-5 h-5 text-[var(--primary-border)]" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {CATEGORIES.slice(0, 4).map(({ label, href, icon: Icon, color }) => (
                  <Link key={label} href={href}>
                    <button className={`w-full rounded-[10px] p-4 text-left shadow-sm transition-transform hover:-translate-y-0.5 ${color} ${color === 'bg-nava-amber' ? 'text-[var(--nava-navy)]' : 'text-white'}`}>
                      <Icon className="w-5 h-5 mb-3" />
                      <span className="block text-sm font-semibold leading-snug whitespace-pre-line">{label}</span>
                    </button>
                  </Link>
                ))}
              </div>
            </div>

            <div className="yantra-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg text-foreground">Trusted Experts</h3>
                  <p className="text-sm text-muted-foreground">Shortlist before you sign in</p>
                </div>
                <Link href="/astrologers" className="border-b border-foreground pb-0.5 text-sm font-semibold text-foreground">Browse</Link>
              </div>
              <div className="space-y-3">
                {featuredAstrologers.map((astrologer) => (
                  <div key={astrologer.id} className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-3">
                    <Avatar className="w-11 h-11 border border-border">
                      <AvatarImage src={astrologer.profileImageUrl || undefined} className="object-cover" />
                      <AvatarFallback className="bg-nava-navy text-white">
                        {astrologer.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-foreground">{astrologer.name}</p>
                        {astrologer.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-nava-amber shrink-0" />}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{astrologer.specializations?.[0] || 'Vedic Astrology'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-sm text-[var(--primary-border)]">₹{astrologer.pricePerMinute || '25'}</p>
                      <p className="text-xs text-muted-foreground">per min</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        </div>
      </div>

      {/* ─── Quick Actions Grid ───────────────────────────────── */}
      <div className="py-6 px-4 md:px-6 lg:hidden">
        <div className="max-w-lg mx-auto">
          <h2 className="font-bold text-lg text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-3">
            {CATEGORIES.map(({ label, icon: Icon, href, color }, idx) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * idx }}
              >
                <Link href={href}>
                  <button
                    className={`w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 ${color} hover:opacity-90 transition-opacity shadow-sm`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-white/20">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-white text-center leading-tight whitespace-pre-line">
                      {label}
                    </span>
                  </button>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Featured Astrologers ────────────────────────── */}
      <div className="py-8 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-lg text-foreground">Online Astrologers</h2>
              <p className="text-sm text-muted-foreground">Connect instantly with experts</p>
            </div>
            <Link href="/astrologers">
              <button className="flex items-center gap-1 border-b border-foreground pb-0.5 text-sm font-semibold text-foreground">
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(astrologers?.slice(0, 6) || Array.from({ length: 6 })).map((astrologer: any, idx) => (
              <motion.div
                key={astrologer?.id || idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="bg-card rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-border/50"
              >
                <div className="relative shrink-0">
                  <Avatar className="w-14 h-14 border-2 border-nava-teal/20">
                    <AvatarImage src={astrologer?.profileImageUrl || undefined} className="object-cover" />
                    <AvatarFallback className="bg-nava-navy text-white font-bold text-lg">
                      {astrologer?.name?.charAt(0) || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-card" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <h3 className="font-bold text-sm text-foreground truncate">{astrologer?.name || 'Astrologer Name'}</h3>
                    {astrologer?.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-nava-amber shrink-0" />}
                  </div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {astrologer?.specializations?.[0] || 'Vedic Astrology'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-nava-amber text-nava-amber" />
                      {astrologer?.rating || '4.9'}
                    </span>
                    <span>|</span>
                    <span>{astrologer?.experience || '10'}y exp</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="mb-2">
                    <span className="font-display text-[var(--primary-border)]">₹{astrologer?.pricePerMinute || '25'}</span>
                    <span className="text-xs text-muted-foreground">/min</span>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 rounded-[9px] bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90"
                    onClick={() => setAuthOpen(true)}
                  >
                    Connect
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── CTA Section ─────────────────────────────── */}
      <div className="py-12 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-[2rem] border border-border/60 bg-gradient-to-r from-card via-card to-nava-lavender/40 px-6 py-8 text-center shadow-sm md:px-12"
          >
            <h2 className="text-2xl font-bold text-foreground mb-3">
              Ready to explore your destiny?
            </h2>
            <p className="text-muted-foreground mb-6">
              Join thousands of seekers who have found clarity through Navagraha.
            </p>
            <Button
              size="lg"
              className="h-12 rounded-[9px] bg-nava-navy px-8 font-bold text-primary hover:bg-nava-navy/90"
              onClick={() => setAuthOpen(true)}
            >
              Start Your Journey
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
        </div>
      </div>

      {/* ─── Auth Dialog ─────────────────────────────────── */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-bold">
              {authMode === 'login' ? 'Welcome back' : 'Create account'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {authMode === 'register' && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                onKeyDown={(e) => e.key === 'Enter' && authMutation.mutate()}
              />
            </div>

            <Button
              className="h-11 w-full rounded-[9px] bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={() => authMutation.mutate()}
              disabled={authMutation.isPending || !email || !password}
            >
              {authMutation.isPending ? 'Please wait…' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <Button
              variant="outline"
              className="w-full rounded-xl h-11 font-semibold"
              onClick={() => { window.location.href = '/api/auth/google'; }}
            >
              <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4 mr-2" />
              Continue with Google
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                className="border-b border-foreground pb-0.5 font-semibold text-foreground"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              >
                {authMode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-border/50 py-8 px-4 bg-card">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-primary/20">
                <Sparkles className="w-4 h-4 text-[var(--primary-border)]" />
              </div>
              <span className="font-bold text-foreground">Navagraha</span>
            </div>
            <Link href="/astrologer/login">
              <span className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Astrologer Portal
              </span>
            </Link>
          </div>

          <div className="flex gap-6 text-sm text-muted-foreground mb-6">
            <Link href="/astrologers" className="hover:text-foreground transition-colors">Astrologers</Link>
            <Link href="/horoscope" className="hover:text-foreground transition-colors">Horoscope</Link>
            <Link href="/kundli/new" className="hover:text-foreground transition-colors">Kundli</Link>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Navagraha. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
