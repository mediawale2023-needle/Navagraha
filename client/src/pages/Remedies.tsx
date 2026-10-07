import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Sparkles, Filter, Calendar } from 'lucide-react';
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

/** Practices offered when no chart exists — explicitly NOT chart-specific and never tied to a dosha. */
const GENERAL_PRACTICES: Remedy[] = [
  { id: 'g1', title: 'Daily meditation', description: 'A general wellbeing practice, not based on your chart.', priority: 'medium', timeRequired: '10 minutes', bestTime: 'Morning', category: 'lifestyle' },
  { id: 'g2', title: 'Surya Namaskar', description: 'A general practice for energy and routine, not based on your chart.', priority: 'medium', timeRequired: '10 minutes', bestTime: 'Sunrise', category: 'lifestyle' },
];

interface FunctionalRemedy { focus: string; action: string; gemstone?: string; mantra: string; japaCount: number; donation?: string; day: string; deity: string; reason: string }

/** Turn the chart's own functional remedies into trackable practices. Gemstones always require consultation. */
function remediesFromChart(list: FunctionalRemedy[]): Remedy[] {
  return list.flatMap((r, i) => {
    const out: Remedy[] = [{
      id: `m${i}`, title: `${r.action} ${r.focus}: ${r.deity} mantra`,
      description: `${r.reason} Chant "${r.mantra}" (${r.japaCount.toLocaleString()}×).`,
      priority: 'medium', timeRequired: '15 minutes', bestDay: r.day, bestTime: r.day, category: 'mantra',
    }];
    if (r.donation) out.push({ id: `d${i}`, title: `Donate ${r.donation}`, description: `Optional charity linked to ${r.focus}. ${r.reason}`, priority: 'medium', timeRequired: '5 minutes', bestDay: r.day, bestTime: r.day, category: 'donation' });
    if (r.gemstone) out.push({ id: `g${i}`, title: `${r.gemstone} (consult first)`, description: `Traditionally linked to ${r.focus}. Consult a qualified astrologer before wearing any gemstone; never buy one out of fear.`, priority: 'consult', timeRequired: 'N/A', category: 'gemstone' });
    return out;
  });
}

export default function Remedies() {
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const { data: kundlis } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ['/api/kundli'] });
  const latest = kundlis?.[0];
  const { data: chart } = useQuery<{ chartData?: { functionalRemedies?: FunctionalRemedy[] } }>({ queryKey: ['/api/kundli', latest?.id], enabled: !!latest });
  const fromChart = chart?.chartData?.functionalRemedies;
  const [remedies, setRemedies] = useState<Remedy[]>(GENERAL_PRACTICES);
  useEffect(() => {
    if (fromChart?.length) setRemedies(remediesFromChart(fromChart));
  }, [fromChart]);

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
    <div className="yantra-shell min-h-screen pb-20">
      <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-primary/20">
                <Sparkles className="w-4 h-4 text-[var(--primary-border)]" />
              </div>
              <div>
                <h1 className="font-display text-foreground">{fromChart?.length ? `Remedies from ${latest?.name}'s chart` : 'General practices'}</h1>
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
        <Card className="card-clean mb-6 border-primary/30 bg-primary/10">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-foreground">Monthly Progress</h3>
              <Badge className="bg-nava-navy text-primary">
                {totalCount ? Math.round((completedCount / totalCount) * 100) : 0}% Complete
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-2">
              <div
                className="h-2 rounded-full bg-[var(--primary-border)] transition-all duration-300"
                style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {fromChart?.length
                ? 'Optional practices derived from your chart’s functional planets. Remedies support effort; they are never a condition for a good outcome.'
                : <>These are general practices, not based on any chart. <Link href="/kundli/new" className="font-semibold text-foreground underline">Create your Kundli</Link> for chart-specific suggestions.</>}
            </p>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-[9px]">
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
              <Button variant="outline" size="sm" className="gap-2 rounded-[9px]">
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
          <TabsList className="grid w-full grid-cols-3 bg-muted p-1">
            <TabsTrigger value="all" className="rounded-[6px] data-[state=active]:bg-nava-navy data-[state=active]:text-primary">
              All
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-[6px] data-[state=active]:bg-nava-navy data-[state=active]:text-primary">
              Pending
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-[6px] data-[state=active]:bg-nava-navy data-[state=active]:text-primary">
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
        <Card className="card-clean border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-primary/20">
                <Sparkles className="w-4 h-4 text-[var(--primary-border)]" />
              </div>
              <div>
                <h4 className="font-display text-sm text-foreground">About Remedies</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vedic remedies (upayas) help reduce malefic planetary effects and enhance benefic influences.
                  Consistency matters more than complexity — start with one simple remedy daily.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
