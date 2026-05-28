import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Send, Sparkles, Stars, ChevronDown, BookOpen, Loader2, ArrowLeft, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PlacesAutocomplete } from "@/components/PlacesAutocomplete";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import ReactMarkdown from "react-markdown";

interface Kundli {
  id: string;
  name: string;
  zodiacSign?: string;
  moonSign?: string;
  ascendant?: string;
}

interface AntardashaEntry {
  planet: string;
  period: string;
  status: "past" | "current" | "upcoming";
}

interface DashaEntry {
  planet: string;
  period: string;
  status: "past" | "current" | "upcoming";
  antardashas?: AntardashaEntry[];
}

interface FullKundli extends Kundli {
  dashas?: DashaEntry[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  id?: string;
}

interface AiInterpretation {
  overview: string;
  personality: string;
  career: string;
  relationships: string;
  health: string;
  currentDasha: string;
  currentAntardasha: string;
  doshaAnalysis: string;
  remedies: string;
  luckyFactors: {
    number: number;
    color: string;
    day: string;
    gemstone: string;
  };
}

const SUGGESTED_QUESTIONS = [
  "What does my birth chart say about my career?",
  "When is a good time for marriage?",
  "What are my dominant planetary influences?",
  "Explain my current Mahadasha and its effects",
  "What remedies should I follow for my doshas?",
  "What are my lucky colours, numbers, and gemstones?",
];

const LANGUAGES = [
  'English', 'Hindi', 'Marathi', 'Bengali', 'Tamil', 'Telugu', 'Kannada',
  'Malayalam', 'Gujarati', 'Punjabi', 'Odia', 'Urdu', 'Spanish', 'French', 'Arabic',
];

const LIFE_AREA_PROMPTS = [
  { label: 'Career', q: 'What does my birth chart say about my career and the right path forward?' },
  { label: 'Love & Marriage', q: 'What does my chart reveal about love, marriage timing and my partner?' },
  { label: 'Finance', q: 'What does my chart indicate about wealth, income and favourable times for money?' },
  { label: 'Health', q: 'What does my chart say about my health and the periods I should be careful about?' },
  { label: 'Year Ahead', q: 'What are the key themes and turning points for me over the next 12 months?' },
  { label: 'Remedies', q: 'What remedies should I follow based on my chart and current dasha?' },
];

const LANGUAGE_STORAGE_KEY = 'ai_astrologer_language';

// The chart selector value used for the "enter birth details" mode.
const DETAILS_KEY = '__details__';

// Per-chart chat sessions: each chart (or the details/none context) keeps its
// own conversation thread, so switching charts shows that chart's history.
const SESSIONS_KEY = 'ai_astrologer_sessions';
function readSessions(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}'); } catch { return {}; }
}
function sessionForKey(key: string, forceNew = false): string {
  const map = readSessions();
  if (forceNew || !map[key]) {
    map[key] = crypto.randomUUID();
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(map));
  }
  return map[key];
}

const THINKING_STEPS = [
  'Casting your chart…',
  'Reading planetary positions…',
  'Consulting the astrologer council…',
  'Weighing dasha & transits…',
  'Composing your reading…',
];

