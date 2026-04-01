import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2, Users, Zap, TrendingUp, DollarSign, Code2,
  Megaphone, Palette, HandshakeIcon, Target, Crown, ArrowRight,
  Sparkles, CheckCircle, Clock, AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Role metadata ──────────────────────────────────────────────────────────
const ROLE_META: Record<string, { icon: React.ElementType; color: string; label: string; description: string }> = {
  CEO:   { icon: Crown,         color: "text-nava-yellow",   label: "CEO",              description: "Strategy & Vision"    },
  CFO:   { icon: DollarSign,    color: "text-nava-teal",     label: "CFO",              description: "Finance & Budget"     },
  CTO:   { icon: Code2,         color: "text-nava-magenta",  label: "CTO",              description: "Technology & Product" },
  CMO:   { icon: Megaphone,     color: "text-nava-amber",    label: "CMO",              description: "Marketing & Growth"   },
  BRAND: { icon: Palette,       color: "text-nava-coral",    label: "Brand Consultant", description: "Identity & Vision"   },
  SALES: { icon: HandshakeIcon, color: "text-nava-aqua",    label: "Sales Head",       description: "Revenue & Deals"     },
};

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  thinking: "bg-nava-amber/20 text-nava-amber border-nava-amber/30",
  paused:   "bg-muted/40 text-muted-foreground border-border",
  pending:  "bg-nava-teal/10 text-nava-teal border-nava-teal/30",
  high:     "bg-nava-magenta/20 text-nava-magenta border-nava-magenta/30",
  medium:   "bg-nava-amber/20 text-nava-amber border-nava-amber/30",
  low:      "bg-nava-teal/10 text-nava-teal border-nava-teal/30",
};

