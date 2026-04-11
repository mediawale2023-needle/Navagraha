import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface QuickActionCardProps {
  title: string;
  icon: LucideIcon;
  color?: 'purple' | 'green' | 'orange' | 'navy';
  onClick?: () => void;
  className?: string;
}

/**
 * Quick Action Card Component
 *
 * 2x2 grid cards for primary actions.
 * Clean design with subtle color coding.
 */
export function QuickActionCard({
  title,
  icon: Icon,
  color = 'purple',
  onClick,
  className = '',
}: QuickActionCardProps) {
  const colorVariants = {
    purple: {
      bg: 'bg-nava-lavender',
      iconBg: 'bg-nava-royal-purple',
      iconColor: 'text-white',
    },
    green: {
      bg: 'bg-green-50',
      iconBg: 'bg-nava-deep-green',
      iconColor: 'text-white',
    },
    orange: {
      bg: 'bg-orange-50',
      iconBg: 'bg-nava-burnt-orange',
      iconColor: 'text-white',
    },
    navy: {
      bg: 'bg-slate-50',
      iconBg: 'bg-nava-navy',
      iconColor: 'text-white',
    },
  };

  const variant = colorVariants[color];

  return (
    <button
      onClick={onClick}
      className={`${variant.bg} rounded-xl p-4 text-left transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] ${className}`}
    >
      <div
        className={`${variant.iconBg} w-10 h-10 rounded-lg flex items-center justify-center mb-3`}
      >
        <Icon className={`w-5 h-5 ${variant.iconColor}`} />
      </div>
      <h3 className="font-semibold text-foreground text-sm">{title}</h3>
    </button>
  );
}
