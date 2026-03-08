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
  ArrowLeft, Search, Star, MessageCircle, Video,
  Phone, Calendar, CheckCircle2, Clock, Sparkles, Filter, SlidersHorizontal
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
    <div className="min-h-screen bg-background text-foreground pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-50 header-glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-1.5 rounded-lg hover:bg-foreground/5" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <div className="flex-1">
              <h1 className="font-bold text-lg text-foreground">Astrologers</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-300 rounded-full animate-pulse" />
                <span className="text-xs text-foreground/70 font-medium">{onlineCount} online now</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
            <Input
              placeholder="Search by name or specialization..."
              className="pl-9 bg-foreground/5 border-foreground/10 rounded-xl h-10 focus:border-[var(--magenta)]/50 focus:ring-[var(--magenta)]/30 text-sm placeholder:text-foreground/40"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeCategory === cat
                ? 'gradient-primary border-transparent text-white'
                : 'bg-foreground/5 border-foreground/10 text-foreground/60 hover:border-[var(--magenta)]/30'
                }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setFilterOnline(!filterOnline)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${filterOnline
              ? 'bg-green-600 border-green-600 text-white'
              : 'bg-foreground/5 border-foreground/10 text-foreground/60 hover:border-green-300'
              }`}
            data-testid="button-filter-available"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${filterOnline ? 'bg-white/5 animate-pulse' : 'bg-green-500'}`} />
            Online
          </button>
        </div>

        {/* Sort + Results count */}
        <div className="flex items-center justify-between py-2">
          {!isLoading && filteredAstrologers && (
            <p className="text-xs text-foreground/50 font-medium">
              {filteredAstrologers.length} astrologers found
            </p>
          )}
          <div className="flex gap-1">
            {(['rating', 'price', 'experience'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${sortBy === s ? 'bg-[var(--magenta)]/10 text-[var(--magenta)]' : 'text-foreground/60 hover:text-foreground/80 hover:bg-foreground/5'
                  }`}
              >
                {s === 'rating' ? 'Top Rated' : s === 'price' ? 'Price: Low' : 'Experience'}
              </button>
            ))}
          </div>
        </div>

        {/* Astrologers Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-6">
            {filteredAstrologers?.map((astrologer) => {
              const online = isOnline(astrologer);
              return (
                <div
                  key={astrologer.id}
                  className="astronex-card hover:border-foreground/10 transition-all overflow-hidden"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="p-3">
                    <div className="flex gap-3">
                      <div className="relative flex-shrink-0">
                        <Avatar className="w-14 h-14 ring-2 ring-[var(--magenta)]/30">
                          <AvatarImage src={astrologer.profileImageUrl || undefined} alt={astrologer.name} />
                          <AvatarFallback className="gradient-primary text-white font-bold text-lg">
                            {astrologer.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background ${online ? 'bg-emerald-500' : astrologer.availability === 'busy' ? 'bg-yellow-400' : 'bg-foreground/20'
                          }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <h3 className="font-bold text-sm text-foreground truncate">{astrologer.name}</h3>
                          {astrologer.isVerified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--turmeric)] flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-foreground/50 truncate">
                          {astrologer.specializations?.slice(0, 2).join(', ') || 'Vedic Astrology'}
                        </p>
                        <p className="text-[11px] text-foreground/40 truncate">
                          {astrologer.languages?.join(', ') || 'Hindi, English'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Star className="w-3 h-3 fill-[var(--turmeric)] text-[var(--turmeric)]" />
                          <span className="text-xs font-bold text-foreground/70">{astrologer.rating || '4.9'}</span>
                          <span className="text-foreground/30 text-xs">&bull;</span>
                          <span className="text-[11px] text-foreground/50">{astrologer.experience || 10}yr</span>
                          <span className="text-foreground/30 text-xs">&bull;</span>
                          <span className="text-[11px] text-foreground/50">{astrologer.totalConsultations || '1.2K'} orders</span>
                        </div>
                      </div>
                    </div>

                    {/* Status + Price */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-foreground/5">
                      <div className="flex items-center gap-1.5">
                        {online ? (
                          <>
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[11px] text-green-600 font-semibold">Online</span>
                          </>
                        ) : astrologer.availability === 'busy' ? (
                          <>
                            <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                            <span className="text-[11px] text-yellow-600 font-semibold">Busy</span>
                          </>
                        ) : (
                          <>
                            <div className="w-1.5 h-1.5 bg-foreground/20 rounded-full" />
                            <span className="text-[11px] text-foreground/40 font-medium">Offline</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-baseline gap-0.5">
                        <span className="font-bold text-base text-[var(--turmeric)]">₹{astrologer.pricePerMinute || '25'}</span>
                        <span className="text-[10px] text-foreground/40">/min</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      {isAuthenticated ? (
                        <>
                          <Link href={`/chat/${astrologer.id}`}>
                            <Button size="sm" className="w-full gradient-primary hover:opacity-90 text-white font-semibold rounded-lg h-8 text-xs" data-testid={`button-chat-${astrologer.id}`}>
                              <MessageCircle className="w-3 h-3 mr-1" /> Chat
                            </Button>
                          </Link>
                          <Link href={`/call/${astrologer.id}?type=voice`}>
                            <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg h-8 text-xs" data-testid={`button-call-${astrologer.id}`}>
                              <Phone className="w-3 h-3 mr-1" /> Call
                            </Button>
                          </Link>
                          <Link href={`/call/${astrologer.id}?type=video`}>
                            <Button size="sm" variant="outline" className="w-full glass hover:bg-foreground/5 text-foreground/70 hover:text-foreground font-semibold rounded-lg h-8 text-xs border-transparent hover:border-foreground/10">
                              <Video className="w-3 h-3 mr-1" /> Video
                            </Button>
                          </Link>
                        </>
                      ) : (
                        <>
                          <Button size="sm" className="w-full gradient-primary hover:opacity-90 text-white font-semibold rounded-lg h-8 text-xs" onClick={() => handleLoginRequired('chat')} data-testid={`button-chat-${astrologer.id}`}>
                            <MessageCircle className="w-3 h-3 mr-1" /> Chat
                          </Button>
                          <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg h-8 text-xs" onClick={() => handleLoginRequired('call')} data-testid={`button-call-${astrologer.id}`}>
                            <Phone className="w-3 h-3 mr-1" /> Call
                          </Button>
                          <Button size="sm" variant="outline" className="w-full glass hover:bg-foreground/5 text-foreground/70 hover:text-foreground font-semibold rounded-lg h-8 text-xs border-transparent hover:border-foreground/10" onClick={() => handleLoginRequired('video call')}>
                            <Video className="w-3 h-3 mr-1" /> Video
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredAstrologers?.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 text-foreground/30 mx-auto mb-3" />
            <p className="text-foreground/60 font-medium">No astrologers found</p>
            <p className="text-sm text-foreground/50 mt-1">Try changing your filters</p>
          </div>
        )}
      </div>


    </div>
  );
}
