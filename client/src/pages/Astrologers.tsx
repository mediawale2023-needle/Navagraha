import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Search, Star, MessageCircle, 
  Phone, User, Filter 
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

export default function Astrologers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAvailable, setFilterAvailable] = useState(false);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: astrologers, isLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
  });

  const handleLoginRequired = (action: string) => {
    toast({
      title: "Login Required",
      description: `Please login to ${action} with astrologers`,
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = '/api/login';
    }, 1500);
  };

  const filteredAstrologers = astrologers?.filter((astrologer) => {
    const matchesSearch = astrologer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      astrologer.specializations?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = !filterAvailable || astrologer.availability === 'available';
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/">
            <Button variant="ghost" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-serif text-4xl font-bold text-foreground mb-2">
            Expert Astrologers
          </h1>
          <p className="text-muted-foreground text-lg">
            Consult with certified Vedic astrologers for personalized guidance
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by name or specialization..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <Button
            variant={filterAvailable ? 'default' : 'outline'}
            onClick={() => setFilterAvailable(!filterAvailable)}
            data-testid="button-filter-available"
          >
            <Filter className="w-4 h-4 mr-2" />
            Available Only
          </Button>
        </div>

        {/* Astrologers Grid */}
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAstrologers?.map((astrologer) => (
              <Card 
                key={astrologer.id} 
                className="hover-elevate active-elevate-2 transition-all"
                data-testid={`card-astrologer-${astrologer.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {astrologer.profileImageUrl ? (
                        <img 
                          src={astrologer.profileImageUrl} 
                          alt={astrologer.name} 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <User className="w-10 h-10 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-xl text-card-foreground mb-1 truncate">
                        {astrologer.name}
                      </h3>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                        <Star className="w-4 h-4 fill-accent text-accent" />
                        <span className="font-medium">{astrologer.rating || '4.8'}</span>
                        <span className="mx-1">•</span>
                        <span>{astrologer.totalConsultations || 1234} consultations</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {astrologer.experience || 10}+ years experience
                      </div>
                    </div>
                  </div>

                  {/* Specializations */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {astrologer.specializations?.slice(0, 3).map((spec, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {spec}
                      </Badge>
                    ))}
                  </div>

                  {/* Languages */}
                  {astrologer.languages && astrologer.languages.length > 0 && (
                    <div className="text-sm text-muted-foreground mb-4">
                      <span className="font-medium">Languages:</span> {astrologer.languages.join(', ')}
                    </div>
                  )}

                  {/* About */}
                  {astrologer.about && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {astrologer.about}
                    </p>
                  )}

                  {/* Price and Availability */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                    <div>
                      <span className="text-2xl font-bold text-foreground">
                        ₹{astrologer.pricePerMinute || '25'}
                      </span>
                      <span className="text-sm text-muted-foreground">/min</span>
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
                  <div className="grid grid-cols-2 gap-3">
                    {isAuthenticated ? (
                      <Link href={`/chat/${astrologer.id}`}>
                        <Button 
                          className="w-full" 
                          variant="default"
                          data-testid={`button-chat-${astrologer.id}`}
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Chat
                        </Button>
                      </Link>
                    ) : (
                      <Button 
                        className="w-full" 
                        variant="default"
                        onClick={() => handleLoginRequired('chat')}
                        data-testid={`button-chat-${astrologer.id}`}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Chat
                      </Button>
                    )}
                    <Button 
                      className="w-full" 
                      variant="outline"
                      onClick={() => isAuthenticated ? null : handleLoginRequired('call')}
                      data-testid={`button-call-${astrologer.id}`}
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Call
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredAstrologers && filteredAstrologers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No astrologers found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}
