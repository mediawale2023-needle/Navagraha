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
import { Loader2 } from 'lucide-react';
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
    <div>
      <PageHeader title="Kundli Milan" gloss="कुण्डली मिलान" sub="Ashtakoota matching of two birth charts" back={{ href: "/", label: "Today" }} width="max-w-5xl" />

      <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-10 md:py-8">
        {!result ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Person 1 */}
                <Card>
                  <CardHeader className="border-b border-hairline">
                    <CardTitle className="font-display text-card-title font-semibold">First person</CardTitle>
                    <CardDescription>Birth details as exactly as known</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="person1Name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Full name" {...field} data-testid="input-person1-name" />
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
                              <SelectTrigger data-testid="select-person1-gender">
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
                            <Input type="date" {...field} data-testid="input-person1-date" />
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
                            <Input type="time" {...field} data-testid="input-person1-time" />
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
                <Card>
                  <CardHeader className="border-b border-hairline">
                    <CardTitle className="font-display text-card-title font-semibold">Second person</CardTitle>
                    <CardDescription>Birth details as exactly as known</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="person2Name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Full name" {...field} data-testid="input-person2-name" />
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
                              <SelectTrigger data-testid="select-person2-gender">
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
                            <Input type="date" {...field} data-testid="input-person2-date" />
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
                            <Input type="time" {...field} data-testid="input-person2-time" />
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
                className="w-full md:w-auto md:self-end"
                disabled={mutation.isPending}
                data-testid="button-calculate-compatibility"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Calculating…
                  </>
                ) : (
                  <>
                    Calculate Guna Milan
                  </>
                )}
              </Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-6">
            {/* Overall score: the Ashtakoota guna total, out of 36 */}
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:flex-row md:items-center md:gap-8 md:p-[22px]">
              <p className="m-0 flex items-baseline gap-1 font-display font-semibold tabular-nums">
                <span className="text-hero" data-testid="text-compatibility-score">{result.gunaScore}<span className="text-heading text-ink-muted">/{result.maxGunaScore}</span></span>
                <span className="text-base font-normal text-ink-muted">gunas</span>
              </p>
              <div className="flex flex-col gap-1">
                <h2 className="m-0 font-display text-card-title font-semibold md:text-heading">Ashtakoota Guna Milan <span lang="hi" className="text-base font-normal text-ink-muted">अष्टकूट</span></h2>
                <p className="text-sm text-ink-muted" data-testid="text-person-names">{result.person1} & {result.person2}</p>
                <p className="text-lead font-semibold" data-testid="text-compatibility-label">{result.compatibility}</p>
                <p className="max-w-[65ch] text-base">{result.recommendation}</p>
              </div>
            </section>

            {/* The eight kootas exactly as calculated */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-card-title font-semibold">Koota breakdown</CardTitle>
                <CardDescription>The eight factors of Ashtakoota matching, from both Moons' signs and nakshatras.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-kootas">
                    <thead>
                      <tr className="border-b border-line text-left text-ink-muted">
                        <th className="py-2 pr-3 font-medium">Koota</th>
                        <th className="py-2 pr-3 font-medium">What it reflects</th>
                        <th className="py-2 text-right font-medium">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.details as Array<{ koot: string; score: number; maxScore: number; description: string }>).map((k) => (
                        <tr key={k.koot} className="border-b border-hairline last:border-0">
                          <td className="py-2 pr-3 font-semibold">{k.koot}</td>
                          <td className="py-2 pr-3 text-ink-muted">{k.description}</td>
                          <td className="py-2 text-right tabular-nums text-foreground">{k.score} / {k.maxScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {result.dosha?.hasDosha && (
              <Card data-testid="card-matching-dosha">
                <CardHeader>
                  <CardTitle className="font-display text-card-title font-semibold">{result.dosha.type}</CardTitle>
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
                className="flex-1 md:flex-none"
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
