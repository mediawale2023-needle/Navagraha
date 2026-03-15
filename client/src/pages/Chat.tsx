import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import {
  ArrowLeft, Send, Clock, Phone, Video,
  AlertTriangle, WifiOff, Wifi
} from 'lucide-react';
import type { ChatMessage, Astrologer } from '@shared/schema';

export default function Chat() {
  const [, params] = useRoute('/chat/:astrologerId');
  const astrologerId = params?.astrologerId;
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [sessionTime, setSessionTime] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [lowBalance, setLowBalance] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: astrologer, isLoading: astrologerLoading } = useQuery<Astrologer>({
    queryKey: ['/api/astrologers', astrologerId],
    enabled: !!astrologerId,
  });

  const { data: initialMessages, isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['/api/chat', astrologerId],
    enabled: !!astrologerId,
  });

  const { data: walletData } = useQuery<{ balance: string }>({
    queryKey: ['/api/wallet'],
  });

  // Merge initial messages + live WebSocket messages
  const allMessages = [
    ...(initialMessages || []),
    ...liveMessages.filter(lm => !initialMessages?.some(im => im.id === lm.id))
  ];

  // ─── WebSocket Setup ───────────────────────────────────────

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Authenticate using the logged-in user's id
      if (user?.id) {
        ws.send(JSON.stringify({ type: 'auth', userId: user.id, role: 'user' }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'auth_ok':
            break;
          case 'new_message':
            if (msg.message) {
              setLiveMessages(prev => {
                if (prev.some(m => m.id === msg.message.id)) return prev;
                return [...prev, msg.message];
              });
              queryClient.invalidateQueries({ queryKey: ['/api/chat', astrologerId] });
            }
            break;
          case 'billing_tick':
            setCurrentBalance(msg.newBalance);
            if (msg.warning) setLowBalance(true);
            break;
          case 'session_ended':
            if (msg.reason === 'insufficient_balance') {
              toast({
                title: 'Session Ended',
                description: 'Your wallet balance is insufficient. Please recharge to continue.',
                variant: 'destructive',
              });
              setSessionActive(false);
              if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
            }
            break;
          case 'billing_started':
            // Billing confirmed started
            break;
        }
      } catch { }
    };

    ws.onclose = () => {
      setWsConnected(false);
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          connectWebSocket();
        }
      }, 3000);
    };

    ws.onerror = () => setWsConnected(false);
  }, [astrologerId, queryClient, toast, user?.id]);

  useEffect(() => {
    connectWebSocket();
    return () => wsRef.current?.close();
  }, [connectWebSocket]);

  // Session timer
  useEffect(() => {
    if (sessionActive) {
      sessionTimerRef.current = setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);
    } else {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    }
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
  }, [sessionActive]);

  // Set initial balance
  useEffect(() => {
    if (walletData) setCurrentBalance(parseFloat(walletData.balance || '0'));
  }, [walletData]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages]);

  // ─── Start Session ─────────────────────────────────────────

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/consultations/start', {
        astrologerId,
        type: 'chat',
      });
    },
    onSuccess: (consultation) => {
      setConsultationId(consultation.id);
      setSessionActive(true);
      setLowBalance(false);

      // Start billing via WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN && user?.id) {
        wsRef.current.send(JSON.stringify({
          type: 'start_billing',
          consultationId: consultation.id,
          userId: user.id,
          astrologerId,
          pricePerMinute: parseFloat(astrologer?.pricePerMinute || '25'),
        }));
      }

      toast({ title: 'Session Started', description: `Billing at ₹${astrologer?.pricePerMinute || 25}/minute` });
    },
    onError: (error: any) => {
      toast({ title: 'Cannot Start Session', description: error.message || 'Failed to start session', variant: 'destructive' });
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      if (!consultationId) return;
      // Stop billing
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop_billing', consultationId }));
      }
      return await apiRequest('POST', `/api/consultations/${consultationId}/end`, {});
    },
    onSuccess: (consultation) => {
      setSessionActive(false);
      setSessionTime(0);
      queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
      const mins = Math.floor((consultation?.durationSeconds || 0) / 60);
      const secs = (consultation?.durationSeconds || 0) % 60;
      toast({
        title: 'Session Ended',
        description: `Duration: ${mins}m ${secs}s • Total: ₹${consultation?.totalAmount || 0}`,
      });
    },
    onError: () => {
      setSessionActive(false);
      toast({ title: 'Session Ended', description: 'Session ended.' });
    },
  });

  // ─── Send Message ─────────────────────────────────────────

  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      return await apiRequest('POST', `/api/chat/${astrologerId}`, {
        message: messageText,
        sender: 'user',
      });
    },
    onSuccess: (saved, sentText) => {
      // Add to live messages optimistically
      setLiveMessages(prev => {
        if (prev.some(m => m.id === saved.id)) return prev;
        return [...prev, saved];
      });
      setMessage('');

      // Also send via WebSocket for real-time delivery to astrologer
      if (wsRef.current?.readyState === WebSocket.OPEN && user?.id) {
        wsRef.current.send(JSON.stringify({
          type: 'chat_message',
          userId: user.id,
          astrologerId,
          message: sentText,
          consultationId,
        }));
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to send message', variant: 'destructive' });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate(message.trim());
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (astrologerLoading || messagesLoading) return <LoadingSpinner />;

  if (!astrologer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Astrologer not found</p>
          <Link href="/astrologers"><Button>Browse Astrologers</Button></Link>
        </div>
      </div>
    );
  }

  const pricePerMin = Number(astrologer.pricePerMinute) || 25;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-foreground/5 ">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Link href="/astrologers">
                <button className="p-2 rounded-xl hover:bg-foreground/5" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5 text-foreground" />
                </button>
              </Link>
              <Avatar className="w-12 h-12 flex-shrink-0">
                <AvatarImage src={astrologer.profileImageUrl || undefined} alt={astrologer.name} />
                <AvatarFallback className="gradient-primary text-white font-bold">
                  {astrologer.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-foreground truncate">{astrologer.name}</h3>
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${astrologer.isOnline ? 'bg-green-600 animate-pulse' : 'bg-foreground/10'}`} />
                    <span className="text-xs text-foreground/70 font-medium">
                      {astrologer.availability === 'busy' ? 'In a session' : astrologer.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  {wsConnected ? (
                    <Wifi className="w-3 h-3 text-green-600" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-red-600" />
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/call/${astrologerId}?type=voice`}>
                <button className="p-2 rounded-xl bg-foreground/5 hover:bg-foreground/10" data-testid="button-voice-call">
                  <Phone className="w-5 h-5 text-foreground" />
                </button>
              </Link>
              <Link href={`/call/${astrologerId}?type=video`}>
                <button className="p-2 rounded-xl bg-foreground/5 hover:bg-foreground/10" data-testid="button-video-call">
                  <Video className="w-5 h-5 text-foreground" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Session Info Banner */}
      {sessionActive ? (
        <div className={`border-b px-4 py-2 ${lowBalance ? 'bg-red-50 border-red-200' : 'bg-primary/10 border-primary/20'}`}>
          <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {lowBalance && <AlertTriangle className="w-4 h-4 text-red-500" />}
              <Clock className="w-4 h-4" />
              <span>Session: {formatTime(sessionTime)}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-semibold">
                Balance: ₹{currentBalance?.toFixed(2) || '0.00'}
                {lowBalance && <span className="text-red-500 ml-1">(Low!)</span>}
              </span>
              <span className="text-muted-foreground">₹{pricePerMin}/min</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => endSessionMutation.mutate()}
                disabled={endSessionMutation.isPending}
              >
                {endSessionMutation.isPending ? <LoadingSpinner size="sm" /> : 'End Session'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
            <span className="text-amber-700">
              ₹{pricePerMin}/min • Balance: ₹{currentBalance?.toFixed(2) || walletData?.balance || '0.00'}
            </span>
            <Button
              size="sm"
              onClick={() => startSessionMutation.mutate()}
              disabled={startSessionMutation.isPending || !astrologer.isOnline}
            >
              {startSessionMutation.isPending ? <LoadingSpinner size="sm" /> : 'Start Paid Session'}
            </Button>
          </div>
        </div>
      )}

      {/* Low balance warning */}
      {lowBalance && sessionActive && (
        <div className="bg-red-100 border-b border-red-300 px-4 py-2 text-center">
          <span className="text-red-700 text-sm font-medium">
            ⚠ Low balance — <Link href="/wallet" className="underline">recharge now</Link> to avoid session interruption
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {allMessages.length > 0 ? (
            allMessages.map((msg, index) => {
              const isUser = msg.sender === 'user';
              const time = msg.createdAt
                ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <div key={msg.id || index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`} data-testid={`message-${index}`}>
                  <div className={`max-w-md md:max-w-lg ${isUser ? 'order-1' : 'order-2'}`}>
                    <div className={`rounded-2xl px-4 py-3 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
                      <p className={isUser ? 'text-primary-foreground' : 'text-card-foreground'}>{msg.message}</p>
                    </div>
                    <div className={`text-xs text-muted-foreground mt-1 px-2 ${isUser ? 'text-right' : 'text-left'}`}>{time}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">No messages yet</p>
              <p className="text-sm text-muted-foreground">Start the conversation with {astrologer.name}</p>
              {!astrologer.isOnline && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg inline-block">
                  <p className="text-sm text-amber-700">Astrologer is currently offline. You can still send a message.</p>
                  <Link href={`/schedule?astrologerId=${astrologerId}`}>
                    <Button size="sm" variant="outline" className="mt-2">Book Appointment Instead</Button>
                  </Link>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-card-border px-4 py-4">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={sessionActive ? 'Type your message...' : 'Start a session to send messages...'}
              className="flex-1"
              disabled={sendMessageMutation.isPending}
              data-testid="input-message"
            />
            <Button
              type="submit"
              disabled={!message.trim() || sendMessageMutation.isPending}
              data-testid="button-send"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
          {!sessionActive && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              You can send messages for free. Start a paid session for real-time responses from the astrologer.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
