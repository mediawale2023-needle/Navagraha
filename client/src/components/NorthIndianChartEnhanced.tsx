// North Indian birth chart (enhanced) — the canonical chart used on the Kundli
// view and in paid reports. Geometry and house-label positions are exported so
// the PDF builder can reproduce the exact same layout.

export const PLANET_ABBR: Record<string, string> = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me',
  Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
};

const ZODIAC = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

export const SIGN_NUM: Record<string, number> = {};
ZODIAC.forEach((s, i) => { SIGN_NUM[s] = i + 1; });

export const PLANET_COLORS: Record<string, string> = {
  Su: '#5B47A8', Mo: '#1A1A2E', Ma: '#8B1A1A', Me: '#0C7F4D',
  Ju: '#B05C00', Ve: '#5B47A8', Sa: '#1A1A2E', Ra: '#5C5C6B', Ke: '#5C5C6B',
  Asc: '#8B1A1A',
};

// rx/ry: rashi-number position, px/py: planet-label anchor — in a 0..400 box.
export const HOUSE_TEXT: Record<number, { rx: number; ry: number; px: number; py: number }> = {
  1: { rx: 200, ry: 175, px: 200, py: 80 },
  2: { rx: 110, ry: 85, px: 100, py: 45 },
  3: { rx: 75, ry: 120, px: 45, py: 100 },
  4: { rx: 160, ry: 205, px: 85, py: 200 },
  5: { rx: 75, ry: 290, px: 45, py: 310 },
  6: { rx: 110, ry: 335, px: 100, py: 365 },
  7: { rx: 200, ry: 235, px: 200, py: 330 },
  8: { rx: 290, ry: 335, px: 300, py: 365 },
  9: { rx: 325, ry: 290, px: 355, py: 310 },
  10: { rx: 240, ry: 205, px: 315, py: 200 },
  11: { rx: 325, ry: 120, px: 355, py: 100 },
  12: { rx: 290, ry: 85, px: 300, py: 45 },
};

interface PlanetPos {
  planet: string;
  sign: string;
  degree: number;
  house: number;
  isRetrograde: boolean;
}

export function NorthIndianChartEnhanced({ chartData, onPlanetClick }: { chartData?: any; onPlanetClick?: (planet: any, house: number) => void }) {
  const housePlanets: Record<number, PlanetPos[]> = {};
  const houseSign: Record<number, string> = {};

  if (chartData?.planetaryPositions) {
    for (const pos of chartData.planetaryPositions as PlanetPos[]) {
      const h = pos.house;
      if (h >= 1 && h <= 12) {
        if (pos.planet === 'Ascendant') {
          houseSign[1] = pos.sign;
          housePlanets[1] = [...(housePlanets[1] || []), pos];
        } else {
          housePlanets[h] = [...(housePlanets[h] || []), pos];
        }
      }
    }
  }

  if (chartData?.houses) {
    for (const h of chartData.houses as Array<{ house: number; sign: string }>) {
      houseSign[h.house] = h.sign;
    }
  }

  const S = 400;
  const M = S / 2;

  return (
    <div className="w-full max-w-md mx-auto">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full h-auto chart-container" style={{ maxWidth: 420 }}>
        <rect x="0" y="0" width={S} height={S} fill="white" rx="8" />
        <rect x="4" y="4" width={S - 8} height={S - 8} fill="none" stroke="#1A1A2E" strokeWidth="2.5" rx="8" />
        <line x1={M} y1="4" x2="4" y2={M} stroke="#1A1A2E" strokeWidth="1.5" />
        <line x1="4" y1={M} x2={M} y2={S - 4} stroke="#1A1A2E" strokeWidth="1.5" />
        <line x1={M} y1={S - 4} x2={S - 4} y2={M} stroke="#1A1A2E" strokeWidth="1.5" />
        <line x1={S - 4} y1={M} x2={M} y2="4" stroke="#1A1A2E" strokeWidth="1.5" />
        <line x1="4" y1="4" x2={S - 4} y2={S - 4} stroke="#1A1A2E" strokeWidth="1.5" />
        <line x1={S - 4} y1="4" x2="4" y2={S - 4} stroke="#1A1A2E" strokeWidth="1.5" />

        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => {
          const sign = houseSign[h];
          const num = sign ? SIGN_NUM[sign] : h;
          const pos = HOUSE_TEXT[h];
          if (!pos) return null;
          return (
            <text key={`rashi-${h}`} x={pos.rx} y={pos.ry} textAnchor="middle" fontSize="13" fontWeight="700" fill="#8B1A1A">
              {num}
            </text>
          );
        })}

        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => {
          const planets = housePlanets[h] || [];
          const pos = HOUSE_TEXT[h];
          if (!pos || planets.length === 0) return null;
          const totalHeight = planets.length * 14;
          const startY = pos.py - (totalHeight / 2) + 7;
          return planets.map((p, i) => {
            const abbr = PLANET_ABBR[p.planet] ?? (p.planet === 'Ascendant' ? 'Asc' : p.planet.slice(0, 2));
            const color = PLANET_COLORS[abbr] || '#1A1A2E';
            const retro = p.isRetrograde ? '®' : '';
            const label = `${abbr}-${p.degree}°${retro}`;
            return (
              <text
                key={`${h}-${p.planet}`}
                x={pos.px}
                y={startY + i * 14}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill={color}
                className="cursor-pointer"
                onClick={() => onPlanetClick?.(p, h)}
                style={{ transition: 'opacity 0.2s' }}
              >
                {label}
              </text>
            );
          });
        })}
        <circle cx="8" cy="8" r="4" fill="none" stroke="#1A1A2E" strokeWidth="1" />
        <circle cx={S - 8} cy="8" r="4" fill="none" stroke="#1A1A2E" strokeWidth="1" />
        <circle cx="8" cy={S - 8} r="4" fill="none" stroke="#1A1A2E" strokeWidth="1" />
        <circle cx={S - 8} cy={S - 8} r="4" fill="none" stroke="#1A1A2E" strokeWidth="1" />
      </svg>
    </div>
  );
}
