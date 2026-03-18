import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Send, Sparkles, Stars, ChevronDown, BookOpen, Loader2, ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

export default function AIAstrologer() {
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedKundliId, setSelectedKundliId] = useState<string>("none");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [interpretation, setInterpretation] = useState<AiInterpretation | null>(null);

  const { data: kundlis = [] } = useQuery<Kundli[]>({
    queryKey: ["/api/kundli"],
  });

  const { data: fullKundli } = useQuery<FullKundli>({
    queryKey: [`/api/kundli/${selectedKundliId}`],
    enabled: selectedKundliId !== "none",
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.slice(-20).map(({ role, content }) => ({ role, content }));
      const res = await apiRequest("POST", "/api/ai/chat", {
        message,
        history,
        kundliId: selectedKundliId !== "none" ? selectedKundliId : undefined,
        sessionId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (!sessionId) setSessionId(data.sessionId);
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

  const interpretMutation = useMutation({
    mutationFn: async (kundliId: string) => {
      const res = await apiRequest("POST", "/api/ai/interpret-kundli", { kundliId });
      return res.json();
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
            </div>
          </div>
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
                  </SelectContent>
                </Select>
              </div>
              {selectedKundliId !== "none" && (
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

            {selectedKundli && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedKundli.zodiacSign && (
                  <Badge className="bg-nava-amber/10 text-nava-amber border-0 text-xs">
                    Sun: {selectedKundli.zodiacSign}
                  </Badge>
                )}
                {selectedKundli.moonSign && (
                  <Badge className="bg-nava-teal/10 text-nava-teal border-0 text-xs">
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
                  <Button size="sm" className="bg-nava-amber hover:bg-nava-amber/90 text-white rounded-full gap-1 shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                    Create Kundli
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Dasha Timeline — shown when a kundli with dasha data is selected */}
        {selectedKundliId !== "none" && (currentMahadasha || currentAntardasha) && (
          <Card className="mb-4 bg-card border-border/50 shadow-sm">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-nava-teal uppercase tracking-wider mb-3">
                Current Planetary Periods
              </h3>
              <div className="space-y-2">
                {currentMahadasha && (
                  <div className="flex items-center justify-between bg-nava-teal/5 border border-nava-teal/20 rounded-xl px-4 py-2.5">
                    <div>
                      <span className="text-[10px] font-semibold text-nava-teal uppercase tracking-wider">Mahadasha</span>
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
          <Card className="mb-4 bg-nava-amber/5 border-nava-amber/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-nava-amber">
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
                      <h3 className="text-xs font-semibold text-nava-teal uppercase tracking-wider mb-1">
                        {label}
                      </h3>
                      <p className="text-foreground text-sm leading-relaxed">{value}</p>
                    </div>
                  ) : null
                )}

                {interpretation.luckyFactors && (
                  <div>
                    <h3 className="text-xs font-semibold text-nava-teal uppercase tracking-wider mb-2">
                      Lucky Factors
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-nava-amber/10 text-nava-amber border-0">
                        Number: {interpretation.luckyFactors.number}
                      </Badge>
                      <Badge className="bg-nava-teal/10 text-nava-teal border-0">
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
              <div className="w-16 h-16 rounded-full bg-nava-amber/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-nava-amber" />
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
                <div className="w-8 h-8 rounded-full bg-nava-amber flex items-center justify-center flex-shrink-0 mt-1">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-nava-teal text-white ml-8"
                    : "bg-card border border-border/50 text-foreground"
                }`}
              >
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-nava-teal flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-xs font-bold text-white">U</span>
                </div>
              )}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-nava-amber flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white animate-pulse" />
              </div>
              <div className="bg-card border border-border/50 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-nava-amber rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-nava-amber rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-nava-amber rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm pt-3 pb-safe">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your stars, destiny, remedies..."
              rows={1}
              className="flex-1 bg-card border-border resize-none min-h-[48px] max-h-[120px] rounded-xl"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || chatMutation.isPending}
              className="bg-nava-teal hover:bg-nava-teal/90 text-white h-12 px-4 rounded-xl"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-2 pb-20">
            AI interpretations are for guidance only. Always consult a qualified Jyotish for major decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
