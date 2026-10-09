import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface QuickActionCardProps {
  title: string;
  icon: LucideIcon;
  color?: 'purple' | 'green' | 'orange' | 'navy';
  onClick?: () => void;
  className?: string;
  /** Small label above the title; only when it is true of this action (never derived from the colour). */
  eyebrow?: string;
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
  eyebrow,
}: QuickActionCardProps) {
  const colorVariants = {
    purple: {
      bg: 'bg-ink',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
      text: 'text-white',
    },
    green: {
      bg: 'bg-ink',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
      text: 'text-white',
    },
    orange: {
      bg: 'bg-primary',
      iconBg: 'bg-black/10',
      iconColor: 'text-ink',
      text: 'text-ink',
    },
    navy: {
      bg: 'bg-ink',
      iconBg: 'bg-white/10',
      iconColor: 'text-primary',
      text: 'text-primary',
    },
  };

  const variant = colorVariants[color];

  return (
    <button
      onClick={onClick}
      className={`${variant.bg} ${variant.text} rounded-[10px] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${className}`}
    >
      <div
        className={`${variant.iconBg} mb-4 flex h-10 w-10 items-center justify-center rounded-[8px]`}
      >
        <Icon className={`w-5 h-5 ${variant.iconColor}`} />
      </div>
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">{eyebrow}</p>}
      <h3 className="font-display mt-1 text-base leading-tight">{title}</h3>
    </button>
  );
}
