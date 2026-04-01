import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, BrainCircuit, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface VerifyEventDialogProps {
  kundliId: string;
  dashaPlanet: string;
  antardashaPlanet: string;
  period: string;
}

export function VerifyEventDialog({ kundliId, dashaPlanet, antardashaPlanet, period }: VerifyEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [accurate, setAccurate] = useState<boolean | null>(null);
  const [category, setCategory] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/feedback', {
        kundliId,
        predictionCategory: category,
        wasAccurate: accurate,
        dashaSystemUsed: 'Vimshottari', // We only have Vimshottari exposed in the current UI
        notes: `Verified period: ${period} (${dashaPlanet}/${antardashaPlanet})`,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Feedback Recorded',
        description: 'Thank you! Your verification helps the Super-Astrologer council learn and improve its accuracy models.',
      });
      setOpen(false);
      // Can invalidate queries here if we start showing verified badges on the timeline
      queryClient.invalidateQueries({ queryKey: ['/api/patterns'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to submit feedback',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (accurate === null || !category) {
      toast({
        title: 'Incomplete',
        description: 'Please select an event category and verify if it was accurate.',
        variant: 'destructive',
      });
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors flex items-center gap-1">
          <BrainCircuit className="w-3 h-3" /> Verify Event
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-blue-600" />
            Verify Dasha Event
          </DialogTitle>
          <DialogDescription>
            Help train the Bayesian feedback loop. Did a significant life event happen during the <strong className="text-foreground">{dashaPlanet}/{antardashaPlanet}</strong> period ({period})?
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Event Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select primary theme of this period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="career">Career / Job Change</SelectItem>
                <SelectItem value="finance">Wealth / Major Purchase</SelectItem>
                <SelectItem value="marriage">Marriage / Relationship</SelectItem>
                <SelectItem value="health">Health / Illness</SelectItem>
                <SelectItem value="travel">Foreign Travel / Relocation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Was the astrological prediction for this period accurate?</label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className={`flex-1 flex gap-2 ${accurate === true ? 'bg-green-50 border-green-500 text-green-700' : ''}`}
                onClick={() => setAccurate(true)}
              >
                <CheckCircle2 className="w-4 h-4" /> Yes, Highly Accurate
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`flex-1 flex gap-2 ${accurate === false ? 'bg-red-50 border-red-500 text-red-700' : ''}`}
                onClick={() => setAccurate(false)}
              >
                <XCircle className="w-4 h-4" /> No, Inaccurate
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={mutation.isPending || accurate === null || !category}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit to Pattern Matcher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
