import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Search, Star, MessageCircle,
  Phone, Video, Filter, Calendar, CheckCircle2
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

export default function Astrologers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAvailable, setFilterAvailable] = useState(false);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Track real-time online status via WebSocket
  const [onlineAstrologers, setOnlineAstrologers] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  const { data: astrologers, isLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
    refetchInterval: 30_000,
  });

  // WebSocket for real-time presence updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'astrologer_status') {
          setOnlineAstrologers(prev => {
            const next = new Set(prev);
            if (msg.status === 'online') next.add(msg.astrologerId);
            else next.delete(msg.astrologerId);
            return next;
          });
          queryClient.invalidateQueries({ queryKey: ['/api/astrologers'] });
        }
      } catch {}
    };
    return () => ws.close();
  }, [queryClient]);

  const handleLoginRequired = (action: string) => {
    toast({
      title: "Login Required",
      description: `Please login to ${action} with astrologers`,
      variant: "destructive",
    });
    setTimeout(() => { window.location.href = '/api/login'; }, 1500);
  };

  const filteredAstrologers = astrologers?.filter((astrologer) => {
    const matchesSearch = astrologer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      astrologer.specializations?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = !filterAvailable || astrologer.isOnline || astrologer.availability === 'online';
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
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
                    <Avatar className="w-20 h-20 flex-shrink-0">
                      <AvatarImage src={astrologer.profileImageUrl || undefined} alt={astrologer.name} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-2xl">
                        {astrologer.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
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
                    <div className="flex flex-col items-end gap-1">
                      {astrologer.isVerified && (
                        <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-300">
                          <CheckCircle2 className="w-3 h-3" /> Verified
                        </Badge>
                      )}
                      <Badge
                        variant={astrologer.isOnline || onlineAstrologers.has(astrologer.id) ? 'default' : 'secondary'}
                        className="gap-1.5"
                      >
                        <div className={`w-2 h-2 rounded-full ${
                          astrologer.isOnline || onlineAstrologers.has(astrologer.id)
                            ? 'bg-green-400 animate-pulse'
                            : astrologer.availability === 'busy' ? 'bg-yellow-400' : 'bg-gray-400'
                        }`} />
                        {astrologer.isOnline || onlineAstrologers.has(astrologer.id)
                          ? 'Online'
                          : astrologer.availability === 'busy' ? 'Busy' : 'Offline'}
                      </Badge>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    {isAuthenticated ? (
                      <>
                        <Link href={`/chat/${astrologer.id}`}>
                          <Button className="w-full" variant="default" size="sm" data-testid={`button-chat-${astrologer.id}`}>
                            <MessageCircle className="w-4 h-4 mr-1" /> Chat
                          </Button>
                        </Link>
                        <Link href={`/call/${astrologer.id}?type=voice`}>
                          <Button className="w-full" variant="outline" size="sm" data-testid={`button-call-${astrologer.id}`}>
                            <Phone className="w-4 h-4 mr-1" /> Call
                          </Button>
                        </Link>
                        <Link href={`/schedule?astrologerId=${astrologer.id}`}>
                          <Button className="w-full" variant="outline" size="sm">
                            <Calendar className="w-4 h-4 mr-1" /> Book
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <>
                        <Button className="w-full" variant="default" size="sm" onClick={() => handleLoginRequired('chat')} data-testid={`button-chat-${astrologer.id}`}>
                          <MessageCircle className="w-4 h-4 mr-1" /> Chat
                        </Button>
                        <Button className="w-full" variant="outline" size="sm" onClick={() => handleLoginRequired('call')} data-testid={`button-call-${astrologer.id}`}>
                          <Phone className="w-4 h-4 mr-1" /> Call
                        </Button>
                        <Button className="w-full" variant="outline" size="sm" onClick={() => handleLoginRequired('book')}>
                          <Calendar className="w-4 h-4 mr-1" /> Book
                        </Button>
                      </>
                    )}
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
