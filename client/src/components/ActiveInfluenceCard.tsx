import React from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';

interface ActiveInfluenceCardProps {
  title: string;
  description: string;
  type?: 'dasha' | 'transit' | 'dosha' | 'remedy';
  severity?: 'high' | 'medium' | 'low';
  endDate?: string;
  linkTo?: string;
  className?: string;
  /** Glyph override, e.g. the period lord's planetary symbol. */
  icon?: string;
}

/**
 * Active Influence Card Component
 *
 * Shows current planetary periods, transits, or doshas affecting the user.
 * Color-coded by severity/type.
 */
export function ActiveInfluenceCard({
  title,
  description,
  type = 'dasha',
  severity = 'medium',
  endDate,
  linkTo,
  className = '',
  icon,
}: ActiveInfluenceCardProps) {
  const typeConfig = {
    dasha: {
      icon: '♂',
      bgColor: 'bg-surface',
      borderColor: 'border-line',
      iconColor: 'text-ink',
    },
    transit: {
      icon: '♄',
      bgColor: 'bg-surface',
      borderColor: 'border-line',
      iconColor: 'text-ink',
    },
    dosha: {
      icon: '⚠',
      bgColor: 'bg-surface',
      borderColor: 'border-line',
      iconColor: 'text-negative',
    },
    remedy: {
      icon: '🕉',
      bgColor: 'bg-highlight',
      borderColor: 'border-line',
      iconColor: 'text-amber-text',
    },
  };

  const config = typeConfig[type];

  return (
    <div
      className={`${config.bgColor} ${config.borderColor} rounded-[12px] border p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className={`${config.iconColor} font-display flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[6px] bg-card text-lg`}>{icon ?? config.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-display text-sm truncate text-foreground">
              {title}
            </h3>
            {severity === 'high' && (
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">{description}</p>
          {endDate && (
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Until {endDate}
            </p>
          )}
          {linkTo && (
            <Link
              href={linkTo}
              className="inline-flex items-center gap-1 border-b border-foreground pb-0.5 text-sm font-semibold text-foreground"
            >
              Learn More
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
