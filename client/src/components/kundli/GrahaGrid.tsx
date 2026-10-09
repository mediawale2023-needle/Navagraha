import type { CanonicalChart } from '@shared/v3/canonical';
import { GRAHA_HI, GRAHA_ORDER, ordinal } from '@/lib/jyotishNames';

const STRONG = new Set(['Exalted', 'Own sign', 'Moolatrikona']);

export interface GrahaCard {
  planet: string;
  sign: string;
  /** House from the Lagna; null when the birth time leaves the Lagna unknown. */
  house: number | null;
  nakshatra: string | null;
  retrograde: boolean;
  dignity: string | null;
  role: 'Mahadasha lord' | 'Antardasha lord' | null;
}

/** One card per graha, from the canonical chart and the running periods the chart can vouch for. */
export function grahaCards(chart: CanonicalChart, opts: { lagnaKnown: boolean; moonSignKnown: boolean; nakshatraKnown: boolean; maha?: string; antar?: string }): GrahaCard[] {
  return GRAHA_ORDER.map((name) => {
    const p = chart.planets.find((x) => x.name === name)!;
    const d = chart.strength.dignities.find((x) => x.planet === name);
    const moonUncertain = name === 'Moon' && !opts.nakshatraKnown;
    // An approximate birth time can leave even the Moon's sign open; then nothing that depends on it is stated.
    const signUnknown = name === 'Moon' && !opts.moonSignKnown;
    return {
      planet: name,
      sign: signUnknown ? 'Sign uncertain' : p.sign,
      house: opts.lagnaKnown ? p.house : null,
      nakshatra: moonUncertain ? null : p.nakshatra.name,
      retrograde: p.retrograde && name !== 'Rahu' && name !== 'Ketu',
      dignity: d && !signUnknown ? `${d.dignity}${d.neechaBhanga ? ' (cancelled)' : ''}` : null,
      role: name === opts.maha ? 'Mahadasha lord' : name === opts.antar ? 'Antardasha lord' : null,
    };
  });
}

// As in the mockup: the Moon and the Mahadasha lord name their nakshatra; the nodes (no dignity) show it instead.
const showsNakshatra = (c: GrahaCard) => c.planet === 'Moon' || c.role === 'Mahadasha lord';

function placeLine(c: GrahaCard) {
  return [c.sign, c.house ? ordinal(c.house) : null, showsNakshatra(c) && c.dignity && c.nakshatra ? c.nakshatra : null].filter(Boolean).join(' · ');
}
function noteLine(c: GrahaCard, short = false) {
  const role = c.role ? (short ? 'dasha' : c.role) : null;
  return [c.dignity ?? c.nakshatra, role].filter(Boolean).join(' · ');
}

/** Desktop: the mockup's three-column grid of nine cards. */
export function GrahaGrid({ cards, onSelect }: { cards: GrahaCard[]; onSelect: (planet: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3" data-testid="graha-grid">
      {cards.map((c) => {
        const maha = c.role === 'Mahadasha lord';
        const strong = !!c.dignity && STRONG.has(c.dignity.replace(' (cancelled)', ''));
        return (
          <button
            key={c.planet}
            type="button"
            onClick={() => onSelect(c.planet)}
            className={`flex flex-col gap-0.5 rounded-md px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${maha ? 'bg-ink text-on-navy' : strong ? 'border-[1.5px] border-frame bg-surface' : 'border border-line bg-surface hover:bg-highlight'}`}
            data-testid={`graha-${c.planet}`}
          >
            <span className={`font-display text-card-title font-semibold leading-snug ${maha ? 'text-amber' : ''}`}>
              <span lang="hi">{GRAHA_HI[c.planet]}</span>{' '}
              <span className={`font-sans text-sm font-normal ${maha ? 'text-on-navy-2' : 'text-ink-muted'}`}>{c.planet}{c.retrograde ? ' ℞' : ''}</span>
            </span>
            <span className="text-sm">{placeLine(c)}</span>
            <span className={`text-caption ${maha || strong ? 'font-semibold' : 'text-ink-muted'}`}>{noteLine(c)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Mobile: a swipeable row, the Mahadasha lord first, then the strongest placements. */
export function GrahaStrip({ cards, onSelect }: { cards: GrahaCard[]; onSelect: (planet: string) => void }) {
  // The mockup's order: the Mahadasha lord, then the strongest placements, then the rest.
  const rank = (c: GrahaCard) => (c.role === 'Mahadasha lord' ? 0 : c.dignity && STRONG.has(c.dignity) ? 1 : c.role ? 2 : 3);
  const ordered = [...cards].sort((a, b) => rank(a) - rank(b));
  return (
    <>
      <div role="list" aria-label="Grahas" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" data-testid="graha-strip">
        {ordered.map((c) => {
          const maha = c.role === 'Mahadasha lord';
          const strong = !!c.dignity && STRONG.has(c.dignity);
          return (
            <button
              role="listitem"
              key={c.planet}
              type="button"
              onClick={() => onSelect(c.planet)}
              className={`flex min-w-[104px] flex-none flex-col rounded-md px-3 py-2.5 text-left ${maha ? 'bg-ink text-on-navy' : strong ? 'border-[1.5px] border-frame bg-surface' : 'border border-line bg-surface'}`}
            >
              <span lang="hi" className={`font-display text-lg font-semibold ${maha ? 'text-amber' : ''}`}>{GRAHA_HI[c.planet]}</span>
              <span className="text-caption">{c.planet}{c.house ? ` · ${ordinal(c.house)}` : ` · ${c.sign}`}</span>
              <span className={`text-xs ${maha ? 'text-on-navy-3' : 'text-ink-muted'}`}>{noteLine(c, true)}</span>
            </button>
          );
        })}
      </div>
      <p className="text-caption text-ink-muted">Swipe for all nine grahas · tap one to read it</p>
    </>
  );
}
