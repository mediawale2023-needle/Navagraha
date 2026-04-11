import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

interface CalculationInfoProps {
  ayanamsa?: string;
  ephemeris?: string;
  houseSystem?: string;
  timezone?: string;
}

/**
 * Calculation Info Component
 *
 * Displays the technical details of how the chart was calculated.
 * This transparency builds trust with users who want to verify accuracy.
 *
 * Shows:
 * - Ayanamsa used (Lahiri, Raman, etc.)
 * - Ephemeris source (Swiss Ephemeris, etc.)
 * - House system (Whole Sign, Placidus, etc.)
 * - Timezone handling
 */
export function CalculationInfo({
  ayanamsa = 'Lahiri (Chitrapaksha)',
  ephemeris = 'Swiss Ephemeris 2.10',
  houseSystem = 'Whole Sign',
  timezone = 'Auto-detected from birth place',
}: CalculationInfoProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Calculation Method
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Ayanamsa:</dt>
              <dd className="text-foreground font-medium">{ayanamsa}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Ephemeris:</dt>
              <dd className="text-foreground font-medium">{ephemeris}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">House System:</dt>
              <dd className="text-foreground font-medium">{houseSystem}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Timezone:</dt>
              <dd className="text-foreground font-medium">{timezone}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Per Brihat Parashara Hora Shastra calculations. All positions are
            sidereal (Nirayana) system.
          </p>
        </div>
      )}
    </div>
  );
}
