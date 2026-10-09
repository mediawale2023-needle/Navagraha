import { X, Sparkles, MessageCircle, Check, Minus, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import type { DomainResolution, EvidenceItem, EvidenceSource } from '@shared/v3/evidence';
import type { CanonicalChart } from '@shared/v3/canonical';
import { VerdictBadge, ConfidenceLabel } from '@/components/v3/verdict';

const PROVENANCE_LABEL: Record<EvidenceItem['provenance'], string> = {
  'classical-principle': 'Classical principle',
  'derived-rule': 'Derived Jyotish rule',
  'modern-convention': 'Modern practitioner convention',
};
const ALL_SOURCES: EvidenceSource[] = ['D1', 'D4', 'D7', 'D9', 'D10', 'Shadbala', 'Ashtakavarga', 'Yoga', 'Jaimini', 'Dasha'];
const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** Section heading for an evidence item (e.g. "10th House", "10th Lord", "D10", "Current Dasha"). */
function sectionOf(e: EvidenceItem): string {
  if (e.source === 'Dasha') return 'Current Dasha';
  if (e.source !== 'D1') return e.source === 'Shadbala' ? 'Shadbala (partial)' : e.source;
  if (e.house && /lord/.test(e.factor)) return `${ord(e.house)} Lord`;
  if (e.house) return `${ord(e.house)} House`;
  return 'Significators';
}

function EvidenceRow({ e }: { e: EvidenceItem }) {
  const Icon = e.direction === 'positive' ? Check : e.direction === 'negative' ? X : Minus;
  const tone = e.direction === 'positive' ? 'text-green-700' : e.direction === 'negative' ? 'text-red-700' : 'text-muted-foreground';
  return (
    <li className="flex gap-2 py-1.5">
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${tone}`} />
      <div className="min-w-0">
        <p className="text-sm text-foreground">{e.explanation}</p>
        <p className="text-xs text-muted-foreground">{e.rule} · {PROVENANCE_LABEL[e.provenance]} · {e.strength}</p>
      </div>
    </li>
  );
}

export type InsightSubject =
  | { kind: 'domain'; resolution: DomainResolution }
  | { kind: 'planet'; planet: string; chart: CanonicalChart; evidence: EvidenceItem[] };

interface AIInsightSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: InsightSubject | null;
  onAskQuestion?: (question: string) => void;
}

/**
 * Evidence Sheet — explains WHY Navagraha reached a conclusion, using only
 * deterministic evidence computed from this person's chart.
 */
export function AIInsightSheet({ open, onOpenChange, subject, onAskQuestion }: AIInsightSheetProps) {
  if (!subject) return null;
  const title = subject.kind === 'domain'
    ? `Why ${subject.resolution.label} is ${subject.resolution.verdict}`
    : subject.planet;
  const items = subject.kind === 'domain'
    ? [...subject.resolution.supporting, ...subject.resolution.conflicting, ...subject.resolution.neutral]
    : subject.evidence;
  const sections = Array.from(new Set(items.map(sectionOf)));
  const question = subject.kind === 'domain'
    ? `Why is my ${subject.resolution.label.toLowerCase()} ${subject.resolution.verdict.toLowerCase()}?`
    : `What does ${subject.planet} mean in my chart?`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] border-t border-border bg-card sm:h-[620px]" data-testid="evidence-sheet">
        <SheetHeader className="mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-primary/20">
                <Sparkles className="h-4 w-4 text-amber-text" />
              </div>
              <div>
                <SheetTitle className="text-left uppercase tracking-wide">{title}</SheetTitle>
                <SheetDescription className="text-left">
                  {subject.kind === 'domain' ? 'Every line below is calculated from your chart.' : planetLine(subject)}
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="h-full overflow-y-auto pb-28">
          {subject.kind === 'domain' && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={subject.resolution.verdict} />
              <ConfidenceLabel confidence={subject.resolution.confidence} />
            </div>
          )}

          {sections.map((s) => (
            <div key={s} className="mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-text">{s}</h4>
              <ul>{items.filter((e) => sectionOf(e) === s).map((e) => <EvidenceRow key={e.id} e={e} />)}</ul>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-muted-foreground">No rule-based evidence in this area for this planet.</p>}

          {subject.kind === 'domain' && (
            <>
              <div className="mb-3 rounded-[10px] border border-primary/25 bg-primary/10 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">Conclusion</h4>
                <p className="mt-1 text-sm text-foreground">{subject.resolution.conclusion}</p>
              </div>
              <div className="mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">Confirmed by</h4>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {ALL_SOURCES.filter((src) => items.some((e) => e.source === src) || subject.resolution.excluded.some((e) => e.source === src)).map((src) => {
                    const yes = subject.resolution.confirmedBy.includes(src);
                    const no = subject.resolution.contradictedBy.includes(src);
                    return (
                      <span key={src} className={`rounded-full border px-2 py-0.5 ${yes && !no ? 'border-green-600/30 text-green-700' : no && !yes ? 'border-red-600/30 text-red-700' : 'border-border text-muted-foreground'}`}>
                        {src} {yes && !no ? '✓' : no && !yes ? '✗' : '±'}
                      </span>
                    );
                  })}
                </div>
              </div>
              {subject.resolution.notes.map((n) => (
                <p key={n} className="mb-2 flex gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{n}</p>
              ))}
              {subject.resolution.excluded.length > 0 && (
                <details className="mb-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Not used because the birth time is approximate ({subject.resolution.excluded.length})</summary>
                  <ul className="mt-1 list-disc pl-5">{subject.resolution.excluded.map((e) => <li key={e.id}>{e.explanation}</li>)}</ul>
                </details>
              )}
              {subject.resolution.experimental.length > 0 && (
                <details className="mb-3 text-xs text-muted-foreground" data-testid="experimental-evidence">
                  <summary className="cursor-pointer">Experimental — shown for context, not counted ({subject.resolution.experimental.length})</summary>
                  <ul className="mt-1 opacity-80">{subject.resolution.experimental.map((e) => <EvidenceRow key={e.id} e={e} />)}</ul>
                </details>
              )}
            </>
          )}

          <p className="mb-4 text-xs text-muted-foreground">
            Jyotish is a traditional interpretive system, not a scientific prediction. These readings describe tendencies as the tradition reads them.
          </p>

          {onAskQuestion && (
            <Button variant="outline" size="sm" onClick={() => onAskQuestion(question)} className="min-h-8 bg-card text-xs hover:border-primary/30 hover:bg-primary/10">
              <MessageCircle className="mr-1 h-3.5 w-3.5" />
              {question}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function planetLine(s: Extract<InsightSubject, { kind: 'planet' }>): string {
  const p = s.chart.planets.find((x) => x.name === s.planet);
  if (!p) return '';
  const d = s.chart.strength.dignities.find((x) => x.planet === s.planet);
  const approx = s.chart.birth.timeAccuracy === 'approximate';
  return [
    `${p.sign} ${p.degreeInSign.toFixed(1)}°`,
    approx ? null : `${ord(p.house)} house`,
    `${p.nakshatra.name} pada ${p.nakshatra.pada}`,
    d ? d.dignity : null,
    p.retrograde && p.name !== 'Rahu' && p.name !== 'Ketu' ? 'retrograde' : null,
    d?.combust ? 'combust' : null,
  ].filter(Boolean).join(' · ');
}
