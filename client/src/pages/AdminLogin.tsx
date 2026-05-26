import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ShieldCheck, Eye, EyeOff, ArrowLeft } from 'lucide-react';

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: 'Required', description: 'Email and password are required', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/auth/login', { email, password });
    } catch {
      toast({ title: 'Login failed', description: 'Invalid email or password.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    // Refresh auth state so the router treats us as logged in.
    await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });

    // Confirm this account actually has admin access (email in ADMIN_EMAILS).
    try {
      await apiRequest('GET', '/api/admin/stats');
    } catch {
      toast({
        title: 'Not an admin account',
        description: "You're signed in, but this email isn't whitelisted. Add it to ADMIN_EMAILS in the server environment.",
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    toast({ title: 'Welcome back', description: 'Signed in to the admin console.' });
    navigate('/admin/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <button className="p-2 rounded-xl hover:bg-muted" aria-label="Back to home">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <span className="font-bold">Admin Console</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold">Admin Sign In</h2>
            <p className="text-muted-foreground mt-1">Restricted to whitelisted administrator accounts</p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="mt-1"
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="admin-password">Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <LoadingSpinner size="sm" /> : 'Sign In'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground mt-6">
            Admin access is granted by adding your email to the <code className="font-mono">ADMIN_EMAILS</code> server
            variable. Don't have an account yet?{' '}
            <Link href="/" className="underline hover:text-foreground">Create one here</Link>, then return.
          </p>
        </div>
      </div>
    </div>
  );
}
