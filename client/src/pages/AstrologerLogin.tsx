import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Star, Eye, EyeOff, ArrowLeft, Phone } from 'lucide-react';

export default function AstrologerLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast({ title: 'Required', description: 'Email and password are required', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/astrologer/auth/login', {
        email: loginEmail,
        password: loginPassword,
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: 'Welcome back!', description: `Logged in as ${data.name}` });
        navigate('/astrologer/dashboard');
      } else {
        toast({ title: 'Login Failed', description: data.message || 'Invalid credentials', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Login failed. Please try again.', variant: 'destructive' });
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
      const response = await apiRequest('POST', '/api/astrologer/auth/register', {
        name: regName,
        email: regEmail,
        phoneNumber: regPhone,
        password: regPassword,
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: 'Account Created!', description: 'Welcome to Navagraha. Complete your profile to start receiving clients.' });
        navigate('/astrologer/dashboard');
      } else {
        toast({ title: 'Registration Failed', description: data.message || 'Please try again', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Registration failed. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to App
          </Button>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Star className="w-8 h-8 text-amber-500 fill-amber-500" />
              <span className="text-3xl font-bold text-foreground font-serif">Navagraha</span>
            </div>
            <h2 className="text-xl font-semibold text-foreground">Astrologer Portal</h2>
            <p className="text-muted-foreground mt-1">Join our platform and start earning</p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="login">
                <TabsList className="w-full mb-6">
                  <TabsTrigger value="login" className="flex-1">Sign In</TabsTrigger>
                  <TabsTrigger value="register" className="flex-1">Join Us</TabsTrigger>
                </TabsList>

                {/* Login Tab */}
                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        value={loginEmail}
                        onChange={e => setLoginEmail(e.target.value)}
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
                          onChange={e => setLoginPassword(e.target.value)}
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
                      {isLoading ? <LoadingSpinner size="sm" /> : 'Sign In'}
                    </Button>
                  </form>
                </TabsContent>

                {/* Register Tab */}
                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                      <Label htmlFor="reg-name">Full Name</Label>
                      <Input
                        id="reg-name"
                        placeholder="Pandit Ramesh Sharma"
                        value={regName}
                        onChange={e => setRegName(e.target.value)}
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
                        onChange={e => setRegEmail(e.target.value)}
                        className="mt-1"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="reg-phone">Phone Number</Label>
                      <div className="relative mt-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="reg-phone"
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={regPhone}
                          onChange={e => setRegPhone(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="reg-password">Password</Label>
                      <div className="relative mt-1">
                        <Input
                          id="reg-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Min 8 characters"
                          value={regPassword}
                          onChange={e => setRegPassword(e.target.value)}
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
                        onChange={e => setRegConfirm(e.target.value)}
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
              </Tabs>
            </CardContent>
          </Card>

          {/* Benefits */}
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[
              { label: '75%', sub: 'Earnings share' },
              { label: '24/7', sub: 'Platform support' },
              { label: 'T+2', sub: 'Fast payouts' },
            ].map(({ label, sub }) => (
              <div key={sub} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="text-xl font-bold text-amber-600">{label}</div>
                <div className="text-xs text-muted-foreground">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
