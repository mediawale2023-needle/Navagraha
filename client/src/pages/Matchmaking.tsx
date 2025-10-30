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
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Heart, Loader2 } from 'lucide-react';

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
      return await apiRequest('POST', '/api/matchmaking', data);
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: 'Compatibility Calculated!',
        description: 'Your kundli matching results are ready.',
      });
    },
    onError: (error: Error) => {
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
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-8">
          <Heart className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="font-serif text-4xl font-bold text-foreground mb-2">
            Kundli Milan
          </h1>
          <p className="text-muted-foreground text-lg">
            Check compatibility between two birth charts
          </p>
        </div>

        {!result ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Person 1 */}
                <Card>
                  <CardHeader>
                    <CardTitle>Person 1 Details</CardTitle>
                    <CardDescription>Enter first person's birth information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                            <Input placeholder="City, State, Country" {...field} data-testid="input-person1-place" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Person 2 */}
                <Card>
                  <CardHeader>
                    <CardTitle>Person 2 Details</CardTitle>
                    <CardDescription>Enter second person's birth information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                            <Input placeholder="City, State, Country" {...field} data-testid="input-person2-place" />
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
                className="w-full"
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
            {/* Overall Score */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-8 text-center">
                <h2 className="font-serif text-2xl font-semibold mb-2">Compatibility Score</h2>
                <p className="text-muted-foreground mb-4" data-testid="text-person-names">
                  {result.person1 || 'Person 1'} & {result.person2 || 'Person 2'}
                </p>
                <div className="text-7xl font-bold text-primary mb-2" data-testid="text-compatibility-score">
                  {result.totalScore || 78}%
                </div>
                <p className="text-lg text-muted-foreground">
                  {result.totalScore >= 70 ? 'Excellent Match!' : 
                   result.totalScore >= 50 ? 'Good Match' : 'Fair Match'}
                </p>
              </CardContent>
            </Card>

            {/* Detailed Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Compatibility Breakdown</CardTitle>
                <CardDescription>Detailed analysis across different aspects</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {[
                  { label: 'Mental Compatibility', score: result.mentalScore || 85 },
                  { label: 'Physical Compatibility', score: result.physicalScore || 72 },
                  { label: 'Emotional Compatibility', score: result.emotionalScore || 80 },
                  { label: 'Financial Compatibility', score: result.financialScore || 68 },
                ].map((item, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-2xl font-bold">{item.score}%</span>
                    </div>
                    <Progress value={item.score} className="h-3" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle>Astrological Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <h4 className="font-semibold mb-2 text-green-700 dark:text-green-400">Strengths</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Strong emotional connection</li>
                      <li>Compatible moon signs foster understanding</li>
                      <li>Mutual respect and shared values</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <h4 className="font-semibold mb-2 text-yellow-700 dark:text-yellow-400">Areas to Work On</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Communication during stressful times</li>
                      <li>Financial planning requires attention</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button 
                variant="outline" 
                className="flex-1"
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
              <Button className="flex-1" data-testid="button-download-report">
                Download Report
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
