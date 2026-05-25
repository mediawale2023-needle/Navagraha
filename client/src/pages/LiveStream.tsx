import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { loadAgoraSDK } from '@/lib/agora';
import { ArrowLeft, Radio, Eye, Send, Gift, Loader2 } from 'lucide-react';

interface StreamMessage {
  id: string;
  senderName: string;
  senderType: string;
  type: string;
  message: string | null;
  giftName: string | null;
}
interface GiftDef { id: string; name: string; emoji: string; amount: number }
interface StreamDetail {
  stream: { id: string; title: string; status: string; viewerCount: number; agoraChannel: string };
  astrologer: { id: string; name: string; profileImageUrl: string | null; specializations: string[] | null } | null;
  token: string | null;
  appId: string | null;
  gifts: GiftDef[];
}

export default function LiveStream() {
  const [, params] = useRoute('/live/:id');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const streamId = params?.id;

  const [draft, setDraft] = useState('');
  const [showGifts, setShowGifts] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [avError, setAvError] = useState<string | null>(null);
  const clientRef = useRef<any>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const joinedRef = useRef(false);

  const { data, isLoading } = useQuery<StreamDetail>({
    queryKey: [`/api/live/${streamId}`],
    enabled: !!streamId,
  });

  const { data: messages } = useQuery<StreamMessage[]>({
    queryKey: [`/api/live/${streamId}/messages`],
    enabled: !!streamId,
    refetchInterval: 3000,
  });

  // Join + subscribe to the broadcaster's A/V (audience role)
  useEffect(() => {
    if (!data || !streamId || joinedRef.current) return;
    joinedRef.current = true;
    apiRequest('POST', `/api/live/${streamId}/join`).catch(() => {});

    let cancelled = false;
    (async () => {
      if (!data.token || !data.appId) {
        setAvError('Live video is not configured for this environment.');
        return;
      }
      try {
        const AgoraRTC = await loadAgoraSDK();
        if (cancelled) return;
        const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
        clientRef.current = client;
        await client.setClientRole('audience');
        await client.join(data.appId, data.stream.agoraChannel, data.token, 0);
        client.on('user-published', async (user: any, mediaType: string) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video' && videoRef.current) {
            user.videoTrack?.play(videoRef.current);
            setVideoReady(true);
          }
          if (mediaType === 'audio') user.audioTrack?.play();
        });
        client.on('user-unpublished', () => setVideoReady(false));
      } catch (err) {
        console.error('Agora audience error:', err);
        setAvError('Could not connect to the live video.');
      }
    })();

    return () => {
      cancelled = true;
      apiRequest('POST', `/api/live/${streamId}/leave`).catch(() => {});
      clientRef.current?.leave().catch(() => {});
    };
  }, [data, streamId]);

  const sendMessage = async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    try {
      await apiRequest('POST', `/api/live/${streamId}/message`, { message: text });
      queryClient.invalidateQueries({ queryKey: [`/api/live/${streamId}/messages`] });
    } catch {
      toast({ title: 'Could not send', variant: 'destructive' });
    }
  };

  const sendGift = async (gift: GiftDef) => {
    try {
      await apiRequest('POST', `/api/live/${streamId}/gift`, { giftId: gift.id });
      setShowGifts(false);
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      queryClient.invalidateQueries({ queryKey: [`/api/live/${streamId}/messages`] });
      toast({ title: `${gift.emoji} Gift sent!`, description: `You sent a ${gift.name}.` });
    } catch (err: any) {
      toast({ title: 'Gift failed', description: err?.message || 'Recharge your wallet to send gifts.', variant: 'destructive' });
    }
  };

  if (isLoading || !data) return <LoadingSpinner />;

  if (data.stream.status !== 'live') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-8">
        <Radio className="w-14 h-14 text-muted-foreground/40 mb-4" />
        <p className="font-semibold text-lg">This live session has ended</p>
        <Button className="mt-4" onClick={() => setLocation('/live')}>Back to Live</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Video stage */}
      <div className="relative flex-1 min-h-[55vh] bg-gradient-to-br from-nava-royal-purple/40 to-black">
        <div ref={videoRef} className="absolute inset-0" />
        {!videoReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Avatar className="w-24 h-24 ring-4 ring-white/30 mb-3">
              <AvatarImage src={data.astrologer?.profileImageUrl || undefined} />
              <AvatarFallback className="text-3xl">{data.astrologer?.name?.[0] || 'A'}</AvatarFallback>
            </Avatar>
            <p className="font-semibold">{data.astrologer?.name}</p>
            <p className="text-xs text-white/70 mt-1 flex items-center gap-1">
              {avError ? avError : <><Loader2 className="w-3 h-3 animate-spin" /> Connecting to live video…</>}
            </p>
          </div>
        )}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <button onClick={() => setLocation('/live')} className="p-1.5 rounded-lg bg-black/40" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Badge className="bg-red-500 border-0 gap-1 animate-pulse"><Radio className="w-3 h-3" /> LIVE</Badge>
            <Badge className="bg-black/40 border-0 gap-1"><Eye className="w-3 h-3" /> {data.stream.viewerCount}</Badge>
          </div>
        </div>
      </div>

      {/* Chat + gifts */}
      <div className="bg-background text-foreground rounded-t-2xl -mt-4 relative z-10 flex flex-col" style={{ height: '42vh' }}>
        <div className="px-4 pt-3 pb-2">
          <p className="font-semibold text-sm">{data.astrologer?.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{data.stream.title}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-2">
          {messages?.map((m) => (
            <div key={m.id} className="text-sm" data-testid={`msg-${m.id}`}>
              {m.type === 'gift' ? (
                <span className="inline-block px-2 py-1 rounded-lg bg-nava-amber/20 text-nava-amber font-medium text-xs">
                  {m.senderName} {m.message}
                </span>
              ) : m.type === 'join' ? (
                <span className="text-xs text-muted-foreground">{m.senderName} joined</span>
              ) : (
                <span>
                  <span className={`font-semibold ${m.senderType === 'astrologer' ? 'text-nava-royal-purple' : 'text-foreground'}`}>{m.senderName}: </span>
                  <span className="text-muted-foreground">{m.message}</span>
                </span>
              )}
            </div>
          ))}
        </div>

        {showGifts && (
          <div className="grid grid-cols-3 gap-2 p-3 border-t border-border">
            {data.gifts.map((g) => (
              <button key={g.id} onClick={() => sendGift(g)} className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border hover:bg-muted" data-testid={`gift-${g.id}`}>
                <span className="text-2xl">{g.emoji}</span>
                <span className="text-[11px] font-medium">{g.name}</span>
                <span className="text-[10px] text-muted-foreground">₹{g.amount}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 p-3 border-t border-border pb-safe">
          <Input
            placeholder="Say something…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            className="flex-1 rounded-full"
            data-testid="input-chat"
          />
          <button onClick={() => setShowGifts((s) => !s)} className="w-10 h-10 rounded-full bg-nava-amber/20 flex items-center justify-center text-nava-amber shrink-0" data-testid="button-gifts">
            <Gift className="w-5 h-5" />
          </button>
          <button onClick={sendMessage} className="w-10 h-10 rounded-full bg-nava-royal-purple flex items-center justify-center text-white shrink-0" data-testid="button-send">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
