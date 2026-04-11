import React from 'react';
import { Sun, Moon, Star, Clock, CheckCircle, XCircle } from 'lucide-react';

interface DailyGuidanceCardProps {
  moonSign?: string;
  moonHouse?: number;
  sunSign?: string;
  sunHouse?: number;
  marsSign?: string;
  marsHouse?: number;
  goodFor?: string[];
  avoid?: string[];
  bestTime?: string;
  oneAction?: string;
}

/**
 * Daily Guidance Card Component
 *
 * Shows today's cosmic weather with actionable guidance.
 * NOT generic horoscope - specific to user's chart.
 *
 * Design:
 * - Clean layout with planetary positions
 * - Clear do's and don'ts
 * - One actionable recommendation
 * - Optimal timing highlighted
 */
export function DailyGuidanceCard({
  moonSign = 'Libra',
  moonHouse = 7,
  sunSign = 'Pisces',
  sunHouse = 12,
  marsSign = 'Capricorn',
  marsHouse = 10,
  goodFor = ['Partnership', 'Negotiation', 'Beauty'],
  avoid = ['Confrontation', 'Hasty decisions'],
  bestTime = '10 AM - 2 PM',
  oneAction = 'Have that difficult conversation today — diplomatic energy supports resolution.',
}: DailyGuidanceCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Title */}
      <div className="mb-4">
        <h3 className="font-semibold text-foreground text-lg mb-1">
          Today's Cosmic Weather
        </h3>
        <p className="text-sm text-muted-foreground">
          Planetary transits affecting your chart
        </p>
      </div>

      {/* Planetary Positions */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-muted rounded-lg p-3 text-center">
          <Moon className="w-4 h-4 mx-auto mb-1 text-nava-royal-purple" />
          <p className="text-xs text-muted-foreground">Moon</p>
          <p className="font-semibold text-foreground text-sm">
            {moonSign}
          </p>
          <p className="text-xs text-muted-foreground">
            {getHouseName(moonHouse)} House
          </p>
        </div>
        <div className="bg-muted rounded-lg p-3 text-center">
          <Sun className="w-4 h-4 mx-auto mb-1 text-nava-burnt-orange" />
          <p className="text-xs text-muted-foreground">Sun</p>
          <p className="font-semibold text-foreground text-sm">
            {sunSign}
          </p>
          <p className="text-xs text-muted-foreground">
            {getHouseName(sunHouse)} House
          </p>
        </div>
        <div className="bg-muted rounded-lg p-3 text-center">
          <Star className="w-4 h-4 mx-auto mb-1 text-nava-burgundy" />
          <p className="text-xs text-muted-foreground">Mars</p>
          <p className="font-semibold text-foreground text-sm">
            {marsSign}
          </p>
          <p className="text-xs text-muted-foreground">
            {getHouseName(marsHouse)} House
          </p>
        </div>
      </div>

      {/* Focus Areas */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            Good For:
          </p>
          <ul className="space-y-1">
            {goodFor.map((item, index) => (
              <li
                key={index}
                className="text-sm text-foreground bg-green-50 px-2 py-1 rounded"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-nava-burgundy mb-2 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            Avoid:
          </p>
          <ul className="space-y-1">
            {avoid.map((item, index) => (
              <li
                key={index}
                className="text-sm text-foreground bg-red-50 px-2 py-1 rounded"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Best Time */}
      {bestTime && (
        <div className="bg-nava-lavender rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-nava-royal-purple" />
            <span className="text-sm font-medium text-nava-royal-purple">
              Best Time Today
            </span>
          </div>
          <p className="text-sm text-nava-royal-purple">{bestTime}</p>
          <p className="text-xs text-nava-royal-purple/80 mt-1">
            (Moon-Venus aspect supports important conversations)
          </p>
        </div>
      )}

      {/* One Action */}
      {oneAction && (
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground mb-1">
            One Action:
          </p>
          <p className="text-foreground italic">&ldquo;{oneAction}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

function getHouseName(house: number): string {
  const houses = [
    '',
    '1st',
    '2nd',
    '3rd',
    '4th',
    '5th',
    '6th',
    '7th',
    '8th',
    '9th',
    '10th',
    '11th',
    '12th',
  ];
  return houses[house] || `${house}th`;
}
