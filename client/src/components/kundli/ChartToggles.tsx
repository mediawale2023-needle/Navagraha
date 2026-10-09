import type { ChartLabels, ChartStyle } from '@/lib/rashiChart';

const OPTIONS: Array<{ text: string; lang?: string; labels?: ChartLabels; style: ChartStyle }> = [
  { text: 'देवनागरी', lang: 'hi', labels: 'hi', style: 'north' },
  { text: 'English', labels: 'en', style: 'north' },
  { text: 'South Indian', style: 'south' },
];

/** The mockup's chart toggles: Devanagari or English labels on the North Indian chart, or the South Indian layout. */
export function ChartToggles({ labels, style, onChange }: { labels: ChartLabels; style: ChartStyle; onChange: (labels: ChartLabels, style: ChartStyle) => void }) {
  return (
    <div role="group" aria-label="Chart labels" className="flex flex-wrap justify-center gap-2 text-sm">
      {OPTIONS.map((o) => {
        const pressed = o.style === 'south' ? style === 'south' : style === 'north' && labels === o.labels;
        return (
          <button key={o.text} type="button" aria-pressed={pressed} onClick={() => onChange(o.labels ?? labels, o.style)}
            className={`min-h-10 rounded-sm px-3.5 py-2 ${pressed ? 'bg-ink text-on-navy' : 'border border-line text-ink hover:bg-highlight'}`}>
            <span lang={o.lang}>{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}
