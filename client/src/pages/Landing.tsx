import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sparkles, Star, Users, Wallet, MessageCircle, Heart, TrendingUp } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Clean Header */}
      <header className="sticky top-0 z-50 bg-background border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" data-testid="icon-logo" />
              </div>
              <h1 className="font-serif text-xl font-bold text-foreground">Navagraha</h1>
            </div>

            {/* Right section */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button 
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-login-header"
                className="hover-elevate"
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative bg-gradient-to-b from-primary/5 to-background py-20 md:py-32">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block mb-6">
            <Sparkles className="w-16 h-16 md:w-20 md:h-20 text-primary" />
          </div>

          <h1 className="font-serif text-5xl md:text-7xl font-bold text-foreground mb-6">
            Navagraha
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-4 max-w-3xl mx-auto">
            Your Personal Vedic Astrology Guide
          </p>
          <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Premium astrology platform offering kundli generation, expert consultations, and personalized predictions
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              className="text-lg px-8 h-12"
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-login"
            >
              Get Started
            </Button>
            <Link href="/astrologers">
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 h-12"
                data-testid="button-explore-guest"
              >
                Explore as Guest
              </Button>
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap gap-8 justify-center text-muted-foreground text-sm">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" />
              <span>10,000+ Kundlis Generated</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span>500+ Expert Astrologers</span>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-4xl md:text-5xl font-semibold text-center mb-4 text-foreground">
            Explore Premium Features
          </h2>
          <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto">
            Discover the ancient wisdom of Vedic astrology with modern convenience
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="hover-elevate active-elevate-2 transition-all" data-testid="card-feature-kundli">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-card-foreground">Kundli Generation</h3>
                <p className="text-muted-foreground">
                  Generate detailed Vedic birth charts with planetary positions, dashas, and doshas
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all" data-testid="card-feature-astrologers">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-card-foreground">Expert Astrologers</h3>
                <p className="text-muted-foreground">
                  Consult with certified Vedic astrologers for personalized guidance
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all" data-testid="card-feature-wallet">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Heart className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-card-foreground">Matchmaking</h3>
                <p className="text-muted-foreground">
                  Discover compatibility through traditional Vedic matchmaking analysis
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all" data-testid="card-feature-chat">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-card-foreground">Live Consultations</h3>
                <p className="text-muted-foreground">
                  Real-time chat and call sessions with experienced astrologers
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative py-20 bg-gradient-to-b from-background to-primary/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-semibold mb-6 text-foreground">
            Begin Your Astrological Journey Today
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands discovering their destiny through ancient Vedic wisdom
          </p>
          <Button 
            size="lg" 
            className="text-lg px-10 h-12"
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-cta-login"
          >
            Sign In to Continue
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="font-serif font-semibold text-foreground">Navagraha</span>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
              <Link href="/astrologers" className="hover:text-foreground transition-colors">Astrologers</Link>
              <a href="#" className="hover:text-foreground transition-colors">About</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            </div>
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Navagraha. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
