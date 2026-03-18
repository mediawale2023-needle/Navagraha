import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Search, Star, MessageCircle,
  Phone, CheckCircle2, Sparkles
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

const CATEGORIES = ['All', 'Love', 'Career', 'Finance', 'Health', 'Marriage', 'Family', 'Vastu'];

export default function Astrologers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [filterOnline, setFilterOnline] = useState(false);
  const [sortBy, setSortBy] = useState<'rating' | 'price' | 'experience'>('rating');
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [onlineAstrologers, setOnlineAstrologers] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  const { data: astrologers, isLoading } = useQuery<Astrologer[]>({
    queryKey: ['/api/astrologers'],
    refetchInterval: 30_000,
  });

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
      } catch { }
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

  const isOnline = (a: Astrologer) => a.isOnline || onlineAstrologers.has(a.id) || a.availability === 'available';

  const filteredAstrologers = astrologers?.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.specializations?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = activeCategory === 'All' ||
      a.specializations?.some(s => s.toLowerCase().includes(activeCategory.toLowerCase()));
    const matchesOnline = !filterOnline || isOnline(a);
    return matchesSearch && matchesCategory && matchesOnline;
  })?.sort((a, b) => {
    if (sortBy === 'price') return Number(a.pricePerMinute || 25) - Number(b.pricePerMinute || 25);
    if (sortBy === 'experience') return (b.experience || 0) - (a.experience || 0);
    return Number(b.rating || 4.5) - Number(a.rating || 4.5);
  });

  const onlineCount = astrologers?.filter(isOnline).length || 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 md:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-1.5 rounded-lg hover:bg-muted" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <div className="flex-1">
              <h1 className="font-bold text-lg text-foreground">Astrologers</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs text-muted-foreground font-medium">{onlineCount} online now</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12">
        {/* Search */}
        <div className="py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or specialization..."
              className="pl-9 bg-card border-border rounded-xl h-10 focus:border-nava-teal/50 focus:ring-nava-teal/30 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeCategory === cat
                ? 'bg-nava-teal text-white border-nava-teal'
                : 'bg-card border-border text-muted-foreground hover:border-nava-teal/30'
                }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setFilterOnline(!filterOnline)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${filterOnline
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'bg-card border-border text-muted-foreground hover:border-emerald-500/30'
              }`}
            data-testid="button-filter-available"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${filterOnline ? 'bg-white animate-pulse' : 'bg-emerald-500'}`} />
            Online
          </button>
        </div>

        {/* Sort + Results count */}
        <div className="flex items-center justify-between py-2">
          {!isLoading && filteredAstrologers && (
            <p className="text-xs text-muted-foreground font-medium">
              {filteredAstrologers.length} astrologers found
            </p>
          )}
          <div className="flex gap-1">
            {(['rating', 'price', 'experience'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${sortBy === s ? 'bg-nava-teal/10 text-nava-teal' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
              >
                {s === 'rating' ? 'Top Rated' : s === 'price' ? 'Price: Low' : 'Experience'}
              </button>
            ))}
          </div>
        </div>

        {/* Astrologers List */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-6">
            {filteredAstrologers?.map((astrologer) => {
              const online = isOnline(astrologer);
              return (
                <div
                  key={astrologer.id}
                  className="bg-card rounded-2xl p-4 shadow-sm border border-border/50"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="flex gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-nava-teal/30 to-nava-amber/30">
                        <Avatar className="w-full h-full border-2 border-card">
                          <AvatarImage src={astrologer.profileImageUrl || undefined} alt={astrologer.name} className="object-cover" />
                          <AvatarFallback className="bg-nava-navy text-white font-bold text-lg">
                            {astrologer.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      {online && (
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[9px] font-semibold px-2 py-0.5 rounded-full border-2 border-card flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                          Online
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h3 className="font-bold text-sm text-foreground truncate">{astrologer.name}</h3>
                        {astrologer.isVerified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-nava-amber flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-nava-teal font-medium mb-1">
                        {astrologer.specializations?.slice(0, 2).join(', ') || 'Vedic Astrology'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-nava-amber text-nava-amber" />
                          {astrologer.rating || '4.9'}
                        </span>
                        <span>|</span>
                        <span>{astrologer.experience || 10}y exp</span>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0">
                      <div className="mb-2">
                        <span className="font-bold text-lg text-nava-teal">₹{astrologer.pricePerMinute || '25'}</span>
                        <span className="text-xs text-muted-foreground">/min</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    {isAuthenticated ? (
                      <>
                        <Link href={`/call/${astrologer.id}?type=voice`} className="flex-1">
                          <Button className="w-full bg-nava-teal hover:bg-nava-teal/90 text-white font-semibold rounded-full h-9" data-testid={`button-call-${astrologer.id}`}>
                            <Phone className="w-4 h-4 mr-1.5" /> Call
                          </Button>
                        </Link>
                        <Link href={`/chat/${astrologer.id}`} className="flex-1">
                          <Button className="w-full bg-nava-navy hover:bg-nava-navy/90 text-white font-semibold rounded-full h-9" data-testid={`button-chat-${astrologer.id}`}>
                            <MessageCircle className="w-4 h-4 mr-1.5" /> Chat
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <>
                        <Button className="flex-1 bg-nava-teal hover:bg-nava-teal/90 text-white font-semibold rounded-full h-9" onClick={() => handleLoginRequired('call')} data-testid={`button-call-${astrologer.id}`}>
                          <Phone className="w-4 h-4 mr-1.5" /> Call
                        </Button>
                        <Button className="flex-1 bg-nava-navy hover:bg-nava-navy/90 text-white font-semibold rounded-full h-9" onClick={() => handleLoginRequired('chat')} data-testid={`button-chat-${astrologer.id}`}>
                          <MessageCircle className="w-4 h-4 mr-1.5" /> Chat
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredAstrologers?.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No astrologers found</p>
            <p className="text-sm text-muted-foreground mt-1">Try changing your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
