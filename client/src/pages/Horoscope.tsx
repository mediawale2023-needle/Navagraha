import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2 } from "lucide-react";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useTodayChart } from "@/components/today/useToday";
import { SIGN_HI } from "@/lib/jyotishNames";
import { ZODIAC_SIGNS, signById, type ZodiacSign } from "@/lib/zodiac";

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
  const card = "flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-[22px]";
  if (isLoading) {
    return <div className={`${card} flex-row items-center text-sm text-ink-muted`}><Loader2 className="h-4 w-4 animate-spin" /> Preparing your day…</div>;
  }
  if (!data) return null;
  if (!data.hasChart) {
    return (
      <div className={`${card} md:flex-row md:items-center md:justify-between`}>
        <div className="flex flex-col gap-1">
          <p className="font-display text-card-title font-semibold">Your own day, from your chart</p>
          <p className="text-sm text-ink-muted">{data.limitedReason ?? 'Create your Kundli for a daily reading from your own dasha and transits.'}</p>
        </div>
        <Link href="/kundli/new"><Button className="shrink-0">Create Kundli</Button></Link>
      </div>
    );
  }
  const c = data.content;
  if (!c) {
    return data.unavailable ? (
      <div className={`${card} md:flex-row md:items-center md:justify-between`} data-testid="card-daily-unavailable">
        <p className="text-sm text-ink-muted">Today's personal reading isn't ready yet. Ask your Kundli about today in the meantime.</p>
        <Link href="/ai-astrologer?q=What%20does%20today%20hold%20for%20me%3F"><Button variant="outline" className="shrink-0">Ask about today</Button></Link>
      </div>
    ) : null;
  }
  const areas = [["Career", c.career], ["Love", c.love], ["Finance", c.finance]].filter(([, v]) => v);
  return (
    <section className={card} aria-labelledby="daily-h">
      <p className="text-sm text-ink-muted">Your day{data.person ? ` · ${data.person}’s chart` : ""}</p>
      <h2 id="daily-h" className="m-0 font-display text-card-title font-semibold md:text-heading">{c.headline}</h2>
      <p className="max-w-[70ch] text-base">{c.overall}</p>
      {areas.length > 0 && (
        <dl className="m-0 grid gap-3 md:grid-cols-3">
          {areas.map(([label, v]) => (
            <div key={label} className="flex flex-col gap-1 border-t border-hairline pt-2.5">
              <dt className="text-sm font-semibold">{label}</dt>
              <dd className="m-0 text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-sm text-ink-muted">
        {[c.dayLord && `Day of ${c.dayLord}`, c.luckyColor && `colour ${c.luckyColor}`, c.luckyNumber != null && `number ${c.luckyNumber}`].filter(Boolean).join(' · ')}
        {c.dayLord && <span> (from the weekday's lord, the same for everyone today)</span>}
      </p>
      {c.advice && <p className="text-base">{c.advice}</p>}
    </section>
  );
}

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

const PERIOD_LABEL: Record<Period, string> = { today: "Today", tomorrow: "Tomorrow", weekly: "This week", monthly: "This month" };

function HoroscopeDetail({ sign, mine }: { sign: ZodiacSign; mine: string | null }) {
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
      <PageHeader
        title={`${sign.name} · ${sign.englishName}`}
        gloss={SIGN_HI[sign.englishName]}
        sub={mine ? `Your Moon sign, from ${mine}’s chart` : "Gochara counted from this Moon sign (Rashi)"}
        back={{ href: "/horoscope", label: "All signs" }}
      />
      <PageBody className="flex flex-col gap-5">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList aria-label="Period">
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <TabsTrigger key={p} value={p}>{PERIOD_LABEL[p]}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-text" /></div>
        ) : error ? (
          <p className="py-8 text-center text-negative">This reading could not be loaded. Please try again.</p>
        ) : data ? (
          <article className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:p-[22px]">
            <p className="text-sm tabular-nums text-ink-muted">{PERIOD_LABEL[period]} · {data.from === data.to ? data.from : `${data.from} to ${data.to}`}</p>
            <h2 className="m-0 font-display text-card-title font-semibold md:text-heading" data-testid="text-sign-headline">{data.headline}</h2>
            <p className="max-w-[70ch] whitespace-pre-line text-base">{data.prediction}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums" data-testid="table-gochara">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="py-2 pr-3 font-medium">Graha</th>
                    <th className="py-2 pr-3 font-medium">Sign</th>
                    <th className="py-2 pr-3 font-medium">House from Moon</th>
                    <th className="py-2 font-medium">Reading</th>
                  </tr>
                </thead>
                <tbody>
                  {data.highlights.map((h) => (
                    <tr key={h.planet} className="border-b border-hairline last:border-0">
                      <td className="py-2 pr-3 font-semibold">{h.planet}</td>
                      <td className="py-2 pr-3">{h.sign}{h.changesTo ? ` → ${h.changesTo.sign}` : ""}</td>
                      <td className="py-2 pr-3">{h.houseFromMoon}{h.changesTo ? ` → ${h.changesTo.houseFromMoon}` : ""}</td>
                      <td className={`py-2 ${h.favourable ? "text-positive" : "text-negative"}`}>{h.favourable ? "Supportive" : "Demanding"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-caption text-ink-muted">{data.basis}</p>
          </article>
        ) : null}
      </PageBody>
    </div>
  );
}

function SignGrid({ moonSign, today }: { moonSign: string | null; today: ReturnType<typeof useTodayChart> }) {
  const mine = moonSign ? ZODIAC_SIGNS.find((s) => s.englishName === moonSign) : undefined;
  return (
    <div>
      <PageHeader title="Horoscope" gloss="राशिफल" sub="Gochara: today's transits counted from a Moon sign (Rashi), not a Western sun sign" back={{ href: "/", label: "Today" }} />
      <PageBody className="flex flex-col gap-6">
        <PersonalDaily />

        {today.charts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted" data-testid="horoscope-chart">
            {today.charts.length > 1 ? (
              <>
                <span>Moon sign from</span>
                <Select value={today.chart?.id} onValueChange={today.choose}>
                  <SelectTrigger className="h-10 w-auto min-w-[160px]" aria-label="Chart"><SelectValue /></SelectTrigger>
                  <SelectContent>{today.charts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </>
            ) : <span>Moon sign from {today.chart?.name}’s chart</span>}
            {!today.loading && !mine && <span>· {today.limited ? 'this chart needs its birth place recalculated' : 'the birth time leaves the Moon sign uncertain'}, so no sign is marked</span>}
          </div>
        )}

        <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0 sm:grid-cols-4 lg:grid-cols-6" aria-label="Moon signs">
          {ZODIAC_SIGNS.map((s, i) => {
            const isMine = s === mine;
            return (
              <li key={s.id}>
                <Link href={`/horoscope/${s.id}`} aria-current={isMine ? 'true' : undefined}
                  className={`flex h-full flex-col gap-0.5 rounded-md border px-3 py-3 text-ink no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink md:px-4 md:py-4 ${isMine ? 'border-ink bg-highlight' : 'border-line bg-surface hover:bg-sunken'}`}
                  data-testid={`sign-${s.id}`}>
                  <span className="text-caption tabular-nums text-ink-muted">{i + 1}</span>
                  <span lang="hi" className="font-display text-subhead font-semibold leading-tight md:text-heading">{SIGN_HI[s.englishName]}</span>
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span className="text-caption text-ink-muted">{s.englishName}</span>
                  {isMine && <span className="mt-1 self-start rounded-chip bg-amber px-2 py-0.5 text-xs font-semibold">Your Moon sign</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-caption text-ink-muted">Readings are calculated each day from the planets' actual positions; nothing is pre-written.</p>
      </PageBody>
    </div>
  );
}

export default function Horoscope() {
  const [match, params] = useRoute("/horoscope/:sign");
  const { isAuthenticated } = useAuth();
  const today = useTodayChart(isAuthenticated);
  const sign = match && params?.sign ? signById(params.sign) : undefined;
  if (sign) return <HoroscopeDetail sign={sign} mine={today.moonSign === sign.englishName ? today.chart?.name ?? null : null} />;
  return <SignGrid moonSign={today.moonSign} today={today} />;
}
