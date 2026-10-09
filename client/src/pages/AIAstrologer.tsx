import { useState, useRef, useEffect, useCallback } from "react";
import { scrollBehavior } from "@/lib/motion";
import type { KundliInsights } from '@shared/v3/evidence';
import { selectRunningPeriods } from '@/lib/runningPeriods';
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
import { PageHeader } from '@/components/shell/PageHeader';
import { AnswerCard, termsIn, type EvidenceSummary } from '@/components/ask/AnswerCard';
import { GlossaryAside, GlossarySheet } from '@/components/ask/Glossary';
import type { GlossaryEntry } from '@/lib/glossary';

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
  evidence?: EvidenceSummary | null;
  /** Who wrote the answer: the language model (guarded against the chart) or the deterministic evidence summary. */
  answerSource?: "llm" | "deterministic";
}

interface AiInterpretation {
  overview?: string;
  personality?: string;
  career?: string;
  relationships?: string;
  currentPeriods?: string;
  doshaAnalysis?: string;
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
  'Gathering evidence from your chart…',
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
  const [activeTerm, setActiveTerm] = useState<GlossaryEntry | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

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

  // Deep links from the Evidence Sheet: ?kundliId=<owned chart>&q=<question>.
  const [linkParams] = useState(() => new URLSearchParams(window.location.search));
  useEffect(() => {
    const q = linkParams.get("q");
    if (q) setInput(q.slice(0, 500));
  }, [linkParams]);

  // Auto-select the linked chart if it is one of the user's, else the first available Kundli,
  // so users don't accidentally chat with an empty chart context.
  useEffect(() => {
    if (kundlis.length > 0 && selectedKundliId === "none") {
      const linked = linkParams.get("kundliId");
      setSelectedKundliId(kundlis.some((k) => k.id === linked) ? linked! : kundlis[0].id);
    }
  }, [kundlis, selectedKundliId, linkParams]);

  // Switching context (chart / details / none) loads that context's own thread.
  useEffect(() => {
    setSessionId(sessionForKey(selectedKundliId));
    setMessages([]);
  }, [selectedKundliId]);

  const { data: fullKundli } = useQuery<FullKundli>({
    queryKey: [`/api/kundli/${selectedKundliId}`],
    enabled: selectedKundliId !== "none" && selectedKundliId !== DETAILS_KEY,
  });
  // Running periods come from the evidence engine, which withholds what an approximate birth time could move.
  const { data: chartInsights } = useQuery<KundliInsights>({
    queryKey: ['/api/kundli', selectedKundliId, 'insights'],
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
    setContextOpen(false);
    if (sessionId) queryClient.removeQueries({ queryKey: [`/api/ai/chat/${sessionId}`] });
  }, [selectedKundliId, sessionId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior() });
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
        { role: "assistant", content: data.reply, id: crypto.randomUUID(), evidence: data.evidence ?? null, answerSource: data.answerSource },
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
  const running = chartInsights ? selectRunningPeriods(chartInsights) : null;
  const periodDates = (p: { start: string; end: string }) => running?.showDates ? `${p.start.slice(0, 7)} – ${p.end.slice(0, 7)}` : "";
  const currentMahadasha = running?.maha ? { planet: running.maha.lord, period: periodDates(running.maha) } : undefined;
  const currentAntardasha = running?.antar ? { planet: running.antar.lord, period: periodDates(running.antar) } : undefined;

