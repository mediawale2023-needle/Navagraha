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
      bg: 'bg-[var(--nava-teal)]',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
      text: 'text-white',
      label: 'Live',
    },
    green: {
      bg: 'bg-[var(--nava-magenta)]',
      iconBg: 'bg-white/15',
      iconColor: 'text-white',
      text: 'text-white',
      label: 'Instant',
    },
    orange: {
      bg: 'bg-primary',
      iconBg: 'bg-black/10',
      iconColor: 'text-[var(--nava-navy)]',
      text: 'text-[var(--nava-navy)]',
      label: 'Free',
    },
    navy: {
      bg: 'bg-[var(--nava-navy)]',
      iconBg: 'bg-white/10',
      iconColor: 'text-primary',
      text: 'text-primary',
      label: 'Schedule',
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
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] opacity-70">{variant.label}</p>
      <h3 className="font-display mt-1 text-base leading-tight">{title}</h3>
    </button>
  );
}
