import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BrainCircuit, Target, Activity, CheckCircle2, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Loader2 } from 'lucide-react';

export default function PatternMatcher() {
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ['/api/patterns'],
  });

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="border-b border-foreground/5 px-4 pt-12 pb-8 bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto">
          <Link href="/">
            <button className="mb-4 p-2 rounded-lg hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          </Link>
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <BrainCircuit className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h1 className="font-serif text-3xl font-bold">
                Pattern Matcher
              </h1>
              <p className="text-white/80 text-base">
                Bayesian Feedback Loop • Live Algorithmic Accuracy
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-20 space-y-4">
             <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
             <p className="text-muted-foreground">Aggregating global prediction data...</p>
          </div>
        ) : !stats || stats.total === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Verified Events Yet</h3>
              <p>The prediction feedback table requires user validations to calculate Bayesian accuracy models. Encourage users to verify timeline predictions on their Kundli dashboards.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Top Level KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-blue-100">
                 <CardContent className="p-6 flex items-center justify-between">
                   <div>
                     <p className="text-sm font-semibold text-blue-800 uppercase tracking-wider mb-1">Global Accuracy</p>
                     <h2 className="text-5xl font-bold text-blue-900">{stats.accuracy}%</h2>
                   </div>
                   <Target className="w-16 h-16 text-blue-500/20" />
                 </CardContent>
               </Card>
               
               <Card className="bg-gradient-to-br from-emerald-50 to-green-50 border-green-100">
                 <CardContent className="p-6 flex items-center justify-between">
                   <div>
                     <p className="text-sm font-semibold text-green-800 uppercase tracking-wider mb-1">Total Validated Events</p>
                     <h2 className="text-5xl font-bold text-green-900">{stats.total}</h2>
                   </div>
                   <Activity className="w-16 h-16 text-green-500/20" />
                 </CardContent>
               </Card>
            </div>

            {/* Dasha System Comparison */}
            <div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-foreground/70" /> Algorithmic Performance
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['Vimshottari', 'Yogini', 'Chara'].map(system => {
                  const sysData = stats.dashaStats[system] || { total: 0, accurate: 0, percentage: 0 };
                  const isTop = Object.values(stats.dashaStats).every((s: any) => sysData.percentage >= (s.percentage || 0));
                  
                  return (
                    <Card key={system} className={`relative overflow-hidden ${isTop && sysData.total > 0 ? 'border-amber-400 ring-1 ring-amber-400' : ''}`}>
                      {isTop && sysData.total > 0 && (
                        <div className="absolute top-0 right-0 bg-amber-400 text-amber-950 text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                          MOST ACCURATE
                        </div>
                      )}
                      <CardHeader className="pb-2">
                         <CardTitle className="text-lg">{system} Dasha</CardTitle>
                         <CardDescription>Event hit rate confidence</CardDescription>
                      </CardHeader>
                      <CardContent>
                         <div className="flex items-end gap-2 mb-4">
                           <span className="text-4xl font-bold">{sysData.percentage}%</span>
                           <span className="text-sm text-muted-foreground pb-1">Hit rate</span>
                         </div>
                         
                         <div className="space-y-1 text-sm text-muted-foreground">
                           <div className="flex justify-between items-center">
                             <span>Validated Events</span>
                             <span className="font-medium text-foreground">{sysData.total}</span>
                           </div>
                           <div className="flex justify-between items-center">
                             <span>Successful Hits</span>
                             <span className="font-medium text-green-600 flex items-center gap-1">
                               {sysData.accurate} <CheckCircle2 className="w-3 h-3" />
                             </span>
                           </div>
                         </div>
                         
                         {/* Progress bar */}
                         <div className="w-full h-2 bg-muted rounded-full mt-4 overflow-hidden">
                           <div 
                             className={`h-full rounded-full transition-all duration-1000 ${
                               sysData.percentage > 85 ? 'bg-green-500' : 
                               sysData.percentage > 70 ? 'bg-amber-500' : 'bg-red-500'
                             }`}
                             style={{ width: `${sysData.percentage}%` }}
                           />
                         </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div className="bg-muted/50 border rounded-lg p-6">
              <h4 className="font-semibold mb-2">How the Feedback Loop Works</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The Navagraha AI Council uses three parallel algorithms (Vimshottari, Yogini, Chara) to predict major life events. Users are prompted to verify these events anonymously 30 days after the predicted window ends. This data is fed back into the Pattern Matcher to dynamically adjust the internal confidence weights—allowing the system to actively learn which planetary algorithms are empirically most accurate for the modern era.
              </p>
            </div>
            
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
