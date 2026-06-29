/**
 * Jyotish AI Reading — admin-only professional tool.
 *
 * Save a client's birth data, compute a precise (Swiss Ephemeris) chart, and
 * generate AI narrative readings in three traditions (Parashar / K.N. Rao /
 * Kamakhya Tantric). Includes a live "session query box" for fast answers to
 * mid-call client questions. Streamed responses use a plain fetch() +
 * ReadableStream reader (not EventSource — the backend streams chunked
 * text/plain, see server/routes.ts).
 */
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Plus, Sparkles, Send, User } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type Tradition = 'parashar' | 'kn_rao' | 'kamakhya';

const TRADITION_LABELS: Record<Tradition, string> = {
  parashar: 'Parashar (BPHS)',
  kn_rao: 'K.N. Rao',
  kamakhya: 'Kamakhya Tantric',
};

interface JyotishProfile {
  id: string;
  name: string;
  gender: string | null;
  dateOfBirth: string;
  timeOfBirth: string;
  placeOfBirth: string;
  latitude: string;
  longitude: string;
  notes: string | null;
  createdAt: string;
}

interface JyotishReadingRow {
  id: string;
  profileId: string;
  chartData: any;
  parasharReading: string | null;
  knRaoReading: string | null;
  kamakhyaReading: string | null;
  language: string;
  status: string;
  createdAt: string;
}

/* ─── Streaming helper ──────────────────────────────────────────────────── */

