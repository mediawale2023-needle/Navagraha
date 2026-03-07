import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  TrendingUp, Users, Clock, IndianRupee,
  Star, Bell, LogOut, Settings, Wifi, WifiOff,
  Phone, MessageCircle, Video, Calendar, Send,
  CheckCircle2, AlertCircle
} from 'lucide-react';

interface DashboardData {
  astrologer: any;
  stats: {
    totalEarnings: number;
    pendingPayout: number;
    todayEarnings: number;
    totalConsultations: number;
    todayConsultations: number;
  };
  recentConsultations: any[];
  payouts: any[];
}

interface IncomingSession {
  consultationId: string;
  userId: string;
  sessionType: string;
  agoraChannel?: string;
}

export default function AstrologerDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  const [isOnline, setIsOnline] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [incomingSession, setIncomingSession] = useState<IncomingSession | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [sessionTime, setSessionTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Chat with user in active session
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [replyMessage, setReplyMessage] = useState('');

  // Profile edit
  const [editMode, setEditMode] = useState(false);
  const [profile, setProfile] = useState<any>({});

  // Payout
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('upi');

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ['/api/astrologer/dashboard'],
    queryFn: async () => {
      const r = await apiRequest('GET', '/api/astrologer/dashboard');
      if (r.status === 401) {
        navigate('/astrologer/login');
        throw new Error('Unauthorized');
      }
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { data: schedule } = useQuery<any[]>({
    queryKey: ['/api/astrologer/schedule'],
    queryFn: async () => {
      const r = await apiRequest('GET', '/api/astrologer/schedule');
      return r.json();
    },
  });

  // Initialize profile from dashboard data
  useEffect(() => {
    if (dashboard?.astrologer) {
      setIsOnline(dashboard.astrologer.isOnline || false);
      setProfile({
        about: dashboard.astrologer.about || '',
        pricePerMinute: dashboard.astrologer.pricePerMinute || '25',
        experience: dashboard.astrologer.experience || '',
        upiId: dashboard.astrologer.upiId || '',
        bankAccountName: dashboard.astrologer.bankAccountName || '',
        bankAccountNumber: dashboard.astrologer.bankAccountNumber || '',
        bankIfsc: dashboard.astrologer.bankIfsc || '',
        phoneNumber: dashboard.astrologer.phoneNumber || '',
      });
    }
  }, [dashboard]);

  // ─── WebSocket Connection ──────────────────────────────────

  const connectWS = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      const astrologerId = dashboard?.astrologer?.id;
      if (astrologerId) {
        ws.send(JSON.stringify({ type: 'auth', astrologerId, role: 'astrologer' }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'new_session':
          case 'incoming_call':
            setIncomingSession({
              consultationId: msg.consultationId,
              userId: msg.userId,
              sessionType: msg.sessionType || msg.callType || 'chat',
              agoraChannel: msg.agoraChannel,
            });
            toast({
              title: '📞 Incoming Session!',
              description: `New ${msg.sessionType || msg.callType || 'chat'} consultation request`,
            });
            break;
          case 'new_message':
            if (msg.message) {
              setChatMessages(prev => {
                if (prev.some(m => m.id === msg.message.id)) return prev;
                return [...prev, msg.message];
              });
            }
            break;
          case 'session_ended':
            if (activeSession?.consultationId === msg.consultationId) {
              setActiveSession(null);
              if (timerRef.current) clearInterval(timerRef.current);
              toast({ title: 'Session Ended', description: `Earned ₹${msg.earning || '—'}` });
              queryClient.invalidateQueries({ queryKey: ['/api/astrologer/dashboard'] });
            }
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) connectWS();
      }, 3000);
    };

    ws.onerror = () => setWsConnected(false);
  }, [dashboard?.astrologer?.id, toast, queryClient, activeSession]);

  useEffect(() => {
    if (dashboard?.astrologer?.id) connectWS();
    return () => wsRef.current?.close();
  }, [dashboard?.astrologer?.id]);

  // Session timer
  useEffect(() => {
    if (activeSession) {
      timerRef.current = setInterval(() => setSessionTime(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSessionTime(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeSession]);

  // ─── Actions ──────────────────────────────────────────────

  const toggleOnlineMutation = useMutation({
    mutationFn: async (online: boolean) => {
      const r = await apiRequest('POST', '/api/astrologer/status', { isOnline: online });
      return r.json();
    },
    onSuccess: (_, online) => {
      setIsOnline(online);
      queryClient.invalidateQueries({ queryKey: ['/api/astrologer/dashboard'] });
      toast({ title: online ? '✓ You are now Online' : 'You are now Offline', description: online ? 'Clients can now find and contact you' : 'You will not receive new session requests' });
    },
  });

  const acceptSession = () => {
    if (!incomingSession) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'call_accepted',
        userId: incomingSession.userId,
        astrologerId: dashboard?.astrologer?.id,
        consultationId: incomingSession.consultationId,
      }));
    }
    setActiveSession(incomingSession);
    setIncomingSession(null);
    // Load existing chat messages
    apiRequest('GET', `/api/chat/${incomingSession.userId}`)
      .then(r => r.json())
      .then(msgs => setChatMessages(msgs))
      .catch(() => {});
  };

  const rejectSession = () => {
    if (!incomingSession) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'call_rejected',
        userId: incomingSession.userId,
        consultationId: incomingSession.consultationId,
      }));
    }
    setIncomingSession(null);
    toast({ title: 'Session Rejected' });
  };

  const sendReply = async () => {
    if (!replyMessage.trim() || !activeSession) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'astrologer_reply',
        astrologerId: dashboard?.astrologer?.id,
        userId: activeSession.userId,
        message: replyMessage,
        consultationId: activeSession.consultationId,
      }));
    }
    // Also save via API
    try {
      const r = await apiRequest('POST', `/api/chat/${activeSession.userId}`, {
        message: replyMessage,
        sender: 'astrologer',
      });
      const saved = await r.json();
      setChatMessages(prev => {
        if (prev.some(m => m.id === saved.id)) return prev;
        return [...prev, saved];
      });
    } catch {}
    setReplyMessage('');
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiRequest('PUT', '/api/astrologer/profile', data);
      return r.json();
    },
    onSuccess: () => {
      setEditMode(false);
      queryClient.invalidateQueries({ queryKey: ['/api/astrologer/dashboard'] });
      toast({ title: 'Profile Updated' });
    },
  });

  const payoutMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest('POST', '/api/astrologer/payout', { amount: payoutAmount, method: payoutMethod });
      return r.json();
    },
    onSuccess: () => {
      setPayoutAmount('');
      queryClient.invalidateQueries({ queryKey: ['/api/astrologer/dashboard'] });
      toast({ title: 'Payout Requested', description: 'Your withdrawal request has been submitted. T+2 processing.' });
    },
    onError: (error: any) => {
      toast({ title: 'Payout Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleLogout = async () => {
    await apiRequest('POST', '/api/astrologer/auth/logout', {});
    navigate('/astrologer/login');
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (isLoading) return <LoadingSpinner />;
  if (!dashboard) return null;

  const { astrologer, stats } = dashboard;

  return (
    <div className="min-h-screen bg-white/3">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0D0D0D] border-b border-white/5 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 border-2 border-[#1A1A1A]">
              <AvatarImage src={astrologer.profileImageUrl} />
              <AvatarFallback className="bg-[#1A1A1A] text-[#FFCF23] font-bold">
                {astrologer.name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-bold text-[#1A1A1A]">{astrologer.name}</div>
              <div className="text-xs text-[#1A1A1A]/60 flex items-center gap-1">
                {wsConnected ? (
                  <><Wifi className="w-3 h-3 text-green-600" /> Connected</>
                ) : (
                  <><WifiOff className="w-3 h-3 text-red-600" /> Reconnecting...</>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Online toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#1A1A1A] font-medium">{isOnline ? 'Online' : 'Offline'}</span>
              <Switch
                checked={isOnline}
                onCheckedChange={(checked) => toggleOnlineMutation.mutate(checked)}
                disabled={toggleOnlineMutation.isPending}
              />
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-600 animate-pulse' : 'bg-gray-400'}`} />
            </div>
            <button className="p-2 rounded-xl hover:bg-[#1A1A1A]/10" onClick={handleLogout}>
              <LogOut className="w-4 h-4 text-[#1A1A1A]" />
            </button>
          </div>
        </div>
      </div>

      {/* Incoming Session Alert */}
      {incomingSession && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center animate-bounce">
                {incomingSession.sessionType === 'voice' ? <Phone className="w-5 h-5 text-green-600" /> :
                  incomingSession.sessionType === 'video' ? <Video className="w-5 h-5 text-green-600" /> :
                  <MessageCircle className="w-5 h-5 text-green-600" />}
              </div>
              <div>
                <p className="font-semibold text-green-800">Incoming {incomingSession.sessionType} session!</p>
                <p className="text-sm text-green-600">A client is waiting for you</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="destructive" size="sm" onClick={rejectSession}>Decline</Button>
              <Button className="bg-green-600 hover:bg-green-700" size="sm" onClick={acceptSession}>Accept</Button>
            </div>
          </div>
        </div>
      )}

      {/* Active Session Banner */}
      {activeSession && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="font-medium text-amber-800">Active Session — {formatTime(sessionTime)}</span>
            </div>
            <Badge className="bg-amber-600">Session in progress</Badge>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Today's Earnings", value: `₹${stats.todayEarnings.toFixed(0)}`, icon: IndianRupee, color: 'text-green-600' },
            { label: 'Pending Payout', value: `₹${stats.pendingPayout.toFixed(0)}`, icon: TrendingUp, color: 'text-blue-600' },
            { label: 'Total Earned', value: `₹${stats.totalEarnings.toFixed(0)}`, icon: IndianRupee, color: 'text-amber-600' },
            { label: "Today's Sessions", value: stats.todayConsultations, icon: Users, color: 'text-purple-600' },
            { label: 'Total Sessions', value: stats.totalConsultations, icon: Star, color: 'text-amber-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue={activeSession ? 'chat' : 'overview'}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="chat">
              Live Chat {activeSession && <Badge className="ml-2 bg-green-600 text-white text-xs">LIVE</Badge>}
            </TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="payouts">Payouts</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Recent Consultations</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard.recentConsultations.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-40" />
                    <p className="text-muted-foreground">No consultations yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Go online to start receiving clients</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dashboard.recentConsultations.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          {c.type === 'voice' ? <Phone className="w-4 h-4 text-blue-500" /> :
                            c.type === 'video' ? <Video className="w-4 h-4 text-green-500" /> :
                            <MessageCircle className="w-4 h-4 text-amber-500" />}
                          <div>
                            <p className="font-medium text-sm capitalize">{c.type} Consultation</p>
                            <p className="text-xs text-muted-foreground">
                              {c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'} •
                              {c.durationSeconds ? ` ${Math.floor(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s` : ' In progress'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">₹{parseFloat(c.totalAmount || '0').toFixed(0)}</p>
                          <Badge variant={c.status === 'ended' ? 'default' : 'secondary'} className="text-xs">
                            {c.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Live Chat */}
          <TabsContent value="chat">
            {activeSession ? (
              <Card className="h-[500px] flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Live Chat — Session {formatTime(sessionTime)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto space-y-3">
                  {chatMessages.map((msg, i) => (
                    <div key={msg.id || i} className={`flex ${msg.sender === 'astrologer' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${msg.sender === 'astrologer' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        {msg.message}
                      </div>
                    </div>
                  ))}
                </CardContent>
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <Input
                      value={replyMessage}
                      onChange={e => setReplyMessage(e.target.value)}
                      placeholder="Type your reply..."
                      onKeyDown={e => e.key === 'Enter' && sendReply()}
                    />
                    <Button onClick={sendReply} disabled={!replyMessage.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-16 text-center">
                  <MessageCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-40" />
                  <p className="text-muted-foreground">No active chat session</p>
                  <p className="text-sm text-muted-foreground mt-1">Accept an incoming session to start chatting</p>
                  {!isOnline && (
                    <Button className="mt-4" onClick={() => toggleOnlineMutation.mutate(true)}>
                      Go Online to Accept Sessions
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Schedule */}
          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Appointments</CardTitle>
                <CardDescription>Scheduled consultations from clients</CardDescription>
              </CardHeader>
              <CardContent>
                {!schedule || schedule.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-40" />
                    <p className="text-muted-foreground">No scheduled appointments</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedule.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium capitalize">{s.type} Consultation — {s.durationMinutes} mins</p>
                          <p className="text-sm text-muted-foreground">{new Date(s.scheduledAt).toLocaleString()}</p>
                          {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{s.notes}"</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">₹{parseFloat(s.totalAmount || '0').toFixed(0)}</p>
                          <Badge>{s.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Your Profile</CardTitle>
                    <CardDescription>Visible to clients on the platform</CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => setEditMode(!editMode)}>
                    {editMode ? 'Cancel' : <><Settings className="w-4 h-4 mr-2" />Edit</>}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {editMode ? (
                  <div className="space-y-4">
                    <div>
                      <Label>About / Bio</Label>
                      <Textarea value={profile.about} onChange={e => setProfile({ ...profile, about: e.target.value })} className="mt-1" rows={4} placeholder="Describe your expertise..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Price per Minute (₹)</Label>
                        <Input type="number" value={profile.pricePerMinute} onChange={e => setProfile({ ...profile, pricePerMinute: e.target.value })} className="mt-1" min="10" />
                      </div>
                      <div>
                        <Label>Years of Experience</Label>
                        <Input type="number" value={profile.experience} onChange={e => setProfile({ ...profile, experience: e.target.value })} className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label>Phone Number</Label>
                      <Input value={profile.phoneNumber} onChange={e => setProfile({ ...profile, phoneNumber: e.target.value })} className="mt-1" />
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm font-medium mb-3">Payout Details</p>
                      <div className="space-y-3">
                        <div>
                          <Label>UPI ID</Label>
                          <Input value={profile.upiId} onChange={e => setProfile({ ...profile, upiId: e.target.value })} className="mt-1" placeholder="yourname@upi" />
                        </div>
                        <div>
                          <Label>Account Holder Name</Label>
                          <Input value={profile.bankAccountName} onChange={e => setProfile({ ...profile, bankAccountName: e.target.value })} className="mt-1" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Account Number</Label>
                            <Input value={profile.bankAccountNumber} onChange={e => setProfile({ ...profile, bankAccountNumber: e.target.value })} className="mt-1" type="password" />
                          </div>
                          <div>
                            <Label>IFSC Code</Label>
                            <Input value={profile.bankIfsc} onChange={e => setProfile({ ...profile, bankIfsc: e.target.value })} className="mt-1" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button onClick={() => updateProfileMutation.mutate(profile)} disabled={updateProfileMutation.isPending}>
                      {updateProfileMutation.isPending ? <LoadingSpinner size="sm" /> : 'Save Changes'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-16 h-16">
                        <AvatarFallback className="text-xl bg-amber-100 text-amber-800">{astrologer.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="text-xl font-bold">{astrologer.name}</h3>
                        <p className="text-muted-foreground">{astrologer.email}</p>
                        <div className="flex gap-2 mt-1">
                          {astrologer.isVerified ? (
                            <Badge className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>
                          ) : (
                            <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Pending Verification</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {astrologer.about && <p className="text-muted-foreground">{astrologer.about}</p>}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-muted-foreground">Rate:</span> <span className="font-medium">₹{astrologer.pricePerMinute}/min</span></div>
                      <div><span className="text-muted-foreground">Experience:</span> <span className="font-medium">{astrologer.experience || '—'} years</span></div>
                      <div><span className="text-muted-foreground">UPI:</span> <span className="font-medium">{astrologer.upiId || 'Not set'}</span></div>
                      <div><span className="text-muted-foreground">Rating:</span> <span className="font-medium">⭐ {astrologer.rating || '—'}</span></div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payouts */}
          <TabsContent value="payouts">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Request Payout</CardTitle>
                  <CardDescription>Minimum ₹500. T+2 bank transfer.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-700">Available for withdrawal</p>
                    <p className="text-3xl font-bold text-green-700">₹{stats.pendingPayout.toFixed(2)}</p>
                  </div>
                  <div>
                    <Label>Amount (₹)</Label>
                    <Input type="number" value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} className="mt-1" min="500" max={stats.pendingPayout} placeholder="Minimum ₹500" />
                  </div>
                  <div>
                    <Label>Payout Method</Label>
                    <div className="flex gap-3 mt-2">
                      <Button variant={payoutMethod === 'upi' ? 'default' : 'outline'} size="sm" onClick={() => setPayoutMethod('upi')}>UPI</Button>
                      <Button variant={payoutMethod === 'bank' ? 'default' : 'outline'} size="sm" onClick={() => setPayoutMethod('bank')}>Bank Transfer</Button>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => payoutMutation.mutate()}
                    disabled={!payoutAmount || parseFloat(payoutAmount) < 500 || parseFloat(payoutAmount) > stats.pendingPayout || payoutMutation.isPending}
                  >
                    {payoutMutation.isPending ? <LoadingSpinner size="sm" /> : 'Request Payout'}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Payout History</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboard.payouts.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No payouts yet</p>
                  ) : (
                    <div className="space-y-3">
                      {dashboard.payouts.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div>
                            <p className="font-medium">₹{p.amount} via {p.method?.toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</p>
                          </div>
                          <Badge variant={p.status === 'paid' ? 'default' : 'secondary'}>{p.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