  const chartId = !detailsMode && selectedKundliId !== "none" ? selectedKundliId : null;
  const chartName = detailsMode ? (birth.name.trim() || null) : selectedKundli?.name ?? null;
  const lastAnswer = [...messages].reverse().find((m) => m.role === "assistant");
  const lastDomain = lastAnswer?.evidence?.domains?.[0]?.label;
  const asideTerms = lastAnswer ? termsIn([lastAnswer.content, ...(lastAnswer.evidence?.domains?.[0]?.items ?? []).map((i) => i.explanation)].join(' ')) : [];
  const recentQuestions = messages.filter((m) => m.role === "user").slice(-5).reverse();
  const runningForCard = running ? { maha: running.maha, antar: running.antar, showDates: running.showDates } : null;
  const openTerm = (t: GlossaryEntry) => {
    setActiveTerm(t);
    document.getElementById(`term-${t.term}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
  };

  return (
    <div className="flex flex-col">
      <PageHeader
        compact
        title={<><span lang="hi">प्रश्न</span> · {lastDomain ?? 'Ask your Kundli'}</>}
        sub={chartName ? `${chartName}’s chart` : detailsMode ? 'Birth details' : 'No chart selected'}
        back={{ href: '/', label: 'Today' }}
        desktop={false}
      />

      <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-wrap gap-10 px-4 pt-4 md:px-10 md:pt-8">
        <main className="flex min-w-0 max-w-[760px] flex-[999_1_560px] flex-col gap-[22px]">
          {/* Which chart and language the answers use (the mockup assumes one chart and English). */}
          <div className="flex flex-col gap-2.5" data-testid="ask-context">
            {/* On a phone the conversation takes the screen once it starts; the selectors fold into one line. */}
            {messages.length > 0 && !contextOpen && (
              <div className="flex items-center gap-3 text-sm text-ink-muted md:hidden" data-testid="ask-context-compact">
                <span className="min-w-0 flex-1 truncate">{chartName ?? 'General guidance'} · {language}</span>
                <button type="button" onClick={() => setContextOpen(true)} className="underline hover:text-amber-text">Change</button>
                <button type="button" onClick={startNewSession} className="flex items-center gap-1 underline hover:text-amber-text"><RotateCcw className="h-3.5 w-3.5" />New</button>
              </div>
            )}
            <div className={`${messages.length > 0 && !contextOpen ? 'hidden md:flex' : 'flex'} flex-wrap items-center gap-2 text-sm text-ink-muted`}>
              <span>Asking about</span>
              <Select value={selectedKundliId} onValueChange={setSelectedKundliId}>
                <SelectTrigger className="h-10 w-auto min-w-[160px] max-w-[240px]" aria-label="Chart">
                  <SelectValue placeholder="Choose a chart" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No chart — general guidance</SelectItem>
                  {kundlis.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}
                  <SelectItem value={DETAILS_KEY}>Enter birth details…</SelectItem>
                </SelectContent>
              </Select>
              <span>in</span>
              <Select value={language} onValueChange={(v) => { setLanguage(v); localStorage.setItem(LANGUAGE_STORAGE_KEY, v); }}>
                <SelectTrigger className="h-10 w-auto min-w-[120px]" aria-label="Language" data-testid="select-language"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
              {chartId && (
                <Button size="sm" variant="outline" onClick={() => interpretMutation.mutate(chartId)} disabled={interpretMutation.isPending} className="gap-1.5">
                  {interpretMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  Full reading
                </Button>
              )}
              {messages.length > 0 && (
                <Button size="sm" variant="ghost" onClick={startNewSession} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" /> New conversation
                </Button>
              )}
            </div>
            {freeRemaining !== null && freeRemaining > 0 && (
              <p className={`${messages.length > 0 && !contextOpen ? 'hidden md:block' : ''} text-caption text-ink-muted`}>{freeRemaining} free {freeRemaining === 1 ? 'question' : 'questions'} left</p>
            )}
            {detailsMode && (
              <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
                <Input placeholder="Full name" value={birth.name} onChange={(e) => setBirth({ ...birth, name: e.target.value })} data-testid="ai-bd-name" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" aria-label="Date of birth" value={birth.dateOfBirth} onChange={(e) => setBirth({ ...birth, dateOfBirth: e.target.value })} data-testid="ai-bd-date" />
                  <Input type="time" aria-label="Time of birth" value={birth.timeOfBirth} onChange={(e) => setBirth({ ...birth, timeOfBirth: e.target.value })} data-testid="ai-bd-time" />
                </div>
                <PlacesAutocomplete
                  value={birth.placeOfBirth}
                  onChange={(v) => setBirth((b) => ({ ...b, placeOfBirth: v }))}
                  onPlaceSelect={(place) => setBirthCoords({ lat: place.lat, lng: place.lng })}
                  placeholder="City, State, Country"
                />
                {!birthValid && <p className="text-caption text-ink-muted">Enter name, date, time and place to get a personalised reading. The chart is calculated for this conversation and not saved.</p>}
              </div>
            )}
            {kundlis.length === 0 && !detailsMode && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                <p className="flex-1 text-sm">Create your Kundli, or enter birth details above, for answers from your own chart.</p>
                <Link href="/kundli/new"><Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Create Kundli</Button></Link>
              </div>
            )}
            {chartId && running && !running.maha && running.note && (
              <p className="rounded-md border border-line bg-surface px-4 py-3 text-caption text-ink-muted" data-testid="ask-periods-withheld">{running.note}</p>
            )}
          </div>

          {showInterpretation && interpretation && (
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-[22px]" aria-labelledby="ask-reading">
              <div className="flex items-center justify-between gap-2">
                <h2 id="ask-reading" className="m-0 font-display text-subhead font-semibold">Full reading</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowInterpretation(false)}>Close</Button>
              </div>
              {[
                { label: "Overview", value: interpretation.overview },
                { label: "Personality", value: interpretation.personality },
                { label: "Career", value: interpretation.career },
                { label: "Relationships", value: interpretation.relationships },
                { label: "Current periods", value: interpretation.currentPeriods },
                { label: "Dosha analysis", value: interpretation.doshaAnalysis },
              ].map(({ label, value }) => value ? (
                <div key={label}>
                  <h3 className="m-0 font-display text-card-title font-semibold">{label}</h3>
                  <p className="text-base">{typeof value === 'string' ? value : Array.isArray(value) ? (value as any).join(', ') : JSON.stringify(value)}</p>
                </div>
              ) : null)}
            </section>
          )}

          {messages.length === 0 && (
            <section className="flex flex-col gap-4" aria-labelledby="ask-empty">
              <div>
                <h1 id="ask-empty" className="m-0 font-display text-section font-semibold md:text-title">Ask your Kundli <span lang="hi" className="text-lg font-normal text-ink-muted md:text-subhead">प्रश्न</span></h1>
                <p className="text-base text-ink-muted">Every answer is drawn from {chartName ? `${chartName}’s chart` : 'a chart'} and checked against it: house, graha, dasha and rule.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.slice(0, 4).map((q) => (
                  <button key={q} type="button" onClick={() => sendMessage(q)} className="min-h-10 rounded-sm border border-line bg-surface px-3.5 py-2 text-left text-sm hover:bg-highlight">{q}</button>
                ))}
              </div>
            </section>
          )}

          {messages.map((msg, i) => (
            msg.role === "user" ? (
              <p key={msg.id || i} id={`q-${msg.id}`} className="m-0 max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-ink px-4 py-3 text-nav text-on-navy md:max-w-[75%] md:text-base">{msg.content}</p>
            ) : (
              <AnswerCard
                key={msg.id || i}
                content={msg.content}
                evidence={msg.evidence}
                answerSource={msg.answerSource}
                running={msg.evidence ? runningForCard : null}
                chartId={chartId}
                onFollowUp={(q) => sendMessage(q)}
                onTerm={openTerm}
              />
            )
          ))}

          {chatMutation.isPending && (
            <p className="m-0 flex items-center gap-3 rounded-answer border border-line bg-surface px-[22px] py-4 text-base text-ink-muted" role="status">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amber motion-safe:animate-pulse" />
              {THINKING_STEPS[thinkingStep]}
            </p>
          )}
          <div ref={bottomRef} />

          {/* The docked composer (Direction 3): above the mobile tab bar, or above the keyboard while typing. */}
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="sticky bottom-[var(--dock-bottom)] mt-auto flex flex-col gap-1.5 bg-background pb-3 pt-3 md:bottom-0 md:pb-[26px]"
          >
            <div className="flex gap-2 overflow-x-auto pb-1">
              {LIFE_AREA_PROMPTS.map((a) => (
                <button key={a.label} type="button" onClick={() => sendMessage(a.q)} disabled={chatMutation.isPending}
                  className="shrink-0 rounded-sm border border-line px-3 py-1.5 text-sm text-ink hover:bg-highlight disabled:opacity-50"
                  data-testid={`chip-${a.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  {a.label}
                </button>
              ))}
            </div>
            <label htmlFor="ask-input" className="sr-only">{messages.length ? 'Ask a follow-up' : 'Ask a question'}</label>
            <div className="flex items-end gap-2 rounded-lg border-[1.5px] border-ink bg-surface py-1.5 pl-4 pr-1.5">
              <Textarea
                id="ask-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={messages.length ? `Ask a follow-up${chartName ? ` about ${chartName}’s chart` : '…'}` : `Ask anything${chartName ? ` about ${chartName}’s chart` : '…'}`}
                rows={1}
                className="min-h-11 max-h-[120px] flex-1 resize-none border-0 bg-transparent px-0 py-2.5 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button type="submit" disabled={!input.trim() || chatMutation.isPending} aria-label="Ask" className="h-11 w-11 px-0 md:w-auto md:px-[18px]">
                <span className="hidden md:inline">Ask</span>
                <svg className="md:hidden" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
              </Button>
            </div>
            <p className="text-center text-caption text-ink-muted">Checked against your chart · Jyotish describes tendencies, not certainties</p>
          </form>
        </main>

        <aside className="hidden max-w-[340px] flex-[1_1_280px] flex-col gap-8 md:flex" aria-label="About this answer">
          <GlossaryAside terms={asideTerms} active={activeTerm?.term ?? null} />
          {recentQuestions.length > 0 && (
            <section aria-labelledby="ask-recent" className="flex flex-col gap-2">
              <h2 id="ask-recent" className="m-0 font-display text-card-title font-semibold">Recent questions</h2>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
                {recentQuestions.map((m) => (
                  <li key={m.id}><button type="button" onClick={() => document.getElementById(`q-${m.id}`)?.scrollIntoView({ behavior: scrollBehavior() })} className="text-left underline decoration-line underline-offset-2 hover:text-amber-text">{m.content}</button></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      <div className="md:hidden"><GlossarySheet term={activeTerm} onClose={() => setActiveTerm(null)} /></div>
    </div>
  );
}
