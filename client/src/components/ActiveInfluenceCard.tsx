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
}: ActiveInfluenceCardProps) {
  const typeConfig = {
    dasha: {
      icon: '🕐',
      bgColor: 'bg-nava-lavender',
      borderColor: 'border-nava-royal-purple/20',
    },
    transit: {
      icon: '🌟',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    dosha: {
      icon: '⚠️',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    remedy: {
      icon: '🕉️',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
  };

  const config = typeConfig[type];

  return (
    <div
      className={`${config.bgColor} border ${config.borderColor} rounded-xl p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-semibold text-foreground text-sm truncate">
              {title}
            </h3>
            {severity === 'high' && (
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">{description}</p>
          {endDate && (
            <p className="text-xs text-muted-foreground mb-3">
              Until {endDate}
            </p>
          )}
          {linkTo && (
            <Link
              href={linkTo}
              className="inline-flex items-center gap-1 text-nava-royal-purple text-sm font-medium hover:underline"
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
