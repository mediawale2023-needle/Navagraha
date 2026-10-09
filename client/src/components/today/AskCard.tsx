import { useState } from 'react';
import { useLocation } from 'wouter';

/** Direction 3's dark "Ask your Kundli" card: a question goes straight to Ask with the chart selected. */
export function AskCard({ chartId, suggestion }: { chartId: string | null; suggestion: string }) {
  const [, navigate] = useLocation();
  const [q, setQ] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ q: q.trim() || suggestion });
    if (chartId) params.set('kundliId', chartId);
    navigate(`/ai-astrologer?${params}`);
  };
  return (
    <form onSubmit={submit} className="hidden flex-col gap-3 rounded-lg bg-ink p-[22px] text-on-navy md:flex" data-testid="today-ask">
      <label htmlFor="today-ask-input" className="font-display text-subhead font-semibold">
        Ask your Kundli <span lang="hi" className="text-base font-normal text-on-navy-3">प्रश्न</span>
      </label>
      <div className="flex gap-2 rounded-md border border-navy-control py-[5px] pl-3.5 pr-[5px] focus-within:border-on-navy-3">
        <input
          id="today-ask-input"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={suggestion}
          className="min-w-0 flex-1 border-0 bg-transparent text-base text-on-navy outline-none placeholder:text-on-navy-3"
        />
        <button type="submit" className="min-h-11 rounded-sm bg-amber px-[18px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-navy">Ask</button>
      </div>
      <p className="text-caption text-on-navy-3">Answers cite your chart: house, graha, dasha and rule.</p>
    </form>
  );
}
