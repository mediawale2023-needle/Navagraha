import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface Planet {
  name: string;
  symbol: string;
  house: number;
  isBenefic?: boolean;
}

interface House {
  number: number;
  sign?: string;
  planets: Planet[];
}

interface NorthIndianChartProps {
  houses?: House[];
  onHouseClick?: (house: House) => void;
  onPlanetClick?: (planet: Planet, house: House) => void;
  size?: 'small' | 'medium' | 'large';
  showLabels?: boolean;
}

/**
 * North Indian Kundli Chart Component
 *
 * Diamond-style chart with houses 1-12.
 * Clickable houses and planets for detailed insights.
 *
 * Design:
 * - Clean lines, readable labels
 * - Planet symbols in each house
 * - Subtle hover states
 * - Responsive sizing
 */
export function NorthIndianChart({
  houses = getDefaultHouses(),
  onHouseClick,
  onPlanetClick,
  size = 'large',
  showLabels = true,
}: NorthIndianChartProps) {
  const [hoveredHouse, setHoveredHouse] = useState<number | null>(null);

  const sizeClasses = {
    small: 'w-48 h-48',
    medium: 'w-64 h-64',
    large: 'w-full max-w-lg aspect-square',
  };

  const handleHouseClick = (houseNumber: number) => {
    const house = houses.find((h) => h.number === houseNumber);
    if (house) {
      onHouseClick?.(house);
    }
  };

  return (
    <div className={`${sizeClasses[size]} mx-auto`}>
      <svg
        viewBox="0 0 400 400"
        className="w-full h-full chart-container"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Border */}
        <rect
          x="10"
          y="10"
          width="380"
          height="380"
          fill="white"
          stroke="#1A1A2E"
          strokeWidth="3"
          rx="8"
        />

        {/* Diamond Lines (North Indian Chart) */}
        {/* Vertical center line */}
        <line
          x1="200"
          y1="10"
          x2="200"
          y2="390"
          stroke="#1A1A2E"
          strokeWidth="1.5"
        />
        {/* Horizontal center line */}
        <line
          x1="10"
          y1="200"
          x2="390"
          y2="200"
          stroke="#1A1A2E"
          strokeWidth="1.5"
        />
        {/* Diamond diagonals */}
        <line
          x1="200"
          y1="10"
          x2="10"
          y2="200"
          stroke="#1A1A2E"
          strokeWidth="1.5"
        />
        <line
          x1="200"
          y1="10"
          x2="390"
          y2="200"
          stroke="#1A1A2E"
          strokeWidth="1.5"
        />
        <line
          x1="200"
          y1="390"
          x2="10"
          y2="200"
          stroke="#1A1A2E"
          strokeWidth="1.5"
        />
        <line
          x1="200"
          y1="390"
          x2="390"
          y2="200"
          stroke="#1A1A2E"
          strokeWidth="1.5"
        />

        {/* House Regions (clickable) */}
        {getHousePaths().map((housePath) => {
          const isHovered = hoveredHouse === housePath.number;
          return (
            <g key={housePath.number}>
              <path
                d={housePath.d}
                fill={isHovered ? '#F4E6FF' : 'white'}
                stroke="none"
                className="cursor-pointer transition-colors duration-200"
                onClick={() => handleHouseClick(housePath.number)}
                onMouseEnter={() => setHoveredHouse(housePath.number)}
                onMouseLeave={() => setHoveredHouse(null)}
              />
              {/* House Border */}
              <path
                d={housePath.d}
                fill="none"
                stroke={isHovered ? '#5B47A8' : 'transparent'}
                strokeWidth="1"
                className="transition-colors duration-200"
              />
            </g>
          );
        })}

        {/* House Numbers */}
        {getHouseLabelPositions().map((pos) => (
          <text
            key={`house-${pos.house}`}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs font-medium fill-muted-foreground"
            style={{ fontSize: '11px' }}
          >
            {pos.house}
          </text>
        ))}

        {/* Planets in Houses */}
        {houses.map((house) => {
          const pos = getPlanetPosition(house.number);
          return house.planets.map((planet, planetIndex) => {
            const offsetX = (planetIndex - house.planets.length / 2 + 0.5) * 25;
            const offsetY = planetIndex > 0 ? 15 : 0;
            return (
              <g
                key={`${house.number}-${planet.name}`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlanetClick?.(planet, house);
                }}
              >
                <circle
                  cx={pos.x + offsetX}
                  cy={pos.y + offsetY}
                  r="14"
                  fill="#5B47A8"
                  className="transition-transform duration-200 hover:scale-110"
                />
                <text
                  x={pos.x + offsetX}
                  y={pos.y + offsetY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-white text-xs font-bold"
                  style={{ fontSize: '12px' }}
                >
                  {planet.symbol}
                </text>
              </g>
            );
          });
        })}

        {/* Chart Title (optional) */}
        {showLabels && (
          <text
            x="200"
            y="385"
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: '10px' }}
          >
            North Indian Kundli
          </text>
        )}
      </svg>
    </div>
  );
}

