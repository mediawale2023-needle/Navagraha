import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { loadAgoraSDK } from '@/lib/agora';
import { Radio, Eye, Send, Loader2, X } from 'lucide-react';

interface StreamMessage {
  id: string;
  senderName: string;
  senderType: string;
  type: string;
  message: string | null;
}

export default function LiveStudio() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [streamId, setStreamId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [draft, setDraft] = useState('');
  const [avError, setAvError] = useState<string | null>(null);
  const clientRef = useRef<any>(null);
  const tracksRef = useRef<any[]>([]);
  const videoRef = useRef<HTMLDivElement>(null);

  // Require astrologer session
  const { data: me, isLoading: meLoading, isError } = useQuery<{ id: string; name: string }>({
    queryKey: ['/api/astrologer/auth/me'],
    retry: false,
  });
  useEffect(() => {
    if (!meLoading && isError) setLocation('/astrologer/login');
  }, [meLoading, isError]);

  const { data: messages } = useQuery<StreamMessage[]>({
    queryKey: [`/api/live/${streamId}/messages`],
    enabled: !!streamId,
    refetchInterval: 3000,
  });

  const goLive = async () => {
    setStarting(true);
    setAvError(null);
    try {
      const res = await apiRequest('POST', '/api/live/start', { title });
      const data = await res.json();
      const stream = data.stream;
      setStreamId(stream.id);

      if (!data.token || !data.appId) {
        setAvError('Agora not configured — viewers will see chat only.');
        setStarting(false);
        return;
      }
      const AgoraRTC = await loadAgoraSDK();
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      clientRef.current = client;
      await client.setClientRole('host');
      await client.join(data.appId, stream.agoraChannel, data.token, 0);
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      const camTrack = await AgoraRTC.createCameraVideoTrack();
      tracksRef.current = [micTrack, camTrack];
      if (videoRef.current) camTrack.play(videoRef.current);
      await client.publish([micTrack, camTrack]);
    } catch (err: any) {
      console.error('Go live error:', err);
      setAvError(err?.message || 'Could not start the broadcast.');
    } finally {
      setStarting(false);
    }
  };

  const endLive = async () => {
    try {
      if (streamId) await apiRequest('POST', `/api/live/${streamId}/end`);
    } catch { /* ignore */ }
    tracksRef.current.forEach((t) => { try { t.stop(); t.close(); } catch { /* noop */ } });
    clientRef.current?.leave().catch(() => {});
    toast({ title: 'Stream ended' });
    setLocation('/astrologer/dashboard');
  };

  const sendMessage = async () => {
    if (!draft.trim() || !streamId) return;
    const text = draft.trim();
    setDraft('');
    await apiRequest('POST', `/api/live/${streamId}/message`, { message: text }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: [`/api/live/${streamId}/messages`] });
  };

  useEffect(() => () => {
    tracksRef.current.forEach((t) => { try { t.stop(); t.close(); } catch { /* noop */ } });
    clientRef.current?.leave().catch(() => {});
  }, []);

  if (meLoading) return null;

  // Pre-live setup screen
  if (!streamId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <Radio className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold">Go Live</h1>
          <p className="text-sm text-muted-foreground mb-6">Broadcast to your followers and receive gifts.</p>
          <Input
            placeholder="Stream title (e.g. Daily Tarot Q&A)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl mb-3"
            data-testid="input-title"
          />
          <Button onClick={goLive} disabled={starting} className="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl" data-testid="button-go-live">
            {starting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…</> : 'Start Broadcasting'}
          </Button>
          <Button variant="ghost" onClick={() => setLocation('/astrologer/dashboard')} className="w-full mt-2">Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="relative flex-1 min-h-[55vh] bg-gradient-to-br from-nava-royal-purple/40 to-black">
        <div ref={videoRef} className="absolute inset-0" />
        {avError && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6">
            <p className="text-sm text-white/80">{avError}</p>
          </div>
        )}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <Badge className="bg-red-500 border-0 gap-1 animate-pulse"><Radio className="w-3 h-3" /> LIVE</Badge>
          <Button size="sm" variant="destructive" onClick={endLive} className="rounded-full gap-1" data-testid="button-end-live">
            <X className="w-4 h-4" /> End
          </Button>
        </div>
      </div>

      <div className="bg-background text-foreground rounded-t-2xl -mt-4 relative z-10 flex flex-col" style={{ height: '42vh' }}>
        <div className="px-4 py-2 text-sm font-semibold border-b border-border">Live chat</div>
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {messages?.map((m) => (
            <div key={m.id} className="text-sm" data-testid={`msg-${m.id}`}>
              {m.type === 'gift' ? (
                <span className="inline-block px-2 py-1 rounded-lg bg-nava-amber/20 text-nava-amber font-medium text-xs">{m.senderName} {m.message}</span>
              ) : m.type === 'join' ? (
                <span className="text-xs text-muted-foreground">{m.senderName} joined</span>
              ) : (
                <span><span className={`font-semibold ${m.senderType === 'astrologer' ? 'text-nava-royal-purple' : ''}`}>{m.senderName}: </span><span className="text-muted-foreground">{m.message}</span></span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 p-3 border-t border-border pb-safe">
          <Input placeholder="Reply to viewers…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} className="flex-1 rounded-full" data-testid="input-chat" />
          <button onClick={sendMessage} className="w-10 h-10 rounded-full bg-nava-royal-purple flex items-center justify-center text-white shrink-0" data-testid="button-send"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}
