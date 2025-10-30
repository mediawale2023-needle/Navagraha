import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/GlassCard';
import { ZodiacIcon } from '@/components/ZodiacIcon';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Link } from 'wouter';
import { 
  Sparkles, Star, Wallet, LogOut, User, 
  Calendar, Clock, MapPin, Users, Phone, MessageCircle 
} from 'lucide-react';
import type { User as UserType, Astrologer } from '@shared/schema';

const zodiacSigns = [
  'aries', 'taurus', 'gemini', 'cancer', 
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

export default function Home() {
  const [selectedSign, setSelectedSign] = useState('aries');

  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ['/api/auth/user'],
  });

  const { data: horoscope, isLoading: horoscopeLoading } = useQuery({
    queryKey: ['/api/horoscope', selectedSign],
  });

  const { data: astrologers, isLoading: astrologersLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
  });

  const { data: wallet } = useQuery({
    queryKey: ['/api/wallet'],
  });

  if (userLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-primary" data-testid="icon-logo" />
              <h1 className="font-serif text-2xl font-bold text-foreground">Navagraha</h1>
            </div>

            <nav className="flex items-center gap-2 md:gap-4 flex-wrap">
              <Link href="/kundli/new">
                <Button variant="ghost" size="sm" data-testid="nav-link-kundli">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Kundli
                </Button>
              </Link>
              <Link href="/astrologers">
                <Button variant="ghost" size="sm" data-testid="nav-link-astrologers">
                  <Users className="w-4 h-4 mr-2" />
                  Astrologers
                </Button>
              </Link>
              <Link href="/wallet">
                <Button variant="ghost" size="sm" data-testid="nav-link-wallet">
                  <Wallet className="w-4 h-4 mr-2" />
                  ₹{wallet?.balance || '0'}
                </Button>
              </Link>
              <Link href="/profile">
                <Button variant="ghost" size="icon" data-testid="nav-link-profile">
                  <User className="w-5 h-5" />
                </Button>
              </Link>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => window.location.href = '/api/logout'}
                data-testid="button-logout"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Welcome Section */}
        <div className="mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-semibold text-foreground mb-2">
            Welcome back, {user?.firstName || 'Seeker'}
          </h2>
          <p className="text-muted-foreground text-lg">
            Explore your cosmic destiny today
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Link href="/kundli/new">
            <GlassCard className="p-6 hover" data-testid="card-quick-kundli">
              <Sparkles className="w-10 h-10 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-card-foreground">Generate Kundli</h3>
              <p className="text-muted-foreground text-sm">
                Create your detailed Vedic birth chart
              </p>
            </GlassCard>
          </Link>

          <Link href="/kundli/matchmaking">
            <GlassCard className="p-6 hover" data-testid="card-quick-matchmaking">
              <Star className="w-10 h-10 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-card-foreground">Kundli Milan</h3>
              <p className="text-muted-foreground text-sm">
                Check compatibility with your partner
              </p>
            </GlassCard>
          </Link>

          <Link href="/astrologers">
            <GlassCard className="p-6 hover" data-testid="card-quick-consult">
              <Users className="w-10 h-10 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-card-foreground">Talk to Astrologer</h3>
              <p className="text-muted-foreground text-sm">
                Get guidance from expert astrologers
              </p>
            </GlassCard>
          </Link>
        </div>

        {/* Daily Horoscope */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Daily Horoscope</CardTitle>
            <CardDescription>Select your zodiac sign</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-2 mb-6">
              {zodiacSigns.map((sign) => (
                <button
                  key={sign}
                  onClick={() => setSelectedSign(sign)}
                  className={`p-3 rounded-md transition-all hover-elevate active-elevate-2 ${
                    selectedSign === sign 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                  data-testid={`zodiac-${sign}`}
                >
                  <ZodiacIcon sign={sign} className="w-6 h-6" />
                </button>
              ))}
            </div>

            {horoscopeLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <div className="bg-muted/50 rounded-lg p-6">
                <h4 className="font-semibold text-lg capitalize mb-4">{selectedSign}</h4>
                <p className="text-muted-foreground mb-4">
                  {horoscope?.prediction || "Today brings new opportunities. Stay positive and trust the cosmic energies guiding your path."}
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Love</p>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < 4 ? 'fill-accent text-accent' : 'text-muted'}`} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Career</p>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < 3 ? 'fill-accent text-accent' : 'text-muted'}`} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Health</p>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < 4 ? 'fill-accent text-accent' : 'text-muted'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recommended Astrologers */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-serif text-2xl font-semibold text-foreground">Featured Astrologers</h3>
            <Link href="/astrologers">
              <Button variant="ghost" data-testid="link-see-all-astrologers">
                See All →
              </Button>
            </Link>
          </div>

          {astrologersLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {astrologers?.slice(0, 3).map((astrologer) => (
                <Card key={astrologer.id} className="hover-elevate active-elevate-2" data-testid={`card-astrologer-${astrologer.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                        {astrologer.profileImageUrl ? (
                          <img src={astrologer.profileImageUrl} alt={astrologer.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-lg text-card-foreground truncate">{astrologer.name}</h4>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                          <Star className="w-4 h-4 fill-accent text-accent" />
                          <span>{astrologer.rating || '4.8'}</span>
                          <span className="mx-1">•</span>
                          <span>{astrologer.experience || 10}+ years</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {astrologer.specializations?.slice(0, 2).map((spec, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {spec}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <span className="text-2xl font-bold text-foreground">
                        ₹{astrologer.pricePerMinute || '25'}/min
                      </span>
                      <Badge 
                        variant={astrologer.availability === 'available' ? 'default' : 'secondary'}
                        className="gap-1"
                      >
                        <div className={`w-2 h-2 rounded-full ${astrologer.availability === 'available' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {astrologer.availability === 'available' ? 'Available' : 'Busy'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Link href={`/chat/${astrologer.id}`}>
                        <Button className="w-full" variant="default" size="sm" data-testid={`button-chat-${astrologer.id}`}>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Chat
                        </Button>
                      </Link>
                      <Button className="w-full" variant="outline" size="sm" data-testid={`button-call-${astrologer.id}`}>
                        <Phone className="w-4 h-4 mr-2" />
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
    </div>
  );
}
