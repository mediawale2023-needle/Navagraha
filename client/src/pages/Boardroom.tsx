import { useState, useRef, useEffect } from "react";
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
  Sparkles, Send, MessageSquare, MessageCircle, Moon, Sun, Plus,
  Briefcase, Code, CheckCircle, RefreshCw, AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ── Role metadata ──────────────────────────────────────────────────────────
const ROLE_META: Record<string, { icon: React.ElementType; color: string; bg: string; label: string; description: string }> = {
  CEO:   { icon: Crown,         color: "text-nava-yellow",  bg: "bg-nava-yellow/20",  label: "CEO",              description: "Strategy & Vision"    },
  CFO:   { icon: DollarSign,    color: "text-nava-teal",    bg: "bg-nava-teal/20",    label: "CFO",              description: "Finance & Budget"     },
  CTO:   { icon: Code2,         color: "text-nava-magenta", bg: "bg-nava-magenta/20", label: "CTO",              description: "Technology & Product" },
  CMO:   { icon: Megaphone,     color: "text-nava-amber",   bg: "bg-nava-amber/20",   label: "CMO",              description: "Marketing & Growth"   },
  BRAND: { icon: Palette,       color: "text-nava-coral",   bg: "bg-nava-coral/20",   label: "Brand Consultant", description: "Identity & Vision"   },
  SALES: { icon: HandshakeIcon, color: "text-nava-aqua",    bg: "bg-nava-aqua/20",    label: "Sales Head",       description: "Revenue & Deals"     },
  DEV:   { icon: Code2,         color: "text-emerald-400",  bg: "bg-emerald-500/20",  label: "Developer",        description: "Full Stack Engineer" },
};

const DEFAULT_META = { icon: Briefcase, color: "text-blue-400", bg: "bg-blue-500/20", label: "Specialist", description: "Expert Consultant" };

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  thinking: "bg-nava-amber/20 text-nava-amber border-nava-amber/30",
  paused:   "bg-muted/40 text-muted-foreground border-border",
  pending:  "bg-nava-teal/10 text-nava-teal border-nava-teal/30",
  high:     "bg-nava-magenta/20 text-nava-magenta border-nava-magenta/30",
  medium:   "bg-nava-amber/20 text-nava-amber border-nava-amber/30",
  low:      "bg-nava-teal/10 text-nava-teal border-nava-teal/30",
  failed:   "bg-red-500/20 text-red-400 border-red-500/30",
};

// ── Message bubble ─────────────────────────────────────────────────────────
function MessageBubble({ msg, isUser }: { msg: any; isUser: boolean }) {
  const meta = (msg.senderRole ? ROLE_META[msg.senderRole] : null) || DEFAULT_META;
  const Icon = meta.icon;
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"} items-end mb-3`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold
        ${isUser ? "bg-nava-navy text-nava-teal" : (meta?.bg || "bg-muted")} ${!isUser && meta?.color || ""}`}>
        {Icon ? <Icon className="w-3.5 h-3.5" /> : msg.senderName?.[0]}
      </div>
      {/* Bubble */}
      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        {!isUser && (
          <span className={`text-[10px] font-semibold ml-1 ${meta?.color || "text-muted-foreground"}`}>
            {msg.senderName} · {meta?.label || msg.senderRole}
          </span>
        )}
        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? "bg-nava-teal/20 text-foreground rounded-br-sm border border-nava-teal/30"
            : "bg-card/60 text-foreground rounded-bl-sm border border-border/40"
          }`}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ── DM Panel ───────────────────────────────────────────────────────────────
