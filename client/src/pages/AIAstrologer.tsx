import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, Stars, ChevronDown, BookOpen, Loader2 } from "lucide-react";
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
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedKundliId, setSelectedKundliId] = useState<string>("none");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [interpretation, setInterpretation] = useState<AiInterpretation | null>(null);

  // Fetch user's kundlis for the chart selector
  const { data: kundlis = [] } = useQuery<Kundli[]>({
    queryKey: ["/api/kundli"],
  });

  // Scroll to bottom whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Chat mutation
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

  // Interpret kundli mutation
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

  return (
    <div className="min-h-screen flex flex-col max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-full px-4 py-1.5 mb-3">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-purple-300 text-sm font-medium">Powered by Claude AI</span>
        </div>
        <h1 className="text-3xl font-bold text-white font-['Playfair_Display']">
          Jyotish AI Astrologer
        </h1>
        <p className="text-gray-400 mt-1 text-sm">
          Ancient Vedic wisdom meets modern AI · Chat with your birth chart
        </p>
      </div>

      {/* Kundli Selector */}
      <Card className="mb-4 bg-gray-900/60 border-purple-500/20">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Stars className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <Select value={selectedKundliId} onValueChange={setSelectedKundliId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select a birth chart (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="none">No chart — general guidance</SelectItem>
                  {kundlis.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name} · {k.zodiacSign} Sun · {k.moonSign} Moon
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedKundliId !== "none" && (
              <Button
                size="sm"
                variant="outline"
                className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
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
              <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-300">
                ☀ {selectedKundli.zodiacSign}
              </Badge>
              <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-300">
                ☽ {selectedKundli.moonSign}
              </Badge>
              <Badge variant="outline" className="text-xs border-green-500/30 text-green-300">
                ↑ {selectedKundli.ascendant}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Interpretation Panel */}
      {showInterpretation && interpretation && (
        <Card className="mb-4 bg-gradient-to-br from-purple-900/40 to-blue-900/40 border-purple-500/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-yellow-400 font-['Playfair_Display']">
                ✨ Your Complete Vedic Reading
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowInterpretation(false)}
                className="text-gray-400"
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
                { label: "Current Dasha", value: interpretation.currentDasha },
                { label: "Dosha Analysis", value: interpretation.doshaAnalysis },
                { label: "Remedies", value: interpretation.remedies },
              ].map(({ label, value }) =>
                value ? (
                  <div key={label}>
                    <h3 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-1">
                      {label}
                    </h3>
                    <p className="text-gray-300 text-sm leading-relaxed">{value}</p>
                  </div>
                ) : null
              )}

              {interpretation.luckyFactors && (
                <div>
                  <h3 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-2">
                    Lucky Factors
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                      🔢 {interpretation.luckyFactors.number}
                    </Badge>
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                      🎨 {interpretation.luckyFactors.color}
                    </Badge>
                    <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                      📅 {interpretation.luckyFactors.day}
                    </Badge>
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                      💎 {interpretation.luckyFactors.gemstone}
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
            <div className="text-5xl mb-4">🔮</div>
            <p className="text-gray-400 mb-6">
              Ask Jyotish AI anything about Vedic astrology,
              <br />
              or select a birth chart for personalised insights.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs text-gray-300 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 rounded-lg p-3 transition-colors"
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
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0 mt-1">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/20 text-white ml-8"
                  : "bg-gray-800/80 border border-gray-700/50 text-gray-200"
              }`}
            >
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-xs font-bold text-black">U</span>
              </div>
            )}
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div className="bg-gray-800/80 border border-gray-700/50 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-gray-950/80 backdrop-blur-sm pt-3 pb-1">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your stars, destiny, remedies…"
            rows={1}
            className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none min-h-[48px] max-h-[120px]"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || chatMutation.isPending}
            className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-semibold h-12 px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-center text-[10px] text-gray-600 mt-2">
          AI interpretations are for guidance only. Always consult a qualified Jyotish for major decisions.
        </p>
      </div>
    </div>
  );
}
