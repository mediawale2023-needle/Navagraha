/**
 * Astrologer Pro — practice OS for working Jyotishis.
 * Swiss chart workspace + multi-tradition AI co-pilot + client CRM,
 * scoped to the logged-in astrologer (not the consumer marketplace).
 */
import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArrowLeft, Sparkles, LayoutDashboard, LogOut } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import JyotishReading from '@/pages/admin/JyotishReading';

interface ProUsage {
  used: number;
  limit: number;
  remaining: number;
}

export default function AstrologerPro() {
  const [, setLocation] = useLocation();

  const { data: me, isLoading: meLoading, isError } = useQuery<any>({
    queryKey: ['/api/astrologer/auth/me'],
  });

  const { data: usage } = useQuery<ProUsage>({
    queryKey: ['/api/astrologer/pro/usage'],
    enabled: !!me,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!meLoading && isError) setLocation('/astrologer/login');
  }, [meLoading, isError, setLocation]);

  const logout = async () => {
    try {
      await apiRequest('POST', '/api/astrologer/auth/logout', {});
    } finally {
      setLocation('/astrologer/login');
    }
  };

  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!me) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/astrologer/login">
              <button className="p-2 rounded-lg hover:bg-muted" aria-label="Back">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg leading-none">Navagraha Pro</h1>
                <Badge variant="secondary" className="text-[10px]">Studio</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Practice workspace · {me.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {usage && (
              <span className="hidden sm:inline text-xs text-muted-foreground mr-1">
                AI credits {usage.used}/{usage.limit} this month
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setLocation('/astrologer/dashboard')}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Marketplace
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="font-display text-2xl">Client readings</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Save private clients, compute Swiss charts, and run Parashar / K.N. Rao / Kamakhya
            co-pilot readings mid-session. Your marketplace dashboard stays separate.
          </p>
        </div>
        <JyotishReading apiBase="/api/astrologer/pro" />
      </main>
    </div>
  );
}
