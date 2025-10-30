import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  ArrowLeft, Send, User, Clock, Phone, Video 
} from 'lucide-react';
import type { ChatMessage, Astrologer } from '@shared/schema';

export default function Chat() {
  const [, params] = useRoute('/chat/:astrologerId');
  const astrologerId = params?.astrologerId;
  const [message, setMessage] = useState('');
  const [sessionTime, setSessionTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: astrologer, isLoading: astrologerLoading } = useQuery<Astrologer>({
    queryKey: ['/api/astrologers', astrologerId],
    enabled: !!astrologerId,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['/api/chat', astrologerId],
    enabled: !!astrologerId,
    refetchInterval: 3000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      return await apiRequest('POST', `/api/chat/${astrologerId}`, { 
        message: messageText,
        sender: 'user'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat', astrologerId] });
      setMessage('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate(message);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (astrologerLoading || messagesLoading) {
    return <LoadingSpinner />;
  }

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
  const currentCost = ((sessionTime / 60) * pricePerMin).toFixed(2);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-card-border">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Link href="/astrologers">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>

              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                {astrologer.profileImageUrl ? (
                  <img 
                    src={astrologer.profileImageUrl} 
                    alt={astrologer.name} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <User className="w-6 h-6 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg text-foreground truncate">
                  {astrologer.name}
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="default" className="gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Active now
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" data-testid="button-voice-call">
                <Phone className="w-5 h-5" />
              </Button>
              <Button variant="outline" size="icon" data-testid="button-video-call">
                <Video className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Session Info Banner */}
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-2">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-foreground">
            <Clock className="w-4 h-4" />
            <span>Session: {formatTime(sessionTime)}</span>
          </div>
          <div className="font-semibold text-foreground">
            Current Cost: ₹{currentCost} (₹{pricePerMin}/min)
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages && messages.length > 0 ? (
            messages.map((msg, index) => {
              const isUser = msg.sender === 'user';
              const time = new Date(msg.createdAt).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              });

              return (
                <div
                  key={msg.id || index}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  data-testid={`message-${index}`}
                >
                  <div className={`max-w-md md:max-w-lg ${isUser ? 'order-1' : 'order-2'}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        isUser
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border border-card-border backdrop-blur-sm'
                      }`}
                    >
                      <p className={isUser ? 'text-primary-foreground' : 'text-card-foreground'}>
                        {msg.message}
                      </p>
                    </div>
                    <div className={`text-xs text-muted-foreground mt-1 px-2 ${isUser ? 'text-right' : 'text-left'}`}>
                      {time}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">No messages yet</p>
              <p className="text-sm text-muted-foreground">
                Start the conversation with {astrologer.name}
              </p>
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
              placeholder="Type your message..."
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
        </form>
      </div>
    </div>
  );
}
