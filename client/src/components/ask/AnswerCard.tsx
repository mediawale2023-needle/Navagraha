import { Children, isValidElement, cloneElement, type ReactNode } from 'react';
import { Link } from 'wouter';
import ReactMarkdown from 'react-markdown';
import { DOMAIN_BHAVA, GLOSSARY, SOURCE_LABEL, termsIn, type GlossaryEntry } from '@/lib/glossary';
import { grahaSanskrit } from '@/lib/jyotishNames';
import { monthYear } from '@/lib/runningPeriods';

export interface EvidenceItemSummary { direction: 'positive' | 'negative' | 'neutral'; factor: string; explanation: string; source: string }
export interface EvidenceSummary {
  domains: Array<{ domain: string; label: string; verdict: string; confidence: string; supporting: number; conflicting: number; items?: EvidenceItemSummary[] }>;
  disclosure?: string | null;
}
export interface Running { maha?: { lord: string; end: string }; antar?: { lord: string; end: string }; showDates: boolean }

interface Props {
  content: string;
  evidence?: EvidenceSummary | null;
  answerSource?: 'llm' | 'deterministic';
  running: Running | null;
  chartId: string | null;
  onFollowUp: (question: string) => void;
  onTerm: (term: GlossaryEntry) => void;
}

/** Wraps glossary terms in plain text with buttons that open their definition (dotted underline, as in the mockup). */
function linkTerms(node: ReactNode, onTerm: (t: GlossaryEntry) => void): ReactNode {
  return Children.map(node, (child) => {
    if (typeof child === 'string') {
      const parts: ReactNode[] = [];
      let rest = child;
      let guard = 0;
      while (rest && guard++ < 20) {
        let best: { g: GlossaryEntry; i: number; len: number } | null = null;
        for (const g of GLOSSARY) {
          const m = rest.match(g.match);
          if (m && m.index !== undefined && (!best || m.index < best.i)) best = { g, i: m.index, len: m[0].length };
        }
        if (!best) break;
        if (best.i > 0) parts.push(rest.slice(0, best.i));
        const word = rest.slice(best.i, best.i + best.len);
        const g = best.g;
        parts.push(<button key={parts.length} type="button" onClick={() => onTerm(g)} className="underline decoration-dotted underline-offset-2 hover:text-amber-text">{word}</button>);
        rest = rest.slice(best.i + best.len);
      }
      if (rest) parts.push(rest);
      return parts;
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return cloneElement(child, undefined, linkTerms(child.props.children, onTerm));
    }
    return child;
  });
}

const VERDICT_TEXT: Record<string, string> = { 'Insufficient evidence': 'text-ink-muted' };

/** Direction 3 answer card: verdict header, the answer, its pramāṇa, the running dasha and follow-ups. */
export function AnswerCard({ content, evidence, answerSource, running, chartId, onFollowUp, onTerm }: Props) {
  const d = evidence?.domains?.[0];
  const others = evidence?.domains?.slice(1) ?? [];
  const terms = termsIn([content, ...(d?.items ?? []).map((i) => `${i.factor} ${i.explanation}`)].join(' '));
  const md = (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="m-0">{linkTerms(children, onTerm)}</p>,
        li: ({ children }) => <li>{linkTerms(children, onTerm)}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
  const dasha = running?.maha
    ? [`${grahaSanskrit(running.maha.lord)} Mahadasha${running.showDates ? ` to ${monthYear(running.maha.end)}` : ''}`,
       running.antar ? `${grahaSanskrit(running.antar.lord)} Antardasha${running.showDates ? ` to ${monthYear(running.antar.end)}` : ''}` : null].filter(Boolean).join(', ')
    : null;

  return (
    <article className="overflow-hidden rounded-answer border border-line bg-surface" data-testid="answer-card">
      {d && (
        <header className="flex flex-wrap items-baseline justify-between gap-2.5 border-b border-hairline px-4 py-3.5 md:px-[22px] md:py-[18px]">
          <h2 className="m-0 font-display text-card-title font-semibold md:text-section">
            {d.label} · <span className={VERDICT_TEXT[d.verdict] ?? 'text-amber-text'}>{d.verdict}</span>
            {DOMAIN_BHAVA[d.domain] && <span lang="hi" className="hidden text-lg font-normal text-ink-muted md:inline"> {DOMAIN_BHAVA[d.domain]}</span>}
          </h2>
          <span className="text-sm text-ink-muted">{d.confidence} confidence · {d.supporting} pramāṇa for, {d.conflicting} against</span>
        </header>
      )}
      <div className="flex flex-col gap-3.5 px-4 py-3.5 text-nav md:px-[22px] md:py-[18px] md:text-lead">
        <div className="flex flex-col gap-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">{md}</div>
        {d?.items && d.items.length > 0 && (
          <ol className="m-0 grid list-none gap-2.5 p-0 text-sm md:grid-cols-2" aria-label="Evidence">
            {d.items.map((e, i) => (
              <li key={i} className="rounded-md border border-hairline px-3 py-2.5">
                <span className={`font-semibold ${e.direction === 'negative' ? 'text-negative' : e.direction === 'positive' ? 'text-positive' : 'text-ink-muted'}`}>
                  {e.direction === 'negative' ? 'Against' : e.direction === 'positive' ? 'For' : 'Neutral'}
                </span>
                {' · '}{e.explanation}
                <br /><span className="text-ink-muted">{SOURCE_LABEL[e.source] ?? e.source}</span>
              </li>
            ))}
          </ol>
        )}
        {d && dasha && <p className="m-0 text-base"><b>Dasha:</b> {dasha}.</p>}
        {others.length > 0 && (
          <p className="m-0 text-sm text-ink-muted">Also read: {others.map((o) => `${o.label} · ${o.verdict} (${o.confidence} confidence)`).join('; ')}</p>
        )}
        {evidence?.disclosure && <p className="m-0 text-sm text-amber-text" data-testid="answer-time-disclosure">{evidence.disclosure}</p>}
        {answerSource && (
          <p className="m-0 text-xs font-medium text-ink-muted" data-testid="answer-source">
            {answerSource === 'deterministic' ? "From your chart's evidence" : 'AI explanation · checked against your chart'}
          </p>
        )}
      </div>
      {d && (
        <footer className="flex flex-wrap gap-x-[18px] gap-y-2 border-t border-hairline px-4 py-3 text-sm md:px-[22px]" data-testid="answer-evidence">
          {chartId && <Link href={`/kundli/${chartId}`} className="underline hover:text-amber-text">Show on chart</Link>}
          <button type="button" onClick={() => onFollowUp(`When does ${d.label.toLowerCase()} peak for me?`)} className="underline hover:text-amber-text">When does it peak?</button>
          {terms[0] && <button type="button" onClick={() => onTerm(terms[0])} className="underline hover:text-amber-text">Explain {terms[0].term.split(' · ')[0]}</button>}
        </footer>
      )}
    </article>
  );
}

export { termsIn };
