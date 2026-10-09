import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2, Star, ChevronRight, ArrowLeft, Heart, TrendingUp } from "lucide-react";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface PersonalDailyData {
  hasChart: boolean;
  limitedReason?: string;
  date?: string;
  person?: string;
  unavailable?: boolean;
  content?: {
    headline: string;
    overall: string;
    career: string;
    love: string;
    finance: string;
    advice: string;
    dayLord?: string;
    luckyColor: string;
    luckyNumber: number;
  } | null;
}

function PersonalDaily() {
  const { isAuthenticated } = useAuth();
  const language = typeof window !== "undefined" ? localStorage.getItem("ai_astrologer_language") || "English" : "English";
  const { data, isLoading } = useQuery<PersonalDailyData>({
    queryKey: ["/api/horoscope/personal", language],
    queryFn: () => apiRequest("GET", `/api/horoscope/personal?language=${encodeURIComponent(language)}`),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) return null;
  if (isLoading) {
    return (
      <Card className="yantra-card mb-6 border-primary/25">
        <CardContent className="p-5 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Preparing your personalised day…
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;
  if (!data.hasChart) {
    return (
      <Card className="mb-6 border-primary/25 bg-primary/10">
        <CardContent className="p-5 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground">Get your personalised daily horoscope</p>
            <p className="text-sm text-muted-foreground">{data.limitedReason ?? 'Generate your birth chart to unlock guidance tailored to you.'}</p>
          </div>
          <Link href="/kundli/new">
            <Button className="shrink-0 rounded-[9px] bg-primary text-primary-foreground hover:bg-primary/90">Create Kundli</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }
  const c = data.content;
  if (!c) {
    return data.unavailable ? (
      <Card className="yantra-card mb-6 border-primary/25" data-testid="card-daily-unavailable">
        <CardContent className="p-5 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Today's personal card isn't ready yet. Ask your Kundli anything about today in the meantime.</p>
          <Link href="/ai-astrologer?q=What%20does%20today%20hold%20for%20me%3F">
            <Button variant="outline" className="shrink-0 rounded-[9px]">Ask about today</Button>
          </Link>
        </CardContent>
      </Card>
    ) : null;
  }
  const areas = [
    { Icon: TrendingUp, label: "Career", v: c.career },
    { Icon: Heart, label: "Love", v: c.love },
    { Icon: Star, label: "Finance", v: c.finance },
  ];
  return (
    <Card className="yantra-card mb-6 border-primary/25">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="yantra-eyebrow text-amber-text">
            Your Day{data.person ? ` · ${data.person}` : ""}
          </span>

        </div>
        <h2 className="text-lg font-bold text-foreground">{c.headline}</h2>
        <p className="text-sm text-foreground/90 mt-1 leading-relaxed">{c.overall}</p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {areas.map(({ Icon, label, v }) =>
            v ? (
              <div key={label} className="bg-muted/40 rounded-xl p-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-text">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed">{v}</p>
              </div>
            ) : null
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {c.dayLord && <Badge className="bg-muted text-muted-foreground border-0" title="The weekday's ruling planet; its colour and number are the same for everyone today.">Day of {c.dayLord}</Badge>}
          {c.luckyColor && <Badge className="bg-primary/15 text-amber-text border-0">Colour: {c.luckyColor}</Badge>}
          {c.luckyNumber != null && <Badge className="bg-highlight text-amber-text border-0">Number: {c.luckyNumber}</Badge>}
        </div>
        {c.advice && <p className="text-sm italic text-muted-foreground mt-3">Today's tip — {c.advice}</p>}
      </CardContent>
    </Card>
  );
}

const ZODIAC_SIGNS = [
  { id: "aries", emoji: "🐏", name: "Mesh", englishName: "Aries", bg: "bg-ink" },
  { id: "taurus", emoji: "🐂", name: "Vrishabh", englishName: "Taurus", bg: "bg-ink" },
  { id: "gemini", emoji: "👥", name: "Mithun", englishName: "Gemini", bg: "bg-ink" },
  { id: "cancer", emoji: "🦀", name: "Kark", englishName: "Cancer", bg: "bg-ink" },
  { id: "leo", emoji: "🦁", name: "Simha", englishName: "Leo", bg: "bg-ink" },
  { id: "virgo", emoji: "👩", name: "Kanya", englishName: "Virgo", bg: "bg-ink" },
  { id: "libra", emoji: "⚖️", name: "Tula", englishName: "Libra", bg: "bg-ink" },
  { id: "scorpio", emoji: "🦂", name: "Vrishchik", englishName: "Scorpio", bg: "bg-ink" },
  { id: "sagittarius", emoji: "🏹", name: "Dhanu", englishName: "Sagittarius", bg: "bg-ink" },
  { id: "capricorn", emoji: "🐐", name: "Makar", englishName: "Capricorn", bg: "bg-ink" },
  { id: "aquarius", emoji: "🏺", name: "Kumbh", englishName: "Aquarius", bg: "bg-ink" },
  { id: "pisces", emoji: "🐟", name: "Meen", englishName: "Pisces", bg: "bg-ink" },
];

type Period = "today" | "tomorrow" | "weekly" | "monthly";

interface HoroscopeData {
  sign: string;
  rashi: string;
  period: Period;
  from: string;
  to: string;
  headline: string;
  prediction: string;
  highlights: Array<{ planet: string; sign: string; houseFromMoon: number; favourable: boolean; theme: string; changesTo?: { sign: string; houseFromMoon: number; favourable: boolean; on: string } }>;
  sadeSati: { active: boolean; phase: string | null };
  basis: string;
}

const viewerTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
};

function HoroscopeDetail({ sign }: { sign: (typeof ZODIAC_SIGNS)[0] }) {
  const [period, setPeriod] = useState<Period>("today");

  const tz = viewerTimeZone();
  const url = `/api/horoscope/${sign.id}?period=${period}${tz ? `&tz=${encodeURIComponent(tz)}` : ""}`;
  const { data, isLoading, error } = useQuery<HoroscopeData>({
    queryKey: [url],
    queryFn: () => apiRequest<HoroscopeData>("GET", url),
    staleTime: 30 * 60 * 1000,
  });

  return (
    <div>
      <PageHeader title={sign.name} sub={`${sign.englishName} Moon sign (Rashi)`} back={{ href: "/horoscope", label: "All signs" }} />
      <PageBody>

      {/* Sign header */}
        <div className={`rounded-[12px] border border-[var(--primary-border)] p-6 mb-6 ${sign.bg}`}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">
            {sign.emoji}
          </div>
          <div>
            <p className="font-display text-3xl text-on-navy">{sign.name}</p>
            <p className="text-on-navy-2 text-sm">{sign.englishName} Moon sign (Rashi)</p>
          </div>
        </div>
      </div>

      {/* Period tabs */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="mb-4">
        <TabsList>
          {(["today", "tomorrow", "weekly", "monthly"] as Period[]).map((p) => (
            <TabsTrigger key={p} value={p} className="capitalize">
              {p}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Prediction */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-text" />
        </div>
      ) : error ? (
        <p className="text-center text-destructive py-8">Failed to load horoscope. Please try again.</p>
      ) : data ? (
        <Card className="yantra-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 fill-amber text-amber" />
              <span className="text-amber-text text-sm font-semibold capitalize">
                {period === "today" ? "Today's" : period === "tomorrow" ? "Tomorrow's" : period === "weekly" ? "This Week's" : "This Month's"}{" "}
                Prediction
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{data.from === data.to ? data.from : `${data.from} to ${data.to}`}</p>
            <h2 className="font-display text-lg text-foreground mb-3" data-testid="text-sign-headline">{data.headline}</h2>
            <p className="text-foreground leading-relaxed whitespace-pre-line">{data.prediction}</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-gochara">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Planet</th>
                    <th className="py-1.5 pr-2 font-medium">Sign</th>
                    <th className="py-1.5 pr-2 font-medium">From Moon</th>
                    <th className="py-1.5 font-medium">Reading</th>
                  </tr>
                </thead>
                <tbody>
                  {data.highlights.map((h) => (
                    <tr key={h.planet} className="border-b border-border/40">
                      <td className="py-1.5 pr-2 font-medium text-foreground">{h.planet}</td>
                      <td className="py-1.5 pr-2">{h.sign}{h.changesTo ? ` → ${h.changesTo.sign}` : ""}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{h.houseFromMoon}{h.changesTo ? ` → ${h.changesTo.houseFromMoon}` : ""}</td>
                      <td className="py-1.5">{h.favourable ? "Supportive" : "Demanding"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{data.basis}</p>
          </CardContent>
        </Card>
      ) : null}
      </PageBody>
    </div>
  );
}

function SignGrid({ onSelect }: { onSelect: (sign: (typeof ZODIAC_SIGNS)[0]) => void }) {
  return (
    <div>
      <PageHeader title="Horoscope" gloss="राशिफल" sub="Pick your Moon sign (Rashi), not your Western sun sign" back={{ href: "/", label: "Today" }} />
      <PageBody>

      {/* Personalised daily horoscope (logged-in users) */}
      <PersonalDaily />

      {/* Zodiac Grid - 4 columns on mobile, 6 on desktop */}
      <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
        {ZODIAC_SIGNS.map((sign) => (
          <button
            key={sign.id}
            onClick={() => onSelect(sign)}
            className={`relative aspect-square rounded-[10px] flex flex-col items-center justify-center gap-1 transition-all ${sign.bg} hover:bg-ink/90 group`}
          >
            <span className="text-2xl sm:text-3xl drop-shadow-sm">{sign.emoji}</span>
            <span className="text-xs sm:text-xs font-bold text-on-navy">{sign.name}</span>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-3 h-3 text-on-navy" />
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Based on Vedic astrology - Updated daily
      </p>
      </PageBody>
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
