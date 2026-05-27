import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ArrowLeft, Search, Star, MessageCircle,
  Phone, CheckCircle2, Sparkles, Zap, Heart, BellRing
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

interface AstrologerMatch {
  astrologerId: string;
  reason: string;
}

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

  const { data: matches } = useQuery<AstrologerMatch[]>({
    queryKey: ['/api/ai/match-astrologer'],
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60_000, // cache 5 minutes — one API call per session
  });

  const { data: followingIds } = useQuery<string[]>({
    queryKey: ['/api/astrologers/following/list'],
    enabled: isAuthenticated,
  });
  const following = new Set(followingIds || []);

  const toggleFollow = useMutation({
    mutationFn: async ({ id, isFollowing }: { id: string; isFollowing: boolean }) => {
      await apiRequest(isFollowing ? 'DELETE' : 'POST', `/api/astrologers/${id}/follow`);
      return !isFollowing;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/astrologers/following/list'] }),
    onError: () => toast({ title: 'Please login', description: 'Login to follow astrologers.', variant: 'destructive' }),
  });

  const joinWaitlist = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      const res = await apiRequest('POST', `/api/astrologers/${id}/waitlist`, { type });
      return res.json();
    },
    onSuccess: (data: any) => toast({ title: 'Added to waitlist', description: `We'll notify you when they're available${data?.position ? ` (position #${data.position})` : ''}.` }),
    onError: () => toast({ title: 'Could not join waitlist', variant: 'destructive' }),
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
    <div className="yantra-shell min-h-screen pb-24 text-foreground md:pb-8">
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card hover:bg-muted" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <div className="flex-1">
              <h1 className="font-display text-xl text-foreground">Astrologers</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-muted-foreground">{onlineCount} online now</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-12">

        {/* AI-matched recommendations */}
        {matches && matches.length > 0 && astrologers && (
          <div className="pt-4 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-nava-amber" />
              <span className="text-sm font-bold text-foreground">Recommended for your chart</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {matches.map((match) => {
                const a = astrologers.find(x => x.id === match.astrologerId);
                if (!a) return null;
                return (
                  <div
                    key={match.astrologerId}
                    className="yantra-card shrink-0 flex w-64 gap-3 items-start p-3"
                  >
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarImage src={a.profileImageUrl || undefined} alt={a.name} className="object-cover" />
                      <AvatarFallback className="bg-nava-navy text-white text-sm font-bold">{a.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{match.reason}</p>
                      <div className="flex gap-1.5 mt-2">
                        <Link href={`/call/${a.id}?type=voice`}>
                          <button className="flex items-center gap-1 rounded-[8px] bg-[var(--nava-teal)] px-2.5 py-1 text-[10px] font-semibold text-white">
                            <Phone className="w-3 h-3" /> Call
                          </button>
                        </Link>
                        <Link href={`/chat/${a.id}`}>
                          <button className="flex items-center gap-1 rounded-[8px] bg-nava-navy px-2.5 py-1 text-[10px] font-semibold text-primary">
                            <MessageCircle className="w-3 h-3" /> Chat
                          </button>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or specialization..."
              className="h-11 rounded-[10px] border-border bg-card pl-9 text-sm focus:border-nava-navy/50 focus:ring-nava-navy/20"
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
              className={`flex-shrink-0 rounded-[6px] border px-4 py-1.5 text-xs font-semibold transition-all ${activeCategory === cat
                ? 'border-nava-navy bg-nava-navy text-primary'
                : 'bg-card border-border text-muted-foreground hover:border-nava-navy/30'
                }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setFilterOnline(!filterOnline)}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-[6px] border px-4 py-1.5 text-xs font-semibold transition-all ${filterOnline
              ? 'border-emerald-500 bg-emerald-500 text-white'
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
                className={`rounded-[6px] px-2.5 py-1 text-[10px] font-semibold transition-colors ${sortBy === s ? 'bg-primary/25 text-[var(--primary-border)]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
                  className="yantra-card p-4"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="flex gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="rounded-[6px] border border-border bg-card p-0.5">
                        <Avatar className="h-16 w-16 rounded-[6px] border border-card">
                          <AvatarImage src={astrologer.profileImageUrl || undefined} alt={astrologer.name} className="object-cover" />
                          <AvatarFallback className="bg-nava-navy font-display text-lg text-primary">
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
                        <h3 className="font-display text-base text-foreground truncate">{astrologer.name}</h3>
                        {astrologer.isVerified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-nava-amber flex-shrink-0" />
                        )}
                      </div>
                      <p className="mb-1 text-xs text-muted-foreground">
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

                    {/* Price + follow */}
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <button
                        onClick={() => toggleFollow.mutate({ id: astrologer.id, isFollowing: following.has(astrologer.id) })}
                        className="mb-1 p-1.5 rounded-full hover:bg-muted"
                        aria-label="Follow"
                        data-testid={`button-follow-${astrologer.id}`}
                      >
                        <Heart className={`w-4 h-4 ${following.has(astrologer.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                      </button>
                      <div className="mb-2">
                        <span className="font-display text-lg text-[var(--primary-border)]">₹{astrologer.pricePerMinute || '25'}</span>
                        <span className="text-xs text-muted-foreground">/min</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    {isAuthenticated ? (
                      online ? (
                      <>
                        <Link href={`/call/${astrologer.id}?type=voice`} className="flex-1">
                          <Button className="h-9 w-full rounded-[9px] bg-primary font-semibold text-primary-foreground hover:bg-primary/90" data-testid={`button-call-${astrologer.id}`}>
                            <Phone className="w-4 h-4 mr-1.5" /> Call
                          </Button>
                        </Link>
                        <Link href={`/chat/${astrologer.id}`} className="flex-1">
                          <Button className="h-9 w-full rounded-[9px] bg-nava-navy font-semibold text-primary hover:bg-nava-navy/90" data-testid={`button-chat-${astrologer.id}`}>
                            <MessageCircle className="w-4 h-4 mr-1.5" /> Chat
                          </Button>
                        </Link>
                      </>
                      ) : (
                        <Button
                          variant="outline"
                          className="h-9 w-full rounded-[9px] font-semibold"
                          onClick={() => joinWaitlist.mutate({ id: astrologer.id, type: 'chat' })}
                          disabled={joinWaitlist.isPending}
                          data-testid={`button-waitlist-${astrologer.id}`}
                        >
                          <BellRing className="w-4 h-4 mr-1.5" /> Notify me when online
                        </Button>
                      )
                    ) : (
                      <>
                        <Button className="h-9 flex-1 rounded-[9px] bg-primary font-semibold text-primary-foreground hover:bg-primary/90" onClick={() => handleLoginRequired('call')} data-testid={`button-call-${astrologer.id}`}>
                          <Phone className="w-4 h-4 mr-1.5" /> Call
                        </Button>
                        <Button className="h-9 flex-1 rounded-[9px] bg-nava-navy font-semibold text-primary hover:bg-nava-navy/90" onClick={() => handleLoginRequired('chat')} data-testid={`button-chat-${astrologer.id}`}>
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
