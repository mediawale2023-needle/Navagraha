import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BottomNav } from '@/components/BottomNav';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Search, Star, MessageCircle,
  Phone, Calendar, CheckCircle2, Clock, Sparkles
} from 'lucide-react';
import type { Astrologer } from '@shared/schema';

const CATEGORIES = ['All', 'Love', 'Career', 'Finance', 'Health', 'Marriage', 'Family', 'Vastu'];

export default function Astrologers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [filterOnline, setFilterOnline] = useState(false);
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
  });

  const onlineCount = astrologers?.filter(isOnline).length || 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#FFCF23] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-2 rounded-xl hover:bg-[#1A1A1A]/10" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-[#1A1A1A]" />
              </button>
            </Link>
            <div>
              <h1 className="font-bold text-lg text-[#1A1A1A]">Astrologers</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse" />
                <span className="text-xs text-[#1A1A1A]/70 font-medium">{onlineCount} online now</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or specialization..."
              className="pl-9 bg-white border-gray-200 rounded-xl h-11 focus:border-[#FFCF23] focus:ring-[#FFCF23]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none -mx-4 px-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
                activeCategory === cat
                  ? 'bg-[#FFCF23] border-[#FFCF23] text-[#1A1A1A]'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-[#FFCF23]'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setFilterOnline(!filterOnline)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all flex items-center gap-1.5 ${
              filterOnline
                ? 'bg-green-500 border-green-500 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-green-400'
            }`}
            data-testid="button-filter-available"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${filterOnline ? 'bg-white animate-pulse' : 'bg-green-500'}`} />
            Online Only
          </button>
        </div>

        {/* Results count */}
        {!isLoading && filteredAstrologers && (
          <p className="text-sm text-gray-500 mb-3 font-medium">
            {filteredAstrologers.length} astrologers found
          </p>
        )}

        {/* Astrologers List */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {filteredAstrologers?.map((astrologer) => {
              const online = isOnline(astrologer);
              return (
                <div
                  key={astrologer.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[#FFCF23]/50 transition-all overflow-hidden"
                  data-testid={`card-astrologer-${astrologer.id}`}
                >
                  <div className="p-4">
                    {/* Top row */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="relative">
                        <Avatar className="w-16 h-16 flex-shrink-0">
                          <AvatarImage src={astrologer.profileImageUrl || undefined} alt={astrologer.name} />
                          <AvatarFallback className="bg-[#FFCF23] text-[#1A1A1A] font-bold text-xl">
                            {astrologer.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          online ? 'bg-green-500' : astrologer.availability === 'busy' ? 'bg-yellow-400' : 'bg-gray-300'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <h3 className="font-bold text-[#1A1A1A] truncate">{astrologer.name}</h3>
                          {astrologer.isVerified && (
                            <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate mb-1">
                          {astrologer.specializations?.slice(0, 2).join(' • ') || 'Vedic Astrology'}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-0.5">
                            <Star className="w-3.5 h-3.5 fill-[#FFCF23] text-[#FFCF23]" />
                            <span className="text-xs font-bold text-[#1A1A1A]">{astrologer.rating || '4.9'}</span>
                          </div>
                          <span className="text-gray-300 text-xs">•</span>
                          <span className="text-xs text-gray-500">{astrologer.totalConsultations || '1.2K'}+ sessions</span>
                          <span className="text-gray-300 text-xs">•</span>
                          <span className="text-xs text-gray-500">{astrologer.experience || 10}yr exp</span>
                        </div>
                      </div>
                    </div>

                    {/* Specialization tags */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {astrologer.specializations?.slice(0, 3).map((spec, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-[#FFFBEA] border border-[#FFCF23]/40 text-[#1A1A1A] text-xs rounded-full font-medium">
                          {spec}
                        </span>
                      ))}
                    </div>

                    {/* Languages */}
                    {astrologer.languages && astrologer.languages.length > 0 && (
                      <p className="text-xs text-gray-400 mb-3">
                        Speaks: <span className="text-gray-600 font-medium">{astrologer.languages.join(', ')}</span>
                      </p>
                    )}

                    {/* Status + Price row */}
                    <div className="flex items-center justify-between mb-3 py-2 border-t border-gray-100">
                      <div className="flex items-center gap-1.5">
                        {online ? (
                          <>
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-xs text-green-600 font-semibold">Online</span>
                            <span className="text-xs text-gray-400">• ~2 min wait</span>
                          </>
                        ) : astrologer.availability === 'busy' ? (
                          <>
                            <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                            <span className="text-xs text-yellow-600 font-semibold">Busy</span>
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 bg-gray-300 rounded-full" />
                            <span className="text-xs text-gray-400 font-medium">Offline</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-baseline gap-0.5">
                        <span className="font-bold text-lg text-[#1A1A1A]">₹{astrologer.pricePerMinute || '25'}</span>
                        <span className="text-xs text-gray-400">/min</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      {isAuthenticated ? (
                        <>
                          <Link href={`/chat/${astrologer.id}`}>
                            <Button
                              size="sm"
                              className="w-full bg-[#FFCF23] text-[#1A1A1A] hover:bg-[#F5C500] font-bold rounded-xl"
                              data-testid={`button-chat-${astrologer.id}`}
                            >
                              <MessageCircle className="w-3.5 h-3.5 mr-0.5" /> Chat
                            </Button>
                          </Link>
                          <Link href={`/call/${astrologer.id}?type=voice`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full border-gray-200 text-[#1A1A1A] hover:bg-gray-50 font-semibold rounded-xl"
                              data-testid={`button-call-${astrologer.id}`}
                            >
                              <Phone className="w-3.5 h-3.5 mr-0.5" /> Call
                            </Button>
                          </Link>
                          <Link href={`/schedule?astrologerId=${astrologer.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full border-gray-200 text-[#1A1A1A] hover:bg-gray-50 font-semibold rounded-xl"
                            >
                              <Calendar className="w-3.5 h-3.5 mr-0.5" /> Book
                            </Button>
                          </Link>
                        </>
                      ) : (
                        <>
                          <Button size="sm" className="w-full bg-[#FFCF23] text-[#1A1A1A] hover:bg-[#F5C500] font-bold rounded-xl" onClick={() => handleLoginRequired('chat')} data-testid={`button-chat-${astrologer.id}`}>
                            <MessageCircle className="w-3.5 h-3.5 mr-0.5" /> Chat
                          </Button>
                          <Button size="sm" variant="outline" className="w-full border-gray-200 text-[#1A1A1A] hover:bg-gray-50 font-semibold rounded-xl" onClick={() => handleLoginRequired('call')} data-testid={`button-call-${astrologer.id}`}>
                            <Phone className="w-3.5 h-3.5 mr-0.5" /> Call
                          </Button>
                          <Button size="sm" variant="outline" className="w-full border-gray-200 text-[#1A1A1A] hover:bg-gray-50 font-semibold rounded-xl" onClick={() => handleLoginRequired('book')}>
                            <Calendar className="w-3.5 h-3.5 mr-0.5" /> Book
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
