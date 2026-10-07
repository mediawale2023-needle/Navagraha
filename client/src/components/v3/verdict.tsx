import type { Confidence, Verdict } from '@shared/v3/evidence';

const VERDICT_STYLE: Record<Verdict, string> = {
  'Exceptional': 'bg-green-600/15 text-green-800 border-green-600/30',
  'Very Strong': 'bg-green-600/10 text-green-700 border-green-600/25',
  'Strong': 'bg-nava-teal/10 text-nava-teal border-nava-teal/25',
  'Mixed': 'bg-amber-500/10 text-amber-700 border-amber-500/25',
  'Challenging': 'bg-orange-600/10 text-orange-700 border-orange-600/25',
  'Very Challenging': 'bg-red-600/10 text-red-700 border-red-600/25',
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${VERDICT_STYLE[verdict]}`}>
      {verdict}
    </span>
  );
}

export function ConfidenceLabel({ confidence }: { confidence: Confidence }) {
  return <span className="text-xs text-muted-foreground">Confidence: <span className="font-medium text-foreground">{confidence}</span></span>;
}
