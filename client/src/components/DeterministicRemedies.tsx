import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Sparkles, Gem, BookHeart, HandHeart, CalendarClock, Target } from 'lucide-react';
import type { RemediationRequestPlanet, FullRemediationResponse } from '@/../../server/astroEngineClient';

export function DeterministicRemedies({ 
  shadbala, 
  fallbackRemedies 
}: { 
  shadbala?: RemediationRequestPlanet[],
  fallbackRemedies?: any[] 
}) {
  const { data, isLoading, error } = useQuery<FullRemediationResponse | null>({
    queryKey: ['/api/remediation', shadbala?.map(p => p.planet).join(',')],
    queryFn: async () => {
      if (!shadbala || shadbala.length === 0) return null;
      return await apiRequest('POST', '/api/remediation', { planets: shadbala });
    },
    enabled: !!shadbala && shadbala.length > 0
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--magenta)]" />
        <p className="text-muted-foreground animate-pulse">Calculating precise Vedic prescriptions via Shadbala engine...</p>
      </div>
    );
  }

  // If no shadbala data available, or engine failed, fallback to the LLM/General remedies
  if (!shadbala || !data || data.remediations.length === 0) {
    if (data?.overall_guidance) {
      return (
        <Card className="bg-green-50/50 border-green-200">
          <CardContent className="p-6">
            <h4 className="font-semibold text-lg text-green-800 mb-2">Excellent Planetary Strength</h4>
            <p className="text-green-700">{data.overall_guidance}</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-4">
        {fallbackRemedies?.map((remedy: any, i: number) => (
          <div key={i} className="p-4 border rounded-lg bg-amber-500/10 border-amber-500/20">
            <h4 className="font-semibold mb-1">{remedy.title}</h4>
            <p className="text-sm text-muted-foreground">{remedy.description}</p>
            {remedy.type && <Badge variant="outline" className="mt-2 text-xs">{remedy.type}</Badge>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-5 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-orange-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-orange-900 mb-1">Engine Guidance</h3>
            <p className="text-sm text-orange-800">{data.overall_guidance}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.remediations.map((rem: any, idx: number) => (
          <Card key={idx} className={`overflow-hidden border-t-4 ${
            rem.urgency === 'Critical' ? 'border-t-red-500' : 'border-t-amber-500'
          }`}>
            <div className="p-4 bg-muted/30 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">{rem.planet} Remediation</h3>
                <p className="text-xs text-muted-foreground">{rem.strength_label}</p>
              </div>
              <Badge variant={rem.urgency === 'Critical' ? 'destructive' : 'secondary'}>
                {rem.urgency} Action
              </Badge>
            </div>
            
            <CardContent className="p-5 space-y-6">
              
              {/* Gemstone */}
              <div>
                <h4 className="flex items-center gap-2 font-semibold text-sm mb-2 text-foreground/90">
                  <Gem className="w-4 h-4 text-blue-500" /> Primary Gemstone (Ratna)
                </h4>
                <div className="bg-blue-50/50 p-3 rounded text-sm text-blue-900 border border-blue-100">
                  <p><strong>Stone:</strong> {rem.gemstone.primary} <span className="text-xs text-muted-foreground">({rem.gemstone.weight_carats})</span></p>
                  <p><strong>Wear on:</strong> {rem.gemstone.finger}, set in {rem.gemstone.metal}</p>
                  <p><strong>Timing:</strong> {rem.gemstone.day_to_wear}</p>
                </div>
              </div>

              {/* Mantra */}
              <div>
                <h4 className="flex items-center gap-2 font-semibold text-sm mb-2 text-foreground/90">
                  <BookHeart className="w-4 h-4 text-purple-500" /> Vedic Mantra (Japa)
                </h4>
                <div className="bg-purple-50/50 p-3 rounded text-sm text-purple-900 border border-purple-100 pb-4">
                  <p className="font-serif italic text-lg mb-1">{rem.mantra.beeja_mantra}</p>
                  <p className="text-xs text-purple-700/80 mb-2">Chant {rem.mantra.daily_repetitions} times daily for {rem.mantra.duration_days} days.</p>
                  <p className="text-[11px] font-medium uppercase tracking-wider bg-purple-200/50 inline-block px-2 py-0.5 rounded">
                    Best Time: {rem.mantra.best_time}
                  </p>
                </div>
              </div>

              {/* Charity & Lifestyle */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-orange-50/50 p-3 rounded border border-orange-100">
                  <h4 className="flex items-center gap-1.5 font-semibold text-xs mb-1.5 text-orange-900">
                    <HandHeart className="w-3.5 h-3.5" /> Charity
                  </h4>
                  <p className="text-xs text-orange-800 leading-snug">
                    Donate on {rem.charity.day}: {rem.charity.items.join(', ')}.
                  </p>
                </div>
                <div className="bg-green-50/50 p-3 rounded border border-green-100">
                  <h4 className="flex items-center gap-1.5 font-semibold text-xs mb-1.5 text-green-900">
                    <CalendarClock className="w-3.5 h-3.5" /> Fasting
                  </h4>
                  <p className="text-xs text-green-800 leading-snug">
                    Fast on {rem.fasting.day}. Avoid {rem.fasting.what_to_avoid}.
                  </p>
                </div>
              </div>
              
              {/* Specialized Action */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Target className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  <strong>Color Therapy:</strong> Favor {rem.color_therapy.join(', ')}
                </p>
              </div>
              
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
