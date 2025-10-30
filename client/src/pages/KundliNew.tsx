import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Calendar, Clock, User, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/kundli'] });
      toast({
        title: 'Kundli Generated!',
        description: 'Your birth chart has been created successfully.',
      });
      setLocation(`/kundli/${data.id}`);
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

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-3xl">Generate Your Kundli</CardTitle>
            <CardDescription>
              Enter your birth details to create a detailed Vedic birth chart
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Progress Indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                    s === step 
                      ? 'bg-primary text-primary-foreground' 
                      : s < step 
                      ? 'bg-primary/20 text-primary' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {s}
                  </div>
                  {s < 3 && <div className={`w-12 h-1 mx-2 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
                </div>
              ))}
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
                                className="pl-10" 
                                {...field} 
                                data-testid="input-name"
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
                              <SelectTrigger data-testid="select-gender">
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

                    <Button type="button" onClick={nextStep} className="w-full" data-testid="button-next-step-1">
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
                                className="pl-10" 
                                {...field} 
                                data-testid="input-date"
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
                                className="pl-10" 
                                {...field} 
                                data-testid="input-time"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setStep(1)} 
                        className="flex-1"
                        data-testid="button-back-step-2"
                      >
                        ← Back
                      </Button>
                      <Button 
                        type="button" 
                        onClick={nextStep} 
                        className="flex-1"
                        data-testid="button-next-step-2"
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
                              testId="input-place"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">
                        <strong>Note:</strong> Accurate birth details are essential for precise astrological calculations. 
                        Please ensure all information is correct.
                      </p>
                    </div>

                    <div className="flex gap-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setStep(2)} 
                        className="flex-1"
                        data-testid="button-back-step-3"
                      >
                        ← Back
                      </Button>
                      <Button 
                        type="submit" 
                        className="flex-1"
                        disabled={mutation.isPending}
                        data-testid="button-generate-kundli"
                      >
                        {mutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          'Generate Kundli'
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
