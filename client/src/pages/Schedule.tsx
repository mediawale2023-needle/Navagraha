import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ArrowLeft, Calendar, Clock, Phone, MessageCircle, Video, X, Star
} from 'lucide-react';
import type { ScheduledCall, Astrologer } from '@shared/schema';

export default function Schedule() {
  const [location] = useLocation();
  const preselectedAstrologerId = new URLSearchParams(location.split('?')[1] || '').get('astrologerId');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [selectedAstrologerId, setSelectedAstrologerId] = useState(preselectedAstrologerId || '');
  const [scheduledAt, setScheduledAt] = useState('');
  const [type, setType] = useState('voice');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [notes, setNotes] = useState('');

  const { data: astrologers } = useQuery<Astrologer[]>({ queryKey: ['/api/astrologers'] });
  const { data: mySchedule, isLoading } = useQuery<ScheduledCall[]>({ queryKey: ['/api/schedule'] });

  const selectedAstrologer = astrologers?.find(a => a.id === selectedAstrologerId);
  const estimatedCost = selectedAstrologer
    ? parseFloat(selectedAstrologer.pricePerMinute || '25') * parseInt(durationMinutes || '30')
    : 0;

  // Min datetime = now + 30 minutes
  const minDateTime = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16);

  const bookMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/schedule', {
        astrologerId: selectedAstrologerId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        type,
        durationMinutes: parseInt(durationMinutes),
        notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      setScheduledAt('');
      setNotes('');
      toast({
        title: '✓ Appointment Booked!',
        description: `Your ${type} consultation is confirmed. You'll receive a reminder before the session.`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Booking Failed', description: error.message, variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/schedule/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: 'Appointment Cancelled' });
    },
  });

  const typeIcon = (t: string) => t === 'voice' ? <Phone className="w-4 h-4" /> : t === 'video' ? <Video className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />;

  return (
    <div className="yantra-shell min-h-screen pb-20 md:pb-0">
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/astrologers">
              <button className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border bg-card hover:bg-muted">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <h1 className="font-display text-xl text-foreground">Book Appointment</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-muted-foreground mb-6">Schedule a consultation at a time that works for you</p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Booking Form */}
          <Card className="yantra-card">
            <CardHeader>
              <CardTitle className="font-display">New Appointment</CardTitle>
              <CardDescription>Choose your astrologer and preferred time</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Astrologer Select */}
              <div>
                <Label>Select Astrologer</Label>
                <Select value={selectedAstrologerId} onValueChange={setSelectedAstrologerId}>
                  <SelectTrigger className="mt-1 rounded-[10px]">
                    <SelectValue placeholder="Choose an astrologer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {astrologers?.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <span>{a.name}</span>
                          <span className="text-muted-foreground text-xs">• ₹{a.pricePerMinute}/min</span>
                          <span className="text-amber-500 text-xs">⭐ {a.rating}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected astrologer preview */}
              {selectedAstrologer && (
                <div className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3">
                  <Avatar className="h-10 w-10 rounded-[6px]">
                    <AvatarImage src={selectedAstrologer.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-nava-navy font-display text-primary">{selectedAstrologer.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-display text-base">{selectedAstrologer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedAstrologer.specializations?.slice(0, 2).join(', ')} • {selectedAstrologer.experience}yr exp
                    </p>
                  </div>
                </div>
              )}

              {/* Date/Time */}
              <div>
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  min={minDateTime}
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="mt-1 rounded-[10px]"
                />
              </div>

              {/* Session Type */}
              <div>
                <Label>Session Type</Label>
                <div className="flex gap-2 mt-2">
                  {[
                    { value: 'voice', label: 'Voice Call', icon: <Phone className="w-4 h-4" /> },
                    { value: 'video', label: 'Video Call', icon: <Video className="w-4 h-4" /> },
                    { value: 'chat', label: 'Chat', icon: <MessageCircle className="w-4 h-4" /> },
                  ].map(opt => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={type === opt.value ? 'default' : 'outline'}
                      onClick={() => setType(opt.value)}
                      className={`gap-1 rounded-[9px] ${type === opt.value ? 'bg-nava-navy text-primary hover:bg-nava-navy/90' : ''}`}
                    >
                      {opt.icon} {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <Label>Duration</Label>
                <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                  <SelectTrigger className="mt-1 rounded-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60, 90].map(d => (
                      <SelectItem key={d} value={String(d)}>
                        {d} minutes
                        {selectedAstrologer && (
                          <span className="text-muted-foreground ml-2">
                            — ₹{parseFloat(selectedAstrologer.pricePerMinute || '25') * d}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="What would you like to discuss? e.g., career, marriage, health..."
                  className="mt-1 rounded-[10px]"
                  rows={3}
                />
              </div>

              {/* Cost Preview */}
              {estimatedCost > 0 && (
                <div className="rounded-[10px] bg-primary/10 p-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Estimated cost</span>
                    <span className="font-display text-xl text-[var(--primary-border)]">₹{estimatedCost.toFixed(0)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Charged from your wallet at session end</p>
                </div>
              )}

              <Button
                className="w-full rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => bookMutation.mutate()}
                disabled={!selectedAstrologerId || !scheduledAt || bookMutation.isPending}
              >
                {bookMutation.isPending ? <LoadingSpinner size="sm" /> : (
                  <><Calendar className="w-4 h-4 mr-2" />Book Appointment</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* My Bookings */}
          <div>
            <h2 className="mb-4 font-display text-2xl">My Appointments</h2>
            {isLoading ? (
              <LoadingSpinner />
            ) : !mySchedule || mySchedule.length === 0 ? (
              <Card className="yantra-card">
                <CardContent className="py-12 text-center">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-muted-foreground">No appointments yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {mySchedule.map((s) => {
                  const scheduledDate = new Date(s.scheduledAt);
                  const isPast = scheduledDate < new Date();
                  return (
                    <Card key={s.id} className={`yantra-card ${isPast ? 'opacity-60' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {typeIcon(s.type)}
                            <div>
                              <p className="font-display capitalize">{s.type} Consultation</p>
                              <p className="text-sm text-muted-foreground">
                                <Calendar className="w-3 h-3 inline mr-1" />
                                {scheduledDate.toLocaleDateString()}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                <Clock className="w-3 h-3 inline mr-1" />
                                {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {s.durationMinutes} mins
                              </p>
                              {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{s.notes}"</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">₹{parseFloat(s.totalAmount || '0').toFixed(0)}</p>
                            <Badge
                              variant={s.status === 'confirmed' ? 'default' : s.status === 'cancelled' ? 'destructive' : 'secondary'}
                              className="text-xs mt-1"
                            >
                              {s.status}
                            </Badge>
                            {s.status === 'pending' && !isPast && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="mt-1 h-6 w-6 text-red-500 hover:text-red-700"
                                onClick={() => cancelMutation.mutate(s.id)}
                                disabled={cancelMutation.isPending}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
