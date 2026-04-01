import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Loader2, Compass, Sun, Moon, Clock } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';

const prashnaSchema = z.object({
  question_category: z.enum(['general', 'career', 'marriage', 'health', 'finance', 'travel']),
  place: z.string().min(2, 'Place is required to calculate Ascendant'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

type PrashnaFormData = z.infer<typeof prashnaSchema>;

export default function Prashna() {
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const form = useForm<PrashnaFormData>({
    resolver: zodResolver(prashnaSchema),
    defaultValues: {
      question_category: 'general',
      place: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: PrashnaFormData) => {
      // Note: Coordinates are typically stored in the PlacesAutocomplete component
      // We pass fallback defaults if coordinates aren't fully resolved yet
      const payload = {
        question_category: data.question_category,
        latitude: data.latitude || 28.6139,
        longitude: data.longitude || 77.2090,
      };
      return await apiRequest('POST', '/api/prashna', payload);
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: 'Prashna Chart Cast!',
        description: 'Your horary question has been analyzed based on the current moment.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cast Prashna chart.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: PrashnaFormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="border-b border-foreground/5 px-4 pt-12 pb-8">
        <div className="max-w-5xl mx-auto">
          <Link href="/">
            <button className="mb-4 p-2 rounded-lg hover:bg-foreground/5 transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          </Link>
          <div className="text-center">
            <Compass className="w-14 h-14 text-[var(--magenta)] mx-auto mb-3" />
            <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
              Prashna Kundli
            </h1>
            <p className="text-foreground/80 text-base">
              Horary Astrology: Ask a question, and the universe answers based on this exact moment.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!result ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card className="glass-card overflow-hidden shadow-sm">
                <CardHeader className="bg-[var(--magenta)]/5 border-b border-foreground/5">
                  <CardTitle className="text-foreground">Determine the Moment</CardTitle>
                  <CardDescription>We will use the current time automatically. Where are you right now?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-5">
                  <FormField
                    control={form.control}
                    name="question_category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What is the nature of your question?</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="general">General / Life Direction</SelectItem>
                            <SelectItem value="career">Job / Career Promoton / Business</SelectItem>
                            <SelectItem value="finance">Wealth / Investment / Loans</SelectItem>
                            <SelectItem value="marriage">Marriage / Relationship</SelectItem>
                            <SelectItem value="health">Health / Recovery</SelectItem>
                            <SelectItem value="travel">Foreign Travel / Relocation</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="place"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Current Location</FormLabel>
                        <FormControl>
                          <PlacesAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            onPlaceSelect={(place) => {
                                form.setValue('latitude', place.lat);
                                form.setValue('longitude', place.lng);
                            }}
                            placeholder="City, State, Country"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="p-4 bg-blue-50/50 rounded-lg flex gap-3 text-sm text-blue-800 border border-blue-100">
                    <Clock className="w-5 h-5 flex-shrink-0 text-blue-600" />
                    <p>
                      <strong>Horary Rules:</strong> The Prashna chart is cast for the exact moment you click the button below. Ensure your mind is focused on the question.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Button
                type="submit"
                size="lg"
                className="w-full gradient-primary hover:opacity-90 text-white shadow-md h-12 text-lg"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Casting Chart...
                  </>
                ) : (
                  <>
                    <Sun className="w-5 h-5 mr-2" />
                    Ask the Universe
                  </>
                )}
              </Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Verdict Card */}
            <Card className="glass-card overflow-hidden border-0 shadow-lg">
              <CardContent className="p-0">
                <div className={`p-8 text-center text-white ${
                  result.answer_indicator.startsWith('YES') ? 'bg-gradient-to-br from-green-600 to-emerald-500' :
                  result.answer_indicator.startsWith('CONDITIONAL') ? 'bg-gradient-to-br from-amber-500 to-orange-500' :
                  result.answer_indicator.startsWith('NOT_NOW') ? 'bg-gradient-to-br from-blue-600 to-indigo-500' :
                  'bg-gradient-to-br from-red-600 to-rose-500'
                }`}>
                  <h2 className="font-serif text-2xl font-semibold mb-2 text-white">Prashna Verdict</h2>
                  <div className="w-32 h-32 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-4 mt-2 shadow-inner backdrop-blur-sm">
                    <span className="text-3xl font-bold text-white text-center px-2">
                       {result.answer_indicator.split('—')[0].trim()}
                    </span>
                  </div>
                  <p className="text-lg text-white/90 font-medium">
                    {result.answer_indicator.split('—')[1]?.trim() || result.answer_indicator}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Timing Window */}
            <Card className="glass-card border-l-4 border-l-[var(--magenta)] shadow-sm">
              <CardContent className="p-5 flex gap-4 items-center">
                <div className="p-3 bg-[var(--magenta)]/10 rounded-full text-[var(--magenta)]">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Expected Timing</h3>
                  <p className="text-muted-foreground">{result.timing_window}</p>
                </div>
              </CardContent>
            </Card>

            {/* Panchang & Analysis Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Moon className="w-5 h-5 text-indigo-500"/> Panchang Moment</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between border-b pb-1"><dt className="text-muted-foreground">Tithi</dt><dd className="font-medium">{result.panchang.tithi}</dd></div>
                    <div className="flex justify-between border-b pb-1"><dt className="text-muted-foreground">Nakshatra</dt><dd className="font-medium">{result.panchang.nakshatra} ({result.panchang.nakshatra_deity})</dd></div>
                    <div className="flex justify-between border-b pb-1"><dt className="text-muted-foreground">Yoga</dt><dd className="font-medium">{result.panchang.yoga}</dd></div>
                    <div className="flex justify-between border-b pb-1"><dt className="text-muted-foreground">Vara</dt><dd className="font-medium">{result.panchang.vara}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Hora Lord</dt><dd className="font-medium text-[var(--magenta)]">{result.panchang.hora_lord}</dd></div>
                  </dl>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Compass className="w-5 h-5 text-orange-500"/> Astrological Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-foreground/80 list-disc list-inside">
                    {result.prashna_analysis.map((line: string, i: number) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Button
              variant="outline"
              className="w-full mt-4 h-12"
              onClick={() => {
                setResult(null);
                form.reset();
              }}
            >
              Ask Another Question
            </Button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
