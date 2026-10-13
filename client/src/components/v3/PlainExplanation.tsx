import type { AreaExplanation, ChartExplanations, PlanetExplanation } from '@shared/v3/explanations';

/**
 * Plain-language explanations (USER_FACING_REASONING_V1). Rendered only when the server sends them;
 * every line restates the chart's existing evidence and verdicts.
 */
export function AreaPlainExplanation({ explanation }: { explanation: AreaExplanation }) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-md border border-line bg-surface p-3" data-testid="area-plain-explanation">
      <h4 className="text-caption font-semibold uppercase tracking-wide text-ink">In plain words</h4>
      <p className="text-sm text-ink">{explanation.summary}</p>
      {explanation.supports.length > 0 && (
        <div>
          <p className="text-caption font-semibold text-ink">What supports it</p>
          <ul className="list-disc pl-5 text-sm text-ink">{explanation.supports.map((s) => <li key={s.evidenceId}>{s.text}</li>)}</ul>
        </div>
      )}
      {explanation.challenges.length > 0 && (
        <div>
          <p className="text-caption font-semibold text-ink">What challenges it</p>
          <ul className="list-disc pl-5 text-sm text-ink">{explanation.challenges.map((s) => <li key={s.evidenceId}>{s.text}</li>)}</ul>
        </div>
      )}
      {explanation.period && <p className="text-sm text-ink"><span className="font-semibold">Current period: </span>{explanation.period}</p>}
      {explanation.yogas.map((y) => <p key={y} className="text-sm text-ink">{y}</p>)}
      {explanation.uncertainty.map((u) => <p key={u} className="text-caption text-ink-muted">{u}</p>)}
    </div>
  );
}

export function PlanetPlainExplanation({ explanation }: { explanation: PlanetExplanation }) {
  return (
    <div className="mb-4 flex flex-col gap-1.5 rounded-md border border-line bg-surface p-3" data-testid="planet-plain-explanation">
      <h4 className="text-caption font-semibold uppercase tracking-wide text-ink">In plain words</h4>
      <p className="text-sm text-ink">{explanation.summary}</p>
      <ul className="list-disc pl-5 text-sm text-ink">{explanation.points.map((p) => <li key={p}>{p}</li>)}</ul>
      {explanation.uncertainty.map((u) => <p key={u} className="text-caption text-ink-muted">{u}</p>)}
    </div>
  );
}

/** The running periods and the chart's yogas, for the Kundli overview. */
export function ChartReadingNotes({ explanations }: { explanations: ChartExplanations }) {
  if (!explanations.periods.length && !explanations.yogas.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-[22px]" aria-labelledby="kundli-reading-notes" data-testid="chart-reading-notes">
      <h2 id="kundli-reading-notes" className="m-0 font-display text-subhead font-semibold">Your periods and yogas, explained</h2>
      {explanations.periods.map((p) => <p key={p.id} className="text-sm text-ink">{p.text}</p>)}
      {explanations.yogas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {explanations.yogas.map((y) => (
            <li key={y.id} className="text-sm text-ink">
              <span className="font-semibold">{y.name}. </span>{y.formation} {y.contribution} {y.effectiveness}{y.period ? ` ${y.period}` : ''}
            </li>
          ))}
        </ul>
      )}
      {explanations.disclosures.map((d) => <p key={d} className="text-caption text-ink-muted">{d}</p>)}
    </section>
  );
}
