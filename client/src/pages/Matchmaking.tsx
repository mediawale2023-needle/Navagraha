import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { isApiError } from '@/lib/apiError';
import { ArrowLeft, Heart, Loader2 } from 'lucide-react';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';
import { PageHeader } from '@/components/shell/PageHeader';

const matchmakingSchema = z.object({
  person1Name: z.string().min(2, 'Name is required'),
  person1Date: z.string().min(1, 'Date is required'),
  person1Time: z.string().min(1, 'Time is required'),
  person1Place: z.string().min(2, 'Place is required'),
  person1Gender: z.enum(['male', 'female', 'other']),
  person2Name: z.string().min(2, 'Name is required'),
  person2Date: z.string().min(1, 'Date is required'),
  person2Time: z.string().min(1, 'Time is required'),
  person2Place: z.string().min(2, 'Place is required'),
  person2Gender: z.enum(['male', 'female', 'other']),
});

type MatchmakingFormData = z.infer<typeof matchmakingSchema>;

export default function Matchmaking() {
  const [result, setResult] = useState<any>(null);
  const [coords, setCoords] = useState<{ person1?: { lat: number; lng: number }; person2?: { lat: number; lng: number } }>({});
  const { toast } = useToast();

  const form = useForm<MatchmakingFormData>({
    resolver: zodResolver(matchmakingSchema),
    defaultValues: {
      person1Name: '',
      person1Date: '',
      person1Time: '',
      person1Place: '',
      person1Gender: 'male',
      person2Name: '',
      person2Date: '',
      person2Time: '',
      person2Place: '',
      person2Gender: 'female',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: MatchmakingFormData) => {
      return await apiRequest('POST', '/api/matchmaking', {
        ...data,
        person1Lat: coords.person1?.lat, person1Lon: coords.person1?.lng,
        person2Lat: coords.person2?.lat, person2Lon: coords.person2?.lng,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: 'Compatibility Calculated!',
        description: 'Your kundli matching results are ready.',
      });
    },
    onError: (error: Error) => {
      if (isApiError(error) && (error.field === 'person1Place' || error.field === 'person2Place')) {
        form.setError(error.field, { message: 'Pick this birth place from the suggestions so we can find its exact location.' });
        return;
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to calculate compatibility. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: MatchmakingFormData) => {
    mutation.mutate(data);
  };


  return (
    <div className="text-foreground">
      <PageHeader title="Kundli Milan" gloss="कुण्डली मिलान" sub="Ashtakoota matching of two birth charts" back={{ href: "/", label: "Today" }} width="max-w-5xl" />

      <div className="max-w-5xl mx-auto px-4 md:px-10 py-6">
        {!result ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Person 1 */}
                <Card className="yantra-card overflow-hidden">
                  <CardHeader className="border-b border-border bg-primary/10">
                    <CardTitle className="font-display text-foreground">Person 1 Details</CardTitle>
                    <CardDescription>Enter first person's birth information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="person1Name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input className="rounded-[10px]" placeholder="Full name" {...field} data-testid="input-person1-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="person1Gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-[10px]" data-testid="select-person1-gender">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="person1Date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input className="rounded-[10px]" type="date" {...field} data-testid="input-person1-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="person1Time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time of Birth</FormLabel>
                          <FormControl>
                            <Input className="rounded-[10px]" type="time" {...field} data-testid="input-person1-time" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="person1Place"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Place of Birth</FormLabel>
                          <FormControl>
                            <PlacesAutocomplete
                              value={field.value}
                              onChange={(v) => { field.onChange(v); setCoords((c) => ({ ...c, person1: undefined })); }}
                              onPlaceSelect={(place) => setCoords((c) => ({ ...c, person1: { lat: place.lat, lng: place.lng } }))}
                              placeholder="City, State, Country"
                              testId="input-person1-place"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Person 2 */}
                <Card className="yantra-card overflow-hidden">
                  <CardHeader className="border-b border-border bg-card">
                    <CardTitle className="font-display text-foreground">Person 2 Details</CardTitle>
                    <CardDescription>Enter second person's birth information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="person2Name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input className="rounded-[10px]" placeholder="Full name" {...field} data-testid="input-person2-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="person2Gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-[10px]" data-testid="select-person2-gender">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="person2Date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input className="rounded-[10px]" type="date" {...field} data-testid="input-person2-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="person2Time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time of Birth</FormLabel>
                          <FormControl>
                            <Input className="rounded-[10px]" type="time" {...field} data-testid="input-person2-time" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="person2Place"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Place of Birth</FormLabel>
                          <FormControl>
                            <PlacesAutocomplete
                              value={field.value}
                              onChange={(v) => { field.onChange(v); setCoords((c) => ({ ...c, person2: undefined })); }}
                              onPlaceSelect={(place) => setCoords((c) => ({ ...c, person2: { lat: place.lat, lng: place.lng } }))}
                              placeholder="City, State, Country"
                              testId="input-person2-place"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={mutation.isPending}
                data-testid="button-calculate-compatibility"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Calculating Compatibility...
                  </>
                ) : (
                  <>
                    <Heart className="w-5 h-5 mr-2" />
                    Calculate Compatibility
                  </>
                )}
              </Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-6">
            {/* Overall score: the Ashtakoota guna total, out of 36 */}
            <Card className="yantra-card overflow-hidden border-0">
              <CardContent className="p-0">
                <div className="bg-primary p-8 text-center text-ink">
                  <h2 className="font-display text-3xl mb-2">Ashtakoota Guna Milan</h2>
                  <p className="mb-4 text-ink/70" data-testid="text-person-names">
                    {result.person1} & {result.person2}
                  </p>
                  <div className="mx-auto mb-3 flex h-32 w-40 flex-col items-center justify-center rounded-[8px] bg-ink">
                    <span className="font-display text-5xl text-primary" data-testid="text-compatibility-score">
                      {result.gunaScore}<span className="text-2xl">/{result.maxGunaScore}</span>
                    </span>
                    <span className="text-xs uppercase tracking-[0.12em] text-primary/80">gunas</span>
                  </div>
                  <p className="text-lg" data-testid="text-compatibility-label">{result.compatibility}</p>
                  <p className="mt-2 text-sm text-ink/80">{result.recommendation}</p>
                </div>
              </CardContent>
            </Card>

            {/* The eight kootas exactly as calculated */}
            <Card className="yantra-card">
              <CardHeader>
                <CardTitle className="font-display text-foreground">Koota breakdown</CardTitle>
                <CardDescription>The eight factors of Ashtakoota matching, from both Moons' signs and nakshatras.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-kootas">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Koota</th>
                        <th className="py-2 pr-3 font-medium">What it reflects</th>
                        <th className="py-2 text-right font-medium">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.details as Array<{ koot: string; score: number; maxScore: number; description: string }>).map((k) => (
                        <tr key={k.koot} className="border-b border-border/40">
                          <td className="py-2 pr-3 font-medium text-foreground">{k.koot}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{k.description}</td>
                          <td className="py-2 text-right tabular-nums text-foreground">{k.score} / {k.maxScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {result.dosha?.hasDosha && (
              <Card className="yantra-card" data-testid="card-matching-dosha">
                <CardHeader>
                  <CardTitle className="font-display text-foreground">{result.dosha.type}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{result.dosha.description}</p>
                </CardContent>
              </Card>
            )}

            {(result.doshas as Array<{ type: string; cancelled: boolean; cancellation: string | null }> | undefined)?.filter((d) => d.cancelled).map((d) => (
              <p key={d.type} className="text-sm text-muted-foreground" data-testid="text-dosha-cancelled">
                {d.type} is cancelled: {d.cancellation}. The {d.type.replace(' Dosha', '')} koota still scores 0.
              </p>
            ))}

            {result.roles?.note && (
              <p className="text-xs text-amber-text" data-testid="text-match-roles">{result.roles.note}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Guna Milan is one traditional input to a match, not a verdict on a relationship. It compares only the two Moons;
              a full matching also weighs each chart as a whole.
            </p>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1 rounded-[9px]"
                onClick={() => {
                  setResult(null);
                  form.reset({
                    person1Name: '',
                    person1Date: '',
                    person1Time: '',
                    person1Place: '',
                    person1Gender: 'male',
                    person2Name: '',
                    person2Date: '',
                    person2Time: '',
                    person2Place: '',
                    person2Gender: 'female',
                  });
                }}
                data-testid="button-new-calculation"
              >
                New Calculation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