function DMPanel({ employees, company }: { employees: any[]; company: any }) {
  const [selected, setSelected] = useState<any>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const thread = selected ? `dm-${selected.id}` : null;

  const { data: msgs = [], isLoading: msgsLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/chat", thread],
    queryFn: () => thread ? apiRequest("GET", `/api/corporate/chat/${thread}`) : Promise.resolve([]),
    enabled: !!thread,
    refetchInterval: 3000,
  });

  const sendMut = useMutation({
    mutationFn: (msg: string) => apiRequest("POST", `/api/corporate/chat/dm/${selected.id}`, { message: msg }),
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["/api/corporate/chat", thread] });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to send" }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const handleSend = () => {
    if (input.trim() && selected && !sendMut.isPending) {
      sendMut.mutate(input.trim());
    }
  };

  return (
    <div className="flex gap-4 h-[500px]">
      {/* Exec list */}
      <div className="w-36 shrink-0 flex flex-col gap-2 overflow-y-auto">
        {employees.map((emp: any) => {
          const meta = ROLE_META[emp.role];
          const Icon = meta?.icon || MessageSquare;
          const isActive = selected?.id === emp.id;
          return (
            <button
              key={emp.id}
              onClick={() => setSelected(emp)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center
                ${isActive ? "border-nava-teal/50 bg-nava-teal/10" : "border-border/30 bg-card/30 hover:border-border/60"}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta?.bg || "bg-muted"} ${meta?.color}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <span className={`text-[10px] font-semibold leading-tight ${isActive ? meta?.color : "text-muted-foreground"}`}>{emp.name}</span>
              <span className="text-[9px] text-muted-foreground">{meta?.label}</span>
            </button>
          );
        })}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col rounded-2xl border border-border/30 bg-card/20 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-2 text-muted-foreground">
            <MessageCircle className="w-10 h-10 opacity-20" />
            <p className="text-sm">Select an executive to start chatting</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className={`px-4 py-3 border-b border-border/30 flex items-center gap-2.5 ${ROLE_META[selected.role]?.bg || ""}`}>
              {(() => { const Icon = ROLE_META[selected.role]?.icon; return Icon ? <Icon className={`w-4 h-4 ${ROLE_META[selected.role]?.color}`} /> : null; })()}
              <div>
                <p className={`font-bold text-sm ${ROLE_META[selected.role]?.color}`}>{selected.name}</p>
                <p className="text-[11px] text-muted-foreground">{ROLE_META[selected.role]?.label} · {company.name}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {msgsLoading ? (
                <p className="text-sm text-center text-muted-foreground">Loading…</p>
              ) : msgs.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-8">Say hello to {selected.name}!</p>
              ) : (
                msgs.map((m: any) => (
                  <MessageBubble key={m.id} msg={m} isUser={m.senderType === "user"} />
                ))
              )}
              {sendMut.isPending && (
                <div className="flex gap-2.5 items-end mb-3">
                  <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${ROLE_META[selected.role]?.bg}`}>
                    {(() => { const Icon = ROLE_META[selected.role]?.icon; return Icon ? <Icon className={`w-3.5 h-3.5 ${ROLE_META[selected.role]?.color}`} /> : null; })()}
                  </div>
                  <div className="px-4 py-2.5 bg-card/60 rounded-2xl rounded-bl-sm border border-border/40 text-muted-foreground text-sm">
                    <span className="animate-pulse">Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/30 flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={`Message ${selected.name}…`}
                className="flex-1 text-sm h-9"
                disabled={sendMut.isPending}
              />
              <Button size="sm" className="h-9 px-3 bg-nava-teal hover:bg-nava-teal/90" onClick={handleSend} disabled={!input.trim() || sendMut.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Exec Room Panel ────────────────────────────────────────────────────────
function ExecRoomPanel({ company }: { company: any }) {
  const [topic, setTopic] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: msgs = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/chat", "exec-room"],
    queryFn: () => apiRequest("GET", "/api/corporate/chat/exec-room"),
    refetchInterval: 5000,
  });

  const debateMut = useMutation({
    mutationFn: (t: string) => apiRequest("POST", "/api/corporate/chat/exec-room", { topic: t }),
    onSuccess: () => {
      setTopic("");
      qc.invalidateQueries({ queryKey: ["/api/corporate/chat", "exec-room"] });
      toast({ title: "🎙️ Exec Room debate started!", description: "Your team is discussing the topic." });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to start debate" }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  return (
    <div className="flex flex-col gap-3">
      {/* Trigger input */}
      <div className="flex gap-2">
        <Input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && topic.trim() && debateMut.mutate(topic.trim())}
          placeholder='Ask the room… e.g. "Should we raise prices or focus on volume?"'
          className="flex-1 text-sm"
          disabled={debateMut.isPending}
        />
        <Button
          className="bg-nava-amber hover:bg-nava-amber/90 text-white shrink-0"
          onClick={() => topic.trim() && debateMut.mutate(topic.trim())}
          disabled={!topic.trim() || debateMut.isPending}
        >
          {debateMut.isPending ? <span className="animate-pulse">…</span> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {/* Message feed */}
      <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto rounded-2xl border border-border/30 bg-card/20 p-4">
        {msgs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">The exec room is quiet.</p>
            <p className="text-xs mt-1">Type a topic above to start a team discussion.</p>
          </div>
        ) : (
          msgs.map((m: any) => <MessageBubble key={m.id} msg={m} isUser={false} />)
        )}
        {debateMut.isPending && (
          <p className="text-xs text-muted-foreground text-center animate-pulse py-2">Your team is deliberating…</p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Reports Panel ─────────────────────────────────────────────────────────
function ReportsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reportTab, setReportTab] = useState<"morning" | "evening">("morning");

  const { data: morningMsgs = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/chat", "heartbeat-morning"],
    queryFn: () => apiRequest("GET", "/api/corporate/chat/heartbeat-morning"),
    refetchInterval: 30_000,
  });
  const { data: eveningMsgs = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/chat", "heartbeat-evening"],
    queryFn: () => apiRequest("GET", "/api/corporate/chat/heartbeat-evening"),
    refetchInterval: 30_000,
  });

  const triggerMut = useMutation({
    mutationFn: (session: "morning" | "evening") =>
      apiRequest("POST", "/api/corporate/heartbeat", { session }),
    onSuccess: (_, session) => {
      toast({ title: `${session === "morning" ? "☀️" : "🌙"} ${session} briefing triggered!`, description: "Reports will appear here in ~30 seconds." });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["/api/corporate/chat", `heartbeat-${session}`] });
      }, 35_000);
    },
    onError: () => toast({ variant: "destructive", title: "Failed to trigger" }),
  });

  const msgs = reportTab === "morning" ? morningMsgs : eveningMsgs;

  return (
    <div className="space-y-4">
      {/* Schedule info */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-nava-navy/30 border border-nava-teal/20">
        <div>
          <p className="text-xs font-semibold text-nava-teal">🤖 Autonomous Schedule</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <Sun className="w-3 h-3 inline mr-1 text-nava-amber" />Morning briefing @ 8:00 AM IST &nbsp;·&nbsp;
            <Moon className="w-3 h-3 inline mr-1 text-nava-teal" />Evening standup @ 9:00 PM IST
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" className="text-[11px] h-7 border-nava-amber/30 text-nava-amber hover:bg-nava-amber/10"
            onClick={() => triggerMut.mutate("morning")} disabled={triggerMut.isPending}>
            ☀️ Now
          </Button>
          <Button size="sm" variant="outline" className="text-[11px] h-7 border-nava-teal/30 text-nava-teal hover:bg-nava-teal/10"
            onClick={() => triggerMut.mutate("evening")} disabled={triggerMut.isPending}>
            🌙 Now
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-card/30 border border-border/30">
        {(["morning", "evening"] as const).map(s => (
          <button key={s} onClick={() => setReportTab(s)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${reportTab === s ? "bg-card text-foreground shadow-sm border border-border/40" : "text-muted-foreground"}`}>
            {s === "morning" ? "☀️ Morning" : "🌙 Evening"}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
        {msgs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Moon className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No reports yet.</p>
            <p className="text-xs mt-1">Click "Now" above to trigger a {reportTab} session instantly.</p>
          </div>
        ) : (
          msgs.map((m: any) => <MessageBubble key={m.id} msg={m} isUser={false} />)
        )}
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
      toast({ title: "🏢 Boardroom initialized!", description: "Your C-Suite is hired and ready." });
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
            CEO · CFO · CTO · CMO · Brand · Sales — hired automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Company Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Navagraha" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Your Mission</label>
            <Textarea rows={4} value={mission} onChange={e => setMission(e.target.value)} className="resize-none text-sm" />
          </div>
          <div className="rounded-xl bg-nava-teal/5 border border-nava-teal/20 p-3">
            <p className="text-xs text-nava-teal font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Target locked: ₹5 Crore · 6 months
            </p>
          </div>
          <Button className="w-full bg-nava-teal hover:bg-nava-teal/90 text-white font-semibold"
            onClick={() => initMut.mutate()} disabled={initMut.isPending || !name || !mission}>
            {initMut.isPending ? "Hiring team…" : "🚀 Open the Boardroom"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Hire Agent Dialog ──────────────────────────────────────────────────────
function HireAgentDialog({ company, onSuccess }: { company: any; onSuccess: () => void }) {
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState("");
  const { toast } = useToast();

  const hireMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/corporate/hire", { role, name, personality }),
    onSuccess: () => {
      toast({ title: `Hired ${name} as ${role}!` });
      onSuccess();
      setRole("");
      setName("");
      setPersonality("");
    },
    onError: (err) => toast({ variant: "destructive", title: "Hiring failed", description: String(err) }),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-full border-dashed border-nava-teal/40 bg-nava-teal/5 hover:bg-nava-teal/10 flex flex-col items-center justify-center gap-2 p-4 text-nava-teal">
          <Plus className="w-8 h-8" />
          <span className="text-xs font-bold uppercase tracking-tight">Hire New Agent</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card border-nava-teal/20">
        <DialogHeader>
          <DialogTitle>Expand your AI C-Suite</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-nava-teal uppercase">Role (e.g. LEGAL, DATA, OPS)</label>
            <Input placeholder="LEGAL" value={role} onChange={e => setRole(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-nava-teal uppercase">Agent Name</label>
            <Input placeholder="Lex / data-bot" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-nava-teal uppercase">Personality & Mandate</label>
            <Textarea 
              placeholder="Sharp legal mind, focus on risk mitigation and contracts..." 
              value={personality} 
              onChange={e => setPersonality(e.target.value)}
              className="h-24"
            />
          </div>
          <Button 
            className="w-full bg-nava-teal hover:bg-nava-teal/90 text-white font-bold"
            disabled={!role || !name || !personality || hireMut.isPending}
            onClick={() => hireMut.mutate()}
          >
            {hireMut.isPending ? "Hiring..." : "Confirm Hire"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
type Tab = "team" | "dm" | "exec-room" | "initiatives" | "directives" | "reports";

export default function Boardroom() {
  const [onboarded, setOnboarded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("team");
  const [manualTask, setManualTask] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: company, isLoading: companyLoading, isError: companyError } = useQuery<any>({
    queryKey: ["/api/corporate/company"],
    retry: false,
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

  const { data: directives = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/directives"],
    enabled: !!company,
    retry: false,
    refetchInterval: 5000,
  });

  const planMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/corporate/plan", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/initiatives"] });
      // Invalidate directives too, as they get generated after initiatives
      qc.invalidateQueries({ queryKey: ["/api/corporate/directives"] });
      toast({ title: "🎯 CEO generated a strategic roadmap!" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to generate plan" }),
  });

  const approveDirectiveMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/corporate/directives/${id}/approve`, {}),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/directives"] });
      toast({ title: "✅ Code approved and deployed!" });
    },
    onError: (err) => toast({ variant: "destructive", title: "Deployment failed", description: String(err) }),
  });

  const manualDirectiveMut = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/corporate/directives/manual", { content });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/directives"] });
      setManualTask("");
      toast({ title: "Task Assigned", description: "Ada has received your manual directive." });
    },
  });

  const resetDirectiveMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/corporate/directives/${id}/reset`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/directives"] });
      toast({ title: "Task Reset", description: "Ada is re-evaluating the task with new safety rules." });
    },
  });

  if (companyLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-nava-teal border-t-transparent rounded-full" />
    </div>
  );

  if ((companyError || !company) && !onboarded) return <BoardroomOnboarding onCreated={() => setOnboarded(true)} />;

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "team",        label: "Team",         icon: Users          },
    { id: "dm",          label: "Chat",          icon: MessageSquare  },
    { id: "exec-room",   label: "Exec Room",     icon: MessageCircle  },
    { id: "initiatives", label: "Goals",         icon: Target         },
    { id: "directives",  label: "Tasks",         icon: Code           },
    { id: "reports",     label: "Reports",       icon: Moon           },
  ];

  return (
    <div className="min-h-screen bg-background celestial-bg pb-28 md:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-40 glass-nav border-b border-border/30 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-nava-navy flex items-center justify-center">
              <Building2 className="w-5 h-5 text-nava-teal" />
            </div>
            <div>
              <p className="font-bold text-sm">{company?.name || "Boardroom"}</p>
              <p className="text-[11px] text-muted-foreground">AI Executive Command Center</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">{employees.length} Online</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Mission card */}
        <Card className="glass-card bg-gradient-to-br from-nava-navy/40 to-card/80 border-nava-teal/20">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div>
              <p className="text-xs text-nava-teal font-semibold uppercase tracking-wider">Mission</p>
              <p className="text-sm text-foreground font-medium max-w-md mt-0.5">{company?.mission}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xl font-bold text-nava-yellow">₹5 Crore</p>
              <p className="text-xs text-muted-foreground">6-month target</p>
            </div>
          </CardContent>
        </Card>

        {/* Revenue bar */}
        <div className="flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-nava-teal shrink-0" />
          <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
            <div className="h-full w-[3%] bg-gradient-to-r from-nava-teal to-nava-amber rounded-full" />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">3% to target</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-card/30 border border-border/30">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-all
                  ${isActive ? "bg-card text-foreground shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "team" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {employees.map((emp: any) => {
              const meta = ROLE_META[emp.role] || DEFAULT_META;
              const Icon = meta.icon;
              return (
                <Card key={emp.id} className="glass-card p-4 flex flex-col items-center text-center gap-2 group cursor-pointer hover:scale-[1.02] transition-transform"
                  onClick={() => { setActiveTab("dm"); }}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${meta.bg} ${meta.color} ring-2 ring-border/30 group-hover:ring-nava-teal/40 transition-all`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{emp.name}</p>
                    <p className={`text-[11px] font-semibold ${meta.color}`}>{meta.label}</p>
                  </div>
                  <Badge className={`text-[10px] border ${STATUS_COLORS["active"]}`}>● Active</Badge>
                </Card>
              );
            })}
            <HireAgentDialog company={company} onSuccess={() => qc.invalidateQueries({ queryKey: ["/api/corporate/employees"] })} />
          </div>
        )}

        {activeTab === "dm" && (
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-nava-teal" /> Direct Message
              </CardTitle>
              <p className="text-xs text-muted-foreground">Chat 1-on-1 with any executive.</p>
            </CardHeader>
            <CardContent>
              <DMPanel employees={employees} company={company} />
            </CardContent>
          </Card>
        )}

        {activeTab === "exec-room" && (
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-nava-amber" /> Executive Room
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Pose a topic — your entire team debates it in real time.
              </p>
            </CardHeader>
            <CardContent>
              <ExecRoomPanel company={company} />
            </CardContent>
          </Card>
        )}

        {activeTab === "initiatives" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="font-semibold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-nava-amber" /> Strategic Initiatives</p>
              <Button size="sm" variant="outline" className="text-xs border-nava-teal/30 text-nava-teal hover:bg-nava-teal/10"
                onClick={() => planMut.mutate()} disabled={planMut.isPending}>
                {planMut.isPending ? "Thinking…" : "🎯 Ask CEO to Plan"}
              </Button>
            </div>
            {initiatives.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No initiatives yet. Ask the CEO to generate a strategic roadmap.</p>
                </CardContent>
              </Card>
            ) : (
              initiatives.map((init: any) => (
                <div key={init.id} className="flex gap-3 p-4 rounded-xl bg-card/40 border border-border/30">
                  <div className={`mt-0.5 p-1.5 rounded-lg ${STATUS_COLORS[init.priority]} shrink-0`}>
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{init.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{init.description}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge className={`text-[10px] border ${STATUS_COLORS[init.priority]}`}>{init.priority}</Badge>
                      <Badge className={`text-[10px] border ${STATUS_COLORS[init.status]}`}>{init.status}</Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        {activeTab === "directives" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="font-semibold text-sm flex items-center gap-2"><Code className="w-4 h-4 text-emerald-400" /> Technical Directives</p>
            </div>
            
            <Card className="glass-card bg-emerald-500/5 border-emerald-500/20">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-tight">Direct Assignment</p>
                <Textarea 
                  placeholder="e.g. 'Ada, build a dark mode toggle component and add it to TopNav.tsx'" 
                  value={manualTask}
                  onChange={e => setManualTask(e.target.value)}
                  className="bg-background/50 border-emerald-500/30 text-sm"
                />
                <Button 
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                  size="sm"
                  disabled={!manualTask || manualDirectiveMut.isPending}
                  onClick={() => manualDirectiveMut.mutate(manualTask)}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {manualDirectiveMut.isPending ? "Assigning..." : "Assign Task to Ada"}
                </Button>
              </CardContent>
            </Card>
            {directives.length === 0 ? (
               <Card className="glass-card">
                 <CardContent className="p-8 text-center text-muted-foreground">
                   <Code className="w-10 h-10 mx-auto mb-3 opacity-30" />
                   <p className="text-sm">No tasks assigned to the AI Dev Team yet.</p>
                 </CardContent>
               </Card>
            ) : (
              directives.map((dir: any) => (
                <Card key={dir.id} className="glass-card mb-4 border-emerald-500/20">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Task #{dir.id}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{dir.content}</p>
                    </div>
                    <Badge className={`text-[10px] border ${STATUS_COLORS[dir.status] || STATUS_COLORS.pending}`}>
                      {dir.status}
                    </Badge>
                    {dir.status === 'failed' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-6 text-[10px] border-red-500/50 text-red-400 hover:bg-red-500/10 px-2"
                        onClick={() => resetDirectiveMut.mutate(dir.id)}
                        disabled={resetDirectiveMut.isPending}
                      >
                        <RefreshCw className={`w-3 h-3 mr-1 ${resetDirectiveMut.isPending ? 'animate-spin' : ''}`} />
                        Retry
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {dir.type === "CODE_CHANGE" && dir.proposedChanges ? (
                      <div className="mt-3 space-y-3">
                        <div className="bg-background/50 rounded-md border border-border/40 p-3 max-h-60 overflow-y-auto custom-scrollbar">
                           <p className="text-xs font-bold text-emerald-400 mb-2">Proposed Code Changes:</p>
                           {dir.proposedChanges.map((change: any, idx: number) => (
                             <div key={idx} className="mb-4 last:mb-0">
                               <p className="text-[11px] text-muted-foreground bg-card px-2 py-1 inline-block rounded-t-md font-mono">{change.filePath}</p>
                               <pre className="text-[10px] font-mono text-foreground/80 bg-nava-navy/50 p-2 rounded-b-md rounded-tr-md overflow-x-auto whitespace-pre-wrap leading-tight border border-border/30">
                                 {change.content.length > 300 ? change.content.substring(0, 300) + "... (truncated for review)" : change.content}
                               </pre>
                             </div>
                           ))}
                        </div>
                        {dir.status === "pending" && (
                          <Button 
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" 
                            size="sm"
                            disabled={approveDirectiveMut.isPending}
                            onClick={() => approveDirectiveMut.mutate(dir.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {approveDirectiveMut.isPending ? "Deploying..." : "Approve & Apply to Disk"}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {dir.status === "pending" ? "Ada is writing code..." : "No code changes available."}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "reports" && (
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Moon className="w-4 h-4 text-nava-teal" /> Daily Reports
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Your team works while you sleep — morning briefings at 8 AM, evening standups at 9 PM.
              </p>
            </CardHeader>
            <CardContent>
              <ReportsPanel />
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
