import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { CosmicBackground } from '@/components/CosmicBackground';
import { Sparkles, Star, Users, Wallet, MessageCircle } from 'lucide-react';
import cosmicBg from '@assets/generated_images/Cosmic_nebula_hero_background_295cdd28.png';

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${cosmicBg})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-background" />
        </div>
        <CosmicBackground className="opacity-40" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="inline-block mb-6">
            <Sparkles className="w-16 h-16 md:w-20 md:h-20 text-accent drop-shadow-[0_0_30px_rgba(234,179,8,0.6)]" />
          </div>

          <h1 className="font-serif text-5xl md:text-7xl font-bold text-white mb-6" style={{ textShadow: '0 0 40px rgba(139,92,246,0.5)' }}>
            Navagraha
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-4 max-w-3xl mx-auto">
            Discover Your Cosmic Blueprint
          </p>
          <p className="text-base md:text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Premium Vedic astrology platform offering kundli generation, expert consultations, and personalized predictions
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
                className="text-lg px-8 h-12 bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20"
                data-testid="button-explore-guest"
              >
                Explore as Guest
              </Button>
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap gap-8 justify-center text-white/80 text-sm">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-accent" />
              <span>10,000+ Kundlis Generated</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              <span>500+ Expert Astrologers</span>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-4xl md:text-5xl font-semibold text-center mb-16 text-foreground">
            Explore Premium Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <GlassCard className="p-6 hover" data-testid="card-feature-kundli">
              <Sparkles className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-card-foreground">Kundli Generation</h3>
              <p className="text-muted-foreground">
                Generate detailed Vedic birth charts with planetary positions, dashas, and doshas
              </p>
            </GlassCard>

            <GlassCard className="p-6 hover" data-testid="card-feature-astrologers">
              <Users className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-card-foreground">Expert Astrologers</h3>
              <p className="text-muted-foreground">
                Consult with certified Vedic astrologers for personalized guidance
              </p>
            </GlassCard>

            <GlassCard className="p-6 hover" data-testid="card-feature-wallet">
              <Wallet className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-card-foreground">Wallet System</h3>
              <p className="text-muted-foreground">
                Secure wallet for seamless payments and transaction tracking
              </p>
            </GlassCard>

            <GlassCard className="p-6 hover" data-testid="card-feature-chat">
              <MessageCircle className="w-12 h-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-card-foreground">Live Consultations</h3>
              <p className="text-muted-foreground">
                Real-time chat and call sessions with astrologers
              </p>
            </GlassCard>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative py-20 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${cosmicBg})` }}
        />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-semibold mb-6 text-foreground">
            Begin Your Cosmic Journey Today
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of users discovering their destiny through ancient Vedic wisdom
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
    </div>
  );
}