// Helper Functions
function getDefaultHouses(): House[] {
  // Sample data - in real app, this comes from API
  const planetData: Planet[] = [
    { name: 'Sun', symbol: '☉', house: 1, isBenefic: false },
    { name: 'Moon', symbol: '☽', house: 4, isBenefic: true },
    { name: 'Mars', symbol: '♂', house: 10, isBenefic: false },
    { name: 'Mercury', symbol: '☿', house: 1, isBenefic: true },
    { name: 'Jupiter', symbol: '♃', house: 7, isBenefic: true },
    { name: 'Venus', symbol: '♀', house: 2, isBenefic: true },
    { name: 'Saturn', symbol: '♄', house: 10, isBenefic: false },
  ];

  return Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    planets: planetData.filter((p) => p.house === i + 1),
  }));
}

function getHousePaths(): Array<{ number: number; d: string }> {
  // North Indian chart diamond house paths
  return [
    { number: 1, d: 'M 200 10 L 10 200 L 200 200 L 200 10' }, // House 1 (top-left triangle)
    { number: 2, d: 'M 200 10 L 200 200 L 390 200 L 200 10' }, // House 2 (top-right triangle)
    { number: 3, d: 'M 390 200 L 200 200 L 390 390 L 390 200' }, // House 3 (right-top)
    { number: 4, d: 'M 390 200 L 390 390 L 200 200 L 390 200' }, // House 4 (right-bottom)
    { number: 5, d: 'M 200 390 L 200 200 L 390 200 L 200 390' }, // House 5 (bottom-right)
    { number: 6, d: 'M 200 390 L 10 200 L 200 200 L 200 390' }, // House 6 (bottom-left)
    { number: 7, d: 'M 10 200 L 200 200 L 10 390 L 10 200' }, // House 7 (left-bottom)
    { number: 8, d: 'M 10 200 L 200 10 L 200 200 L 10 200' }, // House 8 (left-top)
    { number: 9, d: 'M 200 10 L 10 200 L 10 10 L 200 10' }, // House 9 (top-left corner)
    { number: 10, d: 'M 200 10 L 390 200 L 390 10 L 200 10' }, // House 10 (top-right corner)
    { number: 11, d: 'M 390 200 L 200 390 L 390 390 L 390 200' }, // House 11 (bottom-right corner)
    { number: 12, d: 'M 10 200 L 200 390 L 10 390 L 10 200' }, // House 12 (bottom-left corner)
  ];
}

function getHouseLabelPositions(): Array<{ house: number; x: number; y: number }> {
  return [
    { house: 1, x: 100, y: 100 },
    { house: 2, x: 300, y: 100 },
    { house: 3, x: 340, y: 150 },
    { house: 4, x: 340, y: 250 },
    { house: 5, x: 300, y: 300 },
    { house: 6, x: 100, y: 300 },
    { house: 7, x: 60, y: 250 },
    { house: 8, x: 60, y: 150 },
    { house: 9, x: 100, y: 50 },
    { house: 10, x: 300, y: 50 },
    { house: 11, x: 350, y: 350 },
    { house: 12, x: 50, y: 350 },
  ];
}

function getPlanetPosition(houseNumber: number): { x: number; y: number } {
  // Approximate center positions for each house
  const positions: Record<number, { x: number; y: number }> = {
    1: { x: 120, y: 120 },
    2: { x: 280, y: 120 },
    3: { x: 330, y: 160 },
    4: { x: 330, y: 240 },
    5: { x: 280, y: 280 },
    6: { x: 120, y: 280 },
    7: { x: 70, y: 240 },
    8: { x: 70, y: 160 },
    9: { x: 150, y: 60 },
    10: { x: 250, y: 60 },
    11: { x: 340, y: 340 },
    12: { x: 60, y: 340 },
  };
  return positions[houseNumber] || { x: 200, y: 200 };
}
