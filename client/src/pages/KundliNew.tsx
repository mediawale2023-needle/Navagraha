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
import { ArrowLeft, Calendar, Clock, User, Loader2, Sparkles, Check } from 'lucide-react';
import { Link } from 'wouter';
import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';
import { BottomNav } from '@/components/BottomNav';

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

  const stepLabels = ['Personal', 'Date & Time', 'Location'];

  return (
    <div className="min-h-screen bg-[#FFF8F0] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="p-2 rounded-lg hover:bg-white/10 transition-colors" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            </Link>
            <h1 className="font-bold text-lg text-white">Generate Kundli</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-white font-serif">Navagraha</span>
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
                    ? 'bg-orange-600 text-white'
                    : s < step
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                <span className={`text-xs mt-1.5 font-medium ${
                  s === step ? 'text-orange-600' : s < step ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {stepLabels[s - 1]}
                </span>
              </div>
              {s < 3 && (
                <div className={`w-16 h-1 mx-3 rounded-full mb-5 ${s < step ? 'bg-orange-200' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
          <div className="mb-6">
            <h2 className="font-serif text-xl font-semibold text-gray-900">
              {step === 1 ? 'Personal Details' : step === 2 ? 'Birth Date & Time' : 'Birth Place'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
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

                  <Button
                    type="button"
                    onClick={nextStep}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                    data-testid="button-next-step-1"
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
                      className="flex-1 border-orange-200 text-orange-600 hover:bg-orange-50"
                      data-testid="button-back-step-2"
                    >
                      ← Back
                    </Button>
                    <Button
                      type="button"
                      onClick={nextStep}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
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

                  <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                    <p className="text-sm text-orange-800">
                      <strong>Note:</strong> Accurate birth details are essential for precise astrological calculations.
                      Please ensure all information is correct.
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep(2)}
                      className="flex-1 border-orange-200 text-orange-600 hover:bg-orange-50"
                      data-testid="button-back-step-3"
                    >
                      ← Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
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
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
