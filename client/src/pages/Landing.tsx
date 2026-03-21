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
  CheckCircle2, Sun, ArrowRight, Flame, Mail, Lock, User, Gift
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Astrologer } from '@shared/schema';

const CATEGORIES = [
  { label: 'Talk to\nAstrologer', icon: Phone, href: '/astrologers', color: 'bg-nava-teal' },
  { label: 'Chat with\nAstrologer', icon: MessageCircle, href: '/astrologers', color: 'bg-nava-magenta' },
  { label: 'AI\nAstrologer', icon: Sparkles, href: '/ai-astrologer', color: 'bg-nava-amber' },
  { label: 'Book\nA Pooja', icon: Flame, href: '/store', color: 'bg-nava-navy' },
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

  const authMutation = useMutation({
    mutationFn: async () => {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login'
        ? { email, password }
        : { email, password, firstName };
      const res = await apiRequest('POST', endpoint, body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Authentication failed');
      }
      return res.json();
    },
    onSuccess: () => { window.location.href = '/'; },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden font-sans">

      {/* ─── Header ────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 inset-x-0 z-50 px-4 pt-4 pb-3 bg-background/80 backdrop-blur-md border-b border-border/30"
      >
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-nava-magenta flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-foreground">Navagraha</span>
          </div>
          <Button
            className="bg-nava-teal hover:bg-nava-teal/90 text-white font-semibold rounded-full px-5 h-9"
            onClick={() => setAuthOpen(true)}
          >
            Sign In
          </Button>
        </div>
      </motion.header>

      {/* ─── Hero Section ─── */}
      <div className="relative pt-24 pb-8 px-4">
        <div className="max-w-lg mx-auto">
          {/* Branding */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex items-center justify-between mb-4"
          >
            <div>
              <h1 className="font-bold text-2xl text-foreground">Navagraha</h1>
              <div className="flex items-center gap-1.5 text-nava-teal font-medium text-xs">
                <Sparkles className="w-3 h-3 fill-nava-amber text-nava-amber" />
                <span>Nine Celestial Powers</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-nava-amber/20 flex items-center justify-center">
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
            className="bg-card rounded-2xl p-4 shadow-sm border border-border/50 mb-6"
          >
            <h2 className="font-bold text-xl text-foreground mb-1">
              Namaste, Seeker 🙏
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
            className="relative overflow-hidden rounded-3xl bg-nava-magenta p-6 mb-6 cursor-pointer shadow-md"
            onClick={() => setAuthOpen(true)}
          >
            {/* Background decorative circles */}
            <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-24 h-24 border-[20px] border-white/10 rounded-full" />
            <div className="absolute -right-6 -bottom-6 w-28 h-28 border-[24px] border-white/10 rounded-full" />

            <div className="relative z-10 text-center flex flex-col items-center">
              <div className="flex gap-2 justify-center mb-3">
                <Sparkles className="w-4 h-4 text-white/70" />
                <Sparkles className="w-5 h-5 text-white" />
                <Sparkles className="w-4 h-4 text-white/70" />
              </div>
              
              <h3 className="text-white font-bold text-xl mb-2">First Consultation Free</h3>
              <p className="text-white/90 text-sm font-medium mb-4">Connect with expert astrologers</p>
              
              <button className="bg-nava-amber hover:bg-nava-amber/90 text-nava-navy font-bold rounded-full px-6 py-2.5 transition-all hover:scale-105 shadow-md">
                Talk to Astrologer
              </button>
            </div>
          </motion.div>

          {/* First-recharge bonus banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex justify-center mb-3"
          >
            <div
              className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-4 py-2 shadow-sm cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
              onClick={() => setAuthOpen(true)}
            >
              <Gift className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Get up to 25% bonus on first recharge</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
            </div>
          </motion.div>

          {/* Live Count Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="flex justify-center mb-6"
          >
            <div className="inline-flex items-center gap-2 bg-card rounded-full px-4 py-2 shadow-sm border border-border/50">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-muted-foreground">
                {onlineCount > 0 ? `${onlineCount} astrologers online` : 'Astrologers available now'}
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ─── Quick Actions Grid ───────────────────────────────── */}
      <div className="py-6 px-4">
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
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
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
      <div className="py-8 px-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-lg text-foreground">Online Astrologers</h2>
              <p className="text-sm text-muted-foreground">Connect instantly with experts</p>
            </div>
            <Link href="/astrologers">
              <button className="text-nava-teal font-semibold text-sm flex items-center gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </Link>
          </div>

          <div className="space-y-3">
            {(astrologers?.slice(0, 3) || Array.from({ length: 3 })).map((astrologer: any, idx) => (
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
                  <p className="text-xs text-nava-teal font-medium mb-1">
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
                    <span className="font-bold text-nava-teal">₹{astrologer?.pricePerMinute || '25'}</span>
                    <span className="text-xs text-muted-foreground">/min</span>
                  </div>
                  <Button
                    size="sm"
                    className="bg-nava-teal hover:bg-nava-teal/90 text-white font-semibold rounded-full px-4 h-8"
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
      <div className="py-12 px-4">
        <div className="max-w-lg mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl font-bold text-foreground mb-3">
              Ready to explore your destiny?
            </h2>
            <p className="text-muted-foreground mb-6">
              Join thousands of seekers who have found clarity through Navagraha.
            </p>
            <Button
              size="lg"
              className="bg-nava-magenta hover:bg-nava-magenta/90 text-white font-bold rounded-full px-8 h-12"
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
              className="w-full bg-nava-teal hover:bg-nava-teal/90 text-white font-semibold rounded-xl h-11"
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
                className="text-nava-teal font-semibold hover:underline"
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
              <div className="w-8 h-8 rounded-lg bg-nava-magenta flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
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
