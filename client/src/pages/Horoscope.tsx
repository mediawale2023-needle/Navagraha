import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Loader2, Star, ChevronRight, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";

const ZODIAC_SIGNS = [
  { id: "aries",       emoji: "♈", name: "Aries",       dates: "Mar 21 – Apr 19", element: "Fire",  ruler: "Mars",    color: "#EF4444" },
  { id: "taurus",      emoji: "♉", name: "Taurus",      dates: "Apr 20 – May 20", element: "Earth", ruler: "Venus",   color: "#10B981" },
  { id: "gemini",      emoji: "♊", name: "Gemini",      dates: "May 21 – Jun 20", element: "Air",   ruler: "Mercury", color: "#F59E0B" },
  { id: "cancer",      emoji: "♋", name: "Cancer",      dates: "Jun 21 – Jul 22", element: "Water", ruler: "Moon",    color: "#60A5FA" },
  { id: "leo",         emoji: "♌", name: "Leo",         dates: "Jul 23 – Aug 22", element: "Fire",  ruler: "Sun",     color: "#F97316" },
  { id: "virgo",       emoji: "♍", name: "Virgo",       dates: "Aug 23 – Sep 22", element: "Earth", ruler: "Mercury", color: "#84CC16" },
  { id: "libra",       emoji: "♎", name: "Libra",       dates: "Sep 23 – Oct 22", element: "Air",   ruler: "Venus",   color: "#EC4899" },
  { id: "scorpio",     emoji: "♏", name: "Scorpio",     dates: "Oct 23 – Nov 21", element: "Water", ruler: "Mars",    color: "#8B5CF6" },
  { id: "sagittarius", emoji: "♐", name: "Sagittarius", dates: "Nov 22 – Dec 21", element: "Fire",  ruler: "Jupiter", color: "#6366F1" },
  { id: "capricorn",   emoji: "♑", name: "Capricorn",   dates: "Dec 22 – Jan 19", element: "Earth", ruler: "Saturn",  color: "#6B7280" },
  { id: "aquarius",    emoji: "♒", name: "Aquarius",    dates: "Jan 20 – Feb 18", element: "Air",   ruler: "Saturn",  color: "#06B6D4" },
  { id: "pisces",      emoji: "♓", name: "Pisces",      dates: "Feb 19 – Mar 20", element: "Water", ruler: "Jupiter", color: "#A78BFA" },
];

const ELEMENT_BG: Record<string, string> = {
  Fire:  "from-red-900/40 to-orange-900/40",
  Earth: "from-green-900/40 to-emerald-900/40",
  Air:   "from-cyan-900/40 to-sky-900/40",
  Water: "from-blue-900/40 to-indigo-900/40",
};

type Period = "today" | "tomorrow" | "weekly" | "monthly";

interface HoroscopeData {
  sign: string;
  prediction: string;
  lucky?: { color?: string; number?: string; day?: string; time?: string };
  generatedAt?: string;
}

function HoroscopeDetail({ sign }: { sign: (typeof ZODIAC_SIGNS)[0] }) {
  const [period, setPeriod] = useState<Period>("today");

  const { data, isLoading, error } = useQuery<HoroscopeData>({
    queryKey: [`/api/ai/horoscope/${sign.id}`, period],
    queryFn: async () => {
      // Try AI-powered horoscope first; falls back internally to native
      const res = await apiRequest("GET", `/api/ai/horoscope/${sign.id}?type=${period}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000, // cache 30 min
  });

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      {/* Back */}
      <Link href="/horoscope">
        <Button variant="ghost" size="sm" className="mb-4 text-gray-400 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" /> All Signs
        </Button>
      </Link>

      {/* Sign header */}
      <Card className={`mb-6 bg-gradient-to-br ${ELEMENT_BG[sign.element]} border-white/10`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl"
              style={{ background: `${sign.color}22`, border: `2px solid ${sign.color}44` }}
            >
              {sign.emoji}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">{sign.name}</h1>
              <p className="text-gray-400 text-sm">{sign.dates}</p>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs" style={{ borderColor: sign.color + "66", color: sign.color }}>
                  {sign.element}
                </Badge>
                <Badge variant="outline" className="text-xs border-gray-600 text-gray-300">
                  Ruled by {sign.ruler}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period tabs */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="mb-4">
        <TabsList className="grid grid-cols-4 bg-gray-800">
          {(["today", "tomorrow", "weekly", "monthly"] as Period[]).map((p) => (
            <TabsTrigger key={p} value={p} className="capitalize text-xs">
              {p}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Prediction */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      ) : error ? (
        <p className="text-center text-red-400 py-8">Failed to load horoscope. Please try again.</p>
      ) : data ? (
        <Card className="bg-gray-900/60 border-gray-700/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-yellow-400 text-sm font-semibold capitalize">
                {period === "today" ? "Today's" : period === "tomorrow" ? "Tomorrow's" : period === "weekly" ? "This Week's" : "This Month's"}{" "}
                Prediction
              </span>
            </div>
            <p className="text-gray-200 leading-relaxed whitespace-pre-line">{data.prediction}</p>

            {data.lucky && (
              <div className="mt-6 pt-4 border-t border-gray-700">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Lucky Today</p>
                <div className="flex flex-wrap gap-2">
                  {data.lucky.number && (
                    <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">
                      🔢 {data.lucky.number}
                    </Badge>
                  )}
                  {data.lucky.color && (
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">
                      🎨 {data.lucky.color}
                    </Badge>
                  )}
                  {data.lucky.day && (
                    <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                      📅 {data.lucky.day}
                    </Badge>
                  )}
                  {data.lucky.time && (
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                      🕐 {data.lucky.time}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SignGrid({ onSelect }: { onSelect: (sign: (typeof ZODIAC_SIGNS)[0]) => void }) {
  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white font-['Playfair_Display']">Daily Horoscope</h1>
        <p className="text-gray-400 mt-1 text-sm">
          AI-powered Vedic predictions for every zodiac sign
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {ZODIAC_SIGNS.map((sign) => (
          <button
            key={sign.id}
            onClick={() => onSelect(sign)}
            className="group relative rounded-2xl p-4 text-center transition-all hover:scale-105 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${sign.color}15, ${sign.color}08)`,
              border: `1px solid ${sign.color}30`,
            }}
          >
            <div className="text-3xl mb-1">{sign.emoji}</div>
            <div className="text-white font-semibold text-sm">{sign.name}</div>
            <div className="text-gray-500 text-xs mt-0.5">{sign.dates.split(" – ")[0]}</div>
            <div
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: sign.color }}
            >
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-gray-600 mt-6">
        Based on Vedic (sidereal) astrology · Updated daily
      </p>
    </div>
  );
}

export default function Horoscope() {
  const [match, params] = useRoute("/horoscope/:sign");
  const [selectedSign, setSelectedSign] = useState<(typeof ZODIAC_SIGNS)[0] | null>(null);

  // Handle direct URL navigation e.g. /horoscope/aries
  const signFromUrl = match && params?.sign
    ? ZODIAC_SIGNS.find((s) => s.id === params.sign.toLowerCase())
    : null;

  const activeSign = signFromUrl || selectedSign;

  if (activeSign) {
    return <HoroscopeDetail sign={activeSign} />;
  }

  return <SignGrid onSelect={setSelectedSign} />;
}