// ── Components ─────────────────────────────────────────────────────────────
function EmployeeCard({ employee }: { employee: any }) {
  const meta = ROLE_META[employee.role] || ROLE_META["CEO"];
  const Icon = meta.icon;
  return (
    <Card className="glass-card flex flex-col items-center text-center gap-2 p-5 group">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-card/80 ring-2 ring-border/50 group-hover:ring-primary/40 transition-all ${meta.color}`}>
        <Icon className="w-7 h-7" />
      </div>
      <div>
        <p className="font-bold text-base text-foreground">{employee.name}</p>
        <p className={`text-xs font-semibold ${meta.color}`}>{meta.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
      </div>
      <Badge className={`text-[10px] border ${STATUS_COLORS[employee.status] || STATUS_COLORS["active"]}`}>
        {employee.status === "active" ? "● Active" : employee.status}
      </Badge>
      {employee.lastOutput && (
        <p className="text-xs text-muted-foreground line-clamp-2 text-left w-full mt-1 italic border-t border-border/30 pt-2">
          "{employee.lastOutput}"
        </p>
      )}
    </Card>
  );
}

function InitiativeCard({ initiative }: { initiative: any }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-card/40 border border-border/30 hover:border-border/60 transition-all">
      <div className={`mt-0.5 p-1.5 rounded-lg ${STATUS_COLORS[initiative.priority] || STATUS_COLORS["medium"]} shrink-0`}>
        <Target className="w-4 h-4" />
      </div>
      <div>
        <p className="font-semibold text-sm text-foreground">{initiative.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{initiative.description}</p>
        <div className="flex gap-2 mt-2">
          <Badge className={`text-[10px] border ${STATUS_COLORS[initiative.priority] || ""}`}>{initiative.priority}</Badge>
          <Badge className={`text-[10px] border ${STATUS_COLORS[initiative.status] || ""}`}>{initiative.status}</Badge>
        </div>
      </div>
    </div>
  );
}

// ── Onboarding form ────────────────────────────────────────────────────────
function BoardroomOnboarding({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("Navagraha");
  const [mission, setMission] = useState("Scale the Navagraha AI Astrology platform to ₹5 Crore ARR in 6 months by growing the user base, conversion rate, and ARPU.");
  const { toast } = useToast();
  const qc = useQueryClient();

  const initMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/initialize", { name, mission }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/company"] });
      qc.invalidateQueries({ queryKey: ["/api/corporate/employees"] });
      toast({ title: "🏢 Boardroom initialized!", description: "Your C-Suite is ready to get to work." });
      onCreated();
    },
    onError: () => toast({ variant: "destructive", title: "Failed to initialize boardroom" }),
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background celestial-bg">
      <Card className="glass-card w-full max-w-xl">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 rounded-2xl bg-nava-navy/30 border border-nava-teal/30 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-nava-teal" />
          </div>
          <CardTitle className="text-2xl font-bold">Hire Your Executive Team</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Define your company and mission. Your AI C-Suite — CEO, CFO, CTO, CMO, Brand &amp; Sales — will be hired automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Company Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Navagraha" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Your Mission</label>
            <Textarea
              rows={4}
              value={mission}
              onChange={e => setMission(e.target.value)}
              placeholder="e.g. Scale to ₹5 Crore ARR in 6 months..."
              className="resize-none text-sm"
            />
          </div>
          <div className="pt-1 rounded-xl bg-nava-teal/5 border border-nava-teal/20 p-3">
            <p className="text-xs text-nava-teal font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Locking in 5 Crore target · 6 month deadline
            </p>
            <p className="text-xs text-muted-foreground mt-1">Your CEO will generate a strategic roadmap once hired.</p>
          </div>
          <Button
            className="w-full bg-nava-teal hover:bg-nava-teal/90 text-white font-semibold"
            onClick={() => initMut.mutate()}
            disabled={initMut.isPending || !name || !mission}
          >
            {initMut.isPending ? "Hiring team…" : "🚀 Open the Boardroom"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Boardroom Dashboard ───────────────────────────────────────────────
export default function Boardroom() {
  const [onboarded, setOnboarded] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: company, isLoading: companyLoading, isError: companyError } = useQuery<any>({
    queryKey: ["/api/corporate/company"],
    retry: false,        // don't hang on schema-not-found errors
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/employees"],
    enabled: !!company,
    retry: false,
  });

  const { data: initiatives = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/initiatives"],
    enabled: !!company,
    retry: false,
  });

  const planMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/plan", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/initiatives"] });
      toast({ title: "🎯 CEO has generated a strategic plan!", description: "Review your initiatives below." });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to generate plan" }),
  });

  // Only show spinner while the very first fetch is in-flight
  if (companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-nava-teal border-t-transparent rounded-full" />
      </div>
    );
  }

  // If we got an error (e.g. DB tables not yet migrated) or no company — show onboarding
  if ((companyError || !company) && !onboarded) {
    return <BoardroomOnboarding onCreated={() => setOnboarded(true)} />;
  }

  // Revenue progress
  const targetRevenue = 5_000_000_00; // 5 Crore in paise
  const progressPct = 3; // placeholder — can be wired to real data

  return (
    <div className="min-h-screen bg-background celestial-bg pb-28 md:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-40 glass-nav border-b border-border/30 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-nava-navy flex items-center justify-center">
              <Building2 className="w-5 h-5 text-nava-teal" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">{company?.name || "Boardroom"}</p>
              <p className="text-[11px] text-muted-foreground">AI Executive Command Center</p>
            </div>
          </div>
          <Badge className="bg-nava-teal/10 text-nava-teal border-nava-teal/30 text-[11px]">
            {employees.length} Active Execs
          </Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* Mission Banner */}
        <Card className="glass-card bg-gradient-to-br from-nava-navy/40 to-card/80 border-nava-teal/20">
          <CardContent className="p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-nava-teal uppercase tracking-wider mb-1">Company Mission</p>
              <p className="text-sm text-foreground font-medium max-w-xl">{company?.mission}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold text-nava-yellow">₹5 Crore</p>
              <p className="text-xs text-muted-foreground">Target · 6 months</p>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Progress */}
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-nava-teal" /> Revenue Runway
              </p>
              <span className="text-xs text-muted-foreground font-medium">{progressPct}% to target</span>
            </div>
            <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-nava-teal to-nava-amber transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground">₹0</span>
              <span className="text-[10px] text-muted-foreground">₹5,00,00,000</span>
            </div>
          </CardContent>
        </Card>

        {/* The Team */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-nava-teal" /> Your Executive Team
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {employees.map((emp: any) => <EmployeeCard key={emp.id} employee={emp} />)}
            {employees.length === 0 && (
              <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                Hiring your team…
              </div>
            )}
          </div>
        </section>

        {/* Strategic Initiatives */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-nava-amber" /> Strategic Initiatives
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="border-nava-teal/30 text-nava-teal hover:bg-nava-teal/10 text-xs"
              onClick={() => planMut.mutate()}
              disabled={planMut.isPending}
            >
              {planMut.isPending ? "Thinking…" : "🎯 Ask CEO to Plan"}
            </Button>
          </div>

          {initiatives.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center text-muted-foreground">
                <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No initiatives yet.</p>
                <p className="text-xs mt-1">Click "Ask CEO to Plan" to generate your 6-month strategic roadmap.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {initiatives.map((init: any) => <InitiativeCard key={init.id} initiative={init} />)}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
