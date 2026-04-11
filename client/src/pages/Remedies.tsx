import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Filter, CheckCircle, Bell, BellOff, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PriorityRemedyCard } from '@/components/PriorityRemedyCard';
import { BottomNav } from '@/components/BottomNav';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface Remedy {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'consult';
  timeRequired: string;
  bestTime?: string;
  bestDay?: string;
  itemsNeeded?: string[];
  category: 'mantra' | 'puja' | 'gemstone' | 'lifestyle' | 'donation';
  isCompleted?: boolean;
  hasReminder?: boolean;
}

const SAMPLE_REMEDIES: Remedy[] = [
  {
    id: '1',
    title: 'Mangal Dosha Shanti Puja',
    description: 'Perform this puja to reduce the malefic effects of Mars in your chart. Best performed on Tuesdays.',
    priority: 'high',
    timeRequired: '15 minutes',
    bestTime: 'Early morning (6-8 AM)',
    bestDay: 'Tuesday',
    itemsNeeded: ['Red flowers', 'Jaggery (gur)', 'Red cloth', 'Sindoor'],
    category: 'puja',
  },
  {
    id: '2',
    title: 'Hanuman Chalisa Recitation',
    description: 'Recite Hanuman Chalisa for strength, courage, and Mars-related remedies.',
    priority: 'medium',
    timeRequired: '8 minutes',
    bestTime: 'Morning or evening',
    bestDay: 'Tuesday or Saturday',
    category: 'mantra',
  },
  {
    id: '3',
    title: 'Wear Red Coral Gemstone',
    description: 'Red Coral (Moonga) strengthens Mars. Consult an astrologer before wearing.',
    priority: 'consult',
    timeRequired: 'N/A',
    bestTime: 'Tuesday morning during Shukla Paksha',
    itemsNeeded: ['Red Coral (5-7 carats)', 'Copper or gold setting'],
    category: 'gemstone',
  },
  {
    id: '4',
    title: 'Donate Red Lentils (Masoor Dal)',
    description: 'Donating red lentils on Tuesdays helps reduce Mars afflictions.',
    priority: 'medium',
    timeRequired: '5 minutes',
    bestTime: 'Morning',
    bestDay: 'Tuesday',
    itemsNeeded: ['Red lentils (masoor dal)', 'Red cloth for wrapping'],
    category: 'donation',
  },
  {
    id: '5',
    title: 'Avoid Alcohol and Non-Veg on Tuesday',
    description: 'Lifestyle remedy to reduce Mars negativity. Observe this weekly.',
    priority: 'medium',
    timeRequired: 'All day',
    bestDay: 'Every Tuesday',
    category: 'lifestyle',
  },
  {
    id: '6',
    title: 'Surya Namaskar Daily',
    description: 'Daily sun salutations strengthen the Sun and improve overall vitality.',
    priority: 'medium',
    timeRequired: '10 minutes',
    bestTime: 'Sunrise',
    category: 'lifestyle',
  },
];

