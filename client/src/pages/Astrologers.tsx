import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BottomNav } from '@/components/BottomNav';
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
    <div className="min-h-screen bg-[#FFF8F0] pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-orange-600 to-orange-500 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-1.5 rounded-lg hover:bg-white/10" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            </Link>
            <div className="flex-1">
              <h1 className="font-bold text-lg text-white">Astrologers</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-300 rounded-full animate-pulse" />
                <span className="text-xs text-white/70 font-medium">{onlineCount} online now</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or specialization..."
              className="pl-9 bg-white border-orange-200 rounded-xl h-10 focus:border-orange-400 focus:ring-orange-400 text-sm"
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
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                activeCategory === cat
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setFilterOnline(!filterOnline)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              filterOnline
                ? 'bg-green-600 border-green-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-green-300'
            }`}
            data-testid="button-filter-available"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${filterOnline ? 'bg-white animate-pulse' : 'bg-green-500'}`} />
            Online
          </button>
        </div>

        {/* Sort + Results count */}
        <div className="flex items-center justify-between py-2">
          {!isLoading && filteredAstrologers && (
            <p className="text-xs text-gray-500 font-medium">
              {filteredAstrologers.length} astrologers found
            </p>
          )}
          <div className="flex gap-1">
            {(['rating', 'price', 'experience'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                  sortBy === s ? 'bg-orange-100 text-orange-700' : 'text-gray-400 hover:text-gray-600'
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
                  className="bg-white rounded-xl border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all overflow-hidden"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="p-3">
                    <div className="flex gap-3">
                      <div className="relative flex-shrink-0">
                        <Avatar className="w-14 h-14 ring-2 ring-orange-100">
                          <AvatarImage src={astrologer.profileImageUrl || undefined} alt={astrologer.name} />
                          <AvatarFallback className="bg-gradient-to-br from-orange-400 to-amber-300 text-white font-bold text-lg">
                            {astrologer.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          online ? 'bg-green-500' : astrologer.availability === 'busy' ? 'bg-yellow-400' : 'bg-gray-300'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <h3 className="font-bold text-sm text-gray-900 truncate">{astrologer.name}</h3>
                          {astrologer.isVerified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">
                          {astrologer.specializations?.slice(0, 2).join(', ') || 'Vedic Astrology'}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {astrologer.languages?.join(', ') || 'Hindi, English'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span className="text-xs font-bold text-gray-700">{astrologer.rating || '4.9'}</span>
                          <span className="text-gray-300 text-xs">&bull;</span>
                          <span className="text-[11px] text-gray-500">{astrologer.experience || 10}yr</span>
                          <span className="text-gray-300 text-xs">&bull;</span>
                          <span className="text-[11px] text-gray-500">{astrologer.totalConsultations || '1.2K'} orders</span>
                        </div>
                      </div>
                    </div>

                    {/* Status + Price */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
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
                            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                            <span className="text-[11px] text-gray-400 font-medium">Offline</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-baseline gap-0.5">
                        <span className="font-bold text-base text-gray-900">₹{astrologer.pricePerMinute || '25'}</span>
                        <span className="text-[10px] text-gray-400">/min</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      {isAuthenticated ? (
                        <>
                          <Link href={`/chat/${astrologer.id}`}>
                            <Button size="sm" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg h-8 text-xs" data-testid={`button-chat-${astrologer.id}`}>
                              <MessageCircle className="w-3 h-3 mr-1" /> Chat
                            </Button>
                          </Link>
                          <Link href={`/call/${astrologer.id}?type=voice`}>
                            <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg h-8 text-xs" data-testid={`button-call-${astrologer.id}`}>
                              <Phone className="w-3 h-3 mr-1" /> Call
                            </Button>
                          </Link>
                          <Link href={`/call/${astrologer.id}?type=video`}>
                            <Button size="sm" variant="outline" className="w-full border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-semibold rounded-lg h-8 text-xs">
                              <Video className="w-3 h-3 mr-1" /> Video
                            </Button>
                          </Link>
                        </>
                      ) : (
                        <>
                          <Button size="sm" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg h-8 text-xs" onClick={() => handleLoginRequired('chat')} data-testid={`button-chat-${astrologer.id}`}>
                            <MessageCircle className="w-3 h-3 mr-1" /> Chat
                          </Button>
                          <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg h-8 text-xs" onClick={() => handleLoginRequired('call')} data-testid={`button-call-${astrologer.id}`}>
                            <Phone className="w-3 h-3 mr-1" /> Call
                          </Button>
                          <Button size="sm" variant="outline" className="w-full border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-semibold rounded-lg h-8 text-xs" onClick={() => handleLoginRequired('video call')}>
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
            <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No astrologers found</p>
            <p className="text-sm text-gray-400 mt-1">Try changing your filters</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
