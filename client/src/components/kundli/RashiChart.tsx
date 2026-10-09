import { SIGN_ORDER } from '@/lib/jyotishNames';
import {
  LAGNA_DIAMOND, LINE, NORTH_GROWTH, NORTH_LAGNA_LABEL, NORTH_LINES, NORTH_PLANETS, NORTH_SIGN_NUMBER, SOUTH_CELL, SOUTH_SIZE,
  bySign, houseOf, labelOffsets, planetAbbr, showsRetrograde, signOfHouse,
  type ChartLabels, type ChartStyle, type Placement,
} from '@/lib/rashiChart';

interface Props {
  placements: Placement[];
  /** Sign index (0 = Aries) of house 1: the Lagna, or the Moon for a Chandra Lagna chart. */
  firstHouseSign: number;
  firstHouse: 'lagna' | 'chandra';
  labels: ChartLabels;
  style: ChartStyle;
  size: number;
  title: string;
  onSelect?: (planet: string) => void;
}

const LAGNA_TEXT = { lagna: { hi: 'लग्न', en: 'Asc' }, chandra: { hi: 'चन्द्र लग्न', en: 'Moon' } } as const;

function PlanetText({ p, x, y, labels, onSelect, fontSize }: { p: Placement; x: number; y: number; labels: ChartLabels; onSelect?: (planet: string) => void; fontSize: number }) {
  const retro = showsRetrograde(p);
  const name = `${p.planet} in ${SIGN_ORDER[p.signIndex]}${retro ? ', retrograde' : ''}`;
  const activate = () => onSelect?.(p.planet);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className={`fill-ink font-display ${onSelect ? 'cursor-pointer focus:outline-none [&:focus-visible]:fill-amber-text [&:focus-visible]:underline [&:focus-visible]:decoration-2' : ''}`}
      fontSize={fontSize}
      fontWeight={600}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={name}
      onClick={onSelect ? activate : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } } : undefined}
    >
      {planetAbbr(p.planet, labels)}
      {/* Set apart in the body face so ℞ cannot collide with the Devanagari glyph (the mockup's one correction). */}
      {retro && <tspan dx="1" fontSize="10" fontFamily="DM Sans, sans-serif" fontWeight={500} dy="-4">℞</tspan>}
    </text>
  );
}

/** The Direction 3 Rashi chart: North Indian (default) or South Indian, Devanagari or English labels. */
export function RashiChart({ placements, firstHouseSign, firstHouse, labels, style, size, title, onSelect }: Props) {
  const groups = bySign(placements);
  // The mockups set planets at 15 units on the 380px desktop chart and 17 on the 320px mobile one.
  const fontSize = (size < 360 ? 17 : 15) - (labels === 'en' ? 1 : 0);
  const lagnaText = LAGNA_TEXT[firstHouse][labels];

  if (style === 'south') {
    const s = SOUTH_SIZE;
    const origin = 1.0;
    return (
      <svg viewBox="0 0 300 300" width={size} height={size} role="group" aria-label={title} className="block max-w-full" data-testid="rashi-chart-south">
        <rect x="1" y="1" width="298" height="298" className="fill-surface stroke-ink" strokeWidth="1.2" />
        {Object.entries(SOUTH_CELL).map(([sign, [c, r]]) => {
          const signIndex = Number(sign);
          const x = origin + c * s;
          const y = origin + r * s;
          const isFirst = signIndex === firstHouseSign;
          const here = groups.get(signIndex) ?? [];
          const offs = labelOffsets(here.length, labels);
          return (
            <g key={sign}>
              <rect x={x} y={y} width={s} height={s} className={`${isFirst ? 'fill-highlight' : 'fill-surface'} stroke-ink`} strokeWidth="1" />
              {isFirst && <path d={`M${x} ${y + 16} L${x + 16} ${y}`} className="stroke-amber-text" strokeWidth="1.2" />}
              <text x={x + s - 5} y={y + 13} textAnchor="end" fontSize="11" className="fill-ink-muted">{signIndex + 1}</text>
              {isFirst && <text x={x + s / 2} y={y + 24} textAnchor="middle" fontSize="12" fontWeight={600} className="fill-amber-text font-display">{lagnaText}</text>}
              {here.map((p, i) => (
                <PlanetText key={p.planet} p={p} labels={labels} onSelect={onSelect} fontSize={fontSize} x={x + s / 2 + offs[i][0]} y={y + (isFirst ? 46 : 42) + offs[i][1]} />
              ))}
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 300 300" width={size} height={size} role="group" aria-label={title} className="block max-w-full" data-testid="rashi-chart-north">
      <rect x="1" y="1" width="298" height="298" className="fill-surface stroke-ink" strokeWidth="1.2" />
      <path d={LAGNA_DIAMOND} className="fill-highlight" />
      <path d={NORTH_LINES} fill="none" className="stroke-ink" strokeWidth="1" />
      {Array.from({ length: 12 }, (_, i) => i + 1).map((house) => {
        const [x, y] = NORTH_SIGN_NUMBER[house];
        return <text key={`n${house}`} x={x} y={y} textAnchor="middle" fontSize="11" className="fill-ink-muted">{signOfHouse(house, firstHouseSign) + 1}</text>;
      })}
      <text x={NORTH_LAGNA_LABEL[0]} y={NORTH_LAGNA_LABEL[1]} textAnchor="middle" fontSize={fontSize} fontWeight={600} className="fill-amber-text font-display">{lagnaText}</text>
      {Array.from({ length: 12 }, (_, i) => i + 1).flatMap((house) => {
        const here = groups.get(signOfHouse(house, firstHouseSign)) ?? [];
        if (!here.length) return [];
        const offs = labelOffsets(here.length, labels);
        const rows = new Set(offs.map((o) => o[1])).size;
        const shift = NORTH_GROWTH[house] === 'down' ? ((rows - 1) * LINE) / 2 : NORTH_GROWTH[house] === 'up' ? -((rows - 1) * LINE) / 2 : 0;
        const [x, y] = NORTH_PLANETS[house];
        return here.map((p, i) => <PlanetText key={p.planet} p={p} labels={labels} onSelect={onSelect} fontSize={fontSize} x={x + offs[i][0]} y={y + shift + offs[i][1]} />);
      })}
    </svg>
  );
}

export { houseOf };
