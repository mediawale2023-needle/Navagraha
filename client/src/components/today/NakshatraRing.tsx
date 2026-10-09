// The 27 nakshatras as a ring (Direction 3): today's Moon nakshatra filled amber, the birth
// Moon's outlined.
import { R_IN, R_OUT, TICKS, segmentPath } from '@/lib/nakshatraRing';

interface Props {
  /** 0-based index of today's Moon nakshatra. */
  today: number;
  /** 0-based index of the birth Moon nakshatra, when the chart can vouch for it. */
  birth?: number | null;
  size: 'lg' | 'sm';
  label: string;
}

export function NakshatraRing({ today, birth, size, label }: Props) {
  const lg = size === 'lg';
  const ring = lg ? 1 : 2;
  return (
    <svg viewBox="0 0 240 240" width={lg ? 260 : 96} height={lg ? 260 : 96} role="img" aria-label={label} className="shrink-0" data-testid={`nakshatra-ring-${size}`}>
      <circle cx="120" cy="120" r={R_OUT} fill="none" className="stroke-navy-control" strokeWidth={ring} />
      <circle cx="120" cy="120" r={R_IN} fill="none" className="stroke-navy-control" strokeWidth={ring} />
      {lg && <path d={TICKS} fill="none" className="stroke-navy-control" strokeWidth="1" />}
      {today >= 0 && <path d={segmentPath(today)} className="fill-amber" data-testid="ring-today" />}
      {birth != null && birth >= 0 && <path d={segmentPath(birth)} fill="none" className="stroke-amber" strokeWidth={lg ? 2 : 4} data-testid="ring-birth" />}
      {lg && (
        <>
          <circle cx="120" cy="120" r="44" fill="none" className="stroke-navy-line" strokeWidth="1" />
          <path d="M120 76 L164 120 L120 164 L76 120 Z" fill="none" className="stroke-navy-line" strokeWidth="1" />
          <text x="120" y="116" textAnchor="middle" className="fill-on-navy-2 font-display" fontSize="13">27</text>
          {/* 11.1 units render at 12px in the 260px ring, the interface minimum. */}
          <text x="120" y="133" textAnchor="middle" className="fill-on-navy-3" fontSize="11.1">nakshatras</text>
        </>
      )}
    </svg>
  );
}
