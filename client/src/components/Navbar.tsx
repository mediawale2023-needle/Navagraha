import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sparkles, Wallet, User, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { User as UserType } from '@shared/schema';

const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Astrologers', path: '/astrologers' },
  { label: 'Birth Charts', path: '/kundli/new' },
  { label: 'Matchmaking', path: '/kundli/matchmaking' },
  { label: 'Numerology', path: '/numerology' },
];

export default function Navbar() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: user } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
    enabled: isAuthenticated,
  });

  const { data: wallet } = useQuery<{ balance: number }>({
    queryKey: ['/api/wallet'],
    enabled: isAuthenticated,
  });

  return (
    <header className="hidden md:block fixed top-0 inset-x-0 z-50 header-glass">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2.5 shrink-0 cursor-pointer">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center glow-image">
              <Sparkles className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground">Navagraha</span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-0.5 flex-1 justify-center">
          {NAV_LINKS.map(({ label, path }) => {
            const isActive = location === path;
            return (
              <Link key={path} href={path}>
                <button
                  className={`relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'glass-pill-active text-[var(--magenta)]'
                      : 'hover:bg-foreground/5 text-foreground/60 hover:text-foreground'
                  }`}
                >
                  {label}
                  {isActive && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full gradient-primary" />
                  )}
                </button>
              </Link>
            );
          })}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-3 shrink-0">
          {isAuthenticated ? (
            <>
              <Link href="/wallet">
                <button className="flex items-center gap-1.5 glass-pill px-4 py-2 hover:bg-foreground/10 transition-colors cursor-pointer">
                  <Wallet className="w-4 h-4 text-[var(--turmeric)]" />
                  <span className="font-bold text-foreground text-sm">₹{wallet?.balance ?? 0}</span>
                </button>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="focus:outline-none rounded-full overflow-hidden border-2 border-[var(--turmeric)]/30 hover:border-[var(--turmeric)] transition-colors">
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover" />
                      <AvatarFallback className="gradient-primary text-white font-bold text-sm">
                        {user?.firstName?.charAt(0) || <User className="w-4 h-4" />}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-card border-foreground/10 shadow-lg">
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-bold text-foreground">{user?.firstName || 'Seeker'}</p>
                    <p className="text-xs text-foreground/40">{user?.email || ''}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-foreground/5" />
                  <Link href="/profile">
                    <DropdownMenuItem className="text-foreground/70 hover:text-foreground cursor-pointer">
                      <User className="w-4 h-4 mr-2" /> My Profile
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/wallet">
                    <DropdownMenuItem className="text-foreground/70 hover:text-foreground cursor-pointer">
                      <Wallet className="w-4 h-4 mr-2" /> Wallet
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator className="bg-foreground/5" />
                  <DropdownMenuItem
                    className="text-red-500 hover:text-red-600 cursor-pointer"
                    onClick={() => window.location.href = '/api/logout'}
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link href="/astrologer/login">
                <Button variant="ghost" className="text-foreground/60 hover:text-foreground glass-pill border-transparent text-sm h-9 px-4">
                  Astrologer Portal
                </Button>
              </Link>
              <Button
                className="gradient-primary text-white font-bold rounded-full px-5 h-9 text-sm glow-image transition-transform hover:scale-105"
                onClick={() => window.location.href = '/api/auth/google'}
              >
                Sign In
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
