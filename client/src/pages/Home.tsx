import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ZodiacIcon } from '@/components/ZodiacIcon';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Link } from 'wouter';
import { 
  Sparkles, Star, Wallet, LogOut, User, 
  Users, Phone, MessageCircle, Heart, TrendingUp, Activity, Menu
} from 'lucide-react';
import type { User as UserType, Astrologer } from '@shared/schema';

const zodiacSigns = [
  'aries', 'taurus', 'gemini', 'cancer', 
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

export default function Home() {
  const [selectedSign, setSelectedSign] = useState('aries');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const { data: horoscope, isLoading: horoscopeLoading } = useQuery<{ prediction: string }>({
    queryKey: ['/api/horoscope', selectedSign],
  });

  const { data: astrologers, isLoading: astrologersLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
  });

  const { data: wallet } = useQuery<{ balance: number }>({
    queryKey: ['/api/wallet'],
  });

  if (userLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Clean Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" data-testid="icon-logo" />
              </div>
              <h1 className="font-serif text-xl font-bold text-foreground">Navagraha</h1>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/kundli/new">
                <Button variant="ghost" size="sm" data-testid="nav-link-kundli" className="hover-elevate">
                  Generate Kundli
                </Button>
              </Link>
              <Link href="/astrologers">
                <Button variant="ghost" size="sm" data-testid="nav-link-astrologers" className="hover-elevate">
                  Astrologers
                </Button>
              </Link>
              <Link href="/kundli/matchmaking">
                <Button variant="ghost" size="sm" data-testid="nav-link-matchmaking" className="hover-elevate">
                  Matchmaking
                </Button>
              </Link>
            </nav>

            {/* Right section */}
            <div className="flex items-center gap-2 md:gap-3">
              <Link href="/wallet" className="hidden sm:block">
                <Button variant="outline" size="sm" data-testid="nav-link-wallet" className="gap-2">
                  <Wallet className="w-4 h-4" />
                  <span className="font-semibold">₹{wallet?.balance || '0'}</span>
                </Button>
              </Link>
              <div className="hidden md:block">
                <ThemeToggle />
              </div>
              <Link href="/profile" className="hidden sm:block">
                <Avatar className="w-8 h-8 cursor-pointer" data-testid="nav-link-profile">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback>
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              </Link>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => window.location.href = '/api/logout'}
                data-testid="button-logout"
                className="hover-elevate hidden sm:flex"
              >
                <LogOut className="w-4 h-4" />
              </Button>
              
              {/* Mobile Menu */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <nav className="flex flex-col gap-4 mt-8">
                    <Link href="/kundli/new" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start gap-3 text-lg" data-testid="mobile-nav-kundli">
                        <Sparkles className="w-5 h-5" />
                        Generate Kundli
                      </Button>
                    </Link>
                    <Link href="/astrologers" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start gap-3 text-lg" data-testid="mobile-nav-astrologers">
                        <Users className="w-5 h-5" />
                        Astrologers
                      </Button>
                    </Link>
                    <Link href="/kundli/matchmaking" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start gap-3 text-lg" data-testid="mobile-nav-matchmaking">
                        <Heart className="w-5 h-5" />
                        Matchmaking
                      </Button>
                    </Link>
                    <Link href="/wallet" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start gap-3 text-lg" data-testid="mobile-nav-wallet">
                        <Wallet className="w-5 h-5" />
                        Wallet (₹{wallet?.balance || '0'})
                      </Button>
                    </Link>
                    <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start gap-3 text-lg" data-testid="mobile-nav-profile">
                        <User className="w-5 h-5" />
                        Profile
                      </Button>
                    </Link>
                    <div className="border-t border-border my-2" />
                    <div className="px-3">
                      <ThemeToggle />
                    </div>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-3 text-lg text-destructive"
                      onClick={() => window.location.href = '/api/logout'}
                      data-testid="mobile-nav-logout"
                    >
                      <LogOut className="w-5 h-5" />
                      Logout
                    </Button>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Welcome Hero Section */}
        <div className="py-12 md:py-16">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="font-serif text-4xl md:text-5xl font-bold text-foreground mb-4">
              Welcome, {user?.firstName || 'Seeker'}
            </h2>
            <p className="text-muted-foreground text-lg md:text-xl mb-8">
              Discover your cosmic path with ancient Vedic wisdom
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/kundli/new">
                <Button size="lg" className="gap-2" data-testid="button-hero-kundli">
                  <Sparkles className="w-5 h-5" />
                  Generate Free Kundli
                </Button>
              </Link>
              <Link href="/astrologers">
                <Button size="lg" variant="outline" className="gap-2" data-testid="button-hero-astrologers">
                  <Users className="w-5 h-5" />
                  Talk to Astrologer
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Link href="/kundli/new">
            <Card className="h-full hover-elevate cursor-pointer transition-all border-card-border" data-testid="card-quick-kundli">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-card-foreground">Birth Chart</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Get detailed Vedic astrology analysis with planetary positions
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/kundli/matchmaking">
            <Card className="h-full hover-elevate cursor-pointer transition-all border-card-border" data-testid="card-quick-matchmaking">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                  <Heart className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-card-foreground">Kundli Milan</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Check compatibility and match with your partner's chart
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/astrologers">
            <Card className="h-full hover-elevate cursor-pointer transition-all border-card-border" data-testid="card-quick-consult">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-card-foreground">Consultation</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Connect with expert astrologers for personalized guidance
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Daily Horoscope */}
        <Card className="mb-12 border-card-border">
          <CardHeader className="pb-4">
            <CardTitle className="font-serif text-2xl">Daily Horoscope</CardTitle>
            <CardDescription>Select your zodiac sign to view today's prediction</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Zodiac Selector */}
            <div className="grid grid-cols-6 md:grid-cols-12 gap-3">
              {zodiacSigns.map((sign) => (
                <button
                  key={sign}
                  onClick={() => setSelectedSign(sign)}
                  className={`p-3 rounded-lg transition-all hover-elevate active-elevate-2 ${
                    selectedSign === sign 
                      ? 'bg-primary text-primary-foreground shadow-sm' 
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                  data-testid={`zodiac-${sign}`}
                  title={sign.charAt(0).toUpperCase() + sign.slice(1)}
                >
                  <ZodiacIcon sign={sign} className="w-6 h-6 mx-auto" />
                </button>
              ))}
            </div>

            {/* Horoscope Content */}
            {horoscopeLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <div className="bg-muted/30 rounded-lg p-6 space-y-6">
                <div>
                  <h4 className="font-semibold text-xl capitalize mb-3">
                    {selectedSign}
                  </h4>
                  <p className="text-muted-foreground leading-relaxed">
                    {horoscope?.prediction || "Today brings new opportunities for growth and self-discovery. The cosmic energies are aligned in your favor, encouraging you to trust your intuition and embrace positive changes."}
                  </p>
                </div>

                {/* Rating Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-card rounded-lg p-4 border border-card-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Heart className="w-4 h-4 text-accent" />
                      <p className="text-sm font-medium">Love & Relationships</p>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-4 h-4 ${i < 4 ? 'fill-primary text-primary' : 'text-muted'}`} 
                        />
                      ))}
                    </div>
                  </div>

                  <div className="bg-card rounded-lg p-4 border border-card-border">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <p className="text-sm font-medium">Career & Finance</p>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-4 h-4 ${i < 3 ? 'fill-primary text-primary' : 'text-muted'}`} 
                        />
                      ))}
                    </div>
                  </div>

                  <div className="bg-card rounded-lg p-4 border border-card-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-accent" />
                      <p className="text-sm font-medium">Health & Wellness</p>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-4 h-4 ${i < 4 ? 'fill-primary text-primary' : 'text-muted'}`} 
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Featured Astrologers */}
        <div className="pb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-serif text-2xl font-bold text-foreground mb-1">
                Featured Astrologers
              </h3>
              <p className="text-muted-foreground">
                Connect with our verified experts
              </p>
            </div>
            <Link href="/astrologers">
              <Button variant="ghost" data-testid="link-see-all-astrologers" className="hover-elevate">
                View All
                <span className="ml-2">→</span>
              </Button>
            </Link>
          </div>

          {astrologersLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {astrologers?.slice(0, 3).map((astrologer) => (
                <Card 
                  key={astrologer.id} 
                  className="hover-elevate active-elevate-2 transition-all border-card-border" 
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <CardContent className="p-6 space-y-4">
                    {/* Astrologer Header */}
                    <div className="flex items-start gap-4">
                      <Avatar className="w-16 h-16">
                        <AvatarImage src={astrologer.profileImageUrl || undefined} alt={astrologer.name} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                          {astrologer.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-lg text-card-foreground truncate">
                          {astrologer.name}
                        </h4>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <Star className="w-4 h-4 fill-primary text-primary" />
                          <span className="font-medium">{astrologer.rating || '4.8'}</span>
                          <span className="mx-1">•</span>
                          <span>{astrologer.experience || 10}+ yrs</span>
                        </div>
                      </div>
                    </div>

                    {/* Specializations */}
                    <div className="flex flex-wrap gap-2">
                      {astrologer.specializations?.slice(0, 3).map((spec, idx) => (
                        <Badge 
                          key={idx} 
                          variant="secondary" 
                          className="text-xs font-normal"
                        >
                          {spec}
                        </Badge>
                      ))}
                    </div>

                    {/* Price & Status */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div>
                        <span className="text-2xl font-bold text-foreground">
                          ₹{astrologer.pricePerMinute || '25'}
                        </span>
                        <span className="text-muted-foreground text-sm">/min</span>
                      </div>
                      <Badge 
                        variant={astrologer.availability === 'available' ? 'default' : 'secondary'}
                        className="gap-1.5"
                      >
                        <div className={`w-2 h-2 rounded-full ${
                          astrologer.availability === 'available' ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        {astrologer.availability === 'available' ? 'Available' : 'Busy'}
                      </Badge>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Link href={`/chat/${astrologer.id}`}>
                        <Button 
                          className="w-full gap-2" 
                          size="sm" 
                          data-testid={`button-chat-${astrologer.id}`}
                        >
                          <MessageCircle className="w-4 h-4" />
                          Chat
                        </Button>
                      </Link>
                      <Button 
                        className="w-full gap-2" 
                        variant="outline" 
                        size="sm" 
                        data-testid={`button-call-${astrologer.id}`}
                      >
                        <Phone className="w-4 h-4" />
                        Call
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-muted-foreground text-sm">
            <p>© 2025 Navagraha. Ancient wisdom for modern times.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
