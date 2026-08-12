import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Star, Eye, EyeOff, ArrowLeft, Sparkles } from 'lucide-react';

export default function AstrologerLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('login');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [proEmail, setProEmail] = useState('');
  const [proPassword, setProPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const handleLogin = async (e: React.FormEvent, destination: 'dashboard' | 'pro') => {
    e.preventDefault();
    const email = destination === 'pro' ? proEmail : loginEmail;
    const password = destination === 'pro' ? proPassword : loginPassword;
    if (!email || !password) {
      toast({ title: 'Required', description: 'Email and password are required', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const data = await apiRequest('POST', '/api/astrologer/auth/login', { email, password });
      toast({
        title: destination === 'pro' ? 'Welcome to Pro' : 'Welcome back!',
        description: `Logged in as ${data.name}`,
      });
      navigate(destination === 'pro' ? '/astrologer/pro' : '/astrologer/dashboard');
    } catch (err: any) {
      const raw = String(err?.message || '');
      let description = 'Login failed. Please try again.';
      if (/503|502|Cannot POST|Failed to fetch|NetworkError/i.test(raw)) {
        description = 'Server is unavailable (database not connected). Check Render DATABASE_URL, then retry.';
      } else if (/403/.test(raw)) {
        description = raw.replace(/^\d{3}:\s*/, '') || 'Account pending admin approval.';
      } else if (/401/.test(raw)) {
        description = 'Invalid email or password.';
      } else if (raw) {
        description = raw.replace(/^\d{3}:\s*/, '');
      }
      toast({ title: 'Error', description, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword) {
      toast({ title: 'Required', description: 'Name, email and password are required', variant: 'destructive' });
      return;
    }
    if (regPassword !== regConfirm) {
      toast({ title: 'Password Mismatch', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (regPassword.length < 8) {
      toast({ title: 'Weak Password', description: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/astrologer/auth/register', {
        name: regName,
        email: regEmail,
        phoneNumber: regPhone,
        password: regPassword,
      });
      toast({
        title: 'Account Created!',
        description: 'Your application has been submitted. Admin will review and approve your account within 24 hours.',
      });
      navigate('/astrologer/dashboard');
    } catch {
      toast({ title: 'Error', description: 'Registration failed. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white/3 flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <button className="p-2 rounded-xl hover:bg-muted">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        </Link>
        <span className="font-bold text-foreground">Astrologer Portal</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-14 h-14 bg-nava-royal-purple rounded-2xl flex items-center justify-center mx-auto">
                <Star className="w-8 h-8 text-white fill-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Astrologer Portal</h2>
            <p className="text-gray-500 mt-1">Marketplace earnings or Pro practice tools</p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full mb-6 grid grid-cols-3">
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                  <TabsTrigger value="register">Join Us</TabsTrigger>
                  <TabsTrigger value="pro" className="gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Pro
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={(e) => handleLogin(e, 'dashboard')} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Sign in to your marketplace dashboard — go online, take chats, manage payouts.
                    </p>
                    <div>
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="mt-1"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative mt-1">
                        <Input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <LoadingSpinner size="sm" /> : 'Sign In to Marketplace'}
                    </Button>
                    <button
                      type="button"
                      className="w-full text-sm text-primary hover:underline"
                      onClick={() => setActiveTab('pro')}
                    >
                      Looking for Pro practice tools? Open Pro →
                    </button>
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                      <Label htmlFor="reg-name">Full Name</Label>
                      <Input
                        id="reg-name"
                        placeholder="Your name"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="mt-1"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="reg-email">Email</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        placeholder="your@email.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="mt-1"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="reg-phone">Phone</Label>
                      <Input
                        id="reg-phone"
                        type="tel"
                        placeholder="+91…"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="reg-password">Password</Label>
                      <div className="relative mt-1">
                        <Input
                          id="reg-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Min 8 characters"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="reg-confirm">Confirm Password</Label>
                      <Input
                        id="reg-confirm"
                        type="password"
                        placeholder="••••••••"
                        value={regConfirm}
                        onChange={(e) => setRegConfirm(e.target.value)}
                        className="mt-1"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <LoadingSpinner size="sm" /> : 'Create Account'}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      By registering, you agree to our Terms of Service. Your profile will be reviewed within 24 hours.
                    </p>
                  </form>
                </TabsContent>

                <TabsContent value="pro">
                  <form onSubmit={(e) => handleLogin(e, 'pro')} className="space-y-4">
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <Sparkles className="w-4 h-4 text-primary" />
                        Navagraha Pro
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Practice OS for working Jyotishis — private client CRM, Swiss charts,
                        and Parashar / K.N. Rao / Kamakhya AI co-pilot for live sessions.
                      </p>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                        <li>Your own client book (not marketplace seekers)</li>
                        <li>Mid-session query box grounded in the chart</li>
                        <li>Studio plan: 80 AI credits / month included</li>
                      </ul>
                    </div>
                    <div>
                      <Label htmlFor="pro-email">Astrologer email</Label>
                      <Input
                        id="pro-email"
                        type="email"
                        placeholder="your@email.com"
                        value={proEmail}
                        onChange={(e) => setProEmail(e.target.value)}
                        className="mt-1"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="pro-password">Password</Label>
                      <div className="relative mt-1">
                        <Input
                          id="pro-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={proPassword}
                          onChange={(e) => setProPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                      {isLoading ? <LoadingSpinner size="sm" /> : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Enter Pro Workspace
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      Use the same astrologer account as the marketplace. New here? Join Us first.
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[
              { label: '75%', sub: 'Earnings share' },
              { label: 'Pro', sub: 'Practice tools' },
              { label: 'T+2', sub: 'Fast payouts' },
            ].map(({ label, sub }) => (
              <div key={sub} className="bg-nava-lavender/50 border border-border rounded-xl p-3 shadow-sm">
                <div className="text-xl font-bold text-nava-royal-purple">{label}</div>
                <div className="text-xs text-nava-royal-purple/70 font-medium">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