export default function AIAstrologer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedKundliId, setSelectedKundliId] = useState<string>("none");
  const [language, setLanguage] = useState<string>(
    () => localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'English'
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const emptyBirth = { name: '', gender: 'male', dateOfBirth: '', timeOfBirth: '', placeOfBirth: '' };
  const [birth, setBirth] = useState(emptyBirth);
  const [birthCoords, setBirthCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [interpretation, setInterpretation] = useState<AiInterpretation | null>(null);
  const [questionsUsed, setQuestionsUsed] = useState<number | null>(null);

  const { data: questionCount } = useQuery<{ used: number; free: number; remaining: number }>({
    queryKey: ['/api/ai/question-count'],
  });

  const freeRemaining = questionsUsed !== null
    ? Math.max(0, 3 - questionsUsed)
    : (questionCount?.remaining ?? null);

  const { data: kundlis = [] } = useQuery<Kundli[]>({
    queryKey: ["/api/kundli"],
  });

  const detailsMode = selectedKundliId === DETAILS_KEY;
  const birthValid = !!(birth.name.trim() && birth.dateOfBirth && birth.timeOfBirth && birth.placeOfBirth.trim());

  // Auto-select the first available Kundli so users don't accidentally chat with an empty chart context
  useEffect(() => {
    if (kundlis.length > 0 && selectedKundliId === "none") {
      setSelectedKundliId(kundlis[0].id);
    }
  }, [kundlis, selectedKundliId]);

  // Switching context (chart / details / none) loads that context's own thread.
  useEffect(() => {
    setSessionId(sessionForKey(selectedKundliId));
    setMessages([]);
  }, [selectedKundliId]);

  const { data: fullKundli } = useQuery<FullKundli>({
    queryKey: [`/api/kundli/${selectedKundliId}`],
    enabled: selectedKundliId !== "none" && selectedKundliId !== DETAILS_KEY,
  });

  // Load previous messages from the persisted session on mount
  const { data: savedMessages } = useQuery<{ role: string; content: string }[]>({
    queryKey: [`/api/ai/chat/${sessionId}`],
    enabled: !!sessionId && messages.length === 0,
  });

  useEffect(() => {
    if (savedMessages && savedMessages.length > 0 && messages.length === 0) {
      setMessages(savedMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        id: crypto.randomUUID(),
      })));
    }
  }, [savedMessages]);

  const startNewSession = useCallback(() => {
    setSessionId(sessionForKey(selectedKundliId, true));
    setMessages([]);
    if (sessionId) queryClient.removeQueries({ queryKey: [`/api/ai/chat/${sessionId}`] });
  }, [selectedKundliId, sessionId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.slice(-20).map(({ role, content }) => ({ role, content }));
      const body: any = { message, history, language, sessionId };
      if (detailsMode) {
        body.birthDetails = {
          name: birth.name,
          gender: birth.gender,
          dateOfBirth: birth.dateOfBirth,
          timeOfBirth: birth.timeOfBirth,
          placeOfBirth: birth.placeOfBirth,
          latitude: birthCoords?.lat,
          longitude: birthCoords?.lng,
        };
      } else if (selectedKundliId !== "none") {
        body.kundliId = selectedKundliId;
      }
      return await apiRequest("POST", "/api/ai/chat", body);
    },
    onSuccess: (data) => {
      if (data.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);
      if (data.questionsUsed !== undefined) setQuestionsUsed(data.questionsUsed);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, id: crypto.randomUUID() },
      ]);
    },
    onError: (err: any) => {
      toast({
        title: "AI Unavailable",
        description: err.message || "Failed to get a response. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Rotate the "thinking" status while the council computes (it can take a while).
  useEffect(() => {
    if (!chatMutation.isPending) {
      setThinkingStep(0);
      return;
    }
    const id = setInterval(() => setThinkingStep((s) => (s + 1) % THINKING_STEPS.length), 2500);
    return () => clearInterval(id);
  }, [chatMutation.isPending]);

  const interpretMutation = useMutation({
    mutationFn: async (kundliId: string) => {
      const res = await apiRequest("POST", "/api/ai/interpret-kundli", { kundliId });
      return res;
    },
    onSuccess: (data) => {
      setInterpretation(data);
      setShowInterpretation(true);
    },
    onError: (err: any) => {
      toast({
        title: "Interpretation Failed",
        description: err.message || "Unable to generate interpretation.",
        variant: "destructive",
      });
    },
  });

  function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || chatMutation.isPending) return;
    if (detailsMode && !birthValid) {
      toast({ title: "Add birth details", description: "Enter name, date, time and place first.", variant: "destructive" });
      return;
    }
    setMessages((prev) => [...prev, { role: "user", content: msg, id: crypto.randomUUID() }]);
    setInput("");
    chatMutation.mutate(msg);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const selectedKundli = kundlis.find((k) => k.id === selectedKundliId);
  const currentMahadasha = fullKundli?.dashas?.find((d) => d.status === "current");
  const currentAntardasha = currentMahadasha?.antardashas?.find((a) => a.status === "current");

  return (
    <div className="min-h-screen bg-background flex flex-col w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/30 px-4 md:px-8 lg:px-12 py-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-1.5 rounded-lg hover:bg-muted">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="font-bold text-lg text-foreground">AI Astrologer</h1>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-nava-amber" />
              <span className="text-xs text-muted-foreground">Powered by AI</span>
              {freeRemaining !== null && freeRemaining > 0 && (
                <Badge className="bg-emerald-500/10 text-emerald-600 border-0 text-[10px] ml-1">
                  {freeRemaining} free {freeRemaining === 1 ? 'question' : 'questions'} left
                </Badge>
              )}
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={startNewSession}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              title="Start new conversation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 md:px-8 lg:px-12 py-4">

        {/* Kundli Selector */}
        <Card className="mb-4 bg-card border-border/50 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Stars className="w-5 h-5 text-nava-amber flex-shrink-0" />
              <div className="flex-1 min-w-[180px]">
                <Select value={selectedKundliId} onValueChange={setSelectedKundliId}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select a birth chart (optional)" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none">No chart — general guidance</SelectItem>
                    {kundlis.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={DETAILS_KEY}>Enter birth details…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[130px]">
                <Select
                  value={language}
                  onValueChange={(v) => { setLanguage(v); localStorage.setItem(LANGUAGE_STORAGE_KEY, v); }}
                >
                  <SelectTrigger className="bg-background border-border" data-testid="select-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border max-h-72">
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!detailsMode && selectedKundliId !== "none" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-nava-amber/50 text-nava-amber hover:bg-nava-amber/10"
                  onClick={() => interpretMutation.mutate(selectedKundliId)}
                  disabled={interpretMutation.isPending}
                >
                  {interpretMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <BookOpen className="w-4 h-4 mr-1" />
                  )}
                  Full Reading
                </Button>
              )}
            </div>

            {/* Birth-details entry (no saved chart needed) */}
            {detailsMode && (
              <div className="mt-3 space-y-2">
                <Input
                  placeholder="Full name"
                  value={birth.name}
                  onChange={(e) => setBirth({ ...birth, name: e.target.value })}
                  className="bg-background"
                  data-testid="ai-bd-name"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={birth.dateOfBirth} onChange={(e) => setBirth({ ...birth, dateOfBirth: e.target.value })} className="bg-background" data-testid="ai-bd-date" />
                  <Input type="time" value={birth.timeOfBirth} onChange={(e) => setBirth({ ...birth, timeOfBirth: e.target.value })} className="bg-background" data-testid="ai-bd-time" />
                </div>
                <PlacesAutocomplete
                  value={birth.placeOfBirth}
                  onChange={(v) => setBirth((b) => ({ ...b, placeOfBirth: v }))}
                  onPlaceSelect={(place) => setBirthCoords({ lat: place.lat, lng: place.lng })}
                  placeholder="City, State, Country"
                />
                {!birthValid && (
                  <p className="text-[11px] text-muted-foreground">Enter name, date, time and place to get a personalised reading.</p>
                )}
              </div>
            )}

            {selectedKundli && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedKundli.zodiacSign && (
                  <Badge className="bg-nava-amber/10 text-nava-amber border-0 text-xs">
                    Sun: {selectedKundli.zodiacSign}
                  </Badge>
                )}
                {selectedKundli.moonSign && (
                  <Badge className="bg-primary/15 text-[var(--primary-border)] border-0 text-xs">
                    Moon: {selectedKundli.moonSign}
                  </Badge>
                )}
                {selectedKundli.ascendant && (
                  <Badge className="bg-nava-magenta/10 text-nava-magenta border-0 text-xs">
                    Asc: {selectedKundli.ascendant}
                  </Badge>
                )}
              </div>
            )}

            {/* No kundlis — CTA to create one */}
            {kundlis.length === 0 && (
              <div className="mt-3 flex items-center gap-3 bg-nava-amber/5 border border-nava-amber/20 rounded-xl px-4 py-3">
                <Sparkles className="w-4 h-4 text-nava-amber flex-shrink-0" />
                <p className="text-sm text-foreground flex-1">
                  Generate your Kundli for personalized AI readings
                </p>
                <Link href="/kundli/new">
                  <Button size="sm" className="shrink-0 gap-1 rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="w-3.5 h-3.5" />
                    Create Kundli
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Dasha Timeline — shown when a kundli with dasha data is selected */}
        {!detailsMode && selectedKundliId !== "none" && (currentMahadasha || currentAntardasha) && (
          <Card className="mb-4 bg-card border-border/50 shadow-sm">
            <CardContent className="p-4">
              <h3 className="yantra-eyebrow text-[var(--primary-border)] mb-3">
                Current Planetary Periods
              </h3>
              <div className="space-y-2">
                {currentMahadasha && (
                  <div className="flex items-center justify-between rounded-[10px] border border-primary/25 bg-primary/10 px-4 py-2.5">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-border)]">Mahadasha</span>
                      <p className="font-bold text-foreground text-sm">{currentMahadasha.planet}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{currentMahadasha.period}</span>
                  </div>
                )}
                {currentAntardasha && (
                  <div className="flex items-center justify-between bg-nava-magenta/5 border border-nava-magenta/20 rounded-xl px-4 py-2.5 ml-4">
                    <div>
                      <span className="text-[10px] font-semibold text-nava-magenta uppercase tracking-wider">Antardasha · Pratidasha</span>
                      <p className="font-bold text-foreground text-sm">{currentAntardasha.planet}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{currentAntardasha.period}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Full Interpretation Panel */}
        {showInterpretation && interpretation && (
          <Card className="mb-4 border-primary/25 bg-primary/10">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base text-[var(--primary-border)]">
                  Your Complete Vedic Reading
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInterpretation(false)}
                  className="text-muted-foreground"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid gap-4">
                {[
                  { label: "Overview", value: interpretation.overview },
                  { label: "Personality", value: interpretation.personality },
                  { label: "Career", value: interpretation.career },
                  { label: "Relationships", value: interpretation.relationships },
                  { label: "Health", value: interpretation.health },
                  { label: "Current Mahadasha", value: interpretation.currentDasha },
                  { label: "Antardasha · Pratidasha", value: interpretation.currentAntardasha },
                  { label: "Dosha Analysis", value: interpretation.doshaAnalysis },
                  { label: "Remedies", value: interpretation.remedies },
                ].map(({ label, value }) =>
                  value ? (
                    <div key={label}>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--primary-border)]">
                        {label}
                      </h3>
                      <p className="text-foreground text-sm leading-relaxed">
                        {typeof value === 'string' 
                          ? value 
                          : Array.isArray(value) 
                            ? (value as any).join(', ') 
                            : JSON.stringify(value)}
                      </p>
                    </div>
                  ) : null
                )}

                {interpretation.luckyFactors && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--primary-border)]">
                      Lucky Factors
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-nava-amber/10 text-nava-amber border-0">
                        Number: {interpretation.luckyFactors.number}
                      </Badge>
                      <Badge className="bg-primary/15 text-[var(--primary-border)] border-0">
                        Color: {interpretation.luckyFactors.color}
                      </Badge>
                      <Badge className="bg-nava-magenta/10 text-nava-magenta border-0">
                        Day: {interpretation.luckyFactors.day}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[300px]">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[8px] bg-primary/20">
                <Sparkles className="w-8 h-8 text-[var(--primary-border)]" />
              </div>
              <p className="text-muted-foreground mb-6 text-sm">
                Ask Jyotish AI anything about Vedic astrology,
                <br />
                or select a birth chart above for personalised insights.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl mx-auto">
                {SUGGESTED_QUESTIONS.slice(0, 4).map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left text-xs text-foreground bg-card hover:bg-muted border border-border/50 rounded-xl p-3 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={msg.id || i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-primary">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-nava-navy text-primary ml-8"
                    : "bg-card border border-border/50 text-foreground"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-[var(--primary-border)] prose-a:text-[var(--primary-border)] prose-strong:text-foreground prose-p:leading-relaxed text-foreground">
                    <ReactMarkdown>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === "user" && (
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-nava-navy">
                  <span className="text-xs font-bold text-primary">U</span>
                </div>
              )}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-primary">
                <Sparkles className="w-4 h-4 text-white animate-pulse" />
              </div>
              <div className="bg-card border border-border/50 rounded-2xl px-4 py-3 flex items-center gap-3">
                {/* Orbiting planet — a clear "AI is working" cue */}
                <div className="relative w-7 h-7 shrink-0">
                  <div className="absolute inset-0 rounded-full border border-nava-amber/30" />
                  <div className="absolute inset-0 animate-spin" style={{ animationDuration: "1.4s" }}>
                    <span className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-nava-amber shadow-sm" />
                  </div>
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--primary-border)]" />
                </div>
                <span className="text-sm text-muted-foreground">{THINKING_STEPS[thinkingStep]}</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm pt-3 pb-safe">
          {/* Life-area quick questions */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {LIFE_AREA_PROMPTS.map((a) => (
              <button
                key={a.label}
                onClick={() => sendMessage(a.q)}
                disabled={chatMutation.isPending}
                className="shrink-0 rounded-[999px] border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-[var(--primary-border)] transition-colors hover:bg-primary/15 disabled:opacity-50"
                data-testid={`chip-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything…"
              rows={1}
              className="flex-1 bg-card border-border resize-none min-h-[48px] max-h-[120px] rounded-xl text-sm leading-snug"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || chatMutation.isPending}
              className="h-12 rounded-[9px] bg-primary px-4 text-primary-foreground hover:bg-primary/90"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-1.5 pb-24">
            For guidance only — consult a qualified Jyotish for big decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
