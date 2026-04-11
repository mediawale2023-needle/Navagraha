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
import { ArrowLeft, Calendar, Clock, User, Loader2, Sparkles, Check, Sunrise, Info } from 'lucide-react';
import { Link } from 'wouter';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';
import { BottomNav } from '@/components/BottomNav';
import { TrustBadge } from '@/components/TrustBadge';

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
  const [step, setStep] = useState(1);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [useSunrise, setUseSunrise] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<KundliFormData>({
    resolver: zodResolver(kundliFormSchema),
    defaultValues: {
      name: '',
      dateOfBirth: '',
      timeOfBirth: '',
      placeOfBirth: '',
      gender: 'male',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: KundliFormData) => {
      const payload = {
        ...data,
        latitude: coordinates?.lat,
        longitude: coordinates?.lng,
      };
      return await apiRequest('POST', '/api/kundli', payload);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/kundli'] });
      toast({
        title: 'Kundli Generated!',
        description: 'Your birth chart has been created successfully.',
      });
      if (data.id) {
        setLocation(`/kundli/${data.id}`);
      } else {
        sessionStorage.setItem('guestKundli', JSON.stringify(data));
        setLocation('/kundli/preview');
      }
    },
    onError: (error: Error) => {
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

  const nextStep = () => {
    const fieldsToValidate: (keyof KundliFormData)[] =
      step === 1 ? ['name', 'gender'] :
        step === 2 ? ['dateOfBirth', 'timeOfBirth'] :
          ['placeOfBirth'];

    form.trigger(fieldsToValidate).then((isValid) => {
      if (isValid) {
        setStep(step + 1);
      }
    });
  };

  const handleSunriseClick = () => {
    setUseSunrise(true);
    form.setValue('timeOfBirth', '06:00');
    toast({
      title: 'Sunrise Time Applied',
      description: 'Using 6:00 AM as approximate birth time',
    });
  };

  const stepLabels = ['Personal', 'Date & Time', 'Location'];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="border-b border-border px-4 py-4 bg-card">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            </Link>
            <h1 className="font-semibold text-lg text-foreground">Generate Kundli</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-nava-lavender rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-nava-royal-purple" />
            </div>
            <span className="font-semibold text-lg text-foreground">Navagraha</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6">
        {/* Step Progress Indicator */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  s === step
                    ? 'bg-nava-royal-purple text-white ring-2 ring-nava-royal-purple ring-offset-2'
                    : s < step
                      ? 'bg-green-600 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                <span className={`text-xs mt-1.5 font-medium ${
                  s === step ? 'text-nava-royal-purple' : s < step ? 'text-green-600' : 'text-muted-foreground'
                }`}>
                  {stepLabels[s - 1]}
                </span>
              </div>
              {s < 3 && (
                <div className={`w-12 h-1 mx-3 rounded-full mb-5 ${
                  s < step ? 'bg-green-600' : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-xl text-foreground">
                {step === 1 ? 'Personal Details' : step === 2 ? 'Birth Date & Time' : 'Birth Place'}
              </h2>
              <TrustBadge variant="calculated" />
            </div>
            <p className="text-sm text-muted-foreground">
              {step === 1
                ? 'Enter your name and gender to get started'
                : step === 2
                  ? 'Provide your exact birth date and time'
                  : 'Enter your place of birth for accurate calculations'}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Step 1: Personal Details */}
              {step === 1 && (
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                            <Input
                              placeholder="Enter your full name"
                              className="pl-10 bg-input-background"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-input-background">
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

                  <Button
                    type="button"
                    onClick={nextStep}
                    className="w-full bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white"
                  >
                    Continue →
                  </Button>
                </div>
              )}

              {/* Step 2: Birth Date & Time */}
              {step === 2 && (
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                            <Input
                              type="date"
                              className="pl-10 bg-input-background"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timeOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time of Birth</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Clock className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                            <Input
                              type="time"
                              className="pl-10 bg-input-background"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                        {!useSunrise && (
                          <button
                            type="button"
                            onClick={handleSunriseClick}
                            className="mt-2 inline-flex items-center gap-2 text-sm text-nava-royal-purple hover:underline"
                          >
                            <Sunrise className="w-4 h-4" />
                            Don't know exact time? Use sunrise (6:00 AM)
                          </button>
                        )}
                      </FormItem>
                    )}
                  />

                  <div className="bg-nava-lavender/50 border border-nava-royal-purple/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-nava-royal-purple flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-nava-royal-purple font-medium">
                          Why birth time matters
                        </p>
                        <p className="text-xs text-nava-royal-purple/80 mt-1">
                          Exact birth time affects Moon sign and house positions.
                          Even 4 minutes can change your Ascendant.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="flex-1"
                    >
                      ← Back
                    </Button>
                    <Button
                      type="button"
                      onClick={nextStep}
                      className="flex-1 bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white"
                    >
                      Continue →
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Birth Place */}
              {step === 3 && (
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="placeOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Place of Birth</FormLabel>
                        <FormControl>
                          <PlacesAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            onPlaceSelect={(place) => {
                              setCoordinates({ lat: place.lat, lng: place.lng });
                            }}
                            placeholder="City, State, Country"
                            className="bg-input-background"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-amber-800 font-medium">
                          Accuracy Note
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Accurate birth details are essential for precise astrological calculations.
                          Please verify all information before generating your chart.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep(2)}
                      className="flex-1"
                    >
                      ← Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-nava-royal-purple hover:bg-nava-royal-purple/90 text-white"
                      disabled={mutation.isPending}
                    >
                      {mutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Kundli
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </Form>
        </div>

        {/* Trust Indicators */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Check className="w-3.5 h-3.5 text-green-600" />
            Calculated using Swiss Ephemeris
            <span className="mx-1">•</span>
            <Check className="w-3.5 h-3.5 text-green-600" />
            Lahiri Ayanamsa
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
