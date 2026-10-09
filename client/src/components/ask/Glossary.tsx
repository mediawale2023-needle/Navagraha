import type { GlossaryEntry } from '@/lib/glossary';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/** Desktop aside: "Terms in this answer" (Direction 3). */
export function GlossaryAside({ terms, active }: { terms: GlossaryEntry[]; active: string | null }) {
  if (!terms.length) return null;
  return (
    <section aria-labelledby="ask-gloss" className="flex flex-col gap-3">
      <h2 id="ask-gloss" className="m-0 font-display text-card-title font-semibold">Terms in this answer</h2>
      <dl className="m-0 flex flex-col gap-3 text-sm">
        {terms.map((t, i) => (
          <div key={t.term} id={`term-${t.term}`} className={`${i < terms.length - 1 ? 'border-b border-line pb-2.5' : ''} ${active === t.term ? 'rounded-sm bg-highlight px-2 -mx-2 pt-1' : ''}`}>
            <dt className="font-display text-[17px] font-semibold">{t.term} <span lang="hi" className="text-ink-muted">{t.hi}</span></dt>
            <dd className="m-0">{t.definition}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Mobile: one term's definition in a bottom sheet, as in the Ask mockup. */
export function GlossarySheet({ term, onClose }: { term: GlossaryEntry | null; onClose: () => void }) {
  return (
    <Sheet open={!!term} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="flex flex-col gap-1.5 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-2.5">
        <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-line" />
        {term && (
          <>
            <SheetTitle className="m-0 font-display text-card-title font-semibold">{term.term} <span lang="hi" className="text-base text-ink-muted">{term.hi}</span></SheetTitle>
            <p className="text-nav">{term.definition}</p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