async function streamPost(
  url: string,
  body: unknown,
  onToken: (delta: string) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    let msg = text;
    try { msg = JSON.parse(text)?.message || text; } catch {}
    throw new Error(msg || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}

/* ─── New client profile form ──────────────────────────────────────────── */

function NewProfileForm({ onCreated }: { onCreated: (p: JyotishProfile) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: '', gender: '', dateOfBirth: '', timeOfBirth: '', placeOfBirth: '',
    latitude: '', longitude: '', notes: '',
  });

  const createMutation = useMutation({
    mutationFn: async () => apiRequest<JyotishProfile>('POST', '/api/admin/jyotish/profiles', form),
    onSuccess: (profile) => {
      toast({ title: 'Client profile saved' });
      onCreated(profile);
      setForm({ name: '', gender: '', dateOfBirth: '', timeOfBirth: '', placeOfBirth: '', latitude: '', longitude: '', notes: '' });
    },
    onError: (e: any) => toast({ title: 'Failed to save profile', description: e.message, variant: 'destructive' }),
  });

  const valid = form.name && form.dateOfBirth && form.timeOfBirth && form.placeOfBirth && form.latitude && form.longitude;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">New Client</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Gender</label>
            <Input value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} placeholder="Male / Female / Other" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Date of Birth *</label>
            <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Time of Birth *</label>
            <Input type="time" step={1} value={form.timeOfBirth} onChange={(e) => setForm((f) => ({ ...f, timeOfBirth: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Place of Birth *</label>
          <Input value={form.placeOfBirth} onChange={(e) => setForm((f) => ({ ...f, placeOfBirth: e.target.value }))} placeholder="City, State, Country" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Latitude *</label>
            <Input value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} placeholder="e.g. 28.6139" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Longitude *</label>
            <Input value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} placeholder="e.g. 77.2090" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
        <Button size="sm" className="gap-1.5" disabled={!valid || createMutation.isPending} onClick={() => createMutation.mutate()}>
          <Plus className="w-3.5 h-3.5" /> {createMutation.isPending ? 'Saving…' : 'Save Client'}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─── Chart Summary tab ─────────────────────────────────────────────────── */

function ChartSummaryTab({ chartData }: { chartData: any }) {
  if (!chartData) return <p className="text-sm text-muted-foreground py-8 text-center">Compute a chart to see the summary.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoCard label="Ascendant" value={`${chartData.ascendant.sign} ${chartData.ascendant.degree.toFixed(2)}°`} sub={`${chartData.ascendant.nakshatra} pada ${chartData.ascendant.pada}`} />
        <InfoCard label="Engine" value={chartData.meta.ayanamsa} sub={chartData.meta.engine} />
        <InfoCard label="Birth (UTC)" value={new Date(chartData.meta.birthUTC).toLocaleString()} />
        <InfoCard label="Julian Day" value={chartData.meta.jd.toFixed(4)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Planetary Positions (D1)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground border-b border-border">
              <th className="text-left py-2 pr-3 font-medium">Planet</th>
              <th className="text-left py-2 pr-3 font-medium">Sign</th>
              <th className="text-left py-2 pr-3 font-medium">Deg</th>
              <th className="text-left py-2 pr-3 font-medium">House</th>
              <th className="text-left py-2 pr-3 font-medium">Nakshatra</th>
              <th className="text-left py-2 pr-3 font-medium">Pada</th>
              <th className="text-left py-2 font-medium">Deity</th>
            </tr></thead>
            <tbody>
              {chartData.planets.map((p: any) => (
                <tr key={p.planet} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-medium">{p.planet}{p.isRetrograde ? ' (R)' : ''}</td>
                  <td className="py-2 pr-3">{p.sign}</td>
                  <td className="py-2 pr-3">{p.degree.toFixed(2)}°</td>
                  <td className="py-2 pr-3">{p.house}</td>
                  <td className="py-2 pr-3">{p.nakshatra}</td>
                  <td className="py-2 pr-3">{p.pada}</td>
                  <td className="py-2">{p.deity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Navamsa (D9)</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {chartData.navamsa.planetaryPositions.map((p: any) => (
              <div key={p.planet} className="flex justify-between"><span>{p.planet}</span><span className="text-muted-foreground">{p.sign} (H{p.house})</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Dasamsa (D10)</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {chartData.dasamsa.planetaryPositions.map((p: any) => (
              <div key={p.planet} className="flex justify-between"><span>{p.planet}</span><span className="text-muted-foreground">{p.sign} (H{p.house})</span></div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Jaimini — Char Karakas &amp; Karakamsha</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {chartData.jaimini.charKarakas.map((k: any) => (
              <Badge key={k.karaka} variant="secondary">{k.abbr}: {k.planet}</Badge>
            ))}
          </div>
          <p>Karakamsha: <span className="font-medium">{chartData.jaimini.karakamsha.karakamshaSign}</span> (Atmakaraka {chartData.jaimini.karakamsha.atmakarakaPlanet})</p>
          <p>Ishta Devata: <span className="font-medium">{chartData.jaimini.karakamsha.ishtaDevata}</span></p>
          <p className="text-xs text-muted-foreground">{chartData.jaimini.karakamsha.derivation}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Mahavidya Mapping (Kamakhya lens)</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>Primary (via Atmakaraka {chartData.mahavidya.primary.graha}): <span className="font-medium">{chartData.mahavidya.primary.mahavidya}</span></p>
          <p className="text-xs text-muted-foreground">{chartData.mahavidya.primary.reasoning}</p>
          <p className="mt-2">Lagna ({chartData.mahavidya.lagna.sign}): <span className="font-medium">{chartData.mahavidya.lagna.mahavidya}</span></p>
          <p className="text-xs text-muted-foreground">{chartData.mahavidya.lagna.reasoning}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </CardContent></Card>
  );
}

/* ─── Dashas tab ─────────────────────────────────────────────────────────── */

function DashasTab({ chartData }: { chartData: any }) {
  if (!chartData) return <p className="text-sm text-muted-foreground py-8 text-center">Compute a chart to see dashas.</p>;
  const md = chartData.vimshottariDasha.find((d: any) => d.status === 'current');
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Vimshottari Dasha — full timeline</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {chartData.vimshottariDasha.map((d: any) => (
            <div key={d.planet + d.startDate} className={`border rounded-lg p-2.5 text-sm ${d.status === 'current' ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <div className="flex justify-between items-center">
                <span className="font-medium">{d.planet} Mahadasha {d.status === 'current' && <Badge className="ml-1.5 text-[10px]">current</Badge>}</span>
                <span className="text-xs text-muted-foreground">{d.startDate} – {d.endDate}</span>
              </div>
              {d.status === 'current' && d.antardashas?.length > 0 && (
                <div className="mt-2 pl-3 border-l border-border space-y-1">
                  {d.antardashas.map((a: any) => (
                    <div key={a.planet + a.startDate} className={`text-xs flex justify-between ${a.status === 'current' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      <span>{a.planet} Antardasha {a.status === 'current' && '●'}</span>
                      <span>{a.startDate} – {a.endDate}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Yogini Dasha (cross-check)</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {chartData.yoginiDasha.map((y: any) => (
            <div key={y.yogini + y.startDate} className={`text-sm flex justify-between p-1.5 rounded ${y.status === 'current' ? 'bg-primary/5 font-medium' : ''}`}>
              <span>{y.yogini} ({y.lord})</span>
              <span className="text-xs text-muted-foreground">{y.startDate} – {y.endDate}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Jaimini Chara Dasha</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {chartData.jaimini.charaDasha.map((c: any) => (
            <div key={c.sign + c.startDate} className={`text-sm flex justify-between p-1.5 rounded ${c.status === 'current' ? 'bg-primary/5 font-medium' : ''}`}>
              <span>{c.sign} ({c.years} yrs)</span>
              <span className="text-xs text-muted-foreground">{c.startDate} – {c.endDate}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Yogas & Doshas tab ─────────────────────────────────────────────────── */

function YogasDoshasTab({ chartData }: { chartData: any }) {
  if (!chartData) return <p className="text-sm text-muted-foreground py-8 text-center">Compute a chart to see yogas &amp; doshas.</p>;
  const doshaList = [
    { key: 'mangalDosha', label: 'Mangal Dosha (Kuja Dosha)' },
    { key: 'kaalSarpDosha', label: 'Kaal Sarp Dosha' },
    { key: 'pitruDosha', label: 'Pitru Dosha' },
    { key: 'vishaYoga', label: 'Visha Yoga' },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Yogas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {chartData.yogas.length === 0 && <p className="text-sm text-muted-foreground">None detected.</p>}
          {chartData.yogas.map((y: any, i: number) => (
            <div key={i} className="border border-border rounded-lg p-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{y.name}</span>
                <Badge variant={y.cancelled ? 'outline' : 'default'} className="text-[10px]">
                  {y.cancelled ? 'NOT CONFIRMED (cancelled)' : 'CONFIRMED'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{y.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Doshas</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {doshaList.map((d) => (
            <div key={d.key} className={`border rounded-lg p-2.5 text-sm flex items-center justify-between ${chartData.doshas[d.key] ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'border-border'}`}>
              <span>{d.label}</span>
              <Badge variant={chartData.doshas[d.key] ? 'default' : 'outline'} className="text-[10px]">
                {chartData.doshas[d.key] ? 'PRESENT' : 'ABSENT'}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Remedies tab ───────────────────────────────────────────────────────── */

function RemediesTab({ chartData }: { chartData: any }) {
  if (!chartData) return <p className="text-sm text-muted-foreground py-8 text-center">Compute a chart to see remedies.</p>;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Functional Remedies</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {chartData.remedies.functional.length === 0 && <p className="text-sm text-muted-foreground">None flagged.</p>}
          {chartData.remedies.functional.map((r: any, i: number) => (
            <div key={i} className="border border-border rounded-lg p-2.5 text-sm">
              <p className="font-medium">{r.action} {r.focus}{r.gemstone ? ` — ${r.gemstone}` : ''}</p>
              <p className="text-xs text-muted-foreground mt-1">Mantra "{r.mantra}" ×{r.japaCount} on {r.day}, worship {r.deity}{r.donation ? `, donate ${r.donation}` : ''}.</p>
              <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm text-amber-600">Gemstone Contraindications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {chartData.remedies.gemstoneContraindications.length === 0 && <p className="text-sm text-muted-foreground">None flagged for this chart.</p>}
          {chartData.remedies.gemstoneContraindications.map((c: any, i: number) => (
            <div key={i} className={`border rounded-lg p-2.5 text-sm ${c.severity === 'avoid' ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20'}`}>
              <div className="flex items-center gap-2">
                <Badge className="text-[10px]" variant={c.severity === 'avoid' ? 'destructive' : 'outline'}>{c.severity.toUpperCase()}</Badge>
                <span className="font-medium">{c.gemstone} ({c.planet})</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{c.reason}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Nakshatra-based Remedy (Moon)</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(chartData.remedies.nakshatraBased, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Streamed AI reading tab (shared by Parashar / K.N. Rao / Kamakhya) ─── */

function ReadingTab({
  tradition, reading, profileId, readingId, onReadingUpdate,
}: {
  tradition: Tradition;
  reading: JyotishReadingRow | null;
  profileId: string;
  readingId: string | null;
  onReadingUpdate: (text: string) => void;
}) {
  const { toast } = useToast();
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState('');
  const column = tradition === 'parashar' ? 'parasharReading' : tradition === 'kn_rao' ? 'knRaoReading' : 'kamakhyaReading';
  const saved = reading?.[column as keyof JyotishReadingRow] as string | null;
  const displayText = streaming ? liveText : (saved || '');

  const generate = async () => {
    if (!readingId) return;
    setStreaming(true);
    setLiveText('');
    let acc = '';
    try {
      await streamPost(`/api/admin/jyotish/readings/${readingId}/generate`, { tradition }, (delta) => {
        acc += delta;
        setLiveText(acc);
      });
      onReadingUpdate(acc);
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button size="sm" className="gap-1.5" onClick={generate} disabled={!readingId || streaming}>
        <Sparkles className="w-3.5 h-3.5" /> {streaming ? 'Generating…' : saved ? 'Regenerate' : `Generate ${TRADITION_LABELS[tradition]} Reading`}
      </Button>
      <Card>
        <CardContent className="p-4">
          {!displayText && !streaming && <p className="text-sm text-muted-foreground py-8 text-center">No reading generated yet.</p>}
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{displayText}{streaming && <span className="animate-pulse">▌</span>}</div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Session query box ─────────────────────────────────────────────────── */

function SessionQueryBox({ profileId, readingId, defaultTradition }: { profileId: string; readingId: string | null; defaultTradition: Tradition }) {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [tradition, setTradition] = useState<Tradition>(defaultTradition);
  const [language, setLanguage] = useState('English');
  const [streaming, setStreaming] = useState(false);
  const [answer, setAnswer] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history = [], refetch } = useQuery<any[]>({
    queryKey: [`/api/admin/jyotish/profiles/${profileId}/session-queries`],
  });

  const ask = async () => {
    if (!question.trim()) return;
    setStreaming(true);
    setAnswer('');
    let acc = '';
    try {
      await streamPost('/api/admin/jyotish/session-queries', { profileId, readingId, tradition, question, language }, (delta) => {
        acc += delta;
        setAnswer(acc);
      });
      setQuestion('');
      refetch();
    } catch (e: any) {
      toast({ title: 'Failed to answer', description: e.message, variant: 'destructive' });
    } finally {
      setStreaming(false);
    }
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [answer]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Session Query — quick answer for the client right now</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Select value={tradition} onValueChange={(v) => setTradition(v as Tradition)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TRADITION_LABELS) as Tradition[]).map((t) => <SelectItem key={t} value={t}>{TRADITION_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="English">English</SelectItem>
              <SelectItem value="Hindi">Hindi</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. 'When will my career improve?' — answered live against this chart"
            rows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          />
          <Button size="sm" className="gap-1.5 self-end" onClick={ask} disabled={streaming || !question.trim()}>
            <Send className="w-3.5 h-3.5" /> {streaming ? '…' : 'Ask'}
          </Button>
        </div>
        {(answer || streaming) && (
          <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 text-sm whitespace-pre-wrap">
            {answer}{streaming && <span className="animate-pulse">▌</span>}
          </div>
        )}
        {history.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground">Previous questions this session</p>
            {history.slice(0, 10).map((q) => (
              <div key={q.id} className="text-xs">
                <p className="font-medium">Q: {q.question} <Badge variant="secondary" className="text-[9px] ml-1">{TRADITION_LABELS[q.tradition as Tradition] || q.tradition}</Badge></p>
                {q.answer && <p className="text-muted-foreground mt-0.5">A: {q.answer}</p>}
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </CardContent>
    </Card>
  );
}

/* ─── Profile workspace (everything for one selected client) ────────────── */

function ProfileWorkspace({ profile }: { profile: JyotishProfile }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [chartData, setChartData] = useState<any>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [reading, setReading] = useState<JyotishReadingRow | null>(null);
  const [computing, setComputing] = useState(false);

  const computeChart = async () => {
    setComputing(true);
    try {
      const data = await apiRequest<any>('POST', `/api/admin/jyotish/profiles/${profile.id}/chart`, {});
      setChartData(data.chartData);
    } catch (e: any) {
      toast({ title: 'Chart computation failed', description: e.message, variant: 'destructive' });
    } finally {
      setComputing(false);
    }
  };

  const createReading = useMutation({
    mutationFn: async () => apiRequest<JyotishReadingRow>('POST', `/api/admin/jyotish/profiles/${profile.id}/readings`, { language: 'English' }),
    onSuccess: (r) => {
      setReadingId(r.id);
      setReading(r);
      setChartData(r.chartData);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/jyotish/profiles/${profile.id}/readings`] });
    },
    onError: (e: any) => toast({ title: 'Failed to start reading', description: e.message, variant: 'destructive' }),
  });

  useEffect(() => {
    setChartData(null);
    setReadingId(null);
    setReading(null);
  }, [profile.id]);

  const updateReadingField = (tradition: Tradition, text: string) => {
    if (!reading) return;
    const column = tradition === 'parashar' ? 'parasharReading' : tradition === 'kn_rao' ? 'knRaoReading' : 'kamakhyaReading';
    setReading({ ...reading, [column]: text });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">{profile.name}{profile.gender ? ` · ${profile.gender}` : ''}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(profile.dateOfBirth).toLocaleDateString()} at {profile.timeOfBirth} · {profile.placeOfBirth}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={computeChart} disabled={computing}>
              {computing ? 'Computing…' : 'Compute Chart Only'}
            </Button>
            <Button size="sm" onClick={() => createReading.mutate()} disabled={createReading.isPending}>
              {createReading.isPending ? 'Starting…' : readingId ? 'New Reading Session' : 'Start Reading Session'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="summary">Chart Summary</TabsTrigger>
          <TabsTrigger value="dashas">Dashas</TabsTrigger>
          <TabsTrigger value="yogas">Yogas &amp; Doshas</TabsTrigger>
          <TabsTrigger value="parashar">Parashar Reading</TabsTrigger>
          <TabsTrigger value="kn_rao">K.N. Rao Reading</TabsTrigger>
          <TabsTrigger value="kamakhya">Kamakhya Tantric</TabsTrigger>
          <TabsTrigger value="remedies">Remedies</TabsTrigger>
        </TabsList>

        <TabsContent value="summary"><ChartSummaryTab chartData={chartData} /></TabsContent>
        <TabsContent value="dashas"><DashasTab chartData={chartData} /></TabsContent>
        <TabsContent value="yogas"><YogasDoshasTab chartData={chartData} /></TabsContent>
        <TabsContent value="parashar">
          <ReadingTab tradition="parashar" reading={reading} profileId={profile.id} readingId={readingId} onReadingUpdate={(t) => updateReadingField('parashar', t)} />
        </TabsContent>
        <TabsContent value="kn_rao">
          <ReadingTab tradition="kn_rao" reading={reading} profileId={profile.id} readingId={readingId} onReadingUpdate={(t) => updateReadingField('kn_rao', t)} />
        </TabsContent>
        <TabsContent value="kamakhya">
          <ReadingTab tradition="kamakhya" reading={reading} profileId={profile.id} readingId={readingId} onReadingUpdate={(t) => updateReadingField('kamakhya', t)} />
        </TabsContent>
        <TabsContent value="remedies"><RemediesTab chartData={chartData} /></TabsContent>
      </Tabs>

      <SessionQueryBox profileId={profile.id} readingId={readingId} defaultTradition="parashar" />
    </div>
  );
}

/* ─── Main entry point ──────────────────────────────────────────────────── */

export default function JyotishReading() {
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const { data: profiles = [], isLoading } = useQuery<JyotishProfile[]>({
    queryKey: ['/api/admin/jyotish/profiles'],
  });

  const selected = profiles.find((p) => p.id === selectedProfileId) || null;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Client list / sidebar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Clients</h3>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => { setShowNewForm((s) => !s); setSelectedProfileId(null); }}>
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>
        {showNewForm && (
          <NewProfileForm onCreated={(p) => { setShowNewForm(false); setSelectedProfileId(p.id); }} />
        )}
        <div className="space-y-1.5">
          {profiles.length === 0 && !showNewForm && (
            <p className="text-sm text-muted-foreground py-6 text-center">No clients yet. Click "New" to add one.</p>
          )}
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelectedProfileId(p.id); setShowNewForm(false); }}
              className={`w-full text-left border rounded-lg p-2.5 text-sm transition-colors ${selectedProfileId === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
            >
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{new Date(p.dateOfBirth).toLocaleDateString()} · {p.placeOfBirth}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Workspace */}
      <div>
        {selected ? (
          <ProfileWorkspace profile={selected} />
        ) : (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            Select a client, or create a new one, to begin a reading.
          </div>
        )}
      </div>
    </div>
  );
}
