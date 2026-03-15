import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2, Star, ChevronRight, ArrowLeft, Heart, TrendingUp, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";

const ZODIAC_SIGNS = [
  { id: "aries", emoji: "🐏", name: "Mesh", englishName: "Aries", dates: "Mar 21 - Apr 19", bg: "bg-nava-amber" },
  { id: "taurus", emoji: "🐂", name: "Vrishabh", englishName: "Taurus", dates: "Apr 20 - May 20", bg: "bg-nava-teal" },
  { id: "gemini", emoji: "👥", name: "Mithun", englishName: "Gemini", dates: "May 21 - Jun 20", bg: "bg-nava-magenta" },
  { id: "cancer", emoji: "🦀", name: "Kark", englishName: "Cancer", dates: "Jun 21 - Jul 22", bg: "bg-nava-aqua" },
  { id: "leo", emoji: "🦁", name: "Simha", englishName: "Leo", dates: "Jul 23 - Aug 22", bg: "bg-nava-amber" },
  { id: "virgo", emoji: "👩", name: "Kanya", englishName: "Virgo", dates: "Aug 23 - Sep 22", bg: "bg-nava-teal" },
  { id: "libra", emoji: "⚖️", name: "Tula", englishName: "Libra", dates: "Sep 23 - Oct 22", bg: "bg-nava-magenta" },
  { id: "scorpio", emoji: "🦂", name: "Vrishchik", englishName: "Scorpio", dates: "Oct 23 - Nov 21", bg: "bg-nava-aqua" },
  { id: "sagittarius", emoji: "🏹", name: "Dhanu", englishName: "Sagittarius", dates: "Nov 22 - Dec 21", bg: "bg-nava-teal" },
  { id: "capricorn", emoji: "🐐", name: "Makar", englishName: "Capricorn", dates: "Dec 22 - Jan 19", bg: "bg-nava-amber" },
  { id: "aquarius", emoji: "🏺", name: "Kumbh", englishName: "Aquarius", dates: "Jan 20 - Feb 18", bg: "bg-nava-magenta" },
  { id: "pisces", emoji: "🐟", name: "Meen", englishName: "Pisces", dates: "Feb 19 - Mar 20", bg: "bg-nava-aqua" },
];

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
      const res = await apiRequest("GET", `/api/ai/horoscope/${sign.id}?type=${period}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-background px-4 py-6 max-w-lg mx-auto pb-24">
      {/* Back */}
      <Link href="/horoscope">
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground -ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" /> All Signs
        </Button>
      </Link>

      {/* Sign header */}
      <div className={`rounded-3xl p-6 mb-6 ${sign.bg}`}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">
            {sign.emoji}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{sign.name}</h1>
            <p className="text-white/80 text-sm">{sign.englishName} | {sign.dates}</p>
          </div>
        </div>
      </div>

      {/* Period tabs */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="mb-4">
        <TabsList className="grid grid-cols-4 bg-card border border-border">
          {(["today", "tomorrow", "weekly", "monthly"] as Period[]).map((p) => (
            <TabsTrigger key={p} value={p} className="capitalize text-xs data-[state=active]:bg-nava-teal data-[state=active]:text-white">
              {p}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Prediction */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-nava-teal" />
        </div>
      ) : error ? (
        <p className="text-center text-destructive py-8">Failed to load horoscope. Please try again.</p>
      ) : data ? (
        <Card className="bg-card border-border/50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 fill-nava-amber text-nava-amber" />
              <span className="text-nava-amber text-sm font-semibold capitalize">
                {period === "today" ? "Today's" : period === "tomorrow" ? "Tomorrow's" : period === "weekly" ? "This Week's" : "This Month's"}{" "}
                Prediction
              </span>
            </div>
            <p className="text-foreground leading-relaxed whitespace-pre-line">{data.prediction}</p>

            {/* Insights Grid */}
            <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-border">
              {[
                { icon: Heart, label: 'Love', stars: 4, color: 'text-nava-magenta' },
                { icon: TrendingUp, label: 'Career', stars: 3, color: 'text-nava-amber' },
                { icon: Activity, label: 'Health', stars: 4, color: 'text-nava-teal' },
              ].map(({ icon: Icon, label, stars, color }) => (
                <div key={label} className="bg-background rounded-xl p-3 text-center">
                  <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                  <p className="text-[10px] font-semibold text-muted-foreground mb-2">{label}</p>
                  <div className="flex gap-0.5 justify-center">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-2.5 h-2.5 ${i < stars ? 'fill-nava-amber text-nava-amber' : 'text-border'}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {data.lucky && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Lucky Today</p>
                <div className="flex flex-wrap gap-2">
                  {data.lucky.number && (
                    <Badge className="bg-nava-amber/20 text-nava-amber border-nava-amber/30 text-xs">
                      Number: {data.lucky.number}
                    </Badge>
                  )}
                  {data.lucky.color && (
                    <Badge className="bg-nava-teal/20 text-nava-teal border-nava-teal/30 text-xs">
                      Color: {data.lucky.color}
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
    <div className="min-h-screen bg-background px-4 py-6 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/">
          <button className="p-1.5 rounded-lg hover:bg-muted">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Daily Horoscope</h1>
          <p className="text-sm text-muted-foreground">Know your Rashi predictions</p>
        </div>
      </div>

      {/* Zodiac Grid - 4 columns */}
      <div className="grid grid-cols-4 gap-3">
        {ZODIAC_SIGNS.map((sign) => (
          <button
            key={sign.id}
            onClick={() => onSelect(sign)}
            className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${sign.bg} hover:scale-105 hover:shadow-lg relative group`}
          >
            <span className="text-2xl sm:text-3xl drop-shadow-sm">{sign.emoji}</span>
            <span className="text-[10px] sm:text-xs font-bold text-white">{sign.name}</span>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-3 h-3 text-white" />
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Based on Vedic astrology - Updated daily
      </p>
    </div>
  );
}

export default function Horoscope() {
  const [match, params] = useRoute("/horoscope/:sign");
  const [selectedSign, setSelectedSign] = useState<(typeof ZODIAC_SIGNS)[0] | null>(null);

  const signFromUrl = match && params?.sign
    ? ZODIAC_SIGNS.find((s) => s.id === params.sign.toLowerCase())
    : null;

  const activeSign = signFromUrl || selectedSign;

  if (activeSign) {
    return <HoroscopeDetail sign={activeSign} />;
  }

  return <SignGrid onSelect={setSelectedSign} />;
}
