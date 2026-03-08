import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
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
      const r = await apiRequest('POST', '/api/schedule', {
        astrologerId: selectedAstrologerId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        type,
        durationMinutes: parseInt(durationMinutes),
        notes,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Booking failed');
      return data;
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
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-foreground/5 ">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/astrologers">
              <button className="p-2 rounded-xl hover:bg-foreground/5">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <h1 className="font-bold text-lg text-foreground">Book Appointment</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-muted-foreground mb-6">Schedule a consultation at a time that works for you</p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Booking Form */}
          <Card>
            <CardHeader>
              <CardTitle>New Appointment</CardTitle>
              <CardDescription>Choose your astrologer and preferred time</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Astrologer Select */}
              <div>
                <Label>Select Astrologer</Label>
                <Select value={selectedAstrologerId} onValueChange={setSelectedAstrologerId}>
                  <SelectTrigger className="mt-1">
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
                <div className="p-3 bg-amber-50 rounded-lg flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={selectedAstrologer.profileImageUrl || undefined} />
                    <AvatarFallback>{selectedAstrologer.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{selectedAstrologer.name}</p>
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
                  className="mt-1"
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
                      className="gap-1"
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
                  <SelectTrigger className="mt-1">
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
                  className="mt-1"
                  rows={3}
                />
              </div>

              {/* Cost Preview */}
              {estimatedCost > 0 && (
                <div className="p-3 bg-green-50 rounded-lg text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Estimated cost</span>
                    <span className="text-xl font-bold text-green-700">₹{estimatedCost.toFixed(0)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Charged from your wallet at session end</p>
                </div>
              )}

              <Button
                className="w-full"
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
            <h2 className="text-xl font-semibold mb-4">My Appointments</h2>
            {isLoading ? (
              <LoadingSpinner />
            ) : !mySchedule || mySchedule.length === 0 ? (
              <Card>
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
                    <Card key={s.id} className={isPast ? 'opacity-60' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {typeIcon(s.type)}
                            <div>
                              <p className="font-medium capitalize">{s.type} Consultation</p>
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
                                className="mt-1 text-red-500 hover:text-red-700 w-6 h-6"
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
      <BottomNav />
    </div>
  );
}