export default function Remedies() {
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [remedies, setRemedies] = useState<Remedy[]>(SAMPLE_REMEDIES);

  const filteredRemedies = remedies.filter((remedy) => {
    if (filterPriority !== 'all' && remedy.priority !== filterPriority) return false;
    if (filterCategory !== 'all' && remedy.category !== filterCategory) return false;
    return true;
  });

  const handleToggleReminder = (id: string) => {
    setRemedies((prev) =>
      prev.map((r) => (r.id === id ? { ...r, hasReminder: !r.hasReminder } : r))
    );
  };

  const handleComplete = (id: string) => {
    setRemedies((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isCompleted: !r.isCompleted } : r))
    );
  };

  const completedCount = remedies.filter((r) => r.isCompleted).length;
  const totalCount = remedies.length;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-nava-lavender flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-nava-royal-purple" />
              </div>
              <div>
                <h1 className="font-semibold text-foreground">Recommended Remedies</h1>
                <p className="text-xs text-muted-foreground">
                  {completedCount} of {totalCount} completed this month
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Progress Card */}
        <Card className="card-clean mb-6 bg-gradient-to-r from-nava-lavender/50 to-nava-lavender/30 border-nava-royal-purple/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">Monthly Progress</h3>
              <Badge className="bg-nava-royal-purple">
                {Math.round((completedCount / totalCount) * 100)}% Complete
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-2">
              <div
                className="bg-nava-royal-purple h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Completing remedies reduces dosha effects and improves planetary strength
            </p>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                {filterPriority === 'all' ? 'All Priorities' : filterPriority.charAt(0).toUpperCase() + filterPriority.slice(1)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterPriority('all')}>All Priorities</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterPriority('high')}>High Priority</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterPriority('medium')}>Medium Priority</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterPriority('consult')}>Consult First</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Calendar className="w-4 h-4" />
                {filterCategory === 'all' ? 'All Types' : filterCategory}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterCategory('all')}>All Types</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterCategory('puja')}>Puja</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterCategory('mantra')}>Mantra</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterCategory('gemstone')}>Gemstone</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterCategory('donation')}>Donation</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterCategory('lifestyle')}>Lifestyle</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Remedies List */}
        <Tabs defaultValue="all" className="mb-6">
          <TabsList className="grid w-full grid-cols-3 bg-muted">
            <TabsTrigger value="all" className="data-[state=active]:bg-nava-royal-purple data-[state=active]:text-white">
              All
            </TabsTrigger>
            <TabsTrigger value="pending" className="data-[state=active]:bg-nava-royal-purple data-[state=active]:text-white">
              Pending
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-nava-royal-purple data-[state=active]:text-white">
              Completed
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4 space-y-3">
            {filteredRemedies.map((remedy) => (
              <PriorityRemedyCard
                key={remedy.id}
                title={remedy.title}
                description={remedy.description}
                priority={remedy.priority}
                timeRequired={remedy.timeRequired}
                bestTime={remedy.bestTime}
                itemsNeeded={remedy.itemsNeeded}
                isCompleted={remedy.isCompleted}
                hasReminder={remedy.hasReminder}
                onToggleReminder={() => handleToggleReminder(remedy.id)}
                onComplete={() => handleComplete(remedy.id)}
                onViewDetails={() => console.log('View details:', remedy.id)}
              />
            ))}
          </TabsContent>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {filteredRemedies
              .filter((r) => !r.isCompleted)
              .map((remedy) => (
                <PriorityRemedyCard
                  key={remedy.id}
                  title={remedy.title}
                  description={remedy.description}
                  priority={remedy.priority}
                  timeRequired={remedy.timeRequired}
                  bestTime={remedy.bestTime}
                  itemsNeeded={remedy.itemsNeeded}
                  isCompleted={remedy.isCompleted}
                  hasReminder={remedy.hasReminder}
                  onToggleReminder={() => handleToggleReminder(remedy.id)}
                  onComplete={() => handleComplete(remedy.id)}
                  onViewDetails={() => console.log('View details:', remedy.id)}
                />
              ))}
          </TabsContent>

          <TabsContent value="completed" className="mt-4 space-y-3">
            {filteredRemedies
              .filter((r) => r.isCompleted)
              .map((remedy) => (
                <PriorityRemedyCard
                  key={remedy.id}
                  title={remedy.title}
                  description={remedy.description}
                  priority={remedy.priority}
                  timeRequired={remedy.timeRequired}
                  bestTime={remedy.bestTime}
                  itemsNeeded={remedy.itemsNeeded}
                  isCompleted={remedy.isCompleted}
                  hasReminder={remedy.hasReminder}
                  onToggleReminder={() => handleToggleReminder(remedy.id)}
                  onComplete={() => handleComplete(remedy.id)}
                  onViewDetails={() => console.log('View details:', remedy.id)}
                />
              ))}
          </TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card className="card-clean bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h4 className="font-semibold text-amber-800 text-sm">About Remedies</h4>
                <p className="text-xs text-amber-700 mt-1">
                  Vedic remedies (upayas) help reduce malefic planetary effects and enhance benefic influences.
                  Consistency matters more than complexity — start with one simple remedy daily.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}
