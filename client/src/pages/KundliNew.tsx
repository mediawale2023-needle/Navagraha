import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { isApiError } from '@/lib/apiError';
import { prefillFromSearch } from '@/lib/recreateChart';
import { Loader2 } from 'lucide-react';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';
import { PageHeader } from '@/components/shell/PageHeader';

const kundliFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  timeOfBirth: z.string().min(1, 'Time of birth is required'),
  placeOfBirth: z.string().min(2, 'Place of birth is required'),
  gender: z.enum(['male', 'female', 'other']),
});

type KundliFormData = z.infer<typeof kundliFormSchema>;

export default function KundliNew() {
  const [, setLocation] = useLocation();
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isBirthTimeApproximate, setIsBirthTimeApproximate] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<KundliFormData>({
    resolver: zodResolver(kundliFormSchema),
    defaultValues: {
      name: '',
      dateOfBirth: '',
      timeOfBirth: '',
      gender: 'male',
      ...prefillFromSearch(typeof window === 'undefined' ? '' : window.location.search),
      placeOfBirth: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: KundliFormData) => {
      const payload = {
        ...data,
        isBirthTimeApproximate,
        latitude: coordinates?.lat,
        longitude: coordinates?.lng,
      };
      return await apiRequest('POST', '/api/kundli', payload);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/kundli'] });
      if (data.id) {
        setLocation(`/kundli/${data.id}`);
      } else {
        sessionStorage.setItem('guestKundli', JSON.stringify(data));
        setLocation('/kundli/preview');
      }
    },
    onError: (error: Error) => {
      if (isApiError(error) && error.field === 'placeOfBirth') {
        form.setError('placeOfBirth', { message: error.message });
        return;
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate kundli. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: KundliFormData) => {
    mutation.mutate(data);
  };

  const handleUnknownTimeClick = () => {
    setIsBirthTimeApproximate(true);
    form.setValue('timeOfBirth', '06:00', { shouldValidate: true });
  };

  const label = 'text-sm font-semibold text-ink';
  return (
    <div>
      <PageHeader title="New Kundli" gloss="कुण्डली" sub="Swiss Ephemeris · Lahiri ayanamsa · whole-sign houses" back={{ href: "/kundli", label: "Kundli" }} width="max-w-3xl" />

      <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-10 md:py-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 md:p-[22px]" data-testid="form-kundli">
            <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={label}>Name</FormLabel>
                    <FormControl><Input placeholder="Enter your full name" autoComplete="name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={label}>Gender</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
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
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={label}>Date of birth</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="timeOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={label}>Time of birth</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
                        onChange={(event) => {
                          field.onChange(event);
                          setIsBirthTimeApproximate(false);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                    {isBirthTimeApproximate ? (
                      <p className="text-sm text-amber-text" data-testid="approximate-time-note">
                        Birth time is approximate: 6:00 AM is a placeholder, not calculated sunrise.
                        The Lagna, houses and exact dasha dates will be withheld. Enter a known time to clear this.
                      </p>
                    ) : (
                      <button type="button" onClick={handleUnknownTimeClick} className="self-start text-sm underline hover:text-amber-text">
                        I don’t know the exact birth time
                      </button>
                    )}
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="placeOfBirth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={label}>Place of birth</FormLabel>
                  <FormControl>
                    <PlacesAutocomplete
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        setCoordinates(null);
                      }}
                      onPlaceSelect={(place) => {
                        setCoordinates({ lat: place.lat, lng: place.lng });
                      }}
                      placeholder="City, State, Country"
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-caption text-ink-muted">Pick the town from the list: its coordinates and historical time zone fix the chart.</p>
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-3 border-t border-hairline pt-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-ink-muted">Four minutes of birth time can move the Lagna; enter it as exactly as you know it.</p>
              <Button type="submit" disabled={mutation.isPending} className="shrink-0" data-testid="button-generate-kundli">
                {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calculating…</> : 'Generate Kundli'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
